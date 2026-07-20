// Thin container for the Projects admin tab: owns data, mutations, and modal
// state via useProjectsAdmin (plus the employees list for the add-member
// dropdown), then renders the tab and its three modals.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { AdminSpinner } from '../components/AdminSpinner';
import { useEmployeesList } from '../hooks/useEmployeesList';
import { useProjectsAdmin } from '../hooks/useProjectsAdmin';
import { useSetProjectWorkforceClient, useWorkforceClients } from '../hooks/useWorkforceAdmin';
import CategoryManagerModal from '../modals/CategoryManagerModal';
import GitHubModal from '../modals/GitHubModal';
import ProjectMembersModal from '../modals/ProjectMembersModal';
import ProjectsTab from '../tabs/ProjectsTab';
import type { WorkforceStatus } from '../types';

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

  // Workforce integration surface for the per-project QB client picker.
  // The status query is cheap and shared with the Integrations tab via
  // react-query cache, so loading it here doesn't double-fetch on tab
  // switches. The clients list is fetched only when connected — the
  // picker's chip is hidden otherwise, so the list would be unused.
  const canWriteProjects = can('admin.projects_write');
  const workforceStatusQuery = useQuery<WorkforceStatus>({
    queryKey: ['admin', 'workforceStatus'],
    queryFn: () => apiFetch<WorkforceStatus>('/api/admin/workforce/status'),
  });
  const workforceConnected = workforceStatusQuery.data?.connected ?? false;
  const workforceClientsQuery = useWorkforceClients(workforceConnected && canWriteProjects);
  // `data ?? []` creates a fresh empty array each render, which busts
  // any downstream useMemo/useEffect that depends on this prop. See
  // app/CLAUDE.md → "Stabilize empty-default arrays".
  const workforceClients = useMemo(
    () => workforceClientsQuery.data ?? [],
    [workforceClientsQuery.data],
  );
  const setProjectWorkforceClient = useSetProjectWorkforceClient();

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
        canWriteProjects={canWriteProjects}
        workforceConnected={workforceConnected}
        workforceClients={workforceClients}
        workforceClientsLoading={workforceClientsQuery.isLoading}
        onSetProjectWorkforceClient={(projectId, clientId, clientName) =>
          setProjectWorkforceClient.mutate({ projectId, clientId, clientName })
        }
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
