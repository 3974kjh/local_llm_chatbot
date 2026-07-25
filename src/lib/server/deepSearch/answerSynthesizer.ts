import type { ClaimVerification } from '$lib/types';
import { getDepthConfig, type AnswerDepth } from '../answerDepth';
import { extractFirstJsonObject } from '../extractJsonObject';
import {
	createLlmStream,
	isLlmTimeoutError,
	callLlmNonStreaming,
	pipeLlmChatStream,
	type LlmMessage,
	type LlmProvider
} from '../llm';
import { RESPONSE_LANGUAGE_KO, WEB_FIRST_GROUNDING } from '../promptLocale';
import { finalizeDeepSearchSynthesis } from './citationSanitizer';
import {
	analyzeResearchChunks,
	buildChunkAnalysisContext,
	buildResearchChunks,
	type CollectedText,
	type DeepSearchSynthesisMode
} from './chunkPipeline';

function buildSynthesizerSystemPrompt(depthPrompt: string): string {
	return `${RESPONSE_LANGUAGE_KO}

${WEB_FIRST_GROUNDING}

${depthPrompt}

You are a thorough research assistant. The research and verified draft below are your only factual sources. Extract and organize what they say, then interpret—never the reverse.

MANDATORY SECTION ORDER (all headings and body in Korean except URLs/quotes):
1. ### 조사에서 확인된 내용 — Bulleted list of everything the research text explicitly names or quotes: product names, brands, nicknames, trends, numbers, dates. Reuse exact wording from snippets or page text. Every substantive bullet should include a markdown link with the EXACT URL from the research context.
2. ### 근거 시점 — Which dates or "as of" phrases appear in the research for key claims; if none, one honest Korean sentence. If research is stale relative to the user's question date, say so clearly.
3. ### 정리·해석 — Cross-source comparison, limitations, or implications in Korean. Do not introduce new proper nouns, products, or facts not already stated in section 1 or clearly quoted from the research.

Additional rules:
- Preserve ALL supported claims from the VERIFIED DRAFT — do not delete or distort them; expand with additional research-backed detail where available
- Base every factual claim on the research below — do NOT add facts from training data
- When referencing a source, cite as markdown link with EXACT URL from the research
- NEVER invent, guess, or paraphrase URLs
- Every number, percentage, index level, and calendar date must appear verbatim in the research; if missing, say in Korean it was not found
- Do NOT use markdown tables. Prefer bullets with quoted figures and a markdown link
- Further ### subsections are allowed for domain-specific detail that still cites the research
- Do NOT add "## 참고 자료" or "## References" — the system appends a verified list
- If aspects could not be researched, say so honestly in Korean`;
}

const OUTLINE_SYSTEM_PROMPT = `You split a research report into sections for a Korean final report. Return ONLY valid JSON, no markdown.

Output format:
{
  "sections": [
    { "title": "한국어 소제목", "focus": "이 절에서 다룰 내용(1–2문장, 한국어). 연구 자료에만 근거할 것을 명시한다." }
  ]
}

RULES:
- Produce 4 to 7 sections that together fully address the user's question
- **The FIRST section is mandatory and fixed:** "title" MUST be exactly the Korean string: 조사에서 확인된 내용. Its "focus" MUST say (in Korean) that this section is only bulleted extraction of named entities, quotes, and numbers from the research excerpt—verbatim product/brand names, each with source links—no generic examples or training-data fillers.
- **The LAST section** SHOULD use the title 정리·해석 (or another clearly interpretive-only Korean title). Its "focus" must say: no new proper nouns or facts; only reorganize and comment on what earlier sections established.
- Middle sections (2 through n-1): thematic Korean titles that deepen the topic using only research-backed angles (lists, comparisons, caveats)—still no invented statistics
- Every "title" and "focus" string must be in Korean (except URLs if any)
- Titles must be unique
- Do not include a references / 참고 자료 section — the system appends it automatically`;

interface OutlineSection {
	title: string;
	focus: string;
}

function buildVerifiedDraftBlock(
	verifiedDraft?: string,
	verifications?: ClaimVerification[]
): string {
	if (!verifiedDraft?.trim()) return '';
	const lines = ['=== VERIFIED DRAFT (fact-checked — preserve all supported claims) ===', verifiedDraft.trim()];
	if (verifications && verifications.length > 0) {
		lines.push('', '=== CLAIM VERIFICATION SUMMARY ===');
		for (const v of verifications) {
			lines.push(`- [${v.status}] ${v.claim}`);
		}
	}
	lines.push('=== END VERIFIED DRAFT ===');
	return lines.join('\n');
}

