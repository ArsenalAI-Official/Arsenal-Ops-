import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { WorkItem } from '@/types/workItems';
import type { SprintResponse } from '@/client';
import type { DeveloperResponse, ProjectDeveloperEntry } from '@/client';

export interface Project {
  id: number;
  name: string;
  description: string;
  key_prefix: string;
  status: string;
  created_at: string;
  work_item_stats: {
    total: number;
    by_status: Record<string, number>;
    total_points: number;
    completed: number;
    completion_pct: number;
  };
  developers?: ProjectDeveloperEntry[];
}

/**
 * Owns the board's read layer: the project / work-items / sprints / developers
 * queries, the memo-stable `workItemFilters` that anchors the work-items query
 * key, the `data ?? []` stabilization memos, and the hover-prefetch of an
 * item's comments.
 *
 * Called ONCE in the ProjectBoard orchestrator (CONVENTIONS rule 1 — views and
 * mutation hooks never re-observe these queries). `workItemFilters` is returned
 * so the mutation hooks key their optimistic `getQueryData`/`setQueryData`/
 * rollback against the SAME memoized reference (`['workItems', workItemFilters,
 * 'board']`); rebuilding `{ project_id: id }` elsewhere would change the key
 * identity and break the optimistic exact-key invariant.
 */
export function useBoardData(id: string | undefined) {
  const queryClient = useQueryClient();

  const projectQuery = useQuery<Project>({
    queryKey: ['project', id],
    queryFn: () => apiFetch<Project>(`/api/projects/${id}`),
    enabled: !!id,
  });
  const project = projectQuery.data ?? null;
  const isLoading = projectQuery.isLoading;

  // Filters object drives the query key so filter changes auto-refetch.
  // useMemo keeps the reference stable across renders so the query key
  // (and any closures holding it) stay equal.
  // Switched to /api/workitems/board (slim shape: 18 fields, no description,
  // due_date, etc.). The drawer fetches the full item separately so list-only
  // bandwidth drops without breaking the detail view. Query key has a 'board'
  // suffix so it doesn't collide with the Hub view's full-shape cache.
  const workItemFilters = useMemo(() => ({ project_id: id }), [id]);
  const workItemsQuery = useQuery<WorkItem[]>({
    queryKey: ['workItems', workItemFilters, 'board'],
    queryFn: () => apiFetch<WorkItem[]>(`/api/workitems/board?project_id=${id}`),
    enabled: !!id,
  });
  // Stabilize ref so downstream useMemos (parentExcludeIds, existingTags) don't bust on every render.
  const workItems = useMemo(() => workItemsQuery.data ?? [], [workItemsQuery.data]);

  const sprintsQuery = useQuery<SprintResponse[]>({
    queryKey: ['sprints', id],
    queryFn: () => apiFetch<SprintResponse[]>(`/api/workitems/projects/${id}/sprints`),
    enabled: !!id,
  });
  // Stable ref so the list-view memos below (orderedListSprints, listViewGroups)
  // actually hold instead of busting on a fresh [] every render.
  const sprints = useMemo(() => sprintsQuery.data ?? [], [sprintsQuery.data]);

  const developersQuery = useQuery<DeveloperResponse[]>({
    queryKey: ['developers'],
    queryFn: () => apiFetch('/api/developers/'),
  });
  const allDevelopers = developersQuery.data ?? [];

  // Prefetch comments on hover so data is ready before the drawer opens.
  // useCallback so the KanbanCard memo can compare prop references and skip
  // re-renders when items don't change.
  const prefetchComments = useCallback(
    (itemId: string) => {
      queryClient.prefetchQuery({
        queryKey: ['workItem', itemId, 'comments'],
        queryFn: () => apiFetch(`/api/comments/workitem/${itemId}`),
      });
    },
    [queryClient],
  );

  return {
    project,
    isLoading,
    workItems,
    sprints,
    allDevelopers,
    workItemFilters,
    prefetchComments,
  };
}
