import { env } from '$env/dynamic/private';
import type { SearchResult } from '$lib/types';

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const SEARXNG_TIMEOUT_MS = 10_000;
const SERPER_TIMEOUT_MS = 8_000;
const DDG_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Public API  —  priority: SearXNG → Serper → DuckDuckGo
// ---------------------------------------------------------------------------

export async function searchWeb(
	query: string,
	signal?: AbortSignal,
	maxResults = 10
): Promise<SearchResult[]> {
	// 1. SearXNG (self-hosted, highest quality — aggregates multiple engines)
	const searxngUrl = env.SEARXNG_URL?.trim();
	if (searxngUrl) {
		try {
			const results = await searchSearXNG(query, searxngUrl, signal, maxResults);
			if (results.length > 0) {
				console.log(`[Search] SearXNG: ${results.length} results for "${query}"`);
				return results;
			}
			console.warn(`[Search] SearXNG returned 0 results — trying Serper`);
		} catch (err) {
			console.warn(`[Search] SearXNG unavailable (${(err as Error).message}) — trying Serper`);
		}
	}

	// 2. Serper.dev (Google results via official API)
	const serperKey = env.SERPER_API_KEY?.trim();
	if (serperKey) {
		try {
			const results = await searchSerper(query, serperKey, signal, maxResults);
			if (results.length > 0) {
				console.log(`[Search] Serper: ${results.length} results for "${query}"`);
				return results;
			}
			console.warn(`[Search] Serper returned 0 results — falling back to DDG`);
		} catch (err) {
			console.warn(`[Search] Serper failed (${(err as Error).message}) — falling back to DDG`);
		}
	}

	// 3. DuckDuckGo HTML scraping (last resort)
	return searchDDGWithFallback(query, signal, maxResults);
}

export function formatSearchContext(results: SearchResult[]): string {
	if (results.length === 0) return '';
	return results
		.map((r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
		.join('\n\n');
}

// ---------------------------------------------------------------------------
// Serper.dev  (Google Search API)
// ---------------------------------------------------------------------------

interface SerperOrganic {
	title: string;
	link: string;
	snippet?: string;
}

interface SerperResponse {
	organic?: SerperOrganic[];
}

async function searchSerper(
	query: string,
	apiKey: string,
	signal?: AbortSignal,
	maxResults = 10
): Promise<SearchResult[]> {
	const timeoutSignal = AbortSignal.timeout(SERPER_TIMEOUT_MS);
	const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

	const response = await fetch('https://google.serper.dev/search', {
		method: 'POST',
		headers: {
			'X-API-KEY': apiKey,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ q: query, num: maxResults }),
		signal: combinedSignal
	});

	if (!response.ok) {
		throw new Error(`Serper HTTP ${response.status}`);
	}

	const data = (await response.json()) as SerperResponse;

	if (!Array.isArray(data.organic)) return [];

	return data.organic.slice(0, maxResults).map((r) => ({
		title: r.title?.trim() ?? '',
		url: r.link?.trim() ?? '',
		snippet: r.snippet?.trim() ?? ''
	})).filter((r) => r.url.startsWith('http'));
}

// ---------------------------------------------------------------------------
// SearXNG
// ---------------------------------------------------------------------------

interface SearXNGResult {
	url: string;
	title: string;
	content?: string;
	score?: number;
	engines?: string[];
}

interface SearXNGResponse {
	results: SearXNGResult[];
}

async function searchSearXNG(
	query: string,
	baseUrl: string,
	signal?: AbortSignal,
	maxResults = 10
): Promise<SearchResult[]> {
	const url = new URL('/search', baseUrl);
	url.searchParams.set('q', query);
	url.searchParams.set('format', 'json');
	url.searchParams.set('language', 'auto');
	url.searchParams.set('pageno', '1');
	url.searchParams.set('categories', 'general');

	const timeoutSignal = AbortSignal.timeout(SEARXNG_TIMEOUT_MS);
	const combinedSignal = signal
		? AbortSignal.any([signal, timeoutSignal])
		: timeoutSignal;

	const response = await fetch(url.toString(), {
		headers: {
			Accept: 'application/json',
			'User-Agent': USER_AGENT
		},
		signal: combinedSignal
	});

	if (!response.ok) {
		throw new Error(`SearXNG HTTP ${response.status}`);
	}

	const data = (await response.json()) as SearXNGResponse;

	if (!Array.isArray(data.results)) return [];

	return data.results
		.filter((r) => r.url && r.title)
		.slice(0, maxResults)
		.map((r) => ({
			title: r.title.trim(),
			url: r.url.trim(),
			snippet: (r.content ?? '').trim()
		}));
}

// ---------------------------------------------------------------------------
// DuckDuckGo fallback (HTML parsing — kept as last resort)
// ---------------------------------------------------------------------------

async function searchDDGWithFallback(
	query: string,
	signal?: AbortSignal,
	maxResults = 10
): Promise<SearchResult[]> {
	try {
		const results = await searchDuckDuckGo(query, signal, maxResults);
		if (results.length > 0) return results;
	} catch {
		// ignore, try lite
	}

	try {
		return await searchDuckDuckGoLite(query, signal, maxResults);
	} catch (err) {
		console.error('[Search] All search backends failed:', err);
		return [];
	}
}

async function searchDuckDuckGo(
	query: string,
	signal?: AbortSignal,
	maxResults = 10
): Promise<SearchResult[]> {
	const timeoutSignal = AbortSignal.timeout(DDG_TIMEOUT_MS);
	const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

	const response = await fetch('https://html.duckduckgo.com/html/', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': USER_AGENT,
			Accept: 'text/html,application/xhtml+xml',
			'Accept-Language': 'en-US,en;q=0.9'
		},
		body: `q=${encodeURIComponent(query)}&kl=wt-wt`,
		signal: combinedSignal
	});

	if (!response.ok) return [];

	const html = await response.text();
	return parseDDGHtml(html, maxResults);
}

