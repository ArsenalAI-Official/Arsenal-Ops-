import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
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
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectsPageData } from './hooks/useProjectsPageData';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { confirm, confirmDialog } = useConfirm();

  // Time-of-day greeting + long date for the dashboard header. `new Date()` is
  // impure, so it's memoized once per mount (react-hooks/purity).
  const { greeting, dateStr } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    return {
      greeting: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
      dateStr: now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    };
  }, []);
  const firstName = user?.name?.split(' ')[0] || user?.name || 'there';

  const {
    searchQuery,
    setSearchQuery,
    projects,
    isLoading,
    showCreateModal,
    setShowCreateModal,
    createForm,
    setCreateForm,
    selectedDevelopers,
    selectedDeveloperId,
    setSelectedDeveloperId,
    newRole,
    setNewRole,
    newResponsibilities,
    setNewResponsibilities,
    availableDevelopers,
    projectCategories,
    handleAddDeveloper,
    handleRemoveDeveloper,
    handleCreateProject,
    isCreating,
    handleDeleteProject,
    toggleFavorite,
    myTaskTab,
    setMyTaskTab,
    showAllTasks,
    setShowAllTasks,
    selectedTask,
    setSelectedTask,
    myTasks,
    myTasksLoading,
    handleChangeMyTaskStatus,
    handleQuickDueDateChange,
    handleTaskChanged,
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
    togglePersonalTaskComplete,
    createPersonalTask,
    convertToTicket,
    deletePersonalTask,
    updatePersonalTask,
    addingTask,
    convertingTicket,
    startEditPersonalTask,
    cancelEditPersonalTask,
    notepadContent,
    setNotepadContent,
    notepadSaved,
    notepadOpen,
    setNotepadOpen,
  } = useProjectsPageData({ user, confirm });

  return (
    <div className="h-screen flex flex-col bg-[#080808] text-[#F4F6FF]">
      <Toaster position="top-right" theme="dark" richColors />
      {confirmDialog}

      <AppHeader user={user} onAdminClick={() => navigate('/admin')} onLogout={logout} />

      <div className="flex-1 min-h-0 flex flex-col max-w-[1360px] mx-auto px-8 pt-6 pb-7 w-full">
        <div className="flex items-baseline gap-3 mb-4 flex-shrink-0">
          <h1 className="text-[23px] font-bold tracking-[-0.02em] text-white m-0">
            {greeting}, {firstName}
          </h1>
          <span className="text-sm text-muted-foreground">{dateStr}</span>
        </div>

        <div className="flex-shrink-0">
          <DashboardStats
            myTasks={myTasks}
            myTasksLoading={myTasksLoading}
            onTabChange={setMyTaskTab}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.7fr_1fr] gap-5 flex-1 min-h-0">
          <div className="min-h-0 h-full">
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

          <div className="min-h-0 h-full">
            <ProjectsBox
              projects={projects}
              isLoading={isLoading}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onCreateProjectClick={() => setShowCreateModal(true)}
              onProjectClick={(projectId) => navigate(`/project/${projectId}`)}
              onDeleteProject={handleDeleteProject}
              onToggleFavorite={toggleFavorite}
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
        convertAssigneeId={convertAssigneeId}
        setConvertAssigneeId={setConvertAssigneeId}
        convertEstimatedHours={convertEstimatedHours}
        setConvertEstimatedHours={setConvertEstimatedHours}
        onProjectChange={(projectId) => {
          setConvertProjectId(projectId);
          setConvertAssigneeId('');
          setMemberLookupProjectId(projectId || '');
        }}
        isConverting={convertingTicket}
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
        categories={projectCategories}
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
