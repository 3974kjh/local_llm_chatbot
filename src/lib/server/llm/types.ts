import { env } from '$env/dynamic/private';

export type LlmProvider = 'local' | 'omniroute';

export type LlmStreamKind = 'chat' | 'synthesis' | 'section';

export interface LlmMessage {
	role: string;
	content: string;
}

export interface CreateLlmStreamOptions {
	provider?: LlmProvider;
	streamKind?: LlmStreamKind;
	numPredict?: number;
	timeoutMs?: number;
}

export interface CallLlmNonStreamingOptions {
	provider?: LlmProvider;
	numPredict?: number;
	maxTokens?: number;
	temperature?: number;
	timeoutMs?: number;
}

export function readEnvInt(raw: string | undefined, fallback: number): number {
	if (raw == null || !String(raw).trim()) return fallback;
	const n = parseInt(String(raw), 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function normalizeLlmProvider(raw: unknown): LlmProvider {
	return raw === 'omniroute' ? 'omniroute' : 'local';
}

export function resolveDefaultLlmProvider(): LlmProvider {
	const raw = env.LLM_DEFAULT_PROVIDER?.trim().toLowerCase();
	return raw === 'omniroute' ? 'omniroute' : 'local';
}

export function getLlmModelLabel(provider: LlmProvider): string {
	return provider === 'omniroute'
		? env.OMNIROUTE_MODEL?.trim() || 'openrouter/free'
		: env.OLLAMA_MODEL?.trim() || 'llama3.1:8b';
}

export function getLlmProviderLabel(provider: LlmProvider): string {
	return provider === 'omniroute' ? 'OpenRouter' : 'Local';
}

export function getLlmConnectionErrorMessage(provider: LlmProvider): string {
	if (provider === 'omniroute') {
		return 'OpenRouter에 연결할 수 없습니다. API 키와 네트워크 연결을 확인하세요.';
	}
	return 'Ollama가 실행 중인지 확인하세요 (ollama serve). llama3.1:8b 모델이 pull 되어 있어야 합니다.';
}

export function buildLlmFallbackNotice(primaryProvider: LlmProvider): string {
	const label = getLlmProviderLabel(primaryProvider);
	return `[${label} 실패 → Local 모델로 응답]\n\n`;
}
