import { getDepthConfig, type AnswerDepth } from '../answerDepth';
import { callLlmNonStreaming, type LlmMessage, type LlmProvider } from '../llm';
import { CHAT_NO_SEARCH_KO, RESPONSE_LANGUAGE_KO, WEB_FIRST_GROUNDING } from '../promptLocale';

function buildSystemPrompt(hasEvidence: boolean, depthPrompt: string): string {
	if (hasEvidence) {
		return `${RESPONSE_LANGUAGE_KO}

${WEB_FIRST_GROUNDING}

${depthPrompt}

You are a research assistant. Answer the user's question using ONLY the attached source text below.
Write a clear, structured markdown answer in Korean. Cite sources with markdown links using exact URLs from the source text.
When user-attached URLs (marked USER-PROVIDED / PRIORITY) conflict with web search results, prefer user-attached sources.
Do not invent facts. If the sources do not cover something, say so in Korean.
This is an initial draft that will be expanded later — include all key facts from the sources without omitting important details.`;
	}

	return `${RESPONSE_LANGUAGE_KO}

${CHAT_NO_SEARCH_KO}

${depthPrompt}

You are a research assistant. No external sources were attached for this question.
Answer based on your training knowledge, but clearly mark uncertain or time-sensitive claims.
Write a clear markdown answer in Korean. Do not claim external verification.`;
}

export async function draftAnswer(
	userQuery: string,
	sourceContext: string,
	messages: LlmMessage[],
	currentDate: string,
	hasEvidence: boolean,
	provider: LlmProvider = 'local',
	answerDepth: AnswerDepth = 'standard'
): Promise<string> {
	const config = getDepthConfig(answerDepth);
	const historyBlock =
		messages.length > 0
			? `\n\nRecent conversation:\n${messages
					.slice(-6)
					.map((m) => `${m.role}: ${m.content.slice(0, 400)}`)
					.join('\n')}`
			: '';

	const userMessage = `Question: ${userQuery}
Current date: ${currentDate}
${hasEvidence ? `\nAttached source text:\n${sourceContext.slice(0, config.draftSourceChars)}` : '\n(No attached sources — answer from training knowledge only.)'}${historyBlock}

Write the initial answer in markdown.`;

	const raw = await callLlmNonStreaming(
		[{ role: 'user', content: userMessage }],
		buildSystemPrompt(hasEvidence, config.depthPrompt),
		{ provider, numPredict: config.numPredictNonStream }
	);

	return raw.trim();
}
