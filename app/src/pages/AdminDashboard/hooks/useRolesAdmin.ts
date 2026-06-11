import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { invalidateAdminRoles } from '@/lib/invalidations';
import type { ConfirmFn } from '@/components/ui/confirm-dialog';
import type { Capability, Role } from '../types';
import {
  type PickerChild,
  type PickerGroup,
  type PickerItem,
  applyToggleGrant,
  applyToggleGroupWildcard,
  applyTogglePickerCheckbox,
  buildPickerCatalog,
} from '../lib/capabilityPicker';
import { ADMIN_REFETCH } from './adminRefetch';
import { useRolesList } from './useRolesList';
import { useRefreshCapsTwice } from './useRefreshCapsTwice';

/**
 * Owns the Roles-tab role-editor: the roles list (via useRolesList) + capability
 * registry, the role create/edit modal (incl. the capability-picker toggles),
 * and role CRUD. Per-user role *assignment* lives in useUserRoleAssignment (the
 * Users tab needs it without this editor machinery). `refreshCapsTwice` re-pulls
 * the current user's caps after role-cap changes. No `enabled` flag — the
 * RolesContainer only mounts when the Roles tab is active.
 */
export function useRolesAdmin(confirm: ConfirmFn) {
  const queryClient = useQueryClient();
  const refreshCapsTwice = useRefreshCapsTwice();

  const { roles, isLoading: rolesLoading } = useRolesList();

  const capabilitiesQuery = useQuery<Capability[]>({
    queryKey: ['admin', 'capabilities'],
    queryFn: () => apiFetch<Capability[]>('/api/auth/capabilities'),
    ...ADMIN_REFETCH,
  });
  const capabilityRegistry = useMemo(() => capabilitiesQuery.data ?? [], [capabilitiesQuery.data]);

  // RBAC role create/edit modal state
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState<{
    name: string;
    description: string;
    capability_keys: string[];
  }>({ name: '', description: '', capability_keys: [] });

  // RBAC: role create/update/delete mutations
  const invalidateRoles = () => invalidateAdminRoles(queryClient);

  const createRoleMutation = useMutation({
    mutationFn: (vars: { name: string; description: string | null; capability_keys: string[] }) =>
      apiFetch<Role>('/api/auth/admin/roles', {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
    onSuccess: (_data, vars) => {
      toast.success(`Role '${vars.name}' created`);
      setShowRoleModal(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create role';
      toast.error(msg);
    },
    onSettled: () => {
      invalidateRoles();
      // Any role the current user holds could now have different caps.
      refreshCapsTwice();
    },
  });

  const updateRoleMetaMutation = useMutation({
    mutationFn: (vars: { id: number; name: string; description: string | null }) =>
      apiFetch<Role>(`/api/auth/admin/roles/${vars.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: vars.name, description: vars.description }),
      }),
    onSettled: () => {
      invalidateRoles();
      refreshCapsTwice();
    },
  });

  const replaceRoleCapsMutation = useMutation({
    mutationFn: (vars: { id: number; capability_keys: string[] }) =>
      apiFetch<Role>(`/api/auth/admin/roles/${vars.id}/capabilities`, {
        method: 'PUT',
        body: JSON.stringify({ capability_keys: vars.capability_keys }),
      }),
    onSettled: () => {
      invalidateRoles();
      refreshCapsTwice();
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/auth/admin/roles/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, _id) => {
      toast.success('Role deleted');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to delete role';
      toast.error(msg);
    },
    onSettled: () => {
      invalidateRoles();
      refreshCapsTwice();
    },
  });

  const isSavingRole =
    createRoleMutation.isPending ||
    updateRoleMetaMutation.isPending ||
    replaceRoleCapsMutation.isPending;

  const handleOpenCreateRole = () => {
    setEditingRole(null);
    setRoleForm({ name: '', description: '', capability_keys: [] });
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description || '',
      capability_keys: [...role.capability_keys],
    });
    setShowRoleModal(true);
  };

  const handleSaveRole = async () => {
    const name = roleForm.name.trim();
    if (!name) {
      toast.error('Role name is required');
      return;
    }
    if (editingRole) {
      try {
        const needsMetaUpdate =
          name !== editingRole.name ||
          (roleForm.description || '') !== (editingRole.description || '');
        if (needsMetaUpdate) {
          await updateRoleMetaMutation.mutateAsync({
            id: editingRole.id,
            // System roles keep their original name; description is editable.
            name: editingRole.is_system ? editingRole.name : name,
            description: roleForm.description.trim() || null,
          });
        }
        await replaceRoleCapsMutation.mutateAsync({
          id: editingRole.id,
          capability_keys: roleForm.capability_keys,
        });
        setShowRoleModal(false);
        invalidateRoles();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save role';
        toast.error(msg);
      }
    } else {
      createRoleMutation.mutate({
        name,
        description: roleForm.description.trim() || null,
        capability_keys: roleForm.capability_keys,
      });
    }
  };

  const handleDeleteRole = async (role: Role) => {
    if (role.is_system) {
      toast.error('Cannot delete a system role');
      return;
    }
    if (
      !(await confirm({
        title: 'Delete role?',
        description: `Delete role "${role.name}"? Users assigned to this role will lose its capabilities.`,
        confirmText: 'Delete',
        destructive: true,
      }))
    )
      return;
    deleteRoleMutation.mutate(role.id);
  };

  // RBAC capability-picker wiring. The pure grant-resolution logic lives in
  // ../lib/capabilityPicker (unit-tested); here we only memoize the display
  // catalog and wrap the two toggles in setRoleForm.
  const PICKER_CATALOG = useMemo(() => buildPickerCatalog(), []);

  const toggleGrant = (key: string) => {
    setRoleForm((f) => ({
      ...f,
      capability_keys: applyToggleGrant(f.capability_keys, key, capabilityRegistry),
    }));
  };

  // "Grant all <Group>" wildcard toggle (e.g. project.* / admin.*).
  const toggleGroupWildcard = (group: PickerGroup) => {
    setRoleForm((f) => ({
      ...f,
      capability_keys: applyToggleGroupWildcard(f.capability_keys, group),
    }));
  };

  // Toggle one side (read/write) of a picker row, enforcing the W→R dependency.
  const togglePickerCheckbox = (item: PickerChild | PickerItem, side: 'read' | 'write') => {
    setRoleForm((f) => ({
      ...f,
      capability_keys: applyTogglePickerCheckbox(f.capability_keys, item, side),
    }));
  };

  return {
    roles,
    isLoading: rolesLoading,
    // role create/edit modal
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
  };
}
