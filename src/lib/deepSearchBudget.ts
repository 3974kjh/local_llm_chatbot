/** Preset id sent from client and validated on server. */
export type DeepSearchPreset = 'fast' | 'balanced' | 'deep';

export type DeepSearchBudget = {
	/** Number of verify-refine loops after the initial draft. */
	refineRounds: number;
	/** Max confidence when no seed URLs are attached (LLM self-verification only). */
	confidenceCapWithoutEvidence: number;
	/** Number of plan subQueries to run before the initial draft. */
	initialSubQueries: number;
	/** Max gap-fill web searches per verify-refine round. */
	maxGapSearches: number;
	/** Pages to fetch per search query. */
	urlsPerQuery: number;
	/** Total page fetch cap (seed URLs + web search). */
	maxTotalUrls: number;
};

/** Tuned presets: fast (shorter), balanced (default), deep (more thorough). */
export const DEEP_SEARCH_PRESETS: Record<DeepSearchPreset, DeepSearchBudget> = {
	fast: {
		refineRounds: 1,
		confidenceCapWithoutEvidence: 0.5,
		initialSubQueries: 1,
		maxGapSearches: 1,
		urlsPerQuery: 2,
		maxTotalUrls: 8
	},
	balanced: {
		refineRounds: 2,
		confidenceCapWithoutEvidence: 0.5,
		initialSubQueries: 2,
		maxGapSearches: 2,
		urlsPerQuery: 3,
		maxTotalUrls: 15
	},
	deep: {
		refineRounds: 4,
		confidenceCapWithoutEvidence: 0.5,
		initialSubQueries: 3,
		maxGapSearches: 3,
		urlsPerQuery: 3,
		maxTotalUrls: 25
	}
} as const;

export const DEFAULT_DEEP_SEARCH_PRESET: DeepSearchPreset = 'balanced';

/** Legacy export: same numeric values as `balanced` preset. */
export const DEEP_SEARCH_BUDGET: DeepSearchBudget = { ...DEEP_SEARCH_PRESETS.balanced };

export function isDeepSearchPreset(value: unknown): value is DeepSearchPreset {
	return value === 'fast' || value === 'balanced' || value === 'deep';
}

export function resolveDeepSearchPreset(preset?: string | null): DeepSearchPreset {
	return isDeepSearchPreset(preset) ? preset : DEFAULT_DEEP_SEARCH_PRESET;
}

export function getDeepSearchBudget(preset?: string | null): DeepSearchBudget {
	const p = resolveDeepSearchPreset(preset);
	return { ...DEEP_SEARCH_PRESETS[p] };
}
