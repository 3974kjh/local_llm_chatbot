import { getDeepSearchBudget, resolveDeepSearchPreset, type DeepSearchBudget } from '$lib/deepSearchBudget';
import type { ClaimVerification } from '$lib/types';
import { enqueueProgress } from '../chatProgress';
import { getDepthConfig, resolveAnswerDepth } from '../answerDepth';
import type { LlmMessage, LlmProvider } from '../llm';
import { resolveSearchCalendarDate } from '../searchDate';
import { draftAnswer } from './answerDrafter';
import { decomposeAnswer } from './answerDecomposer';
import { refineAnswer } from './answerRefiner';
import { synthesizeAnswer } from './answerSynthesizer';
import {
	applyEvidenceContextCheck,
	computeClaimConfidence,
	verifyClaims
} from './claimVerifier';
import { finalizeDeepSearchSynthesis } from './citationSanitizer';
import { buildCollectedTextsMarkdown, type CollectedText } from './chunkPipeline';
import { buildGapSearchQueries } from './gapSearchPlanner';
import { planQuery } from './queryPlanner';
import {
	buildResearchContext,
	executeResearch,
	executeSeedUrlResearch,
	type ResearchResult
} from './researchExecutor';

export interface DeepSearchOptions {
	messages: LlmMessage[];
	userQuery: string;
	currentDate: string;
	localeCalendarDate?: string;
	enqueue: (data: Record<string, unknown>) => void;
	signal?: AbortSignal;
	seedUrls?: string[];
	preset?: string | null;
	llmProvider?: LlmProvider;
}

const TOKEN_CHUNK_SIZE = 24;

interface WebSearchState {
	seenUrls: Set<string>;
	usedQueries: string[];
	totalUrlsFetched: number;
}

function streamTextAsTokens(text: string, enqueue: (data: Record<string, unknown>) => void): void {
	for (let i = 0; i < text.length; i += TOKEN_CHUNK_SIZE) {
		enqueue({ type: 'token', content: text.slice(i, i + TOKEN_CHUNK_SIZE) });
	}
}

function buildWarningBanner(hasEvidence: boolean, confidence: number): string {
	if (hasEvidence) return '';
	if (confidence <= 0.5) {
		return `> **주의:** 첨부된 출처가 없습니다. 아래 답변은 LLM 추론이며 사실 확인되지 않았습니다.\n\n`;
	}
	return '';
}

function rebuildCollectedTexts(allIterations: ResearchResult[]): CollectedText[] {
	const collectedTexts: CollectedText[] = [];
	for (let i = 0; i < allIterations.length; i++) {
		const iter = allIterations[i];
		for (const p of iter.pageContents) {
			const meta = iter.results.find((r) => r.url === p.url);
			collectedTexts.push({
				url: p.url,
				title: meta?.title ?? p.url,
				query: iter.query,
				iteration: i + 1,
				content: p.content
			});
		}
	}
	return collectedTexts;
}

function countPageContents(iterations: ResearchResult[]): number {
	return iterations.reduce((sum, iter) => sum + iter.pageContents.length, 0);
}

async function runWebSearchRound(
	queries: string[],
	allIterations: ResearchResult[],
	state: WebSearchState,
	budget: DeepSearchBudget,
	calendarDate: string,
	enqueue: (data: Record<string, unknown>) => void,
	signal?: AbortSignal,
	maxPageChars?: number
): Promise<number> {
	let pagesFetched = 0;

	for (const query of queries) {
		if (signal?.aborted) break;
		if (state.totalUrlsFetched >= budget.maxTotalUrls) break;

		const remainingBudget = budget.maxTotalUrls - state.totalUrlsFetched;
		const urlsForThisQuery = Math.min(budget.urlsPerQuery, remainingBudget);
		if (urlsForThisQuery <= 0) break;

		enqueueProgress(enqueue, {
			phase: 'collect',
			label: '웹 검색 중',
			detail: query
		});
		enqueue({ type: 'searching', query });

		const result = await executeResearch(
			query,
			state.seenUrls,
			urlsForThisQuery,
			signal,
			calendarDate,
			{ maxPageChars }
		);

		state.usedQueries.push(result.query);
		allIterations.push(result);
		pagesFetched += result.pageContents.length;
		state.totalUrlsFetched += result.pageContents.length;

		if (result.results.length > 0) {
			enqueue({
				type: 'sources',
				results: result.results,
				query: result.query,
				isUserProvided: false
			});
		}
	}

	return pagesFetched;
}

