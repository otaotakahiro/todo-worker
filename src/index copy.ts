import { Hono } from 'hono';
import { TaskEntity } from './Entity/TaskEntity';

const app = new Hono<{ Bindings: Env }>();

// タスクを登録する
app.post('/api/v1/todo', async (context) => {
	const id = crypto.randomUUID();
	const body = await context.req.json();

	const taskEntity: TaskEntity = { id, ...body };

	context.env.KV_TASKS.put(id, JSON.stringify(taskEntity));

	return context.json(taskEntity);
});

// タスクをKVから取り出して表示させる
app.get('/api/v1/todo/:id', async (context) => {
	const id = context.req.param('id');
	const taskEntity = await context.env.KV_TASKS.get<{ context: string }>(id, 'json');

	if (!taskEntity) {
		context.json({ message: `ID${id}のタスクは存在しません` });
	}

	return context.json(taskEntity);
});

// タスク一覧をKVから取得する

app.get('/api/v1/todo', async (context) => {
	const taskList = await context.env.KV_TASKS.list();
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

// タスク更新
app.put('/api/v1/todo/:id', async (context) => {
	const id = context.req.param('id');
	const body = await context.req.json();
	const taskEntity: TaskEntity = { id, ...body };

	context.env.KV_TASKS.put(id, JSON.stringify(taskEntity));

	return context.json(taskEntity);
});

// タスク削除

app.delete('/api/v1/todo/:id', async (context) => {
	const id = context.req.param('id');
	context.env.KV_TASKS.delete(id);

	return context.json({ message: `タスクID${id}　の内容を削除しました` });
});
