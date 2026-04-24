import { callOllamaNonStreaming } from '../ollama';

export interface QueryPlan {
	subQueries: string[];
	strategy: string;
}

const PLANNER_SYSTEM_PROMPT = `You are a research planning assistant. Given a user's question, decompose it into 2-3 specific web search queries that together will provide comprehensive information to answer the question.

RULES:
- Each sub-query should target a different aspect of the question
- Queries should be specific and search-engine friendly
- Include the current year in time-sensitive queries
- Return ONLY valid JSON, no markdown code blocks, no explanation

Output format:
{"subQueries":["query1","query2","query3"],"strategy":"One sentence describing the research approach"}`;

export async function planQuery(
	userQuery: string,
	currentDate: string,
	conversationContext: string,
	priorResearchFromAttachments?: string
): Promise<QueryPlan> {
	const userMessage = `Question: ${userQuery}
Current date: ${currentDate}
${conversationContext ? `Conversation context: ${conversationContext}` : ''}
${priorResearchFromAttachments ? `Research already extracted from user-attached URLs (use this; do not repeat the same URLs as search-only sub-queries unless you need cross-checking):\n${priorResearchFromAttachments.slice(0, 4500)}\n` : ''}

Generate a research plan as JSON.`;

	try {
		const raw = await callOllamaNonStreaming(
			[{ role: 'user', content: userMessage }],
			PLANNER_SYSTEM_PROMPT
		);

		const jsonMatch = raw.match(/\{[\s\S]*\}/);
		if (!jsonMatch) throw new Error('No JSON found in planner response');

		const parsed = JSON.parse(jsonMatch[0]) as Partial<QueryPlan>;

		const subQueries = Array.isArray(parsed.subQueries)
			? parsed.subQueries.filter((q) => typeof q === 'string' && q.trim()).slice(0, 3)
			: [];

		if (subQueries.length === 0) throw new Error('No valid sub-queries in plan');

		return {
			subQueries,
			strategy: typeof parsed.strategy === 'string' ? parsed.strategy : 'Multi-angle research'
		};
	} catch (err) {
		console.error('[QueryPlanner] Failed, falling back to single query:', err);
		return {
			subQueries: [userQuery],
			strategy: 'Direct search (planner fallback)'
		};
	}
}
