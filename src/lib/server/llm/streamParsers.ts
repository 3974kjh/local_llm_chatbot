import type { AxiosResponse } from 'axios';
import type { LlmProvider } from './types';

type EnqueueFn = (data: Record<string, unknown>) => void;

async function pipeOllamaStream(
	response: AxiosResponse,
	enqueue: EnqueueFn,
	sendClientDone: boolean,
	onToken?: (token: string) => void
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		let buffer = '';
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			if (sendClientDone) enqueue({ type: 'done' });
			resolve();
		};

		const handleParsed = (parsed: { message?: { content?: string }; done?: boolean }) => {
			if (parsed.message?.content) {
				onToken?.(parsed.message.content);
				enqueue({ type: 'token', content: parsed.message.content });
			}
			if (parsed.done) finish();
		};

		response.data.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					handleParsed(JSON.parse(line));
				} catch {
					// skip malformed lines
				}
			}
		});

		response.data.on('end', () => {
			if (buffer.trim()) {
				try {
					handleParsed(JSON.parse(buffer));
				} catch {
					// skip
				}
			}
			finish();
		});

		response.data.on('error', (err: Error) => reject(err));
	});
}

async function pipeOpenAiStream(
	response: AxiosResponse,
	enqueue: EnqueueFn,
	sendClientDone: boolean,
	onToken?: (token: string) => void
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		let buffer = '';
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			if (sendClientDone) enqueue({ type: 'done' });
			resolve();
		};

		const handleLine = (line: string) => {
			const trimmed = line.trim();
			if (!trimmed.startsWith('data:')) return;
			const payload = trimmed.slice(5).trim();
			if (!payload || payload === '[DONE]') {
				finish();
				return;
			}
			try {
				const parsed = JSON.parse(payload) as {
					choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
				};
				const token = parsed.choices?.[0]?.delta?.content;
				if (token) {
					onToken?.(token);
					enqueue({ type: 'token', content: token });
				}
				const finishReason = parsed.choices?.[0]?.finish_reason;
				if (finishReason) finish();
			} catch {
				// skip malformed SSE chunks
			}
		};

		response.data.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) handleLine(line);
		});

		response.data.on('end', () => {
			if (buffer.trim()) {
				for (const line of buffer.split('\n')) handleLine(line);
			}
			finish();
		});

		response.data.on('error', (err: Error) => reject(err));
	});
}

export async function pipeLlmChatStream(
	response: AxiosResponse,
	provider: LlmProvider,
	enqueue: EnqueueFn,
	sendClientDone: boolean,
	onToken?: (token: string) => void
): Promise<void> {
	if (provider === 'omniroute') {
		return pipeOpenAiStream(response, enqueue, sendClientDone, onToken);
	}
	return pipeOllamaStream(response, enqueue, sendClientDone, onToken);
}
