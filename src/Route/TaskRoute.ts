import { Hono } from 'hono';
import { TaskEntity } from '../Entity/TaskEntity';
import { zValidator } from '@hono/zod-validator';
import z from 'zod';

// honoのフレームワークでfetchの処理、ルーティングを簡単にしてくれる
// export して他のファイルでも使えるようにした
export const taskRoute = new Hono<{ Bindings: Env }>();

// タスク（tasks）を登録する　CRUD　のCreate
// zod　によるバリデーションの処理追加　引数を増やして第二引数で受け取るデータの形を指定する
// json でかつ　object　じゃ無いとだめですよ
taskRoute.post(
	'/',
	zValidator(
		'json',
		z.object({
			// jsonで受け取ったデータをzod形式のobjectチェックルールでチェックする
			title: z.string().min(1), //title:プロパティが文字列で1文字以上であれば通過
			description: z.string().optional(), //description:プロパティが文字列で、オプショナル（合ってもなくても良い）
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), //enum([a, b, c, d]) a〜dのいずれかを許可合ってもなくても良い
			tag: z.array(z.string().min(1)).optional(), // フロントから送るときはカンマ区切りのテキストなのでそれを配列として受け取るルールにする
			expiresAt: z.coerce.date().optional(), // z.coerce で型を自動変換をしてからバリデーションする。string だと 09-15 通る 90-15 も通ってしまう。
		})
	),
	async (context) => {
		const id = crypto.randomUUID();
		console.log(id);
		const body = await context.req.json();
		console.log(body);
		const taskEntity: TaskEntity = { id, ...body };

		context.env.KV_TASKS.put(id, JSON.stringify(taskEntity));

		return context.json(taskEntity);
	}
);

// タスクをKVから取り出して表示させる　CRUD　のRead

taskRoute.get('/:id', async (context) => {
	const id = context.req.param('id');
	const taskEntity = await context.env.KV_TASKS.get<{ content: string }>(id, 'json');

	if (!taskEntity) {
		return context.json({ message: `ID${id}のタスクは存在しません` }, 404);
	}

	return context.json(taskEntity);
});

// タスク全部をKVから取り出して表示させる　CRUD　のRead
taskRoute.get('/', async (context) => {
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

taskRoute.put(
	'/:id',
	zValidator(
		'json',
		z.object({
			// jsonで受け取ったデータをzod形式のobjectチェックルールでチェックする
			title: z.string().min(1), //title:プロパティが文字列で1文字以上であれば通過
			description: z.string().optional(), //description:プロパティが文字列で、オプショナル（合ってもなくても良い）
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(), //enum([a, b, c, d]) a〜dのいずれかを許可合ってもなくても良い
			tag: z.array(z.string().min(1)).optional(), // フロントから送るときはカンマ区切りのテキストなのでそれを配列として受け取るルールにする
			expiresAt: z.coerce.date().optional(), // z.coerce で型を自動変換をしてからバリデーションする。string だと 09-15 通る 90-15 も通ってしまう。
		})
	),
	async (context) => {
		const id = context.req.param('id');
		const body = await context.req.json();
		const taskEntity = { id, ...body };

		context.env.KV_TASKS.put(id, JSON.stringify(taskEntity));

		return context.json(taskEntity);
	}
);

// タスクを削除する　CRUD のDelete

taskRoute.delete('/:id', async (context) => {
	const id = context.req.param('id');
	await context.env.KV_TASKS.delete(id);

	return context.json({ message: `タスクID${id}のタスク内容を削除しました` });
});
