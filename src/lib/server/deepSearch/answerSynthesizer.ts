import { extractFirstJsonObject } from '../extractJsonObject';
import {
	createOllamaStream,
	isOllamaTimeoutError,
	callOllamaNonStreaming,
	type OllamaMessage
} from '../ollama';
import { RESPONSE_LANGUAGE_KO, WEB_FIRST_GROUNDING } from '../promptLocale';
import type { AxiosResponse } from 'axios';

const SYNTHESIZER_SYSTEM_PROMPT = `${RESPONSE_LANGUAGE_KO}

${WEB_FIRST_GROUNDING}

You are a thorough research assistant. Using the comprehensive research gathered through multiple search iterations, provide a well-structured, accurate, and complete answer to the user's question.

GUIDELINES:
- Base your answer ONLY on the research provided below — do NOT add facts from your training data if they are not in the research
- When referencing a source, cite it as a markdown link using the EXACT URL from the research context: e.g. [출처 제목](https://exact-url-from-research.com)
- NEVER invent, guess, or paraphrase URLs — only use URLs that appear verbatim in the research context
- Every number, percentage, index level, and calendar date in the body must appear verbatim in the research snippets or detailed page text below. If a figure is not in the research, write explicitly in Korean that it was not found in the gathered sources — do not fill gaps from memory.
- Do NOT use markdown tables. Prefer bullets with quoted figures and a markdown link on the same or next line.
- Open with a short "### 데이터 시점" (or "### 근거 시점") section in Korean: list which dates or "as of" phrases actually appear in the research for key figures. If the research is stale vs the user's question date, say so clearly in Korean.
- Use markdown formatting for clarity (headers, bullet points, code blocks where appropriate)
- At the very end, add a "## 참고 자료" section listing all referenced URLs as a numbered markdown list: \`1. [제목](URL)\`. Do not list "homepage" names without URLs.
- If certain aspects couldn't be fully researched, acknowledge this honestly in Korean
- Aim for depth: multiple sections with clear headings, substantial paragraphs, and synthesis across sources (not a short summary unless the evidence is genuinely thin)
- For markets (stocks, indices, valuation): tie claims to PER/PBR or other metrics only when those metrics appear in the research; otherwise state which metrics are missing from the sources (in Korean).`;

const OUTLINE_SYSTEM_PROMPT = `You split a research report into sections for a Korean final report. Return ONLY valid JSON, no markdown.

Output format:
{
  "sections": [
    { "title": "한국어 소제목", "focus": "이 절에서 다룰 내용(1–2문장, 한국어). 연구 자료에만 근거할 것을 명시한다." }
  ]
}

RULES:
- Produce 4 to 7 sections that together fully address the user's question
- Every "title" and "focus" string must be in Korean
- Titles must be unique and specific
- Each section "focus" must demand evidence from the research only (no invented statistics)
- Do not include an outline of the 참고 자료 section — the writer adds "## 참고 자료" at the end`;

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

	const response = await createOllamaStream(messages, systemPrompt, { streamKind });
	await pipeOllamaChatStream(response, enqueue, true, undefined);
}

export async function synthesizeAnswer(
	userQuery: string,
	researchContext: string,
	conversationHistory: OllamaMessage[],
	currentDate: string,
	enqueue: (data: Record<string, unknown>) => void
): Promise<void> {
	try {
		const researchForOutline = researchContext.slice(0, 12000);
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
			const sectionSystem = `${SYNTHESIZER_SYSTEM_PROMPT}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED ===
${researchContext}
=== END RESEARCH ===

You are writing ONE section of a longer Korean report (part ${i + 1} of ${sections.length}).
- Write ONLY this section using a level-3 markdown heading: ### ${sec.title}
- Section focus: ${sec.focus}
- 본문은 한국어로만 작성한다. 연구가 뒷받침할 때 최소 약 200단어 분량으로 구체적으로 쓰고, 연구에 나온 URL로 마크다운 링크를 단다.
- 질문 전체를 제목으로 반복하지 않는다. 이 절에서 "## 참고 자료" 섹션을 만들지 않는다.
- CRITICAL: 모든 숫자·날짜·비율·통계명은 위 RESEARCH GATHERED에 그대로 있을 때만 쓴다. 이 절에 필요한 자료가 없거나 과거 연도에만 있으면 한국어로 명시하고 학습 지식으로 채우지 않는다.`;

			const sectionUser = `섹션 ${i + 1}/${sections.length}만 작성한다: "${sec.title}". 위 연구 블록에만 근거한다.`;

			const messages: OllamaMessage[] = [
				...conversationHistory,
				{ role: 'user', content: sectionUser }
			];

			const response = await createOllamaStream(messages, sectionSystem, { streamKind: 'section' });
			const isLastSection = i === sections.length - 1;
			await pipeOllamaChatStream(response, enqueue, false, (t) => {
				draftAccum += t;
			});

			if (!isLastSection) {
				const sep = '\n\n';
				draftAccum += sep;
				enqueue({ type: 'token', content: sep });
			}
		}

		const draftTail = draftAccum.trim().slice(-14000);
		const sourcesUser = `아래는 사용자에게 이미 보여 준 보고서 초안이다. 초안 본문은 수정하지 않는다.

---DRAFT---
${draftTail}
---END---

마크다운 섹션 하나만 출력한다. 제목은 반드시 "## 참고 자료"로 시작한다. 초안에 마크다운 링크 형태로 등장한 서로 다른 http(s) URL을 번호 목록으로 모두 적는다. URL이 없으면 한 줄로 초안에 마크다운 링크 URL이 없었다고 한국어로 적는다.`;

		const sourcesSystem = `${SYNTHESIZER_SYSTEM_PROMPT}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED (for resolving link titles if needed) ===
${researchContext.slice(0, 8000)}
=== END RESEARCH ===

사용자 지시를 정확히 따른다. "## 참고 자료" 섹션만 출력한다.`;

		const sourcesResponse = await createOllamaStream(
			[...conversationHistory, { role: 'user', content: sourcesUser }],
			sourcesSystem,
			{ streamKind: 'synthesis' }
		);
		await pipeOllamaChatStream(sourcesResponse, enqueue, true, undefined);
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
