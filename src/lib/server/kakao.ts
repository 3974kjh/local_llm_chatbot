import { env } from '$env/dynamic/private';
import fs from 'node:fs';
import path from 'node:path';

interface KakaoTokens {
	access_token: string;
	refresh_token: string;
	expires_at: number;
}

const TOKEN_FILE = path.resolve('.kakao-tokens.json');

function loadTokens(): KakaoTokens | null {
	try {
		if (fs.existsSync(TOKEN_FILE)) {
			const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
			const parsed = JSON.parse(raw);
			if (parsed.access_token && parsed.refresh_token && parsed.expires_at) {
				return parsed;
			}
		}
	} catch (e) {
		console.error('[Kakao] Failed to load tokens from file:', e);
	}
	return null;
}

function saveTokens(tokens: KakaoTokens): void {
	try {
		fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf-8');
		console.log('[Kakao] Tokens saved to', TOKEN_FILE);
	} catch (e) {
		console.error('[Kakao] Failed to save tokens to file:', e);
	}
}

function clearTokens(): void {
	try {
		if (fs.existsSync(TOKEN_FILE)) {
			fs.unlinkSync(TOKEN_FILE);
		}
	} catch {
		// ignore
	}
}

function getTokens(): KakaoTokens | null {
	return loadTokens();
}

function getApiKey(): string {
	return env.KAKAO_REST_API_KEY || '';
}

export function isConfigured(): boolean {
	return !!getApiKey();
}

export function isConnected(): boolean {
	const tokens = getTokens();
	if (!tokens) return false;
	if (Date.now() >= tokens.expires_at) {
		return !!tokens.refresh_token;
	}
	return true;
}

export function getConnectionInfo(): {
	configured: boolean;
	connected: boolean;
	hasTokens: boolean;
	tokenExpired: boolean;
	expiresAt: string | null;
} {
	const tokens = getTokens();
	return {
		configured: isConfigured(),
		connected: isConnected(),
		hasTokens: tokens !== null,
		tokenExpired: tokens !== null && Date.now() >= tokens.expires_at,
		expiresAt: tokens ? new Date(tokens.expires_at).toISOString() : null
	};
}

export function getAuthUrl(origin: string): string {
	const redirectUri = `${origin}/api/auto/kakao/callback`;
	const apiKey = getApiKey();
	return `https://kauth.kakao.com/oauth/authorize?client_id=${apiKey}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=talk_message`;
}

export async function exchangeCode(
	code: string,
	origin: string
): Promise<{ success: boolean; error?: string }> {
	const redirectUri = `${origin}/api/auto/kakao/callback`;
	const apiKey = getApiKey();

	console.log('[Kakao] Exchanging code for token...');
	console.log('[Kakao] Redirect URI:', redirectUri);

	const response = await fetch('https://kauth.kakao.com/oauth/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			client_id: apiKey,
			redirect_uri: redirectUri,
			code
		})
	});

	const responseText = await response.text();

	if (!response.ok) {
		console.error('[Kakao] Token exchange failed:', response.status, responseText);
		return { success: false, error: `Token exchange failed (${response.status}): ${responseText}` };
	}

	try {
		const data = JSON.parse(responseText);
		const tokens: KakaoTokens = {
			access_token: data.access_token,
			refresh_token: data.refresh_token,
			expires_at: Date.now() + data.expires_in * 1000
		};
		saveTokens(tokens);

		console.log('[Kakao] Token obtained successfully. Expires in:', data.expires_in, 'seconds');
		console.log('[Kakao] Scopes granted:', data.scope);
		return { success: true };
	} catch (e) {
		console.error('[Kakao] Failed to parse token response:', e);
		return { success: false, error: 'Failed to parse token response' };
	}
}

async function refreshAccessToken(): Promise<KakaoTokens | null> {
	const tokens = getTokens();
	if (!tokens?.refresh_token) {
		console.error('[Kakao] No refresh token available');
		return null;
	}

	console.log('[Kakao] Refreshing access token...');

	const response = await fetch('https://kauth.kakao.com/oauth/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			client_id: getApiKey(),
			refresh_token: tokens.refresh_token
		})
	});

	if (!response.ok) {
		const errText = await response.text();
		console.error('[Kakao] Token refresh failed:', response.status, errText);
		clearTokens();
		return null;
	}

	const data = await response.json();
	const newTokens: KakaoTokens = {
		access_token: data.access_token,
		refresh_token: data.refresh_token || tokens.refresh_token,
		expires_at: Date.now() + data.expires_in * 1000
	};
	saveTokens(newTokens);

	console.log('[Kakao] Token refreshed successfully');
	return newTokens;
}

