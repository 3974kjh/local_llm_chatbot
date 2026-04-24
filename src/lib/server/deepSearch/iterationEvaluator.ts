import { extractFirstJsonObject } from '../extractJsonObject';
import { callOllamaNonStreaming } from '../ollama';

export interface EvaluationResult {
	thought: string;
	resolvedItems: string[];
	unresolvedItems: string[];
	nextQueries: string[];
	/** Set when parsing succeeds; omitted on total failure fallback. */
	confidence?: number;
	needsMore: boolean;
}

function buildEvaluatorSystemPrompt(minRounds: number, maxRounds: number, confidenceThreshold: number) {
	return `You are a research quality evaluator. Given a user's question, a checklist of stop criteria, and the research gathered so far, assess how complete the research is.

RULES:
- Check each stop criterion: mark it "resolved" if the research clearly addresses it, "unresolved" otherwise
- confidence: a number from 0.0 to 1.0 representing how completely the research answers the question (0 = nothing found, 1 = fully answered with strong evidence)
- If needsMore is true, provide 1-3 specific nextQueries to fill the gaps (DIFFERENT from any queries already tried)
- Be honest and critical — do not over-estimate confidence
- Until round ${minRounds} of ${maxRounds}, be conservative: prefer needsMore true with concrete nextQueries unless multiple independent sources clearly satisfy every stop criterion. Use confidence >= ${confidenceThreshold} only when evidence is strong.
- Return ONLY valid JSON, no markdown, no explanation

Output format:
{
  "thought": "Brief analysis of what was found and what is missing",
  "resolvedItems": ["criterion that is now satisfied", ...],
  "unresolvedItems": ["criterion still missing", ...],
  "nextQueries": ["gap-filling query 1", ...],
  "confidence": 0.65,
  "needsMore": true
}`;
}

function parseEvaluationFromRaw(
	raw: string,
	previousQueries: string[],
	confidenceThreshold: number
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
	const nextQueries = Array.isArray(parsed.nextQueries)
		? parsed.nextQueries
				.filter((q) => typeof q === 'string' && q.trim())
				.filter((q) => !previousQueries.some((prev) => prev.toLowerCase() === q.toLowerCase()))
				.slice(0, 3)
		: [];

	const rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
	const confidence = Math.max(0, Math.min(1, rawConfidence));

	const needsMore =
		(typeof parsed.needsMore === 'boolean' ? parsed.needsMore : confidence < confidenceThreshold) &&
		nextQueries.length > 0;

	return {
		thought: typeof parsed.thought === 'string' ? parsed.thought : 'Evaluation complete',
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
	confidenceThreshold: number
): Promise<EvaluationResult> {
	const contextForEval = buildEvalContext(accumulatedContext);

	const userMessage = `User Question: ${userQuery}

Stop Criteria (checklist — mark each as resolved or unresolved):
${stopCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Queries already tried (do NOT repeat these in nextQueries):
${previousQueries.slice(-12).map((q) => `- ${q}`).join('\n')}

Research gathered so far (Round ${round} of ${maxRounds}, minimum rounds before easy stop: ${minRounds}):
${contextForEval}

Evaluate completeness and return JSON.`;

	const systemPrompt = buildEvaluatorSystemPrompt(minRounds, maxRounds, confidenceThreshold);

	let lastErr: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const suffix =
				attempt > 0
					? '\n\nCRITICAL: Your previous reply was not valid JSON. Output exactly ONE JSON object with keys thought, resolvedItems, unresolvedItems, nextQueries, confidence, needsMore. No markdown fences, no text before or after the JSON.'
					: '';
			const raw = await callOllamaNonStreaming(
				[{ role: 'user', content: userMessage + suffix }],
				systemPrompt,
				{ numPredict: 2048 }
			);
			return parseEvaluationFromRaw(raw, previousQueries, confidenceThreshold);
		} catch (e) {
			lastErr = e;
			console.warn(`[IterationEvaluator] attempt ${attempt + 1}/3 failed:`, e);
		}
	}

	console.error('[IterationEvaluator] Failed after retries:', lastErr);
	return {
		thought: 'Evaluation failed — proceeding with available research.',
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
