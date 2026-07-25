import type { ChatPipelinePhase } from '$lib/types';

export const PIPELINE_PHASES: ChatPipelinePhase[] = [
	'prepare',
	'collect',
	'analyze',
	'write',
	'complete'
];

export const PHASE_LABELS: Record<ChatPipelinePhase, string> = {
	prepare: '준비',
	collect: '수집',
	analyze: '분석',
	write: '작성',
	complete: '완료'
};
