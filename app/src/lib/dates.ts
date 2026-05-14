/**
 * Local-time date parsing.
 *
 * `new Date('2026-03-15')` parses as UTC midnight, which becomes the
 * previous calendar day for any user west of UTC (e.g. all US users).
 * That's why overdue logic, calendar placement, and milestone warnings
 * silently went one day early throughout the codebase before this util.
 *
 * Use `parseLocalDate` when the input is guaranteed defined; use
 * `parseLocalDateOptional` when you want the function to pass undefined
 * through unchanged (most call sites). Both accept bare `YYYY-MM-DD`
 * or `YYYY-MM-DDTHH:MM:SS[Z]` — the time/zone portion is stripped so
 * the result is always local midnight of the calendar date the user
 * actually picked.
 */

export function parseLocalDate(str: string): Date {
  // Remove a trailing Z so we treat the timestamp as local, not UTC.
  const clean = str.endsWith('Z') ? str.slice(0, -1) : str;
  const datePart = clean.includes('T') ? clean.split('T')[0] : clean;
  const [year, month, day] = datePart.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

export function parseLocalDateOptional(str: string | undefined | null): Date | undefined {
  if (!str) return undefined;
  return parseLocalDate(str);
}
