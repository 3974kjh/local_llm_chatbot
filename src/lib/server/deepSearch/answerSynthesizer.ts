import { extractFirstJsonObject } from '../extractJsonObject';
import {
	createOllamaStream,
	isOllamaTimeoutError,
	callOllamaNonStreaming,
	type OllamaMessage
} from '../ollama';
import type { AxiosResponse } from 'axios';

const SYNTHESIZER_SYSTEM_PROMPT = `You are a thorough research assistant. Using the comprehensive research gathered through multiple search iterations, provide a well-structured, accurate, and complete answer to the user's question.

GUIDELINES:
- Base your answer ONLY on the research provided below — do NOT add facts from your training data if they are not in the research
- When referencing a source, cite it as a markdown link using the EXACT URL from the research context: e.g. [Source Title](https://exact-url-from-research.com)
- NEVER invent, guess, or paraphrase URLs — only use URLs that appear verbatim in the research context
- Use markdown formatting for clarity (headers, bullet points, code blocks where appropriate)
- At the very end, add a "## Sources" section listing all referenced URLs as a numbered markdown list: \`1. [Title](URL)\`
- If certain aspects couldn't be fully researched, acknowledge this honestly
- Aim for depth: multiple sections with clear headings, substantial paragraphs, and synthesis across sources (not a short summary unless the evidence is genuinely thin)
- For markets (stocks, indices): state numbers and dates exactly as they appear in the research; note the source date or session when given`;

const OUTLINE_SYSTEM_PROMPT = `You split a research report into sections. Return ONLY valid JSON, no markdown.

Output format:
{
  "sections": [
    { "title": "Short section heading", "focus": "What this section must cover (1-2 sentences)" }
  ]
}

RULES:
- Produce 4 to 7 sections that together fully address the user's question
- Titles must be unique and specific
- Do not include an outline of the Sources section — the writer adds Sources at the end`;

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
				focus: typeof focus === 'string' && focus.trim() ? focus.trim() : 'Cover this aspect using the research only.'
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
						content: `User question:\n${userQuery}\n\nResearch excerpt for planning (may be truncated):\n${researchForOutline}`
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

You are writing ONE section of a longer report (part ${i + 1} of ${sections.length}).
- Write ONLY this section using a level-3 markdown heading: ### ${sec.title}
- Section focus: ${sec.focus}
- Write at least 200 words when the research supports it; be concrete and cite sources with markdown links using URLs from the research.
- Do NOT restate the full question as a title. Do NOT add a "## Sources" section here.`;

			const sectionUser = `Write section ${i + 1}/${sections.length}: "${sec.title}". Base everything on the research block above.`;

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
		const sourcesUser = `Below is the report draft already shown to the user. Append nothing to the draft itself.

---DRAFT---
${draftTail}
---END---

Output ONE markdown section only, starting with the heading "## Sources". List as a numbered list every distinct http(s) URL that appears in the draft as a markdown link (from \`[](...)\`). If there are no such URLs, write one line explaining that no markdown-linked URLs appeared in the draft.`;

		const sourcesSystem = `${SYNTHESIZER_SYSTEM_PROMPT}

**Current Date:** ${currentDate}

=== RESEARCH GATHERED (for resolving link titles if needed) ===
${researchContext.slice(0, 8000)}
=== END RESEARCH ===

Follow the user instructions exactly. Output only the "## Sources" section.`;

		const sourcesResponse = await createOllamaStream(
			[...conversationHistory, { role: 'user', content: sourcesUser }],
			sourcesSystem,
			{ streamKind: 'synthesis' }
		);
		await pipeOllamaChatStream(sourcesResponse, enqueue, true, undefined);
	} catch (error: unknown) {
		let msg = 'Synthesis failed';
		if (isOllamaTimeoutError(error)) {
			msg = 'Ollama timed out during synthesis. Please try again.';
		} else if (error instanceof Error) {
			msg = error.message;
		}
		enqueue({ type: 'error', message: msg });
	}
}
