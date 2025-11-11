import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Session } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';

interface Variables {
	prisma: PrismaClient;
	session?: Session;
}
// Honoインスタンスを作成してルーティングしやすくする
const taskRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// 繰り返し使う処理をミドルウェアとして作成 処理のコード記述 set next
// よく使う prisma 接続のミドルウェア作成
taskRoute.use('/*', async (context, next) => {
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });
	// 型エラーが出るので、PrismaClient の型を作成して型を設定する
	context.set('prisma', prisma);

	await next();
});

// アクセストークンの保持の確認をする session 管理のミドルウェア
taskRoute.use('/*', async (context, next) => {
	// header からアクセストークンを取得して格納
	const accessToken = context.req.header('Authorization')?.split(' ').pop();
	// accessToken をユーザーが保持しているか確認 持っていなければエラーを返す
	if (!accessToken) {
		return context.json({ error: 'Unauthorized' }, 401);
	}
	// prisma ミドルウェアを呼び出す
	const prisma = context.get('prisma');
	// アクセストークンが存在するかを確認
	const session = await prisma.session.findUnique({
		where: {
			id: accessToken,
		},
	});
	// session にデータが無ければエラーを返す
	if (!session) {
		return context.json({ error: 'Unauthorized' }, 401);
	}

	context.set('session', session);

	await next();
});

// Task を登録する
taskRoute.post(
	'/',
	zValidator(
		'json',
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			status: z.enum(['pending', 'inprogress', 'completed', 'cancelled']).optional(),
			tags: z.array(z.string().min(1)).optional(),
			expiresAt: z.coerce.date().optional(),
		})
	),
	async (context) => {
		// httpリクエストの内容を取得して格納
		const body = context.req.valid('json'); // validメソッドでバリデーション済みのデータを取得する
		// prisma ミドルウェアを呼び出す
		const prisma = context.get('prisma');
		// prisma にアクセスして登録する

		const task = await prisma.task.create({
			data: {
				userId: 1, // 今は固定値
				title: body.title,
				description: body.description,
				status: 'pending', // status の初期値は固定
				expiresAt: body.expiresAt,
				// tag はtaskテーブルに存在しないので、リレーション関係からタグのスキーマに登録できるようにする
				taskTags: {
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
		});
	}
);
