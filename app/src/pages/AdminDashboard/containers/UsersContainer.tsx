// Thin container for the Users admin tab. Owns user data + create/edit modal
// state (useUsersAdmin), the roles list + per-user role assignment (useRolesList
// + useUserRoleAssignment) for the inline "Edit Roles" modal, and the
// open-role-dropdown UI state. Renders the Users tab plus its three modals.
import { useState } from 'react';
import { X } from 'lucide-react';
import { AdminSpinner } from '../components/AdminSpinner';
import { useUsersAdmin } from '../hooks/useUsersAdmin';
import { useRolesList } from '../hooks/useRolesList';
import { useUserRoleAssignment } from '../hooks/useUserRoleAssignment';
import { toPascalCase } from '../lib/capabilityPicker';
import UsersTab from '../tabs/UsersTab';
import UserModal from '../modals/UserModal';
import EditUserModal from '../modals/EditUserModal';

export default function UsersContainer() {
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
  } = useUsersAdmin();

  // Roles list + assignment feed the inline per-user "Edit Roles" modal. Shared
  // with the Roles tab via react-query (same ['admin','roles'] key).
  const { roles } = useRolesList();
  const { handleToggleUserRoleById } = useUserRoleAssignment();

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
    </>
  );
}
