import { Hono } from 'hono';
import { TaskEntity } from '../Entity/TaskEntity';
import { zValidator } from '@hono/zod-validator';
import z, { length } from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// honoのフレームワークでfetchの処理、ルーティングを簡単にしてくれる
// export して他のファイルでも使えるようにした
export const taskRoute = new Hono<{ Bindings: Env }>();

// タスク（tasks）を登録する　CRUD　のCreate
// zod　によるバリデーションの処理追加　引数を増やして第二引数で受け取るデータの形を指定する
// json でかつ　object　じゃ無いとだめですよ
taskRoute.post(
	'/',
	zValidator(
		'json',
		z.object({
			// jsonで受け取ったデータをzod形式のobjectチェックルールでチェックする
			title: z.string().min(1), //title:プロパティが文字列で1文字以上であれば通過
			description: z.string().optional(), //description:プロパティが文字列で、オプショナル（合ってもなくても良い）
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), //enum([a, b, c, d]) a〜dのいずれかを許可合ってもなくても良い
			tags: z.array(z.string().min(1)).optional(), // フロントから送るときはカンマ区切りのテキストなのでそれを配列として受け取るルールにする
			expiresAt: z.coerce.date().optional(), // z.coerce で型を自動変換をしてからバリデーションする。string だと 09-15 通る 90-15 も通ってしまう。
		})
	),
	async (context) => {
		const body = context.req.valid('json'); //vaild を調べる

		//Hyperdrive の接続情報を使用して Prisma を初期化
		const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
		const prisma = new PrismaClient({ adapter });

		//タス区をリレーション関係のデータと一度に作成
		const task = await prisma.task.create({
			data: {
				userId: 1,
				title: body.title,
				description: body.description,
				status: 'pending', // タスク開始時はpending固定
				priority: body.priority,
				expiresAt: body.expiresAt,

				// タグをリレーション関係のデータと一度に作成
				taskTags: {
					// データベースのスキーマから判断
					create: body.tags?.map((tagName) => ({
						// ないのでtagを作る
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

			// リレーション関係のデータも取得
			include: {
				taskTags: {
					include: {
						tag: true,
					},
				},
			},
		});
		// // タグがあれば作成オプショナルチェインニング
		// if (body.tags?.length) {
		// 	// tag を作る
		// 	const tags = await prisma.tag.createManyAndReturn({
		// 		// 一括で複数の
		// 		data: body.tags?.map((tag) => ({
		// 			userId: 1,
		// 			name: tag,
		// 			color: '000000',
		// 		})),
		// 	});

		// 	// 中間テーブルtasktag をつくる これは
		// 	await prisma.taskTag.createMany({
		// 		data: tags.map((tag) => ({
		// 			taskId: task.id,
		// 			tagId: tag.id,
		// 		})),
		// 	});
		// }

		return context.json(task);
	}
);

// タスクをKVから取り出して表示させる　CRUD　のRead

taskRoute.get('/:id', async (context) => {
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	const id = context.req.param('id');

	const task = await prisma.task.findUnique({
		where: { id: Number(id) },
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

// タスク全部をKVから取り出して表示させる　CRUD　のRead
// タスクを1つ取得するKVから読み込んでいるものをprismaをタスクのタグも取得できるようにする

taskRoute.get('/', async (context) => {
	// prisma に接続するadapter を作る
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	// 変数にprismaを動作させるように代入
	const prisma = new PrismaClient({ adapter });

	const tasks = await prisma.task.findMany({
		// リストを一回取得してさらにリレーション関係にあるものを取得するには include でさらに取りに行く
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

//

// タスクを更新する　CRUD　のUpdate

taskRoute.patch(
	'/:id',
	zValidator(
		'json',
		z.object({
			// jsonで受け取ったデータをzod形式のobjectチェックルールでチェックする
			title: z.string().min(1).optional(), //title:プロパティが文字列で1文字以上であれば通過
			description: z.string().optional(), //description:プロパティが文字列で、オプショナル（合ってもなくても良い）
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), //enum([a, b, c, d]) a〜dのいずれかを許可合ってもなくても良い
			tags: z.array(z.string().min(1)).optional(), // フロントから送るときはカンマ区切りのテキストなのでそれを配列として受け取るルールにする
			expiresAt: z.coerce.date().optional(), // z.coerce で型を自動変換をしてからバリデーションする。string だと 09-15 通る 90-15 も通ってしまう。
			status: z.enum(['pending', 'inprogress', 'completed', 'cancelled']).optional(),
		})
	),
	async (context) => {
		const id = context.req.param('id');
		const body = context.req.valid('json');

		const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
		const prisma = new PrismaClient({ adapter });

		const task = await prisma.task.update({
			where: { id: Number(id) },
			data: {
				title: body.title,
				description: body.description,
				status: body.status, // タスク開始時はpending固定
				priority: body.priority,
				expiresAt: body.expiresAt,

				// 既存のすべてのタグを削除してから新しいタグを設定
				taskTags: (() => {
					if (!body.tags) {
						return undefined;
					}

					return {
						deleteMany: {},
						// データベースのスキーマから判断
						create: body.tags?.map((tagName) => ({
							// ないのでtagを作る
							tag: {
								// ここで userId, tagName を探して なければ create する
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
					};

					//
				})(),
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

// タスクを削除する　CRUD のDelete

taskRoute.delete('/:id', async (context) => {
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	const id = context.req.param('id');
	await prisma.task.delete({
		where: { id: Number(id) },
	});

	return context.json({ message: `タスクID${id}のタスク内容を削除しました` });
});
