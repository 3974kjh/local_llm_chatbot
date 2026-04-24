/**
 * Calendar date for web search (prefer client local YYYY-MM-DD).
 */
export function resolveSearchCalendarDate(
	localeCalendarDate?: unknown,
	currentDate?: unknown
): string {
	if (typeof localeCalendarDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(localeCalendarDate.trim())) {
		return localeCalendarDate.trim();
	}
	if (typeof currentDate === 'string') {
		const m = currentDate.match(/\((\d{4}-\d{2}-\d{2})\)/);
		if (m) return m[1];
	}
	const d = new Date();
	const y = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, '0');
	const da = String(d.getDate()).padStart(2, '0');
	return `${y}-${mo}-${da}`;
}

/**
 * Appends calendar YYYY-MM-DD to the search query when not already present,
 * so SERP results skew toward pages that mention the user's "as of" date.
 */
export function normalizeSearchQueryForRecency(query: string, calendarDate: string): string {
	const q = query.trim();
	const d = calendarDate.trim();
	if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return q;
	if (!q) return d;
	// Avoid duplicate suffix
	if (q.endsWith(d) || q.includes(` ${d}`) || q.startsWith(`${d} `)) return q;
	const escaped = d.replace(/-/g, '\\-');
	if (new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(q)) return q;
	return `${q} ${d}`;
}
