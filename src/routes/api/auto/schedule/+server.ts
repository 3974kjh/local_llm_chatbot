import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startSchedule, stopSchedule, stopAllSchedules } from '$lib/server/scheduler';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { action, id } = body;

	if (action === 'start') {
		const {
			title,
			autoTimeSetting,
			autoApplyText,
			autoReferUrl,
			enableWebSearch,
			telegramEnabled,
			telegramBotToken,
			telegramChatId
		} = body;

		if (!id || !title || !autoTimeSetting || !autoApplyText || !autoReferUrl?.length) {
			return json({ success: false, error: 'Missing required fields' }, { status: 400 });
		}

		startSchedule(
			id,
			title,
			autoTimeSetting,
			autoApplyText,
			autoReferUrl,
			!!enableWebSearch,
			!!telegramEnabled,
			(telegramBotToken ?? '').trim(),
			(telegramChatId ?? '').trim()
		);
		return json({ success: true });
	}

	if (action === 'stop') {
		if (!id) {
			return json({ success: false, error: 'Missing bundle id' }, { status: 400 });
		}

		stopSchedule(id);
		return json({ success: true });
	}

	if (action === 'stop-all') {
		stopAllSchedules();
		return json({ success: true });
	}

	return json({ success: false, error: 'Invalid action' }, { status: 400 });
};
