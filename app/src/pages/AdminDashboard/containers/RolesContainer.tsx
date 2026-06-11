// Thin per-tab container for the Roles tab. Owns role-editor state via
// useRolesAdmin and renders the Roles tab plus the role create/edit modal.
import { useAuth } from '@/contexts/AuthContext';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AdminSpinner } from '../components/AdminSpinner';
import { useRolesAdmin } from '../hooks/useRolesAdmin';
import {
  isGrantHeld,
  isSideEffective,
  isGroupEffective,
  toPascalCase,
} from '../lib/capabilityPicker';
import RolesTab from '../tabs/RolesTab';
import RoleModal from '../modals/RoleModal';

export default function RolesContainer() {
  const { can } = useAuth();
  const { confirm, confirmDialog } = useConfirm();
  const {
    roles,
    isLoading,
    showRoleModal,
    setShowRoleModal,
    editingRole,
    roleForm,
    setRoleForm,
    isSavingRole,
    PICKER_CATALOG,
    toggleGrant,
    toggleGroupWildcard,
    togglePickerCheckbox,
    handleOpenCreateRole,
    handleOpenEditRole,
    handleSaveRole,
    handleDeleteRole,
    deleteRoleMutation,
  } = useRolesAdmin(confirm);

  // Gate create/edit/delete affordances on roles-write (backend enforces the
  // same cap on the role-mutation endpoints).
  const canWriteRoles = can('admin.roles_write');

  if (isLoading) return <AdminSpinner />;

  return (
    <>
      <RolesTab
        roles={roles}
        isDeletingRole={deleteRoleMutation.isPending}
        onCreateRole={handleOpenCreateRole}
        onEditRole={handleOpenEditRole}
        onDeleteRole={handleDeleteRole}
        canWriteRoles={canWriteRoles}
      />

      <RoleModal
        open={showRoleModal}
        onClose={() => setShowRoleModal(false)}
        editingRole={editingRole}
        roleForm={roleForm}
        setRoleForm={setRoleForm}
        isSavingRole={isSavingRole}
        pickerCatalog={PICKER_CATALOG}
        toggleGrant={toggleGrant}
        toggleGroupWildcard={toggleGroupWildcard}
        togglePickerCheckbox={togglePickerCheckbox}
        isGrantHeld={isGrantHeld}
        isSideEffective={isSideEffective}
        isGroupEffective={isGroupEffective}
        toPascalCase={toPascalCase}
        handleSaveRole={handleSaveRole}
      />
      {confirmDialog}
    </>
  );
}
