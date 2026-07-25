import { extractFirstJsonObject } from '../extractJsonObject';
import { WEB_FIRST_GROUNDING } from '../promptLocale';
import { normalizeSearchQueryForRecency } from '../searchDate';
import { callLlmNonStreaming, type LlmProvider } from '../llm';

export interface EvaluationResult {
	thought: string;
	resolvedItems: string[];
	unresolvedItems: string[];
	nextQueries: string[];
	/** Set when parsing succeeds; omitted on total failure fallback. */
	confidence?: number;
	needsMore: boolean;
}

function buildEvaluatorSystemPrompt(
	minRounds: number,
	maxRounds: number,
	confidenceThreshold: number,
	calendarDate: string
) {
	return `You are a research quality evaluator. Your ONLY job is to assess the research text given in the user message. You must NEVER use training knowledge to fill gaps.

${WEB_FIRST_GROUNDING}

언어: "thought"는 반드시 한국어로 작성한다. "resolvedItems"·"unresolvedItems"의 각 문자열도 한국어로 작성한다. JSON 키 이름은 영어로 유지한다.

RULES:
- "resolved": 연구 스니펫·페이지 본문에 기준이 명시적으로 충족될 때만 — 학습 지식으로 '있을 것'이라 추정하면 안 된다.
- "unresolved": 연구 텍스트에 명시적 근거가 부족할 때 — 학습 데이터로 아는 내용이 있어도 자료에 없으면 미해결.
- confidence: 0.0–1.0. RESEARCH TEXT가 질문을 얼마나 직접 답하는지에만 기반한다.
- needsMore가 true이면 1–3개의 nextQueries(이미 시도된 것과 중복 금지). 각 nextQuery에 캘린더 날짜 "${calendarDate}"를 반드시 포함한다. 검색어는 한국어·영어 혼용 가능.
- ${minRounds}라운드 미만까지는 보수적으로: 모든 stop 기준을 독립 근거로 명시 충족하지 않으면 needsMore true. confidence >= ${confidenceThreshold}는 직접 인용 근거가 강할 때만.
- 연구의 수치·날짜가 과거 연도에만 묶여 있고 사용자 질문이 현재를 요구하면 시점 미충족으로 처리하고 "${calendarDate}"·1차 출처를 넣은 nextQueries를 제안한다.
- 연구 텍스트 밖 사실을 만들어내지 않는다.
- Return ONLY valid JSON, no markdown, no explanation.

Output format:
{
  "thought": "연구 텍스트에서 확인된 것과 부족한 것을 한국어로 짧게",
  "resolvedItems": ["자료로 충족된 기준(한국어)", ...],
  "unresolvedItems": ["자료 부족·시점 불일치 등(한국어)", ...],
  "nextQueries": ["${calendarDate} 포함 검색어", ...],
  "confidence": 0.65,
  "needsMore": true
}`;
}

function parseEvaluationFromRaw(
	raw: string,
	previousQueries: string[],
	confidenceThreshold: number,
	calendarDate: string
): EvaluationResult {
	const jsonStr = extractFirstJsonObject(raw);
	if (!jsonStr) throw new Error('No JSON object in evaluator response');

	const parsed = JSON.parse(jsonStr) as Partial<EvaluationResult>;

	const resolvedItems = Array.isArray(parsed.resolvedItems)
		? parsed.resolvedItems.filter((s) => typeof s === 'string' && s.trim())
		: [];
	const unresolvedItems = Array.isArray(parsed.unresolvedItems)
		? parsed.unresolvedItems.filter((s) => typeof s === 'string' && s.trim())
		: [];

	const rawNextQueries = Array.isArray(parsed.nextQueries)
		? parsed.nextQueries
				.filter((q) => typeof q === 'string' && q.trim())
				.filter((q) => !previousQueries.some((prev) => prev.toLowerCase() === q.toLowerCase()))
				.slice(0, 3)
		: [];

	// Enforce calendarDate in every nextQuery so recency is maintained across all rounds
	const nextQueries = rawNextQueries.map((q) =>
		normalizeSearchQueryForRecency(q, calendarDate)
	);

	const rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
	const confidence = Math.max(0, Math.min(1, rawConfidence));

	const needsMore =
		(typeof parsed.needsMore === 'boolean' ? parsed.needsMore : confidence < confidenceThreshold) &&
		nextQueries.length > 0;

	return {
		thought: typeof parsed.thought === 'string' ? parsed.thought : '평가 완료',
		resolvedItems,
		unresolvedItems,
		nextQueries,
		confidence,
		needsMore
	};
}

export async function evaluateResearch(
	userQuery: string,
	stopCriteria: string[],
	accumulatedContext: string,
	previousQueries: string[],
	round: number,
	minRounds: number,
	maxRounds: number,
	confidenceThreshold: number,
	calendarDate: string,
	provider: LlmProvider = 'local'
): Promise<EvaluationResult> {
	const contextForEval = buildEvalContext(accumulatedContext);

	const userMessage = `User Question: ${userQuery}
Calendar date for recency (all nextQueries must include this exact date): ${calendarDate}

Stop Criteria (resolved ONLY when RESEARCH TEXT explicitly addresses them — not from your training):
${stopCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Queries already tried (do NOT repeat these in nextQueries):
${previousQueries.slice(-12).map((q) => `- ${q}`).join('\n')}

Research gathered so far (Round ${round} of ${maxRounds}, minimum rounds before easy stop: ${minRounds}):
${contextForEval}

연구 텍스트만 근거로 완성도를 평가하고 JSON만 출력한다.`;

	const systemPrompt = buildEvaluatorSystemPrompt(minRounds, maxRounds, confidenceThreshold, calendarDate);

	let lastErr: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const suffix =
				attempt > 0
					? '\n\nCRITICAL: Your previous reply was not valid JSON. Output exactly ONE JSON object with keys thought, resolvedItems, unresolvedItems, nextQueries, confidence, needsMore. No markdown fences, no text before or after the JSON.'
					: '';
			const raw = await callLlmNonStreaming(
				[{ role: 'user', content: userMessage + suffix }],
				systemPrompt,
				{ provider, numPredict: 2048 }
			);
			return parseEvaluationFromRaw(raw, previousQueries, confidenceThreshold, calendarDate);
		} catch (e) {
			lastErr = e;
			console.warn(`[IterationEvaluator] attempt ${attempt + 1}/3 failed:`, e);
		}
	}

	console.error('[IterationEvaluator] Failed after retries:', lastErr);
	return {
		thought: '평가에 실패하여 수집된 자료로 진행합니다.',
		resolvedItems: [],
		unresolvedItems: stopCriteria,
		nextQueries: [],
		needsMore: false
	};
}

function buildEvalContext(raw: string): string {
	const iterBoundary = raw.indexOf('=== Research Iteration');
	if (iterBoundary === -1) return raw.slice(0, 8000);

	const sourceIndex = raw.slice(0, iterBoundary);
	const iterBlocks = raw.slice(iterBoundary);

	const trimmedBlocks = iterBlocks.replace(
		/(Detailed Page Content:\n)([\s\S]*?)(?=\n===|$)/g,
		(_, label: string, body: string) =>
			label + body.slice(0, 1600) + (body.length > 1600 ? '\n...[trimmed]' : '')
	);

	const combined = sourceIndex + trimmedBlocks;
	return combined.length > 9000 ? combined.slice(0, 9000) + '\n...[truncated]' : combined;
}
