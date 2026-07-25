import type { RequestHandler } from './$types';
import { getDepthConfig, resolveAnswerDepth } from '$lib/server/answerDepth';
import { enqueueProgress } from '$lib/server/chatProgress';
import {
	createLlmStream,
	getLlmConnectionErrorMessage,
	isLlmTimeoutError,
	normalizeLlmProvider,
	pipeLlmChatStream
} from '$lib/server/llm';
import {
	CHAT_NO_SEARCH_KO,
	RESPONSE_LANGUAGE_KO,
	WEB_FIRST_GROUNDING
} from '$lib/server/promptLocale';
import { resolveSearchCalendarDate } from '$lib/server/searchDate';
import { searchWeb, formatSearchContext } from '$lib/server/search';
import { fetchUrlContent } from '$lib/server/scraper';

function formatWebRawAnswer(
	results: { title: string; url: string; snippet: string }[],
	detail: string
): string {
	const lines: string[] = [];
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		lines.push(`**${i + 1}. [${r.title}](${r.url})**`);
		if (r.snippet) lines.push(`> ${r.snippet}`);
		lines.push('');
	}
	if (detail) {
		const detailParts = detail
			.split(/\[Detailed Source \d+: /)
			.filter(Boolean)
			.slice(0, 3);
		for (const part of detailParts) {
			const urlEnd = part.indexOf(']');
			if (urlEnd === -1) continue;
			const url = part.slice(0, urlEnd).trim();
			const body = part.slice(urlEnd + 2, urlEnd + 2 + 800).trim();
			if (body) {
				lines.push(`**상세 내용 ([${url}](${url}))**`);
				lines.push('```');
				lines.push(body);
				lines.push('```');
				lines.push('');
			}
		}
	}
	return lines.join('\n').trim();
}

export const POST: RequestHandler = async ({ request }) => {
	const { messages, enableSearch, query, currentDate, localeCalendarDate, llmProvider } =
		await request.json();
	const provider = normalizeLlmProvider(llmProvider);
	const queryText = typeof query === 'string' ? query : '';
	const answerDepth = resolveAnswerDepth(queryText);
	const depthConfig = getDepthConfig(answerDepth);

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (data: Record<string, unknown>) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// controller already closed
				}
			};

			let searchResults: { title: string; url: string; snippet: string }[] = [];
			let searchContext = '';
			let detailContext = '';

			enqueueProgress(enqueue, { phase: 'prepare', label: '질문 분석 중' });

			if (enableSearch && queryText) {
				try {
					const calendarDate = resolveSearchCalendarDate(localeCalendarDate, currentDate);
					const searchQuery = `${queryText} ${calendarDate}`;
					console.log(`[Chat] Web search query: "${searchQuery}" (calendar ${calendarDate})`);

					enqueueProgress(enqueue, { phase: 'collect', label: '웹 검색 중' });

					searchResults = await searchWeb(searchQuery);
					searchContext = formatSearchContext(searchResults);
					console.log(`[Chat] Search returned ${searchResults.length} results`);

					enqueueProgress(enqueue, {
						phase: 'collect',
						label: '웹 검색 완료',
						detail: `${searchResults.length}개 결과`
					});

					if (searchResults.length > 0) {
						const topUrls = searchResults.slice(0, depthConfig.chatUrlCount).map((r) => r.url);
						const totalUrls = topUrls.length;
						let fetchedCount = 0;

						for (const url of topUrls) {
							enqueueProgress(enqueue, {
								phase: 'collect',
								label: '페이지 읽는 중',
								detail: `${fetchedCount}/${totalUrls} 페이지`
							});

							try {
								const content = await fetchUrlContent(url);
								if (content.length > 100) {
									fetchedCount++;
									const chunk = `[Detailed Source ${fetchedCount}: ${url}]\n${content.slice(
										0,
										depthConfig.chatPageChars
									)}`;
									detailContext = detailContext ? `${detailContext}\n\n${chunk}` : chunk;
								}
							} catch {
								// skip failed URL
							}
						}

						if (fetchedCount > 0) {
							console.log(
								`[Chat] Fetched detail from ${fetchedCount} URLs (depth=${answerDepth}, ${detailContext.length} chars)`
							);
						}
					}
				} catch (e) {
					console.error('[Chat] Search failed:', e);
				}

				enqueueProgress(enqueue, { phase: 'analyze', label: '출처 정리 중' });
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

${depthConfig.depthPrompt}

아래 웹 검색 스니펫·상세 페이지는 질의 시점에 가져온 자료다. 수치·날짜·뉴스는 이 블록을 최우선 근거로 삼는다. 검색 스니펫이 비어 있거나 근거가 부족하면 한국어로 근거 부족을 말한다.
- 제공된 모든 스니펫·상세 본문을 종합해 빠진 출처 없이 서술한다.
- 인용 시 출처를 자연스럽게 밝힌다.
- 검색 자료와 학습 지식이 충돌하면 검색 자료를 따른다.
- 증시·지수·환율: 스니펫·상세 본문에 나온 숫자·날짜만 인용하고, 장·기준일이 있으면 명시한다. 출처 간 수치가 다르면 짧게 불일치를 알린다.
${searchSection}`;
			} else {
				systemPrompt = `${conversationContext}

${CHAT_NO_SEARCH_KO}

${depthConfig.depthPrompt}

마크다운으로 가독성 있게 정리해도 된다.`;
			}

			if (searchResults.length > 0) {
				enqueue({ type: 'sources', data: searchResults });
				const rawMarkdown = formatWebRawAnswer(searchResults, detailContext);
				if (rawMarkdown) {
					enqueue({ type: 'raw_answer', content: rawMarkdown });
				}
			}

			enqueueProgress(enqueue, { phase: 'write', label: '답변 작성 중' });

			try {
				const response = await createLlmStream(messages, systemPrompt, {
					provider,
					streamKind: 'chat',
					numPredict: depthConfig.chatNumPredict
				});
				await pipeLlmChatStream(response, provider, enqueue, true);
				enqueueProgress(enqueue, { phase: 'complete', label: '완료' });
				try {
					controller.close();
				} catch {
					// already closed
				}
			} catch (error: unknown) {
				let errorMsg = getLlmConnectionErrorMessage(provider);

				if (isLlmTimeoutError(error)) {
					errorMsg =
						'LLM 응답이 지연되어 타임아웃되었습니다. 모델이 로딩 중이거나 부하가 크면 발생할 수 있습니다. 잠시 후 다시 시도해 주세요.';
				} else if (error && typeof error === 'object' && 'code' in error) {
					if ((error as { code?: string }).code === 'ECONNREFUSED') {
						errorMsg = getLlmConnectionErrorMessage(provider);
					}
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
