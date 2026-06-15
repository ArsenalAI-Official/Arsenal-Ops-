import { useMemo, type RefObject } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAllDevelopers } from '@/hooks/useAllDevelopers';
import { toastErrorHandler } from '@/lib/mutationToast';
import type { WorkItem, AllDeveloper, Comment } from '../types';
import type { AddSubtaskFormValues } from '../AddSubtaskModal';
import type { WorkItemPanelProps } from '../WorkItemPanel';

/**
 * Owns the WorkItemPanel data layer: the per-item detail/comments queries, the
 * shared developers list, the compact-variant mutations (save edit / status /
 * log hours), the subtask + comment mutations, and the derived hierarchy memos.
 * Moved verbatim from the orchestrator. Called ONCE there; the returned objects
 * are threaded into the sub-components as props.
 *
 * The compact mutations preserve the EXACT query keys and the cross-cutting
 * `['workItems']` + `['myTasks']` dual-invalidation (`invalidateWorkItems`) the
 * board contract requires — see app/CLAUDE.md.
 *
 * UI-state setters (`setIsEditing`, `setEditForm`) and the current `editForm`
 * snapshot are passed in from the orchestrator so the mutation `onSuccess`
 * callbacks behave identically to the original closures. Comment input state is
 * owned by the shared <CommentThread>, which clears itself on submit.
 */
interface UseWorkItemPanelArgs {
  props: WorkItemPanelProps;
  editForm: Partial<WorkItem>;
  setIsEditing: (v: boolean) => void;
  setEditForm: (v: Partial<WorkItem>) => void;
  setShowAddSubtaskModal: (v: boolean) => void;
  logHoursRef: RefObject<HTMLInputElement | null>;
}

