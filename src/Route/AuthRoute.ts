import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z, { email } from 'zod';

interface Variables {
	prisma: PrismaClient;
}

export const authRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

// アダプターを作成してprismaに接続するミドルウェアを作成する
authRoute.use('/*', async (context, next) => {
	const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
	const prisma = new PrismaClient({ adapter });

	context.set('prisma', prisma);

	await next();
});

// 認証トークンを生成してDBに格納する
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
		// リクエストボディを検証
		const body = await context.req.json();

		// Prismaクライアントを取得
		const prisma = context.get('prisma');

		// DBにアクセスしてbodyの内容で存在確認
		const user = await prisma.user.findUnique({
			where: {
				email: body.email,
				password: body.password,
			},
		});
		// ユーザーが存在しない場合はエラーを返却
		if (!user) {
			return context.json({ error: 'Invalid email or password' }, 401);
		}

		// セッションの作成
		const session = await prisma.session.create({
			data: {
				userId: user.id,
				expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
			},
		});

		// ユーザーをHttpレスポンスで返却（パスワードは返却しない）
		return context.json({
			id: user.id,
			email: user.email,
			accessToken: session.id,
		});
	}
);

// ログアウト機能
authRoute.delete('/logout', async (context) => {
	// ヘッダーからアクセストークンのみを取得
	const accessToken = context.req.header('Authorization')?.split(' ').pop();
	// アクセストークンがなければエラーを返す
	if (!accessToken) {
		return context.json({ error: 'Unauthorized' });
	}

	const prisma = context.get('prisma');
	// DB側にアクセスしてアクセストークンを取得する
	const session = await prisma.session.findUnique({
		where: { id: accessToken },
	});
	//  見つからなければエラーを返す
	if (!session) {
		return context.json({ error: 'Unauthorized' });
	}
	// 該当のアクセストークンをDBから削除する
	await prisma.session.delete({
		where: {
			id: session.id,
		},
	});

	return context.json({ message: 'Logged out successfully' });
});
