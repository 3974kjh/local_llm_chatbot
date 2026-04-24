import type { DeepSearchStep, SearchResult } from '$lib/types';
import { getLocalCalendarDateYYYYMMDD } from '$lib/utils/helpers';

export interface StreamCallbacks {
	onToken: (token: string) => void;
	onSources: (sources: SearchResult[]) => void;
	onDone: () => void;
	onError: (message: string) => void;
}

export interface DeepSearchCallbacks {
	onStep: (step: DeepSearchStep) => void;
	onToken: (token: string) => void;
	onDone: () => void;
	onError: (message: string) => void;
}

export async function streamChat(
	messages: Array<{ role: string; content: string }>,
	enableSearch: boolean,
	query: string,
	currentDate: string,
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
				localeCalendarDate: getLocalCalendarDateYYYYMMDD()
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
						case 'token':
							callbacks.onToken(data.content);
							break;
						case 'sources':
							callbacks.onSources(data.data);
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
	callbacks: DeepSearchCallbacks,
	signal?: AbortSignal,
	seedUrls?: string[]
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
				seedUrls: seedUrls ?? []
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
						case 'plan':
							callbacks.onStep({ type: 'plan', subQueries: data.subQueries, strategy: data.strategy, subQuestions: data.subQuestions, stopCriteria: data.stopCriteria });
							break;
						case 'iteration_start':
							callbacks.onStep({ type: 'iteration_start', iteration: data.iteration, maxIterations: data.maxIterations, totalUrlsFetched: data.totalUrlsFetched });
							break;
						case 'searching':
							callbacks.onStep({ type: 'searching', query: data.query });
							break;
						case 'sources':
							callbacks.onStep({ type: 'sources', results: data.results, query: data.query });
							break;
						case 'evaluation':
							callbacks.onStep({ type: 'evaluation', thought: data.thought, needsMore: data.needsMore, refinedQueries: data.refinedQueries, confidence: data.confidence, resolvedItems: data.resolvedItems, unresolvedItems: data.unresolvedItems });
							break;
						case 'complete':
							callbacks.onStep({ type: 'complete', stopReason: data.stopReason, confidence: data.confidence });
							break;
						case 'synthesis_start':
							callbacks.onStep({ type: 'synthesis_start' });
							break;
						case 'token':
							callbacks.onToken(data.content);
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
