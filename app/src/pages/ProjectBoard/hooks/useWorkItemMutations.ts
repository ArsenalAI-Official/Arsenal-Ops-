import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import { apiFetch, ApiError, permissionAwareError } from '@/lib/api';
import { invalidateProjectScope } from '@/lib/invalidations';
import { toastErrorHandler } from '@/lib/mutationToast';
import type { WorkItem } from '@/types/workItems';
import { applyStatusChange } from '../lib/optimisticStatus';
import type { CreateItemFormValues } from '../modals/CreateItemModal';

interface UseWorkItemMutationsArgs {
  // The SAME memoized `workItemFilters` reference returned by useBoardData. The
  // optimistic mutations read/write/rollback the cache at the EXACT key
  // ['workItems', workItemFilters, 'board'] — rebuilding `{ project_id: id }`
  // here would change the key identity and break the optimistic invariant (R2).
  workItemFilters: { project_id: string | undefined };
  invalidateWorkItems: () => void;
  invalidateProject: () => void;
  // Read fresh each render so it never snapshots a stale value (R11).
  selectedItem: WorkItem | null;
  // UI callback: close the create-item modal on a successful create. Mirrors
  // the orchestrator's original `setShowCreateForm(false)`.
  onCreateSuccess: () => void;
  // Themed confirmation dialog (from the orchestrator's useConfirm) — gates the
  // destructive delete-item action in place of the native window.confirm.
  confirm: ConfirmFn;
}

/**
 * Owns the board's work-item mutations (create / save edit / delete / log hours
 * / status change / move) plus their handler wrappers. Moved verbatim from the
 * ProjectBoard orchestrator. Called ONCE there; the returned mutation objects
 * (with `.mutate`/`.isPending`) and handlers are threaded into the JSX, drawer,
 * and DnD handlers.
 *
 * R2: the optimistic `moveMutation` keys its
 * `getQueryData`/`setQueryData`/rollback against the SAME memoized
 * `workItemFilters` reference passed in — never a rebuilt object — and keeps the
 * prefix-cancel (`['workItems']`) vs exact read/write asymmetry verbatim (F-C3).
 * Drag-drop (`onMove`) and the quick status-dot menu (`handleStatusChange`)
 * share this one mutation; they differ only in the toast fallback shown when a
 * non-ApiError rejects the PUT, passed per-call via the `errorFallback` var.
 */
