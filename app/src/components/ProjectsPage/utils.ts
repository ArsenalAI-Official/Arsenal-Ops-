// Superseded by the shared lib module. Re-exported so existing importers
// (ProjectHub views, ProjectsPage dialogs, WorkItemPanel) keep working.
import { parseLocalDate } from '@/lib/dateUtils';
export { parseLocalDate, formatLocalDate } from '@/lib/dateUtils';

// Is a date-only due date past due, in the VIEWER'S local timezone?
//
// `due_date` carries date-only semantics (the user picks a calendar day; the
// backend stores it at midnight UTC). "Overdue" therefore means the local
// calendar date has moved PAST the due date — a task due *today* is not yet
// overdue, and it flips to overdue at the viewer's local midnight regardless of
// timezone (Eastern, Pacific, etc.). The server can't decide this because it
// runs in UTC and doesn't know each viewer's timezone, so we compute it here.
// `parseLocalDate` builds the due date at LOCAL midnight; comparing it to
// today's local midnight keeps the comparison purely date-based.
export const isPastDue = (
  dueDate: string | null | undefined,
  status: string | null | undefined,
): boolean => {
  if (!dueDate || status === 'done') return false;
  const due = parseLocalDate(dueDate.split('T')[0]);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
};
