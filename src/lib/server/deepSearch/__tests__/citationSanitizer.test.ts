import { describe, it, expect } from 'vitest';
import {
	extractAllowedUrlKeysFromResearchContext,
	stripReferenceSection,
	sanitizeMarkdownLinksAgainstAllowlist,
	finalizeDeepSearchSynthesis,
	collectOrderedReferenceUrls
} from '../citationSanitizer';

const CTX = `=== AVAILABLE SOURCES ===
[1] Good
    URL: https://good.example/a

  [Page URL: https://other.example/b]
Some text
`;

describe('citationSanitizer', () => {
	it('extractAllowedUrlKeysFromResearchContext collects normalized URLs', () => {
		const keys = extractAllowedUrlKeysFromResearchContext(CTX);
		expect(keys.has('https://good.example/a')).toBe(true);
		expect(keys.has('https://other.example/b')).toBe(true);
	});

	it('stripReferenceSection removes trailing reference block', () => {
		const md = 'Hello\n\n## 참고 자료\n\n1. [x](https://x.com)\n';
		expect(stripReferenceSection(md).trim()).toBe('Hello');
	});

	it('sanitizeMarkdownLinksAgainstAllowlist unwraps unknown URLs', () => {
		const allowed = extractAllowedUrlKeysFromResearchContext(CTX);
		const { text, strippedLinkCount } = sanitizeMarkdownLinksAgainstAllowlist(
			'See [A](https://good.example/a) and [Bad](https://evil.test/x).',
			allowed
		);
		expect(strippedLinkCount).toBe(1);
		expect(text).toContain('[A](https://good.example/a)');
		expect(text).not.toContain('evil.test');
		expect(text).toMatch(/Bad/);
	});

	it('finalizeDeepSearchSynthesis strips old refs, filters links, appends ordered refs', () => {
		const raw =
			'### 본문\n\n[Two](https://other.example/b) then [One](https://good.example/a) and [Bad](https://not-in-ctx.example/x).\n\n## 참고 자료\n\n9. [ignored](https://good.example/a)\n';
		const out = finalizeDeepSearchSynthesis(raw, CTX);
		expect(out.text).toMatch(/## 참고 자료/);
		expect(out.text).toMatch(/1\. \[Two\]\(https:\/\/other\.example\/b\)/);
		expect(out.text).toMatch(/2\. \[One\]\(https:\/\/good\.example\/a\)/);
		expect(out.text).not.toContain('not-in-ctx.example');
		expect(out.strippedInvalidLinkCount).toBe(1);
		expect(out.referenceUrlCount).toBe(2);
	});

	it('collectOrderedReferenceUrls preserves first-seen order', () => {
		const allowed = extractAllowedUrlKeysFromResearchContext(CTX);
		const md = '[b](https://other.example/b) then [a](https://good.example/a)';
		expect(collectOrderedReferenceUrls(md, allowed)).toEqual([
			'https://other.example/b',
			'https://good.example/a'
		]);
	});
});