async function ensureValidToken(): Promise<string | null> {
	let tokens = getTokens();
	if (!tokens) {
		console.error('[Kakao] Not connected - no tokens (file not found)');
		return null;
	}

	if (Date.now() >= tokens.expires_at) {
		console.log('[Kakao] Token expired, attempting refresh...');
		tokens = await refreshAccessToken();
		if (!tokens) return null;
	}

	return tokens.access_token;
}

const CHUNK_SIZE = 1000;
const SEND_DELAY_MS = 500;

function splitTextIntoChunks(text: string, maxLength: number): string[] {
	if (text.length <= maxLength) return [text];

	const chunks: string[] = [];
	let remaining = text;

	while (remaining.length > 0) {
		if (remaining.length <= maxLength) {
			chunks.push(remaining);
			break;
		}

		let splitIdx = remaining.lastIndexOf('\n\n', maxLength);

		if (splitIdx < maxLength * 0.3) {
			splitIdx = remaining.lastIndexOf('\n', maxLength);
		}

		if (splitIdx < maxLength * 0.3) {
			splitIdx = remaining.lastIndexOf('. ', maxLength);
			if (splitIdx > 0) splitIdx += 1;
		}

		if (splitIdx < maxLength * 0.3) {
			splitIdx = remaining.lastIndexOf(' ', maxLength);
		}

		if (splitIdx < maxLength * 0.3) {
			splitIdx = maxLength;
		}

		chunks.push(remaining.slice(0, splitIdx).trim());
		remaining = remaining.slice(splitIdx).trim();
	}

	return chunks.filter((c) => c.length > 0);
}

async function sendSingleMessage(
	accessToken: string,
	text: string
): Promise<{ success: boolean; error?: string }> {
	const templateObject = JSON.stringify({
		object_type: 'text',
		text,
		link: {
			web_url: 'https://developers.kakao.com',
			mobile_web_url: 'https://developers.kakao.com'
		},
		button_title: 'Open'
	});

	const response = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			template_object: templateObject
		})
	});

	const responseText = await response.text();

	if (!response.ok) {
		console.error('[Kakao] Send failed:', response.status, responseText);

		let errorDetail = responseText;
		try {
			const errorJson = JSON.parse(responseText);
			errorDetail = `${errorJson.msg || errorJson.message || responseText} (code: ${errorJson.code || response.status})`;
		} catch {
			// use raw text
		}

		return { success: false, error: errorDetail };
	}

	return { success: true };
}

export async function sendMessage(
	title: string,
	text: string
): Promise<{ success: boolean; error?: string }> {
	const fullText = `[${title}]\n${text}`;
	return sendMessageChunked(title, fullText, true);
}

export async function sendMessageChunked(
	title: string,
	text: string,
	alreadyFormatted = false
): Promise<{ success: boolean; error?: string; sentCount: number; totalChunks: number }> {
	const accessToken = await ensureValidToken();
	if (!accessToken) {
		return {
			success: false,
			error: 'Kakao not connected or token expired. Please reconnect.',
			sentCount: 0,
			totalChunks: 0
		};
	}

	const fullText = alreadyFormatted ? text : `[${title}]\n${text}`;
	const chunks = splitTextIntoChunks(fullText, CHUNK_SIZE);
	const totalChunks = chunks.length;

	console.log(
		`[Kakao] Sending "${title}" - ${fullText.length} chars split into ${totalChunks} chunk(s)`
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

		let result = await sendSingleMessage(accessToken, chunkText);

		if (!result.success && result.error?.includes('401')) {
			console.log('[Kakao] 401 on chunk', i + 1, '- refreshing token...');
			const newTokens = await refreshAccessToken();
			if (newTokens) {
				result = await sendSingleMessage(newTokens.access_token, chunkText);
			}
		}

		if (!result.success) {
			console.error(`[Kakao] Failed at chunk ${i + 1}/${totalChunks}:`, result.error);
			return {
				success: false,
				error: `Failed at part ${i + 1}/${totalChunks}: ${result.error}`,
				sentCount,
				totalChunks
			};
		}

		sentCount++;
		console.log(`[Kakao] Sent chunk ${i + 1}/${totalChunks} (${chunkText.length} chars)`);

		if (i < chunks.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
		}
	}

	console.log(`[Kakao] All ${totalChunks} chunk(s) sent successfully for "${title}"`);
	return { success: true, sentCount, totalChunks };
}
