import { describe, it, expect } from 'vitest';
import { layoutDay } from './layout';

describe('layoutDay', () => {
  it('gives a lone block a single full-width lane', () => {
    const [pos] = layoutDay([{ start: 9, end: 11 }]);
    expect(pos).toEqual({ item: { start: 9, end: 11 }, lane: 0, lanes: 1 });
  });

  it('places two overlapping blocks side by side', () => {
    const out = layoutDay([
      { start: 9, end: 11 },
      { start: 10, end: 12 },
    ]);
    expect(out.map((p) => p.lane)).toEqual([0, 1]);
    expect(out.every((p) => p.lanes === 2)).toBe(true);
  });

  it('reuses a lane once the earlier block has ended (no overlap)', () => {
    const out = layoutDay([
      { start: 9, end: 10 },
      { start: 10, end: 11 },
    ]);
    // Sequential, non-overlapping → separate clusters, each full width.
    expect(out.every((p) => p.lanes === 1)).toBe(true);
  });

  it('sizes a three-way overlap cluster to three lanes', () => {
    const out = layoutDay([
      { start: 9, end: 12 },
      { start: 9.5, end: 11 },
      { start: 10, end: 11.5 },
    ]);
    expect(out.every((p) => p.lanes === 3)).toBe(true);
    expect(new Set(out.map((p) => p.lane))).toEqual(new Set([0, 1, 2]));
  });

  it('keeps independent clusters at their own lane counts', () => {
    const out = layoutDay([
      { start: 9, end: 10 },
      { start: 9, end: 10 }, // overlaps the first → 2 lanes
      { start: 14, end: 15 }, // separate cluster → 1 lane
    ]);
    const byStartLanes = out.map((p) => ({ start: p.item.start, lanes: p.lanes }));
    expect(byStartLanes.filter((b) => b.start === 9).every((b) => b.lanes === 2)).toBe(true);
    expect(byStartLanes.find((b) => b.start === 14)?.lanes).toBe(1);
  });
});
