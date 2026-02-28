import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendMessage } from '$lib/server/telegram';

export const POST: RequestHandler = async ({ request }) => {
	const { chatId, botToken } = await request.json();

	if (!chatId || typeof chatId !== 'string' || !chatId.trim()) {
		return json({ success: false, error: 'Chat ID is required' }, { status: 400 });
	}

	const token = (typeof botToken === 'string' && botToken.trim()) ? botToken.trim() : undefined;
	const result = await sendMessage(chatId.trim(), 'JukimBot Test', 'Telegram 연동 테스트 메시지입니다.', token);

	if (!result.success) {
		return json({ success: false, error: result.error });
	}

	return json({ success: true });
};
