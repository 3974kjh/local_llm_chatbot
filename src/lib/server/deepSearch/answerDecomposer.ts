import { extractFirstJsonObject } from '../extractJsonObject';
import { callLlmNonStreaming, type LlmProvider } from '../llm';

export interface DraftClaim {
	claim: string;
	subQuestionIndex: number;
}

export interface DecomposeResult {
	subQuestions: string[];
	claims: DraftClaim[];
}

const DECOMPOSE_SYSTEM_PROMPT = `You decompose a draft answer into verifiable sub-questions and atomic claims.

언어: subQuestions와 claims의 claim 필드는 반드시 한국어로 작성한다. JSON 키 이름은 영어로 유지한다.

RULES:
- subQuestions: 2-6개. 원래 사용자 질문을 완전히 답하려면 반드시 확인해야 할 하위 질문.
- claims: 초안 답변에서 추출한 사실 주장. 각 주장은 하나의 검증 가능한 문장.
- subQuestionIndex: 해당 주장이 답하는 subQuestions 배열의 0-based 인덱스.
- 중복 주장 제거. 의견·해석은 최소화하고 사실 주장 위주.
- Return ONLY valid JSON, no markdown.

Output format:
{
  "subQuestions": ["하위 질문 1?", "하위 질문 2?"],
  "claims": [
    { "claim": "사실 주장 문장", "subQuestionIndex": 0 }
  ]
}`;

function parseDecomposeResult(raw: string): DecomposeResult {
	const jsonStr = extractFirstJsonObject(raw);
	if (!jsonStr) throw new Error('No JSON in decomposer response');

	const parsed = JSON.parse(jsonStr) as Partial<DecomposeResult>;

	const subQuestions = Array.isArray(parsed.subQuestions)
		? parsed.subQuestions.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
		: [];

	const claims: DraftClaim[] = [];
	if (Array.isArray(parsed.claims)) {
		for (const c of parsed.claims) {
			if (!c || typeof c !== 'object') continue;
			const claim = (c as { claim?: unknown }).claim;
			const idx = (c as { subQuestionIndex?: unknown }).subQuestionIndex;
			if (typeof claim !== 'string' || !claim.trim()) continue;
			const subQuestionIndex =
				typeof idx === 'number' && idx >= 0 && idx < subQuestions.length ? idx : 0;
			claims.push({ claim: claim.trim(), subQuestionIndex });
		}
	}

	if (subQuestions.length === 0) {
		subQuestions.push('이 질문에 대한 핵심 답변이 맞는가?');
	}
	if (claims.length === 0) {
		claims.push({ claim: '초안의 핵심 주장이 타당하다.', subQuestionIndex: 0 });
	}

	return { subQuestions, claims };
}

export async function decomposeAnswer(
	userQuery: string,
	draft: string,
	provider: LlmProvider = 'local'
): Promise<DecomposeResult> {
	const userMessage = `Original question: ${userQuery}

Draft answer to decompose:
---
${draft.slice(0, 12000)}
---

Decompose into subQuestions and claims. Return JSON only.`;

	try {
		const raw = await callLlmNonStreaming(
			[{ role: 'user', content: userMessage }],
			DECOMPOSE_SYSTEM_PROMPT,
			{ provider }
		);
		return parseDecomposeResult(raw);
	} catch (err) {
		console.warn('[Decomposer] Failed, using fallback:', (err as Error).message);
		return {
			subQuestions: [`${userQuery}에 대한 답변이 정확한가?`],
			claims: [{ claim: draft.slice(0, 200), subQuestionIndex: 0 }]
		};
	}
}
