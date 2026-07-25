import type { ChatPipelinePhase, DeepSearchStep, LlmProvider, SearchResult } from '$lib/types';
import { getLocalCalendarDateYYYYMMDD } from '$lib/utils/helpers';

export interface StreamCallbacks {
	onToken: (token: string) => void;
	onSources: (sources: SearchResult[]) => void;
	onRawAnswer?: (content: string) => void;
	onProgress?: (phase: ChatPipelinePhase, label?: string, detail?: string) => void;
	onDone: () => void;
	onError: (message: string) => void;
}

export interface DeepSearchCallbacks {
	onStep: (step: DeepSearchStep) => void;
	onToken: (token: string) => void;
	onRawAnswer?: (content: string) => void;
	onSynthesisFinal?: (content: string) => void;
	onProgress?: (phase: ChatPipelinePhase, label?: string, detail?: string) => void;
	onDone: () => void;
	onError: (message: string) => void;
}

function handleProgress(
	callbacks: { onProgress?: (phase: ChatPipelinePhase, label?: string, detail?: string) => void },
	data: { phase?: ChatPipelinePhase; label?: string; detail?: string }
): void {
	if (!data.phase || !callbacks.onProgress) return;
	callbacks.onProgress(data.phase, data.label, data.detail);
}

export async function streamChat(
	messages: Array<{ role: string; content: string }>,
	enableSearch: boolean,
	query: string,
	currentDate: string,
	llmProvider: LlmProvider,
	callbacks: StreamCallbacks,
	signal?: AbortSignal
): Promise<void> {
	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages,
				enableSearch,
				query,
				currentDate,
				localeCalendarDate: getLocalCalendarDateYYYYMMDD(),
				llmProvider
			}),
			signal
		});

		if (!response.ok) {
			callbacks.onError(`Server error: ${response.status} ${response.statusText}`);
			return;
		}

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const parts = buffer.split('\n\n');
			buffer = parts.pop() ?? '';

			for (const part of parts) {
				const line = part.trim();
				if (!line.startsWith('data: ')) continue;

				try {
					const data = JSON.parse(line.slice(6));
					switch (data.type) {
						case 'progress':
							handleProgress(callbacks, data);
							break;
						case 'token':
							callbacks.onToken(data.content);
							break;
						case 'sources':
							callbacks.onSources(data.data);
							break;
						case 'raw_answer':
							callbacks.onRawAnswer?.(data.content);
							break;
						case 'done':
							callbacks.onDone();
							break;
						case 'error':
							callbacks.onError(data.message);
							break;
					}
				} catch {
					// skip malformed SSE data
				}
			}
		}

		if (buffer.trim().startsWith('data: ')) {
			try {
				const data = JSON.parse(buffer.trim().slice(6));
				if (data.type === 'done') callbacks.onDone();
				if (data.type === 'error') callbacks.onError(data.message);
			} catch {
				// skip
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error && error.name === 'AbortError') {
			callbacks.onDone();
		} else {
			const msg = error instanceof Error ? error.message : 'Network error';
			callbacks.onError(msg);
		}
	}
}

export async function streamDeepSearch(
	messages: Array<{ role: string; content: string }>,
	query: string,
	currentDate: string,
	llmProvider: LlmProvider,
	callbacks: DeepSearchCallbacks,
	signal?: AbortSignal,
	seedUrls?: string[],
	preset?: string
): Promise<void> {
	try {
		const response = await fetch('/api/deep-search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				messages,
				query,
				currentDate,
				localeCalendarDate: getLocalCalendarDateYYYYMMDD(),
				llmProvider,
				seedUrls: seedUrls ?? [],
				...(preset ? { preset } : {})
			}),
			signal
		});

		if (!response.ok) {
			callbacks.onError(`Server error: ${response.status} ${response.statusText}`);
			return;
		}

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const parts = buffer.split('\n\n');
			buffer = parts.pop() ?? '';

			for (const part of parts) {
				const line = part.trim();
				if (!line.startsWith('data: ')) continue;

				try {
					const data = JSON.parse(line.slice(6));
					switch (data.type) {
						case 'keepalive':
							break;
						case 'progress':
							handleProgress(callbacks, data);
							break;
						case 'start':
							callbacks.onStep({
								type: 'start',
								preset: data.preset,
								message: `${data.refineRounds} verification round(s)`
							});
							break;
						case 'evidence_warning':
							callbacks.onStep({ type: 'evidence_warning', message: data.message });
							break;
						case 'plan':
							callbacks.onStep({
								type: 'plan',
								subQueries: data.subQueries,
								strategy: data.strategy,
								subQuestions: data.subQuestions,
								stopCriteria: data.stopCriteria
							});
							break;
						case 'searching':
							callbacks.onStep({ type: 'searching', query: data.query });
							break;
						case 'web_search':
							callbacks.onStep({
								type: 'web_search',
								round: data.round,
								queries: data.queries,
								pagesFetched: data.pagesFetched,
								reason: data.reason
							});
							break;
						case 'draft':
							callbacks.onStep({ type: 'draft', content: data.content });
							break;
						case 'refine_start':
							callbacks.onStep({
								type: 'refine_start',
								round: data.round,
								maxRounds: data.maxRounds
							});
							break;
						case 'decompose':
							callbacks.onStep({
								type: 'decompose',
								subQuestions: data.subQuestions,
								claims: data.claims
							});
							break;
						case 'verify':
							callbacks.onStep({
								type: 'verify',
								claimResults: data.results,
								confidence: data.confidence
							});
							break;
						case 'refine':
							callbacks.onStep({
								type: 'refine',
								thought: data.thought,
								revisedDraft: data.revisedDraft,
								confidence: data.confidence
							});
							break;
						case 'sources':
							callbacks.onStep({
								type: 'sources',
								sourceResults: data.results,
								query: data.query,
								isUserProvided: data.isUserProvided
							});
							break;
						case 'complete':
							callbacks.onStep({
								type: 'complete',
								stopReason: data.stopReason,
								confidence: data.confidence,
								totalPagesFetched: data.totalPagesFetched
							});
							break;
						case 'synthesis_start':
							callbacks.onStep({ type: 'synthesis_start' });
							break;
						case 'token':
							callbacks.onToken(data.content);
							break;
						case 'raw_answer':
							callbacks.onRawAnswer?.(data.content);
							break;
						case 'synthesis_final':
							callbacks.onSynthesisFinal?.(data.content);
							break;
						case 'done':
							callbacks.onDone();
							break;
						case 'error':
							callbacks.onError(data.message);
							break;
					}
				} catch {
					// skip malformed SSE data
				}
			}
		}

		if (buffer.trim().startsWith('data: ')) {
			try {
				const data = JSON.parse(buffer.trim().slice(6));
				if (data.type === 'done') callbacks.onDone();
				if (data.type === 'error') callbacks.onError(data.message);
				if (data.type === 'synthesis_final') callbacks.onSynthesisFinal?.(data.content);
			} catch {
				// skip
			}
		}
	} catch (error: unknown) {
		if (error instanceof Error && error.name === 'AbortError') {
			callbacks.onDone();
		} else {
			const msg = error instanceof Error ? error.message : 'Network error';
			callbacks.onError(msg);
		}
	}
}