export function useWorkItemMutations(
  id: string | undefined,
  {
    workItemFilters,
    invalidateWorkItems,
    invalidateProject,
    selectedItem,
    onCreateSuccess,
    confirm,
  }: UseWorkItemMutationsArgs,
) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Optimistic status update — shared by drag-drop (onMove) and the quick
  // status-dot menu (handleStatusChange). Both PUT /api/workitems/{id} {status}
  // and optimistically patch the SAME cache key; the only behavioral difference
  // is the non-ApiError toast fallback, supplied per-call via `errorFallback`.
  const moveMutation = useMutation({
    mutationFn: ({
      itemId,
      newStatus,
    }: {
      itemId: string;
      newStatus: string;
      errorFallback?: string;
    }) =>
      apiFetch(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onMutate: async ({ itemId, newStatus }) => {
      // Cancel by prefix so sibling ['workItems', ...] queries (with other
      // filters) can't overwrite the optimistic state mid-flight. F-C3.
      await queryClient.cancelQueries({ queryKey: ['workItems'] });
      const previous = queryClient.getQueryData<WorkItem[]>([
        'workItems',
        workItemFilters,
        'board',
      ]);
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters, 'board'], (old) =>
        applyStatusChange(old, itemId, newStatus),
      );
      return { previous };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.previous)
        queryClient.setQueryData(['workItems', workItemFilters, 'board'], ctx.previous);
      // Surface backend validation errors (e.g. "subtask still open" when
      // marking a parent done) so the user knows why the change was rejected
      // instead of seeing a generic toast.
      const detail =
        err instanceof ApiError ? err.message : (vars.errorFallback ?? 'Failed to move ticket');
      toast.error(detail);
    },
    onSettled: (_data, _err, { itemId }) => {
      invalidateWorkItems();
      invalidateProject();
      // Backend writes "Marked as done" / "Reopened ticket" / "Moved to <Status>"
      // auto-comments on status changes — keep this item's comments in sync.
      queryClient.invalidateQueries({ queryKey: ['workItem', itemId, 'comments'] });
    },
  });

  // Create work item mutation. Form values are supplied by the
  // CreateItemModal (which owns the form state).
  const createItemMutation = useMutation({
    mutationFn: (form: CreateItemFormValues) => {
      // Local POST /api/workitems/ body type. The generated `WorkItemCreate`
      // doesn't fit: it requires `project_id: number` (we pass the route `id`,
      // a `string | undefined`) and omits `assigned_hours`, which this payload
      // sets. The two hour fields are set conditionally below, so optional.
      interface CreateWorkItemPayload {
        type: string;
        title: string;
        description: string;
        priority: string;
        story_points: number;
        assignee_id: number | null;
        project_id: string | undefined;
        status: string;
        tags: string[];
        epic_id: number | null;
        parent_id: number | null;
        due_date: string | null;
        estimated_hours: number;
        assigned_hours?: number;
        remaining_hours?: number;
      }
      const payload: CreateWorkItemPayload = {
        type: form.type,
        title: form.title,
        description: form.description,
        priority: form.priority,
        story_points: form.type !== 'task' ? form.story_points : 0,
        assignee_id: form.assignee_id,
        project_id: id,
        status: 'todo',
        tags: Array.isArray(form.tags) ? form.tags : [],
        epic_id: form.epic_id || null,
        parent_id: form.parent_id || null,
        due_date: form.due_date || null,
        estimated_hours: form.estimated_hours ? parseInt(form.estimated_hours as string) : 0,
      };
      if (form.type !== 'task') {
        payload.assigned_hours = form.story_points * 4;
        payload.remaining_hours = form.story_points * 4;
      } else {
        payload.assigned_hours = payload.estimated_hours || 0;
        payload.remaining_hours = payload.estimated_hours || 0;
      }
      return apiFetch<WorkItem>('/api/workitems/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      onCreateSuccess();
      toast.success('Work item created!', { duration: 1000 });
    },
    onError: (err) => {
      console.error('Failed to create item:', err);
      toast.error(permissionAwareError(err, 'Failed to create item'));
    },
    onSettled: () => {
      invalidateWorkItems();
      invalidateProject();
    },
  });
  const isCreatingItem = createItemMutation.isPending;

  // Move ticket to sprint mutation
  const moveSprintMutation = useMutation({
    mutationFn: ({ itemId, targetSprintId }: { itemId: string; targetSprintId: number | null }) =>
      apiFetch<WorkItem>(`/api/workitems/${itemId}/move-sprint`, {
        method: 'PUT',
        body: JSON.stringify({ target_sprint_id: targetSprintId }),
      }),
    onSuccess: (_data, { targetSprintId }) => {
      toast.success(targetSprintId ? 'Moved to sprint' : 'Moved to backlog');
    },
    onError: (err) => {
      const detail = err instanceof ApiError ? err.message : 'Failed to move ticket';
      toast.error(detail);
    },
    onSettled: () => {
      invalidateWorkItems();
      invalidateProjectScope(queryClient, id);
    },
  });

  const handleMoveToSprint = (itemId: string, targetSprintId: number | null) => {
    moveSprintMutation.mutate({ itemId, targetSprintId });
  };

  // Save edited item mutation. Accepts the form payload from the drawer so
  // the mutation stays at the parent (R3) while the form state lives in the
  // child.
  const saveEditMutation = useMutation({
    mutationFn: ({ itemId, edits }: { itemId: string; edits: Partial<WorkItem> }) =>
      apiFetch<WorkItem>(`/api/workitems/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(edits),
      }),
    onSuccess: (updated, { edits }) => {
      // Merge: backend may omit fields like due_date; prefer edit form values
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters, 'board'], (old) =>
        (old ?? []).map((wi) =>
          wi.id === updated.id ? ({ ...wi, ...edits, ...updated } as WorkItem) : wi,
        ),
      );
      toast.success('Item updated!');
    },
    onError: toastErrorHandler('update item'),
    onSettled: () => {
      invalidateWorkItems();
      invalidateProject();
    },
  });
  const isSavingEdit = saveEditMutation.isPending;

  const handleSaveEdit = (edits: Partial<WorkItem>) => {
    if (!selectedItem || isSavingEdit) return;
    saveEditMutation.mutate({ itemId: selectedItem.id, edits });
  };

  // Delete item mutation
  const deleteItemMutation = useMutation({
    mutationFn: (itemId: string) => apiFetch(`/api/workitems/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => {
      navigate(`/project/${id}/board`);
      toast.success('Item deleted');
    },
    onError: toastErrorHandler('delete item'),
    onSettled: () => {
      invalidateWorkItems();
      invalidateProject();
    },
  });

  const handleDeleteItem = async (itemId: string) => {
    if (
      !(await confirm({
        title: 'Delete work item?',
        description: 'Delete this work item?',
        destructive: true,
        confirmText: 'Delete',
      }))
    )
      return;
    deleteItemMutation.mutate(itemId);
  };

  // Log hours mutation
  const logHoursMutation = useMutation({
    mutationFn: ({ itemId, hours }: { itemId: string; hours: number }) =>
      apiFetch<{ logged_hours: number; remaining_hours: number }>(
        `/api/workitems/${itemId}/log-hours`,
        { method: 'POST', body: JSON.stringify({ hours }) },
      ),
    onSuccess: (data, { itemId, hours }) => {
      queryClient.setQueryData<WorkItem[]>(['workItems', workItemFilters, 'board'], (old) =>
        (old ?? []).map((wi) =>
          wi.id === itemId
            ? { ...wi, logged_hours: data.logged_hours, remaining_hours: data.remaining_hours }
            : wi,
        ),
      );
      toast.success(`Logged ${hours}h! Remaining: ${data.remaining_hours}h`);
    },
    onError: toastErrorHandler('log hours'),
    onSettled: (_data, _err, { itemId }) => {
      invalidateWorkItems();
      invalidateProject();
      // Backend writes a "Logged Xh" auto-comment alongside the TimeEntry —
      // invalidate this item's comments so the drawer surfaces it without
      // forcing the user to close and reopen the panel.
      queryClient.invalidateQueries({ queryKey: ['workItem', itemId, 'comments'] });
    },
  });

  const handleLogHours = (item: WorkItem, hoursToLog: number) => {
    logHoursMutation.mutate({ itemId: item.id, hours: hoursToLog });
  };

  // Quick status change (status-dot menu) — reuses moveMutation with a
  // status-specific toast fallback; the optimistic cache path is identical.
  const handleStatusChange = (item: WorkItem, newStatus: string) => {
    moveMutation.mutate({ itemId: item.id, newStatus, errorFallback: 'Failed to update status' });
  };

  return {
    moveMutation,
    createItemMutation,
    isCreatingItem,
    moveSprintMutation,
    handleMoveToSprint,
    saveEditMutation,
    isSavingEdit,
    handleSaveEdit,
    deleteItemMutation,
    handleDeleteItem,
    logHoursMutation,
    handleLogHours,
    // Alias preserved for existing consumers; backed by the single moveMutation.
    statusChangeMutation: moveMutation,
    handleStatusChange,
  };
}
