import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  FolderKanban,
  CheckCircle2,
  Layers,
  TrendingUp,
  Zap,
  Settings,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import MyTasksWidget from './MyTasksWidget';
import ProjectListSection from './ProjectListSection';
import PrivateNotepad from './PrivateNotepad';
import MyOverviewStats from './MyOverviewStats';
import AddPersonalTaskDialog from './AddPersonalTaskDialog';
import ConvertTaskToTicketDialog from './ConvertTaskToTicketDialog';
import EditPersonalTaskDialog from './EditPersonalTaskDialog';
import CreateProjectModal from './CreateProjectModal';


interface ProjectStats {
  total: number;
  by_status: Record<string, number>;
  total_points: number;
  completed: number;
  completion_pct: number;
}

interface Developer {
  id: number;
  name: string;
  email: string;
  github_username?: string;
  avatar_url?: string;
}

interface ProjectDeveloper {
  id: number;
  name: string;
  email: string;
  role: string;
  responsibilities?: string;
  is_admin: boolean;
}

interface Project {
  id: number;
  name: string;
  description: string;
  key_prefix: string;
  status: string;
  github_repo_url?: string;
  github_repo_urls?: string[];
  github_repo_name?: string;
  created_at: string;
  work_item_stats: ProjectStats;
  developers: ProjectDeveloper[];
}

interface MyTask {
  id: string;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  project_id: number;
  project_name: string;
  due_date: string | null;
  estimated_hours: number | null;
  logged_hours: number | null;
  remaining_hours: number | null;
  is_overdue: boolean;
  // Enriched fields
  story_points?: number;
  assigned_hours?: number;
  assignee?: string;
  assignee_id?: number | null;
  description?: string;
  tags?: string[];
  acceptance_criteria?: string[];
  parent_id?: number | null;
  epic_id?: number | null;
  sprint_id?: number | null;
  sprint?: string;
  parent_key?: string | null;
  epic_key?: string | null;
  /** True for rows synthesized from personal tasks merged into the upcoming/overdue/completed lists. */
  is_personal?: boolean;
}

