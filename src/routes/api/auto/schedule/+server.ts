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
			scheduleType,
			scheduleTime,
			scheduleDays,
			autoApplyText,
			autoReferUrl,
			enableWebSearch,
			telegramEnabled,
			telegramBotToken,
			telegramChatId
		} = body;

		if (!id || !title || !autoApplyText) {
			return json({ success: false, error: 'Missing required fields: id, title, autoApplyText' }, { status: 400 });
		}
		const urls = Array.isArray(autoReferUrl) ? (autoReferUrl as string[]).filter((u) => typeof u === 'string' && u.trim()) : [];
		const enableSearch = !!enableWebSearch;
		if (urls.length === 0 && !enableSearch) {
			return json(
				{ success: false, error: 'Add at least one URL or enable Web Search' },
				{ status: 400 }
			);
		}
		const st = scheduleType ?? 'minutes';
		if (st === 'minutes' && (autoTimeSetting == null || autoTimeSetting < 1)) {
			return json({ success: false, error: 'autoTimeSetting required for minutes mode' }, { status: 400 });
		}

		startSchedule(
			id,
			title,
			Number(autoTimeSetting) || 60,
			autoApplyText,
			urls,
			enableSearch,
			!!telegramEnabled,
			(telegramBotToken ?? '').trim(),
			(telegramChatId ?? '').trim(),
			st,
			(typeof scheduleTime === 'string' && scheduleTime) ? scheduleTime.trim() : '09:00',
			Math.max(1, Math.min(365, Number(scheduleDays) || 1))
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
