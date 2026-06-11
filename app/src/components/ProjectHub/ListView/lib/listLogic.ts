import type { SortDirection, SortField, WorkItem } from '../types';

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'critical':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'medium':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

export function filterAndSortItems(
  workItems: WorkItem[],
  searchTerm: string,
  statusFilter: string,
  priorityFilter: string,
  assigneeFilter: string,
  sortField: SortField,
  sortDirection: SortDirection,
): WorkItem[] {
  let items = [...workItems];

  // Filter
  if (searchTerm) {
    items = items.filter(
      (item) =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.key.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }
  if (statusFilter !== 'all') {
    items = items.filter((item) => item.status === statusFilter);
  }
  if (priorityFilter !== 'all') {
    items = items.filter((item) => item.priority === priorityFilter);
  }
  if (assigneeFilter !== 'all') {
    items = items.filter((item) => (item.assignee || 'Unassigned') === assigneeFilter);
  }

  // Sort
  items.sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    if (sortField === 'due_date') {
      aVal = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      bVal = b.due_date ? new Date(b.due_date).getTime() : Infinity;
    }

    if (sortField === 'completed_at') {
      aVal = a.completed_at ? new Date(a.completed_at).getTime() : Infinity;
      bVal = b.completed_at ? new Date(b.completed_at).getTime() : Infinity;
    }

    if (aVal === undefined || aVal === null) aVal = '';
    if (bVal === undefined || bVal === null) bVal = '';

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal as string).toLowerCase();
    }

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return items;
}

export function groupItems(
  filteredAndSortedItems: WorkItem[],
  groupBy: string,
): Record<string, WorkItem[]> {
  if (groupBy === 'none') return { 'All Items': filteredAndSortedItems };

  return filteredAndSortedItems.reduce(
    (acc, item) => {
      let key: string;
      switch (groupBy) {
        case 'status':
          key = item.status;
          break;
        case 'assignee':
          key = item.assignee || 'Unassigned';
          break;
        case 'sprint':
          key = item.sprint || 'No Sprint';
          break;
        default:
          key = 'All Items';
      }
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<string, WorkItem[]>,
  );
}