function parseOutlineSections(raw: string): OutlineSection[] {
	const jsonStr = extractFirstJsonObject(raw);
	if (!jsonStr) return [];
	try {
		const parsed = JSON.parse(jsonStr) as { sections?: unknown };
		if (!Array.isArray(parsed.sections)) return [];
		const out: OutlineSection[] = [];
		for (const s of parsed.sections) {
			if (!s || typeof s !== 'object') continue;
			const title = (s as { title?: unknown }).title;
			const focus = (s as { focus?: unknown }).focus;
			if (typeof title !== 'string' || !title.trim()) continue;
			out.push({
				title: title.trim(),
				focus:
					typeof focus === 'string' && focus.trim()
						? focus.trim()
						: '연구 자료에만 근거해 이 항목을 다룬다.'
			});
			if (out.length >= 8) break;
		}
		return out;
	} catch {
		return [];
	}
}

function emitSynthesisFinalizeAndDone(
	rawStreamedMarkdown: string,
	researchContext: string,
	enqueue: (data: Record<string, unknown>) => void
): void {
	const { text } = finalizeDeepSearchSynthesis(rawStreamedMarkdown, researchContext);
	if (text !== rawStreamedMarkdown) {
		enqueue({ type: 'synthesis_final', content: text });
	}
	enqueue({ type: 'done' });
}

async function streamSinglePassSynthesis(
	userQuery: string,
	researchContext: string,
	conversationHistory: LlmMessage[],
	currentDate: string,
	enqueue: (data: Record<string, unknown>) => void,
	streamKind: 'synthesis' | 'section',
	provider: LlmProvider,
	depthPrompt: string
): Promise<void> {
	const systemPrompt = `${buildSynthesizerSystemPrompt(depthPrompt)}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED ===
${researchContext}
=== END RESEARCH ===`;

	const messages: LlmMessage[] = [
		...conversationHistory,
		{ role: 'user', content: userQuery }
	];

	let accumulated = '';
	const response = await createLlmStream(messages, systemPrompt, { provider, streamKind });
	await pipeLlmChatStream(response, provider, enqueue, false, (t) => {
		accumulated += t;
	});
	emitSynthesisFinalizeAndDone(accumulated, researchContext, enqueue);
}

