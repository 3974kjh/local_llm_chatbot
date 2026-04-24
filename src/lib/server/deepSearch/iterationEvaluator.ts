import { callOllamaNonStreaming } from '../ollama';

export interface EvaluationResult {
	thought: string;
	resolvedItems: string[];
	unresolvedItems: string[];
	nextQueries: string[];
	/** 0.0 – 1.0: estimated completeness of the research */
	confidence: number;
	needsMore: boolean;
}

const EVALUATOR_SYSTEM_PROMPT = `You are a research quality evaluator. Given a user's question, a checklist of stop criteria, and the research gathered so far, assess how complete the research is.

RULES:
- Check each stop criterion: mark it "resolved" if the research clearly addresses it, "unresolved" otherwise
- confidence: a number from 0.0 to 1.0 representing how completely the research answers the question (0 = nothing found, 1 = fully answered with strong evidence)
- If needsMore is true, provide 1-3 specific nextQueries to fill the gaps (DIFFERENT from any queries already tried)
- Be honest and critical — do not over-estimate confidence
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

export async function evaluateResearch(
	userQuery: string,
	stopCriteria: string[],
	accumulatedContext: string,
	previousQueries: string[],
	round: number
): Promise<EvaluationResult> {
	// Hierarchical context: always include full source index, truncate page content
	const contextForEval = buildEvalContext(accumulatedContext);

	const userMessage = `User Question: ${userQuery}

Stop Criteria (checklist — mark each as resolved or unresolved):
${stopCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Queries already tried (do NOT repeat these in nextQueries):
${previousQueries.slice(-12).map((q) => `- ${q}`).join('\n')}

Research gathered so far (Round ${round}):
${contextForEval}

Evaluate completeness and return JSON.`;

	try {
		const raw = await callOllamaNonStreaming(
			[{ role: 'user', content: userMessage }],
			EVALUATOR_SYSTEM_PROMPT
		);

		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch) throw new Error('No JSON in evaluator response');

		const parsed = JSON.parse(jsonMatch[0]) as Partial<EvaluationResult>;

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
			(typeof parsed.needsMore === 'boolean' ? parsed.needsMore : confidence < 0.85) &&
			nextQueries.length > 0;

		return {
			thought: typeof parsed.thought === 'string' ? parsed.thought : 'Evaluation complete',
			resolvedItems,
			unresolvedItems,
			nextQueries,
			confidence,
			needsMore
		};
	} catch (err) {
		console.error('[IterationEvaluator] Failed:', err);
		return {
			thought: 'Evaluation failed — proceeding with available research.',
			resolvedItems: [],
			unresolvedItems: stopCriteria,
			nextQueries: [],
			confidence: 0.4,
			needsMore: false
		};
	}
}

/**
 * Build an evaluation-friendly context string.
 * Keeps the full source URL index (critical for citation accuracy) but trims
 * per-page body text to avoid exceeding the model context window.
 */
function buildEvalContext(raw: string): string {
	// Split at the boundary between the source index and iteration blocks
	const iterBoundary = raw.indexOf('=== Research Iteration');
	if (iterBoundary === -1) return raw.slice(0, 8000);

	const sourceIndex = raw.slice(0, iterBoundary);
	const iterBlocks = raw.slice(iterBoundary);

	// Truncate each "Detailed Page Content" section to 800 chars to save tokens
	const trimmedBlocks = iterBlocks.replace(
		/(Detailed Page Content:\n)([\s\S]*?)(?=\n===|$)/g,
		(_, label, body) => label + body.slice(0, 1600) + (body.length > 1600 ? '\n...[trimmed]' : '')
	);

	const combined = sourceIndex + trimmedBlocks;
	// Hard cap: 9k chars so the full prompt + JSON output fits in an 8k-token model
	return combined.length > 9000 ? combined.slice(0, 9000) + '\n...[truncated]' : combined;
}
