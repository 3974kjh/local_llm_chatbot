import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { abortRun } from '$lib/server/scheduler';

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
	}
	const bundleId = body.bundleId;
	if (typeof bundleId !== 'string' || !bundleId.trim()) {
		return json({ success: false, error: 'Missing bundleId' }, { status: 400 });
	}
	abortRun(bundleId.trim());
	return json({ success: true });
};
