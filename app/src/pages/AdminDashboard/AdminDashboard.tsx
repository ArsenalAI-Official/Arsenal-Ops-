import { lazy, Suspense, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, FolderKanban, X, ArrowLeft, BarChart3, Shield, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toaster } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import RoleModal from './modals/RoleModal';
import EmployeeModal from './modals/EmployeeModal';
import UserModal from './modals/UserModal';
import EditUserModal from './modals/EditUserModal';
import GitHubModal from './modals/GitHubModal';
import ProjectMembersModal from './modals/ProjectMembersModal';
import CategoryManagerModal from './modals/CategoryManagerModal';
import type { AdminTab } from './types';
import { VALID_ADMIN_TABS } from './types';
import { isItemChecked, isItemEffectivelyChecked, toPascalCase } from './lib/capabilityPicker';
import { useAdminStats } from './hooks/useAdminStats';
import { useEmployeesAdmin } from './hooks/useEmployeesAdmin';
import { useProjectsAdmin } from './hooks/useProjectsAdmin';
import { useUsersAdmin } from './hooks/useUsersAdmin';
import { useRolesAdmin } from './hooks/useRolesAdmin';

// Route-level chunks for each tab. Lazy-loading keeps heavy dependencies out
// of the /admin critical path — most importantly recharts (the `charts` chunk,
// ~487 KB) which only DashboardTab needs but previously loaded before first
// paint for every tab. Each tab's chunk now downloads on first view, in
// parallel with that tab's data fetch (see per-tab `enabled` gating below).
const DashboardTab = lazy(() => import('./tabs/DashboardTab'));
const EmployeesTab = lazy(() => import('./tabs/EmployeesTab'));
const ProjectsTab = lazy(() => import('./tabs/ProjectsTab'));
const UsersTab = lazy(() => import('./tabs/UsersTab'));
const RolesTab = lazy(() => import('./tabs/RolesTab'));

/**
 * Admin shell. Owns only tab/URL state and capability gating; each tab's data,
 * mutations, and modal/form state live in a dedicated `./hooks/*` hook. The
 * shell wires those hooks to the (lazy) tab components and the modals below.
 */
