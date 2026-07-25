import type { ClaimVerification } from '$lib/types';
import { getDepthConfig, type AnswerDepth } from '../answerDepth';
import { callLlmNonStreaming, type LlmProvider } from '../llm';
import { RESPONSE_LANGUAGE_KO, WEB_FIRST_GROUNDING } from '../promptLocale';

export interface RefineResult {
	thought: string;
	revisedDraft: string;
}

function buildRefinerSystemPrompt(hasEvidence: boolean, depthPrompt: string): string {
	const grounding = hasEvidence
		? WEB_FIRST_GROUNDING
		: '외부 출처가 없으므로 검증되지 않은 주장은 "확인 불가"로 표시하거나 제거한다.';

	return `${RESPONSE_LANGUAGE_KO}

${grounding}

${depthPrompt}

You revise a draft answer based on claim verification results.

RULES:
- Remove or correct unsupported and contradicted claims
- Mark unverifiable claims with "(확인 불가)" in Korean
- Keep supported claims with their evidence citations
- When user-attached URLs (USER-PROVIDED / PRIORITY) conflict with web search results, prefer user-attached sources
- Do NOT shorten the answer when revising — preserve or expand detail for supported claims
- thought: brief Korean explanation of what changed (1-3 sentences)
- revisedDraft: full revised markdown answer in Korean
- Return ONLY valid JSON, no markdown fences

Output format:
{
  "thought": "수정 요약 (한국어)",
  "revisedDraft": "수정된 전체 답변 마크다운"
}`;
}

function parseRefineResult(raw: string, fallbackDraft: string): RefineResult {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end === -1) {
		return { thought: '검증 결과를 반영해 답변을 수정했습니다.', revisedDraft: fallbackDraft };
	}

	try {
		const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<RefineResult>;
		const thought =
			typeof parsed.thought === 'string' && parsed.thought.trim()
				? parsed.thought.trim()
				: '검증 결과를 반영해 답변을 수정했습니다.';
		const revisedDraft =
			typeof parsed.revisedDraft === 'string' && parsed.revisedDraft.trim()
				? parsed.revisedDraft.trim()
				: fallbackDraft;
		return { thought, revisedDraft };
	} catch {
		return { thought: '검증 결과를 반영해 답변을 수정했습니다.', revisedDraft: fallbackDraft };
	}
}

export async function refineAnswer(
	userQuery: string,
	draft: string,
	subQuestions: string[],
	verifications: ClaimVerification[],
	sourceContext: string,
	hasEvidence: boolean,
	provider: LlmProvider = 'local',
	answerDepth: AnswerDepth = 'standard'
): Promise<RefineResult> {
	const config = getDepthConfig(answerDepth);
	const verificationBlock = verifications
		.map(
			(v) =>
				`- [${v.status}] ${v.claim}${v.evidence ? `\n  근거: "${v.evidence}"` : ''}${v.sourceUrl ? `\n  URL: ${v.sourceUrl}` : ''}`
		)
		.join('\n');

	const userMessage = `Original question: ${userQuery}

Sub-questions:
${subQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Current draft:
---
${draft.slice(0, config.refineDraftChars)}
---

Claim verification results:
${verificationBlock}

${hasEvidence ? `\nSource text (for reference):\n${sourceContext.slice(0, config.refineSourceChars)}` : '\n(No external sources.)'}

Revise the draft. Do not shorten supported content. Return JSON only.`;

	const raw = await callLlmNonStreaming(
		[{ role: 'user', content: userMessage }],
		buildRefinerSystemPrompt(hasEvidence, config.depthPrompt),
		{ provider, numPredict: config.numPredictNonStream }
	);

	return parseRefineResult(raw, draft);
}
