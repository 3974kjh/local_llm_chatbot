import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeBundle } from '$lib/server/scheduler';

export const POST: RequestHandler = async ({ request }) => {
	const { title, autoApplyText, autoReferUrl, enableWebSearch } = await request.json();

	if (!title || !autoApplyText || !autoReferUrl?.length) {
		return json({ success: false, error: 'Missing required fields' }, { status: 400 });
	}

	const result = await executeBundle(title, autoApplyText, autoReferUrl, !!enableWebSearch);
	return json(result);
};
