import { describe, it, expect } from 'vitest';
import { parseLocalDate, getWeekStart, formatWeekRange } from './listGrouping';

describe('parseLocalDate', () => {
  it('returns undefined for empty input', () => {
    expect(parseLocalDate(undefined)).toBeUndefined();
    expect(parseLocalDate('')).toBeUndefined();
  });

  it('parses YYYY-MM-DD into a local Date (no UTC shift)', () => {
    const d = parseLocalDate('2026-03-15')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March = index 2
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });
});

describe('getWeekStart', () => {
  it('returns the Monday of the week for a midweek day', () => {
    // 2026-03-11 is a Wednesday → Monday is 2026-03-09.
    expect(getWeekStart(new Date(2026, 2, 11))).toBe('2026-03-09');
  });

  it('maps Sunday to the PRECEDING Monday', () => {
    // 2026-03-15 is a Sunday → Monday is 2026-03-09.
    expect(getWeekStart(new Date(2026, 2, 15))).toBe('2026-03-09');
  });

  it('keeps Monday on itself', () => {
    expect(getWeekStart(new Date(2026, 2, 9))).toBe('2026-03-09');
  });

  it('handles month/year boundaries', () => {
    // 2026-01-01 is a Thursday → Monday is 2025-12-29.
    expect(getWeekStart(new Date(2026, 0, 1))).toBe('2025-12-29');
  });
});

describe('formatWeekRange', () => {
  it('returns the input unchanged when unparseable', () => {
    expect(formatWeekRange('')).toBe('');
  });

  it('formats a same-month range as "Mon D – D"', () => {
    // 2026-03-09 (Mon) → +6 days = 2026-03-15, same month.
    expect(formatWeekRange('2026-03-09')).toBe('Mar 9 – 15');
  });

  it('formats a cross-month range with both month labels', () => {
    // 2026-03-30 (Mon) → +6 days = 2026-04-05, spans March→April.
    expect(formatWeekRange('2026-03-30')).toBe('Mar 30 – Apr 5');
  });
});
