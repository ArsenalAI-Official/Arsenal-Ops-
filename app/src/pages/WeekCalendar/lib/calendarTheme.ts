// Calendar-specific colors used as runtime style values (inline styles + JS
// computed colors). Centralized so the brand accent and the capacity
// over/warn/ok scale don't drift across the calendar's files — the same drift
// problem @/lib/workItemConfig solves for status/type/priority colors.
//
// Note: a few Tailwind arbitrary-value classes (e.g. bg-[#E0B954]/[0.12]) still
// inline the accent — Tailwind can't read a JS const at build time. These hex
// values must match CALENDAR.accent.
export const CALENDAR = {
  /** Brand gold — now-line, "today" header, week-total pill, drag preview. */
  accent: '#E0B954',
  /** Capacity scale for day totals / palette remaining bars. */
  over: '#EF4444',
  warn: '#F59E0B',
  ok: '#34D399',
  muted: '#737373',
} as const;