const AdminDashboard = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const initialTab: AdminTab =
    tabFromUrl && (VALID_ADMIN_TABS as string[]).includes(tabFromUrl)
      ? (tabFromUrl as AdminTab)
      : 'dashboard';
  const [activeTab, setActiveTabState] = useState<AdminTab>(initialTab);

  const setActiveTab = (tab: AdminTab) => {
    setActiveTabState(tab);
    if (tab === 'dashboard') {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: false });
    } else {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: false });
    }
  };

  // Sync state with URL on browser back/forward navigation. Pre-existing
  // pattern; deliberately reads activeTab without listing it as a dep so
  // the effect only runs when the URL changes, not when state changes back.
  useEffect(() => {
    const urlTab = searchParams.get('tab');
    const resolved: AdminTab =
      urlTab && (VALID_ADMIN_TABS as string[]).includes(urlTab)
        ? (urlTab as AdminTab)
        : 'dashboard';
    if (resolved !== activeTab) {
      setActiveTabState(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { can } = useAuth();

  // Per-tab capability gates. The /admin route guard in App.tsx already ensures
  // the user holds at least one admin.* capability before this component mounts;
  // these gates control which tabs they actually see and protect against
  // URL-direct access (?tab=users) for caps the user lacks.
  const canSeeDashboard = can('admin.dashboard');
  const canSeeEmployees = can('admin.employees');
  const canSeeProjects = can('admin.projects');
  const canSeeUsers = can('admin.users');
  const canSeeRoles = can('admin.roles');

  // Per-tab data gating. Each domain hook fetches only when the tab that renders
  // it is active, so first paint waits on a single endpoint instead of six —
  // and the expensive capacity endpoint never runs unless the Employees tab is
  // opened. Employees data is also consumed by the Projects tab's add-member
  // modal, hence the OR.
  const onDashboard = activeTab === 'dashboard';
  const onEmployees = activeTab === 'employees';
  const onProjects = activeTab === 'projects';
  const onUsers = activeTab === 'users';
  const onRoles = activeTab === 'roles';

  // Per-domain ownership lives in dedicated hooks (./hooks/*). Each owns its
  // queries, mutations (with their cross-cutting invalidation), derived state,
  // and modal/form state. The shell only destructures what the tabs/modals need.
  const { stats, isLoading: dashboardLoading } = useAdminStats(onDashboard);

  const {
    employees,
    developerCapacities,
    teamCapacity,
    availableSpecs,
    isLoading: employeesLoading,
    showEmployeeModal,
    setShowEmployeeModal,
    editingEmployee,
    employeeForm,
    setEmployeeForm,
    handleEditEmployee,
    handleSaveEmployee,
    handleDeleteEmployee,
  } = useEmployeesAdmin({
    employeesEnabled: onEmployees || onProjects,
    capacityEnabled: onEmployees,
  });

  const {
    categories,
    filteredProjects,
    categoryFilter,
    setCategoryFilter,
    weeklyReportQuery,
    categoriesQuery,
    isLoading: projectsLoading,
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
  } = useProjectsAdmin(onProjects);

  const {
    users,
    isLoading: usersLoading,
    showUserModal,
    setShowUserModal,
    userForm,
    setUserForm,
    handleRoleToggle,
    handleSaveUser,
    editingUser,
    setEditingUser,
    editUserForm,
    setEditUserForm,
    handleOpenEditUser,
    handleSaveEditUser,
    updateUserMutation,
    handleDeleteUser,
  } = useUsersAdmin(onUsers);

  const {
    roles,
    isLoading: rolesLoading,
    showRoleModal,
    setShowRoleModal,
    editingRole,
    roleForm,
    setRoleForm,
    isSavingRole,
    PICKER_CATALOG,
    toggleGrant,
    toggleCatalogItem,
    handleOpenCreateRole,
    handleOpenEditRole,
    handleSaveRole,
    handleDeleteRole,
    deleteRoleMutation,
    handleToggleUserRoleById,
  } = useRolesAdmin({
    rolesEnabled: onUsers || onRoles,
    capabilitiesEnabled: onRoles,
  });

  // Per-user role-edit modal trigger (modal rendered below). Parent-level UI
  // state shared by the Users tab and the inline role modal.
  const [openRoleDropdown, setOpenRoleDropdown] = useState<number | null>(null);

  const spinner = (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-2 border-[#E0B954] border-t-transparent rounded-full" />
    </div>
  );
  const restricted = (
    <div className="text-center py-12 text-[#737373]">This section is restricted.</div>
  );

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      <Toaster position="top-right" theme="dark" />

      {/* Header */}
      <div className="border-b border-[rgba(255,255,255,0.05)] bg-[#0d0d0d]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="text-[#737373] hover:text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
              </Button>
              <div className="h-6 w-px bg-[rgba(255,255,255,0.08)]" />
              <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[rgba(255,255,255,0.05)]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto pb-2">
            {[
              ...(canSeeDashboard
                ? [{ id: 'dashboard', label: 'Dashboard', icon: BarChart3 }]
                : []),
              ...(canSeeEmployees ? [{ id: 'employees', label: 'Employees', icon: Users }] : []),
              ...(canSeeProjects
                ? [{ id: 'projects', label: 'Projects', icon: FolderKanban }]
                : []),
              ...(canSeeUsers ? [{ id: 'users', label: 'Users', icon: Shield }] : []),
              ...(canSeeRoles ? [{ id: 'roles', label: 'Roles', icon: KeyRound }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-3 flex items-center gap-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#E0B954] text-white'
                    : 'border-transparent text-[#737373] hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content. Each tab gates on its own data (per-tab spinner) and lazy-
          loads its chunk (Suspense fallback) — first paint no longer waits on
          every admin endpoint, nor on the recharts bundle. */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <Suspense fallback={spinner}>
          {/* Dashboard Tab — gated on admin.dashboard */}
          {activeTab === 'dashboard' &&
            (canSeeDashboard
              ? dashboardLoading
                ? spinner
                : stats && <DashboardTab stats={stats} setActiveTab={setActiveTab} />
              : restricted)}

          {/* Employees Tab — gated on admin.employees */}
          {activeTab === 'employees' &&
            (canSeeEmployees ? (
              employeesLoading ? (
                spinner
              ) : (
                <EmployeesTab
                  employees={employees}
                  developerCapacities={developerCapacities}
                  teamCapacity={teamCapacity}
                  availableSpecs={availableSpecs}
                  onEditEmployee={handleEditEmployee}
                  onDeleteEmployee={handleDeleteEmployee}
                />
              )
            ) : (
              restricted
            ))}

          {/* Projects Tab — gated on admin.projects */}
          {activeTab === 'projects' &&
            (canSeeProjects ? (
              projectsLoading ? (
                spinner
              ) : (
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
                />
              )
            ) : (
              restricted
            ))}

          {/* Users Tab — gated on admin.users */}
          {activeTab === 'users' &&
            (canSeeUsers ? (
              usersLoading ? (
                spinner
              ) : (
                <UsersTab
                  users={users}
                  onEditUserRoles={setOpenRoleDropdown}
                  onAddUser={() => setShowUserModal(true)}
                  onDeleteUser={handleDeleteUser}
                  onEditUser={handleOpenEditUser}
                />
              )
            ) : (
              restricted
            ))}

          {/* Roles Tab — gated on admin.roles */}
          {activeTab === 'roles' &&
            (canSeeRoles ? (
              rolesLoading ? (
                spinner
              ) : (
                <RolesTab
                  roles={roles}
                  isDeletingRole={deleteRoleMutation.isPending}
                  onCreateRole={handleOpenCreateRole}
                  onEditRole={handleOpenEditRole}
                  onDeleteRole={handleDeleteRole}
                />
              )
            ) : (
              restricted
            ))}
        </Suspense>
      </div>

      {/* Role Create/Edit Modal */}
      <RoleModal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        editingRole={editingRole}
        roleForm={roleForm}
        setRoleForm={setRoleForm}
        isSavingRole={isSavingRole}
        pickerCatalog={PICKER_CATALOG}
        toggleGrant={toggleGrant}
        toggleCatalogItem={toggleCatalogItem}
        isItemChecked={isItemChecked}
        isItemEffectivelyChecked={isItemEffectivelyChecked}
        toPascalCase={toPascalCase}
        handleSaveRole={handleSaveRole}
      />

      {/* Role Management Modal (per-user role assignment) */}
      {openRoleDropdown &&
        users.find((u) => u.id === openRoleDropdown) &&
        (() => {
          const targetUser = users.find((u) => u.id === openRoleDropdown)!;
          const userRoleNames = new Set(
            targetUser.role
              .split(',')
              .map((r) => r.trim())
              .filter(Boolean),
          );
          return (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={() => setOpenRoleDropdown(null)}
            >
              <div
                className="bg-[#0d0d0d] border border-[rgba(255,255,255,0.07)] rounded-2xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-5 border-b border-[rgba(255,255,255,0.05)]">
                  <div>
                    <h2 className="text-lg font-bold text-white">Edit Roles</h2>
                    <p className="text-xs text-[#737373] mt-0.5">{targetUser.name}</p>
                  </div>
                  <button
                    onClick={() => setOpenRoleDropdown(null)}
                    className="p-2 rounded-lg hover:bg-[rgba(244,246,255,0.05)] text-[#737373] hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-5 space-y-2 overflow-y-auto">
                  {roles.length === 0 ? (
                    <p className="text-sm text-[#737373] text-center py-6">No roles defined yet.</p>
                  ) : (
                    roles.map((role) => {
                      const isChecked = userRoleNames.has(role.name);
                      return (
                        <label
                          key={role.id}
                          className="flex items-center gap-3 p-3 rounded-lg hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition border border-transparent hover:border-[rgba(255,255,255,0.04)]"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) =>
                              handleToggleUserRoleById(targetUser, role, e.target.checked)
                            }
                            className="w-5 h-5 rounded cursor-pointer"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white font-medium">
                                {toPascalCase(role.name)}
                              </span>
                              {role.is_system && (
                                <span className="text-[9px] uppercase tracking-wide text-[#737373] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)]">
                                  System
                                </span>
                              )}
                            </div>
                            {role.description && (
                              <p className="text-xs text-[#737373] mt-0.5 truncate">
                                {role.description}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
                <div className="flex justify-end gap-2 p-5 border-t border-[rgba(255,255,255,0.05)]">
                  <button
                    onClick={() => setOpenRoleDropdown(null)}
                    className="px-4 py-2 rounded-lg text-[#737373] hover:bg-[rgba(255,255,255,0.05)] transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      <EmployeeModal
        open={showEmployeeModal}
        onClose={() => setShowEmployeeModal(false)}
        editingEmployee={editingEmployee}
        employeeForm={employeeForm}
        setEmployeeForm={setEmployeeForm}
        handleSaveEmployee={handleSaveEmployee}
      />

      <UserModal
        open={showUserModal}
        onClose={() => setShowUserModal(false)}
        userForm={userForm}
        setUserForm={setUserForm}
        handleRoleToggle={handleRoleToggle}
        handleSaveUser={handleSaveUser}
      />

      <EditUserModal
        open={!!editingUser}
        onClose={() => setEditingUser(null)}
        userLabel={editingUser ? `${editingUser.name} (${editingUser.email})` : ''}
        form={editUserForm}
        setForm={setEditUserForm}
        onSave={handleSaveEditUser}
        isSaving={updateUserMutation.isPending}
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
    </div>
  );
};

export default AdminDashboard;
