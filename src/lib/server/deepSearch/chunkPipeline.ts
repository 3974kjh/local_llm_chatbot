import { callOllamaNonStreaming } from '../ollama';
import { extractFirstJsonObject } from '../extractJsonObject';

export type DeepSearchSynthesisMode = 'hybrid' | 'chunked' | 'raw-only';

export interface CollectedText {
	url: string;
	title: string;
	query: string;
	iteration: number;
	content: string;
}

export interface ResearchChunk {
	id: string;
	content: string;
	sourceUrls: string[];
}

export interface ChunkAnalysis {
	chunkId: string;
	sourceUrls: string[];
	summary: string;
	keyFacts: string[];
}

interface ChunkOptions {
	targetChars?: number;
	hardMaxChars?: number;
}

export function buildCollectedTextsMarkdown(texts: CollectedText[]): string {
	if (texts.length === 0) return '';
	const lines: string[] = ['### 정제 본문 원문 (LLM 가공 전)'];
	for (let i = 0; i < texts.length; i++) {
		const t = texts[i];
		lines.push('');
		lines.push(`**${i + 1}. [${t.title}](${t.url})**`);
		lines.push(`- 쿼리: ${t.query}`);
		lines.push(`- 수집 라운드: ${t.iteration}`);
		lines.push('```text');
		lines.push(t.content);
		lines.push('```');
	}
	return lines.join('\n').trim();
}

export function buildResearchChunks(
	texts: CollectedText[],
	options: ChunkOptions = {}
): ResearchChunk[] {
	const targetChars = Math.max(800, options.targetChars ?? 3200);
	const hardMaxChars = Math.max(targetChars, options.hardMaxChars ?? 4200);
	const chunks: ResearchChunk[] = [];
	let buffer = '';
	let sourceUrls = new Set<string>();
	let chunkIndex = 1;

	const flush = () => {
		const normalized = buffer.trim();
		if (!normalized) return;
		const pieces =
			normalized.length > hardMaxChars ? sliceByLength(normalized, hardMaxChars) : [normalized];
		for (const piece of pieces) {
			chunks.push({
				id: `chunk-${chunkIndex++}`,
				content: piece,
				sourceUrls: [...sourceUrls]
			});
		}
		buffer = '';
		sourceUrls = new Set<string>();
	};

	for (const text of texts) {
		const header = `Source: ${text.title}\nURL: ${text.url}\nQuery: ${text.query}\nIteration: ${text.iteration}\n`;
		const paragraphs = text.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
		if (paragraphs.length === 0) continue;

		for (const paragraph of paragraphs) {
			const unit = `${header}\n${paragraph}\n`;
			if (unit.length > hardMaxChars) {
				const slices = sliceByLength(unit, hardMaxChars);
				for (const piece of slices) {
					if (buffer.length + piece.length > hardMaxChars) {
						flush();
					}
					buffer += `${piece}\n`;
					sourceUrls.add(text.url);
					if (buffer.length >= targetChars) {
						flush();
					}
				}
				continue;
			}

			if (buffer.length + unit.length + 1 > hardMaxChars) {
				flush();
			}
			buffer += `${unit}\n`;
			sourceUrls.add(text.url);
			if (buffer.length >= targetChars) {
				flush();
			}
		}
	}

	flush();
	return chunks;
}

function sliceByLength(text: string, maxLen: number): string[] {
	const out: string[] = [];
	let remaining = text;
	while (remaining.length > maxLen) {
		let cut = remaining.lastIndexOf('\n', maxLen);
		if (cut < maxLen * 0.6) {
			cut = remaining.lastIndexOf(' ', maxLen);
		}
		if (cut < maxLen * 0.5) {
			cut = maxLen;
		}
		out.push(remaining.slice(0, cut).trim());
		remaining = remaining.slice(cut).trim();
	}
	if (remaining.trim()) out.push(remaining.trim());
	return out;
}

