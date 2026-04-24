import { extractFirstJsonObject } from '../extractJsonObject';
import { callOllamaNonStreaming } from '../ollama';

export interface QueryPlan {
	subQueries: string[];
	strategy: string;
	/** Fine-grained sub-questions that must be answered for the research to be complete */
	subQuestions: string[];
	/** Concrete, verifiable stop criteria — the evaluator checks these as a checklist */
	stopCriteria: string[];
}

const PLANNER_SYSTEM_PROMPT = `You are a research planning assistant. Given a user's question, produce a structured research plan.

RULES:
- subQueries: 2-4 specific web search queries covering different angles of the question
- subQuestions: 3-6 precise sub-questions the research must answer (e.g. "What is the official definition of X?", "What are the main limitations of Y?")
- stopCriteria: 3-5 concrete, verifiable criteria that indicate when enough evidence has been gathered (e.g. "Found at least 2 primary sources defining X", "Found concrete numerical data for Y")
- strategy: one sentence describing the research approach
- Return ONLY valid JSON, no markdown, no explanation

Output format:
{
  "subQueries": ["query1", "query2", "query3"],
  "strategy": "Research approach in one sentence",
  "subQuestions": ["Sub-question 1?", "Sub-question 2?", "Sub-question 3?"],
  "stopCriteria": ["Criterion 1", "Criterion 2", "Criterion 3"]
}`;

export async function planQuery(
	userQuery: string,
	currentDate: string,
	conversationContext: string,
	priorResearchFromAttachments?: string
): Promise<QueryPlan> {
	const userMessage = `Question: ${userQuery}
Current date: ${currentDate}
${conversationContext ? `Conversation context:\n${conversationContext}` : ''}
${priorResearchFromAttachments ? `\nResearch already extracted from user-attached URLs (factor this into your plan — do not repeat searches for content already found):\n${priorResearchFromAttachments.slice(0, 3000)}\n` : ''}

Generate a research plan as JSON.`;

	try {
		const raw = await callOllamaNonStreaming(
			[{ role: 'user', content: userMessage }],
			PLANNER_SYSTEM_PROMPT
		);

		const jsonStr = extractFirstJsonObject(raw);
		if (!jsonStr) throw new Error('No JSON in planner response');

		const parsed = JSON.parse(jsonStr) as Partial<QueryPlan>;

		const subQueries = Array.isArray(parsed.subQueries)
			? parsed.subQueries.filter((q) => typeof q === 'string' && q.trim()).slice(0, 4)
			: [];

		const subQuestions = Array.isArray(parsed.subQuestions)
			? parsed.subQuestions.filter((q) => typeof q === 'string' && q.trim()).slice(0, 6)
			: [];

		const stopCriteria = Array.isArray(parsed.stopCriteria)
			? parsed.stopCriteria.filter((c) => typeof c === 'string' && c.trim()).slice(0, 5)
			: [];

		if (subQueries.length === 0) throw new Error('No valid sub-queries in plan');

		return {
			subQueries,
			strategy: typeof parsed.strategy === 'string' ? parsed.strategy : 'Multi-angle research',
			subQuestions: subQuestions.length > 0 ? subQuestions : [`Answer the main question: ${userQuery}`],
			stopCriteria: stopCriteria.length > 0 ? stopCriteria : ['Sufficient information gathered to answer the question']
		};
	} catch (err) {
		console.error('[QueryPlanner] Failed, falling back to single query:', err);
		return {
			subQueries: [userQuery],
			strategy: 'Direct search (planner fallback)',
			subQuestions: [`Answer: ${userQuery}`],
			stopCriteria: ['Core information found to answer the question']
		};
	}
}