async function searchDuckDuckGoLite(
	query: string,
	signal?: AbortSignal,
	maxResults = 10
): Promise<SearchResult[]> {
	const timeoutSignal = AbortSignal.timeout(DDG_TIMEOUT_MS);
	const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

	const params = new URLSearchParams({ q: query });
	const response = await fetch(`https://lite.duckduckgo.com/lite/?${params}`, {
		headers: {
			'User-Agent': USER_AGENT,
			Accept: 'text/html,application/xhtml+xml',
			'Accept-Language': 'en-US,en;q=0.9'
		},
		signal: combinedSignal
	});

	if (!response.ok) return [];

	const html = await response.text();
	return parseDDGLiteHtml(html, maxResults);
}

function parseDDGHtml(html: string, maxResults: number): SearchResult[] {
	const links: Array<{ url: string; title: string }> = [];
	const snippets: string[] = [];

	for (const [, attrs, innerHtml] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
		if (!attrs.includes('result__a')) continue;
		const hrefMatch = attrs.match(/href="([^"]*)"/i);
		if (!hrefMatch) continue;
		let url = hrefMatch[1];
		const uddgMatch = url.match(/[?&]uddg=([^&]*)/);
		if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
		if (!url.startsWith('http')) continue;
		const title = stripHtml(innerHtml).trim();
		if (title) links.push({ url, title });
	}

	for (const [, content] of html.matchAll(
		/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span|div|p)>/gi
	)) {
		const text = stripHtml(content).trim();
		if (text) snippets.push(text);
	}

	return links.slice(0, maxResults).map((link, i) => ({
		title: link.title,
		url: link.url,
		snippet: snippets[i] ?? ''
	}));
}

function parseDDGLiteHtml(html: string, maxResults: number): SearchResult[] {
	const links: Array<{ url: string; title: string }> = [];
	const snippets: string[] = [];

	const rowPattern =
		/<td[^>]*class="[^"]*result-link[^"]*"[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
	const snippetPattern = /<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;

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

	return links.slice(0, maxResults).map((link, i) => ({
		title: link.title,
		url: link.url,
		snippet: snippets[i] ?? ''
	}));
}

function stripHtml(html: string): string {
	return html.replace(/<[^>]*>/g, '');
}
