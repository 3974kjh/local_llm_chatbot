import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthUrl, isConfigured } from '$lib/server/kakao';

export const GET: RequestHandler = async ({ url }) => {
	if (!isConfigured()) {
		return new Response('KAKAO_REST_API_KEY not configured in .env', { status: 500 });
	}

	const authUrl = getAuthUrl(url.origin);
	return redirect(302, authUrl);
};
