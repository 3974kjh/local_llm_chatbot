import { normalizeSearchQueryForRecency } from '../searchDate';

/**
 * Build search queries from unsupported/contradicted claims (rule-based fallback).
 */
export function buildGapSearchQueriesFallback(
	userQuery: string,
	gapClaims: string[],
	calendarDate: string,
	usedQueries: string[],
	maxQueries: number
): string[] {
	const normalizedUsed = new Set(usedQueries.map((q) => q.trim().toLowerCase()));
	const out: string[] = [];

	for (const claim of gapClaims) {
		const piece = claim.trim().slice(0, 80);
		if (!piece) continue;
		const raw = `${userQuery} ${piece}`.trim();
		const q = normalizeSearchQueryForRecency(raw, calendarDate);
		const key = q.toLowerCase();
		if (!normalizedUsed.has(key)) {
			out.push(q);
			normalizedUsed.add(key);
		}
		if (out.length >= maxQueries) break;
	}

	return out.slice(0, maxQueries);
}

/**
 * Generate 1–2 gap-fill search queries from unsupported claims.
 * Uses rule-based generation (fast, no extra LLM call).
 */
export function buildGapSearchQueries(
	userQuery: string,
	gapClaims: string[],
	calendarDate: string,
	usedQueries: string[],
	maxQueries: number
): string[] {
	const trimmed = gapClaims.map((c) => c.trim()).filter(Boolean).slice(0, 2);
	return buildGapSearchQueriesFallback(userQuery, trimmed, calendarDate, usedQueries, maxQueries);
}
