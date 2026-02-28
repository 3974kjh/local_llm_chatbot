import axios from 'axios';
import { fetchMultipleUrls, fetchUrlContent } from './scraper';
import { searchWeb, formatSearchContext } from './search';
import { sendMessageChunked, isConnected as isKakaoConnected } from './kakao';
import { sendMessageChunked as sendTelegramChunked } from './telegram';

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'llama3.1:8b';

type ScheduleType = 'minutes' | 'daily' | 'days';

interface ScheduledTask {
	id: string;
	title: string;
	autoTimeSetting: number;
	autoApplyText: string;
	autoReferUrl: string[];
	enableWebSearch: boolean;
	telegramEnabled: boolean;
	telegramBotToken: string;
	telegramChatId: string;
	scheduleType: ScheduleType;
	scheduleTime: string;
	scheduleDays: number;
	timer: ReturnType<typeof setInterval>;
	/** Next run timestamp (for daily/days). */
	nextRunAt: number | null;
	lastResult: string | null;
	lastExecutedAt: string | null;
	isRunning: boolean;
	executionCount: number;
}

const activeTasks = new Map<string, ScheduledTask>();

const TICK_MS = 60 * 1000;

/** Next run at scheduleTime today or tomorrow. */
function getNextRunDaily(scheduleTime: string): number {
	const [h, m] = scheduleTime.split(':').map(Number);
	const next = new Date();
	next.setHours(typeof h === 'number' ? h : 9, typeof m === 'number' ? m : 0, 0, 0);
	if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
	return next.getTime();
}

/** Next run: lastRun + scheduleDays days at scheduleTime. */
function getNextRunDays(scheduleTime: string, scheduleDays: number, lastRunAt: number): number {
	const [h, m] = scheduleTime.split(':').map(Number);
	const next = new Date(lastRunAt);
	next.setDate(next.getDate() + scheduleDays);
	next.setHours(typeof h === 'number' ? h : 9, typeof m === 'number' ? m : 0, 0, 0);
	return next.getTime();
}

function runTimeBasedTick(): void {
	const now = Date.now();
	for (const [, task] of activeTasks) {
		if (task.scheduleType !== 'daily' && task.scheduleType !== 'days') continue;
		if (task.nextRunAt == null || task.isRunning) continue;
		if (now < task.nextRunAt) continue;
		task.nextRunAt = null;
		runTask(task, 'scheduled-time').then(() => {
			if (task.scheduleType === 'daily') {
				task.nextRunAt = getNextRunDaily(task.scheduleTime);
			} else {
				task.nextRunAt = getNextRunDays(
					task.scheduleTime,
					task.scheduleDays,
					task.lastExecutedAt ? new Date(task.lastExecutedAt).getTime() : now
				);
			}
			console.log(`[Scheduler] Next run for "${task.title}" at ${new Date(task.nextRunAt).toISOString()}`);
		});
	}
}

let timeBasedTickTimer: ReturnType<typeof setInterval> | null = null;

function ensureTimeBasedTick(): void {
	if (timeBasedTickTimer != null) return;
	timeBasedTickTimer = setInterval(runTimeBasedTick, TICK_MS);
	console.log('[Scheduler] Time-based tick started (every 60s)');
}

function stopTimeBasedTickIfUnused(): void {
	for (const task of activeTasks.values()) {
		if (task.scheduleType === 'daily' || task.scheduleType === 'days') return;
	}
	if (timeBasedTickTimer != null) {
		clearInterval(timeBasedTickTimer);
		timeBasedTickTimer = null;
		console.log('[Scheduler] Time-based tick stopped');
	}
}

console.log('[Scheduler] Module loaded/reloaded - activeTasks is fresh (empty)');

/** Run Now 취소용: bundleId -> AbortController (execute API에서만 사용) */
const runAbortControllers = new Map<string, AbortController>();

export function registerRunAbort(bundleId: string): AbortSignal {
	const existing = runAbortControllers.get(bundleId);
	if (existing) existing.abort();
	const controller = new AbortController();
	runAbortControllers.set(bundleId, controller);
	return controller.signal;
}

export function abortRun(bundleId: string): void {
	const controller = runAbortControllers.get(bundleId);
	if (controller) {
		controller.abort();
		console.log(`[Scheduler] Run aborted for bundleId=${bundleId}`);
	}
}

