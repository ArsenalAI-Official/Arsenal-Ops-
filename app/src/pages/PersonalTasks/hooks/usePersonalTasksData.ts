import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { invalidateAdminWorkItemImpact, invalidateProjectScope } from '@/lib/invalidations';
import { toastErrorHandler } from '@/lib/mutationToast';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import type { PersonalTask, ProjectSummary, ProjectDetailResponse, NewTaskForm } from '../types';

const EMPTY_FORM: NewTaskForm = {
  title: '',
  description: '',
  priority: 'medium',
  due_date: '',
  project_id: '',
  estimated_hours: '',
};

export const usePersonalTasksData = (confirm: ConfirmFn) => {
  const queryClient = useQueryClient();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [showDatePickerAdd, setShowDatePickerAdd] = useState(false);
  const [showDatePickerEdit, setShowDatePickerEdit] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertingTask, setConvertingTask] = useState<PersonalTask | null>(null);
  // Drives the ['project', id] query that loads members for the
  // Add-dialog project selector and the Convert dialog. Only one dialog
  // is open at a time so a single state covers both.
  const [memberLookupProjectId, setMemberLookupProjectId] = useState<string>('');
  const [convertProjectId, setConvertProjectId] = useState('');
  const [convertAssigneeId, setConvertAssigneeId] = useState('');
  const [convertEstimatedHours, setConvertEstimatedHours] = useState('');
  const [newTask, setNewTask] = useState<NewTaskForm>({ ...EMPTY_FORM });

  const tasksQuery = useQuery<PersonalTask[]>({
    queryKey: ['personalTasks'],
    queryFn: () => apiFetch<PersonalTask[]>('/api/personal-tasks/'),
  });
  const tasks = tasksQuery.data ?? [];
  const isLoading = tasksQuery.isLoading;

  const projectsQuery = useQuery<ProjectSummary[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummary[]>('/api/projects/'),
  });
  const projects = projectsQuery.data ?? [];

  const projectMembersQuery = useQuery<ProjectDetailResponse>({
    queryKey: ['project', memberLookupProjectId],
    queryFn: () => apiFetch<ProjectDetailResponse>(`/api/projects/${memberLookupProjectId}`),
    enabled: !!memberLookupProjectId,
  });
  const projectMembers = projectMembersQuery.data?.developers ?? [];

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: ['personalTasks'] });

  // Toggle is optimistic so it feels instant — every other mutation can
  // wait on a refetch.
  const toggleMutation = useMutation({
    mutationFn: async (task: PersonalTask) => {
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      await apiFetch(`/api/personal-tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      return newStatus;
    },
    onMutate: async (task: PersonalTask) => {
      await queryClient.cancelQueries({ queryKey: ['personalTasks'] });
      const previous = queryClient.getQueryData<PersonalTask[]>(['personalTasks']);
      const newStatus = task.status === 'done' ? 'todo' : 'done';
      queryClient.setQueryData<PersonalTask[]>(['personalTasks'], (old) =>
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
    onSettled: () => invalidateTasks(),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const createdTask = await apiFetch<PersonalTask>('/api/personal-tasks/', {
        method: 'POST',
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          due_date: newTask.due_date || undefined,
          estimated_hours: newTask.estimated_hours ? parseInt(newTask.estimated_hours) : 0,
        }),
      });
      // The Add dialog exposes a "Project (optional)" selector; when set, the
      // new task is immediately converted to a work item — mirrors the home
      // page's create flow so both entry points behave identically.
      if (newTask.project_id) {
        await apiFetch(`/api/personal-tasks/${createdTask.id}/convert-to-ticket`, {
          method: 'POST',
          body: JSON.stringify({ project_id: parseInt(newTask.project_id) }),
        });
      }
      return createdTask;
    },
    onSuccess: () => {
      const createdWithProject = !!newTask.project_id;
      const createdProjectId = newTask.project_id;
      setNewTask({ ...EMPTY_FORM });
      setMemberLookupProjectId('');
      setShowAddDialog(false);
      toast.success('Task created!');
      // A project was selected → a work item was created; refresh the work-item
      // and admin-impact caches the same way the home-page convert flow does.
      if (createdWithProject) {
        queryClient.invalidateQueries({ queryKey: ['myTasks'] });
        queryClient.invalidateQueries({ queryKey: ['workItems'] });
        invalidateAdminWorkItemImpact(queryClient);
        invalidateProjectScope(queryClient, parseInt(createdProjectId));
      }
    },
    onError: toastErrorHandler('create task'),
    onSettled: () => invalidateTasks(),
  });

  const updateMutation = useMutation({
    mutationFn: (taskId: number) =>
      apiFetch<PersonalTask>(`/api/personal-tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          due_date: newTask.due_date || undefined,
        }),
      }),
    onSuccess: () => {
      resetForm();
      toast.success('Task updated!');
    },
    onError: toastErrorHandler('update task'),
    onSettled: () => invalidateTasks(),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: number) =>
      apiFetch<void>(`/api/personal-tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Task deleted');
    },
    onError: toastErrorHandler('delete task'),
    onSettled: () => invalidateTasks(),
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!convertingTask) throw new Error('No task selected');
      return apiFetch<{ work_item: { key: string; assignee_name?: string } }>(
        `/api/personal-tasks/${convertingTask.id}/convert-to-ticket`,
        {
          method: 'POST',
          body: JSON.stringify({
            project_id: parseInt(convertProjectId),
            type: 'task',
            estimated_hours: convertEstimatedHours
              ? parseInt(convertEstimatedHours)
              : convertingTask.estimated_hours,
            assignee_developer_id: convertAssigneeId ? parseInt(convertAssigneeId) : undefined,
          }),
        },
      );
    },
    onSuccess: (data) => {
      const assigneeName = data.work_item.assignee_name
        ? ` → assigned to ${data.work_item.assignee_name}`
        : '';
      toast.success(`Ticket ${data.work_item.key} created!${assigneeName}`);
      setShowConvertDialog(false);
      setConvertingTask(null);
      setConvertProjectId('');
      setConvertAssigneeId('');
      setConvertEstimatedHours('');
      setMemberLookupProjectId('');
    },
    onError: toastErrorHandler('convert'),
    onSettled: () => {
      invalidateTasks();
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      // A new work item exists → admin stats/capacity move (matches the home
      // page's convert flow, which previously diverged by omitting this).
      invalidateAdminWorkItemImpact(queryClient);
      const pid = parseInt(convertProjectId);
      if (!Number.isNaN(pid)) {
        invalidateProjectScope(queryClient, pid);
      }
    },
  });

  const toggleTaskComplete = (task: PersonalTask) => {
    if (task.is_converted) {
      toast.error('Cannot modify a converted task');
      return;
    }
    toggleMutation.mutate(task);
  };

  const createTask = () => {
    if (!newTask.title.trim()) {
      toast.error('Title is required');
      return;
    }
    createMutation.mutate();
  };

  const updateTask = () => {
    if (!editingTask || !newTask.title.trim()) {
      toast.error('Title is required');
      return;
    }
    updateMutation.mutate(editingTask.id);
  };

  const deleteTask = async (taskId: number) => {
    if (
      !(await confirm({
        title: 'Delete task?',
        description: 'Delete this task?',
        destructive: true,
        confirmText: 'Delete',
      }))
    )
      return;
    deleteMutation.mutate(taskId);
  };

  const convertToTicket = () => {
    if (!convertingTask || !convertProjectId) return;
    convertMutation.mutate();
  };

  const resetForm = () => {
    setNewTask({ ...EMPTY_FORM });
    setEditingTask(null);
    setShowEditDialog(false);
  };

  const startEdit = (task: PersonalTask) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_date: task.due_date || '',
      project_id: '',
      estimated_hours: '',
    });
    setShowEditDialog(true);
  };

  return {
    // data
    tasks,
    isLoading,
    projects,
    projectMembers,
    // dialog + form state
    showAddDialog,
    setShowAddDialog,
    showEditDialog,
    setShowEditDialog,
    showDatePickerAdd,
    setShowDatePickerAdd,
    showDatePickerEdit,
    setShowDatePickerEdit,
    showConvertDialog,
    setShowConvertDialog,
    convertingTask,
    setConvertingTask,
    memberLookupProjectId,
    setMemberLookupProjectId,
    convertProjectId,
    setConvertProjectId,
    convertAssigneeId,
    setConvertAssigneeId,
    convertEstimatedHours,
    setConvertEstimatedHours,
    newTask,
    setNewTask,
    // pending flags
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isConverting: convertMutation.isPending,
    // handlers
    toggleTaskComplete,
    createTask,
    updateTask,
    deleteTask,
    convertToTicket,
    resetForm,
    startEdit,
  };
};
