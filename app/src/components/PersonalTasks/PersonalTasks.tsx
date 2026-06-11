import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { usePersonalTasksData } from './hooks/usePersonalTasksData';
import AddTaskDialog from './components/AddTaskDialog';
import TaskList from './components/TaskList';
import ConvertDialog from './components/ConvertDialog';
import EditDialog from './components/EditDialog';

interface PersonalTasksProps {
  token: string;
}

export default function PersonalTasks({ token }: PersonalTasksProps) {
  const { confirm, confirmDialog } = useConfirm();
  const {
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
  } = usePersonalTasksData(token, confirm);

  return (
    <Card className="bg-[#0d0d0d] border-[rgba(255,255,255,0.08)]">
      {confirmDialog}
      <AddTaskDialog
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
        newTask={newTask}
        setNewTask={setNewTask}
        showCalendar={showCalendar}
        setShowCalendar={setShowCalendar}
        projects={projects}
        loading={loading}
        onCreate={createTask}
      />
      <CardContent>
        <TaskList
          activeTasks={activeTasks}
          convertedTasks={convertedTasks}
          onEdit={startEdit}
          onConvert={(task) => {
            setSelectedTask(task);
            setShowConvertDialog(true);
          }}
          onDelete={deleteTask}
        />
      </CardContent>

      <ConvertDialog
        open={showConvertDialog}
        onOpenChange={(open) => {
          setShowConvertDialog(open);
          if (!open) {
            setConvertProjectId('');
            setConvertEstimatedHours('');
          }
        }}
        selectedTask={selectedTask}
        projects={projects}
        projectMembers={projectMembers}
        convertProjectId={convertProjectId}
        onProjectChange={(v) => {
          setConvertProjectId(v);
          setConvertAssigneeId('');
          if (v) fetchProjectMembers(v);
          else setProjectMembers([]);
        }}
        convertEstimatedHours={convertEstimatedHours}
        setConvertEstimatedHours={setConvertEstimatedHours}
        convertAssigneeId={convertAssigneeId}
        setConvertAssigneeId={setConvertAssigneeId}
        loading={loading}
        onConvert={convertToTicket}
      />

      <EditDialog
        open={isEditing}
        onOpenChange={(open) => {
          if (!open) cancelEdit();
        }}
        editForm={editForm}
        setEditForm={setEditForm}
        showCalendarEdit={showCalendarEdit}
        setShowCalendarEdit={setShowCalendarEdit}
        loading={loading}
        onSave={updateTask}
        onCancel={cancelEdit}
      />
    </Card>
  );
}
