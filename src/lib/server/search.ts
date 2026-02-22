import type { SearchResult } from '$lib/types';

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function searchWeb(query: string): Promise<SearchResult[]> {
	try {
		const response = await fetch('https://html.duckduckgo.com/html/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'User-Agent': USER_AGENT
			},
			body: `q=${encodeURIComponent(query)}`
		});

		if (!response.ok) return [];

		const html = await response.text();
		return parseSearchResults(html);
	} catch (error) {
		console.error('Web search failed:', error);
		return [];
	}
}

function parseSearchResults(html: string): SearchResult[] {
	const results: SearchResult[] = [];

	const linkRegex = /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
	const snippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

	const links: Array<{ url: string; title: string }> = [];
	const snippets: string[] = [];

	let match;

	while ((match = linkRegex.exec(html)) !== null) {
		let url = match[1];
		const uddgMatch = url.match(/uddg=([^&]*)/);
		if (uddgMatch) {
			url = decodeURIComponent(uddgMatch[1]);
		}
		const title = stripHtml(match[2]).trim();
		if (title && url.startsWith('http')) {
			links.push({ url, title });
		}
	}

	while ((match = snippetRegex.exec(html)) !== null) {
		snippets.push(stripHtml(match[1]).trim());
	}

	const maxResults = Math.min(links.length, 5);
	for (let i = 0; i < maxResults; i++) {
		results.push({
			title: links[i].title,
			url: links[i].url,
			snippet: snippets[i] || ''
		});
	}

	return results;
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
