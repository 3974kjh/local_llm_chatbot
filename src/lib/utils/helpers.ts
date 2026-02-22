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

export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.slice(0, maxLength) + '...';
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

	const isoDate = now.toISOString().split('T')[0];

	return `Today is ${dayOfWeek}, ${dateStr} (${isoDate}). Current local time: ${timeStr}.`;
}
