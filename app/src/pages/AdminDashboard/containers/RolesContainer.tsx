// Thin per-tab container for the Roles tab. Owns role-editor state via
// useRolesAdmin and renders the Roles tab plus the role create/edit modal.
import { AdminSpinner } from '../components/AdminSpinner';
import { useRolesAdmin } from '../hooks/useRolesAdmin';
import { isItemChecked, isItemEffectivelyChecked, toPascalCase } from '../lib/capabilityPicker';
import RolesTab from '../tabs/RolesTab';
import RoleModal from '../modals/RoleModal';

export default function RolesContainer() {
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
    toggleCatalogItem,
    handleOpenCreateRole,
    handleOpenEditRole,
    handleSaveRole,
    handleDeleteRole,
    deleteRoleMutation,
  } = useRolesAdmin();

  if (isLoading) return <AdminSpinner />;

  return (
    <>
      <RolesTab
        roles={roles}
        isDeletingRole={deleteRoleMutation.isPending}
        onCreateRole={handleOpenCreateRole}
        onEditRole={handleOpenEditRole}
        onDeleteRole={handleDeleteRole}
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
        toggleCatalogItem={toggleCatalogItem}
        isItemChecked={isItemChecked}
        isItemEffectivelyChecked={isItemEffectivelyChecked}
        toPascalCase={toPascalCase}
        handleSaveRole={handleSaveRole}
      />
    </>
  );
}
