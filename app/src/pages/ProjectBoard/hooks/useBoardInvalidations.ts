import { useQueryClient } from '@tanstack/react-query';
import { invalidateProjectScope, invalidateWorkItemScope } from '@/lib/invalidations';
import type { WorkItem } from '@/types/workItems';

/**
 * The board's two invalidation closures, extracted verbatim from the
 * orchestrator. Called every render with the CURRENT `selectedItem` so the
 * closures read it fresh (no stale snapshot — R11). The mutations that call
 * these run after a user action, by which point `selectedItem` reflects the
 * open drawer.
 */
export function useBoardInvalidations(id: string | undefined, selectedItem: WorkItem | null) {
  const queryClient = useQueryClient();

  // Helper: invalidate workItems list (prefix match) plus the current user's
  // MyTasks view, which any work-item write may affect if the assignee is
  // the active user. Also nudges the drawer's per-item detail cache so the
  // full-shape view (description, sprint name, due_date) refreshes after a
  // save — the slim /board list doesn't carry those fields.
  const invalidateWorkItems = () => {
    invalidateWorkItemScope(queryClient, id);
    if (selectedItem) {
      queryClient.invalidateQueries({ queryKey: ['workItem', selectedItem.id, 'detail'] });
    }
  };
  // Helper: invalidate project (stats + hub overview + sprints + goals/milestones/etc.)
  const invalidateProject = () => invalidateProjectScope(queryClient, id);

  return { invalidateWorkItems, invalidateProject };
}
