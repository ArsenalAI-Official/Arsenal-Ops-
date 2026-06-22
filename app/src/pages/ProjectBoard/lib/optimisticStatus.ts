import type { WorkItem } from '@/types/workItems';

// Pure optimistic-cache transform shared by moveMutation.onMutate and
// statusChangeMutation.onMutate. Returns a NEW array where only the matching
// item's status is replaced; all other items keep their identity. Immutable:
// never mutates the input list or its items.
export const applyStatusChange = (
  list: WorkItem[] | undefined,
  itemId: string,
  newStatus: string,
): WorkItem[] =>
  (list ?? []).map((t) =>
    t.id === itemId ? { ...t, status: newStatus as WorkItem['status'] } : t,
  );
