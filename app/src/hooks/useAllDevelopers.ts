import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

/**
 * Shared query for the global developers list (`GET /api/developers/`).
 * Previously this exact query was redefined in 4+ components (ProjectsPage,
 * ProjectBoard, ProjectDetail, WorkItemPanel) with the `['developers']` key.
 * Generic on the row type so callers keep their local Developer shape.
 *
 *   const { data: developers = [] } = useAllDevelopers<Developer>();
 */
export function useAllDevelopers<T = unknown>() {
  return useQuery<T[]>({
    queryKey: ['developers'],
    queryFn: () => apiFetch<T[]>('/api/developers/'),
  });
}
