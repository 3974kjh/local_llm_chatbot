import { normalizeHttpUrl } from '$lib/utils/helpers';
import { searchWeb } from '../search';
import { fetchUrlContent } from '../scraper';
import type { SearchResult } from '$lib/types';

export interface ResearchResult {
	query: string;
	results: SearchResult[];
	pageContents: Array<{ url: string; content: string }>;
}

const MAX_URLS_PER_QUERY = 2;
const MAX_SEED_URLS = 5;
const MAX_SEED_PAGE_CHARS = 8000;

/** Fetch and extract text from user-provided URLs before web search iterations. */
export async function executeSeedUrlResearch(
	urls: string[],
	signal?: AbortSignal
): Promise<ResearchResult | null> {
	const normalized: string[] = [];
	for (const raw of urls) {
		const u = normalizeHttpUrl(raw);
		if (u) normalized.push(u);
	}
	const unique = [...new Set(normalized)].slice(0, MAX_SEED_URLS);
	if (unique.length === 0) return null;

	const results: SearchResult[] = [];
	const pageContents: Array<{ url: string; content: string }> = [];

	const settled = await Promise.allSettled(
		unique.map(async (url) => {
			const content = await fetchUrlContent(url, signal);
			return { url, content };
		})
	);

	for (let i = 0; i < settled.length; i++) {
		const url = unique[i];
		const r = settled[i];
		if (r.status === 'fulfilled' && r.value.content.length > 80) {
			const text = r.value.content.slice(0, MAX_SEED_PAGE_CHARS);
			pageContents.push({ url, content: text });
			results.push({
				title: pageTitleFromUrl(url),
				url,
				snippet: text.slice(0, 280).replace(/\s+/g, ' ').trim()
			});
		} else {
			results.push({
				title: pageTitleFromUrl(url),
				url,
				snippet:
					r.status === 'rejected'
						? 'Could not load this page (blocked, timeout, or error).'
						: 'Page returned little or no readable text.'
			});
		}
	}

	return {
		query: 'User-attached URLs (prioritized)',
		results,
		pageContents
	};
}

function pageTitleFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

export async function executeResearch(
	query: string,
	signal?: AbortSignal
): Promise<ResearchResult> {
	console.log(`[ResearchExecutor] Searching: "${query}"`);
	const results = await searchWeb(query, signal);

	const topUrls = results.slice(0, MAX_URLS_PER_QUERY).map((r) => r.url);
	const pageContents: Array<{ url: string; content: string }> = [];

	if (topUrls.length > 0) {
		const fetched = await Promise.allSettled(
			topUrls.map(async (url) => {
				try {
					const content = await fetchUrlContent(url, signal);
					return { url, content };
				} catch {
					return { url, content: '' };
				}
			})
		);

		for (const r of fetched) {
			if (r.status === 'fulfilled' && r.value.content.length > 100) {
				pageContents.push({ url: r.value.url, content: r.value.content.slice(0, 4000) });
			}
		}
	}

	return { query, results, pageContents };
}

export function buildResearchContext(iterations: ResearchResult[]): string {
	// Collect all unique sources across iterations for the LLM reference
	const allSources: Array<{ title: string; url: string }> = [];
	const seenUrls = new Set<string>();

	for (const iter of iterations) {
		for (const r of iter.results) {
			if (!seenUrls.has(r.url)) {
				seenUrls.add(r.url);
				allSources.push({ title: r.title, url: r.url });
			}
		}
		for (const p of iter.pageContents) {
			if (!seenUrls.has(p.url)) {
				seenUrls.add(p.url);
			}
		}
	}

	const sourceIndex =
		allSources.length > 0
			? `=== AVAILABLE SOURCES (use ONLY these URLs when citing) ===\n${allSources.map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}`).join('\n\n')}\n\n`
			: '';

	const iterationBlocks = iterations
		.map((iter, i) => {
			const snippets = iter.results
				.map((r, j) => `  [${j + 1}] ${r.title}\n  URL: ${r.url}\n  Snippet: ${r.snippet}`)
				.join('\n\n');

			const pages = iter.pageContents
				.map((p) => `  [Page URL: ${p.url}]\n${p.content}`)
				.join('\n\n');

			return `=== Research Iteration ${i + 1}: "${iter.query}" ===\nSearch Results:\n${snippets || '  (no results found)'}${pages ? `\n\nDetailed Page Content:\n${pages}` : ''}`;
		})
		.join('\n\n');

	return sourceIndex + iterationBlocks;
}
