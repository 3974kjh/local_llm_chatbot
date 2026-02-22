import axios from 'axios';
import { fetchMultipleUrls, fetchUrlContent } from './scraper';
import { searchWeb, formatSearchContext } from './search';
import { sendMessageChunked, isConnected as isKakaoConnected } from './kakao';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'llama3.1:8b';

interface ScheduledTask {
	id: string;
	title: string;
	autoTimeSetting: number;
	autoApplyText: string;
	autoReferUrl: string[];
	enableWebSearch: boolean;
	timer: ReturnType<typeof setInterval>;
	lastResult: string | null;
	lastExecutedAt: string | null;
	isRunning: boolean;
	executionCount: number;
}

const activeTasks = new Map<string, ScheduledTask>();

console.log('[Scheduler] Module loaded/reloaded - activeTasks is fresh (empty)');

export async function executeBundle(
	title: string,
	autoApplyText: string,
	autoReferUrl: string[],
	enableWebSearch = false
): Promise<{ researchResultText: string; success: boolean; error?: string }> {
	try {
		console.log(
			`[Scheduler] Executing bundle "${title}" with ${autoReferUrl.length} URLs, webSearch=${enableWebSearch}`
		);

		const urlResults = await fetchMultipleUrls(autoReferUrl);

		const successfulContents = urlResults.filter((r) => r.content && !r.error);
		const failedUrls = urlResults.filter((r) => r.error);

		if (failedUrls.length > 0) {
			console.warn(
				`[Scheduler] ${failedUrls.length} URL(s) failed:`,
				failedUrls.map((f) => `${f.url}: ${f.error}`)
			);
		}

		let webSearchContext = '';
		let webSearchDetailContext = '';

		if (enableWebSearch) {
			const today = new Date().toISOString().split('T')[0];
			const searchQuery = `${autoApplyText} ${today}`;
			console.log(`[Scheduler] Web searching: "${searchQuery}"`);

			const searchResults = await searchWeb(searchQuery);
			console.log(`[Scheduler] Web search returned ${searchResults.length} results`);

			if (searchResults.length > 0) {
				webSearchContext = formatSearchContext(searchResults);

				const topUrls = searchResults.slice(0, 3).map((r) => r.url);
				const existingUrls = new Set(autoReferUrl.map((u) => u.toLowerCase()));
				const newUrls = topUrls.filter((u) => !existingUrls.has(u.toLowerCase()));

				if (newUrls.length > 0) {
					console.log(`[Scheduler] Fetching ${newUrls.length} web search URLs for detail`);
					const webDetailResults = await Promise.allSettled(
						newUrls.map(async (url) => {
							try {
								const content = await fetchUrlContent(url);
								return { url, content };
							} catch {
								return { url, content: '' };
							}
						})
					);

					const detailContents = webDetailResults
						.filter(
							(r): r is PromiseFulfilledResult<{ url: string; content: string }> =>
								r.status === 'fulfilled' && r.value.content.length > 100
						)
						.map((r) => r.value);

					if (detailContents.length > 0) {
						webSearchDetailContext = detailContents
							.map(
								(c, i) =>
									`========== [Web Search Detail ${i + 1}] ${c.url} ==========\n${c.content}\n========== [End Web Search Detail ${i + 1}] ==========`
							)
							.join('\n\n');
					}
				}
			}
		}

		const hasUrlContent = successfulContents.length > 0;
		const hasWebSearch = webSearchContext.length > 0;

		if (!hasUrlContent && !hasWebSearch) {
			return {
				researchResultText: '',
				success: false,
				error: 'Failed to fetch content from any URL and web search returned no results'
			};
		}

		let urlContextSection = '';
		if (hasUrlContent) {
			urlContextSection = successfulContents
				.map(
					(c, i) =>
						`========== [Attached Source ${i + 1}] ${c.url} ==========\n${c.content}\n========== [End Attached Source ${i + 1}] ==========`
				)
				.join('\n\n');
		}

		const totalContentLength =
			successfulContents.reduce((sum, c) => sum + c.content.length, 0) +
			webSearchContext.length +
			webSearchDetailContext.length;
		console.log(`[Scheduler] Total content for analysis: ${totalContentLength} chars`);
		for (const c of successfulContents) {
			console.log(`[Scheduler] URL content preview [${c.url}]: ${c.content.slice(0, 300).replace(/\n/g, ' | ')}`);
		}

		const systemPrompt = `You are a text extraction and summarization tool. You have NO knowledge of your own. You can ONLY read and summarize the text that is provided to you below.

=== CRITICAL RULES ===
1. You are BLIND to the world. You know NOTHING except the text provided below between the ========== markers.
2. Every single sentence you write MUST be directly based on text you can find below.
3. If information is NOT in the provided text, it DOES NOT EXIST for you. Do not guess, assume, or fill in gaps.
4. When you mention a headline, article title, or fact, it must appear VERBATIM or nearly verbatim in the provided text.
5. If the text is mostly noise (UI elements, navigation) and has little real content, say: "제공된 페이지에서 의미있는 기사 콘텐츠를 충분히 추출하지 못했습니다."
6. NEVER use your training data to answer. ONLY use the provided text.

HOW TO RESPOND:
- Read through ALL the provided text carefully.
- Identify actual article headlines (they are usually longer phrases describing news events).
- Ignore any UI text like: navigation menus, button labels, "더보기", "닫기", algorithm descriptions, copyright notices, "관련뉴스", etc.
- For each real article you find, write: the headline as it appears, then a brief summary based on the description text that follows it.
- Group related articles together if the user asks for grouping.
${hasWebSearch ? '\nADDITIONAL WEB SEARCH DATA is also provided. You may use it to supplement, but clearly label which information comes from attached URLs vs web search.' : ''}

OUTPUT:
- Match the language of the user's prompt (Korean = Korean response).
- Plain text only (no markdown # or ** symbols).
- Use line breaks between sections.
- Use "- " for bullet points.
- Today's date: ${new Date().toISOString().split('T')[0]}.`;

		let userPrompt = `[사용자 요청]\n${autoApplyText}\n\n아래는 웹페이지에서 추출한 텍스트입니다. 이 텍스트 안에 있는 내용만 사용하여 위 요청에 답하세요.\n`;

		if (hasUrlContent) {
			userPrompt += `\n${urlContextSection}\n`;
		}

		if (hasWebSearch) {
			userPrompt += `\n========== [웹 검색 결과] ==========\n${webSearchContext}\n========== [End 웹 검색 결과] ==========\n`;

			if (webSearchDetailContext) {
				userPrompt += `\n${webSearchDetailContext}\n`;
			}
		}

		userPrompt += `\n\n[최종 지시]\n위 ========== 마커 사이의 텍스트에서 찾을 수 있는 실제 기사 제목과 내용만 인용하여 정리하세요. 위 텍스트에 없는 내용은 절대 작성하지 마세요. 기사 제목은 원문 그대로 인용하세요.`;

		const ollamaResponse = await axios.post(
			`${OLLAMA_URL}/api/chat`,
			{
				model: MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				options: {
					num_predict: 8192,
					temperature: 0.1
				}
			},
			{ timeout: 180000 }
		);

		const researchResultText = ollamaResponse.data.message?.content || '';
		console.log(`[Scheduler] Ollama returned ${researchResultText.length} chars`);

		let kakaoSent = false;
		let kakaoError: string | undefined;

		if (isKakaoConnected() && researchResultText) {
			const kakaoResult = await sendMessageChunked(title, researchResultText);
			kakaoSent = kakaoResult.success;
			kakaoError = kakaoResult.error;
			if (!kakaoResult.success) {
				console.error('[Scheduler] Kakao send failed for bundle:', title, kakaoResult.error);
			} else {
				console.log(
					`[Scheduler] Kakao messages sent: ${kakaoResult.sentCount}/${kakaoResult.totalChunks} chunks`
				);
			}
		} else if (!isKakaoConnected()) {
			console.warn('[Scheduler] Kakao not connected, skipping message send for:', title);
		}

		return {
			researchResultText,
			success: true,
			kakaoSent,
			kakaoError
		} as { researchResultText: string; success: boolean; error?: string };
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[Scheduler] Bundle "${title}" execution failed:`, msg);
		return { researchResultText: '', success: false, error: msg };
	}
}

async function runTask(task: ScheduledTask, label: string): Promise<void> {
	if (task.isRunning) {
		console.log(`[Scheduler] Skipping "${task.title}" (${label}) - already running`);
		return;
	}

	task.isRunning = true;
	task.executionCount = (task.executionCount || 0) + 1;
	const execNum = task.executionCount;

	console.log(
		`[Scheduler] === Starting "${task.title}" execution #${execNum} (${label}) ===`
	);

	try {
		const result = await executeBundle(
			task.title,
			task.autoApplyText,
			task.autoReferUrl,
			task.enableWebSearch
		);
		task.lastResult = result.success ? result.researchResultText : `Error: ${result.error}`;
		task.lastExecutedAt = new Date().toISOString();

		console.log(
			`[Scheduler] === Completed "${task.title}" execution #${execNum} (${label}) - success=${result.success}, resultLen=${task.lastResult?.length || 0} ===`
		);
	} catch (error: unknown) {
		const msg = error instanceof Error ? error.message : 'Unknown error';
		task.lastResult = `Error: ${msg}`;
		task.lastExecutedAt = new Date().toISOString();
		console.error(
			`[Scheduler] === FAILED "${task.title}" execution #${execNum} (${label}): ${msg} ===`
		);
	} finally {
		task.isRunning = false;
	}
}

