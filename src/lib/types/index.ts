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
	/** Formatted markdown of raw search results with no LLM opinion — displayed above the LLM synthesis. */
	rawAnswer?: string;
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

/** How deep search builds the final answer from collected pages */
export type DeepSearchSynthesisModeId = 'hybrid' | 'chunked' | 'raw-only';

export interface DeepSearchStep {
	type: 'plan' | 'iteration_start' | 'searching' | 'sources' | 'evaluation' | 'synthesis_start' | 'complete';
	// plan
	subQueries?: string[];
	strategy?: string;
	subQuestions?: string[];
	stopCriteria?: string[];
	/** Resolved server-side depth preset for this run */
	preset?: DeepSearchPresetId;
	// iteration_start
	iteration?: number;
	maxIterations?: number;
	/** Total URLs fetched so far at this point */
	totalUrlsFetched?: number;
	/** Target confidence for this run (from preset); UI uses for bar coloring */
	confidenceThreshold?: number;
	// searching / sources
	query?: string;
	results?: SearchResult[];
	// evaluation
	thought?: string;
	needsMore?: boolean;
	refinedQueries?: string[];
	confidence?: number;
	resolvedItems?: string[];
	unresolvedItems?: string[];
	// complete (stop summary)
	stopReason?: string;
}

export type DeepSearchEvent =
	| {
			type: 'plan';
			subQueries: string[];
			strategy: string;
			subQuestions: string[];
			stopCriteria: string[];
			preset?: DeepSearchPresetId;
		}
	| {
			type: 'iteration_start';
			iteration: number;
			maxIterations: number;
			totalUrlsFetched: number;
			confidenceThreshold?: number;
		}
	| { type: 'searching'; query: string }
	| { type: 'sources'; results: SearchResult[]; query: string }
	| {
			type: 'evaluation';
			thought: string;
			needsMore: boolean;
			refinedQueries?: string[];
			confidence?: number;
			resolvedItems: string[];
			unresolvedItems: string[];
		}
	| { type: 'synthesis_start' }
	| { type: 'keepalive' }
	| { type: 'complete'; stopReason: string; confidence: number }
	| { type: 'token'; content: string }
	/** Full markdown replacement after server-side citation finalize (deep search only). */
	| { type: 'synthesis_final'; content: string }
	| { type: 'done' }
	| { type: 'error'; message: string };
