import { zValidator } from '@hono/zod-validator';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Hono } from 'hono';
import z from 'zod';
//
export const userRoute = new Hono<{ Bindings: Env }>();

userRoute.post(
	'/',
	//第に引数でバリデーxションチェック
	zValidator(
		'json',
		z.object({
			email: z.string().min(1).max(255),
			password: z.string().min(8).max(255),
		})
	),
	async (context) => {
		const body = await context.req.json();
		// console.log(body);
		// context.env
		const adapter = new PrismaPg({ connectionString: context.env.HYPERDRIVE.connectionString });
		const prisma = new PrismaClient({ adapter });

		const user = await prisma.user.create({
			data: {
				email: body.email,
				password: body.password,
			},
		});

		return context.json(user);
	}
);