export function startSchedule(
	id: string,
	title: string,
	autoTimeSetting: number,
	autoApplyText: string,
	autoReferUrl: string[],
	enableWebSearch = false
): void {
	stopSchedule(id);

	const intervalMs = autoTimeSetting * 60 * 1000;

	const task: ScheduledTask = {
		id,
		title,
		autoTimeSetting,
		autoApplyText,
		autoReferUrl,
		enableWebSearch,
		timer: null as unknown as ReturnType<typeof setInterval>,
		lastResult: null,
		lastExecutedAt: null,
		isRunning: false,
		executionCount: 0
	};

	console.log(
		`[Scheduler] Scheduling "${title}" every ${autoTimeSetting}min (${intervalMs}ms), webSearch=${enableWebSearch}`
	);

	task.timer = setInterval(() => {
		if (!activeTasks.has(id)) {
			console.warn(`[Scheduler] Orphaned timer for "${title}" (id=${id}) - clearing`);
			clearInterval(task.timer);
			return;
		}

		console.log(
			`[Scheduler] Interval fired for "${title}" - isRunning=${task.isRunning}`
		);

		runTask(task, 'interval');
	}, intervalMs);

	activeTasks.set(id, task);

	runTask(task, 'immediate');
}

export function stopSchedule(id: string): void {
	const task = activeTasks.get(id);
	if (task) {
		console.log(
			`[Scheduler] Stopping "${task.title}" (id=${id}) - ran ${task.executionCount} times`
		);
		clearInterval(task.timer);
		activeTasks.delete(id);
		console.log(`[Scheduler] Confirmed removed id=${id}. Active tasks remaining: ${activeTasks.size}`);
	} else {
		console.log(`[Scheduler] stopSchedule called for id=${id} but no active task found. Active tasks: ${activeTasks.size}`);
	}
}

