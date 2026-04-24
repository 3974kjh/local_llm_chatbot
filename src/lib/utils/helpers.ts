export function generateId(): string {
	return crypto.randomUUID();
}

export function formatTime(date: Date): string {
	const d = date instanceof Date ? date : new Date(date);
	return new Intl.DateTimeFormat('default', {
		hour: '2-digit',
		minute: '2-digit'
	}).format(d);
}

export function formatRelativeDate(date: Date): string {
	const d = date instanceof Date ? date : new Date(date);
	const now = new Date();
	const diff = now.getTime() - d.getTime();
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (days === 0) return 'Today';
	if (days === 1) return 'Yesterday';
	if (days < 7) return `${days}d ago`;
	return new Intl.DateTimeFormat('default', { month: 'short', day: 'numeric' }).format(d);
}

export function extractDomain(url: string): string {
	try {
		return new URL(url).hostname.replace('www.', '');
	} catch {
		return url;
	}
}

/** Normalize user input into an http(s) URL, or null if invalid. */
export function normalizeHttpUrl(input: string): string | null {
	const t = input.trim();
	if (!t) return null;
	try {
		if (/^https?:\/\//i.test(t)) {
			const u = new URL(t);
			if (!u.hostname) return null;
			return u.href;
		}
		const u = new URL(`https://${t}`);
		if (!u.hostname || u.hostname.length < 3) return null;
		return u.href;
	} catch {
		return null;
	}
}

export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength) + '...';
}

/** Local calendar date YYYY-MM-DD (not UTC) for search queries and consistent copy. */
export function getLocalCalendarDateYYYYMMDD(d = new Date()): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/**
 * Returns a structured string of the current date/time info
 * to provide temporal context to the LLM on every request.
 */
export function getCurrentDateContext(): string {
	const now = new Date();
	const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const dayOfWeek = weekdays[now.getDay()];

	const dateStr = new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	}).format(now);

	const timeStr = new Intl.DateTimeFormat('en-US', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true
	}).format(now);

	const localIso = getLocalCalendarDateYYYYMMDD(now);

	return `Today is ${dayOfWeek}, ${dateStr} (${localIso}). Current local time: ${timeStr}.`;
}
