/** Shared deep-search limits (client UI + server loop must match). */
export const DEEP_SEARCH_BUDGET = {
	maxRounds: 7,
	minRounds: 4,
	maxTotalUrls: 25,
	urlsPerQuery: 3,
	maxQueriesPerRound: 3,
	confidenceThreshold: 0.92,
	convergenceWindow: 3
} as const;