const TaskDetailPanel = React.lazy(() => import('./TaskDetailPanel'));

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    github_repo_url: '',
  });
  // Developer management
  const [selectedDevelopers, setSelectedDevelopers] = useState<
    { developer_id: number; role: string; responsibilities: string }[]
  >([]);
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>('');
  const [newRole, setNewRole] = useState('');
  const [newResponsibilities, setNewResponsibilities] = useState('');

  // My Tasks
  const [selectedTask, setSelectedTask] = useState<MyTask | null>(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editingTaskForm, setEditingTaskForm] = useState<Partial<MyTask>>({
    title: '',
    description: '',
    priority: 'medium',
    status: 'todo',
    due_date: '',
    type: 'task',
    story_points: 0,
    assigned_hours: 0,
    logged_hours: 0,
    remaining_hours: 0,
  });
  const [editTaskProjectDevelopers, setEditTaskProjectDevelopers] = useState<ProjectDeveloper[]>(
    [],
  );
  const [showCalendarMyTask, setShowCalendarMyTask] = useState(false);

  // Personal Tasks
  interface PersonalTask {
    id: number;
    title: string;
    description: string;
    status: string;
    priority: string;
    estimated_hours: number;
    due_date?: string;
    tags: string[];
    is_converted: boolean;
    project_id?: number;
    work_item_id?: number;
  }
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showCalendarAddTask, setShowCalendarAddTask] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertingTask, setConvertingTask] = useState<PersonalTask | null>(null);
  const [convertProjectId, setConvertProjectId] = useState('');
  const [convertAssigneeId, setConvertAssigneeId] = useState('');
  const [convertEstimatedHours, setConvertEstimatedHours] = useState('');
  // memberLookupProjectId drives the ['project', id] query for the convert dialog and add-task dialog
  const [memberLookupProjectId, setMemberLookupProjectId] = useState<string>('');
  const [newPersonalTask, setNewPersonalTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    project_id: '',
    assignee_developer_id: '',
    estimated_hours: '',
  });
  const [isEditingPersonalTask, setIsEditingPersonalTask] = useState(false);
  const [editingPersonalTask, setEditingPersonalTask] = useState<PersonalTask | null>(null);
  const [showCalendarEditPersonalTask, setShowCalendarEditPersonalTask] = useState(false);
  const [editPersonalTaskForm, setEditPersonalTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
  });

  // Comments system for tasks/tickets
  type Comment = {
    id: number;
    work_item_id: number;
    author_id: number;
    author_name: string;
    content: string;
    comment_type: 'comment' | 'blocker' | 'business_review';
    mentions: number[];
    created_at: string;
  };
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const commentCache = useRef<Map<string, Comment[]>>(new Map());

  // Private Notepad
  const [notepadContent, setNotepadContent] = useState('');
  const [notepadSaved, setNotepadSaved] = useState(true);

  // (box layout — no active tab needed)

  // ── react-query: projects list ────────────────────────────────────────────
  const projectsQuery = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => apiFetch<Project[]>('/api/projects/'),
  });
  const projects = projectsQuery.data ?? [];
  const isLoading = projectsQuery.isLoading;

  // ── react-query: developers (available for project-create modal) ──────────
  const developersQuery = useQuery<Developer[]>({
    queryKey: ['developers'],
    queryFn: () => apiFetch<Developer[]>('/api/developers/'),
    enabled: showCreateModal,
  });
  const availableDevelopers = developersQuery.data ?? [];
  // also used for @mention autocomplete — share same query key
  const allDevelopers = developersQuery.data ?? [];

  // ── react-query: personal tasks ───────────────────────────────────────────
  const personalTasksQuery = useQuery<PersonalTask[]>({
    queryKey: ['personalTasks'],
    queryFn: () => apiFetch<PersonalTask[]>('/api/personal-tasks/'),
  });
  const personalTasks = personalTasksQuery.data ?? [];

  // ── react-query: project members (drives convert + add-task dialogs) ──────
  const projectMembersQuery = useQuery<{
    developers?: { id: number; name: string; email: string }[];
  }>({
    queryKey: ['project', memberLookupProjectId],
    queryFn: () =>
      apiFetch<{ developers?: { id: number; name: string; email: string }[] }>(
        `/api/projects/${memberLookupProjectId}`,
      ),
    enabled: !!memberLookupProjectId,
  });
  const projectMembers = projectMembersQuery.data?.developers ?? [];

  // ── react-query: my tasks ─────────────────────────────────────────────────
  const myTasksQuery = useQuery<MyTask[]>({
    queryKey: ['myTasks'],
    queryFn: () => apiFetch<MyTask[]>('/api/workitems/my-tasks'),
  });
  const myTasksLoading = myTasksQuery.isLoading;

  // ── react-query: sprints for selected task's project ─────────────────────
  const sprintProjectId = selectedTask?.project_id ?? null;
  const sprintsQuery = useQuery<
    { id: number; name: string; start_date: string | null; end_date: string | null }[]
  >({
    queryKey: ['sprints', sprintProjectId],
    queryFn: () => apiFetch(`/api/workitems/projects/${sprintProjectId}/sprints`),
    enabled: !!sprintProjectId,
  });
  const taskSprints = sprintsQuery.data ?? [];

  const myTasks = myTasksQuery.data ?? [];

  // Apply an optimistic update directly inside the ['myTasks'] cache.
  // This is the canonical react-query pattern — the cache IS the source
  // of truth, so callers do not need a parallel local state.
  const patchMyTasksCache = (updater: (old: MyTask[]) => MyTask[]) =>
    queryClient.setQueryData<MyTask[]>(['myTasks'], (old) => updater(old ?? []));

  // ── mutations: personal tasks ─────────────────────────────────────────────
  const invalidatePersonalTasks = () =>
    queryClient.invalidateQueries({ queryKey: ['personalTasks'] });

  // Toggle personal task (optimistic)
  const togglePersonalTaskMutation = useMutation({
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
    onSettled: () => invalidatePersonalTasks(),
  });

  const createPersonalTaskMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Create the personal task
      const createdTask = await apiFetch<PersonalTask>('/api/personal-tasks/', {
        method: 'POST',
        body: JSON.stringify({
          title: newPersonalTask.title,
          description: newPersonalTask.description,
          priority: newPersonalTask.priority,
          due_date: newPersonalTask.due_date || undefined,
          estimated_hours: newPersonalTask.estimated_hours
            ? parseInt(newPersonalTask.estimated_hours)
            : 0,
        }),
      });
      // Step 2: If project is selected, convert to ticket
      if (newPersonalTask.project_id) {
        await apiFetch(`/api/personal-tasks/${createdTask.id}/convert-to-ticket`, {
          method: 'POST',
          body: JSON.stringify({
            project_id: parseInt(newPersonalTask.project_id),
            assignee_developer_id: newPersonalTask.assignee_developer_id
              ? parseInt(newPersonalTask.assignee_developer_id)
              : undefined,
          }),
        });
      }
      return createdTask;
    },
    onSuccess: () => {
      toast.success('Task created!');
      setShowAddTaskDialog(false);
      setNewPersonalTask({
        title: '',
        description: '',
        priority: 'medium',
        due_date: '',
        project_id: '',
        assignee_developer_id: '',
        estimated_hours: '',
      });
      setMemberLookupProjectId('');
      invalidatePersonalTasks();
    },
    onError: () => toast.error('Failed to create task'),
  });

  const convertToTicketMutation = useMutation({
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
      invalidatePersonalTasks();
    },
    onError: () => toast.error('Failed to convert'),
  });

  const deletePersonalTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      apiFetch<void>(`/api/personal-tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Task deleted');
      invalidatePersonalTasks();
    },
    onError: () => toast.error('Failed to delete task'),
  });

  const updatePersonalTaskMutation = useMutation({
    mutationFn: (taskId: number) =>
      apiFetch<PersonalTask>(`/api/personal-tasks/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editPersonalTaskForm.title,
          description: editPersonalTaskForm.description,
          priority: editPersonalTaskForm.priority,
          due_date: editPersonalTaskForm.due_date || null,
        }),
      }),
    onSuccess: () => {
      toast.success('Task updated successfully');
      setIsEditingPersonalTask(false);
      setEditingPersonalTask(null);
      setEditPersonalTaskForm({ title: '', description: '', priority: 'medium', due_date: '' });
      invalidatePersonalTasks();
    },
    onError: () => toast.error('Failed to update task'),
  });

  // Wrapper functions (keep call sites in JSX unchanged)
  const togglePersonalTaskComplete = (task: PersonalTask) => {
    if (task.is_converted) {
      toast.error('Cannot modify a converted task');
      return;
    }
    togglePersonalTaskMutation.mutate(task);
  };
  const createPersonalTask = () => {
    if (!newPersonalTask.title.trim()) {
      toast.error('Title is required');
      return;
    }
    createPersonalTaskMutation.mutate();
  };
  const convertToTicket = () => {
    if (!convertingTask || !convertProjectId) return;
    convertToTicketMutation.mutate();
  };
  const deletePersonalTask = (taskId: number) => {
    if (!confirm('Delete this task?')) return;
    deletePersonalTaskMutation.mutate(taskId);
  };
  const updatePersonalTask = () => {
    if (!editingPersonalTask) return;
    if (!editPersonalTaskForm.title.trim()) {
      toast.error('Title is required');
      return;
    }
    updatePersonalTaskMutation.mutate(editingPersonalTask.id);
  };
  // isPending flags used in JSX
  const addingTask = createPersonalTaskMutation.isPending || updatePersonalTaskMutation.isPending;
  const convertingTicket = convertToTicketMutation.isPending;

  const startEditPersonalTask = (task: PersonalTask) => {
    setEditingPersonalTask(task);
    setEditPersonalTaskForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_date: task.due_date || '',
    });
    setIsEditingPersonalTask(true);
  };

  const cancelEditPersonalTask = () => {
    setIsEditingPersonalTask(false);
    setEditingPersonalTask(null);
    setEditPersonalTaskForm({ title: '', description: '', priority: 'medium', due_date: '' });
  };

  // ── mutations: work items ─────────────────────────────────────────────────
  const moveSprintMutation = useMutation({
    mutationFn: ({ itemId, targetSprintId }: { itemId: string; targetSprintId: number | null }) =>
      apiFetch<MyTask>(`/api/workitems/${itemId}/move-sprint`, {
        method: 'PUT',
        body: JSON.stringify({ target_sprint_id: targetSprintId }),
      }),
    onSuccess: (updated, { itemId, targetSprintId }) => {
      const merged = { ...selectedTask, ...updated } as MyTask;
      patchMyTasksCache((old) => old.map((t) => (t.id === itemId ? merged : t)));
      if (selectedTask?.id === itemId) setSelectedTask(merged);
      toast.success(targetSprintId ? 'Moved to sprint' : 'Moved to backlog');
      if (sprintProjectId)
        queryClient.invalidateQueries({ queryKey: ['sprints', sprintProjectId] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
    },
    onError: () => toast.error('Failed to move ticket'),
  });

  const handleMoveTaskToSprint = (itemId: string, targetSprintId: number | null) => {
    moveSprintMutation.mutate({ itemId, targetSprintId });
  };

  const getNextTaskSprint = (currentSprintId: number | null | undefined): number | null => {
    if (!currentSprintId || taskSprints.length === 0) return null;
    const idx = taskSprints.findIndex((s) => s.id === currentSprintId);
    if (idx >= 0 && idx < taskSprints.length - 1) return taskSprints[idx + 1].id;
    return null;
  };

  // ── mutation: edit task project members (fetched on demand when edit opens) ─
  const [editTaskProjectId, setEditTaskProjectId] = useState<number | null>(null);
  const editTaskProjectQuery = useQuery<{ developers?: ProjectDeveloper[] }>({
    queryKey: ['project', editTaskProjectId],
    queryFn: () =>
      apiFetch<{ developers?: ProjectDeveloper[] }>(`/api/projects/${editTaskProjectId}`),
    enabled: !!editTaskProjectId,
  });

  // ── mutations: work-item writes ───────────────────────────────────────────
  const logHoursMutation = useMutation({
    mutationFn: ({ taskId, hours }: { taskId: string; hours: number }) =>
      apiFetch<{ logged_hours: number; remaining_hours: number }>(
        `/api/workitems/${taskId}/log-hours`,
        {
          method: 'POST',
          body: JSON.stringify({ hours }),
        },
      ),
    onSuccess: (data, { taskId }) => {
      const updated = {
        ...selectedTask,
        logged_hours: data.logged_hours,
        remaining_hours: data.remaining_hours,
      } as MyTask;
      setSelectedTask(updated);
      patchMyTasksCache((old) => old.map((t) => (t.id === taskId ? updated : t)));
      toast.success(`Logged ${data.logged_hours}h! Remaining: ${data.remaining_hours}h`);
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
    },
    onError: () => toast.error('Failed to log hours'),
  });

  const saveEditedTaskMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiFetch<MyTask>(`/api/workitems/${taskId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editingTaskForm.title,
          description: editingTaskForm.description,
          priority: editingTaskForm.priority,
          status: editingTaskForm.status,
          due_date: editingTaskForm.due_date || null,
          type: editingTaskForm.type,
          story_points: editingTaskForm.story_points,
          assigned_hours: editingTaskForm.assigned_hours,
          logged_hours: editingTaskForm.logged_hours,
          remaining_hours: editingTaskForm.remaining_hours,
          assignee_id: editingTaskForm.assignee_id || null,
        }),
      }),
    onSuccess: (updatedTask) => {
      const mergedTask = { ...selectedTask, ...editingTaskForm, ...updatedTask } as MyTask;
      setSelectedTask(mergedTask);
      setIsEditingTask(false);
      patchMyTasksCache((old) => old.map((t) => (t.id === updatedTask.id ? mergedTask : t)));
      toast.success('Task updated successfully');
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
    },
    onError: () => toast.error('Failed to update task'),
  });

  // Start editing selected task — now reads developers from the project query
  const startEditTask = () => {
    if (!selectedTask) return;
    setEditTaskProjectId(selectedTask.project_id);
    const developers = editTaskProjectQuery.data?.developers ?? [];
    let assigneeId: number | null = selectedTask.assignee_id || null;
    if (!assigneeId && selectedTask.assignee) {
      const matchedDev = developers.find((d) => d.name === selectedTask.assignee);
      if (matchedDev) assigneeId = matchedDev.id;
    }
    setEditTaskProjectDevelopers(developers);
    setEditingTaskForm({
      title: selectedTask.title,
      description: selectedTask.description || '',
      priority: selectedTask.priority,
      status: selectedTask.status,
      due_date: selectedTask.due_date || '',
      type: selectedTask.type || 'task',
      story_points: selectedTask.story_points || 0,
      assigned_hours: selectedTask.assigned_hours || 0,
      logged_hours: selectedTask.logged_hours || 0,
      remaining_hours: selectedTask.remaining_hours || 0,
      assignee_id: assigneeId,
    });
    setIsEditingTask(true);
  };

  // When the project query resolves (after edit opens), sync developers into form state
  const editTaskDevs = editTaskProjectQuery.data?.developers;
  if (isEditingTask && editTaskDevs && editTaskDevs !== editTaskProjectDevelopers) {
    // Use a timeout-0 to avoid setting state during render
  }

  // Log hours for a task
  const handleLogHours = (task: MyTask, hoursToLog: number) => {
    logHoursMutation.mutate({ taskId: task.id, hours: hoursToLog });
  };

  // Quick status change (optimistic)
  const handleStatusChange = (task: MyTask, newStatus: string) => {
    const updated = { ...task, status: newStatus } as MyTask;
    patchMyTasksCache((old) => old.map((t) => (t.id === task.id ? updated : t)));
    if (selectedTask?.id === task.id) setSelectedTask(updated);
    apiFetch(`/api/workitems/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['workItems'] });
      })
      .catch(() => {
        toast.error('Failed to update status');
        queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      });
  };

  // Quick due-date change from the inline calendar popover on each task row.
  // Pass an empty string to clear the due date. Routes to the right endpoint
  // based on whether it's a project work item or a personal task.
  const handleQuickDueDateChange = (task: MyTask & { is_personal?: boolean }, isoDate: string) => {
    const cleared = !isoDate;
    const dueValue = cleared ? null : isoDate;

    if (task.is_personal) {
      const realId = String(task.id).replace(/^personal-/, '');
      // Optimistic update to personalTasks via cache
      queryClient.setQueryData<PersonalTask[]>(['personalTasks'], (old) =>
        (old ?? []).map((p) =>
          String(p.id) === realId ? { ...p, due_date: dueValue || undefined } : p,
        ),
      );
      apiFetch(`/api/personal-tasks/${realId}`, {
        method: 'PUT',
        body: JSON.stringify({ due_date: dueValue }),
      })
        .then(() => {
          toast.success(cleared ? 'Due date cleared' : 'Due date updated');
        })
        .catch(() => {
          toast.error('Failed to update due date');
          queryClient.invalidateQueries({ queryKey: ['personalTasks'] });
        });
    } else {
      // Project work item — also recompute is_overdue locally so it moves
      // between Upcoming / Overdue tabs correctly without a refetch.
      let isOverdue = false;
      if (dueValue) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(dueValue + 'T00:00:00');
        isOverdue = due < today && task.status !== 'done';
      }
      patchMyTasksCache((old) =>
        old.map((t) =>
          t.id === task.id ? { ...t, due_date: dueValue, is_overdue: isOverdue } : t,
        ),
      );
      apiFetch(`/api/workitems/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ due_date: dueValue }),
      })
        .then(() => {
          toast.success(cleared ? 'Due date cleared' : 'Due date updated');
          queryClient.invalidateQueries({ queryKey: ['workItems'] });
        })
        .catch(() => {
          toast.error('Failed to update due date');
          queryClient.invalidateQueries({ queryKey: ['myTasks'] });
        });
    }
  };

  // Render text with newlines preserved
  const renderTextWithNewlines = (text: string) => {
    if (!text) return null;
    return text
      .split('\n')
      .map((line, index) => [
        <span key={`line-${index}`}>{line}</span>,
        index < text.split('\n').length - 1 ? <br key={`br-${index}`} /> : null,
      ])
      .flat()
      .filter(Boolean);
  };

  // Handle comment input with @mention detection
  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewComment(value);

    // Check for @mentions
    const lastAtIndex = value.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1);
      // Check if there's a space after @ (meaning mention is complete)
      if (!textAfterAt.includes(' ')) {
        setMentionFilter(textAfterAt);
        setShowMentions(true);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }
  };

  // Insert mention
  const insertMention = (developer: { id: number; name: string }) => {
    const lastAtIndex = newComment.lastIndexOf('@');
    const beforeMention = newComment.substring(0, lastAtIndex);
    setNewComment(`${beforeMention}@${developer.name} `);
    setShowMentions(false);
    setMentionFilter('');
  };

  // Submit comment
  const handleSubmitComment = (
    commentType: 'comment' | 'blocker' | 'business_review' = 'comment',
  ) => {
    if (!selectedTask || !newComment.trim()) return;
    apiFetch<Comment>('/api/comments/', {
      method: 'POST',
      body: JSON.stringify({
        work_item_id: parseInt(selectedTask.id),
        content: newComment,
        author_id: user?.id || 1,
        comment_type: commentType,
      }),
    })
      .then((newCommentData: Comment) => {
        setComments((prev) => [newCommentData, ...prev]);
        if (selectedTask) commentCache.current.delete(selectedTask.id);
        setNewComment('');
        const messages = {
          blocker: 'Blocker reported!',
          business_review: 'Business Review comment added!',
          comment: 'Comment added!',
        };
        toast.success(messages[commentType]);
      })
      .catch(() => {
        toast.error('Failed to add comment');
      });
  };

  // Render comment with mentions highlighted and links as clickable
  const renderCommentContent = (content: string, mentions: number[] = []) => {
    // Build a map of developer IDs to names for quick lookup
    const devMap = new Map(allDevelopers.map((d) => [d.id, d.name]));

    // Replace @name with highlighted version for each mentioned developer
    let result = content;
    mentions.forEach((devId) => {
      const devName = devMap.get(devId);
      if (devName) {
        // Replace @devName with highlighted version
        const regex = new RegExp(`@${devName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        result = result.replace(regex, `<<<MENTION_${devId}>>>`);
      }
    });

    // Also replace URLs with placeholders
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls: string[] = [];
    result = result.replace(urlRegex, (match) => {
      urls.push(match);
      return `<<<URL_${urls.length - 1}>>>`;
    });

    // Parse the result and highlight the placeholders
    const parts = result.split(/(<<<MENTION_\d+>>>|<<<URL_\d+>>>)/g);
    let elementIndex = 0;
    return parts.flatMap((part) => {
      const mentionMatch = part.match(/<<<MENTION_(\d+)>>>/);
      if (mentionMatch) {
        const devId = parseInt(mentionMatch[1]);
        const devName = devMap.get(devId);
        return (
          <span
            key={`mention-${elementIndex++}`}
            className="bg-[rgba(224,185,84,0.2)] text-[#E0B954] px-1.5 py-0.5 rounded-md font-medium"
          >
            @{devName}
          </span>
        );
      }

      const urlMatch = part.match(/<<<URL_(\d+)>>>/);
      if (urlMatch) {
        const urlIndex = parseInt(urlMatch[1]);
        const url = urls[urlIndex];
        return (
          <a
            key={`url-${elementIndex++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#E0B954] hover:text-[#C79E3B] underline hover:no-underline transition-colors break-all"
          >
            {url}
          </a>
        );
      }

      // Handle newlines in text
      if (part.trim()) {
        return part
          .split('\n')
          .flatMap((line, lineIndex) => [
            <span key={`text-${elementIndex}-${lineIndex}`}>{line}</span>,
            lineIndex < part.split('\n').length - 1 ? (
              <br key={`br-${elementIndex}-${lineIndex}`} />
            ) : null,
          ])
          .filter(Boolean);
      }

      return part;
    });
  };

  const saveEditedTask = () => {
    if (!selectedTask) return;
    saveEditedTaskMutation.mutate(selectedTask.id);
  };

  // Cancel editing
  const cancelEditTask = () => {
    setIsEditingTask(false);
    setEditingTaskForm({
      title: '',
      description: '',
      priority: 'medium',
      status: 'todo',
      due_date: '',
      type: 'task',
      story_points: 0,
      assigned_hours: 0,
      logged_hours: 0,
      remaining_hours: 0,
    });
    setEditTaskProjectDevelopers([]);
  };

  // ── comments: fetched via useQuery, gated on selectedTask ─────────────────
  const commentsQuery = useQuery<Comment[]>({
    queryKey: ['workItem', selectedTask?.id, 'comments'],
    queryFn: async () => {
      // Use local cache first for instant feel, then use react-query's result
      const cached = commentCache.current.get(selectedTask!.id);
      if (cached !== undefined) return cached;
      const data = await apiFetch<Comment[]>(`/api/comments/workitem/${selectedTask!.id}`);
      commentCache.current.set(selectedTask!.id, data ?? []);
      return data ?? [];
    },
    enabled: !!selectedTask && !selectedTask.is_personal,
  });

  // Use query data as the source of truth for the comments list shown in JSX
  const displayComments = commentsQuery.data ?? comments;

  // Notepad: load from localStorage per user
  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`notepad_${user.id}`);
      if (saved !== null) setNotepadContent(saved);
    }
  }, [user?.id]);

  // Notepad: auto-save with debounce
  useEffect(() => {
    if (!user?.id) return;
    setNotepadSaved(false);
    const timer = setTimeout(() => {
      localStorage.setItem(`notepad_${user.id}`, notepadContent);
      setNotepadSaved(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [notepadContent, user?.id]);

  // Computed chart data (used by My Overview stacked bar)
  const overviewStats = {
    total: myTasks.length,
    done: myTasks.filter((t) => t.status === 'done').length,
    in_progress: myTasks.filter((t) => t.status === 'in_progress').length,
    in_review: myTasks.filter((t) => t.status === 'in_review').length,
    todo: myTasks.filter((t) => t.status === 'todo').length,
    overdue: myTasks.filter((t) => t.is_overdue).length,
    completion_pct:
      myTasks.length > 0
        ? Math.round((myTasks.filter((t) => t.status === 'done').length / myTasks.length) * 100)
        : 0,
  };

  // Personal tasks coerced to MyTask shape so they render in the same list.
  // Marked with is_personal so the row click routes to /personal-tasks instead
  // of opening the project-workitem modal.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const personalAsMyTasks: (MyTask & { is_personal?: boolean })[] = personalTasks
    .filter((t) => !t.is_converted)
    .map((t) => {
      const due = t.due_date ? new Date(t.due_date) : null;
      return {
        id: `personal-${t.id}`,
        key: 'PERSONAL',
        title: t.title,
        type: 'personal',
        status: t.status,
        priority: t.priority,
        project_id: t.project_id ?? 0,
        project_name: 'Personal',
        due_date: t.due_date || null,
        estimated_hours: t.estimated_hours ?? null,
        logged_hours: null,
        remaining_hours: t.estimated_hours ?? null,
        is_overdue: due ? due < todayStart && t.status !== 'done' : false,
        description: t.description,
        tags: t.tags,
        is_personal: true,
      };
    });

  const handleAddDeveloper = () => {
    if (!selectedDeveloperId || !newRole.trim()) {
      toast.error('Please select a developer and enter a role');
      return;
    }

    const devId = parseInt(selectedDeveloperId);
    const alreadyAdded = selectedDevelopers.find((d) => d.developer_id === devId);
    if (alreadyAdded) {
      toast.error('Developer already added to this project');
      return;
    }

    const developer = availableDevelopers.find((d) => d.id === devId);

    setSelectedDevelopers((prev) => [
      ...prev,
      {
        developer_id: devId,
        role: newRole,
        responsibilities: newResponsibilities,
      },
    ]);

    toast.success(`${developer?.name} added as ${newRole}`);

    setSelectedDeveloperId('');
    setNewRole('');
    setNewResponsibilities('');
  };

  const handleRemoveDeveloper = (developerId: number) => {
    setSelectedDevelopers((prev) => prev.filter((d) => d.developer_id !== developerId));
  };

  const createProjectMutation = useMutation({
    mutationFn: () =>
      apiFetch<Project>('/api/projects/', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          github_repo_url: createForm.github_repo_url || undefined,
          developers: selectedDevelopers,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', github_repo_url: '' });
      setSelectedDevelopers([]);
      toast.success('Project created successfully!');
    },
    onError: () => toast.error('Failed to create project'),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: number) =>
      apiFetch<void>(`/api/projects/${projectId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
    },
    onError: () => toast.error('Failed to delete project'),
  });

  const handleCreateProject = () => {
    if (!createForm.name.trim()) {
      toast.error('Project name is required');
      return;
    }
    createProjectMutation.mutate();
  };
  const isCreating = createProjectMutation.isPending;

  const handleDeleteProject = (e: React.MouseEvent, projectId: number) => {
    e.stopPropagation();
    if (!confirm('Delete this project and all its work items?')) return;
    deleteProjectMutation.mutate(projectId);
  };

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const totalStats = {
    projects: projects.length,
    items: projects.reduce((sum, p) => sum + p.work_item_stats.total, 0),
    completed: projects.reduce((sum, p) => sum + p.work_item_stats.completed, 0),
    points: projects.reduce((sum, p) => sum + p.work_item_stats.total_points, 0),
  };

  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
      <Toaster position="top-right" theme="dark" richColors />

      {/* Header */}
      <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#E0B954] via-[#B8872A] to-[#4338CA] flex items-center justify-center shadow-lg shadow-[#B8872A]/25">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Arsenal Ops</h1>
              <p className="text-xs text-[#737373] font-medium">Project Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 mr-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-[#080808] text-sm font-medium">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-[#a3a3a3] hidden md:block">{user.name}</span>
              </div>
            )}
            {user?.role.includes('admin') && (
              <Button
                variant="ghost"
                onClick={() => navigate('/admin')}
                className="text-[#737373] hover:text-white hover:bg-[rgba(244,246,255,0.05)] rounded-xl px-3"
              >
                <Settings className="w-4 h-4 mr-2" />
                Admin
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={logout}
              className="text-[#737373] hover:text-red-400 hover:bg-red-500/10 rounded-xl px-3"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
            <Badge
              variant="outline"
              className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 px-3 py-1"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse" />
              Online
            </Badge>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-8 py-8">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: FolderKanban, label: 'Projects', value: totalStats.projects, color: '#E0B954' },
            { icon: Layers, label: 'Total Items', value: totalStats.items, color: '#F59E0B' },
            {
              icon: CheckCircle2,
              label: 'Completed',
              value: totalStats.completed,
              color: '#E0B954',
            },
            { icon: Zap, label: 'Story Points', value: totalStats.points, color: '#C79E3B' },
          ].map((stat) => (
            <div key={stat.label} className="relative group">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[rgba(224,185,84,0.08)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 transition-all duration-300 group-hover:border-[rgba(224,185,84,0.2)]">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                  <TrendingUp className="w-3.5 h-3.5 text-[#334155] group-hover:text-[#737373] transition-colors" />
                </div>
                {isLoading ? (
                  <div className="h-9 w-16 bg-[rgba(255,255,255,0.06)] rounded-lg animate-pulse mb-1" />
                ) : (
                  <div className="text-3xl font-bold text-white tracking-tight">{stat.value}</div>
                )}
                <div className="text-xs text-[#737373] font-medium mt-1">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 2×2 Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* TOP-LEFT: MY TASKS BOX */}
          <MyTasksWidget
            myTasks={myTasks}
            myTasksLoading={myTasksLoading}
            personalTasks={personalTasks}
            personalAsMyTasks={personalAsMyTasks}
            user={user}
            setSelectedTask={setSelectedTask}
            setShowAddTaskDialog={setShowAddTaskDialog}
            togglePersonalTaskComplete={togglePersonalTaskComplete}
            startEditPersonalTask={startEditPersonalTask}
            deletePersonalTask={deletePersonalTask}
            setConvertingTask={setConvertingTask}
            setShowConvertDialog={setShowConvertDialog}
            handleStatusChange={handleStatusChange}
            handleQuickDueDateChange={handleQuickDueDateChange}
          />

          {/* TOP-RIGHT: PROJECTS BOX */}
          <ProjectListSection
            filteredProjects={filteredProjects}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setShowCreateModal={setShowCreateModal}
            onOpenProject={(id) => navigate(`/project/${id}`)}
            onDeleteProject={handleDeleteProject}
            isLoading={isLoading}
          />

          {/* BOTTOM-LEFT: PRIVATE NOTEPAD BOX */}
          <PrivateNotepad
            notepadContent={notepadContent}
            setNotepadContent={setNotepadContent}
            notepadSaved={notepadSaved}
          />

          {/* BOTTOM-RIGHT: MY OVERVIEW BOX */}
          <MyOverviewStats
            overviewStats={overviewStats}
            myTasksLoading={myTasksLoading}
            myTasks={myTasks}
            setSelectedTask={setSelectedTask}
          />
        </div>
        {/* end 2×2 grid */}
      </div>

      {/* Jira-style Ticket Slide-in Panel */}
      {selectedTask && (
        <Suspense fallback={<div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#080808] z-50 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-[#E0B954] border-t-transparent rounded-full" /></div>}>
          <TaskDetailPanel
            selectedTask={selectedTask}
            isEditingTask={isEditingTask}
            editingTaskForm={editingTaskForm}
            setEditingTaskForm={setEditingTaskForm}
            editTaskProjectDevelopers={editTaskProjectDevelopers}
            showCalendarMyTask={showCalendarMyTask}
            setShowCalendarMyTask={setShowCalendarMyTask}
            displayComments={displayComments}
            allDevelopers={allDevelopers}
            newComment={newComment}
            showMentions={showMentions}
            mentionFilter={mentionFilter}
            taskSprints={taskSprints}
            setSelectedTask={setSelectedTask}
            setIsEditingTask={setIsEditingTask}
            startEditTask={startEditTask}
            cancelEditTask={cancelEditTask}
            saveEditedTask={saveEditedTask}
            handleLogHours={handleLogHours}
            handleStatusChange={handleStatusChange}
            handleMoveTaskToSprint={handleMoveTaskToSprint}
            getNextTaskSprint={getNextTaskSprint}
            handleCommentChange={handleCommentChange}
            handleSubmitComment={handleSubmitComment}
            insertMention={insertMention}
            renderTextWithNewlines={renderTextWithNewlines}
            renderCommentContent={renderCommentContent}
          />
        </Suspense>
      )}

      {/* Add Personal Task Dialog */}
      <AddPersonalTaskDialog
        showAddTaskDialog={showAddTaskDialog}
        setShowAddTaskDialog={setShowAddTaskDialog}
        newPersonalTask={newPersonalTask}
        setNewPersonalTask={setNewPersonalTask}
        memberLookupProjectId={memberLookupProjectId}
        setMemberLookupProjectId={setMemberLookupProjectId}
        projectMembersForLookup={projectMembers}
        projects={projects}
        createPersonalTask={createPersonalTask}
        addingTask={addingTask}
        showCalendarAddTask={showCalendarAddTask}
        setShowCalendarAddTask={setShowCalendarAddTask}
      />

      {/* Convert to Project Ticket Dialog */}
      <ConvertTaskToTicketDialog
        showConvertDialog={showConvertDialog}
        setShowConvertDialog={setShowConvertDialog}
        convertingTask={convertingTask}
        convertProjectId={convertProjectId}
        setConvertProjectId={setConvertProjectId}
        convertAssigneeId={convertAssigneeId}
        setConvertAssigneeId={setConvertAssigneeId}
        convertEstimatedHours={convertEstimatedHours}
        setConvertEstimatedHours={setConvertEstimatedHours}
        setMemberLookupProjectId={setMemberLookupProjectId}
        projectMembersForLookup={projectMembers}
        projects={projects}
        convertToTicket={convertToTicket}
        convertingTicket={convertingTicket}
      />

      {/* Edit Personal Task Dialog */}
      <EditPersonalTaskDialog
        isEditingPersonalTask={isEditingPersonalTask}
        cancelEditPersonalTask={cancelEditPersonalTask}
        editPersonalTaskForm={editPersonalTaskForm}
        setEditPersonalTaskForm={setEditPersonalTaskForm}
        updatePersonalTask={updatePersonalTask}
        addingTask={addingTask}
        showCalendarEditPersonalTask={showCalendarEditPersonalTask}
        setShowCalendarEditPersonalTask={setShowCalendarEditPersonalTask}
      />

      {/* Create Project Modal */}
      <CreateProjectModal
        showCreateModal={showCreateModal}
        setShowCreateModal={setShowCreateModal}
        createForm={createForm}
        setCreateForm={setCreateForm}
        selectedDevelopers={selectedDevelopers}
        setSelectedDevelopers={setSelectedDevelopers}
        selectedDeveloperId={selectedDeveloperId}
        setSelectedDeveloperId={setSelectedDeveloperId}
        newRole={newRole}
        setNewRole={setNewRole}
        newResponsibilities={newResponsibilities}
        setNewResponsibilities={setNewResponsibilities}
        availableDevelopers={availableDevelopers}
        handleAddDeveloper={handleAddDeveloper}
        handleRemoveDeveloper={handleRemoveDeveloper}
        handleCreateProject={handleCreateProject}
        isCreating={isCreating}
      />
    </div>
  );
};

export default ProjectsPage;
