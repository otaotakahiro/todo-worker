import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z, { email } from 'zod';

interface Variables {
	prisma: PrismaClient;
}

export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

authRoute.use('/*', async (context, next) => {
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	context.set('prisma', prisma);

	await next();
});

authRoute.post(
	// POST 時のエンドポイント index.ts で auths パス を設定
	'/login',
	// zod 入力規則の設定 バリデーション処理
	// zValidator を使えるようにインポートする
	zValidator(
		// 引数に json形式 でかつ z.object でプロパティに制約をかける
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
		//
		if (!user) {
			return context.json({ error: 'Invalid email or password' }, 401);
		}

		const session = await prisma.session.create({
			data: {
				userId: user.id,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
			},
		});

		//
		// ユーザーをHttpレスポンスで返却
		return context.json({
			id: user.id,
			email: user.email,
			accessToken: session.id,
		});
	}
);

authRoute.delete('/logout', async (context) => {
	const accessToken = context.req.header('Authorization')?.split(' ').pop();

	if (!accessToken) {
		return context.json({ error: 'Unauthorized' });
	}

	const prisma = context.get('prisma');

	const session = await prisma.session.findUnique({
		where: { id: accessToken },
	});

	if (!session) {
		return context.json({ error: 'Unauthorized' });
	}

	await prisma.session.delete({
		where: {
			id: session.id,
		},
	});

	return context.json({ message: 'Logged out successfully' });
});
