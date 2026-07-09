// Domain types + presentation constants for the Projects tab.
// Co-located so the orchestrator, toolbar, cards view, reports table, and the
// per-row drill-down share one definition (CONVENTIONS rule 6).

export type StatusBucket = 'todo_backlog' | 'in_progress' | 'in_review' | 'done_this_week';

export type ProjectsView = 'cards' | 'reports';

/** Compact "Jun 1 – 7, 2026" range for the report header. Same-month dates
 *  collapse to a single month name; cross-month ranges show both. Parses ISO
 *  strings without going through native `new Date(string)` for an ISO with
 *  timezone (which is safe here — backend emits UTC timestamps and we just
 *  want the calendar dates the user expects to see). */
export function formatWeekRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  const monthFmt: Intl.DateTimeFormatOptions = { month: 'short' };
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
  const startStr = `${start.toLocaleDateString('en-US', { ...monthFmt, timeZone: 'UTC' })} ${start.getUTCDate()}`;
  const endStr = sameMonth
    ? `${end.getUTCDate()}`
    : `${end.toLocaleDateString('en-US', { ...monthFmt, timeZone: 'UTC' })} ${end.getUTCDate()}`;
  return `${startStr} – ${endStr}, ${end.getUTCFullYear()}`;
}

// Sentinel string for the "no category" option inside the per-card Select.
// Using a string-literal (not '' which Radix Select rejects) avoids the
// silent "Select.Item must have a value prop that is not an empty string"
// runtime error.
export const UNCATEGORIZED_OPTION = '__uncategorized__';

// Status-accent palette for the Reports view. Matches the canonical
// home-page palette in `components/ProjectsPage/constants.ts` (STATUS_COLOR /
// STATUS_CONFIG) so the status colors stay consistent across the app —
// kanban dropdown, MyTasks/Upcoming list, and this admin Reports view all
// share the same visual vocabulary. Tints (`bg`) are the hex `color` at ~12%
// alpha for use as soft tile backgrounds.
export const STATUS_ACCENTS: Record<StatusBucket, { color: string; bg: string; label: string }> = {
  todo_backlog: { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', label: 'ToDo / Backlog' },
  in_progress: { color: '#6E62E6', bg: 'rgba(110,98,230,0.12)', label: 'In progress' },
  in_review: { color: '#D06BB0', bg: 'rgba(208,107,176,0.12)', label: 'In review' },
  done_this_week: { color: '#40BE86', bg: 'rgba(64,190,134,0.14)', label: 'Done' },
};

// Priority-accent palette for ticket rows in the expanded drill-down.
// Re-exported from the single source of truth so the dot color never drifts
// from the rest of the app (Style Guide 1a warm severity ramp).
export { PRIORITY_COLOR } from '@/lib/workItemConfig';

export const STATUS_BUTTONS: { id: StatusBucket; label: string }[] = [
  // ToDo/Backlog first — it's the earliest workflow status, so reading
  // left-to-right matches the lifecycle. `in_progress` remains the default
  // selection (set in useState below) per UX requirement.
  { id: 'todo_backlog', label: 'ToDo / Backlog' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'in_review', label: 'In review' },
  { id: 'done_this_week', label: 'Done' },
];
