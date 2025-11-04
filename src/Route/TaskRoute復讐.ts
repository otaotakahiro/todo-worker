import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';

export const taskRoute = new Hono<{ Bindings: Env }>();

// タスクをDBに登録するCRUDのC
taskRoute.post(
	'/',
	zValidator(
		'json',
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			// status: z.string().optional(),
			priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
			tags: z.array(z.string().min(1)).optional(), // ? でtagが無い場合にするか？それとも記載なしでも空の配列が存在する。という状態にするか？
			expiresAt: z.coerce.date().optional(),
		})
	),
	async (context) => {
		const body = context.req.valid('json');
		// prisma に接続できるようにする 接続のルートを作って そのルートを prismaClient に入れて使えるようにする
		const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
		const prisma = new PrismaClient({ adapter });

		const task = await prisma.task.create({
			data: {
				userId: 1,
				title: body.title,
				description: body.description,
				status: 'pending',
				priority: body.priority,
				expiresAt: body.expiresAt,

				// 中間テーブルを取得してリレーション関係のデータも一度に取得する
				taskTags: {
					// データベーススキーマから判断する
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
			include: {
				taskTags: {
					include: {
						tag: true,
					},
				},
			},
		});

		return context.json(task);
	}
);

taskRoute.get();
