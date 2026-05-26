import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateAdminWorkItemImpact, invalidateProjectScope } from '@/lib/invalidations';
import {
  AppHeader,
  DashboardStats,
  MyTasksBox,
  ProjectsBox,
  QuickNotesPanel,
  TicketDetailPanel,
  AddPersonalTaskDialog,
  ConvertToTicketDialog,
  EditPersonalTaskDialog,
  CreateProjectDialog,
} from '@/components/ProjectsPage';
import type {
  Project,
  Developer,
  MyTask,
  PersonalTask,
  ProjectMember,
  NewPersonalTaskForm,
  EditPersonalTaskForm,
  CreateProjectForm,
  SelectedDeveloper,
} from '@/components/ProjectsPage';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const queryClient = useQueryClient();

  // Projects state
  const [searchQuery, setSearchQuery] = useState('');

  // Create project modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateProjectForm>({
    name: '',
    description: '',
    github_repo_url: '',
  });
  const [selectedDevelopers, setSelectedDevelopers] = useState<SelectedDeveloper[]>([]);
  const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>('');
  const [newRole, setNewRole] = useState('');
  const [newResponsibilities, setNewResponsibilities] = useState('');

  // My Tasks
  const [myTaskTab, setMyTaskTab] = useState<'upcoming' | 'overdue' | 'completed' | 'personal'>(
    'upcoming',
  );
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [selectedTask, setSelectedTask] = useState<MyTask | null>(null);

  // Personal Tasks
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
  const [editPersonalTaskForm, setEditPersonalTaskForm] = useState<EditPersonalTaskForm>({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
  });

  // Quick Notes
  const [notepadContent, setNotepadContent] = useState('');
  const [notepadSaved, setNotepadSaved] = useState(true);
  const [notepadOpen, setNotepadOpen] = useState(false);

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

  // ── react-query: personal tasks ───────────────────────────────────────────
  const personalTasksQuery = useQuery<PersonalTask[]>({
    queryKey: ['personalTasks'],
    queryFn: () => apiFetch<PersonalTask[]>('/api/personal-tasks/'),
  });
  const personalTasks = personalTasksQuery.data ?? [];

  // ── react-query: project members (drives convert + add-task dialogs) ──────
  const projectMembersQuery = useQuery<{
    developers?: ProjectMember[];
  }>({
    queryKey: ['project', memberLookupProjectId],
    queryFn: () =>
      apiFetch<{ developers?: ProjectMember[] }>(`/api/projects/${memberLookupProjectId}`),
    enabled: !!memberLookupProjectId,
  });
  const projectMembers: ProjectMember[] = projectMembersQuery.data?.developers ?? [];

  // ── react-query: my tasks ─────────────────────────────────────────────────
  const myTasksQuery = useQuery<MyTask[]>({
    queryKey: ['myTasks'],
    queryFn: () => apiFetch<MyTask[]>('/api/workitems/my-tasks'),
  });
  const myTasksLoading = myTasksQuery.isLoading;
  const myTasks = myTasksQuery.data ?? [];

  // Apply an optimistic update directly inside the ['myTasks'] cache.
  const patchMyTasksCache = (updater: (old: MyTask[]) => MyTask[]) =>
    queryClient.setQueryData<MyTask[]>(['myTasks'], (old) => updater(old ?? []));

  // ── mutations: personal tasks ─────────────────────────────────────────────
  const invalidatePersonalTasks = () =>
    queryClient.invalidateQueries({ queryKey: ['personalTasks'] });

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
      const createdWithProject = !!newPersonalTask.project_id;
      const createdProjectId = newPersonalTask.project_id;
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
      // If a project was selected, a new work item was created — refresh both caches.
      if (createdWithProject) {
        queryClient.invalidateQueries({ queryKey: ['myTasks'] });
        queryClient.invalidateQueries({ queryKey: ['workItems'] });
        invalidateAdminWorkItemImpact(queryClient);
        invalidateProjectScope(queryClient, parseInt(createdProjectId));
      }
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
      queryClient.invalidateQueries({ queryKey: ['myTasks'] });
      queryClient.invalidateQueries({ queryKey: ['workItems'] });
      invalidateAdminWorkItemImpact(queryClient);
      if (convertProjectId) {
        invalidateProjectScope(queryClient, parseInt(convertProjectId));
      }
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

  // Wrapper functions (call sites in JSX unchanged)
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

  // ── mutations: work-item quick-edit (status + due date) ───────────────────
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
      const snapshot = queryClient.getQueryData<PersonalTask[]>(['personalTasks']);
      queryClient.setQueryData<PersonalTask[]>(['personalTasks'], (old) =>
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

  // Notepad: load from localStorage per user
  useEffect(() => {
    if (user?.id) {
      const saved = localStorage.getItem(`notepad_${user.id}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage is a one-shot mount sync
      if (saved !== null) setNotepadContent(saved);
    }
  }, [user?.id]);

  // Notepad: auto-save with debounce
  useEffect(() => {
    if (!user?.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mark dirty before the debounced save fires
    setNotepadSaved(false);
    const timer = setTimeout(() => {
      localStorage.setItem(`notepad_${user.id}`, notepadContent);
      setNotepadSaved(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [notepadContent, user?.id]);

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
      { developer_id: devId, role: newRole, responsibilities: newResponsibilities },
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
      setShowCreateModal(false);
      setCreateForm({ name: '', description: '', github_repo_url: '' });
      setSelectedDevelopers([]);
      toast.success('Project created successfully!');
    },
    onError: () => toast.error('Failed to create project'),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: number) =>
      apiFetch<void>(`/api/projects/${projectId}/`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Project deleted');
    },
    onError: () => toast.error('Failed to delete project'),
    onSettled: (_data, _err, projectId) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      // Assignments were freed by the cascading delete, so developer capacity moves.
      invalidateAdminWorkItemImpact(queryClient);
      // Evict per-project caches so a recreated id can't see stale data.
      if (projectId !== undefined) {
        queryClient.removeQueries({ queryKey: ['project', projectId] });
        queryClient.removeQueries({ queryKey: ['projectOverview', projectId] });
        queryClient.removeQueries({ queryKey: ['sprints', projectId] });
        queryClient.removeQueries({ queryKey: ['hubData', projectId] });
      }
    },
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

  return (
    <div className="h-screen flex flex-col bg-[#080808] text-[#F4F6FF]">
      <Toaster position="top-right" theme="dark" richColors />

      <AppHeader user={user} onAdminClick={() => navigate('/admin')} onLogout={logout} />

      <div className="flex-1 min-h-0 flex flex-col max-w-[1400px] mx-auto px-8 py-8 w-full">
        <div className="flex-shrink-0">
          <DashboardStats
            userName={user?.name}
            myTasks={myTasks}
            myTasksLoading={myTasksLoading}
            onTabChange={setMyTaskTab}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-5 flex-1 min-h-0">
          <div className="md:col-span-2 min-h-0 h-full">
            <ProjectsBox
              projects={projects}
              isLoading={isLoading}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onCreateProjectClick={() => setShowCreateModal(true)}
              onProjectClick={(projectId) => navigate(`/project/${projectId}`)}
              onDeleteProject={handleDeleteProject}
            />
          </div>

          <div className="md:col-span-3 min-h-0 h-full">
            <MyTasksBox
              myTasks={myTasks}
              personalTasks={personalTasks}
              myTasksLoading={myTasksLoading}
              myTaskTab={myTaskTab}
              setMyTaskTab={setMyTaskTab}
              showAllTasks={showAllTasks}
              setShowAllTasks={setShowAllTasks}
              onSelectTask={setSelectedTask}
              onAddPersonalTaskClick={() => setShowAddTaskDialog(true)}
              onEditPersonalTask={startEditPersonalTask}
              onConvertPersonalTask={(task) => {
                setConvertingTask(task);
                setShowConvertDialog(true);
              }}
              onDeletePersonalTask={deletePersonalTask}
              onTogglePersonalTaskComplete={togglePersonalTaskComplete}
              onNavigateToPersonalTasks={() => navigate('/personal-tasks')}
              onChangeTaskStatus={handleChangeMyTaskStatus}
              onQuickDueDateChange={handleQuickDueDateChange}
            />
          </div>
        </div>
      </div>

      <QuickNotesPanel
        notepadOpen={notepadOpen}
        setNotepadOpen={setNotepadOpen}
        notepadContent={notepadContent}
        setNotepadContent={setNotepadContent}
        notepadSaved={notepadSaved}
      />

      {selectedTask && (
        <TicketDetailPanel
          task={selectedTask}
          token={token}
          currentUserId={user?.id ?? null}
          onClose={() => setSelectedTask(null)}
          onTaskChanged={handleTaskChanged}
          onOpenInProjectBoard={(projectId, taskId) => {
            navigate(`/project/${projectId}/board/${taskId}`);
            setSelectedTask(null);
          }}
        />
      )}

      <AddPersonalTaskDialog
        open={showAddTaskDialog}
        onOpenChange={(open) => {
          setShowAddTaskDialog(open);
          if (!open) {
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
          }
        }}
        form={newPersonalTask}
        setForm={setNewPersonalTask}
        showCalendar={showCalendarAddTask}
        setShowCalendar={setShowCalendarAddTask}
        projects={projects}
        projectMembers={projectMembers}
        onProjectChange={(projectId) => {
          setNewPersonalTask({
            ...newPersonalTask,
            project_id: projectId,
            assignee_developer_id: '',
          });
          setMemberLookupProjectId(projectId || '');
        }}
        addingTask={addingTask}
        onCreate={createPersonalTask}
      />

      <ConvertToTicketDialog
        open={showConvertDialog}
        onOpenChange={(open) => {
          setShowConvertDialog(open);
          if (!open) {
            setConvertProjectId('');
            setConvertAssigneeId('');
            setConvertEstimatedHours('');
            setMemberLookupProjectId('');
          }
        }}
        convertingTask={convertingTask}
        projects={projects}
        projectMembers={projectMembers}
        convertProjectId={convertProjectId}
        setConvertProjectId={setConvertProjectId}
        convertAssigneeId={convertAssigneeId}
        setConvertAssigneeId={setConvertAssigneeId}
        convertEstimatedHours={convertEstimatedHours}
        setConvertEstimatedHours={setConvertEstimatedHours}
        onProjectChange={(projectId) => {
          setConvertProjectId(projectId);
          setConvertAssigneeId('');
          setMemberLookupProjectId(projectId || '');
        }}
        converting={convertingTicket}
        onConvert={convertToTicket}
      />

      <EditPersonalTaskDialog
        open={isEditingPersonalTask}
        onOpenChange={(open) => {
          if (!open) cancelEditPersonalTask();
        }}
        form={editPersonalTaskForm}
        setForm={setEditPersonalTaskForm}
        showCalendar={showCalendarEditPersonalTask}
        setShowCalendar={setShowCalendarEditPersonalTask}
        saving={addingTask}
        onSave={updatePersonalTask}
        onCancel={cancelEditPersonalTask}
      />

      <CreateProjectDialog
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        form={createForm}
        setForm={setCreateForm}
        isCreating={isCreating}
        onCreate={handleCreateProject}
        availableDevelopers={availableDevelopers}
        selectedDevelopers={selectedDevelopers}
        selectedDeveloperId={selectedDeveloperId}
        setSelectedDeveloperId={setSelectedDeveloperId}
        newRole={newRole}
        setNewRole={setNewRole}
        newResponsibilities={newResponsibilities}
        setNewResponsibilities={setNewResponsibilities}
        onAddDeveloper={handleAddDeveloper}
        onRemoveDeveloper={handleRemoveDeveloper}
      />
    </div>
  );
};

export default ProjectsPage;
