//　物事の最小単位を表す言葉 Entity 概念を示す言葉

export interface TaskEntity {
	id: string;
	title: string;
	description?: string;
	status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
	priority?: 'low' | 'medium' | 'high' | 'urgent';
	tags: string[]; // ? でtagが無い場合にするか？それとも記載なしでも空の配列が存在する。という状態にするか？
	startedAt?: string;
	expiresAt?: string;
	completedAt?: string;
}