export async function runDeepSearch(options: DeepSearchOptions): Promise<void> {
	let keepAlive: ReturnType<typeof setInterval> | null = null;
	keepAlive = setInterval(() => {
		try {
			options.enqueue({ type: 'keepalive' });
		} catch {
			// Response stream may already be closed
		}
	}, 20_000);

	try {
		await runDeepSearchImpl(options);
	} finally {
		if (keepAlive) {
			clearInterval(keepAlive);
			keepAlive = null;
		}
	}
}

async function runDeepSearchImpl(options: DeepSearchOptions): Promise<void> {
	const {
		messages,
		userQuery,
		currentDate,
		enqueue,
		signal,
		seedUrls,
		llmProvider = 'local'
	} = options;

	const calendarDate = resolveSearchCalendarDate(options.localeCalendarDate, currentDate);
	const resolvedPreset = resolveDeepSearchPreset(options.preset);
	const BUDGET = getDeepSearchBudget(options.preset);
	const answerDepth = resolveAnswerDepth(userQuery, { preset: resolvedPreset });
	const depthConfig = getDepthConfig(answerDepth);

	enqueueProgress(enqueue, { phase: 'prepare', label: '딥 리서치 준비 중' });

	enqueue({
		type: 'start',
		preset: resolvedPreset,
		refineRounds: BUDGET.refineRounds,
		answerDepth
	});

	const conversationContext =
		messages.length > 2
			? messages
					.slice(-4)
					.map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
					.join('\n')
			: '';

	const searchState: WebSearchState = {
		seenUrls: new Set<string>(),
		usedQueries: [],
		totalUrlsFetched: 0
	};

	// ------------------------------------------------------------------
	// Phase 0: User-attached seed URLs
	// ------------------------------------------------------------------
	const cleanedSeeds = (seedUrls ?? [])
		.map((s) => (typeof s === 'string' ? s.trim() : ''))
		.filter(Boolean);

	const allIterations: ResearchResult[] = [];

	if (cleanedSeeds.length > 0) {
		console.log('[DeepSearch] Fetching user-attached URLs...');
		enqueueProgress(enqueue, { phase: 'collect', label: '첨부 URL 수집 중' });
		const seedBlock = await executeSeedUrlResearch(cleanedSeeds, signal);
		if (signal?.aborted) return;
		if (seedBlock && seedBlock.results.length > 0) {
			allIterations.push(seedBlock);
			for (const r of seedBlock.results) searchState.seenUrls.add(r.url);
			searchState.totalUrlsFetched += seedBlock.pageContents.length;
			enqueue({
				type: 'sources',
				results: seedBlock.results,
				query: '첨부된 URL',
				isUserProvided: true
			});
		}
	}

	let sourceContext = buildResearchContext(allIterations);
	let hasEvidence = allIterations.some((iter) => iter.pageContents.length > 0);

	// ------------------------------------------------------------------
	// Phase 0.5: Query planning
	// ------------------------------------------------------------------
	const attachmentContextPreview =
		allIterations.length > 0 ? sourceContext.slice(0, 3000) : '';

	console.log('[DeepSearch] Planning queries...');
	enqueueProgress(enqueue, { phase: 'collect', label: '검색 전략 수립 중' });
	const plan = await planQuery(
		userQuery,
		currentDate,
		conversationContext,
		attachmentContextPreview || undefined,
		calendarDate,
		llmProvider
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
	// Phase 0.6: Initial web search
	// ------------------------------------------------------------------
	const initialQueries = plan.subQueries.slice(0, BUDGET.initialSubQueries);
	if (initialQueries.length > 0 && searchState.totalUrlsFetched < BUDGET.maxTotalUrls) {
		console.log(`[DeepSearch] Initial web search: ${initialQueries.join(', ')}`);
		enqueueProgress(enqueue, { phase: 'collect', label: '웹 검색 중' });
		await runWebSearchRound(
			initialQueries,
			allIterations,
			searchState,
			BUDGET,
			calendarDate,
			enqueue,
			signal,
			depthConfig.maxPageChars
		);
	}

	sourceContext = buildResearchContext(allIterations);
	hasEvidence = allIterations.some((iter) => iter.pageContents.length > 0);

	if (!hasEvidence) {
		enqueue({
			type: 'evidence_warning',
			message:
				'첨부된 출처가 없습니다. 답변은 LLM 추론이며 사실 확인되지 않았습니다. 정확한 답변을 위해 관련 URL을 첨부해 주세요.'
		});
	}

	if (signal?.aborted) return;

	let collectedTexts = rebuildCollectedTexts(allIterations);
	if (collectedTexts.length > 0) {
		enqueue({ type: 'raw_answer', content: buildCollectedTextsMarkdown(collectedTexts) });
	}

	// ------------------------------------------------------------------
	// Phase 1: Initial draft
	// ------------------------------------------------------------------
	console.log('[DeepSearch] Drafting initial answer...');
	enqueueProgress(enqueue, { phase: 'analyze', label: '초안 작성 중' });
	let currentDraft = await draftAnswer(
		userQuery,
		sourceContext,
		messages.slice(-10),
		currentDate,
		hasEvidence,
		llmProvider,
		answerDepth
	);

	if (signal?.aborted) return;

	enqueue({ type: 'draft', content: currentDraft.slice(0, 500) });

	let lastConfidence = hasEvidence ? 0.5 : BUDGET.confidenceCapWithoutEvidence;
	let stopReason = `Completed ${BUDGET.refineRounds} verification round(s)`;
	let lastVerifications: ClaimVerification[] = [];

	// ------------------------------------------------------------------
	// Phase 2~N: Verify-refine loop (with mid-round gap web search)
	// ------------------------------------------------------------------
	for (let round = 1; round <= BUDGET.refineRounds; round++) {
		if (signal?.aborted) return;

		enqueue({
			type: 'refine_start',
			round,
			maxRounds: BUDGET.refineRounds
		});

		enqueueProgress(enqueue, {
			phase: 'analyze',
			label: '검증 중',
			detail: `${round}/${BUDGET.refineRounds} 라운드`
		});

		console.log(`[DeepSearch] Refine round ${round}/${BUDGET.refineRounds}: decomposing...`);
		const decomposed = await decomposeAnswer(userQuery, currentDraft, llmProvider);
		if (signal?.aborted) return;

		enqueue({
			type: 'decompose',
			subQuestions: decomposed.subQuestions,
			claims: decomposed.claims
		});

		console.log(`[DeepSearch] Refine round ${round}: verifying ${decomposed.claims.length} claims...`);
		let verifications = await verifyClaims(
			decomposed.claims,
			sourceContext,
			hasEvidence,
			llmProvider
		);
		if (hasEvidence) {
			verifications = applyEvidenceContextCheck(verifications, sourceContext);
		}

		// Gap-fill web search when claims are unsupported/contradicted
		const gapClaims = verifications
			.filter((v) => v.status === 'unsupported' || v.status === 'contradicted')
			.map((v) => v.claim);

		if (
			gapClaims.length > 0 &&
			searchState.totalUrlsFetched < BUDGET.maxTotalUrls
		) {
			const gapQueries = buildGapSearchQueries(
				userQuery,
				gapClaims,
				calendarDate,
				searchState.usedQueries,
				BUDGET.maxGapSearches
			);

			if (gapQueries.length > 0) {
				console.log(
					`[DeepSearch] Gap web search round ${round}: ${gapQueries.join(', ')}`
				);

				enqueueProgress(enqueue, {
					phase: 'collect',
					label: '추가 검색 중',
					detail: `라운드 ${round}`
				});

				const pagesFetched = await runWebSearchRound(
					gapQueries,
					allIterations,
					searchState,
					BUDGET,
					calendarDate,
					enqueue,
					signal,
					depthConfig.maxPageChars
				);

				if (pagesFetched > 0) {
					sourceContext = buildResearchContext(allIterations);
					hasEvidence = true;
					collectedTexts = rebuildCollectedTexts(allIterations);
					enqueue({
						type: 'raw_answer',
						content: buildCollectedTextsMarkdown(collectedTexts)
					});

					enqueue({
						type: 'web_search',
						round,
						queries: gapQueries,
						pagesFetched,
						reason: 'gap_fill'
					});

					// Re-verify with expanded context
					verifications = await verifyClaims(
						decomposed.claims,
						sourceContext,
						hasEvidence,
						llmProvider
					);
					verifications = applyEvidenceContextCheck(verifications, sourceContext);
				}
			}
		}

		lastConfidence = computeClaimConfidence(
			verifications,
			hasEvidence,
			BUDGET.confidenceCapWithoutEvidence
		);

		lastVerifications = verifications;

		enqueue({
			type: 'verify',
			results: verifications,
			confidence: lastConfidence
		});

		if (signal?.aborted) return;

		console.log(`[DeepSearch] Refine round ${round}: refining draft...`);
		const refined = await refineAnswer(
			userQuery,
			currentDraft,
			decomposed.subQuestions,
			verifications,
			sourceContext,
			hasEvidence,
			llmProvider,
			answerDepth
		);

		currentDraft = refined.revisedDraft;

		enqueue({
			type: 'refine',
			thought: refined.thought,
			revisedDraft: currentDraft.slice(0, 500),
			confidence: lastConfidence
		});

		// Early exit if all claims supported
		const allSupported =
			verifications.length > 0 &&
			verifications.every((v) => v.status === 'supported');
		if (allSupported && hasEvidence) {
			stopReason = `All claims verified at round ${round}`;
			console.log(`[DeepSearch] ${stopReason}`);
			break;
		}
	}

	if (signal?.aborted) return;

	enqueue({
		type: 'complete',
		stopReason,
		confidence: lastConfidence,
		totalPagesFetched: countPageContents(allIterations)
	});

	enqueueProgress(enqueue, { phase: 'write', label: '최종 답변 작성 중' });

	// ------------------------------------------------------------------
	// Phase Final: Hybrid synthesis (or brief direct stream)
	// ------------------------------------------------------------------
	enqueue({ type: 'synthesis_start' });

	const warningBanner = buildWarningBanner(hasEvidence, lastConfidence);

	if (answerDepth === 'brief') {
		const finalText = warningBanner + currentDraft;
		const { text: sanitized } = finalizeDeepSearchSynthesis(
			finalText,
			sourceContext || collectedTexts.map((t) => t.url).join('\n')
		);
		streamTextAsTokens(sanitized, enqueue);
		if (sanitized !== finalText) {
			enqueue({ type: 'synthesis_final', content: sanitized });
		}
		enqueueProgress(enqueue, { phase: 'complete', label: '완료' });
		enqueue({ type: 'done' });
		return;
	}

	if (warningBanner) {
		enqueue({ type: 'token', content: warningBanner });
	}

	await synthesizeAnswer(
		userQuery,
		sourceContext,
		messages.slice(-10),
		currentDate,
		enqueue,
		{
			collectedTexts,
			synthesisMode: 'hybrid',
			llmProvider,
			verifiedDraft: currentDraft,
			verifications: lastVerifications,
			answerDepth
		}
	);

	enqueueProgress(enqueue, { phase: 'complete', label: '완료' });
}
