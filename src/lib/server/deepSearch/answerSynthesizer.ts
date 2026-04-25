import { extractFirstJsonObject } from '../extractJsonObject';
import {
	createOllamaStream,
	isOllamaTimeoutError,
	callOllamaNonStreaming,
	type OllamaMessage
} from '../ollama';
import { RESPONSE_LANGUAGE_KO, WEB_FIRST_GROUNDING } from '../promptLocale';
import type { AxiosResponse } from 'axios';
import { finalizeDeepSearchSynthesis } from './citationSanitizer';

const SYNTHESIZER_SYSTEM_PROMPT = `${RESPONSE_LANGUAGE_KO}

${WEB_FIRST_GROUNDING}

You are a thorough research assistant. The research below is the only factual source. Your job is first to **extract and organize** what it actually says, then briefly interpret—never the reverse.

MANDATORY SECTION ORDER (all headings and body in Korean except URLs/quotes):
1. ### 조사에서 확인된 내용 — **Start here.** Bulleted list of everything the research text explicitly names or quotes: product names, brands, nicknames, trends, numbers, dates. **Reuse the exact wording from snippets or page text** for those names (do not substitute well-known generic examples). Every substantive bullet should include a markdown link with the EXACT URL from the research context. If the research mentions specific trendy snacks (or any domain), those strings must appear here before any general discussion. Do not pad with unrelated categories (e.g. perfume) or clichés (e.g. "떡볶이") unless those words literally appear in the research.
2. ### 근거 시점 — Short: which dates or "as of" phrases appear in the research for key claims; if none, one honest Korean sentence. If the research is stale relative to the user's question date, say so clearly.
3. ### 정리·해석 — **Only after section 1:** brief cross-source comparison, limitations, or "what this implies" in Korean. **Do not introduce new proper nouns, products, or facts** that were not already stated in section 1 or clearly quoted from the research. No new examples from training data. This section should be relatively short unless the user clearly needs deep interpretation.

Additional rules:
- Base every factual claim on the research below — do NOT add facts from training data that are not supported by the research
- When referencing a source, cite as markdown link with EXACT URL from the research: e.g. [출처 제목](https://exact-url-from-research.com)
- NEVER invent, guess, or paraphrase URLs
- Every number, percentage, index level, and calendar date must appear verbatim in the research snippets or page text; if missing, say in Korean it was not found in the gathered sources
- Do NOT use markdown tables. Prefer bullets with quoted figures and a markdown link on the same or next line
- Further ### subsections are allowed **only** for domain-specific detail that still cites the research (e.g. market metrics). Cross-cutting "synthesis" that merges sources belongs in ### 정리·해석, not in section 1
- Do NOT add "## 참고 자료" or "## References" — the system appends a verified list
- If aspects could not be researched, say so honestly in Korean
- For markets (stocks, indices, valuation): tie claims to PER/PBR only when those metrics appear in the research; otherwise state what is missing (in Korean)`;

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

async function pipeOllamaChatStream(
	response: AxiosResponse,
	enqueue: (data: Record<string, unknown>) => void,
	sendClientDone: boolean,
	onToken?: (token: string) => void
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		let buffer = '';
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			if (sendClientDone) {
				enqueue({ type: 'done' });
			}
			resolve();
		};

		const handleParsed = (parsed: { message?: { content?: string }; done?: boolean }) => {
			if (parsed.message?.content) {
				onToken?.(parsed.message.content);
				enqueue({ type: 'token', content: parsed.message.content });
			}
			if (parsed.done) {
				finish();
			}
		};

		response.data.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					handleParsed(JSON.parse(line));
				} catch {
					// skip malformed lines
				}
			}
		});

		response.data.on('end', () => {
			if (buffer.trim()) {
				try {
					handleParsed(JSON.parse(buffer));
				} catch {
					// skip
				}
			}
			finish();
		});

		response.data.on('error', (err: Error) => {
			reject(err);
		});
	});
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
	conversationHistory: OllamaMessage[],
	currentDate: string,
	enqueue: (data: Record<string, unknown>) => void,
	streamKind: 'synthesis' | 'section'
): Promise<void> {
	const systemPrompt = `${SYNTHESIZER_SYSTEM_PROMPT}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED ===
${researchContext}
=== END RESEARCH ===`;

	const messages: OllamaMessage[] = [
		...conversationHistory,
		{ role: 'user', content: userQuery }
	];

	let accumulated = '';
	const response = await createOllamaStream(messages, systemPrompt, { streamKind });
	await pipeOllamaChatStream(response, enqueue, false, (t) => {
		accumulated += t;
	});
	emitSynthesisFinalizeAndDone(accumulated, researchContext, enqueue);
}

