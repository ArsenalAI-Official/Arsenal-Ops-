import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { RoleResponse } from '@/client';
import { ADMIN_REFETCH } from './adminRefetch';

/**
 * Just the roles list query. Shared by the Roles tab (via useRolesAdmin) and the
 * Users tab's per-user role-assignment modal — react-query dedupes the
 * `['admin','roles']` fetch. No `enabled` flag: mounting the consuming container
 * is the gate.
 */
export function useRolesList() {
  const rolesQuery = useQuery<RoleResponse[]>({
    queryKey: ['admin', 'roles'],
    queryFn: () => apiFetch<RoleResponse[]>('/api/auth/admin/roles'),
    ...ADMIN_REFETCH,
  });
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);
  return { roles, isLoading: rolesQuery.isLoading };
}
