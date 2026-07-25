import axios from 'axios';
import { env } from '$env/dynamic/private';
import {
	readEnvInt,
	type CallLlmNonStreamingOptions,
	type CreateLlmStreamOptions,
	type LlmMessage,
	type LlmStreamKind
} from './types';

const DEFAULT_STREAM_TIMEOUT_MS = 1_800_000;
const DEFAULT_NON_STREAM_TIMEOUT_MS = 1_800_000;

function omnirouteBaseUrl(): string {
	return env.OMNIROUTE_BASE_URL?.trim() || 'http://localhost:20128/v1';
}

function omnirouteModel(): string {
	return env.OMNIROUTE_MODEL?.trim() || 'auto';
}

function authHeaders(): Record<string, string> {
	const key = env.OMNIROUTE_API_KEY?.trim() || env.LLM_API_KEY?.trim();
	if (!key) return {};
	return {
		Authorization: `Bearer ${key}`,
		'HTTP-Referer': 'http://localhost:5173',
		'X-Title': 'JukimBot'
	};
}

function streamTimeoutMs(explicit?: number): number {
	if (explicit != null && explicit > 0) return explicit;
	return readEnvInt(env.OLLAMA_STREAM_TIMEOUT_MS, DEFAULT_STREAM_TIMEOUT_MS);
}

function nonStreamTimeoutMs(explicit?: number): number {
	if (explicit != null && explicit > 0) return explicit;
	return readEnvInt(env.OLLAMA_NON_STREAM_TIMEOUT_MS, DEFAULT_NON_STREAM_TIMEOUT_MS);
}

function defaultMaxTokens(kind: LlmStreamKind): number {
	return kind === 'synthesis' || kind === 'section'
		? readEnvInt(env.OLLAMA_NUM_PREDICT_SYNTH, 8192)
		: readEnvInt(env.OLLAMA_NUM_PREDICT_STREAM, 4096);
}

export async function createOmnirouteStream(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CreateLlmStreamOptions
) {
	const allMessages: LlmMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];
	const kind = options?.streamKind ?? 'chat';
	const maxTokens = options?.numPredict ?? defaultMaxTokens(kind);

	const body: Record<string, unknown> = {
		model: omnirouteModel(),
		messages: allMessages,
		stream: true
	};
	if (maxTokens > 0) {
		body.max_tokens = maxTokens;
	}

	return axios.post(`${omnirouteBaseUrl()}/chat/completions`, body, {
		responseType: 'stream',
		timeout: streamTimeoutMs(options?.timeoutMs),
		headers: authHeaders()
	});
}

export async function callOmnirouteNonStreaming(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CallLlmNonStreamingOptions
): Promise<string> {
	const allMessages: LlmMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];
	const maxTokens =
		options?.maxTokens ??
		options?.numPredict ??
		readEnvInt(env.OLLAMA_NUM_PREDICT_NONSTREAM, 2048);

	const body: Record<string, unknown> = {
		model: omnirouteModel(),
		messages: allMessages,
		stream: false
	};
	if (maxTokens > 0) {
		body.max_tokens = maxTokens;
	}
	if (options?.temperature != null) {
		body.temperature = options.temperature;
	}

	const response = await axios.post(`${omnirouteBaseUrl()}/chat/completions`, body, {
		timeout: nonStreamTimeoutMs(options?.timeoutMs),
		headers: authHeaders()
	});

	return response.data?.choices?.[0]?.message?.content ?? '';
}

export async function checkOmnirouteHealth(): Promise<boolean> {
	try {
		const response = await axios.get(`${omnirouteBaseUrl()}/models`, {
			timeout: 5000,
			headers: authHeaders()
		});
		return response.status === 200;
	} catch {
		return false;
	}
}
