import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/config/api';
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

    // Projects state
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Create project modal
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState<CreateProjectForm>({ name: '', description: '', github_repo_url: '' });
    const [isCreating, setIsCreating] = useState(false);
    const [availableDevelopers, setAvailableDevelopers] = useState<Developer[]>([]);
    const [selectedDevelopers, setSelectedDevelopers] = useState<SelectedDeveloper[]>([]);
    const [selectedDeveloperId, setSelectedDeveloperId] = useState<string>('');
    const [newRole, setNewRole] = useState('');
    const [newResponsibilities, setNewResponsibilities] = useState('');

    // My Tasks
    const [myTasks, setMyTasks] = useState<MyTask[]>([]);
    const [myTaskTab, setMyTaskTab] = useState<'upcoming' | 'overdue' | 'completed' | 'personal'>('upcoming');
    const [myTasksLoading, setMyTasksLoading] = useState(false);
    const [showAllTasks, setShowAllTasks] = useState(false);
    const [selectedTask, setSelectedTask] = useState<MyTask | null>(null);

    // Personal Tasks
    const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
    const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
    const [showCalendarAddTask, setShowCalendarAddTask] = useState(false);
    const [showConvertDialog, setShowConvertDialog] = useState(false);
    const [convertingTask, setConvertingTask] = useState<PersonalTask | null>(null);
    const [convertProjectId, setConvertProjectId] = useState('');
    const [convertAssigneeId, setConvertAssigneeId] = useState('');
    const [convertEstimatedHours, setConvertEstimatedHours] = useState('');
    const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
    const [addingTask, setAddingTask] = useState(false);
    const [convertingTicket, setConvertingTicket] = useState(false);
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
        title: '', description: '', priority: 'medium', due_date: '',
    });

    // Quick Notes
    const [notepadContent, setNotepadContent] = useState('');
    const [notepadSaved, setNotepadSaved] = useState(true);
    const [notepadOpen, setNotepadOpen] = useState(false);

    // ---------- Data fetching ----------

    const fetchProjects = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/projects/`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) setProjects(await response.json());
        } catch (err) {
            console.error('Failed to fetch projects:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDevelopers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/developers/`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) setAvailableDevelopers(await response.json());
        } catch (err) {
            console.error('Failed to fetch developers:', err);
        }
    };

    const fetchPersonalTasks = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/personal-tasks/`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) setPersonalTasks(await res.json());
        } catch (err) {
            console.error('Failed to fetch personal tasks:', err);
        }
    };

    const fetchMyTasks = async () => {
        setMyTasksLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/workitems/my-tasks`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) setMyTasks(await res.json());
        } catch (err) {
            console.error('Failed to fetch my tasks:', err);
        } finally {
            setMyTasksLoading(false);
        }
    };

    const fetchProjectMembers = async (projectId: string) => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setProjectMembers(data.developers || []);
            }
        } catch {
            setProjectMembers([]);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        if (showCreateModal) fetchDevelopers();
    }, [showCreateModal]);

    useEffect(() => {
        if (token) { fetchMyTasks(); fetchPersonalTasks(); }
    }, [token]);

    // Notepad — load from localStorage per user
    useEffect(() => {
        if (user?.id) {
            const saved = localStorage.getItem(`notepad_${user.id}`);
            if (saved !== null) setNotepadContent(saved);
        }
    }, [user?.id]);

    // Notepad — auto-save with debounce
    useEffect(() => {
        if (!user?.id) return;
        setNotepadSaved(false);
        const timer = setTimeout(() => {
            localStorage.setItem(`notepad_${user.id}`, notepadContent);
            setNotepadSaved(true);
        }, 800);
        return () => clearTimeout(timer);
    }, [notepadContent]);

    // ---------- Personal task actions ----------

    const createPersonalTask = async () => {
        if (!newPersonalTask.title.trim()) { toast.error('Title is required'); return; }
        setAddingTask(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/personal-tasks/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    title: newPersonalTask.title,
                    description: newPersonalTask.description,
                    priority: newPersonalTask.priority,
                    due_date: newPersonalTask.due_date || undefined,
                    estimated_hours: newPersonalTask.estimated_hours ? parseInt(newPersonalTask.estimated_hours) : 0,
                }),
            });
            if (res.ok) {
                const createdTask = await res.json();
                if (newPersonalTask.project_id) {
                    await fetch(`${API_BASE_URL}/api/personal-tasks/${createdTask.id}/convert-to-ticket`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({
                            project_id: parseInt(newPersonalTask.project_id),
                            assignee_developer_id: newPersonalTask.assignee_developer_id ? parseInt(newPersonalTask.assignee_developer_id) : undefined,
                        }),
                    });
                }
                toast.success('Task created!');
                setShowAddTaskDialog(false);
                setNewPersonalTask({ title: '', description: '', priority: 'medium', due_date: '', project_id: '', assignee_developer_id: '', estimated_hours: '' });
                setProjectMembers([]);
                setPersonalTasks(prev => [...prev, createdTask]);
                if (!newPersonalTask.project_id) setMyTaskTab('personal');
                fetchPersonalTasks();
            } else {
                toast.error('Failed to create task');
            }
        } catch {
            toast.error('Failed to create task');
        } finally {
            setAddingTask(false);
        }
    };

    const convertToTicket = async () => {
        if (!convertingTask || !convertProjectId) return;
        setConvertingTicket(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/personal-tasks/${convertingTask.id}/convert-to-ticket`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    project_id: parseInt(convertProjectId),
                    type: 'task',
                    estimated_hours: convertEstimatedHours ? parseInt(convertEstimatedHours) : convertingTask.estimated_hours,
                    assignee_developer_id: convertAssigneeId ? parseInt(convertAssigneeId) : undefined,
                }),
            });
            if (res.ok) {
                const data = await res.json();
                const assigneeName = data.work_item.assignee_name ? ` → assigned to ${data.work_item.assignee_name}` : '';
                toast.success(`Ticket ${data.work_item.key} created!${assigneeName}`);
                setShowConvertDialog(false);
                setConvertingTask(null);
                setConvertProjectId('');
                setConvertAssigneeId('');
                setConvertEstimatedHours('');
                setProjectMembers([]);
                fetchPersonalTasks();
            } else {
                toast.error('Failed to convert');
            }
        } catch {
            toast.error('Failed to convert');
        } finally {
            setConvertingTicket(false);
        }
    };

    const deletePersonalTask = async (taskId: number) => {
        if (!confirm('Delete this task?')) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/personal-tasks/${taskId}`, {
                method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
            });
            if (res.ok) { toast.success('Task deleted'); fetchPersonalTasks(); }
        } catch {
            toast.error('Failed to delete task');
        }
    };

    const updatePersonalTask = async () => {
        if (!editingPersonalTask) return;
        if (!editPersonalTaskForm.title.trim()) { toast.error('Title is required'); return; }
        setAddingTask(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/personal-tasks/${editingPersonalTask.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    title: editPersonalTaskForm.title,
                    description: editPersonalTaskForm.description,
                    priority: editPersonalTaskForm.priority,
                    due_date: editPersonalTaskForm.due_date || null,
                }),
            });
            if (res.ok) {
                toast.success('Task updated successfully');
                cancelEditPersonalTask();
                fetchPersonalTasks();
            } else {
                toast.error('Failed to update task');
            }
        } catch {
            toast.error('Failed to update task');
        } finally {
            setAddingTask(false);
        }
    };

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

    const togglePersonalTaskComplete = async (task: PersonalTask) => {
        if (task.is_converted) { toast.error('Cannot modify a converted task'); return; }
        const newStatus = task.status === 'done' ? 'todo' : 'done';
        try {
            const res = await fetch(`${API_BASE_URL}/api/personal-tasks/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) {
                setPersonalTasks(personalTasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
                toast.success(newStatus === 'done' ? 'Task completed! 🎉' : 'Task reopened');
            } else {
                toast.error('Failed to update task');
            }
        } catch {
            toast.error('Failed to update task');
        }
    };

    const handleAddDeveloper = () => {
        if (!selectedDeveloperId || !newRole.trim()) {
            toast.error('Please select a developer and enter a role');
            return;
        }
        const devId = parseInt(selectedDeveloperId);
        if (selectedDevelopers.find(d => d.developer_id === devId)) {
            toast.error('Developer already added to this project');
            return;
        }
        const developer = availableDevelopers.find(d => d.id === devId);
        setSelectedDevelopers(prev => [...prev, { developer_id: devId, role: newRole, responsibilities: newResponsibilities }]);
        toast.success(`${developer?.name} added as ${newRole}`);
        setSelectedDeveloperId('');
        setNewRole('');
        setNewResponsibilities('');
    };

    const handleRemoveDeveloper = (developerId: number) => {
        setSelectedDevelopers(prev => prev.filter(d => d.developer_id !== developerId));
    };

    const handleCreateProject = async () => {
        if (!createForm.name.trim()) { toast.error('Project name is required'); return; }
        setIsCreating(true);
        const startTime = Date.now();
        try {
            const response = await fetch(`${API_BASE_URL}/api/projects/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    name: createForm.name,
                    description: createForm.description,
                    github_repo_url: createForm.github_repo_url || undefined,
                    developers: selectedDevelopers,
                }),
            });
            if (response.ok) {
                const newProject = await response.json();
                setProjects(prev => [...prev, newProject]);
                setShowCreateModal(false);
                setCreateForm({ name: '', description: '', github_repo_url: '' });
                setSelectedDevelopers([]);
                toast.success('Project created successfully!');
            }
        } catch {
            toast.error('Failed to create project');
        } finally {
            const elapsedTime = Date.now() - startTime;
            const remainingTime = Math.max(0, 300 - elapsedTime);
            setTimeout(() => setIsCreating(false), remainingTime);
        }
    };

    const handleDeleteProject = async (e: React.MouseEvent, projectId: number) => {
        e.stopPropagation();
        if (!confirm('Delete this project and all its work items?')) return;
        try {
            await fetch(`${API_BASE_URL}/api/projects/${projectId}/`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` },
            });
            setProjects(prev => prev.filter(p => p.id !== projectId));
            toast.success('Project deleted');
        } catch {
            toast.error('Failed to delete project');
        }
    };

    const handleTaskChanged = (updated: MyTask) => {
        setMyTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
        setSelectedTask(updated);
    };

    const handleQuickDueDateChange = async (task: MyTask & { is_personal?: boolean }, isoDate: string) => {
        const dueValue = isoDate || null;
        if (task.is_personal) {
            const realId = String(task.id).replace(/^personal-/, '');
            setPersonalTasks(prev => prev.map(p => String(p.id) === realId ? { ...p, due_date: dueValue || undefined } : p));
            try {
                const res = await fetch(`${API_BASE_URL}/api/personal-tasks/${realId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ due_date: dueValue }),
                });
                if (!res.ok) throw new Error();
                toast.success(dueValue ? 'Due date updated' : 'Due date cleared');
            } catch {
                toast.error('Failed to update due date');
            }
        } else {
            let isOverdue = false;
            if (dueValue) {
                const today = new Date(); today.setHours(0, 0, 0, 0);
                const due = new Date(dueValue + 'T00:00:00');
                isOverdue = due < today && task.status !== 'done';
            }
            setMyTasks(prev => prev.map(t => t.id === task.id ? { ...t, due_date: dueValue, is_overdue: isOverdue } : t));
            try {
                const res = await fetch(`${API_BASE_URL}/api/workitems/${task.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ due_date: dueValue }),
                });
                if (!res.ok) throw new Error();
                toast.success(dueValue ? 'Due date updated' : 'Due date cleared');
            } catch {
                toast.error('Failed to update due date');
            }
        }
    };

    const handleChangeMyTaskStatus = async (task: MyTask, newStatus: string) => {
        const previousStatus = task.status;
        setMyTasks(prev => prev.map(t =>
            t.id === task.id
                ? { ...t, status: newStatus, is_overdue: newStatus === 'done' ? false : t.is_overdue }
                : t
        ));
        try {
            const res = await fetch(`${API_BASE_URL}/api/workitems/${task.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error('Failed');
            if (newStatus === 'done') toast.success(`${task.key || 'Task'} completed 🎉`);
        } catch {
            setMyTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: previousStatus } : t));
            toast.error('Failed to update status');
        }
    };

    return (
        <div className="h-screen flex flex-col bg-[#080808] text-[#F4F6FF]">
            <Toaster position="top-right" theme="dark" richColors />

            <AppHeader
                user={user}
                onAdminClick={() => navigate('/admin')}
                onLogout={logout}
            />

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
                            isAdmin={!!user?.role.includes('admin')}
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
                            onConvertPersonalTask={(task) => { setConvertingTask(task); setShowConvertDialog(true); }}
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
                        setNewPersonalTask({ title: '', description: '', priority: 'medium', due_date: '', project_id: '', assignee_developer_id: '', estimated_hours: '' });
                        setProjectMembers([]);
                    }
                }}
                form={newPersonalTask}
                setForm={setNewPersonalTask}
                showCalendar={showCalendarAddTask}
                setShowCalendar={setShowCalendarAddTask}
                projects={projects}
                projectMembers={projectMembers}
                onProjectChange={(projectId) => {
                    setNewPersonalTask({ ...newPersonalTask, project_id: projectId, assignee_developer_id: '' });
                    if (projectId) fetchProjectMembers(projectId); else setProjectMembers([]);
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
                        setProjectMembers([]);
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
                    fetchProjectMembers(projectId);
                }}
                converting={convertingTicket}
                onConvert={convertToTicket}
            />

            <EditPersonalTaskDialog
                open={isEditingPersonalTask}
                onOpenChange={(open) => { if (!open) cancelEditPersonalTask(); }}
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
