// Parse YYYY-MM-DD string to local Date object (avoids UTC timezone issues)
export const parseLocalDate = (dateString: string | undefined): Date | undefined => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

// Format a Date as YYYY-MM-DD in local time
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
