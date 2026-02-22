import type { SearchResult } from '$lib/types';

export interface StreamCallbacks {
	onToken: (token: string) => void;
	onSources: (sources: SearchResult[]) => void;
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
			body: JSON.stringify({ messages, enableSearch, query, currentDate }),
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
