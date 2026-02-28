import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConnectionInfo } from '$lib/server/telegram';

export const GET: RequestHandler = async () => {
	const info = getConnectionInfo();
	return json(info);
};
