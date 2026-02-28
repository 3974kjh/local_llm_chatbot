import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { executeBundle } from '$lib/server/scheduler';

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}

	const {
		title,
		autoApplyText,
		autoReferUrl,
		enableWebSearch,
		telegramEnabled,
		telegramBotToken: bodyToken,
		telegramChatId: bodyChatId
	} = body;

	// 데이터 없으면 텔레그램 전송 안 함 (.env 사용 안 함)
	const telegramBotToken = String(bodyToken ?? '').trim();
	const telegramChatId = String(bodyChatId ?? '').trim();

	if (!title || !autoApplyText || !autoReferUrl?.length) {
		return json({ success: false, error: 'Missing required fields' }, { status: 400 });
	}

	const result = await executeBundle(
		title as string,
		autoApplyText as string,
		autoReferUrl as string[],
		!!enableWebSearch,
		!!telegramEnabled,
		telegramBotToken,
		telegramChatId
	);
	return json(result);
};
