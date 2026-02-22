const MAX_CONTENT_LENGTH = 80000;

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchUrlContent(url: string): Promise<string> {
	console.log('[Scraper] Fetching:', url);

	const response = await fetch(url, {
		headers: {
			'User-Agent': USER_AGENT,
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
		},
		signal: AbortSignal.timeout(20000)
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status}`);
	}

	const contentType = response.headers.get('content-type') || '';
	const text = await response.text();

	let extracted: string;

	if (contentType.includes('text/html')) {
		extracted = extractTextFromHtml(text);
	} else if (contentType.includes('application/json')) {
		try {
			const json = JSON.parse(text);
			extracted = JSON.stringify(json, null, 2);
		} catch {
			extracted = text;
		}
	} else {
		extracted = text;
	}

	const cleaned = cleanExtractedText(extracted);
	const result = cleaned.slice(0, MAX_CONTENT_LENGTH);
	console.log(
		`[Scraper] Extracted ${result.length} chars from ${url} (raw HTML: ${text.length}, after extract: ${extracted.length})`
	);
	console.log(`[Scraper] Content preview (first 500 chars): ${result.slice(0, 500).replace(/\n/g, ' | ')}`);
	return result;
}

function extractTextFromHtml(html: string): string {
	let content = html;

	content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
	content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
	content = content.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
	content = content.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
	content = content.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
	content = content.replace(/<select[^>]*>[\s\S]*?<\/select>/gi, '');
	content = content.replace(/<input[^>]*\/?>/gi, '');
	content = content.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
	content = content.replace(/<!--[\s\S]*?-->/g, '');

	content = content.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
	content = content.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
	content = content.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
	content = content.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
	content = content.replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '');

	content = content.replace(
		/<[^>]*(?:class|id)=["'][^"']*(?:cookie|banner|popup|modal|overlay|tooltip|dropdown|menu|sidebar|breadcrumb|pagination|widget|ad-|ads-|advert|sponsor|promo|social-share|share-button|login|signup|subscribe|newsletter|related-article|recommend)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi,
		''
	);

	const newsHeadlines = extractNewsHeadlines(content);
	if (newsHeadlines && newsHeadlines.length > 500) {
		return newsHeadlines;
	}

	const mainContent = extractMainContent(content);
	if (mainContent && mainContent.length > 300) {
		content = mainContent;
	}

	let text = content;

	text = text.replace(/<\/?(h[1-6])[^>]*>/gi, '\n\n');
	text = text.replace(/<\/?(p|div|section|article|blockquote)[^>]*>/gi, '\n');
	text = text.replace(/<br\s*\/?>/gi, '\n');
	text = text.replace(/<\/?(li)[^>]*>/gi, '\n- ');
	text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');
	text = text.replace(/<\/?(tr)[^>]*>/gi, '\n');
	text = text.replace(/<\/?(td|th)[^>]*>/gi, ' | ');
	text = text.replace(/<hr[^>]*>/gi, '\n---\n');

	text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');
	text = text.replace(/<(strong|b|em|i|u|mark|span)[^>]*>([\s\S]*?)<\/\1>/gi, '$2');

	text = text.replace(/<[^>]+>/g, '');

	text = decodeHtmlEntities(text);

	return text;
}

function extractNewsHeadlines(html: string): string | null {
	const headlines: string[] = [];

	const strongPattern = /<strong[^>]*>([\s\S]*?)<\/strong>/gi;
	let match;
	while ((match = strongPattern.exec(html)) !== null) {
		let text = match[1].replace(/<[^>]+>/g, '').trim();
		text = decodeHtmlEntities(text);
		if (text.length >= 10 && text.length <= 200 && !/^(닫기|더보기|검색|로그인|MY|NAVER)$/i.test(text)) {
			headlines.push(text);
		}
	}

	if (headlines.length < 3) return null;

	const summaryPattern = /<strong[^>]*>[\s\S]*?<\/strong>([\s\S]*?)(?=<strong|<\/li|<\/div>)/gi;
	const articlesMap = new Map<string, string>();

	let sMatch;
	while ((sMatch = summaryPattern.exec(html)) !== null) {
		const headlineHtml = sMatch[0].match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
		if (!headlineHtml) continue;

		let headline = headlineHtml[1].replace(/<[^>]+>/g, '').trim();
		headline = decodeHtmlEntities(headline);
		if (headline.length < 10) continue;

		let summary = sMatch[1].replace(/<[^>]+>/g, '').trim();
		summary = decodeHtmlEntities(summary);
		summary = summary.replace(/\s+/g, ' ').trim();
		summary = summary.replace(/^\d+\s*개의 관련뉴스.*$/, '').trim();

		if (summary.length > 30) {
			articlesMap.set(headline, summary);
		}
	}

	const result: string[] = [];
	const seen = new Set<string>();

	if (articlesMap.size >= 3) {
		let idx = 1;
		for (const [headline, summary] of articlesMap) {
			if (seen.has(headline)) continue;
			seen.add(headline);
			result.push(`[기사 ${idx}] ${headline}\n${summary}`);
			idx++;
		}
	}

	if (result.length < 3) {
		const uniqueHeadlines = [...new Set(headlines)];
		return uniqueHeadlines.map((h, i) => `[기사 ${i + 1}] ${h}`).join('\n\n');
	}

	return result.join('\n\n');
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&middot;/g, '·')
		.replace(/&hellip;/g, '...')
		.replace(/&ndash;/g, '-')
		.replace(/&mdash;/g, '-')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}

function extractMainContent(html: string): string | null {
	const patterns = [
		/<article[^>]*>([\s\S]*?)<\/article>/gi,
		/<main[^>]*>([\s\S]*?)<\/main>/gi,
		/<div[^>]*(?:class|id)=["'][^"']*(?:article[-_]?body|article[-_]?content|post[-_]?content|entry[-_]?content|story[-_]?body|news[-_]?body|content[-_]?body|main[-_]?content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
		/<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/gi
	];

	const matches: string[] = [];
	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(html)) !== null) {
			const captured = match[1] || match[0];
			if (captured.length > 300) {
				matches.push(captured);
			}
		}
	}

	if (matches.length > 0) {
		return matches.sort((a, b) => b.length - a.length)[0];
	}

	return null;
}

const NOISE_PATTERNS: RegExp[] = [
	/^닫기$/,
	/^더보기$/,
	/^새로보기$/,
	/^로그인$/,
	/^검색$/,
	/^맨위로$/,
	/^예\s*아니오$/,
	/^MY$/,
	/^NAVER$/,
	/^본문 바로가기$/,
	/^전체서비스/,
	/^서비스안내/,
	/^오류신고/,
	/^고객센터/,
	/알고리즘\s*(자세히|안내|더)\s*보기/i,
	/알고리즘\s*안내/,
	/^AiRS 추천으로/,
	/^각 헤드라인의 기사와 배열/,
	/^기사묶음의 대표 기사/,
	/^기사 수량이 표기된/,
	/기사묶음과 기사묶음 타이틀도/,
	/^개인화를 반영해/,
	/^구독 언론사 중심으로/,
	/본문 듣기를.*(종료|시작)/,
	/이 기사를.*(추천|공유)/,
	/추천을.*(취소|했습니다)/,
	/^이 콘텐츠의 저작권은/,
	/^저작권법 등에 따라/,
	/청소년\s*보호\s*책임자/,
	/기사배열\s*책임자/,
	/댓글\s*추모\s*기능\s*적용/,
	/각 언론사의 가장 많이 본 기사/,
	/^언론사별 가장 많이 본 뉴스/,
	/^오후\s*\d+시.*집계한 결과/,
	/^_재생하기_$/,
	/^_재생시간_/,
	/^_동영상뉴스_/,
	/^_공지_/,
	/^\d+\s*개의 관련뉴스 더보기$/,
	/^헤드라인\s*(뉴스\s*)?더보기$/,
	/^기사\s*더보기$/,
	/^연재보기/,
	/^뉴스\s*기사와\s*댓글로/,
	/24시간\s*센터로\s*접수/,
	/네이버\s*메인에서\s*바로\s*보는/,
	/네이버\s*AI\s*뉴스\s*알고리즘/,
	/^고침 기사 모음$/,
	/^정정.*보도.*기사.*모음$/,
	/^불공정.*선거.*보도/,
	/^\*\s*$/,
	/^---$/,
	/^엔터\s*스포츠\s*날씨/,
	/^뉴스스탠드$/,
	/^라이브러리$/,
	/^전체 언론사$/,
	/^구독$/,
];

function cleanExtractedText(text: string): string {
	const lines = text.split('\n');
	const cleanedLines: string[] = [];

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (!line) continue;

		if (line.length < 2) continue;

		if (NOISE_PATTERNS.some((p) => p.test(line))) continue;

		if (/^[*\-•]\s*$/.test(line)) continue;

		if (/^[\s|*_#\-=]+$/.test(line)) continue;

		cleanedLines.push(line);
	}

	let result = cleanedLines.join('\n');

	result = result.replace(/\n{3,}/g, '\n\n');

	return result.trim();
}

export async function fetchMultipleUrls(
	urls: string[]
): Promise<Array<{ url: string; content: string; error?: string }>> {
	const results = await Promise.allSettled(
		urls.map(async (url) => {
			const content = await fetchUrlContent(url);
			return { url, content };
		})
	);

	return results.map((r, i) => {
		if (r.status === 'fulfilled') return r.value;
		console.error(`[Scraper] Failed to fetch ${urls[i]}:`, r.reason?.message);
		return { url: urls[i], content: '', error: r.reason?.message || 'Fetch failed' };
	});
}
