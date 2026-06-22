import type { WorkItem } from '@/types/workItems';

export type ListSortKey = 'type' | 'status' | 'priority' | 'assignee' | 'due_date' | 'completed_at';

// Canonical orderings for the sortable list-view columns.
export const LIST_SORT_TYPE_ORDER: Record<string, number> = {
  epic: 0,
  user_story: 1,
  task: 2,
  bug: 3,
};
export const LIST_SORT_STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  in_review: 3,
  done: 4,
};
export const LIST_SORT_PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// Pure comparator factory holding the body of the `listItemComparator` useMemo.
// Returns null when there's no active sort key (group's natural order).
export const makeListItemComparator = (
  sortKey: ListSortKey | null,
  sortDir: 'asc' | 'desc',
): ((a: WorkItem, b: WorkItem) => number) | null => {
  if (!sortKey) return null;
  const dir = sortDir === 'asc' ? 1 : -1;
  return (a: WorkItem, b: WorkItem) => {
    let cmp = 0;
    switch (sortKey) {
      case 'type':
        cmp = (LIST_SORT_TYPE_ORDER[a.type] ?? 99) - (LIST_SORT_TYPE_ORDER[b.type] ?? 99);
        break;
      case 'status':
        cmp = (LIST_SORT_STATUS_ORDER[a.status] ?? 99) - (LIST_SORT_STATUS_ORDER[b.status] ?? 99);
        break;
      case 'priority':
        cmp =
          (LIST_SORT_PRIORITY_ORDER[a.priority] ?? 99) -
          (LIST_SORT_PRIORITY_ORDER[b.priority] ?? 99);
        break;
      case 'assignee': {
        const aa = a.assignee_id ? (a.assignee || '').toLowerCase() : '￿';
        const bb = b.assignee_id ? (b.assignee || '').toLowerCase() : '￿';
        cmp = aa.localeCompare(bb);
        break;
      }
      case 'due_date':
      case 'completed_at': {
        // Null/missing values always sort to the bottom, regardless of dir,
        // so toggling asc/desc reorders the populated rows without flipping
        // the empty ones to the top.
        const av = a[sortKey] ? new Date(a[sortKey] as string).getTime() : null;
        const bv = b[sortKey] ? new Date(b[sortKey] as string).getTime() : null;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        cmp = av - bv;
        break;
      }
    }
    return cmp * dir;
  };
};