export async function synthesizeAnswer(
	userQuery: string,
	researchContext: string,
	conversationHistory: OllamaMessage[],
	currentDate: string,
	enqueue: (data: Record<string, unknown>) => void
): Promise<void> {
	try {
		const researchForOutline = researchContext.slice(0, 16000);
		let outlineRaw = '';
		try {
			outlineRaw = await callOllamaNonStreaming(
				[
					{
						role: 'user',
						content: `사용자 질문(최종 보고서는 한국어):\n${userQuery}\n\n계획용 연구 발췌(잘릴 수 있음):\n${researchForOutline}`
					}
				],
				OUTLINE_SYSTEM_PROMPT,
				{ numPredict: 1536 }
			);
		} catch (outlineErr) {
			console.warn('[answerSynthesizer] Outline request failed, using single-pass synthesis:', outlineErr);
			outlineRaw = '';
		}

		const sections = parseOutlineSections(outlineRaw).slice(0, 5);

		if (sections.length < 2) {
			await streamSinglePassSynthesis(
				userQuery,
				researchContext,
				conversationHistory,
				currentDate,
				enqueue,
				'synthesis'
			);
			return;
		}

		let draftAccum = '';

		for (let i = 0; i < sections.length; i++) {
			const sec = sections[i];
			const isFirstSection = i === 0;
			const isLastSection = i === sections.length - 1;
			const firstSectionExtra = isFirstSection
				? `
- 이 절은 전체 보고서의 **제1절(근거 추출)**이다. 불릿·짧은 문장 위주로 RESEARCH GATHERED에 **실제로 등장한** 고유명·상품명·브랜드·수치를 빠짐없이 옮긴다. 연구에 없는 유명 예시·상투적 간식·무관 카테고리로 채우지 않는다. 분량은 나열량에 맞추되 허수 장문 금지.`
				: '';
			const lastSectionExtra = isLastSection
				? `
- 이 절은 **정리·해석**이다. 앞 절들·연구에 이미 나온 내용만 재정렬·비교·한계 제시한다. **새로운 고유명사·사실·예시를 도입하지 않는다.**`
				: '';
			const midSectionExtra =
				!isFirstSection && !isLastSection
					? `
- 이 절은 중간 주제 절이다. 연구에 근거한 구체 항목·비교만 서술하고, 교차 요약은 가능하나 **연구에 없는 이름·사례는 넣지 않는다.**`
					: '';

			const sectionSystem = `${SYNTHESIZER_SYSTEM_PROMPT}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED ===
${researchContext}
=== END RESEARCH ===

You are writing ONE section of a longer Korean report (part ${i + 1} of ${sections.length}).
- Write ONLY this section using a level-3 markdown heading: ### ${sec.title}
- Section focus: ${sec.focus}
- 본문은 한국어로만 작성한다. 연구에 나온 URL로 마크다운 링크를 단다.
- 질문 전체를 제목으로 반복하지 않는다. 이 절에서 "## 참고 자료" 섹션을 만들지 않는다.
- CRITICAL: 모든 숫자·날짜·비율·통계명은 위 RESEARCH GATHERED에 그대로 있을 때만 쓴다. 이 절에 필요한 자료가 없거나 과거 연도에만 있으면 한국어로 명시하고 학습 지식으로 채우지 않는다.${firstSectionExtra}${midSectionExtra}${lastSectionExtra}`;

			const sectionUser = `섹션 ${i + 1}/${sections.length}만 작성한다: "${sec.title}". 위 연구 블록에만 근거한다.`;

			const messages: OllamaMessage[] = [
				...conversationHistory,
				{ role: 'user', content: sectionUser }
			];

			const response = await createOllamaStream(messages, sectionSystem, { streamKind: 'section' });
			await pipeOllamaChatStream(response, enqueue, false, (t) => {
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
		if (isOllamaTimeoutError(error)) {
			msg = '합성 중 Ollama 응답이 지연되어 타임아웃되었습니다. 잠시 후 다시 시도해 주세요.';
		} else if (error instanceof Error) {
			msg = error.message;
		}
		enqueue({ type: 'error', message: msg });
	}
}
