import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import { apiFetch } from '@/lib/api';
import { invalidateAdminWorkItemImpact, invalidateProjectScope } from '@/lib/invalidations';
import { toastErrorHandler } from '@/lib/mutationToast';

// Shared personal-task mutations used by BOTH the home page (ProjectsPage,
// via usePersonalTasksPanel) and the dedicated Personal Tasks page. Before
// this hook each page carried its own near-identical copies that had quietly
// diverged: the home page invalidated inside `onSuccess` (skipped on error)
// while Personal Tasks invalidated in `onSettled`. This hook converges on
// `onSettled` — the cache is reconciled even after a failed mutation, so a
// transient error can't leave a stale list on screen. UI resets (closing the
// dialog, clearing the form) stay in the caller's `onSuccess` callback so a
// failed save keeps the dialog open with the user's input intact.

/** Minimal shape the mutations touch. Each page's richer `PersonalTask`
 *  interface is structurally assignable to this. */
export interface PersonalTaskLike {
  id: number;
  status: string;
  estimated_hours: number;
  is_converted: boolean;
}

export interface CreatePersonalTaskVars {
  title: string;
  description: string;
  priority: string;
  /** Form string; empty means "no due date". */
  due_date: string;
  /** Form string; empty means 0 hours. */
  estimated_hours: string;
  /** When set, the new task is immediately converted to a work item. */
  projectId?: string;
  /** Optional assignee for the convert step (home page passes this; the
   *  Personal Tasks add-dialog does not). */
  assigneeDeveloperId?: string;
}

export interface UpdatePersonalTaskVars {
  taskId: number;
  title: string;
  description: string;
  priority: string;
  /** Forwarded verbatim to the backend: `null` clears the due date, `undefined`
   *  leaves it unchanged. Callers choose which by passing `form.due_date || null`
   *  vs `|| undefined` — this hook does not impose a policy. */
  due_date: string | null | undefined;
}

export interface ConvertPersonalTaskVars {
  taskId: number;
  projectId: string;
  assigneeId?: string;
  /** Form string; when empty, `fallbackEstimatedHours` is used instead. */
  estimatedHours?: string;
  /** The task's own estimate, used when the convert form leaves hours blank. */
  fallbackEstimatedHours?: number;
}

interface ConvertResult {
  work_item: { key: string; assignee_name?: string };
}

interface UsePersonalTaskMutationsOptions {
  /** Required to expose `deleteWithConfirm`; omit if the caller wires its own. */
  confirm?: ConfirmFn;
  /** UI reset after a successful create (close dialog, clear form). */
  onCreated?: () => void;
  /** UI reset after a successful update. */
  onUpdated?: () => void;
  /** UI reset after a successful convert-to-ticket. */
  onConverted?: () => void;
}

