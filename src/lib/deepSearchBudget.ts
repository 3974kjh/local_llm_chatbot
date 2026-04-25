/** Preset id sent from client and validated on server. */
export type DeepSearchPreset = 'fast' | 'balanced' | 'deep';

export type DeepSearchBudget = {
	maxRounds: number;
	minRounds: number;
	maxTotalUrls: number;
	urlsPerQuery: number;
	maxQueriesPerRound: number;
	confidenceThreshold: number;
	convergenceWindow: number;
};

/** Tuned presets: fast (shorter), balanced (legacy default), deep (more thorough). */
export const DEEP_SEARCH_PRESETS: Record<DeepSearchPreset, DeepSearchBudget> = {
	fast: {
		maxRounds: 4,
		minRounds: 2,
		maxTotalUrls: 12,
		urlsPerQuery: 2,
		maxQueriesPerRound: 2,
		confidenceThreshold: 0.82,
		convergenceWindow: 2
	},
	balanced: {
		maxRounds: 7,
		minRounds: 4,
		maxTotalUrls: 25,
		urlsPerQuery: 3,
		maxQueriesPerRound: 3,
		confidenceThreshold: 0.92,
		convergenceWindow: 3
	},
	deep: {
		maxRounds: 9,
		minRounds: 5,
		maxTotalUrls: 38,
		urlsPerQuery: 4,
		maxQueriesPerRound: 4,
		confidenceThreshold: 0.94,
		convergenceWindow: 3
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
