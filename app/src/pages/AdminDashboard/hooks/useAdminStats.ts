import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { DashboardStats } from '../types';
import { ADMIN_REFETCH } from './adminRefetch';

/** Dashboard-tab summary stats. Gated by `enabled` (the Dashboard tab being active). */
export function useAdminStats(enabled: boolean) {
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiFetch<DashboardStats>('/api/admin/stats'),
    enabled,
    ...ADMIN_REFETCH,
  });

  return {
    stats: statsQuery.data ?? null,
    isLoading: statsQuery.isLoading,
  };
}
