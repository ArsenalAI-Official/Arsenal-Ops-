import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import type { DoneArchiveResponse } from '@/client';
import { apiFetch } from '@/lib/api';
import { slimToWorkItem } from '@/types/workItemMappers';
import type { WorkItem } from '@/types/workItems';
import { DONE_ARCHIVE_PAGE_SIZE } from '../lib/boardConstants';

const EMPTY_ITEMS: WorkItem[] = [];

/**
 * Owns the Done column's archive layer. The board endpoint excludes done items
 * completed more than 30 days ago (BOARD_DONE_MAX_AGE_DAYS server-side) so the
 * column — and the payload — stop growing unbounded. This hook backs the
 * column's "Show older" footer with two queries against
 * `GET /api/workitems/board/done-archive`:
 *
 *  1. A `limit=0` aggregates probe (total count + story points of everything
 *     past the cutoff) that runs with the board. It powers the footer label
 *     and keeps the header stats honest without loading a single archived row.
 *  2. A lazy `useInfiniteQuery` (pages of DONE_ARCHIVE_PAGE_SIZE, newest
 *     completed first) enabled only after the user clicks the footer.
 *
 * Both keys extend `['workItems', workItemFilters, 'board', ...]` — the same
 * memoized `workItemFilters` reference from useBoardData — so the mutation
 * hooks' prefix invalidation (`['workItems']`) refreshes the archive too: a
 * reopened archived ticket leaves the archive and appears on the board after
 * the settled refetch. Called ONCE in the ProjectBoard orchestrator
 * (CONVENTIONS rule 1); the loaded items are merged into the board's item
 * list there, NOT written into the main board cache — the optimistic mutation
 * hooks rely on that cache holding exactly the server's board payload.
 */
export function useDoneArchive(
  id: string | undefined,
  workItemFilters: { project_id: string | undefined },
) {
  // Whether the user has opened the archive this visit. Deliberately session-
  // local state (not persisted): the whole point is that old done tickets stay
  // out of the DOM until explicitly asked for.
  const [expanded, setExpanded] = useState(false);

  const statsQuery = useQuery<DoneArchiveResponse>({
    queryKey: ['workItems', workItemFilters, 'board', 'doneArchive', 'stats'],
    queryFn: () =>
      apiFetch<DoneArchiveResponse>(`/api/workitems/board/done-archive?project_id=${id}&limit=0`),
    enabled: !!id,
  });
  const archivedTotal = statsQuery.data?.total ?? 0;
  const archivedTotalPoints = statsQuery.data?.total_points ?? 0;

  const pagesQuery = useInfiniteQuery({
    queryKey: ['workItems', workItemFilters, 'board', 'doneArchive', 'pages'],
    queryFn: async ({ pageParam }) => {
      const res = await apiFetch<DoneArchiveResponse>(
        `/api/workitems/board/done-archive?project_id=${id}&limit=${DONE_ARCHIVE_PAGE_SIZE}&offset=${pageParam}`,
      );
      // Normalize to the canonical WorkItem view-model at the fetch boundary,
      // same as useBoardData does for the board payload.
      return { items: res.items.map(slimToWorkItem), total: res.total };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: !!id && expanded,
  });
  const { hasNextPage, isFetching: isFetchingPages, fetchNextPage } = pagesQuery;

  // Stable ref while collapsed / between loads so the merged-items memo in the
  // orchestrator (and BoardColumn's React.memo) hold.
  const archivedItems = useMemo(
    () => pagesQuery.data?.pages.flatMap((p) => p.items) ?? EMPTY_ITEMS,
    [pagesQuery.data],
  );

  // First click flips `expanded` (enabling the query fetches page 1);
  // subsequent clicks page forward.
  const loadOlder = useCallback(() => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    if (hasNextPage && !isFetchingPages) fetchNextPage();
  }, [expanded, hasNextPage, isFetchingPages, fetchNextPage]);

  return {
    /** Count of archived done items NOT yet loaded — drives the footer label. */
    archivedRemaining: Math.max(0, archivedTotal - archivedItems.length),
    /** Count + points of ALL archived done items — for the header stats. */
    archivedTotal,
    archivedTotalPoints,
    /** Loaded archive pages, normalized and flattened (newest first). */
    archivedItems,
    isLoadingArchive: expanded && isFetchingPages,
    loadOlder,
  };
}
