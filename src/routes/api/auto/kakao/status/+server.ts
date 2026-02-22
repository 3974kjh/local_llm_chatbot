import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConnectionInfo } from '$lib/server/kakao';

export const GET: RequestHandler = async () => {
	return json(getConnectionInfo());
};
