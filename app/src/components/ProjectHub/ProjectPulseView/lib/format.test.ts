import { describe, it, expect } from 'vitest';
import { fmt$, fmt$k, fmtPct, fmtPulseDate, monthOrdinal, CATEGORY_COLORS } from './format';

describe('fmt$', () => {
  it('formats with thousands separators and rounds', () => {
    expect(fmt$(1234)).toBe('$1,234');
    expect(fmt$(1234.6)).toBe('$1,235');
    expect(fmt$(0)).toBe('$0');
  });
  it('prefixes a minus sign for negatives', () => {
    expect(fmt$(-1234)).toBe('-$1,234');
  });
});

describe('fmt$k', () => {
  it('formats thousands to one decimal with a k suffix', () => {
    expect(fmt$k(1234)).toBe('$1.2k');
    expect(fmt$k(0)).toBe('$0k');
    expect(fmt$k(-5000)).toBe('-$5k');
  });
});

describe('fmtPct', () => {
  it('renders a fraction as a rounded percentage', () => {
    expect(fmtPct(0.25)).toBe('25%');
    expect(fmtPct(1)).toBe('100%');
    expect(fmtPct(0.333)).toBe('33%');
  });
});

describe('fmtPulseDate', () => {
  it('formats a full ISO timestamp to "Mon YYYY"', () => {
    expect(fmtPulseDate('2026-05-20T22:22:18.956437')).toBe('May 2026');
  });
  it('formats a bare YYYY-MM-DD to "Mon YYYY"', () => {
    expect(fmtPulseDate('2026-01-09')).toBe('Jan 2026');
  });
  it('passes already-formatted labels through unchanged', () => {
    expect(fmtPulseDate('Feb 26')).toBe('Feb 26');
    expect(fmtPulseDate('May 2026')).toBe('May 2026');
  });
  it('returns empty string for empty/nullish input', () => {
    expect(fmtPulseDate('')).toBe('');
    expect(fmtPulseDate(null)).toBe('');
    expect(fmtPulseDate(undefined)).toBe('');
  });
});

describe('monthOrdinal', () => {
  it('parses the "MMM YY" fixture label', () => {
    expect(monthOrdinal('Feb 26')).toBe(2026 * 12 + 1);
  });
  it('parses the "Month YYYY" derived label (full month name + 4-digit year)', () => {
    // Regression: the derive endpoint emits strftime("%B %Y"); the old parser
    // used indexOf on the full name and a 2000+year offset, so these never
    // matched the real current date and the TODAY marker snapped to the edge.
    expect(monthOrdinal('May 2026')).toBe(2026 * 12 + 4);
    expect(monthOrdinal('June 2026')).toBe(2026 * 12 + 5);
    expect(monthOrdinal('September 2026')).toBe(2026 * 12 + 8);
  });
  it('agrees with a Date-derived ordinal so the marker lines up with today', () => {
    const d = new Date(2026, 4, 15); // May 2026 — getMonth() is 0-based like MONTH_ABBR
    expect(monthOrdinal('May 2026')).toBe(d.getFullYear() * 12 + d.getMonth());
  });
  it('returns null for unrecognized labels', () => {
    expect(monthOrdinal('Q1')).toBeNull();
    expect(monthOrdinal('')).toBeNull();
    expect(monthOrdinal('Foo 2026')).toBeNull();
  });
});

describe('CATEGORY_COLORS', () => {
  it('has the 5 spend categories with stable keys/colors', () => {
    expect(CATEGORY_COLORS).toHaveLength(5);
    const dev = CATEGORY_COLORS.find((c) => c.key === 'dev');
    expect(dev?.color).toBe('#A6A29C');
  });
});