export function stopAllSchedules(): void {
	console.log(`[Scheduler] Stopping ALL schedules. Count: ${activeTasks.size}`);
	for (const [id, task] of activeTasks) {
		console.log(`[Scheduler] Force stopping "${task.title}" (id=${id})`);
		clearInterval(task.timer);
	}
	activeTasks.clear();
	console.log(`[Scheduler] All schedules stopped.`);
}

export function getTaskStatus(
	id: string
): {
	isActive: boolean;
	isRunning: boolean;
	lastResult: string | null;
	lastExecutedAt: string | null;
} | null {
	const task = activeTasks.get(id);
	if (!task) return null;
	return {
		isActive: true,
		isRunning: task.isRunning,
		lastResult: task.lastResult,
		lastExecutedAt: task.lastExecutedAt
	};
}

export function getAllTaskStatuses(): Record<
	string,
	{ isActive: boolean; isRunning: boolean; lastResult: string | null; lastExecutedAt: string | null }
> {
	const statuses: Record<
		string,
		{
			isActive: boolean;
			isRunning: boolean;
			lastResult: string | null;
			lastExecutedAt: string | null;
		}
	> = {};
	for (const [id, task] of activeTasks) {
		statuses[id] = {
			isActive: true,
			isRunning: task.isRunning,
			lastResult: task.lastResult,
			lastExecutedAt: task.lastExecutedAt
		};
	}
	return statuses;
}
