import { extractFirstJsonObject } from '../extractJsonObject';
import { WEB_FIRST_GROUNDING } from '../promptLocale';
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

${WEB_FIRST_GROUNDING}
플래너는 사용자에게 직접 보이지 않지만, strategy·subQuestions·stopCriteria의 모든 문장은 한국어로 작성한다. subQueries는 한국어·영어·혼용 모두 허용(검색 품질 우선). JSON 키 이름은 영어로 유지한다.

RULES:
- subQueries: 2-4개. 질문의 서로 다른 각도를 덮는다. 사용자 메시지의 캘린더 날짜(YYYY-MM-DD)를 각 subQuery에 반드시 포함한다.
- 시장·지수·밸류(KOSPI, KOSDAQ, PER, PBR 등): 1개 이상은 KRX·지수 팩트시트·실적/밸류 등 1차·데이터 밀도 높은 출처를 노리는 쿼리를 넣는다. 지수 수준 vs 밸류 배수는 가능하면 서로 다른 subQuery로 나눈다.
- subQuestions: 3-6개. 연구로 반드시 답해야 할 하위 질문(한국어 문장).
- stopCriteria: 3-5개. 검증 가능한 기준(한국어). 밸류 주제면 스니펫/본문에 인용된 PER·PBR 등, 지수·출처 날짜, 사용자 캘린더와 출처 날짜의 심각한 불일치 여부 등을 포함한다.
- strategy: 연구 접근을 한 문장으로 한국어로 요약한다.
- Return ONLY valid JSON, no markdown, no explanation

Output format:
{
  "subQueries": ["query1", "query2", "query3"],
  "strategy": "한 문장 한국어 요약",
  "subQuestions": ["하위 질문 1?", "하위 질문 2?"],
  "stopCriteria": ["기준 1", "기준 2"]
}`;

export async function planQuery(
	userQuery: string,
	currentDate: string,
	conversationContext: string,
	priorResearchFromAttachments: string | undefined,
	calendarDateIso: string
): Promise<QueryPlan> {
	const userMessage = `Question: ${userQuery}
Current date: ${currentDate}
Calendar date for search recency (each subQuery must include this exact YYYY-MM-DD): ${calendarDateIso}
${conversationContext ? `Conversation context:\n${conversationContext}` : ''}
${priorResearchFromAttachments ? `\nResearch already extracted from user-attached URLs (factor this into your plan — do not repeat searches for content already found):\n${priorResearchFromAttachments.slice(0, 3000)}\n` : ''}

연구 계획을 JSON으로만 출력한다.`;

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
			strategy: typeof parsed.strategy === 'string' ? parsed.strategy : '다각도 웹 검색으로 질문을 분해해 조사한다.',
			subQuestions:
				subQuestions.length > 0 ? subQuestions : [`다음 질문에 답할 수 있을 만큼 자료를 모은다: ${userQuery}`],
			stopCriteria:
				stopCriteria.length > 0 ? stopCriteria : ['질문에 답하는 데 필요한 핵심 정보가 수집되었다.']
		};
	} catch (err) {
		console.error('[QueryPlanner] Failed, falling back to single query:', err);
		return {
			subQueries: [userQuery],
			strategy: '플래너 실패로 질의어를 그대로 검색한다.',
			subQuestions: [`다음에 답한다: ${userQuery}`],
			stopCriteria: ['핵심 정보가 수집되어 질문에 답할 수 있다.']
		};
	}
}
