import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import { usePersonalTaskMutations } from '@/hooks/usePersonalTaskMutations';
import type {
  PersonalTask,
  NewPersonalTaskForm,
  EditPersonalTaskForm,
} from '@/components/ProjectsPage';
import type { ProjectDeveloperEntry } from '@/client';

const EMPTY_NEW_TASK: NewPersonalTaskForm = {
  title: '',
  description: '',
  priority: 'medium',
  due_date: '',
  project_id: '',
  assignee_developer_id: '',
  estimated_hours: '',
};

const EMPTY_EDIT_FORM: EditPersonalTaskForm = {
  title: '',
  description: '',
  priority: 'medium',
  due_date: '',
};

// The personal-tasks slice of the home page's "My Tasks" widget: the personal
// task list plus the add / edit / convert dialogs. Mutations are delegated to
// the shared usePersonalTaskMutations hook (also used by the dedicated
// Personal Tasks page) so the two entry points stay behaviourally identical.
export const usePersonalTasksPanel = (confirm: ConfirmFn) => {
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showCalendarAddTask, setShowCalendarAddTask] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertingTask, setConvertingTask] = useState<PersonalTask | null>(null);
  const [convertProjectId, setConvertProjectId] = useState('');
  const [convertAssigneeId, setConvertAssigneeId] = useState('');
  const [convertEstimatedHours, setConvertEstimatedHours] = useState('');
  // memberLookupProjectId drives the ['project', id] query for the convert + add-task dialogs
  const [memberLookupProjectId, setMemberLookupProjectId] = useState<string>('');
  const [newPersonalTask, setNewPersonalTask] = useState<NewPersonalTaskForm>({
    ...EMPTY_NEW_TASK,
  });
  const [isEditingPersonalTask, setIsEditingPersonalTask] = useState(false);
  const [editingPersonalTask, setEditingPersonalTask] = useState<PersonalTask | null>(null);
  const [showCalendarEditPersonalTask, setShowCalendarEditPersonalTask] = useState(false);
  const [editPersonalTaskForm, setEditPersonalTaskForm] = useState<EditPersonalTaskForm>({
    ...EMPTY_EDIT_FORM,
  });

  const personalTasksQuery = useQuery<PersonalTask[]>({
    queryKey: ['personalTasks'],
    queryFn: () => apiFetch<PersonalTask[]>('/api/personal-tasks/'),
  });
  const personalTasks = personalTasksQuery.data ?? [];

  // Project members drive the convert + add-task dialog assignee pickers.
  const projectMembersQuery = useQuery<{ developers?: ProjectDeveloperEntry[] }>({
    queryKey: ['project', memberLookupProjectId],
    queryFn: () =>
      apiFetch<{ developers?: ProjectDeveloperEntry[] }>(`/api/projects/${memberLookupProjectId}`),
    enabled: !!memberLookupProjectId,
  });
  const projectMembers: ProjectDeveloperEntry[] = projectMembersQuery.data?.developers ?? [];

  const cancelEditPersonalTask = () => {
    setIsEditingPersonalTask(false);
    setEditingPersonalTask(null);
    setEditPersonalTaskForm({ ...EMPTY_EDIT_FORM });
  };

  const mutations = usePersonalTaskMutations({
    confirm,
    onCreated: () => {
      setShowAddTaskDialog(false);
      setNewPersonalTask({ ...EMPTY_NEW_TASK });
      setMemberLookupProjectId('');
    },
    onUpdated: cancelEditPersonalTask,
    onConverted: () => {
      setShowConvertDialog(false);
      setConvertingTask(null);
      setConvertProjectId('');
      setConvertAssigneeId('');
      setConvertEstimatedHours('');
      setMemberLookupProjectId('');
    },
  });

  const createPersonalTask = () => {
    if (!newPersonalTask.title.trim()) {
      toast.error('Title is required');
      return;
    }
    mutations.create.mutate({
      title: newPersonalTask.title,
      description: newPersonalTask.description,
      priority: newPersonalTask.priority,
      due_date: newPersonalTask.due_date,
      estimated_hours: newPersonalTask.estimated_hours,
      projectId: newPersonalTask.project_id || undefined,
      assigneeDeveloperId: newPersonalTask.assignee_developer_id || undefined,
    });
  };

  const updatePersonalTask = () => {
    if (!editingPersonalTask) return;
    if (!editPersonalTaskForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    mutations.update.mutate({
      taskId: editingPersonalTask.id,
      title: editPersonalTaskForm.title,
      description: editPersonalTaskForm.description,
      priority: editPersonalTaskForm.priority,
      // `|| null` so clearing the date in the edit form actually clears it.
      due_date: editPersonalTaskForm.due_date || null,
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

  const startEditPersonalTask = (task: PersonalTask) => {
    setEditingPersonalTask(task);
    setEditPersonalTaskForm({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      due_date: task.due_date || '',
    });
    setIsEditingPersonalTask(true);
  };

  const addingTask = mutations.create.isPending || mutations.update.isPending;
  const convertingTicket = mutations.convert.isPending;

  return {
    personalTasks,
    projectMembers,
    showAddTaskDialog,
    setShowAddTaskDialog,
    showCalendarAddTask,
    setShowCalendarAddTask,
    showConvertDialog,
    setShowConvertDialog,
    convertingTask,
    setConvertingTask,
    convertProjectId,
    setConvertProjectId,
    convertAssigneeId,
    setConvertAssigneeId,
    convertEstimatedHours,
    setConvertEstimatedHours,
    setMemberLookupProjectId,
    newPersonalTask,
    setNewPersonalTask,
    isEditingPersonalTask,
    showCalendarEditPersonalTask,
    setShowCalendarEditPersonalTask,
    editPersonalTaskForm,
    setEditPersonalTaskForm,
    togglePersonalTaskComplete: mutations.toggleComplete,
    createPersonalTask,
    convertToTicket,
    deletePersonalTask: mutations.deleteWithConfirm,
    updatePersonalTask,
    addingTask,
    convertingTicket,
    startEditPersonalTask,
    cancelEditPersonalTask,
  };
};
