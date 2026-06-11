import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/config/api';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import type { PersonalTask, Project, NewTaskForm, EditTaskForm } from '../types';

const EMPTY_NEW_TASK: NewTaskForm = {
  title: '',
  description: '',
  priority: 'medium',
  due_date: '',
  project_id: '',
  estimated_hours: '',
};

const EMPTY_EDIT_FORM: EditTaskForm = {
  title: '',
  description: '',
  priority: 'medium',
  due_date: '',
};

export const usePersonalTasksData = (token: string, confirm: ConfirmFn) => {
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
  const [newTask, setNewTask] = useState<NewTaskForm>({ ...EMPTY_NEW_TASK });
  const [editForm, setEditForm] = useState<EditTaskForm>({ ...EMPTY_EDIT_FORM });
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
        setNewTask({ ...EMPTY_NEW_TASK });
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
        setEditForm({ ...EMPTY_EDIT_FORM });
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
    setEditForm({ ...EMPTY_EDIT_FORM });
  };

  const activeTasks = tasks.filter((t) => !t.is_converted);
  const convertedTasks = tasks.filter((t) => t.is_converted);

  return {
    projects,
    loading,
    showAddDialog,
    setShowAddDialog,
    showConvertDialog,
    setShowConvertDialog,
    selectedTask,
    setSelectedTask,
    showCalendar,
    setShowCalendar,
    isEditing,
    editingTask,
    showCalendarEdit,
    setShowCalendarEdit,
    newTask,
    setNewTask,
    editForm,
    setEditForm,
    convertProjectId,
    setConvertProjectId,
    convertEstimatedHours,
    setConvertEstimatedHours,
    convertAssigneeId,
    setConvertAssigneeId,
    projectMembers,
    setProjectMembers,
    fetchProjectMembers,
    createTask,
    convertToTicket,
    deleteTask,
    updateTask,
    startEdit,
    cancelEdit,
    activeTasks,
    convertedTasks,
  };
};
