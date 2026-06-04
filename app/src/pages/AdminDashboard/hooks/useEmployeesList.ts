import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Employee } from '../types';
import { ADMIN_REFETCH } from './adminRefetch';

/**
 * Just the employees list query. Shared by the Employees tab (via
 * useEmployeesAdmin) and the Projects tab's add-member dropdown — both mount
 * their own consumer, and react-query dedupes the `['admin','employees']` fetch.
 * No `enabled` flag: the consuming container only mounts when its tab is active,
 * so mounting IS the gate.
 */
export function useEmployeesList() {
  const employeesQuery = useQuery<Employee[]>({
    queryKey: ['admin', 'employees'],
    queryFn: () => apiFetch<Employee[]>('/api/admin/employees'),
    ...ADMIN_REFETCH,
  });
  // Stable reference so downstream useMemo/useEffect deps don't bust each render.
  const employees = useMemo(() => employeesQuery.data ?? [], [employeesQuery.data]);
  return { employees, isLoading: employeesQuery.isLoading };
}
