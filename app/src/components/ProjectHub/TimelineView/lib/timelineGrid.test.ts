import { describe, it, expect } from 'vitest';
import {
  addDays,
  fmtShort,
  fmtMonth,
  colWidth,
  colDays,
  getPriorityColor,
  BUFFER_COLS,
  ROW_HEIGHT,
  LABEL_WIDTH,
} from './timelineGrid';

describe('addDays', () => {
  it('adds days without mutating the input', () => {
    const base = new Date(2026, 0, 1);
    const out = addDays(base, 5);
    expect(out.getDate()).toBe(6);
    expect(base.getDate()).toBe(1); // unmutated
  });
  it('rolls over month boundaries', () => {
    const out = addDays(new Date(2026, 0, 30), 5); // Jan 30 + 5 = Feb 4
    expect(out.getMonth()).toBe(1);
    expect(out.getDate()).toBe(4);
  });
});

describe('formatters', () => {
  it('fmtShort → "Mon D"', () => {
    expect(fmtShort(new Date(2026, 2, 15))).toBe('Mar 15');
  });
  it('fmtMonth → "Month YYYY"', () => {
    expect(fmtMonth(new Date(2026, 2, 15))).toBe('March 2026');
  });
});

describe('zoom helpers', () => {
  it('colWidth per zoom level', () => {
    expect(colWidth('day')).toBe(40);
    expect(colWidth('week')).toBe(120);
    expect(colWidth('month')).toBe(160);
  });
  it('colDays per zoom level', () => {
    expect(colDays('day')).toBe(1);
    expect(colDays('week')).toBe(7);
    expect(colDays('month')).toBe(30);
  });
});

describe('getPriorityColor', () => {
  it('high/critical share red, medium amber, else grey', () => {
    expect(getPriorityColor('high')).toContain('#EF4444');
    expect(getPriorityColor('critical')).toContain('#EF4444');
    expect(getPriorityColor('medium')).toContain('#F59E0B');
    expect(getPriorityColor('low')).toContain('#737373');
    expect(getPriorityColor(undefined)).toContain('#737373');
  });
});

describe('grid constants', () => {
  it('are the expected pixel/column values', () => {
    expect(BUFFER_COLS).toBe(30);
    expect(ROW_HEIGHT).toBe(44);
    expect(LABEL_WIDTH).toBe(200);
  });
});
