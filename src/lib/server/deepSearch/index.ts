import { DEEP_SEARCH_BUDGET } from '$lib/deepSearchBudget';
import type { OllamaMessage } from '../ollama';
import { planQuery } from './queryPlanner';
import {
	executeResearch,
	buildResearchContext,
	executeSeedUrlResearch
} from './researchExecutor';
import { evaluateResearch } from './iterationEvaluator';
import { synthesizeAnswer } from './answerSynthesizer';

const BUDGET = DEEP_SEARCH_BUDGET;

function buildFallbackQueries(
	userQuery: string,
	subQuestions: string[],
	usedQueries: string[],
	max: number
): string[] {
	const normalizedUsed = new Set(usedQueries.map((q) => q.trim().toLowerCase()));
	const out: string[] = [];
	for (const sq of subQuestions) {
		const piece = sq.trim();
		if (!piece) continue;
		const q = `${userQuery} — ${piece}`.trim();
		const key = q.toLowerCase();
		if (!normalizedUsed.has(key)) {
			out.push(q);
			normalizedUsed.add(key);
		}
		if (out.length >= max) return out;
	}
	const extra = `${userQuery} verification alternate sources`;
	if (!normalizedUsed.has(extra.toLowerCase())) out.push(extra);
	return out.slice(0, max);
}

export interface DeepSearchOptions {
	messages: OllamaMessage[];
	userQuery: string;
	currentDate: string;
	enqueue: (data: Record<string, unknown>) => void;
	signal?: AbortSignal;
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

	// Shared state across all rounds
	const allIterations: Awaited<ReturnType<typeof executeResearch>>[] = [];
	const seenUrls = new Set<string>();
	const usedQueries: string[] = [];
	let totalUrlsFetched = 0;

