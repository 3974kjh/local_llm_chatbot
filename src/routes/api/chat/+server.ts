import type { RequestHandler } from './$types';
import { createOllamaStream, isOllamaTimeoutError } from '$lib/server/ollama';
import {
	CHAT_NO_SEARCH_KO,
	RESPONSE_LANGUAGE_KO,
	WEB_FIRST_GROUNDING
} from '$lib/server/promptLocale';
import { resolveSearchCalendarDate } from '$lib/server/searchDate';
import { searchWeb, formatSearchContext } from '$lib/server/search';
import { fetchUrlContent } from '$lib/server/scraper';

export const POST: RequestHandler = async ({ request }) => {
	const { messages, enableSearch, query, currentDate, localeCalendarDate } = await request.json();

	const encoder = new TextEncoder();
	let searchResults: { title: string; url: string; snippet: string }[] = [];
	let searchContext = '';
	let detailContext = '';

	if (enableSearch && query) {
		try {
			const calendarDate = resolveSearchCalendarDate(localeCalendarDate, currentDate);
			const searchQuery = `${query} ${calendarDate}`;
			console.log(`[Chat] Web search query: "${searchQuery}" (calendar ${calendarDate})`);

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

	const dateInfo =
		currentDate ||
		`Today is ${resolveSearchCalendarDate(localeCalendarDate, currentDate)} (local calendar).`;

	const conversationContext = `You are a helpful AI assistant named JukimBot. You are having an ongoing conversation with the user. Pay close attention to the entire conversation history provided - refer back to previous questions and answers to maintain context and coherence. If the user asks a follow-up question, relate your answer to what was discussed before.\n\n**Current Date/Time:** ${dateInfo}\nAlways be aware of today's date when answering questions about current events.

${RESPONSE_LANGUAGE_KO}`;

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

${WEB_FIRST_GROUNDING}

아래 웹 검색 스니펫·상세 페이지는 질의 시점에 가져온 자료다. 수치·날짜·뉴스는 이 블록을 최우선 근거로 삼는다. 검색 스니펫이 비어 있거나 근거가 부족하면 한국어로 근거 부족을 말한다.
- 인용 시 출처를 자연스럽게 밝힌다.
- 검색 자료와 학습 지식이 충돌하면 검색 자료를 따른다.
- 증시·지수·환율: 스니펫·상세 본문에 나온 숫자·날짜만 인용하고, 장·기준일이 있으면 명시한다. 출처 간 수치가 다르면 짧게 불일치를 알린다.
${searchSection}`;
	} else {
		systemPrompt = `${conversationContext}

${CHAT_NO_SEARCH_KO}

마크다운으로 가독성 있게 정리해도 된다.`;
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
				const response = await createOllamaStream(messages, systemPrompt, { streamKind: 'chat' });

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

				if (isOllamaTimeoutError(error)) {
					errorMsg =
						'Ollama 응답이 지연되어 타임아웃되었습니다. 모델이 로딩 중이거나 부하가 크면 발생할 수 있습니다. 잠시 후 다시 시도해 주세요.';
				} else if (error && typeof error === 'object' && 'code' in error) {
					if ((error as { code?: string }).code === 'ECONNREFUSED') {
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
