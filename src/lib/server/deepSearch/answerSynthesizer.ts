import { createOllamaStream, isOllamaTimeoutError } from '../ollama';
import type { OllamaMessage } from '../ollama';

const SYNTHESIZER_SYSTEM_PROMPT = `You are a thorough research assistant. Using the comprehensive research gathered through multiple search iterations, provide a well-structured, accurate, and complete answer to the user's question.

GUIDELINES:
- Base your answer ONLY on the research provided below — do NOT add facts from your training data if they are not in the research
- When referencing a source, cite it as a markdown link using the EXACT URL from the research context: e.g. [Source Title](https://exact-url-from-research.com)
- NEVER invent, guess, or paraphrase URLs — only use URLs that appear verbatim in the research context
- Use markdown formatting for clarity (headers, bullet points, code blocks where appropriate)
- At the very end, add a "## Sources" section listing all referenced URLs as a numbered markdown list: \`1. [Title](URL)\`
- If certain aspects couldn't be fully researched, acknowledge this honestly
- Be comprehensive but concise`;

export async function synthesizeAnswer(
	userQuery: string,
	researchContext: string,
	conversationHistory: OllamaMessage[],
	currentDate: string,
	enqueue: (data: Record<string, unknown>) => void
): Promise<void> {
	const systemPrompt = `${SYNTHESIZER_SYSTEM_PROMPT}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED ===
${researchContext}
=== END RESEARCH ===`;

	const messages: OllamaMessage[] = [
		...conversationHistory,
		{ role: 'user', content: userQuery }
	];

	try {
		const response = await createOllamaStream(messages, systemPrompt);

		await new Promise<void>((resolve, reject) => {
			let buffer = '';

			response.data.on('data', (chunk: Buffer) => {
				buffer += chunk.toString();
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const parsed = JSON.parse(line);
						if (parsed.message?.content) {
							enqueue({ type: 'token', content: parsed.message.content });
						}
						if (parsed.done) {
							enqueue({ type: 'done' });
							resolve();
						}
					} catch {
						// skip malformed lines
					}
				}
			});

			response.data.on('end', () => {
				if (buffer.trim()) {
					try {
						const parsed = JSON.parse(buffer);
						if (parsed.message?.content) {
							enqueue({ type: 'token', content: parsed.message.content });
						}
					} catch {
						// skip
					}
				}
				enqueue({ type: 'done' });
				resolve();
			});

			response.data.on('error', (err: Error) => {
				reject(err);
			});
		});
	} catch (error: unknown) {
		let msg = 'Synthesis failed';
		if (isOllamaTimeoutError(error)) {
			msg = 'Ollama timed out during synthesis. Please try again.';
		} else if (error instanceof Error) {
			msg = error.message;
		}
		enqueue({ type: 'error', message: msg });
	}
}
