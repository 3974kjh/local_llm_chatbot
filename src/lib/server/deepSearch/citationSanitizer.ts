/**
 * Post-process deep-search synthesis: allowlist URLs from research context,
 * strip invalid markdown links, append a deterministic "## 참고 자료" section.
 */

/** Loose URL scan for substrings that appear in research dumps. */
const URL_GUESS = /https?:\/\/[^\s\])>'"<]+/gi;

/** Standard markdown links (not images). */
const MD_LINK_RE = /(?<!!)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const MD_IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

export function normalizeUrlKey(raw: string): string | null {
	const trimmed = raw.trim().replace(/[),.;:]+$/g, '');
	try {
		const u = new URL(trimmed);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
		return u.href;
	} catch {
		return null;
	}
}

/** All http(s) URL keys found verbatim in the research context string. */
export function extractAllowedUrlKeysFromResearchContext(researchContext: string): Set<string> {
	const keys = new Set<string>();
	let m: RegExpExecArray | null;
	const re = new RegExp(URL_GUESS);
	while ((m = re.exec(researchContext)) !== null) {
		const key = normalizeUrlKey(m[0]);
		if (key) keys.add(key);
	}
	return keys;
}

/** Remove trailing "## 참고 자료" section (last occurrence from a line start). */
export function stripReferenceSection(markdown: string): string {
	const s = markdown;
	const needles = ['\n## 참고 자료', '\r\n## 참고 자료'];
	let cut = -1;
	for (const p of needles) {
		const i = s.lastIndexOf(p);
		if (i > cut) cut = i;
	}
	if (cut >= 0) return s.slice(0, cut).trimEnd();
	if (/^\s*##\s*참고\s*자료/im.test(s)) {
		return '';
	}
	return s.trimEnd();
}

export function sanitizeMarkdownLinksAgainstAllowlist(
	markdown: string,
	allowedUrlKeys: Set<string>
): { text: string; strippedLinkCount: number } {
	let stripped = 0;
	const text = markdown
		.replace(new RegExp(MD_IMAGE_RE.source, 'gi'), (full, alt: string, url: string) => {
			const key = normalizeUrlKey(url);
			if (key && allowedUrlKeys.has(key)) return full;
			stripped += 1;
			return alt?.trim() ?? '';
		})
		.replace(new RegExp(MD_LINK_RE.source, 'g'), (full, label: string, url: string) => {
			const key = normalizeUrlKey(url);
			if (key && allowedUrlKeys.has(key)) return full;
			stripped += 1;
			const t = label?.trim();
			if (t) return t;
			const k = normalizeUrlKey(url);
			return k ? hostFromHref(k) : url;
		});
	return { text, strippedLinkCount: stripped };
}

/** First-occurrence order of allowed http(s) URLs in markdown links. */
export function collectOrderedReferenceUrls(
	markdown: string,
	allowedUrlKeys: Set<string>
): string[] {
	const ordered: string[] = [];
	const seen = new Set<string>();
	const re = new RegExp(MD_LINK_RE.source, 'g');
	let m: RegExpExecArray | null;
	while ((m = re.exec(markdown)) !== null) {
		const url = m[2];
		const key = normalizeUrlKey(url);
		if (!key || !allowedUrlKeys.has(key) || seen.has(key)) continue;
		seen.add(key);
		ordered.push(key);
	}
	return ordered;
}

/** First link label seen for each normalized URL key. */
export function buildUrlTitleMap(markdown: string): Map<string, string> {
	const map = new Map<string, string>();
	const re = new RegExp(MD_LINK_RE.source, 'g');
	let m: RegExpExecArray | null;
	while ((m = re.exec(markdown)) !== null) {
		const label = m[1].trim();
		const key = normalizeUrlKey(m[2]);
		if (!key || map.has(key)) continue;
		map.set(key, label || hostFromHref(key));
	}
	return map;
}

function hostFromHref(href: string): string {
	try {
		return new URL(href).hostname.replace(/^www\./, '');
	} catch {
		return href;
	}
}

export function buildDeterministicReferenceSection(
	orderedUrlKeys: string[],
	titleByUrl: Map<string, string>
): string {
	if (orderedUrlKeys.length === 0) {
		return '## 참고 자료\n\n_본문에 연구 컨텍스트와 일치하는 인용 링크가 없습니다._\n';
	}
	const lines = orderedUrlKeys.map((href, i) => {
		const title = titleByUrl.get(href) ?? hostFromHref(href);
		return `${i + 1}. [${title}](${href})`;
	});
	return `## 참고 자료\n\n${lines.join('\n')}\n`;
}

export interface FinalizeSynthesisResult {
	text: string;
	strippedInvalidLinkCount: number;
	referenceUrlCount: number;
}

/** Strip any model "## 참고 자료", unwrap non-allowlisted links, append deterministic refs. */
export function finalizeDeepSearchSynthesis(
	rawMarkdown: string,
	researchContext: string
): FinalizeSynthesisResult {
	const allowed = extractAllowedUrlKeysFromResearchContext(researchContext);
	const withoutOldRefs = stripReferenceSection(rawMarkdown);
	const { text: sanitized, strippedLinkCount } = sanitizeMarkdownLinksAgainstAllowlist(
		withoutOldRefs,
		allowed
	);
	const titleMap = buildUrlTitleMap(sanitized);
	const ordered = collectOrderedReferenceUrls(sanitized, allowed);
	const refs = buildDeterministicReferenceSection(ordered, titleMap);
	const body = sanitized.trimEnd();
	const text = `${body}\n\n${refs}`.trimEnd() + '\n';
	return {
		text,
		strippedInvalidLinkCount: strippedLinkCount,
		referenceUrlCount: ordered.length
	};
}
