import { callOllamaNonStreaming } from '../ollama';

export interface EvaluationResult {
	thought: string;
	needsMore: boolean;
	refinedQueries: string[];
}

const EVALUATOR_SYSTEM_PROMPT = `You are a research quality evaluator. Given a user's question and the research gathered so far, determine if the information is sufficient for a comprehensive answer.

RULES:
- Be critical but practical — stop when core information is available
- If needsMore is true, provide 1-2 specific refined queries to fill the gaps
- Return ONLY valid JSON, no markdown, no explanation

Output format:
{"thought":"Analysis of what was found and what might be missing","needsMore":true,"refinedQueries":["gap-filling query 1"]}
or
{"thought":"Sufficient information gathered to answer comprehensively","needsMore":false,"refinedQueries":[]}`;

export async function evaluateResearch(
	userQuery: string,
	accumulatedContext: string,
	iteration: number,
	maxIterations: number
): Promise<EvaluationResult> {
	if (iteration >= maxIterations) {
		return {
			thought: `Reached maximum iterations (${maxIterations}). Proceeding with available research.`,
			needsMore: false,
			refinedQueries: []
		};
	}

	const contextPreview =
		accumulatedContext.length > 6000
			? accumulatedContext.slice(0, 6000) + '\n...[truncated]'
			: accumulatedContext;

	const userMessage = `User Question: ${userQuery}

Research gathered so far:
${contextPreview}

Evaluate if this is sufficient to answer the question comprehensively. Return JSON.`;

	try {
		const raw = await callOllamaNonStreaming(
			[{ role: 'user', content: userMessage }],
			EVALUATOR_SYSTEM_PROMPT
		);

		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch) throw new Error('No JSON in evaluator response');

		const parsed = JSON.parse(jsonMatch[0]) as Partial<EvaluationResult>;

		const needsMore = typeof parsed.needsMore === 'boolean' ? parsed.needsMore : false;
		const refinedQueries = Array.isArray(parsed.refinedQueries)
			? parsed.refinedQueries.filter((q) => typeof q === 'string' && q.trim()).slice(0, 2)
			: [];

		return {
			thought: typeof parsed.thought === 'string' ? parsed.thought : 'Evaluation complete',
			needsMore: needsMore && refinedQueries.length > 0,
			refinedQueries
		};
	} catch (err) {
		console.error('[IterationEvaluator] Failed, stopping loop:', err);
		return {
			thought: 'Evaluation failed. Proceeding with available research.',
			needsMore: false,
			refinedQueries: []
		};
	}
}