export function unregisterRunAbort(bundleId: string): void {
	runAbortControllers.delete(bundleId);
}

export async function executeBundle(
	title: string,
	autoApplyText: string,
	autoReferUrl: string[],
	enableWebSearch = false,
	telegramEnabled = false,
	telegramBotToken = '',
	telegramChatId = '',
	signal?: AbortSignal
): Promise<{ researchResultText: string; success: boolean; error?: string }> {
	try {
		if (signal?.aborted) {
			return { researchResultText: '', success: false, error: 'Cancelled' };
		}
		console.log(
			`[Scheduler] Executing bundle "${title}" with ${autoReferUrl.length} URLs, webSearch=${enableWebSearch}, telegramEnabled=${telegramEnabled}, hasToken=${!!(telegramBotToken && telegramBotToken.trim())}, hasChatId=${!!(telegramChatId && telegramChatId.trim())}`
		);

		const urlResults = await fetchMultipleUrls(autoReferUrl, signal);

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

			const searchResults = await searchWeb(searchQuery, signal);
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
								const content = await fetchUrlContent(url, signal);
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

		const now = new Date();
		const todayStr = now.toISOString().split('T')[0];
		const todayLocal = now.toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' });

		const systemPrompt = `You are an assistant that answers the user's request using ONLY the context provided below (attached URLs and/or web search results).

=== RULES ===
1. Use ONLY the text between the ========== markers. Do not invent or guess information.
2. Match the user's intent:
   - If they ask for simple facts (weather, date, time, one-line answer): give a SHORT, direct answer. No long summaries.
   - If they ask to summarize or analyze articles/URLs: extract headlines and summarize from the context. Quote key phrases from the text.
   - If they ask for a list or comparison: respond in a clear list format.
3. "Today" / "오늘" = the execution date/time stated in the user message. Use it for weather, date-related answers.
4. Output: plain text, no markdown # or **. Use line breaks and "- " for lists. Match the user's language (Korean or English).`;

		let userPrompt = `[실행 기준 일시 (오늘)] ${todayStr} (${todayLocal})\n\n[사용자 요청]\n${autoApplyText}\n\n아래 제공된 맥락(첨부 URL·웹 검색 결과)만 사용해서 위 요청에 답하세요. 요청이 날씨·날짜·단순 질문이면 짧고 심플하게, 기사/URL 정리 요청이면 요약·인용으로 답하세요.\n`;

		if (hasUrlContent) {
			userPrompt += `\n${urlContextSection}\n`;
		}

		if (hasWebSearch) {
			userPrompt += `\n========== [웹 검색 결과] ==========\n${webSearchContext}\n========== [End 웹 검색 결과] ==========\n`;

			if (webSearchDetailContext) {
				userPrompt += `\n${webSearchDetailContext}\n`;
			}
		}

		userPrompt += `\n\n[지시]\n위 맥락만 사용해 사용자 요청에 맞게 답하세요. 단순 질문이면 한두 문장으로, 정리·요약 요청이면 맥락에서 인용해 정리하세요.`;

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
			{ timeout: 180000, ...(signal && { signal }) }
		);

		const researchResultText = ollamaResponse.data.message?.content || '';
		console.log(`[Scheduler] Ollama returned ${researchResultText.length} chars`);

		if (signal?.aborted) {
			console.log(`[Scheduler] Bundle "${title}" aborted before send - skipping Kakao/Telegram`);
			return { researchResultText: '', success: false, error: 'Cancelled' };
		}

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

		let telegramSent = false;
		let telegramError: string | undefined;

		if (signal?.aborted) {
			console.log(`[Scheduler] Bundle "${title}" aborted before Telegram - skipping send`);
			return { researchResultText: '', success: false, error: 'Cancelled' };
		}

		console.log('[Scheduler] Telegram 조건:', {
			telegramEnabled,
			hasToken: !!(telegramBotToken && telegramBotToken.trim()),
			hasChatId: !!(telegramChatId && telegramChatId.trim()),
			resultLen: researchResultText?.length ?? 0
		});

		if (telegramEnabled && telegramBotToken && telegramChatId && researchResultText) {
			const telegramResult = await sendTelegramChunked(
				telegramChatId,
				title,
				researchResultText,
				false,
				telegramBotToken
			);
			telegramSent = telegramResult.success;
			telegramError = telegramResult.error;
			if (!telegramResult.success) {
				console.error('[Scheduler] Telegram send failed for bundle:', title, telegramResult.error);
			} else {
				console.log(
					`[Scheduler] Telegram messages sent: ${telegramResult.sentCount}/${telegramResult.totalChunks} chunks`
				);
			}
		} else if (telegramEnabled && (!telegramBotToken || !telegramChatId)) {
			console.warn(
				'[Scheduler] Telegram enabled but Bot Token or Chat ID missing for:',
				title,
				'- token:',
				telegramBotToken ? 'set' : 'empty',
				'chatId:',
				telegramChatId ? 'set' : 'empty'
			);
		}

		return {
			researchResultText,
			success: true,
			kakaoSent,
			kakaoError,
			telegramSent,
			telegramError
		} as { researchResultText: string; success: boolean; error?: string };
	} catch (error: unknown) {
		const isAbort = error instanceof Error && (error.name === 'AbortError' || /abort|cancel/i.test(error.message));
		const msg = isAbort ? 'Cancelled' : (error instanceof Error ? error.message : 'Unknown error');
		if (isAbort) console.log(`[Scheduler] Bundle "${title}" execution cancelled by user`);
		else console.error(`[Scheduler] Bundle "${title}" execution failed:`, msg);
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
			task.enableWebSearch,
			task.telegramEnabled,
			task.telegramBotToken,
			task.telegramChatId
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
	enableWebSearch = false,
	telegramEnabled = false,
	telegramBotToken = '',
	telegramChatId = '',
	scheduleType: ScheduleType = 'minutes',
	scheduleTime = '09:00',
	scheduleDays = 1
): void {
	stopSchedule(id);

	const task: ScheduledTask = {
		id,
		title,
		autoTimeSetting,
		autoApplyText,
		autoReferUrl,
		enableWebSearch,
		telegramEnabled,
		telegramBotToken: (telegramBotToken || '').trim(),
		telegramChatId: (telegramChatId || '').trim(),
		scheduleType,
		scheduleTime,
		scheduleDays,
		timer: null as unknown as ReturnType<typeof setInterval>,
		nextRunAt: null,
		lastResult: null,
		lastExecutedAt: null,
		isRunning: false,
		executionCount: 0
	};

	if (scheduleType === 'minutes') {
		const intervalMs = autoTimeSetting * 60 * 1000;
		console.log(
			`[Scheduler] Scheduling "${title}" every ${autoTimeSetting}min (${intervalMs}ms), webSearch=${enableWebSearch}`
		);
		task.timer = setInterval(() => {
			if (!activeTasks.has(id)) {
				console.warn(`[Scheduler] Orphaned timer for "${title}" (id=${id}) - clearing`);
				clearInterval(task.timer);
				return;
			}
			runTask(task, 'interval');
		}, intervalMs);
		activeTasks.set(id, task);
		runTask(task, 'immediate');
	} else {
		task.nextRunAt = getNextRunDaily(scheduleTime);
		console.log(
			`[Scheduler] Scheduling "${title}" ${scheduleType === 'daily' ? 'daily' : `every ${scheduleDays} day(s)`} at ${scheduleTime}, next at ${new Date(task.nextRunAt).toISOString()}`
		);
		activeTasks.set(id, task);
		ensureTimeBasedTick();
	}
}

export function stopSchedule(id: string): void {
	const task = activeTasks.get(id);
	if (task) {
		console.log(
			`[Scheduler] Stopping "${task.title}" (id=${id}) - ran ${task.executionCount} times`
		);
		if (task.timer) clearInterval(task.timer);
		activeTasks.delete(id);
		stopTimeBasedTickIfUnused();
		console.log(`[Scheduler] Confirmed removed id=${id}. Active tasks remaining: ${activeTasks.size}`);
	} else {
		console.log(`[Scheduler] stopSchedule called for id=${id} but no active task found. Active tasks: ${activeTasks.size}`);
	}
}

export function stopAllSchedules(): void {
	console.log(`[Scheduler] Stopping ALL schedules. Count: ${activeTasks.size}`);
	for (const [id, task] of activeTasks) {
		console.log(`[Scheduler] Force stopping "${task.title}" (id=${id})`);
		if (task.timer) clearInterval(task.timer);
	}
	activeTasks.clear();
	if (timeBasedTickTimer != null) {
		clearInterval(timeBasedTickTimer);
		timeBasedTickTimer = null;
	}
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
