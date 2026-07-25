import type { AxiosResponse } from 'axios';
import {
	callOllamaNonStreaming as callLocalNonStreaming,
	checkOllamaHealth as checkLocalHealth,
	createOllamaStream as createLocalStream
} from './ollamaProvider';
import {
	callOmnirouteNonStreaming,
	checkOmnirouteHealth,
	createOmnirouteStream
} from './omnirouteProvider';
import { pipeLlmChatStream } from './streamParsers';
import {
	getLlmConnectionErrorMessage,
	getLlmModelLabel,
	getLlmProviderLabel,
	buildLlmFallbackNotice,
	normalizeLlmProvider,
	resolveDefaultLlmProvider,
	type CallLlmNonStreamingOptions,
	type CreateLlmStreamOptions,
	type LlmMessage,
	type LlmProvider,
	type LlmStreamKind
} from './types';

export type { LlmMessage, LlmProvider, LlmStreamKind, CreateLlmStreamOptions, CallLlmNonStreamingOptions };
export {
	normalizeLlmProvider,
	resolveDefaultLlmProvider,
	getLlmConnectionErrorMessage,
	getLlmModelLabel,
	getLlmProviderLabel,
	buildLlmFallbackNotice
};
export { pipeLlmChatStream };

/** @deprecated Use LlmMessage */
export type OllamaMessage = LlmMessage;

/** @deprecated Use LlmStreamKind */
export type OllamaStreamKind = LlmStreamKind;

function resolveProvider(options?: { provider?: LlmProvider }): LlmProvider {
	return options?.provider ?? resolveDefaultLlmProvider();
}

export async function createLlmStream(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CreateLlmStreamOptions
): Promise<AxiosResponse> {
	const provider = resolveProvider(options);
	if (provider === 'omniroute') {
		return createOmnirouteStream(messages, systemPrompt, options);
	}
	return createLocalStream(messages, systemPrompt, options);
}

/** @deprecated Use createLlmStream */
export const createOllamaStream = createLlmStream;

export async function callLlmNonStreaming(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CallLlmNonStreamingOptions
): Promise<string> {
	const provider = resolveProvider(options);
	if (provider === 'omniroute') {
		return callOmnirouteNonStreaming(messages, systemPrompt, options);
	}
	return callLocalNonStreaming(messages, systemPrompt, options);
}

/** @deprecated Use callLlmNonStreaming */
export const callOllamaNonStreaming = callLlmNonStreaming;

export function isLlmTimeoutError(error: unknown): boolean {
	if (error && typeof error === 'object') {
		if ('code' in error && (error as { code?: string }).code === 'ECONNABORTED') return true;
		if (error instanceof Error && /timeout|timed out/i.test(error.message)) return true;
	}
	return false;
}

const FALLBACK_HTTP_STATUSES = new Set([401, 402, 403, 429, 500, 502, 503]);
const FALLBACK_MESSAGE_PATTERN =
	/quota|credit|token|rate[\s-]?limit|insufficient|exceeded|billing|unauthorized|forbidden/i;

function getAxiosStatus(error: unknown): number | undefined {
	if (error && typeof error === 'object' && 'response' in error) {
		const status = (error as { response?: { status?: number } }).response?.status;
		return typeof status === 'number' ? status : undefined;
	}
	return undefined;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return '';
}

export function isLlmFallbackEligibleError(error: unknown): boolean {
	if (isLlmTimeoutError(error)) return true;

	if (error && typeof error === 'object' && 'code' in error) {
		const code = (error as { code?: string }).code;
		if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ERR_NETWORK') {
			return true;
		}
	}

	const status = getAxiosStatus(error);
	if (status != null && FALLBACK_HTTP_STATUSES.has(status)) return true;

	const message = getErrorMessage(error);
	if (FALLBACK_MESSAGE_PATTERN.test(message)) return true;

	return false;
}

export function isLlmEmptyResponse(text: string): boolean {
	return !text.trim();
}

export interface LlmNonStreamingResult {
	text: string;
	usedFallback: boolean;
	primaryProvider: LlmProvider;
}

async function callLlmNonStreamingWithRetry(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CallLlmNonStreamingOptions
): Promise<string> {
	try {
		return await callLlmNonStreaming(messages, systemPrompt, options);
	} catch (firstError: unknown) {
		if (isLlmTimeoutError(firstError)) {
			console.warn('[LLM] Timeout, retrying once...');
			return await callLlmNonStreaming(messages, systemPrompt, options);
		}
		throw firstError;
	}
}

export async function callLlmNonStreamingWithLocalFallback(
	messages: LlmMessage[],
	systemPrompt: string,
	options?: CallLlmNonStreamingOptions
): Promise<LlmNonStreamingResult> {
	const primaryProvider = resolveProvider(options);

	if (primaryProvider === 'local') {
		const text = await callLlmNonStreamingWithRetry(messages, systemPrompt, options);
		return { text, usedFallback: false, primaryProvider };
	}

	try {
		const text = await callLlmNonStreamingWithRetry(messages, systemPrompt, options);
		if (!isLlmEmptyResponse(text)) {
			return { text, usedFallback: false, primaryProvider };
		}
		console.warn(`[LLM] Empty response from ${primaryProvider}, falling back to local`);
	} catch (error: unknown) {
		if (!isLlmFallbackEligibleError(error)) throw error;
		console.warn(
			`[LLM] ${primaryProvider} failed (${getErrorMessage(error) || 'unknown error'}), falling back to local`
		);
	}

	const text = await callLlmNonStreamingWithRetry(messages, systemPrompt, {
		...options,
		provider: 'local'
	});
	return { text, usedFallback: true, primaryProvider };
}

/** @deprecated Use isLlmTimeoutError */
export const isOllamaTimeoutError = isLlmTimeoutError;

export async function checkLlmHealth(provider: LlmProvider): Promise<boolean> {
	if (provider === 'omniroute') return checkOmnirouteHealth();
	return checkLocalHealth();
}

/** @deprecated Use checkLlmHealth */
export async function checkOllamaHealth(): Promise<boolean> {
	return checkLlmHealth('local');
}
