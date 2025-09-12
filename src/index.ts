import { Hono } from 'hono';
import { TaskEntity } from './Entity/TaskEntity';

// honoのフレームワークでfetchの処理、ルーティングを簡単にしてくれる
const app = new Hono<{ Bindings: Env }>();

// タスク（todo）を登録する　CRUD　のCreate
app.post('/api/v1/todo', async (context) => {
	const id = crypto.randomUUID();
	console.log(id);
	const body = await context.req.json();
	console.log(body);
	const taskEntity: TaskEntity = { id, ...body };

	context.env.KV_TASKS.put(id, JSON.stringify(taskEntity));

	return context.json(taskEntity);
});

// タスクをKVから取り出して表示させる　CRUD　のRead

app.get('/api/v1/todo/:id', async (context) => {
	const id = context.req.param('id');
	const taskEntity = await context.env.KV_TASKS.get<{ content: string }>(id, 'json');

	if (!taskEntity) {
		return context.json({ message: `ID${id}のタスクは存在しません` }, 404);
	}

	return context.json(taskEntity);
});

// タスク全部をKVから取り出して表示させる　CRUD　のRead
app.get('/api/v1/todo', async (context) => {
	const taskList = await context.env.KV_TASKS.list(); // KVからタスクをリスト形式で取得する　->　リスト形式ってどんな感じになっているのか？どういうイメージか{name:hogehoge}ってのはわかる
	const taskEntities: TaskEntity[] = [];

	for (const key of taskList.keys) {
		const taskEntity = await context.env.KV_TASKS.get<TaskEntity>(key.name, 'json');

		if (!taskEntity) {
			continue;
		}
		taskEntities.push(taskEntity);
	}

	return context.json(taskEntities);
});

// タスクを更新する　CRUD　のUpdate

app.put('/api/v1/todo/:id', async (context) => {
	const id = context.req.param('id');
	const body = await context.req.json();
	const taskEntity = { id, ...body };

	context.env.KV_TASKS.put(id, JSON.stringify(body));

	return context.json(taskEntity);
});

// タスクを削除する　CRUD のDelete

app.delete('/api/v1/todo/:id', async (context) => {
	const id = context.req.param('id');
	await context.env.KV_TASKS.delete(id);

	return context.json({ message: `タスクID${id}のタスク内容を削除しました` });
});

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;

// 宿題CRUD をすべて作成しておく
// CRUDで作成済み　deleteはbody？　それともTaskEntity？ TaskEntityの気がする
