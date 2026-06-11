import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  Edit2,
  ArrowLeft,
  Calendar,
  Flag,
  Search,
  Filter,
  LogOut,
  Settings,
  Tag,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { Spinner } from '@/components/ui/spinner';
import { toast, Toaster } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { hasAnyAdminCapability } from '@/lib/adminCaps';
import { apiFetch } from '@/lib/api';
import { invalidateProjectScope } from '@/lib/invalidations';
import { parseLocalDate } from '@/lib/dateUtils';
import { toastErrorHandler } from '@/lib/mutationToast';
import { useConfirm } from '@/components/ui/confirm-dialog';

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
  created_at: string;
}

interface ProjectSummary {
  id: number;
  name: string;
}

interface Developer {
  id: number;
  name: string;
}

interface ProjectDetailResponse {
  developers?: Developer[];
}

const PersonalTasksPage = () => {
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'todo' | 'done'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'priority'>('priority');
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
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    project_id: '',
    estimated_hours: '',
  });

  const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
    critical: { color: '#EF4444', label: 'Critical' },
    high: { color: '#F97316', label: 'High' },
    medium: { color: '#F59E0B', label: 'Medium' },
    low: { color: '#737373', label: 'Low' },
  };

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
    mutationFn: () =>
      apiFetch<PersonalTask>('/api/personal-tasks/', {
        method: 'POST',
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          due_date: newTask.due_date || undefined,
          estimated_hours: newTask.estimated_hours ? parseInt(newTask.estimated_hours) : 0,
        }),
      }),
    onSuccess: () => {
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        due_date: '',
        project_id: '',
        estimated_hours: '',
      });
      setMemberLookupProjectId('');
      setShowAddDialog(false);
      toast.success('Task created!');
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
    setNewTask({
      title: '',
      description: '',
      priority: 'medium',
      due_date: '',
      project_id: '',
      estimated_hours: '',
    });
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

  // Filter and sort tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    const notConverted = !t.is_converted;
    return matchesSearch && matchesStatus && notConverted;
  });

  if (sortBy === 'date-asc') {
    filteredTasks.sort((a, b) => {
      // Completed tasks always last
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return (
        new Date(a.due_date || '9999-12-31').getTime() -
        new Date(b.due_date || '9999-12-31').getTime()
      );
    });
  } else if (sortBy === 'date-desc') {
    filteredTasks.sort((a, b) => {
      // Completed tasks always last
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      return (
        new Date(b.due_date || '9999-12-31').getTime() -
        new Date(a.due_date || '9999-12-31').getTime()
      );
    });
  } else if (sortBy === 'priority') {
    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    filteredTasks.sort((a, b) => {
      // Completed tasks always last
      if (a.status === 'done' && b.status !== 'done') return 1;
      if (a.status !== 'done' && b.status === 'done') return -1;
      const aPriority = priorityOrder[a.priority?.toLowerCase() || 'medium'] ?? 999;
      const bPriority = priorityOrder[b.priority?.toLowerCase() || 'medium'] ?? 999;
      return aPriority - bPriority;
    });
  }

  const stats = {
    total: tasks.filter((t) => !t.is_converted).length,
    completed: tasks.filter((t) => t.status === 'done' && !t.is_converted).length,
    pending: tasks.filter((t) => t.status !== 'done' && !t.is_converted).length,
  };

  const isCreating = createMutation.isPending;
  const isUpdating = updateMutation.isPending;
  const isConverting = convertMutation.isPending;

  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
      <Toaster position="top-right" theme="dark" richColors />
      {confirmDialog}

      {/* Header */}
      <header className="border-b border-[rgba(255,255,255,0.05)] bg-[#080808]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Personal Tasks</h1>
              <p className="text-xs text-[#737373] font-medium">Manage your personal tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2 mr-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center text-[#080808] text-sm font-medium">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-[#a3a3a3] hidden md:block">{user.name}</span>
              </div>
            )}
            {/* Admin nav link visibility uses the same admin-cap set as the
                /admin route guard (RequireAnyAdminCapability in App.tsx).
                Keeps link + route in sync via lib/adminCaps.ts. */}
            {hasAnyAdminCapability(can) && (
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
          </div>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-8 py-8">
        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total Tasks', value: stats.total, color: '#E0B954' },
            { label: 'Pending', value: stats.pending, color: '#F59E0B' },
            { label: 'Completed', value: stats.completed, color: '#34D399' },
          ].map((stat) => (
            <div key={stat.label} className="relative group">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[rgba(224,185,84,0.08)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative bg-[rgba(255,255,255,0.025)] border border-[rgba(255,255,255,0.05)] rounded-2xl p-5 transition-all duration-300 group-hover:border-[rgba(224,185,84,0.2)]">
                <div className="text-sm text-[#737373] font-medium mb-2">{stat.label}</div>
                <div className="text-3xl font-bold" style={{ color: stat.color }}>
                  {stat.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-5 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 flex flex-col md:flex-row gap-3 w-full md:w-auto">
              {/* Search */}
              <div className="relative flex-1 md:flex-initial md:w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] rounded-lg h-10 text-sm focus:border-[#E0B954]/50"
                />
              </div>

              {/* Filter */}
              <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
                <SelectTrigger className="w-full md:w-40 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] h-10">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[rgba(255,255,255,0.07)]">
                  <SelectItem value="all">All Tasks</SelectItem>
                  <SelectItem value="todo">Pending</SelectItem>
                  <SelectItem value="done">Completed</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-full md:w-40 bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.07)] text-[#F4F6FF] h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-[rgba(255,255,255,0.07)]">
                  <SelectItem value="date-desc">Newest First</SelectItem>
                  <SelectItem value="date-asc">Oldest First</SelectItem>
                  <SelectItem value="priority">By Priority</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={() => {
                resetForm();
                setShowAddDialog(true);
              }}
              className="w-full md:w-auto bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          </div>
        </div>

        {/* Task List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="sm" className="w-6 h-6" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-center py-20">
            <CheckCircle2 className="w-12 h-12 text-[#E0B954]/30 mx-auto mb-3" />
            <p className="text-[#737373]">
              {tasks.length === 0
                ? 'No tasks yet. Create one to get started!'
                : 'No tasks match your filters.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={`group relative bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-4 transition-all duration-300 hover:border-[rgba(224,185,84,0.2)] hover:bg-[rgba(255,255,255,0.035)] ${
                  task.status === 'done' ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleTaskComplete(task)}
                    className="flex-shrink-0 mt-1 text-[#737373] hover:text-[#E0B954] transition-colors"
                    title={task.status === 'done' ? 'Mark as pending' : 'Mark as complete'}
                  >
                    {task.status === 'done' ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className={`font-semibold text-white ${task.status === 'done' ? 'line-through text-[#737373]' : ''}`}
                    >
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-sm text-[#a3a3a3] mt-1 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {task.due_date && (
                        <div className="flex items-center gap-1 text-xs text-[#737373]">
                          <Calendar className="w-3 h-3" />
                          {new Date(task.due_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      )}
                      {task.estimated_hours > 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-[rgba(255,255,255,0.05)] border-[rgba(255,255,255,0.1)]"
                        >
                          {task.estimated_hours}h
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{
                          borderColor: PRIORITY_CONFIG[task.priority]?.color + '40',
                          color: PRIORITY_CONFIG[task.priority]?.color,
                          backgroundColor: PRIORITY_CONFIG[task.priority]?.color + '15',
                        }}
                      >
                        <Flag className="w-3 h-3 mr-1" />
                        {PRIORITY_CONFIG[task.priority]?.label}
                      </Badge>
                      {task.is_converted && (
                        <Badge className="text-xs bg-[#34D399]/20 text-[#34D399] border-0">
                          Converted
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {!task.is_converted && (
                    <div className="flex-shrink-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {can('project.assign_personal_task') && (
                        <button
                          onClick={() => {
                            setConvertingTask(task);
                            setConvertProjectId('');
                            setConvertAssigneeId('');
                            setMemberLookupProjectId('');
                            setShowConvertDialog(true);
                          }}
                          className="p-2 rounded-lg hover:bg-[rgba(224,185,84,0.1)] text-[#737373] hover:text-[#E0B954] transition-colors"
                          title="Tag to project"
                        >
                          <Tag className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(task)}
                        className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.08)] text-[#737373] hover:text-[#E0B954] transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-[#737373] hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Task Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
          <DialogHeader>
            <DialogTitle>Create Personal Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Title *</label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="What needs to be done?"
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Description</label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Add details..."
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white resize-none"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#737373] mb-1 block">Priority</label>
                <Select
                  value={newTask.priority}
                  onValueChange={(v) => setNewTask({ ...newTask, priority: v })}
                >
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#737373] mb-1 block">Due Date</label>
                <Popover open={showDatePickerAdd} onOpenChange={setShowDatePickerAdd}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white h-10"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {newTask.due_date
                        ? parseLocalDate(newTask.due_date)?.toLocaleDateString()
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    <CalendarIcon
                      mode="single"
                      selected={parseLocalDate(newTask.due_date)}
                      onSelect={(date) => {
                        if (date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const localDate = `${year}-${month}-${day}`;
                          setNewTask({ ...newTask, due_date: localDate });
                          setShowDatePickerAdd(false);
                        }
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      classNames={{
                        months: 'flex flex-col',
                        month: 'space-y-4',
                        caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                        caption_label: 'text-sm font-medium text-white',
                        nav: 'space-x-1 flex items-center',
                        nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                        nav_button_previous: 'absolute left-0',
                        nav_button_next: 'absolute right-0',
                        table: 'w-full border-collapse space-y-1',
                        head_row: 'flex',
                        head_cell: 'text-white rounded-md w-9 font-normal text-[0.8rem]',
                        row: 'flex w-full mt-2',
                        cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-900/20 [&:has([aria-selected])]:bg-slate-900 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                        day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md text-white hover:bg-[rgba(224,185,84,0.2)]',
                        day_range_end: 'day-range-end',
                        day_selected:
                          'bg-[#E0B954] text-black hover:bg-[#E0B954] hover:text-black focus:bg-[#E0B954] focus:text-black',
                        day_today: 'bg-[rgba(224,185,84,0.2)] text-white',
                        day_outside:
                          'day-outside text-slate-500 aria-selected:bg-slate-900/20 aria-selected:text-slate-400',
                        day_disabled: 'text-slate-500',
                        day_range_middle: 'aria-selected:bg-slate-900 aria-selected:text-white',
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div>
              <label className="text-xs text-[#737373] mb-1 block">
                Project <span className="text-[#555]">(optional)</span>
              </label>
              <Select
                value={newTask.project_id}
                onValueChange={(v) => {
                  setNewTask({ ...newTask, project_id: v });
                  setMemberLookupProjectId(v);
                }}
              >
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white h-10">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {newTask.project_id && (
              <div>
                <label className="text-xs text-[#737373] mb-1 block">
                  Estimated Hours <span className="text-[#555]">(optional)</span>
                </label>
                <Input
                  value={newTask.estimated_hours}
                  onChange={(e) => setNewTask({ ...newTask, estimated_hours: e.target.value })}
                  className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white placeholder-[#444]"
                />
              </div>
            )}
            <Button
              onClick={createTask}
              disabled={isCreating || !newTask.title.trim()}
              className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
            >
              {isCreating ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
          <DialogHeader>
            <DialogTitle>Edit Personal Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Title *</label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                placeholder="What needs to be done?"
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Description</label>
              <Textarea
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Add details..."
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white resize-none"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#737373] mb-1 block">Priority</label>
                <Select
                  value={newTask.priority}
                  onValueChange={(v) => setNewTask({ ...newTask, priority: v })}
                >
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-[#737373] mb-1 block">Due Date</label>
                <Popover open={showDatePickerEdit} onOpenChange={setShowDatePickerEdit}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white h-10"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {newTask.due_date
                        ? parseLocalDate(newTask.due_date)?.toLocaleDateString()
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    <CalendarIcon
                      mode="single"
                      selected={parseLocalDate(newTask.due_date)}
                      onSelect={(date) => {
                        if (date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const localDate = `${year}-${month}-${day}`;
                          setNewTask({ ...newTask, due_date: localDate });
                          setShowDatePickerEdit(false);
                        }
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      classNames={{
                        months: 'flex flex-col',
                        month: 'space-y-4',
                        caption: 'flex justify-between items-center px-0 pb-4 relative h-7 mb-2',
                        caption_label: 'text-sm font-medium text-white',
                        nav: 'space-x-1 flex items-center',
                        nav_button: 'text-white hover:bg-[rgba(224,185,84,0.1)] rounded p-1',
                        nav_button_previous: 'absolute left-0',
                        nav_button_next: 'absolute right-0',
                        table: 'w-full border-collapse space-y-1',
                        head_row: 'flex',
                        head_cell: 'text-white rounded-md w-9 font-normal text-[0.8rem]',
                        row: 'flex w-full mt-2',
                        cell: 'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-900/20 [&:has([aria-selected])]:bg-slate-900 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                        day: 'h-9 w-9 p-0 font-normal aria-selected:opacity-100 rounded-md text-white hover:bg-[rgba(224,185,84,0.2)]',
                        day_range_end: 'day-range-end',
                        day_selected:
                          'bg-[#E0B954] text-black hover:bg-[#E0B954] hover:text-black focus:bg-[#E0B954] focus:text-black',
                        day_today: 'bg-[rgba(224,185,84,0.2)] text-white',
                        day_outside:
                          'day-outside text-slate-500 aria-selected:bg-slate-900/20 aria-selected:text-slate-400',
                        day_disabled: 'text-slate-500',
                        day_range_middle: 'aria-selected:bg-slate-900 aria-selected:text-white',
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={updateTask}
                disabled={isUpdating}
                className="flex-1 bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
              >
                {isUpdating ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                onClick={resetForm}
                disabled={isUpdating}
                variant="outline"
                className="flex-1 bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to Project Ticket Dialog */}
      <Dialog
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
      >
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
          <DialogHeader>
            <DialogTitle>Tag to Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {convertingTask && (
              <div className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)]">
                <p className="text-sm text-[#a3a3a3]">
                  <span className="font-semibold text-white">{convertingTask.title}</span>
                </p>
              </div>
            )}
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Select Project</label>
              <Select
                value={convertProjectId}
                onValueChange={(v) => {
                  setConvertProjectId(v);
                  setMemberLookupProjectId(v);
                }}
              >
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-[#737373] mb-1 block">Estimated Hours</label>
              <Input
                value={convertEstimatedHours}
                onChange={(e) => setConvertEstimatedHours(e.target.value)}
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            {convertProjectId && (
              <div>
                <label className="text-xs text-[#737373] mb-1 block">
                  Assign To <span className="text-[#555]">(optional)</span>
                </label>
                <Select value={convertAssigneeId} onValueChange={setConvertAssigneeId}>
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                    <SelectValue placeholder="Select team member..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
                    {projectMembers.length === 0 ? (
                      <div className="p-2 text-xs text-[#737373]">
                        No team members in this project
                      </div>
                    ) : (
                      projectMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id.toString()}>
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center text-[#080808] text-xs font-bold">
                              {member.name.charAt(0).toUpperCase()}
                            </div>
                            {member.name}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              onClick={convertToTicket}
              disabled={isConverting || !convertProjectId}
              className="w-full bg-gradient-to-r from-[#E0B954] to-[#C79E3B] text-[#080808] font-semibold hover:opacity-90"
            >
              {isConverting ? 'Creating...' : 'Create Project Ticket'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PersonalTasksPage;
