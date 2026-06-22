import { useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { hasAnyAdminCapability } from '@/lib/adminCaps';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useState } from 'react';
import PersonalTasksHeader from './sections/PersonalTasksHeader';
import PersonalTasksStatsBar from './sections/PersonalTasksStatsBar';
import PersonalTasksToolbar from './sections/PersonalTasksToolbar';
import PersonalTasksList from './sections/PersonalTasksList';
import AddTaskDialog from './modals/AddTaskDialog';
import EditTaskDialog from './modals/EditTaskDialog';
import ConvertToTicketDialog from './modals/ConvertToTicketDialog';
import { usePersonalTasksData } from './hooks/usePersonalTasksData';
import type { PersonalTask } from './types';

const PersonalTasksPage = () => {
  const navigate = useNavigate();
  const { user, logout, can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'todo' | 'done'>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'priority'>('priority');

  const {
    tasks,
    isLoading,
    projects,
    projectMembers,
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
    setMemberLookupProjectId,
    convertProjectId,
    setConvertProjectId,
    convertAssigneeId,
    setConvertAssigneeId,
    convertEstimatedHours,
    setConvertEstimatedHours,
    newTask,
    setNewTask,
    isCreating,
    isUpdating,
    isConverting,
    toggleTaskComplete,
    createTask,
    updateTask,
    deleteTask,
    convertToTicket,
    resetForm,
    startEdit,
  } = usePersonalTasksData(confirm);

  // Filter and sort tasks
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description ?? '').toLowerCase().includes(searchQuery.toLowerCase());
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

  const handleConvertFromList = (task: PersonalTask) => {
    setConvertingTask(task);
    setConvertProjectId('');
    setConvertAssigneeId('');
    setMemberLookupProjectId('');
    setShowConvertDialog(true);
  };

  return (
    <div className="min-h-screen bg-[#080808] text-[#F4F6FF]">
      <Toaster position="top-right" theme="dark" richColors />
      {confirmDialog}

      <PersonalTasksHeader
        userName={user?.name}
        showAdmin={hasAnyAdminCapability(can)}
        onBack={() => navigate('/')}
        onAdminClick={() => navigate('/admin')}
        onLogout={logout}
      />

      <div className="max-w-[1200px] mx-auto px-8 py-8">
        <PersonalTasksStatsBar stats={stats} />

        <PersonalTasksToolbar
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          filterStatus={filterStatus}
          setFilterStatus={setFilterStatus}
          sortBy={sortBy}
          setSortBy={setSortBy}
          onNewTask={() => {
            resetForm();
            setShowAddDialog(true);
          }}
        />

        <PersonalTasksList
          isLoading={isLoading}
          tasks={tasks}
          filteredTasks={filteredTasks}
          canAssignToProject={can('project.assign_personal_task')}
          onToggleComplete={toggleTaskComplete}
          onConvert={handleConvertFromList}
          onEdit={startEdit}
          onDelete={deleteTask}
        />
      </div>

      <AddTaskDialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}
        newTask={newTask}
        setNewTask={setNewTask}
        showDatePicker={showDatePickerAdd}
        setShowDatePicker={setShowDatePickerAdd}
        projects={projects}
        onProjectChange={(projectId) => {
          setNewTask({ ...newTask, project_id: projectId });
          setMemberLookupProjectId(projectId);
        }}
        isCreating={isCreating}
        onCreate={createTask}
      />

      <EditTaskDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        newTask={newTask}
        setNewTask={setNewTask}
        showDatePicker={showDatePickerEdit}
        setShowDatePicker={setShowDatePickerEdit}
        isUpdating={isUpdating}
        onSave={updateTask}
        onCancel={resetForm}
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
        onProjectChange={(projectId) => {
          setConvertProjectId(projectId);
          setMemberLookupProjectId(projectId);
        }}
        convertEstimatedHours={convertEstimatedHours}
        setConvertEstimatedHours={setConvertEstimatedHours}
        convertAssigneeId={convertAssigneeId}
        setConvertAssigneeId={setConvertAssigneeId}
        isConverting={isConverting}
        onConvert={convertToTicket}
      />
    </div>
  );
};

export default PersonalTasksPage;
