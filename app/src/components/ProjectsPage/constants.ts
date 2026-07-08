// ProjectsPage shared constants. Status/type/priority config is sourced from
// the canonical single source in `@/lib/workItemConfig` and re-exported here so
// existing `./constants` importers keep working — with the ProjectsPage-specific
// extras (the `blocked`/`backlog` pseudo-statuses and the legend bar order)
// derived from it rather than hand-maintained.
import { STATUS_CONFIG, TYPE_CONFIG } from '@/lib/workItemConfig';

export { PRIORITY_COLOR } from '@/lib/workItemConfig';

// Same canonical object, re-typed as a string-indexable record to preserve the
// prior `TASK_TYPE_CONFIG[item.type]` call contract.
export const TASK_TYPE_CONFIG: Record<string, (typeof TYPE_CONFIG)[keyof typeof TYPE_CONFIG]> =
  TYPE_CONFIG;

// Status → color, extended with the two pseudo-statuses ProjectsPage renders
// that aren't part of the work-item workflow (`blocked`; `backlog` is canonical).
export const STATUS_COLOR: Record<string, string> = {
  todo: STATUS_CONFIG.todo.color,
  in_progress: STATUS_CONFIG.in_progress.color,
  in_review: STATUS_CONFIG.in_review.color,
  done: STATUS_CONFIG.done.color,
  blocked: '#E5484D',
  backlog: STATUS_CONFIG.backlog.color,
};

// Status legend bars (display order: done → in_progress → in_review → todo).
export const STATUS_BARS = [
  { key: 'done', color: STATUS_CONFIG.done.color, label: STATUS_CONFIG.done.label },
  {
    key: 'in_progress',
    color: STATUS_CONFIG.in_progress.color,
    label: STATUS_CONFIG.in_progress.label,
  },
  { key: 'in_review', color: STATUS_CONFIG.in_review.color, label: STATUS_CONFIG.in_review.label },
  { key: 'todo', color: STATUS_CONFIG.todo.color, label: STATUS_CONFIG.todo.label },
] as const;

// Calendar styling shared across date picker popovers.
export { CALENDAR_CLASS_NAMES } from '@/lib/calendarClassNames';