export function useWorkItemPanel({
  props,
  editForm,
  setIsEditing,
  setEditForm,
  setShowAddSubtaskModal,
  logHoursRef,
}: UseWorkItemPanelArgs) {
  const { item, currentUserId } = props;
  const queryClient = useQueryClient();

  // ─── Queries ───────────────────────────────────────────────────────────────
  const itemDetailQuery = useQuery<WorkItem>({
    queryKey: ['workItem', item.id, 'detail'],
    queryFn: () => apiFetch(`/api/workitems/${item.id}`),
    enabled: !!item.id,
  });
  const itemDetail: WorkItem = useMemo(
    () => ({ ...item, ...(itemDetailQuery.data ?? {}) }),
    [item, itemDetailQuery.data],
  );

  const commentsQuery = useQuery<Comment[]>({
    queryKey: ['workItem', item.id, 'comments'],
    queryFn: () => apiFetch(`/api/comments/workitem/${item.id}`),
    enabled: !!item.id,
  });
  const comments = useMemo(() => commentsQuery.data ?? [], [commentsQuery.data]);

  const developersQuery = useAllDevelopers<AllDeveloper>();
  const allDevelopers = useMemo(() => developersQuery.data ?? [], [developersQuery.data]);
  const devMap = useMemo(() => new Map(allDevelopers.map((d) => [d.id, d.name])), [allDevelopers]);

  // ─── isAssignee ────────────────────────────────────────────────────────────
  const isAssignee = useMemo(
    () => !!currentUserId && !!item.assignee_id && currentUserId === item.assignee_id,
    [currentUserId, item.assignee_id],
  );

  // ─── Full-variant hierarchy helpers ────────────────────────────────────────
  // Hoist the conditional before useMemo so the dep array is stable.
  const workItemsProp = 'workItems' in props ? props.workItems : undefined;
  const fullWorkItems = useMemo(() => workItemsProp ?? [], [workItemsProp]);

  const depth1ParentExclusions = useMemo(() => {
    const ex = new Set<number>();
    for (const wi of fullWorkItems) {
      if (wi.parent_id != null) {
        const n = Number(wi.id);
        if (!Number.isNaN(n)) ex.add(n);
      }
    }
    return ex;
  }, [fullWorkItems]);

  const parentExcludeIds = useMemo(() => {
    const ex = new Set<number>(depth1ParentExclusions);
    const subjectId = Number(item.id);
    if (Number.isNaN(subjectId)) return ex;
    ex.add(subjectId);
    const childrenByParent = new Map<number, string[]>();
    for (const wi of fullWorkItems) {
      if (wi.parent_id != null) {
        const arr = childrenByParent.get(wi.parent_id) ?? [];
        arr.push(wi.id);
        childrenByParent.set(wi.parent_id, arr);
      }
    }
    const queue = [subjectId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const cid of childrenByParent.get(cur) ?? []) {
        const cn = Number(cid);
        if (!Number.isNaN(cn) && !ex.has(cn)) {
          ex.add(cn);
          queue.push(cn);
        }
      }
    }
    return ex;
  }, [depth1ParentExclusions, item, fullWorkItems]);

  const epicExcludeIds = useMemo(() => {
    const ex = new Set<number>();
    const n = Number(item.id);
    if (!Number.isNaN(n)) ex.add(n);
    return ex;
  }, [item]);

  const selectedItemHasChildren = useMemo(() => {
    const n = Number(item.id);
    if (Number.isNaN(n)) return false;
    return fullWorkItems.some((wi) => wi.parent_id === n);
  }, [item, fullWorkItems]);

  const subtasksOfCurrent = useMemo(() => {
    const subjectId = Number(item.id);
    if (Number.isNaN(subjectId)) return [];
    return fullWorkItems.filter((wi) => wi.type === 'subtask' && wi.parent_id === subjectId);
  }, [fullWorkItems, item.id]);

  // ─── Compact mutations ─────────────────────────────────────────────────────
  const invalidateWorkItems = () => {
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
  };

  const saveEditCompact = useMutation({
    mutationFn: (edits: Partial<WorkItem>) =>
      apiFetch<WorkItem>(`/api/workitems/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify(edits),
      }),
    onSuccess: (updated: WorkItem) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...editForm, ...updated });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      setIsEditing(false);
      setEditForm({});
      toast.success('Task updated');
    },
    onError: toastErrorHandler('update task'),
  });

  const statusChangeCompact = useMutation({
    mutationFn: (newStatus: string) =>
      apiFetch<WorkItem>(`/api/workitems/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onSuccess: (updated: WorkItem) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...updated });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
    },
    onError: toastErrorHandler('update status'),
  });

  const logHoursCompact = useMutation({
    mutationFn: (hours: number) =>
      apiFetch<{ logged_hours: number; remaining_hours: number }>(
        `/api/workitems/${item.id}/log-hours`,
        {
          method: 'POST',
          body: JSON.stringify({ hours }),
        },
      ),
    onSuccess: (data: { logged_hours: number; remaining_hours: number }) => {
      if (props.variant === 'compact') props.onItemChanged({ ...item, ...data });
      invalidateWorkItems();
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
      toast.success(`Logged hours!`);
      if (logHoursRef.current) logHoursRef.current.value = '';
    },
    onError: toastErrorHandler('log hours'),
  });

  // ─── Full-variant subtask mutation ─────────────────────────────────────────
  const createSubtask = useMutation({
    mutationFn: (form: AddSubtaskFormValues) => {
      const projectId =
        (item as WorkItem & { project_id?: number }).project_id ??
        (props.variant === 'full' ? Number(props.projectId) : undefined);
      if (!projectId) throw new Error('Missing project id');
      const estimated = (() => {
        const n = Number(form.estimated_hours.trim() || 0);
        return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
      })();
      return apiFetch('/api/workitems/', {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          type: 'subtask',
          title: form.title,
          parent_id: Number(item.id),
          assignee_id: form.assignee_id,
          estimated_hours: estimated,
          remaining_hours: estimated,
          due_date: form.due_date || null,
        }),
      });
    },
    onSuccess: () => {
      setShowAddSubtaskModal(false);
      toast.success('Subtask added');
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'detail'] });
    },
    onError: toastErrorHandler('create subtask'),
  });

  // ─── Comment mutation (both variants) ─────────────────────────────────────
  const submitComment = useMutation({
    mutationFn: ({ content, type }: { content: string; type: Comment['comment_type'] }) =>
      apiFetch('/api/comments/', {
        method: 'POST',
        body: JSON.stringify({
          work_item_id: parseInt(item.id),
          content,
          comment_type: type,
          author_id: currentUserId ?? 1,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workItem', item.id, 'comments'] });
    },
    onError: toastErrorHandler('add comment'),
  });

  return {
    itemDetail,
    comments,
    allDevelopers,
    devMap,
    isAssignee,
    fullWorkItems,
    parentExcludeIds,
    epicExcludeIds,
    selectedItemHasChildren,
    subtasksOfCurrent,
    saveEditCompact,
    statusChangeCompact,
    logHoursCompact,
    createSubtask,
    submitComment,
  };
}
