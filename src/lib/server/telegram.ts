import { env } from '$env/dynamic/private';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const CHUNK_SIZE = 4000;
const SEND_DELAY_MS = 300;
const REQUEST_TIMEOUT_MS = 25000;

function getBotToken(): string {
	return (env.TELEGRAM_BOT_TOKEN || '').trim();
}

export function isConfigured(): boolean {
	return !!getBotToken();
}

export function getConnectionInfo(): { configured: boolean } {
	return { configured: isConfigured() };
}

function resolveToken(botToken?: string): string {
	return (botToken ?? '').trim();
}

function splitTextIntoChunks(text: string, maxLen: number): string[] {
	if (text.length <= maxLen) return [text];

	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		if (remaining.length <= maxLen) {
			chunks.push(remaining);
			break;
		}

		const slice = remaining.slice(0, maxLen);
		const lastNewline = slice.lastIndexOf('\n');
		const lastParagraph = slice.lastIndexOf('\n\n');
		const splitAt =
			lastParagraph > maxLen * 0.5
				? lastParagraph + 2
				: lastNewline > maxLen * 0.5
					? lastNewline + 1
					: maxLen;

		chunks.push(remaining.slice(0, splitAt));
		remaining = remaining.slice(splitAt);
	}

	return chunks;
}

async function sendSingleMessage(
	chatId: string,
	text: string,
	botToken?: string
): Promise<{ success: boolean; error?: string }> {
	const token = resolveToken(botToken);
	if (!token) {
		return { success: false, error: 'Telegram Bot Token이 없습니다.' };
	}

	const url = `${TELEGRAM_API_BASE}/bot${token}/sendMessage`;
	const body = new URLSearchParams({
		chat_id: chatId,
		text,
		disable_web_page_preview: 'true'
	});

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: body.toString(),
			signal: controller.signal
		});
	} catch (e) {
		clearTimeout(timeoutId);
		if (e instanceof Error && e.name === 'AbortError') {
			return { success: false, error: `전송 타임아웃 (${REQUEST_TIMEOUT_MS / 1000}초)` };
		}
		throw e;
	}
	clearTimeout(timeoutId);

	const responseText = await response.text();

	if (!response.ok) {
		console.error('[Telegram] Send failed:', response.status, responseText);
		let errorDetail = responseText;
		try {
			const err = JSON.parse(responseText);
			errorDetail = err.description || responseText;
		} catch {
			// use raw
		}
		return { success: false, error: errorDetail };
	}

	return { success: true };
}

export async function sendMessage(
	chatId: string,
	title: string,
	text: string,
	botToken?: string
): Promise<{ success: boolean; error?: string }> {
	const fullText = `[${title}]\n${text}`;
	return sendMessageChunked(chatId, title, fullText, true, botToken);
}

export async function sendMessageChunked(
	chatId: string,
	title: string,
	text: string,
	alreadyFormatted = false,
	botToken?: string
): Promise<{ success: boolean; error?: string; sentCount: number; totalChunks: number }> {
	const token = resolveToken(botToken);
	if (!token) {
		return {
			success: false,
			error: 'Telegram Bot Token이 없습니다.',
			sentCount: 0,
			totalChunks: 0
		};
	}

	if (!chatId || !chatId.trim()) {
		return {
			success: false,
			error: 'Telegram Chat ID is required for this bundle.',
			sentCount: 0,
			totalChunks: 0
		};
	}

	const fullText = alreadyFormatted ? text : `[${title}]\n${text}`;
	const chunks = splitTextIntoChunks(fullText, CHUNK_SIZE);
	const totalChunks = chunks.length;

	console.log(
		`[Telegram] Sending "${title}" to chat ${chatId} - ${fullText.length} chars split into ${totalChunks} chunk(s)`
	);

	let sentCount = 0;

	for (let i = 0; i < chunks.length; i++) {
		let chunkText = chunks[i];

		if (totalChunks > 1) {
			if (i === 0) {
				chunkText = `[${title}] (${i + 1}/${totalChunks})\n${chunkText.replace(`[${title}]\n`, '')}`;
			} else {
				chunkText = `[${title}] (${i + 1}/${totalChunks})\n${chunkText}`;
			}
		}

		const result = await sendSingleMessage(chatId.trim(), chunkText, token);

		if (!result.success) {
			console.error(`[Telegram] Failed at chunk ${i + 1}/${totalChunks}:`, result.error);
			return {
				success: false,
				error: result.error || `Failed at part ${i + 1}/${totalChunks}`,
				sentCount,
				totalChunks
			};
		}

		sentCount++;
		console.log(`[Telegram] Sent chunk ${i + 1}/${totalChunks} (${chunkText.length} chars)`);

		if (i < chunks.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
		}
	}

	console.log(`[Telegram] All ${totalChunks} chunk(s) sent successfully for "${title}"`);
	return { success: true, sentCount, totalChunks };
}
