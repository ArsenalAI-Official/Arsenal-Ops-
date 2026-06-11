// Thin container for the Users admin tab. Owns user data + create/edit modal
// state (useUsersAdmin), the roles list + per-user role assignment (useRolesList
// + useUserRoleAssignment) for the inline "Edit Roles" modal, and the
// open-role-dropdown UI state. Renders the Users tab plus its three modals.
import { useState } from 'react';
import { Shield, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/modal';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AdminSpinner } from '../components/AdminSpinner';
import { useUsersAdmin } from '../hooks/useUsersAdmin';
import { useRolesList } from '../hooks/useRolesList';
import { useUserRoleAssignment } from '../hooks/useUserRoleAssignment';
import { toPascalCase } from '../lib/capabilityPicker';
import UsersTab from '../tabs/UsersTab';
import UserModal from '../modals/UserModal';
import EditUserModal from '../modals/EditUserModal';

export default function UsersContainer() {
  const { confirm, confirmDialog } = useConfirm();
  const {
    users,
    isLoading,
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
  } = useUsersAdmin(confirm);

  // Roles list + assignment feed the inline per-user "Edit Roles" modal. Shared
  // with the Roles tab via react-query (same ['admin','roles'] key).
  const { roles } = useRolesList();
  const { handleToggleUserRoleById } = useUserRoleAssignment();
  const { can } = useAuth();

  // Write caps gate the action buttons. Edit-Roles gates on roles-write since it
  // mutates user_roles (backend enforces the same cap).
  const canWriteUsers = can('admin.users_write');
  const canWriteRoles = can('admin.roles_write');

  // Per-user role-edit modal trigger.
  const [openRoleDropdown, setOpenRoleDropdown] = useState<number | null>(null);

  if (isLoading) return <AdminSpinner />;

  return (
    <>
      <UsersTab
        users={users}
        onEditUserRoles={setOpenRoleDropdown}
        onAddUser={() => setShowUserModal(true)}
        onDeleteUser={handleDeleteUser}
        onEditUser={handleOpenEditUser}
        canWriteUsers={canWriteUsers}
        canWriteRoles={canWriteRoles}
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
            <Modal
              open
              onClose={() => setOpenRoleDropdown(null)}
              maxWidthClass="max-w-md"
              panelClassName="max-h-[80vh] flex flex-col"
              title={
                // Shield icon tile + title + user avatar/name + assignment
                // counter pill. The counter gives instant feedback as roles are
                // toggled (no save button — changes auto-persist via
                // handleToggleUserRoleById). flex-1 lets it span the header so
                // the counter right-aligns next to the Modal's close button.
                <div className="flex flex-1 items-center justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E0B954]/15 to-[#B8872A]/10 border border-[#E0B954]/20 flex items-center justify-center shrink-0">
                      <Shield className="w-5 h-5 text-[#E0B954]" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-white leading-tight">Edit Roles</h2>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="w-4 h-4 rounded-full bg-gradient-to-br from-[#E0B954] to-[#B8872A] flex items-center justify-center shrink-0">
                          <span className="text-[8px] font-semibold text-white">
                            {targetUser.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-[#a3a3a3] truncate">{targetUser.name}</span>
                      </div>
                    </div>
                  </div>
                  {roles.length > 0 && (
                    <span
                      className="text-[10px] tabular-nums px-2 py-1 rounded-md border font-medium shrink-0"
                      style={{
                        color: userRoleNames.size > 0 ? '#E0B954' : '#737373',
                        backgroundColor:
                          userRoleNames.size > 0
                            ? 'rgba(224,185,84,0.1)'
                            : 'rgba(255,255,255,0.04)',
                        borderColor:
                          userRoleNames.size > 0
                            ? 'rgba(224,185,84,0.25)'
                            : 'rgba(255,255,255,0.06)',
                      }}
                      title={`${userRoleNames.size} of ${roles.length} roles assigned`}
                    >
                      {userRoleNames.size} / {roles.length}
                    </span>
                  )}
                </div>
              }
            >
              <div className="p-4 space-y-1.5 overflow-y-auto">
                {roles.length === 0 ? (
                  <div className="py-10 text-center">
                    <KeyRound className="w-7 h-7 text-[#525252] mx-auto mb-2" />
                    <p className="text-sm text-[#a3a3a3] font-medium">No roles defined yet</p>
                    <p className="text-xs text-[#525252] mt-1">
                      Create roles in the Roles tab to assign them here.
                    </p>
                  </div>
                ) : (
                  roles.map((role) => {
                    const isChecked = userRoleNames.has(role.name);
                    return (
                      <label
                        key={role.id}
                        className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${
                          isChecked
                            ? 'bg-[rgba(224,185,84,0.06)] border-[rgba(224,185,84,0.2)] hover:bg-[rgba(224,185,84,0.09)]'
                            : 'bg-transparent border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.025)] hover:border-[rgba(255,255,255,0.08)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            handleToggleUserRoleById(targetUser, role, e.target.checked)
                          }
                          className="w-4 h-4 rounded cursor-pointer mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Role chip — same KeyRound + Pascal-case treatment
                                used in the Roles tab table so the same role reads
                                identically across screens. */}
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                isChecked
                                  ? 'bg-[#E0B954]/20 text-[#E0B954]'
                                  : 'bg-[rgba(255,255,255,0.04)] text-[#a3a3a3]'
                              }`}
                            >
                              <KeyRound className="w-3 h-3" />
                              {toPascalCase(role.name)}
                            </span>
                            {role.is_system && (
                              <span className="text-[9px] uppercase tracking-wider text-[#737373] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]">
                                System
                              </span>
                            )}
                          </div>
                          {role.description && (
                            <p className="text-xs text-[#a3a3a3] mt-1.5 leading-relaxed">
                              {role.description}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </Modal>
          );
        })()}

      <UserModal
        open={showUserModal}
        onClose={() => setShowUserModal(false)}
        userForm={userForm}
        setUserForm={setUserForm}
        handleRoleToggle={handleRoleToggle}
        handleSaveUser={handleSaveUser}
        roles={roles}
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
      {confirmDialog}
    </>
  );
}
