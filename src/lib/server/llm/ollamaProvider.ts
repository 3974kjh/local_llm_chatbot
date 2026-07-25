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

function ollamaUrl(): string {
	return env.OLLAMA_URL?.trim() || 'http://localhost:11434';
}

function ollamaModel(): string {
	return env.OLLAMA_MODEL?.trim() || 'llama3.1:8b';
}

function streamTimeoutMs(explicit?: number): number {
	if (explicit != null && explicit > 0) return explicit;
	return readEnvInt(env.OLLAMA_STREAM_TIMEOUT_MS, DEFAULT_STREAM_TIMEOUT_MS);
}

function nonStreamTimeoutMs(explicit?: number): number {
	if (explicit != null && explicit > 0) return explicit;
	return readEnvInt(env.OLLAMA_NON_STREAM_TIMEOUT_MS, DEFAULT_NON_STREAM_TIMEOUT_MS);
}

function defaultNumPredict(kind: LlmStreamKind): number {
	return kind === 'synthesis' || kind === 'section'
		? readEnvInt(env.OLLAMA_NUM_PREDICT_SYNTH, 8192)
		: readEnvInt(env.OLLAMA_NUM_PREDICT_STREAM, 4096);
}

export async function createOllamaStream(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CreateLlmStreamOptions
) {
	const allMessages: LlmMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];
	const kind = options?.streamKind ?? 'chat';
	const numPredict = options?.numPredict ?? defaultNumPredict(kind);

	const body: Record<string, unknown> = {
		model: ollamaModel(),
		messages: allMessages,
		stream: true
	};
	if (numPredict > 0) {
		body.options = { num_predict: numPredict };
	}

	return axios.post(`${ollamaUrl()}/api/chat`, body, {
		responseType: 'stream',
		timeout: streamTimeoutMs(options?.timeoutMs)
	});
}

export async function callOllamaNonStreaming(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CallLlmNonStreamingOptions
): Promise<string> {
	const allMessages: LlmMessage[] = [{ role: 'system', content: systemPrompt }, ...messages];
	const numPredict =
		options?.maxTokens ??
		options?.numPredict ??
		readEnvInt(env.OLLAMA_NUM_PREDICT_NONSTREAM, 2048);

	const body: Record<string, unknown> = {
		model: ollamaModel(),
		messages: allMessages,
		stream: false
	};
	if (numPredict > 0) {
		body.options = {
			num_predict: numPredict,
			...(options?.temperature != null ? { temperature: options.temperature } : {})
		};
	}

	const response = await axios.post(`${ollamaUrl()}/api/chat`, body, {
		timeout: nonStreamTimeoutMs(options?.timeoutMs)
	});

	return response.data?.message?.content ?? '';
}

export async function checkOllamaHealth(): Promise<boolean> {
	try {
		const response = await axios.get(`${ollamaUrl()}/api/tags`, { timeout: 5000 });
		return response.status === 200;
	} catch {
		return false;
	}
}
