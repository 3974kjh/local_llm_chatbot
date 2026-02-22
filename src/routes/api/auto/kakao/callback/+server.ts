import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { exchangeCode } from '$lib/server/kakao';

export const GET: RequestHandler = async ({ url }) => {
	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');
	const errorDescription = url.searchParams.get('error_description');

	if (error || !code) {
		console.error('[Kakao Callback] OAuth error:', error, errorDescription);
		const msg = encodeURIComponent(errorDescription || error || 'unknown_error');
		return redirect(302, `/?mode=auto&kakao=error&msg=${msg}`);
	}

	const result = await exchangeCode(code, url.origin);

	if (result.success) {
		return redirect(302, '/?mode=auto&kakao=connected');
	}

	const msg = encodeURIComponent(result.error || 'token_exchange_failed');
	return redirect(302, `/?mode=auto&kakao=error&msg=${msg}`);
};