export async function analyzeResearchChunks(
	chunks: ResearchChunk[],
	userQuery: string,
	currentDate: string,
	emit?: (analysis: ChunkAnalysis) => void
): Promise<ChunkAnalysis[]> {
	if (chunks.length === 0) return [];

	const analyses = await mapWithConcurrency(chunks, 2, async (chunk) => {
		const analysis = await analyzeOneChunk(chunk, userQuery, currentDate);
		emit?.(analysis);
		return analysis;
	});
	return analyses;
}

async function analyzeOneChunk(
	chunk: ResearchChunk,
	userQuery: string,
	currentDate: string
): Promise<ChunkAnalysis> {
	const systemPrompt = `You analyze one research chunk for later synthesis.

Rules:
- Use ONLY the provided chunk text
- Do not invent facts
- summary and keyFacts must be Korean
- Return ONLY JSON

Output:
{
  "summary": "이 청크의 핵심 요약(한국어)",
  "keyFacts": ["수치/날짜/고유명/근거 문장", "..."]
}`;

	const userPrompt = `User question: ${userQuery}
Current date: ${currentDate}
Chunk id: ${chunk.id}
Source URLs (must stay unchanged in findings): ${chunk.sourceUrls.join(', ')}

Chunk text:
${chunk.content}`;

	try {
		const raw = await callOllamaNonStreaming(
			[{ role: 'user', content: userPrompt }],
			systemPrompt,
			{ numPredict: 900 }
		);
		const parsed = parseChunkAnalysis(raw);
		return {
			chunkId: chunk.id,
			sourceUrls: chunk.sourceUrls,
			summary: parsed.summary,
			keyFacts: parsed.keyFacts
		};
	} catch {
		return {
			chunkId: chunk.id,
			sourceUrls: chunk.sourceUrls,
			summary: '청크 분석 중 오류가 발생해 원문 기반으로 후속 합성을 진행합니다.',
			keyFacts: []
		};
	}
}

function parseChunkAnalysis(raw: string): { summary: string; keyFacts: string[] } {
	const jsonStr = extractFirstJsonObject(raw);
	if (!jsonStr) {
		return { summary: '청크 분석 결과를 JSON으로 파싱하지 못했습니다.', keyFacts: [] };
	}
	try {
		const parsed = JSON.parse(jsonStr) as { summary?: unknown; keyFacts?: unknown };
		const keyFacts = Array.isArray(parsed.keyFacts)
			? parsed.keyFacts
					.filter((v): v is string => typeof v === 'string' && Boolean(v.trim()))
					.slice(0, 8)
			: [];
		return {
			summary:
				typeof parsed.summary === 'string' && parsed.summary.trim()
					? parsed.summary.trim()
					: '청크 분석 요약이 비어 있습니다.',
			keyFacts
		};
	} catch {
		return { summary: '청크 분석 결과를 JSON으로 파싱하지 못했습니다.', keyFacts: [] };
	}
}

export function buildChunkAnalysisContext(analyses: ChunkAnalysis[]): string {
	if (analyses.length === 0) return '';
	return analyses
		.map((a, idx) => {
			const facts =
				a.keyFacts.length > 0 ? a.keyFacts.map((f) => `- ${f}`).join('\n') : '- (명시 근거 없음)';
			return `=== Chunk Analysis ${idx + 1} (${a.chunkId}) ===
URLs: ${a.sourceUrls.join(', ')}
Summary: ${a.summary}
Key Facts:
${facts}`;
		})
		.join('\n\n');
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	worker: (item: T) => Promise<R>
): Promise<R[]> {
	const out = new Array<R>(items.length);
	let nextIndex = 0;

	const run = async () => {
		for (;;) {
			const current = nextIndex++;
			if (current >= items.length) break;
			out[current] = await worker(items[current]);
		}
	};

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
	await Promise.all(workers);
	return out;
}
