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
