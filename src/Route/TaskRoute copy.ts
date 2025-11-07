import { Hono } from 'hono';
// import { TaskEntity } from '../Entity/TaskEntity';
import { zValidator } from '@hono/zod-validator';
import z from 'zod';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Session } from '@prisma/client';

interface Variables {
	prisma: PrismaClient;
	session?: Session;
}

// honoのフレームワークでfetchの処理、ルーティングを簡単にしてくれる
// export して他のファイルでも使えるようにした
export const taskRoute = new Hono<{ Bindings: Env; Variables: Variables }>();
// middleware?第一引数で対象のURLを指定する
taskRoute.use('/*', async (context, next) => {
	//Hyperdrive の接続情報を使用して Prisma を初期化 本来は各API処理に記述していたが複数回出てくるのでまとめて管理
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });
	// 他のコードでアダプターとprismaを使えるようにするためにする
	context.set('prisma', prisma);
	// ミドルウェアが動くために必要な記述
	await next();
});

// 同じミドルウェアがある場合は順番に処理される
// アクセストークンの保持をユーザー側、DB側で確認
taskRoute.use('/*', async (context, next) => {
	// Authorization: Bearer <accessToken> アクセストークンのみを変数に代入する
	const accessToken = context.req.header('Authorization')?.split(' ').pop();
	// アクセストークンがなければ、エラーを返す
	if (!accessToken) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	//アクセストークンを持っていたら次の処理
	// アダプターとプリズマの接続をここで呼び出す
	const prisma = context.get('prisma');
	// DB側でもアクセストークンが存在するか確認
	const session = await prisma.session.findUnique({
		where: {
			id: accessToken,

		},
	});
	// アクセストークンがなければエラーを返す
	if (!session) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	// ここでsession をあとから呼び出せるようにする
	context.set('session', session);

	await next();
});

// タスク（tasks）を登録する　CRUD　のCreate
// zod　によるバリデーションの処理追加　引数を増やして第二引数で受け取るデータの形を指定する
// json でかつ　object で かつその内容に制限をかけることで、意図しないデータの入力を未然に防ぐ
taskRoute.post(
	'/:id',
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
		//validメソッドでバリデーション済みのデータを取得する
		const body = context.req.valid('json');
		// set したものをgetで受け取る
		const prisma = context.get('prisma');

		const session = context.get('session');

		if (!session?.userId) {
			return undefined;
		}

		if (!body. === session?.userId) {
			return context.json({ error: 'userId not found' });
		}

		//タスクをリレーション関係のデータと一緒に一度で取得する
		const task = await prisma.task.create({
			data: {
				userId: 1,
				title: body.title,
				description: body.description,
				status: 'pending', // タスク開始時はpending固定
				priority: body.priority,
				expiresAt: body.expiresAt,

				// リレーション関係からタグのデータを参照する
				// データベースのスキーマから判断
				taskTags: {
					// tagのjsonを作る、bodyに格納されたリクエスト内容をmapメソッドで繰り返し取得して設定
					create: body.tags?.map((tagName) => ({
						tag: {
							// 既存のtagに接続するか、なければ新規制作する
							connectOrCreate: {
								// ここでDB内のtagの存在を確認する
								where: {
									userId_name: {
										userId: 1,
										name: tagName,
									},
								},
								// whereで見つからなかった場合のみ、新しいTagを作成
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

		return context.json(task);
	}
);

// タスク1つをDBから取り出して表示させる　CRUD　のRead
taskRoute.get('/:id', async (context) => {
	// set したものをgetで受け取る
	const prisma = context.get('prisma');
	// リクエストURLから受け取ったidを格納、DBからデータを特定するために使う
	const id = context.req.param('id');
	// DBから該当するデータ1つを取得する
	const task = await prisma.task.findUnique({
		where: { id: Number(id) },
		// include でリレーション関係のデータも取得する
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

// タスク全部をDBから取り出して表示させる　CRUD　のRead
taskRoute.get('/', async (context) => {
	// set したものをgetで受け取る
	const prisma = context.get('prisma');
	// findManyメソッドでtaskすべてを取得する
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
		// 更新するタスクを特定するために、リクエストからidを取得する
		const id = context.req.param('id');
		// zodでバリデーションされた結果をbodyに格納する
		const body = context.req.valid('json');
		// set したものをgetで受け取る
		const prisma = context.get('prisma');
		// 該当するタスク1つを取得する
		const existingTask = await prisma.task.findUnique({
			where: { id: Number(id) },
		});
		// タスク内容が存在しなかった場合、タスクが見つからないとエラーを返す
		if (!existingTask) {
			return context.json({ error: 'Task not found' }, 404);
		}
		// taskを更新する処理
		const task = await prisma.task.update({
			// id から更新するタスクを特定
			where: { id: Number(id) },
			// リクエストデータをbodyに入れてその中の各データを対応するオブジェクト（スキーマ？）に設定する
			data: {
				title: body.title,
				description: body.description,
				status: body.status, // タスク開始時はpending固定
				priority: body.priority,
				expiresAt: body.expiresAt,

				// 新しいタグを設定
				taskTags: (() => {
					if (!body.tags) {
						return undefined;
					}

					return {
						// 既存のタグをすべて削除
						deleteMany: {},
						// データベースのスキーマから判断
						create: body.tags?.map((tagName) => ({
							// ないのでtagを作る
							tag: {
								// ここで userId, tagName を探す
								connectOrCreate: {
									where: {
										userId_name: {
											userId: 1,
											name: tagName,
										},
									},
									// DBにタグがなければ作成する
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
	// set したものをgetで受け取る
	const prisma = context.get('prisma');
	// 削除するタスク特定するためにidを取得する
	const id = context.req.param('id');

	// idからタスクの存在を確認して、空の状態で削除したら エラーメッセージを送る処理
	// タスクIDからそのスキーマのデータを代入
	const existingTask = await prisma.task.findUnique({
		where: { id: Number(id) },
	});
	// タスクのデータ有無をチェック 存在しなければエラーを返す
	if (!existingTask) {
		return context.json({ error: 'Task not found' }, 404);
	}
	// id に該当するタスクを削除
	await prisma.task.delete({
		where: { id: Number(id) },
	});
	// 削除結果を返す
	return context.json({ message: `タスクID${id}のタスク内容を削除しました` });
});
