import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon } from '@/components/ui/calendar';
import { API_BASE_URL } from '@/config/api';
import {
  Plus,
  Briefcase,
  CheckCircle2,
  Calendar,
  ArrowRight,
  Loader2,
  Trash2,
  Edit2,
} from 'lucide-react';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/dateUtils';
import { useConfirm } from '@/components/ui/confirm-dialog';

interface PersonalTask {
  id: number;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimated_hours: number;
  due_date?: string;
  tags: string[];
  is_converted: boolean;
  project_id?: number;
  work_item_id?: number;
  created_at: string;
}

interface Project {
  id: number;
  name: string;
  key_prefix: string;
}

interface PersonalTasksProps {
  token: string;
}

export default function PersonalTasks({ token }: PersonalTasksProps) {
  const { confirm, confirmDialog } = useConfirm();
  const [tasks, setTasks] = useState<PersonalTask[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<PersonalTask | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [showCalendarEdit, setShowCalendarEdit] = useState(false);

  // Form states
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium',
    due_date: '',
    project_id: '',
    estimated_hours: '',
  });
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    due_date: '',
  });
  const [convertProjectId, setConvertProjectId] = useState('');
  const [convertEstimatedHours, setConvertEstimatedHours] = useState('');
  const [convertAssigneeId, setConvertAssigneeId] = useState('');
  const [projectMembers, setProjectMembers] = useState<any[]>([]);

  useEffect(() => {
    fetchTasks();
    fetchProjects();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/personal-tasks/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTasks(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch personal tasks:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const fetchProjectMembers = async (projectId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProjectMembers(data.developers || []);
      }
    } catch (err) {
      setProjectMembers([]);
    }
  };

  const createTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/personal-tasks/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          due_date: newTask.due_date || undefined,
          estimated_hours: newTask.estimated_hours ? parseInt(newTask.estimated_hours) : 0,
        }),
      });

      if (res.ok) {
        toast.success('Task created successfully');
        setShowAddDialog(false);
        setNewTask({
          title: '',
          description: '',
          priority: 'medium',
          due_date: '',
          project_id: '',
          estimated_hours: '',
        });
        fetchTasks();
      } else {
        toast.error('Failed to create task');
      }
    } catch (err) {
      toast.error('Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  const convertToTicket = async () => {
    if (!selectedTask || !convertProjectId) return;

    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/personal-tasks/${selectedTask.id}/convert-to-ticket`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            project_id: parseInt(convertProjectId),
            type: 'task',
            estimated_hours: convertEstimatedHours
              ? parseInt(convertEstimatedHours)
              : selectedTask.estimated_hours,
          }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        toast.success(`Converted to ${data.work_item.key}`);
        setShowConvertDialog(false);
        setSelectedTask(null);
        setConvertProjectId('');
        setConvertEstimatedHours('');
        fetchTasks();
      } else {
        toast.error('Failed to convert task');
      }
    } catch (err) {
      toast.error('Failed to convert task');
    } finally {
      setLoading(false);
    }
  };

  const deleteTask = async (taskId: number) => {
    if (
      !(await confirm({
        title: 'Delete task?',
        description: 'Are you sure you want to delete this task?',
        destructive: true,
        confirmText: 'Delete',
      }))
    )
      return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/personal-tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        toast.success('Task deleted');
        fetchTasks();
      }
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  const updateTask = async () => {
    if (!editingTask) return;
    if (!editForm.title.trim()) {
      toast.error('Title is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/personal-tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          priority: editForm.priority,
          due_date: editForm.due_date || null,
        }),
      });

      if (res.ok) {
        toast.success('Task updated successfully');
        setIsEditing(false);
        setEditingTask(null);
        setEditForm({ title: '', description: '', priority: 'medium', due_date: '' });
        fetchTasks();
      } else {
        toast.error('Failed to update task');
      }
    } catch (err) {
      toast.error('Failed to update task');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (task: PersonalTask) => {
    setEditingTask(task);
    setEditForm({
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_date: task.due_date || '',
    });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditingTask(null);
    setEditForm({ title: '', description: '', priority: 'medium', due_date: '' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
        return 'bg-green-500/20 text-green-400';
      case 'in_progress':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500/20 text-red-400';
      case 'high':
        return 'bg-orange-500/20 text-orange-400';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const activeTasks = tasks.filter((t) => !t.is_converted);
  const convertedTasks = tasks.filter((t) => t.is_converted);

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      {confirmDialog}
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-white flex items-center gap-2">
          <Briefcase className="w-5 h-5" />
          My Personal Tasks
        </CardTitle>
        <Dialog
          open={showAddDialog}
          onOpenChange={(open) => {
            setShowAddDialog(open);
            if (!open)
              setNewTask({
                title: '',
                description: '',
                priority: 'medium',
                due_date: '',
                project_id: '',
                estimated_hours: '',
              });
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" className="bg-[#E0B954] hover:bg-[#C79E3B] text-black">
              <Plus className="w-4 h-4 mr-1" />
              Add Task
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
            <DialogHeader>
              <DialogTitle>Create Personal Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-sm text-[#737373]">Title</label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                  placeholder="What needs to be done?"
                  className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
                />
              </div>
              <div>
                <label className="text-sm text-[#737373]">Description</label>
                <Textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                  placeholder="Add details..."
                  className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-[#737373]">Priority</label>
                  <Select
                    value={newTask.priority}
                    onValueChange={(v) => setNewTask({ ...newTask, priority: v })}
                  >
                    <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
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
                  <label className="text-sm text-[#737373]">Due Date</label>
                  <Popover open={showCalendar} onOpenChange={setShowCalendar}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white justify-start text-left font-normal hover:bg-[#0A0A14] hover:text-white"
                      >
                        {newTask.due_date
                          ? parseLocalDate(newTask.due_date)?.toLocaleDateString()
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="bottom"
                      align="start"
                      className="w-auto p-3 bg-[#0d0d0d] border border-[rgba(224,185,84,0.2)]"
                    >
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
                            setShowCalendar(false);
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
                          head_cell:
                            'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                          row: 'flex w-full gap-1',
                          cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                          day: 'h-8 w-8 p-0 font-normal',
                          day_button:
                            'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                          day_selected:
                            'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                          day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                          day_outside: 'text-[#444]',
                          day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                          day_range_middle:
                            'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                          day_hidden: 'invisible',
                        }}
                      />
                    </PopoverContent>
                  </Popover>{' '}
                </div>{' '}
              </div>
              <div>
                <label className="text-sm text-[#737373]">Project</label>
                <Select
                  value={newTask.project_id}
                  onValueChange={(v) => setNewTask({ ...newTask, project_id: v })}
                >
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    <SelectItem value="">None</SelectItem>
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
                  <label className="text-sm text-[#737373]">Estimated Hours</label>
                  <Input
                    value={newTask.estimated_hours}
                    onChange={(e) => setNewTask({ ...newTask, estimated_hours: e.target.value })}
                    className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white placeholder-[#444]"
                  />
                </div>
              )}
              <Button
                onClick={createTask}
                disabled={loading}
                className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-black"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Task'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {/* Active Tasks */}
        <div className="space-y-3">
          {activeTasks.length === 0 ? (
            <div className="text-center py-8 text-[#737373]">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No personal tasks yet</p>
              <p className="text-sm">Create a task to get started</p>
            </div>
          ) : (
            activeTasks.map((task) => (
              <div
                key={task.id}
                className="p-4 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)] hover:border-[rgba(255,255,255,0.1)] transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-white font-medium mb-1">{task.title}</h4>
                    {task.description && (
                      <p className="text-[#737373] text-sm mb-2 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
                      <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                      {task.estimated_hours > 0 && (
                        <span className="text-[#737373] text-xs">{task.estimated_hours}h</span>
                      )}
                      {task.due_date && (
                        <span className="text-[#737373] text-xs flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {parseLocalDate(task.due_date)?.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(task)}
                      className="text-[#E0B954] hover:text-[#C79E3B] hover:bg-[#E0B954]/10"
                    >
                      <Edit2 className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTask(task);
                        setShowConvertDialog(true);
                      }}
                      className="text-[#E0B954] hover:text-[#C79E3B] hover:bg-[#E0B954]/10"
                    >
                      <ArrowRight className="w-4 h-4 mr-1" />
                      Convert
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTask(task.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Converted Tasks */}
        {convertedTasks.length > 0 && (
          <div className="mt-6 pt-6 border-t border-[rgba(255,255,255,0.05)]">
            <h4 className="text-[#737373] text-sm font-medium mb-3">
              Converted to Project Tickets
            </h4>
            <div className="space-y-2">
              {convertedTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 bg-[#0A0A14] rounded-lg border border-[rgba(255,255,255,0.05)] opacity-60"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-white line-through">{task.title}</span>
                    <Badge className="bg-green-500/20 text-green-400">Converted</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* Convert Dialog */}
      <Dialog
        open={showConvertDialog}
        onOpenChange={(open) => {
          setShowConvertDialog(open);
          if (!open) {
            setConvertProjectId('');
            setConvertEstimatedHours('');
          }
        }}
      >
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
          <DialogHeader>
            <DialogTitle>Convert to Project Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {selectedTask && (
              <div className="p-3 bg-[#0A0A14] rounded border border-[rgba(255,255,255,0.05)]">
                <p className="text-white font-medium">{selectedTask.title}</p>
                <p className="text-[#737373] text-sm">{selectedTask.priority}</p>
              </div>
            )}
            <div>
              <label className="text-sm text-[#737373]">Select Project</label>
              <Select
                value={convertProjectId}
                onValueChange={(v) => {
                  setConvertProjectId(v);
                  setConvertAssigneeId('');
                  if (v) fetchProjectMembers(v);
                  else setProjectMembers([]);
                }}
              >
                <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
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
            <div>
              <label className="text-sm text-[#737373]">Estimated Hours</label>
              <Input
                value={convertEstimatedHours}
                onChange={(e) => setConvertEstimatedHours(e.target.value)}
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            {convertProjectId && (
              <div>
                <label className="text-sm text-[#737373]">Assign To (optional)</label>
                <Select value={convertAssigneeId} onValueChange={setConvertAssigneeId}>
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
                    <SelectValue placeholder="Select team member..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    {projectMembers.length === 0 ? (
                      <div className="p-2 text-xs text-[#737373]">
                        No team members in this project
                      </div>
                    ) : (
                      projectMembers.map((member) => (
                        <SelectItem key={member.id} value={member.id.toString()}>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#E0B954] to-[#C79E3B] flex items-center justify-center text-[#080808] text-xs font-bold">
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
              disabled={loading || !convertProjectId}
              className="w-full bg-[#E0B954] hover:bg-[#C79E3B] text-black"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Convert to Ticket'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={isEditing}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
      >
        <DialogContent className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)] text-white">
          <DialogHeader>
            <DialogTitle>Edit Personal Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm text-[#737373]">Title</label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="What needs to be done?"
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-[#737373]">Description</label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Add more details..."
                className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-[#737373]">Priority</label>
                <Select
                  value={editForm.priority}
                  onValueChange={(value: any) => setEditForm({ ...editForm, priority: value })}
                >
                  <SelectTrigger className="bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white">
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
                <label className="text-sm text-[#737373]">Due Date</label>
                <Popover open={showCalendarEdit} onOpenChange={setShowCalendarEdit}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {editForm.due_date
                        ? parseLocalDate(editForm.due_date)?.toLocaleDateString()
                        : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-[#0A0A14] border-[rgba(255,255,255,0.08)]">
                    <CalendarIcon
                      mode="single"
                      selected={parseLocalDate(editForm.due_date)}
                      onSelect={(date) => {
                        if (date) {
                          const year = date.getFullYear();
                          const month = String(date.getMonth() + 1).padStart(2, '0');
                          const day = String(date.getDate()).padStart(2, '0');
                          const localDate = `${year}-${month}-${day}`;
                          setEditForm({ ...editForm, due_date: localDate });
                          setShowCalendarEdit(false);
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
                        head_cell:
                          'text-xs font-medium text-[#737373] w-8 h-8 flex items-center justify-center rounded',
                        row: 'flex w-full gap-1',
                        cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-transparent',
                        day: 'h-8 w-8 p-0 font-normal',
                        day_button:
                          'text-white hover:bg-[rgba(224,185,84,0.1)] rounded-lg h-8 w-8 transition-colors',
                        day_selected:
                          'bg-[#E0B954] text-[#0d0d0d] hover:bg-[#E0B954] font-semibold',
                        day_today: 'bg-[rgba(224,185,84,0.2)] text-[#E0B954] font-semibold',
                        day_outside: 'text-[#444]',
                        day_disabled: 'text-[#333] opacity-50 cursor-not-allowed',
                        day_range_middle:
                          'aria-selected:bg-[rgba(224,185,84,0.1)] aria-selected:text-white',
                        day_hidden: 'invisible',
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                onClick={updateTask}
                disabled={loading}
                className="flex-1 bg-[#E0B954] hover:bg-[#C79E3B] text-black"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </Button>
              <Button
                onClick={cancelEdit}
                disabled={loading}
                variant="outline"
                className="flex-1 bg-[#0A0A14] border-[rgba(255,255,255,0.08)] text-white hover:bg-[#0A0A14] hover:text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
