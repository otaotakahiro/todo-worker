// API作成の流れ
// Honoインスタンスを作る -> ルーティングを簡素化するためｎ
// prisma に接続してDBにアクセスできるようにする
// ミドルウェアが必要な場合作成
// リクエストデータを取得 DBに格納 または リクエストデータとDBデータを参照するなど
// 処理内容に合わせてデータ操作をする

import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';

// ミドルウェアを作成すると型エラーがでるので、型を宣言する
interface Variables {
	prisma: PrismaClient;
}

const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();
// adapter と prisma 接続のミドルウェア作成
authRoute.use('/*', async (context, next) => {
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	context.set('prisma', prisma);

	await next();
});

// 認証トークンを生成してDBに格納する
authRoute.post(
	'/login',
	zValidator(
		'json',
		z.object({
			email: z.string().max(255),
			password: z.string().max(255),
		})
	),
	async (context) => {
		const body = await context.req.json();

		const prisma = context.get('prisma');

		const user = await prisma.user.findUnique({
			where: {
				email: body.email,
				password: body.password,
			},
		});
		if (!user) {
			return context.json({ error: 'ログインに失敗しました' }, 401);
		}

		const session = await prisma.session.create({
			data: {
				userId: user.id,
				expiresAt: new Date(Date.now()),
			},
		});

		return context.json({
			id: user.id,
			email: user.email,
			accessToken: session.id,
		});
	}
);

// ログアウト機能

authRoute.delete('/logout', async (context) => {
	const accessToken = context.req.header('Authorization')?.split(' ').pop();

	if (!accessToken) {
		return context.json({ error: '' });
	}

	const prisma = context.get('prisma');

	// const session = await prisma.session.findUnique({
	// 	where: {
	// 		id: accessToken,
	// 	},
	// });
	// if (!session) {
	// 	return context.json({ error: '' });
	// }

	await prisma.session.delete({
		where: {
			id: accessToken,
		},
	});

	return context.json({ message: 'ログアウトしました' });
});
