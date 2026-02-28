import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeBundle, registerRunAbort, unregisterRunAbort } from '$lib/server/scheduler';

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	const {
		bundleId,
		title,
		autoApplyText,
		autoReferUrl,
		enableWebSearch,
		telegramEnabled,
		telegramBotToken: bodyToken,
		telegramChatId: bodyChatId
	} = body;

	const telegramBotToken = String(bodyToken ?? '').trim();
	const telegramChatId = String(bodyChatId ?? '').trim();

	if (!title || !autoApplyText) {
		return json({ success: false, error: 'Missing required fields: title, autoApplyText' }, { status: 400 });
	}
	const urls = Array.isArray(autoReferUrl) ? (autoReferUrl as string[]).filter((u) => typeof u === 'string' && u.trim()) : [];
	const enableSearch = !!enableWebSearch;
	if (urls.length === 0 && !enableSearch) {
		return json(
			{ success: false, error: 'Add at least one URL or enable Web Search' },
			{ status: 400 }
		);
	}

	const id = typeof bundleId === 'string' && bundleId.trim() ? bundleId.trim() : null;
	const signal = id ? registerRunAbort(id) : request.signal;

	try {
		const result = await executeBundle(
			title as string,
			autoApplyText as string,
			urls,
			enableSearch,
			!!telegramEnabled,
			telegramBotToken,
			telegramChatId,
			signal
		);
		return json(result);
	} finally {
		if (id) unregisterRunAbort(id);
	}
};
