import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { invalidateAdminWorkItemImpact } from '@/lib/invalidations';
import { isPastDue } from '@/components/ProjectsPage';
import type { MyTask } from '@/components/ProjectsPage';

// The home page's "My Tasks" widget: the cross-project assigned-work feed plus
// its quick-edit mutations (status + due date). Reads from the ['myTasks'] cache
// and writes optimistically. Personal-task due-date edits route here too — the
// widget mixes work items and personal tasks in one list.
export const useMyTasks = () => {
  const queryClient = useQueryClient();

  const [myTaskTab, setMyTaskTab] = useState<'upcoming' | 'overdue' | 'completed' | 'personal'>(
    'upcoming',
  );
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [selectedTask, setSelectedTask] = useState<MyTask | null>(null);

  const myTasksQuery = useQuery<MyTask[]>({
    queryKey: ['myTasks'],
    queryFn: () => apiFetch<MyTask[]>('/api/workitems/my-tasks'),
  });
  const myTasksLoading = myTasksQuery.isLoading;
  // Recompute `is_overdue` in the viewer's LOCAL timezone. The backend flag is
  // computed in UTC and so can't be right for every viewer (Eastern, Pacific,
  // etc.) — a task due "today" must not show as overdue, and must flip exactly
  // at the viewer's local midnight. This override is the single source the
  // dashboard widgets (MyTasksBox tabs/counts, DashboardStats) read from.
  // `new Date()` is intentionally inside useMemo (not the render body) per
  // app/CLAUDE.md's react-hooks/purity guidance.
  const myTasks = useMemo<MyTask[]>(
    () =>
      (myTasksQuery.data ?? []).map((t) => ({
        ...t,
        is_overdue: isPastDue(t.due_date, t.status),
      })),
    [myTasksQuery.data],
  );

  // Apply an optimistic update directly inside the ['myTasks'] cache.
  const patchMyTasksCache = (updater: (old: MyTask[]) => MyTask[]) =>
    queryClient.setQueryData<MyTask[]>(['myTasks'], (old) => updater(old ?? []));

  const statusMutation = useMutation({
    mutationFn: ({ taskId, newStatus }: { taskId: string; newStatus: string }) =>
      apiFetch(`/api/workitems/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      }),
    onMutate: async ({ taskId, newStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['myTasks'] });
      const snapshot = queryClient.getQueryData<MyTask[]>(['myTasks']);
      patchMyTasksCache((old) =>
        old.map((t) =>
          t.id === taskId
            ? ({
                ...t,
                status: newStatus,
                is_overdue: newStatus === 'done' ? false : t.is_overdue,
              } as MyTask)
            : t,
        ),
      );
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(['myTasks'], ctx.snapshot);
      // Surface backend validation messages (e.g. "subtask still open" when
      // marking a parent done) instead of the generic toast.
      const detail = err instanceof ApiError ? err.message : 'Failed to update status';
      toast.error(detail);
    },
    onSuccess: (_data, { taskId, newStatus }) => {
      if (newStatus === 'done') {
        const task = queryClient.getQueryData<MyTask[]>(['myTasks'])?.find((t) => t.id === taskId);
        toast.success(`${task?.key || 'Task'} completed 🎉`);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      invalidateAdminWorkItemImpact(queryClient);
    },
  });

  const handleChangeMyTaskStatus = (task: MyTask, newStatus: string) => {
    if (selectedTask?.id === task.id) {
      setSelectedTask({ ...task, status: newStatus } as MyTask);
    }
    statusMutation.mutate({ taskId: task.id, newStatus });
  };

  const personalTaskDueDateMutation = useMutation({
    mutationFn: ({ realId, dueValue }: { realId: string; dueValue: string | null }) =>
      apiFetch(`/api/personal-tasks/${realId}`, {
        method: 'PUT',
        body: JSON.stringify({ due_date: dueValue }),
      }),
    onMutate: async ({ realId, dueValue }) => {
      await queryClient.cancelQueries({ queryKey: ['personalTasks'] });
      const snapshot = queryClient.getQueryData(['personalTasks']);
      queryClient.setQueryData<{ id: number; due_date?: string }[]>(['personalTasks'], (old) =>
        (old ?? []).map((p) =>
          String(p.id) === realId ? { ...p, due_date: dueValue || undefined } : p,
        ),
      );
      return { snapshot, cleared: !dueValue };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(['personalTasks'], ctx.snapshot);
      toast.error('Failed to update due date');
    },
    onSuccess: (_data, _vars, ctx) => {
      toast.success(ctx?.cleared ? 'Due date cleared' : 'Due date updated');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['personalTasks'] });
    },
  });

  const workItemDueDateMutation = useMutation({
    mutationFn: ({ taskId, dueValue }: { taskId: string; dueValue: string | null }) =>
      apiFetch(`/api/workitems/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ due_date: dueValue }),
      }),
    onMutate: async ({ taskId, dueValue }) => {
      await queryClient.cancelQueries({ queryKey: ['myTasks'] });
      const snapshot = queryClient.getQueryData<MyTask[]>(['myTasks']);
      patchMyTasksCache((old) =>
        old.map((t) => {
          if (t.id !== taskId) return t;
          let isOverdue = false;
          if (dueValue) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const due = new Date(dueValue + 'T00:00:00');
            isOverdue = due < today && t.status !== 'done';
          }
          return { ...t, due_date: dueValue, is_overdue: isOverdue };
        }),
      );
      return { snapshot, cleared: !dueValue };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(['myTasks'], ctx.snapshot);
      toast.error('Failed to update due date');
    },
    onSuccess: (_data, _vars, ctx) => {
      toast.success(ctx?.cleared ? 'Due date cleared' : 'Due date updated');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
    },
  });

  const handleQuickDueDateChange = (task: MyTask & { is_personal?: boolean }, isoDate: string) => {
    const dueValue = isoDate ? isoDate : null;
    if (task.is_personal) {
      const realId = String(task.id).replace(/^personal-/, '');
      personalTaskDueDateMutation.mutate({ realId, dueValue });
    } else {
      workItemDueDateMutation.mutate({ taskId: task.id, dueValue });
    }
  };

  // TicketDetailPanel calls this when it has mutated a task. Update myTasks cache
  // and the local selectedTask reference.
  const handleTaskChanged = (updated: MyTask) => {
    patchMyTasksCache((old) => old.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTask(updated);
    queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
    invalidateAdminWorkItemImpact(queryClient);
  };

  return {
    myTaskTab,
    setMyTaskTab,
    showAllTasks,
    setShowAllTasks,
    selectedTask,
    setSelectedTask,
    myTasks,
    myTasksLoading,
    handleChangeMyTaskStatus,
    handleQuickDueDateChange,
    handleTaskChanged,
  };
};
