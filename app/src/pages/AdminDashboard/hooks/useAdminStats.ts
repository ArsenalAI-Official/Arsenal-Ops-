import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { DashboardStats } from '../types';
import { ADMIN_REFETCH } from './adminRefetch';

/** Dashboard-tab summary stats. No `enabled` flag — the DashboardContainer only
 *  mounts when the Dashboard tab is active, so mounting is the gate. */
export function useAdminStats() {
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<DashboardStats>('/api/admin/stats'),
    ...ADMIN_REFETCH,
  });

  return {
    stats: statsQuery.data ?? null,
    isLoading: statsQuery.isLoading,
  };
}