export async function synthesizeAnswer(
	userQuery: string,
	researchContext: string,
	conversationHistory: LlmMessage[],
	currentDate: string,
	enqueue: (data: Record<string, unknown>) => void,
	options?: {
		collectedTexts?: CollectedText[];
		synthesisMode?: DeepSearchSynthesisMode;
		llmProvider?: LlmProvider;
		verifiedDraft?: string;
		verifications?: ClaimVerification[];
		answerDepth?: AnswerDepth;
	}
): Promise<void> {
	try {
		const provider = options?.llmProvider ?? 'local';
		const synthesisMode = options?.synthesisMode ?? 'hybrid';
		const answerDepth = options?.answerDepth ?? 'standard';
		const config = getDepthConfig(answerDepth);
		const verifiedBlock = buildVerifiedDraftBlock(options?.verifiedDraft, options?.verifications);
		const enrichedContext = verifiedBlock
			? `${researchContext}\n\n${verifiedBlock}`
			: researchContext;

		if (synthesisMode === 'raw-only') {
			enqueue({ type: 'done' });
			return;
		}

		const collectedTexts = options?.collectedTexts ?? [];
		const shouldChunkAnalyze =
			(synthesisMode === 'hybrid' || synthesisMode === 'chunked') &&
			collectedTexts.length > 0;

		if (shouldChunkAnalyze && !config.useMultiSectionSynth) {
			const chunks = buildResearchChunks(collectedTexts, {
				targetChars: synthesisMode === 'chunked' ? 2600 : 3200,
				hardMaxChars: synthesisMode === 'chunked' ? 3600 : 4200
			});
			const analyses = await analyzeResearchChunks(chunks, userQuery, currentDate, undefined, provider);
			const chunkContext = buildChunkAnalysisContext(analyses);
			if (chunkContext) {
				const compactContext = `${chunkContext}

=== ORIGINAL RESEARCH (TRIMMED) ===
${enrichedContext.slice(0, config.synthHybridTrimChars)}`;
				await streamSinglePassSynthesis(
					userQuery,
					compactContext,
					conversationHistory,
					currentDate,
					enqueue,
					'synthesis',
					provider,
					config.depthPrompt
				);
				return;
			}
		}

		if (!config.useMultiSectionSynth) {
			await streamSinglePassSynthesis(
				userQuery,
				enrichedContext.slice(0, config.synthContextChars),
				conversationHistory,
				currentDate,
				enqueue,
				'synthesis',
				provider,
				config.depthPrompt
			);
			return;
		}

		const researchForOutline = enrichedContext.slice(0, config.synthContextChars);
		let outlineRaw = '';
		try {
			outlineRaw = await callLlmNonStreaming(
				[
					{
						role: 'user',
						content: `사용자 질문(최종 보고서는 한국어):\n${userQuery}\n\n계획용 연구 발췌(잘릴 수 있음):\n${researchForOutline}`
					}
				],
				OUTLINE_SYSTEM_PROMPT,
				{ provider, numPredict: 2048 }
			);
		} catch (outlineErr) {
			console.warn('[answerSynthesizer] Outline request failed, using single-pass synthesis:', outlineErr);
			outlineRaw = '';
		}

		const sections = parseOutlineSections(outlineRaw).slice(0, config.synthMaxSections);

		if (sections.length < 2) {
			await streamSinglePassSynthesis(
				userQuery,
				enrichedContext.slice(0, config.synthContextChars),
				conversationHistory,
				currentDate,
				enqueue,
				'synthesis',
				provider,
				config.depthPrompt
			);
			return;
		}

		const synthPrompt = buildSynthesizerSystemPrompt(config.depthPrompt);
		const contextForSections = enrichedContext.slice(0, config.synthContextChars);
		let draftAccum = '';

		for (let i = 0; i < sections.length; i++) {
			const sec = sections[i];
			const isFirstSection = i === 0;
			const isLastSection = i === sections.length - 1;
			const firstSectionExtra = isFirstSection
				? `
- 이 절은 전체 보고서의 **제1절(근거 추출)**이다. RESEARCH GATHERED와 VERIFIED DRAFT에 **실제로 등장한** 고유명·상품명·브랜드·수치를 빠짐없이 옮긴다. 연구에 없는 유명 예시로 채우지 않는다. 분량은 나열량에 맞춰 충실히 작성한다.`
				: '';
			const lastSectionExtra = isLastSection
				? `
- 이 절은 **정리·해석**이다. 앞 절들·연구에 이미 나온 내용만 재정렬·비교·한계 제시한다. **새로운 고유명사·사실·예시를 도입하지 않는다.**`
				: '';
			const midSectionExtra =
				!isFirstSection && !isLastSection
					? `
- 이 절은 중간 주제 절이다. 연구에 근거한 구체 항목·비교를 충실히 서술하고, **연구에 없는 이름·사례는 넣지 않는다.**`
					: '';

			const sectionSystem = `${synthPrompt}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED ===
${contextForSections}
=== END RESEARCH ===

You are writing ONE section of a longer Korean report (part ${i + 1} of ${sections.length}).
- Write ONLY this section using a level-3 markdown heading: ### ${sec.title}
- Section focus: ${sec.focus}
- 본문은 한국어로만 작성한다. 연구에 나온 URL로 마크다운 링크를 단다.
- 질문 전체를 제목으로 반복하지 않는다. 이 절에서 "## 참고 자료" 섹션을 만들지 않는다.
- CRITICAL: 모든 숫자·날짜·비율·통계명은 위 RESEARCH GATHERED에 그대로 있을 때만 쓴다.${firstSectionExtra}${midSectionExtra}${lastSectionExtra}`;

			const sectionUser = `섹션 ${i + 1}/${sections.length}만 작성한다: "${sec.title}". 위 연구 블록과 검증된 초안에만 근거한다.`;

			const messages: LlmMessage[] = [
				...conversationHistory,
				{ role: 'user', content: sectionUser }
			];

			const response = await createLlmStream(messages, sectionSystem, {
				provider,
				streamKind: 'section'
			});
			await pipeLlmChatStream(response, provider, enqueue, false, (t) => {
				draftAccum += t;
			});

			if (!isLastSection) {
				const sep = '\n\n';
				draftAccum += sep;
				enqueue({ type: 'token', content: sep });
			}
		}

		emitSynthesisFinalizeAndDone(draftAccum, researchContext, enqueue);
	} catch (error: unknown) {
		let msg = '답변 합성에 실패했습니다.';
		if (isLlmTimeoutError(error)) {
			msg = '합성 중 LLM 응답이 지연되어 타임아웃되었습니다. 잠시 후 다시 시도해 주세요.';
		} else if (error instanceof Error) {
			msg = error.message;
		}
		enqueue({ type: 'error', message: msg });
	}
}
