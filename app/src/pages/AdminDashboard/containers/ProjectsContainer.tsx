// Thin container for the Projects admin tab: owns data, mutations, and modal
// state via useProjectsAdmin (plus the employees list for the add-member
// dropdown), then renders the tab and its three modals.
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AdminSpinner } from '../components/AdminSpinner';
import { useProjectsAdmin } from '../hooks/useProjectsAdmin';
import { useEmployeesList } from '../hooks/useEmployeesList';
import ProjectsTab from '../tabs/ProjectsTab';
import GitHubModal from '../modals/GitHubModal';
import ProjectMembersModal from '../modals/ProjectMembersModal';
import CategoryManagerModal from '../modals/CategoryManagerModal';

export default function ProjectsContainer() {
  const { confirm, confirmDialog } = useConfirm();
  const {
    categories,
    filteredProjects,
    categoryFilter,
    setCategoryFilter,
    weeklyReportQuery,
    categoriesQuery,
    isLoading,
    showCategoryManagerModal,
    setShowCategoryManagerModal,
    createCategoryMutation,
    updateCategoryMutation,
    deleteCategoryMutation,
    setProjectCategoryMutation,
    showGitHubModal,
    setShowGitHubModal,
    editingProject,
    gitHubForm,
    setGitHubForm,
    invitingProjectId,
    handleEditGitHubSettings,
    handleSaveGitHubSettings,
    handleSendGitHubInvites,
    showProjectMembersModal,
    setShowProjectMembersModal,
    selectedProjectForMembers,
    projectMembers,
    projectMembersLoading,
    addMemberForm,
    setAddMemberForm,
    handleOpenProjectMembers,
    handleAddProjectMember,
    handleRemoveProjectMember,
    addMemberMutation,
    removeMemberMutation,
  } = useProjectsAdmin(confirm);

  const { employees } = useEmployeesList();
  const { can } = useAuth();

  if (isLoading) return <AdminSpinner />;

  return (
    <>
      <ProjectsTab
        projects={filteredProjects}
        categories={categories}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        onOpenCategoryManager={() => setShowCategoryManagerModal(true)}
        onSetProjectCategory={(projectId, categoryId) =>
          setProjectCategoryMutation.mutate({ projectId, categoryId })
        }
        weeklyReport={weeklyReportQuery.data ?? null}
        weeklyReportLoading={weeklyReportQuery.isLoading}
        invitingProjectId={invitingProjectId}
        onEditGitHubSettings={handleEditGitHubSettings}
        onSendGitHubInvites={handleSendGitHubInvites}
        onOpenProjectMembers={handleOpenProjectMembers}
        canWriteProjects={can('admin.projects_write')}
      />

      <GitHubModal
        open={showGitHubModal}
        onClose={() => setShowGitHubModal(false)}
        editingProject={editingProject}
        gitHubForm={gitHubForm}
        setGitHubForm={setGitHubForm}
        handleSaveGitHubSettings={handleSaveGitHubSettings}
      />

      <ProjectMembersModal
        open={showProjectMembersModal}
        onClose={() => setShowProjectMembersModal(false)}
        selectedProjectForMembers={selectedProjectForMembers}
        projectMembers={projectMembers}
        projectMembersLoading={projectMembersLoading}
        employees={employees}
        addMemberForm={addMemberForm}
        setAddMemberForm={setAddMemberForm}
        handleAddProjectMember={handleAddProjectMember}
        handleRemoveProjectMember={handleRemoveProjectMember}
        addMemberPending={addMemberMutation.isPending}
        removeMemberPending={removeMemberMutation.isPending}
      />

      <CategoryManagerModal
        open={showCategoryManagerModal}
        onOpenChange={setShowCategoryManagerModal}
        categories={categories}
        isLoading={categoriesQuery.isLoading}
        isMutating={
          createCategoryMutation.isPending ||
          updateCategoryMutation.isPending ||
          deleteCategoryMutation.isPending
        }
        onCreate={(payload) => createCategoryMutation.mutateAsync(payload).then(() => undefined)}
        onUpdate={(id, payload) =>
          updateCategoryMutation.mutateAsync({ id, payload }).then(() => undefined)
        }
        onDelete={(id) => deleteCategoryMutation.mutateAsync(id).then(() => undefined)}
      />
      {confirmDialog}
    </>
  );
}
