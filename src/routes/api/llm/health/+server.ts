import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkLlmHealth, getLlmModelLabel, normalizeLlmProvider } from '$lib/server/llm';

export const GET: RequestHandler = async ({ url }) => {
	const provider = normalizeLlmProvider(url.searchParams.get('provider'));
	const ok = await checkLlmHealth(provider);

	return json({
		ok,
		provider,
		model: getLlmModelLabel(provider)
	});
};
