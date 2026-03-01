import axios from 'axios';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'llama3.1:8b';

/** 스트리밍 채팅: 첫 응답·토큰이 늦어도 타임아웃 방지 (10분) */
const STREAM_TIMEOUT_MS = 600_000;

export interface OllamaMessage {
	role: string;
	content: string;
}

export async function createOllamaStream(messages: OllamaMessage[], systemPrompt: string) {
	const allMessages: OllamaMessage[] = [
		{ role: 'system', content: systemPrompt },
		...messages
	];

	return axios.post(
		`${OLLAMA_URL}/api/chat`,
		{
			model: MODEL,
			messages: allMessages,
			stream: true
		},
		{
			responseType: 'stream',
			timeout: STREAM_TIMEOUT_MS
		}
	);
}

/** Ollama 타임아웃 여부 (axios ECONNABORTED / message에 timeout 포함) */
export function isOllamaTimeoutError(error: unknown): boolean {
	if (error && typeof error === 'object') {
		if ('code' in error && (error as { code?: string }).code === 'ECONNABORTED') return true;
		if (error instanceof Error && /timeout|timed out/i.test(error.message)) return true;
	}
	return false;
}

export async function checkOllamaHealth(): Promise<boolean> {
	try {
		const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
		return response.status === 200;
	} catch {
		return false;
	}
}
