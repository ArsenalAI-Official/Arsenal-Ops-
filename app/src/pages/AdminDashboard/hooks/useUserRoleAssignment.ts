import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { RoleResponse, UserListItemResponse } from '@/client';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { invalidateAdminRoles, invalidateAdminUserRoleImpact } from '@/lib/invalidations';
import { useRefreshCapsTwice } from './useRefreshCapsTwice';

/**
 * Per-user role assignment, used by the Users tab's inline "Edit Roles" modal.
 * Lives apart from useRolesAdmin (role CRUD) because the Users tab needs the
 * toggle without the role-editor machinery. Invalidates `['admin','roles']` +
 * `['admin','users']` and the wider user-role impact set, and re-pulls the
 * current user's caps when they edited their own roles — preserved from the
 * original component.
 */
export function useUserRoleAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const refreshCapsTwice = useRefreshCapsTwice();

  const invalidateRoles = () => invalidateAdminRoles(queryClient);

  const assignUserRoleMutation = useMutation({
    mutationFn: (vars: { userId: number; roleId: number }) =>
      apiFetch<void>(`/api/auth/admin/users/${vars.userId}/roles/${vars.roleId}`, {
        method: 'POST',
      }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to assign role';
      toast.error(msg);
    },
    onSettled: (_data, _err, vars) => {
      invalidateRoles();
      invalidateAdminUserRoleImpact(queryClient);
      if (vars && vars.userId === user?.id) {
        refreshCapsTwice();
      }
    },
  });

  const removeUserRoleMutation = useMutation({
    mutationFn: (vars: { userId: number; roleId: number }) =>
      apiFetch<void>(`/api/auth/admin/users/${vars.userId}/roles/${vars.roleId}`, {
        method: 'DELETE',
      }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to remove role';
      toast.error(msg);
    },
    onSettled: (_data, _err, vars) => {
      invalidateRoles();
      invalidateAdminUserRoleImpact(queryClient);
      if (vars && vars.userId === user?.id) {
        refreshCapsTwice();
      }
    },
  });

  const handleToggleUserRoleById = (
    targetUser: UserListItemResponse,
    role: RoleResponse,
    isChecked: boolean,
  ) => {
    // No per-toggle success toast: the Edit-Roles modal shows a live assigned
    // counter (n/total), so the toggle is its own feedback. Errors still toast
    // via the mutations' onError.
    if (isChecked) {
      assignUserRoleMutation.mutate({ userId: targetUser.id, roleId: role.id });
    } else {
      removeUserRoleMutation.mutate({ userId: targetUser.id, roleId: role.id });
    }
  };

  return { handleToggleUserRoleById };
}
