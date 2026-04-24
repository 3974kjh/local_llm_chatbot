import type { RequestHandler } from './$types';
import { runDeepSearch } from '$lib/server/deepSearch';
import { resolveSearchCalendarDate } from '$lib/server/searchDate';

export const POST: RequestHandler = async ({ request }) => {
	const { messages, query, currentDate, seedUrls, localeCalendarDate } = await request.json();

	const encoder = new TextEncoder();
	const abortController = new AbortController();

	const stream = new ReadableStream({
		async start(controller) {
			const enqueue = (data: Record<string, unknown>) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// controller already closed
				}
			};

			try {
				await runDeepSearch({
					messages: messages ?? [],
					userQuery: query,
					currentDate:
						currentDate ||
						`Today is ${resolveSearchCalendarDate(localeCalendarDate, undefined)} (local calendar).`,
					localeCalendarDate:
						typeof localeCalendarDate === 'string' ? localeCalendarDate : undefined,
					enqueue,
					signal: abortController.signal,
					seedUrls: Array.isArray(seedUrls) ? seedUrls : undefined
				});
			} catch (error: unknown) {
				const msg = error instanceof Error ? error.message : 'Deep search failed';
				enqueue({ type: 'error', message: msg });
			} finally {
				try {
					controller.close();
				} catch {
					// already closed
				}
			}
		},
		cancel() {
			abortController.abort();
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
