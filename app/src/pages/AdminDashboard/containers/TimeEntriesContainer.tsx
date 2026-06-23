// Thin container for the Time Entries admin tab. Feeds the tab the project +
// employee option lists it filters by; the tab owns its own time-entries query,
// date-range state, and table rendering. No `enabled` flag — this container only
// mounts when the Time Entries tab is active, so mounting IS the fetch gate.
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ProjectResponse } from '@/client';
import { apiFetch } from '@/lib/api';
import { AdminSpinner } from '../components/AdminSpinner';
import { ADMIN_REFETCH } from '../hooks/adminRefetch';
import { useEmployeesList } from '../hooks/useEmployeesList';
import TimeEntriesTab from '../tabs/TimeEntriesTab';

export default function TimeEntriesContainer() {
  const { employees, isLoading: employeesLoading } = useEmployeesList();

  // Shares the ['admin','projects'] cache with the Projects tab — react-query
  // dedupes the fetch when both are visited.
  const projectsQuery = useQuery<ProjectResponse[]>({
    queryKey: ['admin', 'projects'],
    queryFn: () => apiFetch<ProjectResponse[]>('/api/admin/projects'),
    ...ADMIN_REFETCH,
  });
  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  if (employeesLoading || projectsQuery.isLoading) return <AdminSpinner />;

  return <TimeEntriesTab projects={projects} employees={employees} />;
}
