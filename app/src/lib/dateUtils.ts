// Canonical local-date helpers. Consolidates the ~6 copies of parseLocalDate
// that were scattered across pages (some of which only handled bare YYYY-MM-DD
// and mis-parsed full ISO timestamps).

/**
 * Parse a date string to a *local* Date at midnight, avoiding the UTC pitfall
 * where `new Date('2026-03-15')` lands on the previous local day in negative-
 * offset timezones. Accepts both `YYYY-MM-DD` and full ISO timestamps
 * (`2026-03-15T22:00:00Z`) — the date portion is taken as-is.
 */
export function parseLocalDate(dateString: string | undefined | null): Date | undefined {
  if (!dateString) return undefined;
  const datePart = String(dateString).split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

/** Format a Date as `YYYY-MM-DD` in local time. */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
