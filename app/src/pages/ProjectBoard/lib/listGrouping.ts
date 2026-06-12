// Re-export the canonical local-date parser. The board family imports
// parseLocalDate from here for convenience, but the implementation (with full
// validation + ISO-timestamp handling — a bare-YYYY-MM-DD fork mis-rendered
// malformed dates as "Invalid Date") lives in @/lib/dateUtils.
import { parseLocalDate } from '@/lib/dateUtils';
export { parseLocalDate };

// Returns YYYY-MM-DD for the Monday of the week containing `d`, in local time.
export const getWeekStart = (d: Date): string => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export const formatWeekRange = (weekStart: string): string => {
  const start = parseLocalDate(weekStart);
  if (!start) return weekStart;
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.getDate()}`;
  }
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
};
