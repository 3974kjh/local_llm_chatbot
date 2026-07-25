import type { DeepSearchPreset } from '$lib/deepSearchBudget';
import { ANSWER_DEPTH_PROMPTS } from './promptLocale';

export type AnswerDepth = 'brief' | 'standard' | 'comprehensive';

export interface DepthConfig {
	depth: AnswerDepth;
	depthPrompt: string;
	numPredictNonStream: number;
	chatNumPredict: number;
	chatUrlCount: number;
	chatPageChars: number;
	maxPageChars: number;
	draftSourceChars: number;
	refineDraftChars: number;
	refineSourceChars: number;
	synthMaxSections: number;
	synthContextChars: number;
	synthHybridTrimChars: number;
	useMultiSectionSynth: boolean;
}

const COMPREHENSIVE_PATTERN =
	/비교|분석|전망|장단점|왜|어떻게|심층|상세|종합|리뷰|정리해|설명해줘|설명해|자세히|깊이|조사|연구/i;

function hasComprehensiveSignals(query: string): boolean {
	const trimmed = query.trim();
	if (trimmed.length > 80) return true;
	if ((trimmed.match(/[?？]/g)?.length ?? 0) >= 2) return true;
	return COMPREHENSIVE_PATTERN.test(trimmed);
}

function depthRank(depth: AnswerDepth): number {
	if (depth === 'brief') return 0;
	if (depth === 'standard') return 1;
	return 2;
}

function maxDepth(a: AnswerDepth, b: AnswerDepth): AnswerDepth {
	return depthRank(a) >= depthRank(b) ? a : b;
}

function minDepth(a: AnswerDepth, b: AnswerDepth): AnswerDepth {
	return depthRank(a) <= depthRank(b) ? a : b;
}

function heuristicDepth(query: string): AnswerDepth {
	const trimmed = query.trim();
	if (hasComprehensiveSignals(trimmed)) return 'comprehensive';
	if (trimmed.length < 30) return 'brief';
	return 'standard';
}

function presetFloor(preset?: DeepSearchPreset | null): AnswerDepth {
	if (preset === 'deep') return 'standard';
	return 'brief';
}

function presetCeiling(preset?: DeepSearchPreset | null): AnswerDepth {
	if (preset === 'fast') return 'standard';
	return 'comprehensive';
}

export function resolveAnswerDepth(
	query: string,
	options?: { preset?: DeepSearchPreset | null }
): AnswerDepth {
	let depth = heuristicDepth(query);
	const floor = presetFloor(options?.preset);
	const ceiling = presetCeiling(options?.preset);
	depth = maxDepth(depth, floor);
	depth = minDepth(depth, ceiling);
	return depth;
}

export function getDepthConfig(depth: AnswerDepth): DepthConfig {
	switch (depth) {
		case 'brief':
			return {
				depth,
				depthPrompt: ANSWER_DEPTH_PROMPTS.brief,
				numPredictNonStream: 2048,
				chatNumPredict: 4096,
				chatUrlCount: 3,
				chatPageChars: 5000,
				maxPageChars: 5000,
				draftSourceChars: 24000,
				refineDraftChars: 10000,
				refineSourceChars: 8000,
				synthMaxSections: 3,
				synthContextChars: 12000,
				synthHybridTrimChars: 6000,
				useMultiSectionSynth: false
			};
		case 'comprehensive':
			return {
				depth,
				depthPrompt: ANSWER_DEPTH_PROMPTS.comprehensive,
				numPredictNonStream: 8192,
				chatNumPredict: 8192,
				chatUrlCount: 8,
				chatPageChars: 12000,
				maxPageChars: 8000,
				draftSourceChars: 40000,
				refineDraftChars: 16000,
				refineSourceChars: 16000,
				synthMaxSections: 7,
				synthContextChars: 32000,
				synthHybridTrimChars: 32000,
				useMultiSectionSynth: true
			};
		default:
			return {
				depth,
				depthPrompt: ANSWER_DEPTH_PROMPTS.standard,
				numPredictNonStream: 4096,
				chatNumPredict: 4096,
				chatUrlCount: 5,
				chatPageChars: 8000,
				maxPageChars: 6000,
				draftSourceChars: 32000,
				refineDraftChars: 12000,
				refineSourceChars: 12000,
				synthMaxSections: 5,
				synthContextChars: 20000,
				synthHybridTrimChars: 20000,
				useMultiSectionSynth: true
			};
	}
}
