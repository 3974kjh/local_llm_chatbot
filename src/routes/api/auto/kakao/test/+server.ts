import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendMessage, isConnected, getConnectionInfo } from '$lib/server/kakao';

export const POST: RequestHandler = async () => {
	const connectionInfo = getConnectionInfo();

	if (!connectionInfo.configured) {
		return json(
			{
				success: false,
				error: 'KAKAO_REST_API_KEY not configured in .env',
				connectionInfo
			},
			{ status: 400 }
		);
	}

	if (!connectionInfo.connected) {
		return json(
			{
				success: false,
				error: 'Kakao not connected. Please click "Connect Kakao Talk" first.',
				connectionInfo
			},
			{ status: 400 }
		);
	}

	const testMessage = `JukimBot 테스트 메시지입니다.\n\n현재 시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}\n\n카카오톡 연동이 정상적으로 작동하고 있습니다.`;

	const result = await sendMessage('Test', testMessage);

	return json({
		...result,
		connectionInfo
	});
};
