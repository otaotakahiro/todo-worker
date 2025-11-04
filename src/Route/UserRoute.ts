import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';

interface Variables {
	prisma: PrismaClient;
}

export const userRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

userRoute.use('/*', async (context, next) => {
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	context.set('prisma', prisma);

	await next();
});

userRoute.post(
	// POST 時のエンドポイント index.ts で users パス を設定
	'/',
	// zod 入力規則の設定 バリデーション処理
	// zValidator を使えるようにインポートする
	zValidator(
		// 引数に json形式 でかつ z.object でプロパティに制約をかける
		'json',
		z.object({
			email: z.string().min(1).max(255),
			password: z.string().min(4).max(255),
		})
	),
	async (context) => {
		const body = await context.req.json();
		const prisma = context.get('prisma');

		const user = await prisma.user.create({
			data: {
				email: body.email,
				password: body.password,
			},
		});

		return context.json(user);
	}
);
