import { describe, it, expect } from 'vitest';
import { normalizeSearchQueryForRecency, resolveSearchCalendarDate } from '../searchDate';
import { extractFirstJsonObject } from '../extractJsonObject';
import {
	CHAT_NO_SEARCH_KO,
	RESPONSE_LANGUAGE_KO,
	WEB_FIRST_GROUNDING
} from '../promptLocale';

// ---------------------------------------------------------------------------
// normalizeSearchQueryForRecency
// ---------------------------------------------------------------------------
describe('normalizeSearchQueryForRecency', () => {
	const DATE = '2026-04-24';

	it('appends date to a plain query', () => {
		expect(normalizeSearchQueryForRecency('KOSPI 주가', DATE)).toBe('KOSPI 주가 2026-04-24');
	});

	it('does not duplicate date when already present at end', () => {
		expect(normalizeSearchQueryForRecency('KOSPI 2026-04-24', DATE)).toBe('KOSPI 2026-04-24');
	});

	it('does not duplicate date when present in the middle', () => {
		expect(normalizeSearchQueryForRecency('2026-04-24 KOSPI PBR', DATE)).toBe(
			'2026-04-24 KOSPI PBR'
		);
	});

	it('returns date alone when query is empty', () => {
		expect(normalizeSearchQueryForRecency('', DATE)).toBe(DATE);
	});

	it('returns query unchanged when calendarDate is invalid', () => {
		expect(normalizeSearchQueryForRecency('KOSPI PER', 'not-a-date')).toBe('KOSPI PER');
	});

	it('returns query unchanged when calendarDate is empty', () => {
		expect(normalizeSearchQueryForRecency('KOSPI PER', '')).toBe('KOSPI PER');
	});

	it('appends date even when query already contains a different date', () => {
		// The query has 2023 data — still append the target date
		expect(normalizeSearchQueryForRecency('KOSPI 2023 annual report', DATE)).toBe(
			'KOSPI 2023 annual report 2026-04-24'
		);
	});
});

// ---------------------------------------------------------------------------
// resolveSearchCalendarDate
// ---------------------------------------------------------------------------
describe('resolveSearchCalendarDate', () => {
	it('prefers a valid localeCalendarDate string', () => {
		expect(resolveSearchCalendarDate('2026-04-24', 'Today is (2025-01-01)')).toBe('2026-04-24');
	});

	it('extracts date from currentDate parentheses fallback', () => {
		expect(resolveSearchCalendarDate(undefined, 'Today is (2026-03-15)')).toBe('2026-03-15');
	});

	it('falls back to today when both inputs are absent', () => {
		const today = new Date();
		const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		expect(resolveSearchCalendarDate(undefined, undefined)).toBe(expected);
	});

	it('ignores a malformed localeCalendarDate and falls back', () => {
		expect(resolveSearchCalendarDate('not-valid', 'Today is (2026-04-10)')).toBe('2026-04-10');
	});
});

// ---------------------------------------------------------------------------
// extractFirstJsonObject
// ---------------------------------------------------------------------------
describe('extractFirstJsonObject', () => {
	it('extracts a plain JSON object', () => {
		const result = extractFirstJsonObject('{"a": 1, "b": true}');
		expect(result).toBe('{"a": 1, "b": true}');
	});

	it('strips markdown fences (```json)', () => {
		const input = '```json\n{"confidence": 0.8}\n```';
		expect(extractFirstJsonObject(input)).toBe('{"confidence": 0.8}');
	});

	it('strips plain ``` fences', () => {
		const input = '```\n{"x": 1}\n```';
		expect(extractFirstJsonObject(input)).toBe('{"x": 1}');
	});

	it('ignores preamble text before the object', () => {
		const input = 'Here is the JSON:\n{"key": "value"}';
		expect(extractFirstJsonObject(input)).toBe('{"key": "value"}');
	});

	it('handles nested objects', () => {
		const input = '{"outer": {"inner": 42}}';
		expect(extractFirstJsonObject(input)).toBe('{"outer": {"inner": 42}}');
	});

	it('handles escaped quotes inside strings', () => {
		const input = '{"msg": "say \\"hello\\""}';
		expect(extractFirstJsonObject(input)).toBe('{"msg": "say \\"hello\\""}');
	});

	it('returns null when there is no JSON object', () => {
		expect(extractFirstJsonObject('just some text')).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(extractFirstJsonObject('')).toBeNull();
	});

	it('extracts the first object when multiple appear', () => {
		const input = '{"first": 1} then {"second": 2}';
		expect(extractFirstJsonObject(input)).toBe('{"first": 1}');
	});
});

// ---------------------------------------------------------------------------
// Integration: evaluator nextQuery must always contain calendarDate
// (Tests the logic introduced in iterationEvaluator's parseEvaluationFromRaw)
// ---------------------------------------------------------------------------
describe('nextQuery recency enforcement', () => {
	it('normalizeSearchQueryForRecency ensures every nextQuery has the date', () => {
		const calendarDate = '2026-04-24';
		const rawQueries = [
			'KOSPI PER 현재',           // no date
			'코스닥 PBR 2026-04-24',    // already has date
			'삼성전자 주가'              // no date
		];
		const result = rawQueries.map((q) => normalizeSearchQueryForRecency(q, calendarDate));
		expect(result[0]).toContain('2026-04-24');
		expect(result[1]).toBe('코스닥 PBR 2026-04-24'); // unchanged
		expect(result[2]).toContain('2026-04-24');
	});
});

// ---------------------------------------------------------------------------
// promptLocale smoke (regression: missing Korean / grounding copy)
// ---------------------------------------------------------------------------
describe('promptLocale', () => {
	it('exports non-empty Korean-forward directives', () => {
		expect(RESPONSE_LANGUAGE_KO.length).toBeGreaterThan(20);
		expect(RESPONSE_LANGUAGE_KO).toContain('한국어');
		expect(WEB_FIRST_GROUNDING).toContain('웹');
		expect(WEB_FIRST_GROUNDING).toContain('학습');
		expect(CHAT_NO_SEARCH_KO).toContain('한국어');
	});
});
