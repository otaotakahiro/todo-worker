import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z, { includes } from 'zod';

export const taskRoute = new Hono<{ Bindings: Env }>();

// タスクをDBに登録するCRUDのC
taskRoute.post(
	'/',
	zValidator(
		'json',
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			// status: z.string().optional(),
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			tags: z.array(z.string().min(1)).optional(), // ? でtagが無い場合にするか？それとも記載なしでも空の配列が存在する。という状態にするか？
			expiresAt: z.coerce.date().optional(),
		})
	),
	async (context) => {
		const body = context.req.valid('json');
		// prisma に接続できるようにする 接続のルートを作って そのルートを prismaClient に入れて使えるようにする
		const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
		const prisma = new PrismaClient({ adapter });

		const task = await prisma.task.create({
			data: {
				userId: 1,
				title: body.title,
				description: body.description,
				status: 'pending',
				priority: body.priority,
				expiresAt: body.expiresAt,

				// 中間テーブルを取得してリレーション関係のデータも一度に取得する
				taskTags: {
					// データベーススキーマから判断する
					create: body.tags?.map((tagName) => ({
						tag: {
							connectOrCreate: {
								where: {
									userId_name: {
										userId: 1,
										name: tagName,
									},
								},

								create: {
									userId: 1,
									name: tagName,
									color: '000000',
								},
							},
						},
					})),
				},
			},
			include: {
				taskTags: {
					include: {
						tag: true,
					},
				},
			},
		});

		return context.json(task);
	}
);

// DBに登録したタスクをKVから取り出して表示させる
// 一括で取得
taskRoute.get('/:id', async (context) => {
	// prismaを使ってDBからデータを取得できるように、アダプターを作成して接続できるようにする
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	// タスク単体を取得するためにIDをURLから取得する
	const id = context.req.param('id');

	// 取得した id を使ってDBからタスク単体を取り出す
	const task = await prisma.task.findUnique({
		// whereで id を指定してそのデータを取得する
		where: { id: Number(id) },
		// includeでリレーション関係のテーブルと接続して紐づいているデータを追加で取得する
		include: {
			taskTags: {
				include: {
					tag: true,
				},
			},
		},
	});

	return context.json(task);
});

// タスクすべてを取得する

taskRoute.get('/', async (context) => {
	// タスク一覧を取得するためにadapterを作成してprismaで接続してDBからデータを取得できるようにする
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	// DB から prisma を使用して、タスク一覧を取得する
	const tasks = await prisma.task.findMany({
		// タスクを一回取得してさらにリレーション関係のあるものを include で取得する
		include: {
			taskTags: {
				include: {
					tag: true,
				},
			},
		},
	});

	return context.json(tasks);
});

// タスクを更新
// 第一引数でエンドポイント、第二引数でバリデーションの処理、それが通ったら第三引数の処理
// という流れ
taskRoute.patch(
	'/id',
	zValidator(
		'json',
		z.object({
			// json で受け取ったデータをzod形式のチェックルールでチェックする
			title: z.string().min(1).max(255).optional(), // 文字列で1文字以上、255文字以下
			description: z.string().optional(), // description
			status: z.enum(['pending', 'inprogress', 'completed', 'cancelled']).optional(), // status なくても良いが指定された文字列のみ
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), // priority
			tags: z.array(z.string().min(1)).optional(), // tags
			expiresAt: z.coerce.date().optional(), //expiresAt
		})
	),
	async (context) => {
		// タスクを取得するためにadapterを作成してprismaで接続してDBからデータを取得できるようにする
		const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
		const prisma = new PrismaClient({ adapter });

		// DB内の該当タスクをIDから特定するためにURLからidを取得する
		const id = context.req.param('id');
		// DBを更新するためのデータをリクエストURLに渡されたデータを格納する
		// リクエストのbodyを格納するので変数 body を使用する。※ valid がわからないので調べる
		const body = context.req.valid('json');
		// 取得したidでDBにアクセスしてidの称号をして、タスクが存在するか確認
		const existingTask = await prisma.task.findUnique({
			where: { id: Number(id) },
		});
		// タスクが存在しなかったら、404ステータスとエラー文章を返す
		if (!existingTask) {
			return context.json({ error: 'Task not found' }, 404);
		}

		const task = await prisma.task.update({
			where: { id: Number(id) },
			data: {
				title: body.title,
				description: body.description,
				status: body.status,
				priority: body.priority,
				expiresAt: body.expiresAt,

				// 既存のタグを削除してから新しいタグを設定
				taskTags: (() => {
					if (!body.tags) {
						return undefined;
					}

					return {
						// データベースのスキーマから削除
						deleteMany: {},
						// tagを作る
						create: body.tags?.map((tagName) => {
							// この記述を改めて理解する map() は body.tags に格納されたデータをループ処理する
							// なので以下のタグを探して create を繰り返すという処理は理解
							// map((tagName) => ({})) 即時実行関数なのはわかる、引数にtagNameもわかる ファーレンの中にブレス の部分がいまいちわからない

							return {
								tag: {
									// userId, tagName を探して なければ create する
									connectOrCreate: {
										where: {
											userId_name: {
												userId: 1,
												name: tagName,
											},
										},

										create: {
											userId: 1,
											name: tagName,
											color: '000000',
										},
									},
								},
							};
						}),
					};
				})(),
				// この記述を改めて理解する taskTags: (() => {})(),
				// ()() がいまいち考え方の理解ができていない
				// わからなくはないがしっくり来ていない
			},
		});

		return context.json(task);
	}
);

// タスクを削除

taskRoute.delete('/:id', async (context) => {
	// いつものアダプター接続
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	// 削除するタスクの id を取得する
	const id = context.req.param('id');

	const task = await prisma.task.findUnique({
		where: {
			id: Number(id),
		},
	});

	if (!task) {
		return context.json({ error: 'Task not found' }, 404);
	}

	return context.json({ message: `タスクID${id}の削除が完了しました` });
});
