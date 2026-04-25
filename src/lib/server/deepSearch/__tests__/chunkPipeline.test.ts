import { describe, expect, it } from 'vitest';
import {
	buildCollectedTextsMarkdown,
	buildResearchChunks,
	type CollectedText
} from '../chunkPipeline';

describe('chunkPipeline', () => {
	const sampleTexts: CollectedText[] = [
		{
			url: 'https://example.com/a',
			title: 'Alpha',
			query: 'alpha query',
			iteration: 1,
			content: 'alpha '.repeat(120)
		},
		{
			url: 'https://example.com/b',
			title: 'Beta',
			query: 'beta query',
			iteration: 2,
			content: 'beta '.repeat(110)
		}
	];

	it('buildCollectedTextsMarkdown keeps cleaned text as-is', () => {
		const markdown = buildCollectedTextsMarkdown(sampleTexts);
		expect(markdown).toContain('정제 본문 원문');
		expect(markdown).toContain('[Alpha](https://example.com/a)');
		expect(markdown).toContain(sampleTexts[0].content.trim());
		expect(markdown).toContain(sampleTexts[1].content.trim());
	});

	it('buildResearchChunks splits by target size with source metadata', () => {
		const chunks = buildResearchChunks(sampleTexts, { targetChars: 450, hardMaxChars: 700 });
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0].sourceUrls.length).toBeGreaterThan(0);
		expect(chunks.every((c) => c.content.length <= 1000)).toBe(true);
	});
});
