import type { ChatProgressEvent } from '$lib/types';

export function enqueueProgress(
	enqueue: (data: Record<string, unknown>) => void,
	event: ChatProgressEvent
): void {
	enqueue({
		type: 'progress',
		phase: event.phase,
		...(event.label ? { label: event.label } : {}),
		...(event.detail ? { detail: event.detail } : {})
	});
}
