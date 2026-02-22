import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllTaskStatuses } from '$lib/server/scheduler';

export const GET: RequestHandler = async () => {
	const statuses = getAllTaskStatuses();
	return json(statuses);
};