	// ------------------------------------------------------------------
	// Phase 0: User-attached seed URLs (fetched before planning)
	// ------------------------------------------------------------------
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
			for (const r of seedBlock.results) seenUrls.add(r.url);
			totalUrlsFetched += seedBlock.pageContents.length;
			enqueue({
				type: 'sources',
				results: seedBlock.results,
				query: 'Attached URLs (analyzed first)'
			});
		}
	}

	const attachmentContextPreview =
		allIterations.length > 0 ? buildResearchContext(allIterations).slice(0, 3000) : '';

	// ------------------------------------------------------------------
	// Phase 1: Query planning (informed by attachment context)
	// ------------------------------------------------------------------
	console.log('[DeepSearch] Planning queries...');
	const plan = await planQuery(
		userQuery,
		currentDate,
		conversationContext,
		attachmentContextPreview || undefined
	);

	enqueue({
		type: 'plan',
		subQueries: plan.subQueries,
		strategy: plan.strategy,
		subQuestions: plan.subQuestions,
		stopCriteria: plan.stopCriteria
	});

	if (signal?.aborted) return;

	// ------------------------------------------------------------------
	// Phase 2: Budget-based research loop
	// ------------------------------------------------------------------
	let currentQueries = plan.subQueries.slice(0, BUDGET.maxQueriesPerRound);
	let consecutiveEmptyRounds = 0;
	let lastConfidence = 0;
	let stopReason = `Reached maximum rounds (${BUDGET.maxRounds})`;

	for (let round = 1; round <= BUDGET.maxRounds; round++) {
		if (signal?.aborted) return;

		// --- Budget gate ---
		if (totalUrlsFetched >= BUDGET.maxTotalUrls) {
			stopReason = `URL budget reached (${BUDGET.maxTotalUrls} pages fetched)`;
			console.log(`[DeepSearch] ${stopReason}`);
			break;
		}

		enqueue({
			type: 'iteration_start',
			iteration: round,
			maxIterations: BUDGET.maxRounds,
			totalUrlsFetched
		});

		// Announce queries
		for (const query of currentQueries) {
			if (signal?.aborted) return;
			enqueue({ type: 'searching', query });
		}

		// Execute research in parallel
		const roundResults = await Promise.all(
			currentQueries.map((q) =>
				executeResearch(q, seenUrls, BUDGET.urlsPerQuery, signal)
			)
		);
		if (signal?.aborted) return;

		// Count new URLs fetched this round
		let newUrlsThisRound = 0;
		let attemptedUrlsThisRound = 0;
		for (const result of roundResults) {
			usedQueries.push(result.query);
			allIterations.push(result);
			newUrlsThisRound += result.pageContents.length;
			attemptedUrlsThisRound += result.results.length;
			totalUrlsFetched += result.pageContents.length;

			if (result.results.length > 0) {
				enqueue({ type: 'sources', results: result.results, query: result.query });
			}
		}

		// Convergence: require both no new successful pages AND no new search attempts
		const hadResearchActivity = newUrlsThisRound > 0 || attemptedUrlsThisRound > 0;
		if (hadResearchActivity) {
			consecutiveEmptyRounds = 0;
		} else {
			consecutiveEmptyRounds++;
		}

		if (consecutiveEmptyRounds >= BUDGET.convergenceWindow) {
			stopReason = `Search converged — no new pages found in ${BUDGET.convergenceWindow} consecutive rounds`;
			console.log(`[DeepSearch] ${stopReason}`);
			break;
		}

		// --- Evaluate ---
		const accumulatedContext = buildResearchContext(allIterations);
		const evaluation = await evaluateResearch(
			userQuery,
			plan.stopCriteria,
			accumulatedContext,
			usedQueries,
			round,
			BUDGET.minRounds,
			BUDGET.maxRounds,
			BUDGET.confidenceThreshold
		);

		lastConfidence = evaluation.confidence;

		enqueue({
			type: 'evaluation',
			thought: evaluation.thought,
			needsMore: evaluation.needsMore,
			refinedQueries: evaluation.nextQueries,
			confidence: evaluation.confidence,
			resolvedItems: evaluation.resolvedItems,
			unresolvedItems: evaluation.unresolvedItems
		});

		// --- Stop conditions (do not early-exit before minRounds unless URL budget hit above) ---
		if (
			round >= BUDGET.minRounds &&
			evaluation.confidence >= BUDGET.confidenceThreshold &&
			evaluation.unresolvedItems.length === 0
		) {
			stopReason = `Research complete — confidence ${Math.round(evaluation.confidence * 100)}%, all criteria resolved`;
			console.log(`[DeepSearch] ${stopReason}`);
			break;
		}

		const evaluatorWouldStop =
			!evaluation.needsMore || evaluation.nextQueries.length === 0;

		if (round >= BUDGET.minRounds && evaluatorWouldStop) {
			stopReason = `Evaluator satisfied at round ${round} (confidence ${Math.round(evaluation.confidence * 100)}%)`;
			console.log(`[DeepSearch] ${stopReason}`);
			break;
		}

		if (round === BUDGET.maxRounds) {
			stopReason = `Reached maximum rounds (${BUDGET.maxRounds}), confidence ${Math.round(lastConfidence * 100)}%`;
			break;
		}

		// Prepare next round queries
		let nextQueries = evaluation.nextQueries.slice(0, BUDGET.maxQueriesPerRound);
		if (nextQueries.length === 0) {
			nextQueries = buildFallbackQueries(
				userQuery,
				plan.subQuestions,
				usedQueries,
				BUDGET.maxQueriesPerRound
			);
		}
		if (nextQueries.length === 0) {
			stopReason = `No further queries available at round ${round}`;
			console.log(`[DeepSearch] ${stopReason}`);
			break;
		}
		currentQueries = nextQueries;
		console.log(`[DeepSearch] Round ${round} done. Next: ${currentQueries.join(', ')}`);
	}

	if (signal?.aborted) return;

	// Broadcast stop summary before synthesis
	enqueue({ type: 'complete', stopReason, confidence: lastConfidence });

	// ------------------------------------------------------------------
	// Phase 3: Synthesis
	// ------------------------------------------------------------------
	enqueue({ type: 'synthesis_start' });

	const finalContext = buildResearchContext(allIterations);
	await synthesizeAnswer(
		userQuery,
		finalContext,
		messages.slice(-10),
		currentDate,
		enqueue
	);
}
