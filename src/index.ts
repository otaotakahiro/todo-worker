import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { taskRoute } from './Route/TaskRoute';
import { userRoute } from './Route/UserRoute';
import { authRoute } from './Route/AuthRoute';

/**
 * JSdoc
 * @param hogehoge
 */
const app = new Hono<{ Bindings: Env }>();
app
	.use(
		'/api/*',
		cors({
			origin: ['http://localhost:5173'], // 許可するオリジンを指定する
		})
	)
	// Route で作成したAPIを指定したパスで使えるようにしている
	.route('/api/v1/auth', authRoute) // useで
	.route('/api/v1/users', userRoute) // useで
	.route('/api/v1/tasks', taskRoute); // useで

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

// 宿題CRUD をすべて作成しておく
// CRUDで作成済み　deleteはbody？　それともTaskEntity？ TaskEntityの気がする

// 1.コード全てにコメント入れる
// 2.プルリクとコードレビュー
// 3.現状ログインしたらどのページ行ってもログイン情報を知っていたら再度アクセスできる（他の人も）のでそれをどう解決するのか
// ログイン時に発行したアクセストークンがログアウトしたときにDBから削除 => トークンがなくなるので解決
// 他のユーザーがトークンを使った場合 => トークンとユーザーを紐づけてトークンが一致しない場合にエラーを返す仕組みにすれば解決
