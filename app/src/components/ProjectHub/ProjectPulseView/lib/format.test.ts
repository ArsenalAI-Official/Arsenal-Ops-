import { describe, it, expect } from 'vitest';
import { fmt$, fmt$k, fmtPct, CATEGORY_COLORS } from './format';

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

describe('CATEGORY_COLORS', () => {
  it('has the 5 spend categories with stable keys/colors', () => {
    expect(CATEGORY_COLORS).toHaveLength(5);
    const dev = CATEGORY_COLORS.find((c) => c.key === 'dev');
    expect(dev?.color).toBe('#E0B954');
  });
});
