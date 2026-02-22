import type { RequestHandler } from './$types';
import { createOllamaStream } from '$lib/server/ollama';
import { searchWeb, formatSearchContext } from '$lib/server/search';
import { fetchUrlContent } from '$lib/server/scraper';

export const POST: RequestHandler = async ({ request }) => {
	const { messages, enableSearch, query, currentDate } = await request.json();

	const encoder = new TextEncoder();
	let searchResults: { title: string; url: string; snippet: string }[] = [];
	let searchContext = '';
	let detailContext = '';

	if (enableSearch && query) {
		try {
			const today = new Date().toISOString().split('T')[0];
			const searchQuery = `${query} ${today}`;
			console.log(`[Chat] Web search query: "${searchQuery}"`);

			searchResults = await searchWeb(searchQuery);
			searchContext = formatSearchContext(searchResults);
			console.log(`[Chat] Search returned ${searchResults.length} results`);

			if (searchResults.length > 0) {
				const topUrls = searchResults.slice(0, 3).map((r) => r.url);
				const fetchResults = await Promise.allSettled(
					topUrls.map(async (url) => {
						try {
							const content = await fetchUrlContent(url);
							return { url, content };
						} catch {
							return { url, content: '' };
						}
					})
				);

				const details = fetchResults
					.filter(
						(r): r is PromiseFulfilledResult<{ url: string; content: string }> =>
							r.status === 'fulfilled' && r.value.content.length > 100
					)
					.map((r) => r.value);

				if (details.length > 0) {
					detailContext = details
						.map(
							(d, i) =>
								`[Detailed Source ${i + 1}: ${d.url}]\n${d.content.slice(0, 5000)}`
						)
						.join('\n\n');
					console.log(
						`[Chat] Fetched detail from ${details.length} URLs (${detailContext.length} chars)`
					);
				}
			}
		} catch (e) {
			console.error('[Chat] Search failed:', e);
		}
	}

	const dateInfo = currentDate || `Today is ${new Date().toISOString().split('T')[0]}.`;

	const conversationContext = `You are a helpful AI assistant named JukimBot. You are having an ongoing conversation with the user. Pay close attention to the entire conversation history provided - refer back to previous questions and answers to maintain context and coherence. If the user asks a follow-up question, relate your answer to what was discussed before.\n\n**Current Date/Time:** ${dateInfo}\nAlways be aware of today's date when answering questions about current events.`;

	let systemPrompt: string;
	if (searchContext || detailContext) {
		let searchSection = '';
		if (searchContext) {
			searchSection += `\n\n=== Web Search Results ===\n${searchContext}`;
		}
		if (detailContext) {
			searchSection += `\n\n=== Detailed Page Content (from search result URLs) ===\n${detailContext}`;
		}

		systemPrompt = `${conversationContext}

IMPORTANT: You have access to REAL-TIME web search results and detailed page content from today's internet. These contain the LATEST, most up-to-date information available right now.
- ALWAYS prioritize information from the search results and detailed content over your training data.
- Your training data may be outdated. The search results below are from TODAY and are more reliable for current events, prices, news, and recent developments.
- When answering, base your response primarily on the provided search data.
- Cite sources naturally when referencing specific information.
- If the search results contradict your training data, trust the search results.
${searchSection}`;
	} else {
		systemPrompt = `${conversationContext}\n\nProvide clear, accurate, and well-structured answers. Use markdown formatting when appropriate for better readability. Note: Web search is not available for this query, so your response is based on your training data which may not reflect the very latest information. Let the user know if the topic might require more current data.`;
	}

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (data: Record<string, unknown>) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};

			if (searchResults.length > 0) {
				enqueue({ type: 'sources', data: searchResults });
			}

			try {
				const response = await createOllamaStream(messages, systemPrompt);

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
							}
						} catch {
							// skip malformed JSON lines
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
							if (parsed.done) {
								enqueue({ type: 'done' });
							}
						} catch {
							// skip
						}
					}
					try {
						controller.close();
					} catch {
						// already closed
					}
				});

				response.data.on('error', (err: Error) => {
					enqueue({ type: 'error', message: err.message });
					try {
						controller.close();
					} catch {
						// already closed
					}
				});
			} catch (error: unknown) {
				let errorMsg = 'Failed to connect to Ollama';

				if (error && typeof error === 'object' && 'code' in error) {
					if (error.code === 'ECONNREFUSED') {
						errorMsg =
							'Ollama is not running. Please start Ollama with "ollama serve" and ensure the llama3.1:8b model is pulled.';
					}
				} else if (
					error &&
					typeof error === 'object' &&
					'response' in error &&
					(error as { response?: { status?: number } }).response?.status === 404
				) {
					errorMsg =
						'Model llama3.1:8b not found. Please pull it with "ollama pull llama3.1:8b"';
				} else if (error instanceof Error) {
					errorMsg = error.message;
				}

				enqueue({ type: 'error', message: errorMsg });
				try {
					controller.close();
				} catch {
					// already closed
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
