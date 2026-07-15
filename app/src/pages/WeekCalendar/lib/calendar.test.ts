import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRID,
  blockToInterval,
  formatClock,
  formatDuration,
  formatHours,
  intervalToBlock,
  placementInterval,
  snapHour,
  startOfWeekMonday,
  weekDays,
} from './calendar';

const hoursApart = (a: string, b: string) =>
  (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;

describe('snapHour', () => {
  it('snaps to the nearest whole hour by default (whole-hour blocks)', () => {
    expect(snapHour(9.1, DEFAULT_GRID)).toBe(9);
    expect(snapHour(9.6, DEFAULT_GRID)).toBe(10);
    expect(snapHour(9.4, DEFAULT_GRID)).toBe(9);
  });

  it('supports a 15-minute step when configured (stacked minutes follow-up)', () => {
    const cfg = { ...DEFAULT_GRID, stepMinutes: 15 };
    expect(snapHour(9.1, cfg)).toBe(9);
    expect(snapHour(9.2, cfg)).toBe(9.25);
    expect(snapHour(9.13, cfg)).toBe(9.25);
  });

  it('clamps to the full-day grid bounds', () => {
    expect(snapHour(-2, DEFAULT_GRID)).toBe(DEFAULT_GRID.startHour); // 0
    expect(snapHour(26, DEFAULT_GRID)).toBe(DEFAULT_GRID.endHour); // 24
    // Times throughout the day are no longer clamped to a working window.
    expect(snapHour(2, DEFAULT_GRID)).toBe(2);
    expect(snapHour(23, DEFAULT_GRID)).toBe(23);
  });

  it('honors a 30-minute step', () => {
    const cfg = { ...DEFAULT_GRID, stepMinutes: 30 };
    expect(snapHour(9.4, cfg)).toBe(9.5);
    expect(snapHour(9.2, cfg)).toBe(9);
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(1.5)).toBe('1h 30m');
    expect(formatDuration(2)).toBe('2h');
    expect(formatDuration(0.25)).toBe('15m');
  });

  it('formats fractional hours without trailing zeros', () => {
    expect(formatHours(3.5)).toBe('3.5h');
    expect(formatHours(3)).toBe('3h');
    expect(formatHours(0.25)).toBe('0.25h');
  });

  it('formats a 12-hour clock', () => {
    expect(formatClock(9)).toBe('9 AM');
    expect(formatClock(9.5)).toBe('9:30 AM');
    expect(formatClock(13.25)).toBe('1:15 PM');
    expect(formatClock(12)).toBe('12 PM');
  });
});

describe('week dates', () => {
  it('finds Monday for any weekday', () => {
    // 2026-06-24 is a Wednesday.
    const monday = startOfWeekMonday(new Date(2026, 5, 24, 15, 30));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(22);
    expect(monday.getHours()).toBe(0);
  });

  it('renders five weekday columns by default', () => {
    const days = weekDays(startOfWeekMonday(new Date(2026, 5, 24)));
    expect(days.map((d) => d.name)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(days.map((d) => d.date)).toEqual(['22', '23', '24', '25', '26']);
  });

  it('renders seven columns including the weekend when asked', () => {
    const days = weekDays(startOfWeekMonday(new Date(2026, 5, 24)), 7);
    expect(days.map((d) => d.name)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(days.map((d) => d.date)).toEqual(['22', '23', '24', '25', '26', '27', '28']);
  });
});

describe('block <-> interval conversion round-trips', () => {
  it('preserves day and time through a round trip', () => {
    const weekStart = startOfWeekMonday(new Date(2026, 5, 24));
    const { startISO, endISO } = blockToInterval(weekStart, 2, 9.5, 11.25);
    const back = intervalToBlock(weekStart, startISO, endISO);
    expect(back.dayIdx).toBe(2);
    expect(back.start).toBe(9.5);
    expect(back.end).toBe(11.25);
  });

  it('produces UTC ISO strings', () => {
    const weekStart = startOfWeekMonday(new Date(2026, 5, 24));
    const { startISO } = blockToInterval(weekStart, 0, 9, 10);
    expect(startISO).toMatch(/Z$/);
  });

  it('serializes wall-clock as UTC so the billing day matches the drawn day', () => {
    // A late-evening Friday block must stay on Friday for every viewer timezone
    // (regression: a local-offset serialization rolled it to Saturday / next day
    // and out of the Mon–Fri window). This assertion is timezone-independent.
    const weekStart = startOfWeekMonday(new Date(2026, 5, 24));
    const { startISO, endISO } = blockToInterval(weekStart, 4, 23, 24);
    expect(startISO).toMatch(/T23:00:00\.000Z$/);
    const back = intervalToBlock(weekStart, startISO, endISO);
    expect(back.dayIdx).toBe(4); // Friday, not rolled to Saturday
    expect(back.start).toBe(23);
  });

  it('decodes a block ending at midnight as 24:00, not 0', () => {
    const weekStart = startOfWeekMonday(new Date(2026, 5, 24));
    const { startISO, endISO } = blockToInterval(weekStart, 0, 22, 24);
    const back = intervalToBlock(weekStart, startISO, endISO);
    expect(back.start).toBe(22);
    expect(back.end).toBe(24); // not 0 — height and day totals stay positive
  });
});

describe('placementInterval (tray entry keeps its logged duration)', () => {
  const weekStart = startOfWeekMonday(new Date('2026-06-24T12:00:00'));

  it('preserves the entry duration rather than collapsing to the drop default', () => {
    // Regression: placing a 2h logged entry must stay 2h, not become 1h.
    const { startISO, endISO } = placementInterval(weekStart, 0, 10, 2, DEFAULT_GRID);
    expect(hoursApart(startISO, endISO)).toBe(2);
  });

  it('keeps fractional durations exact', () => {
    const { startISO, endISO } = placementInterval(weekStart, 1, 9, 1.5, DEFAULT_GRID);
    expect(hoursApart(startISO, endISO)).toBe(1.5);
  });

  it('shifts the start earlier so a long entry keeps its full duration', () => {
    // start 22:00, 4h duration, grid ends at 24:00 -> start shifts to 20:00,
    // preserving the full 4h rather than truncating logged time.
    const { startISO, endISO } = placementInterval(weekStart, 2, 22, 4, DEFAULT_GRID);
    expect(hoursApart(startISO, endISO)).toBe(4);
  });
});
