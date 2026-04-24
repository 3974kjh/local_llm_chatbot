import type { SearchResult } from '$lib/types';

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function searchWeb(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
	try {
		// Try DuckDuckGo HTML endpoint
		const results = await searchDuckDuckGo(query, signal);
		if (results.length > 0) {
			console.log(`[Search] Got ${results.length} results for: "${query}"`);
			return results;
		}

		// Fallback: DuckDuckGo Lite (simpler, more stable HTML)
		console.log(`[Search] Falling back to DDG Lite for: "${query}"`);
		return await searchDuckDuckGoLite(query, signal);
	} catch (error) {
		console.error('[Search] Web search failed:', error);
		return [];
	}
}

async function searchDuckDuckGo(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
	const response = await fetch('https://html.duckduckgo.com/html/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': USER_AGENT,
			Accept: 'text/html,application/xhtml+xml',
			'Accept-Language': 'en-US,en;q=0.9'
		},
		body: `q=${encodeURIComponent(query)}&kl=wt-wt`,
		signal
	});

	if (!response.ok) {
		console.warn(`[Search] DDG returned ${response.status}`);
		return [];
	}

	const html = await response.text();
	return parseDDGHtml(html);
}

async function searchDuckDuckGoLite(query: string, signal?: AbortSignal): Promise<SearchResult[]> {
	const params = new URLSearchParams({ q: query });
	const response = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
		method: 'GET',
		headers: {
			'User-Agent': USER_AGENT,
			Accept: 'text/html,application/xhtml+xml',
			'Accept-Language': 'en-US,en;q=0.9'
		},
		signal
	});

	if (!response.ok) return [];

	const html = await response.text();
	return parseDDGLiteHtml(html);
}

function parseDDGHtml(html: string): SearchResult[] {
	const links: Array<{ url: string; title: string }> = [];
	const snippets: string[] = [];

	// Use matchAll to be order-independent — DuckDuckGo may place href before or after class
	for (const [, attrs, innerHtml] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
		if (!attrs.includes('result__a')) continue;

		const hrefMatch = attrs.match(/href="([^"]*)"/i);
		if (!hrefMatch) continue;

		let url = hrefMatch[1];
		// DuckDuckGo wraps real URLs in a uddg= redirect parameter
		const uddgMatch = url.match(/[?&]uddg=([^&]*)/);
		if (uddgMatch) {
			url = decodeURIComponent(uddgMatch[1]);
		}
		if (!url.startsWith('http')) continue;

		const title = stripHtml(innerHtml).trim();
		if (title) links.push({ url, title });
	}

	// Snippets can be in <a> or <span> elements — match the class, stop at closing tag
	for (const [, content] of html.matchAll(
		/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span|div|p)>/gi
	)) {
		const text = stripHtml(content).trim();
		if (text) snippets.push(text);
	}

	console.log(`[Search] DDG parsed: ${links.length} links, ${snippets.length} snippets`);

	return links.slice(0, 5).map((link, i) => ({
		title: link.title,
		url: link.url,
		snippet: snippets[i] || ''
	}));
}

function parseDDGLiteHtml(html: string): SearchResult[] {
	const results: SearchResult[] = [];

	// DDG Lite uses simple table rows: <td class="result-link"><a href="...">title</a></td>
	// followed by <td class="result-snippet">snippet</td>
	const rowPattern =
		/<td[^>]*class="[^"]*result-link[^"]*"[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
	const snippetPattern = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;

	const links: Array<{ url: string; title: string }> = [];
	const snippets: string[] = [];

	for (const [, attrs, innerHtml] of html.matchAll(rowPattern)) {
		const hrefMatch = attrs.match(/href="([^"]*)"/i);
		if (!hrefMatch) continue;
		const url = hrefMatch[1];
		if (!url.startsWith('http')) continue;
		const title = stripHtml(innerHtml).trim();
		if (title) links.push({ url, title });
	}

	for (const [, content] of html.matchAll(snippetPattern)) {
		const text = stripHtml(content).trim();
		if (text) snippets.push(text);
	}

	console.log(`[Search] DDG Lite parsed: ${links.length} links, ${snippets.length} snippets`);

	return links.slice(0, 5).map((link, i) => ({
		title: link.title,
		url: link.url,
		snippet: snippets[i] || ''
	}));
}

function stripHtml(html: string): string {
	return html.replace(/<[^>]*>/g, '');
}

export function formatSearchContext(results: SearchResult[]): string {
	if (results.length === 0) return '';

	return results
		.map((r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
		.join('\n\n');
}
