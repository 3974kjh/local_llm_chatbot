import { normalizeSearchQueryForRecency } from '../searchDate';
import { normalizeHttpUrl } from '$lib/utils/helpers';
import { searchWeb } from '../search';
import { fetchUrlContent } from '../scraper';
import type { SearchResult } from '$lib/types';

export interface ResearchResult {
	query: string;
	results: SearchResult[];
	pageContents: Array<{ url: string; content: string }>;
	/** True when the user explicitly attached these URLs (highest priority). */
	isUserProvided?: boolean;
}

const DEFAULT_MAX_PAGE_CHARS = 5000;
const MAX_SEED_PAGE_CHARS = 8000;
const MAX_SEED_URLS = 5;

export interface ExecuteResearchOptions {
	maxPageChars?: number;
}

// ---------------------------------------------------------------------------
// Web search + page fetch (used per query in the research loop)
// ---------------------------------------------------------------------------

export async function executeResearch(
	query: string,
	seenUrls: Set<string>,
	urlsPerQuery: number,
	signal?: AbortSignal,
	calendarDate?: string,
	options?: ExecuteResearchOptions
): Promise<ResearchResult> {
	const maxPageChars = options?.maxPageChars ?? DEFAULT_MAX_PAGE_CHARS;
	const effectiveQuery =
		calendarDate && /^\d{4}-\d{2}-\d{2}$/.test(calendarDate.trim())
			? normalizeSearchQueryForRecency(query, calendarDate.trim())
			: query.trim();

	if (effectiveQuery !== query.trim()) {
		console.log(`[ResearchExecutor] Searching (recency): "${effectiveQuery}"`);
	} else {
		console.log(`[ResearchExecutor] Searching: "${effectiveQuery}"`);
	}

	// Fetch more candidate results so we have enough after filtering seen URLs
	const maxCandidates = Math.max(30, urlsPerQuery * 6);
	const allResults = await searchWeb(effectiveQuery, signal, maxCandidates);

	const results: SearchResult[] = [];
	const pageContents: Array<{ url: string; content: string }> = [];

	let attempts = 0;
	const maxAttempts = Math.max(maxCandidates, urlsPerQuery * 8);

	for (const r of allResults) {
		if (pageContents.length >= urlsPerQuery) break;
		if (attempts++ >= maxAttempts) break;
		if (seenUrls.has(r.url)) continue;

		seenUrls.add(r.url);

		let content = '';
		try {
			content = await fetchUrlContent(r.url, signal);
		} catch {
			content = '';
		}

		results.push(r);

		if (content.length > 100) {
			pageContents.push({
				url: r.url,
				content: content.slice(0, maxPageChars)
			});
		}
	}

	return { query: effectiveQuery, results, pageContents, isUserProvided: false };
}

// ---------------------------------------------------------------------------
// Seed URL fetch (user-attached URLs, fetched before planning)
// ---------------------------------------------------------------------------

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
		pageContents,
		isUserProvided: true
	};
}

function pageTitleFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

function formatIterationBlock(iter: ResearchResult, index: number): string {
	const snippets = iter.results
		.map((r, j) => `  [${j + 1}] ${r.title}\n  URL: ${r.url}\n  Snippet: ${r.snippet}`)
		.join('\n\n');

	const pages = iter.pageContents
		.map((p) => `  [Page URL: ${p.url}]\n${p.content}`)
		.join('\n\n');

	const label = iter.isUserProvided
		? `User-Provided Source ${index + 1}`
		: `Web Search ${index + 1}`;

	return `=== ${label}: "${iter.query}" ===\nSearch Results:\n${snippets || '  (no results found)'}${pages ? `\n\nDetailed Page Content:\n${pages}` : ''}`;
}

// ---------------------------------------------------------------------------
// Research context builder
// ---------------------------------------------------------------------------

export function buildResearchContext(iterations: ResearchResult[]): string {
	const userIterations = iterations.filter((iter) => iter.isUserProvided);
	const webIterations = iterations.filter((iter) => !iter.isUserProvided);

	const allSources: Array<{ title: string; url: string; isPriority: boolean }> = [];
	const seenUrls = new Set<string>();

	for (const iter of [...userIterations, ...webIterations]) {
		for (const r of iter.results) {
			if (!seenUrls.has(r.url)) {
				seenUrls.add(r.url);
				allSources.push({
					title: r.title,
					url: r.url,
					isPriority: !!iter.isUserProvided
				});
			}
		}
	}

	const sourceIndex =
		allSources.length > 0
			? `=== AVAILABLE SOURCES (use ONLY these URLs when citing) ===\n${allSources
					.map(
						(s, i) =>
							`[${i + 1}]${s.isPriority ? ' [PRIORITY — user-attached]' : ''} ${s.title}\n    URL: ${s.url}`
					)
					.join('\n\n')}\n\n`
			: '';

	const blocks: string[] = [];

	if (userIterations.length > 0) {
		blocks.push(
			'=== USER-PROVIDED SOURCES (HIGHEST PRIORITY) ===\n' +
				'When user-attached sources conflict with web search results, prefer user-attached sources.\n\n' +
				userIterations.map((iter, i) => formatIterationBlock(iter, i)).join('\n\n')
		);
	}

	if (webIterations.length > 0) {
		blocks.push(
			'=== WEB SEARCH RESULTS ===\n' +
				webIterations.map((iter, i) => formatIterationBlock(iter, i)).join('\n\n')
		);
	}

	return sourceIndex + blocks.join('\n\n');
}
