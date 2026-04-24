import type { OllamaMessage } from '../ollama';
import { planQuery } from './queryPlanner';
import {
	executeResearch,
	buildResearchContext,
	executeSeedUrlResearch
} from './researchExecutor';
import { evaluateResearch } from './iterationEvaluator';
import { synthesizeAnswer } from './answerSynthesizer';

const MAX_ITERATIONS = 3;

export interface DeepSearchOptions {
	messages: OllamaMessage[];
	userQuery: string;
	currentDate: string;
	enqueue: (data: Record<string, unknown>) => void;
	signal?: AbortSignal;
	/** HTTP(S) URLs to fetch and analyze before web search and planning. */
	seedUrls?: string[];
}

export async function runDeepSearch(options: DeepSearchOptions): Promise<void> {
	const { messages, userQuery, currentDate, enqueue, signal, seedUrls } = options;

	const conversationContext =
		messages.length > 2
			? messages
					.slice(-4)
					.map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
					.join('\n')
			: '';

	const allIterations: Awaited<ReturnType<typeof executeResearch>>[] = [];

	// User-attached URLs: fetch first so planning and synthesis can use them
	const cleanedSeeds = (seedUrls ?? [])
		.map((s) => (typeof s === 'string' ? s.trim() : ''))
		.filter(Boolean);
	if (cleanedSeeds.length > 0) {
		console.log('[DeepSearch] Fetching user-attached URLs first...');
		for (const u of cleanedSeeds) {
			if (signal?.aborted) return;
			enqueue({ type: 'searching', query: `Attached URL: ${u}` });
		}
		const seedBlock = await executeSeedUrlResearch(cleanedSeeds, signal);
		if (signal?.aborted) return;
		if (seedBlock && seedBlock.results.length > 0) {
			allIterations.push(seedBlock);
			enqueue({
				type: 'sources',
				results: seedBlock.results,
				query: 'Attached URLs (analyzed first)'
			});
		}
	}

	const attachmentContextPreview =
		allIterations.length > 0 ? buildResearchContext(allIterations).slice(0, 4500) : '';

	// Query planning (can use text already gathered from attachments)
	console.log('[DeepSearch] Planning queries...');
	const plan = await planQuery(
		userQuery,
		currentDate,
		conversationContext,
		attachmentContextPreview || undefined
	);
	enqueue({ type: 'plan', subQueries: plan.subQueries, strategy: plan.strategy });

	if (signal?.aborted) return;

	// Turns 2..N: Research Loop
	let currentQueries = plan.subQueries;

	for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
		if (signal?.aborted) return;

		enqueue({ type: 'iteration_start', iteration, maxIterations: MAX_ITERATIONS });

		// Execute research for all current queries in parallel
		for (const query of currentQueries) {
			if (signal?.aborted) return;
			enqueue({ type: 'searching', query });
		}

		const iterResults = await Promise.all(
			currentQueries.map((q) => executeResearch(q, signal))
		);

		if (signal?.aborted) return;

		for (const result of iterResults) {
			allIterations.push(result);
			if (result.results.length > 0) {
				enqueue({ type: 'sources', results: result.results, query: result.query });
			}
		}

		// Evaluate if we have enough information
		const accumulatedContext = buildResearchContext(allIterations);
		const evaluation = await evaluateResearch(
			userQuery,
			accumulatedContext,
			iteration,
			MAX_ITERATIONS
		);

		enqueue({
			type: 'evaluation',
			thought: evaluation.thought,
			needsMore: evaluation.needsMore,
			refinedQueries: evaluation.refinedQueries
		});

		if (!evaluation.needsMore || evaluation.refinedQueries.length === 0) {
			console.log(`[DeepSearch] Sufficient research at iteration ${iteration}`);
			break;
		}

		console.log(
			`[DeepSearch] Need more research. Refined queries: ${evaluation.refinedQueries.join(', ')}`
		);
		currentQueries = evaluation.refinedQueries;
	}

	if (signal?.aborted) return;

	// Final Turn: Synthesis
	enqueue({ type: 'synthesis_start' });

	const finalContext = buildResearchContext(allIterations);
	const historyMessages = messages.slice(-10);

	await synthesizeAnswer(userQuery, finalContext, historyMessages, currentDate, enqueue);
}
