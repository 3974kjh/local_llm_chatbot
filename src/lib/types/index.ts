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

export interface DeepSearchStep {
	type: 'plan' | 'iteration_start' | 'searching' | 'sources' | 'evaluation' | 'synthesis_start' | 'complete';
	// plan
	subQueries?: string[];
	strategy?: string;
	subQuestions?: string[];
	stopCriteria?: string[];
	// iteration_start
	iteration?: number;
	maxIterations?: number;
	/** Total URLs fetched so far at this point */
	totalUrlsFetched?: number;
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
	| { type: 'plan'; subQueries: string[]; strategy: string; subQuestions: string[]; stopCriteria: string[] }
	| { type: 'iteration_start'; iteration: number; maxIterations: number; totalUrlsFetched: number }
	| { type: 'searching'; query: string }
	| { type: 'sources'; results: SearchResult[]; query: string }
	| { type: 'evaluation'; thought: string; needsMore: boolean; refinedQueries?: string[]; confidence: number; resolvedItems: string[]; unresolvedItems: string[] }
	| { type: 'synthesis_start' }
	| { type: 'complete'; stopReason: string; confidence: number }
	| { type: 'token'; content: string }
	| { type: 'done' }
	| { type: 'error'; message: string };
