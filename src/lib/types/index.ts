export type LlmProvider = 'local' | 'omniroute';

export type ChatPipelinePhase =
	| 'prepare'
	| 'collect'
	| 'analyze'
	| 'write'
	| 'complete';

export interface ChatProgressEvent {
	phase: ChatPipelinePhase;
	label?: string;
	detail?: string;
}

export interface Message {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: Date;
	isStreaming?: boolean;
	searchResults?: SearchResult[];
	deepSearchSteps?: DeepSearchStep[];
	isDeepSearch?: boolean;
	/** URLs the user attached for a deep-search question (shown on the user bubble). */
	attachedSeedUrls?: string[];
	/** Formatted markdown of raw source pages — displayed above the final answer. */
	rawAnswer?: string;
	/** Unified pipeline stepper — current phase while streaming. */
	pipelinePhase?: ChatPipelinePhase;
	pipelineLabel?: string;
	pipelineDetail?: string;
}

export interface Conversation {
	id: string;
	title: string;
	messages: Message[];
	createdAt: Date;
	updatedAt: Date;
}

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

export interface StreamEvent {
	type: 'token' | 'sources' | 'done' | 'error';
	content?: string;
	data?: SearchResult[];
	message?: string;
}

export type DeepSearchPresetId = 'fast' | 'balanced' | 'deep';

/** @deprecated Deep search no longer uses synthesis modes; kept for storage compatibility. */
export type DeepSearchSynthesisModeId = 'hybrid' | 'chunked' | 'raw-only';

export type ClaimStatus = 'supported' | 'unsupported' | 'contradicted' | 'unverifiable';

export interface ClaimSummary {
	claim: string;
	subQuestionIndex: number;
}

export interface ClaimVerification {
	claim: string;
	status: ClaimStatus;
	evidence: string | null;
	sourceUrl: string | null;
}

export interface DeepSearchStep {
	type:
		| 'start'
		| 'evidence_warning'
		| 'plan'
		| 'searching'
		| 'web_search'
		| 'draft'
		| 'refine_start'
		| 'decompose'
		| 'verify'
		| 'refine'
		| 'sources'
		| 'synthesis_start'
		| 'complete';
	/** Resolved server-side depth preset for this run */
	preset?: DeepSearchPresetId;
	// start / evidence_warning
	message?: string;
	// plan
	subQueries?: string[];
	strategy?: string;
	stopCriteria?: string[];
	// searching / sources
	query?: string;
	isUserProvided?: boolean;
	// web_search
	queries?: string[];
	pagesFetched?: number;
	reason?: string;
	// draft
	content?: string;
	// refine_start
	round?: number;
	maxRounds?: number;
	// decompose
	subQuestions?: string[];
	claims?: ClaimSummary[];
	// verify
	claimResults?: ClaimVerification[];
	confidence?: number;
	// refine
	thought?: string;
	revisedDraft?: string;
	// sources
	sourceResults?: SearchResult[];
	// complete
	stopReason?: string;
	totalPagesFetched?: number;
}

export type DeepSearchEvent =
	| { type: 'start'; preset: DeepSearchPresetId; refineRounds: number }
	| { type: 'evidence_warning'; message: string }
	| {
			type: 'plan';
			subQueries: string[];
			strategy: string;
			subQuestions: string[];
			stopCriteria: string[];
		}
	| { type: 'searching'; query: string }
	| {
			type: 'web_search';
			round: number;
			queries: string[];
			pagesFetched: number;
			reason: string;
		}
	| { type: 'draft'; content: string }
	| { type: 'refine_start'; round: number; maxRounds: number }
	| { type: 'decompose'; subQuestions: string[]; claims: ClaimSummary[] }
	| { type: 'verify'; results: ClaimVerification[]; confidence: number }
	| { type: 'refine'; thought: string; revisedDraft: string; confidence: number }
	| {
			type: 'sources';
			results: SearchResult[];
			query: string;
			isUserProvided?: boolean;
		}
	| { type: 'synthesis_start' }
	| { type: 'keepalive' }
	| {
			type: 'complete';
			stopReason: string;
			confidence: number;
			totalPagesFetched?: number;
		}
	| { type: 'token'; content: string }
	| { type: 'synthesis_final'; content: string }
	| { type: 'raw_answer'; content: string }
	| { type: 'done' }
	| { type: 'error'; message: string };
