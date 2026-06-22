import { describe, it, expect } from 'vitest';
import { parseLocalDate, formatLocalDate } from './dateUtils';

describe('parseLocalDate', () => {
  it('parses YYYY-MM-DD at local midnight (no UTC off-by-one)', () => {
    const d = parseLocalDate('2026-03-15')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // March, 0-indexed
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(0);
  });

  it('takes the date portion of a full ISO timestamp, pinning the local calendar day', () => {
    // The classic bug: `new Date('2026-03-15T22:00:00Z')` can render as the 15th
    // or 16th depending on the viewer's timezone. parseLocalDate pins it to the
    // local 15th regardless of TZ, so this assertion is timezone-independent.
    const d = parseLocalDate('2026-03-15T22:00:00Z')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2);
    expect(d.getDate()).toBe(15);
  });

  it('returns undefined for empty / null / undefined', () => {
    expect(parseLocalDate('')).toBeUndefined();
    expect(parseLocalDate(null)).toBeUndefined();
    expect(parseLocalDate(undefined)).toBeUndefined();
  });

  it('returns undefined for malformed input', () => {
    expect(parseLocalDate('garbage')).toBeUndefined();
    expect(parseLocalDate('not-a-date')).toBeUndefined();
  });
});

describe('formatLocalDate', () => {
  it('formats a Date as zero-padded YYYY-MM-DD in local time', () => {
    expect(formatLocalDate(new Date(2026, 2, 5))).toBe('2026-03-05');
    expect(formatLocalDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('round-trips with parseLocalDate', () => {
    expect(formatLocalDate(parseLocalDate('2026-07-09')!)).toBe('2026-07-09');
  });
});
