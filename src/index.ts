import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { taskRoute } from './Route/TaskRoute';
import { userRoute } from './Route/UserRoute';

const app = new Hono<{ Bindings: Env }>();
app
	.use(
		'/api/*',
		cors({
			origin: ['http://localhost:5173'], // 許可するオリジンを指定する
		})
	)
	.route('/api/v1/tasks', taskRoute) // useで
	.route('/api/v1/users', userRoute); // useで

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

// 宿題CRUD をすべて作成しておく
// CRUDで作成済み　deleteはbody？　それともTaskEntity？ TaskEntityの気がする
