/**
 * Format two ISO date strings (sprint start Monday → sprint end Friday) into
 * a compact readable range, e.g.
 *   "Jan 5 – 16, 2026"             (same month)
 *   "Jan 26 – Feb 6, 2026"          (cross month, same year)
 *   "Dec 28, 2025 – Jan 9, 2026"    (cross year)
 *
 * Uses UTC methods because backend emits dates as midnight UTC and we want the
 * calendar dates the user sees in the spreadsheet — same pattern as
 * `formatWeekRange` in AdminDashboard/tabs/ProjectsTab.
 */
export function formatSprintRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startISO} → ${endISO}`;
  }
  const monthOpts: Intl.DateTimeFormatOptions = { month: 'short', timeZone: 'UTC' };
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const startMonth = start.toLocaleDateString('en-US', monthOpts);
  const endMonth = end.toLocaleDateString('en-US', monthOpts);
  if (sameMonth) {
    return `${startMonth} ${start.getUTCDate()} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${startMonth} ${start.getUTCDate()} – ${endMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  return `${startMonth} ${start.getUTCDate()}, ${start.getUTCFullYear()} – ${endMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
}
