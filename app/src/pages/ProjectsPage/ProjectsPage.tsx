import { CalendarRange, ChevronDown, ChevronRight } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LegalFooter } from '@/components/LegalFooter';
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

// Placement (b) of the week calendar: an inline, collapsible dashboard section.
// Lazy so the heavy calendar bundle only loads when the section is opened. Same
// component as the dedicated /week page — the two placements share all behavior.
const WeekCalendarView = lazy(() => import('../WeekCalendar/WeekCalendarView'));

const ProjectsPage = () => {
  const navigate = useNavigate();
  const { user, token, logout } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const [weekSectionOpen, setWeekSectionOpen] = useState(false);

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

      <div
        className={`flex-1 min-h-0 flex flex-col max-w-[1400px] mx-auto px-8 py-8 w-full${
          weekSectionOpen ? ' overflow-y-auto' : ''
        }`}
      >
        <div className="flex-shrink-0">
          <DashboardStats
            userName={user?.name}
            myTasks={myTasks}
            myTasksLoading={myTasksLoading}
            onTabChange={setMyTaskTab}
            onOpenWeek={() => navigate('/week')}
          />
        </div>

        <div
          className={`grid grid-cols-1 md:grid-cols-5 gap-5 ${
            weekSectionOpen ? 'flex-shrink-0 h-[60vh]' : 'flex-1 min-h-0'
          }`}
        >
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

        {/* Placement (b): inline collapsible week calendar at the bottom of the
            dashboard — compared against the dedicated /week page (placement a). */}
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setWeekSectionOpen((o) => !o)}
            className="flex items-center gap-2 text-[13px] font-semibold text-[#f5f5f5] mb-3 hover:text-white"
          >
            {weekSectionOpen ? (
              <ChevronDown className="w-4 h-4 text-[#737373]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[#737373]" />
            )}
            <CalendarRange className="w-4 h-4 text-[#E0B954]" />
            My Week — log hours
            <span className="text-[11px] font-normal text-[#737373]">inline preview</span>
          </button>
          {weekSectionOpen && (
            <Suspense
              fallback={
                <div className="text-[12px] text-[#737373] px-1 py-4">Loading calendar…</div>
              }
            >
              <WeekCalendarView layout="inline" />
            </Suspense>
          )}
        </div>
      </div>

      <LegalFooter className="flex-shrink-0 border-t border-[rgba(255,255,255,0.06)]" />

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