export const usePersonalTaskMutations = (opts: UsePersonalTaskMutationsOptions = {}) => {
  const queryClient = useQueryClient();
  const invalidatePersonalTasks = () =>
    queryClient.invalidateQueries({ queryKey: ['personalTasks'] });

  const toggle = useMutation({
    mutationFn: async (task: PersonalTaskLike) => {
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      await apiFetch(`/api/personal-tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      return newStatus;
    },
    onMutate: async (task: PersonalTaskLike) => {
      await queryClient.cancelQueries({ queryKey: ['personalTasks'] });
      const previous = queryClient.getQueryData<PersonalTaskLike[]>(['personalTasks']);
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      queryClient.setQueryData<PersonalTaskLike[]>(['personalTasks'], (old) =>
        (old ?? []).map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)),
      );
      return { previous, newStatus };
    },
    onError: (_err, _task, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['personalTasks'], ctx.previous);
      toast.error('Failed to update task');
    },
    onSuccess: (newStatus) => {
      toast.success(newStatus === 'done' ? 'Task completed! 🎉' : 'Task reopened');
    },
    onSettled: () => invalidatePersonalTasks(),
  });

  const create = useMutation({
    mutationFn: async (vars: CreatePersonalTaskVars) => {
      const createdTask = await apiFetch<{ id: number }>('/api/personal-tasks/', {
        method: 'POST',
        body: JSON.stringify({
          title: vars.title,
          description: vars.description,
          priority: vars.priority,
          due_date: vars.due_date || undefined,
          estimated_hours: vars.estimated_hours ? parseInt(vars.estimated_hours) : 0,
        }),
      });
      if (vars.projectId) {
        await apiFetch(`/api/personal-tasks/${createdTask.id}/convert-to-ticket`, {
          method: 'POST',
          body: JSON.stringify({
            project_id: parseInt(vars.projectId),
            assignee_developer_id: vars.assigneeDeveloperId
              ? parseInt(vars.assigneeDeveloperId)
              : undefined,
          }),
        });
      }
      return createdTask;
    },
    onSuccess: () => {
      toast.success('Task created!');
      opts.onCreated?.();
    },
    onError: toastErrorHandler('create task'),
    onSettled: (_data, _err, vars) => {
      invalidatePersonalTasks();
      // A project was selected → a work item was created; refresh the
      // work-item and admin-impact caches the same way the convert flow does.
      if (vars.projectId) {
        queryClient.invalidateQueries({ queryKey: ['myTasks'] });
        queryClient.invalidateQueries({ queryKey: ['workItems'] });
        invalidateAdminWorkItemImpact(queryClient);
        invalidateProjectScope(queryClient, parseInt(vars.projectId));
      }
    },
  });

  const update = useMutation({
    mutationFn: (vars: UpdatePersonalTaskVars) =>
      apiFetch(`/api/personal-tasks/${vars.taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: vars.title,
          description: vars.description,
          priority: vars.priority,
          due_date: vars.due_date,
        }),
      }),
    onSuccess: () => {
      toast.success('Task updated successfully');
      opts.onUpdated?.();
    },
    onError: toastErrorHandler('update task'),
    onSettled: () => invalidatePersonalTasks(),
  });

  const remove = useMutation({
    mutationFn: (taskId: number) =>
      apiFetch<void>(`/api/personal-tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Task deleted');
    },
    onError: toastErrorHandler('delete task'),
    onSettled: () => invalidatePersonalTasks(),
  });

  const convert = useMutation({
    mutationFn: (vars: ConvertPersonalTaskVars) =>
      apiFetch<ConvertResult>(`/api/personal-tasks/${vars.taskId}/convert-to-ticket`, {
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(vars.projectId),
          type: 'task',
          estimated_hours: vars.estimatedHours
            ? parseInt(vars.estimatedHours)
            : vars.fallbackEstimatedHours,
          assignee_developer_id: vars.assigneeId ? parseInt(vars.assigneeId) : undefined,
        }),
      }),
    onSuccess: (data) => {
      const assigneeName = data.work_item.assignee_name
        ? ` → assigned to ${data.work_item.assignee_name}`
        : '';
      toast.success(`Ticket ${data.work_item.key} created!${assigneeName}`);
      opts.onConverted?.();
    },
    onError: toastErrorHandler('convert'),
    onSettled: (_data, _err, vars) => {
      invalidatePersonalTasks();
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      invalidateAdminWorkItemImpact(queryClient);
      const pid = parseInt(vars.projectId);
      if (!Number.isNaN(pid)) {
        invalidateProjectScope(queryClient, pid);
      }
    },
  });

  // Identical guard used at every call site: converted tasks are read-only.
  const toggleComplete = (task: PersonalTaskLike) => {
    if (task.is_converted) {
      toast.error('Cannot modify a converted task');
      return;
    }
    toggle.mutate(task);
  };

  // Confirm-then-delete. Only available when `confirm` was supplied.
  const deleteWithConfirm = async (taskId: number) => {
    if (!opts.confirm) {
      throw new Error('usePersonalTaskMutations: deleteWithConfirm requires a `confirm` option');
    }
    if (
      !(await opts.confirm({
        title: 'Delete task?',
        description: 'Delete this task?',
        destructive: true,
        confirmText: 'Delete',
      }))
    )
      return;
    remove.mutate(taskId);
  };

  return { toggle, create, update, remove, convert, toggleComplete, deleteWithConfirm };
};
