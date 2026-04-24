import axios from 'axios';
import { env } from '$env/dynamic/private';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'llama3.1:8b';

/** 스트리밍 Ollama: 긴 딥서치 합성·채팅용 (기본 30분, env로 조절) */
const DEFAULT_STREAM_TIMEOUT_MS = 1_800_000;

function streamTimeoutMs(explicit?: number): number {
	if (explicit != null && explicit > 0) return explicit;
	return readEnvInt(env.OLLAMA_STREAM_TIMEOUT_MS, DEFAULT_STREAM_TIMEOUT_MS);
}

export interface OllamaMessage {
	role: string;
	content: string;
}

function readEnvInt(raw: string | undefined, fallback: number): number {
	if (raw == null || !String(raw).trim()) return fallback;
	const n = parseInt(String(raw), 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type OllamaStreamKind = 'chat' | 'synthesis' | 'section';

export interface CreateOllamaStreamOptions {
	/** Drives default num_predict from env when numPredict is unset. */
	streamKind?: OllamaStreamKind;
	/** If set, overrides env-based num_predict for this request. */
	numPredict?: number;
	/** Axios timeout for this stream (ms). Overrides OLLAMA_STREAM_TIMEOUT_MS. */
	timeoutMs?: number;
}

export async function createOllamaStream(
	messages: OllamaMessage[],
	systemPrompt: string,
	options?: CreateOllamaStreamOptions
) {
	const allMessages: OllamaMessage[] = [
		{ role: 'system', content: systemPrompt },
		...messages
	];

	const kind = options?.streamKind ?? 'chat';
	const defaultPredict =
		kind === 'synthesis' || kind === 'section'
			? readEnvInt(env.OLLAMA_NUM_PREDICT_SYNTH, 8192)
			: readEnvInt(env.OLLAMA_NUM_PREDICT_STREAM, 4096);
	const numPredict = options?.numPredict ?? defaultPredict;

	const body: Record<string, unknown> = {
		model: MODEL,
		messages: allMessages,
		stream: true
	};
	if (numPredict > 0) {
		body.options = { num_predict: numPredict };
	}

	return axios.post(`${OLLAMA_URL}/api/chat`, body, {
		responseType: 'stream',
		timeout: streamTimeoutMs(options?.timeoutMs)
	});
}

/** Ollama 타임아웃 여부 (axios ECONNABORTED / message에 timeout 포함) */
export function isOllamaTimeoutError(error: unknown): boolean {
	if (error && typeof error === 'object') {
		if ('code' in error && (error as { code?: string }).code === 'ECONNABORTED') return true;
		if (error instanceof Error && /timeout|timed out/i.test(error.message)) return true;
	}
	return false;
}

/** 논스트리밍: 플래너/평가자/아웃라인 등 (기본 30분 — 딥서치 다라운드 대비, env로 조절) */
const DEFAULT_NON_STREAM_TIMEOUT_MS = 1_800_000;

function nonStreamTimeoutMs(explicit?: number): number {
	if (explicit != null && explicit > 0) return explicit;
	return readEnvInt(env.OLLAMA_NON_STREAM_TIMEOUT_MS, DEFAULT_NON_STREAM_TIMEOUT_MS);
}

export interface CallOllamaNonStreamingOptions {
	/** Max tokens to generate (planner/evaluator/outline). */
	numPredict?: number;
	/** Axios timeout for this request (ms). Overrides env default. */
	timeoutMs?: number;
}

export async function callOllamaNonStreaming(
	messages: OllamaMessage[],
	systemPrompt: string,
	options?: CallOllamaNonStreamingOptions
): Promise<string> {
	const allMessages: OllamaMessage[] = [
		{ role: 'system', content: systemPrompt },
		...messages
	];

	const numPredict =
		options?.numPredict ?? readEnvInt(env.OLLAMA_NUM_PREDICT_NONSTREAM, 2048);

	const body: Record<string, unknown> = {
		model: MODEL,
		messages: allMessages,
		stream: false
	};
	if (numPredict > 0) {
		body.options = { num_predict: numPredict };
	}

	const response = await axios.post(`${OLLAMA_URL}/api/chat`, body, {
		timeout: nonStreamTimeoutMs(options?.timeoutMs)
	});

	return response.data?.message?.content ?? '';
}

export async function checkOllamaHealth(): Promise<boolean> {
	try {
		const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
		return response.status === 200;
	} catch {
		return false;
	}
}
