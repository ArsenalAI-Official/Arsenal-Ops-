import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import { usePersonalTaskMutations } from '@/hooks/usePersonalTaskMutations';
import { apiFetch } from '@/lib/api';
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

  const resetForm = () => {
    setNewTask({ ...EMPTY_FORM });
    setEditingTask(null);
    setShowEditDialog(false);
  };

  const mutations = usePersonalTaskMutations({
    confirm,
    onCreated: () => {
      setNewTask({ ...EMPTY_FORM });
      setMemberLookupProjectId('');
      setShowAddDialog(false);
    },
    onUpdated: resetForm,
    onConverted: () => {
      setShowConvertDialog(false);
      setConvertingTask(null);
      setConvertProjectId('');
      setConvertAssigneeId('');
      setConvertEstimatedHours('');
      setMemberLookupProjectId('');
    },
  });

  const createTask = () => {
    if (!newTask.title.trim()) {
      toast.error('Title is required');
      return;
    }
    // The Add dialog exposes a "Project (optional)" selector; when set, the
    // shared create mutation immediately converts the new task to a work item.
    mutations.create.mutate({
      title: newTask.title,
      description: newTask.description,
      priority: newTask.priority,
      due_date: newTask.due_date,
      estimated_hours: newTask.estimated_hours,
      projectId: newTask.project_id || undefined,
    });
  };

  const updateTask = () => {
    if (!editingTask || !newTask.title.trim()) {
      toast.error('Title is required');
      return;
    }
    mutations.update.mutate({
      taskId: editingTask.id,
      title: newTask.title,
      description: newTask.description,
      priority: newTask.priority,
      due_date: newTask.due_date || undefined,
    });
  };

  const convertToTicket = () => {
    if (!convertingTask || !convertProjectId) return;
    mutations.convert.mutate({
      taskId: convertingTask.id,
      projectId: convertProjectId,
      assigneeId: convertAssigneeId || undefined,
      estimatedHours: convertEstimatedHours || undefined,
      fallbackEstimatedHours: convertingTask.estimated_hours,
    });
  };

  const startEdit = (task: PersonalTask) => {
    setEditingTask(task);
    setNewTask({
      title: task.title,
      description: task.description ?? '',
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
    isCreating: mutations.create.isPending,
    isUpdating: mutations.update.isPending,
    isConverting: mutations.convert.isPending,
    // handlers
    toggleTaskComplete: mutations.toggleComplete,
    createTask,
    updateTask,
    deleteTask: mutations.deleteWithConfirm,
    convertToTicket,
    resetForm,
    startEdit,
  };
};
