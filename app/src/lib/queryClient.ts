/**
 * React Query client configuration.
 *
 * Defaults explained:
 *
 * - ``staleTime: 30s`` — repeated mounts within 30s use cached data without
 *   a network round-trip. This is what makes back-navigation feel instant.
 * - ``refetchOnMount: false`` — when a fresh-enough query is already in
 *   the cache, mounting a component that uses it doesn't fire a refetch.
 *   Combined with staleTime, this kills the "every navigation refetches"
 *   pattern the app had pre-react-query.
 * - ``refetchOnWindowFocus: true`` — refetch when the user tabs back, but
 *   only when the data is actually stale (>30s old). This replaces the
 *   manual ``visibilitychange`` + ``focus`` listeners in ProjectDetail
 *   and ProjectBoard.
 * - ``gcTime: 5min`` — how long unused cache entries stick around. Long
 *   enough to survive a quick out-and-back trip; short enough to bound
 *   memory.
 * - ``retry: 1`` for queries, ``retry: 0`` for mutations — queries are
 *   safe to retry once (transient network blip); mutations are not
 *   (might double-create on the server).
 *
 * Query-key conventions (use these in every useQuery / invalidateQueries):
 *
 *     ['projects']                          full project list
 *     ['project', id]                       single project
 *     ['workItems', filters]                work items, filters is the
 *                                           query-param object
 *     ['workItem', id]                      single work item
 *     ['workItem', id, 'comments']          nested resource of an item
 *     ['developers']                        full developer list
 *     ['personalTasks']                     current user's personal tasks
 *     ['myTasks']                           current user's assigned items
 *     ['sprints', projectId]                project's sprints
 *     ['hubData', projectId]                project's analytics + PRD
 *     ['admin', resource]                   admin-only resources
 *
 * Invalidate on mutation by prefix:
 *
 *     queryClient.invalidateQueries({ queryKey: ['workItems'] })   // all lists
 *     queryClient.invalidateQueries({ queryKey: ['workItem', id] })  // one item
 *     queryClient.invalidateQueries({ queryKey: ['project', id] })  // a project
 *
 * Mutation convention (use this shape — no raw apiFetch + .then/.catch):
 *
 *   const fooMutation = useMutation({
 *     mutationFn: (vars) => apiFetch('/api/...', { method: 'PUT', body: ... }),
 *     onMutate: async (vars) => {
 *       // Cancel by PREFIX so sibling queries with different filters can't
 *       // overwrite the optimistic state mid-flight.
 *       await queryClient.cancelQueries({ queryKey: ['workItems'] });
 *       const snapshot = queryClient.getQueryData(['workItems', filters]);
 *       queryClient.setQueryData(['workItems', filters], (old) => ...);
 *       return { snapshot };
 *     },
 *     onError: (_err, _vars, ctx) => {
 *       if (ctx?.snapshot) queryClient.setQueryData(['workItems', filters], ctx.snapshot);
 *       toast.error('Failed to ...');
 *     },
 *     onSettled: () => {
 *       queryClient.invalidateQueries({ queryKey: ['workItems'] });
 *       queryClient.invalidateQueries({ queryKey: ['myTasks'] }); // cross-cutting
 *     },
 *   });
 *
 * Rules:
 *  1. **No fire-and-forget** — every server write goes through useMutation so
 *     callers get isPending and rollback on failure.
 *  2. **Snapshot in onMutate, restore in onError** — if you write the cache
 *     optimistically, you must hold the previous value for rollback.
 *  3. **Capture identifiers in vars, not in closures** — pass workItemId etc.
 *     into mutate({...}) so onSuccess/onSettled can't read a stale or
 *     undefined value after the UI has changed (e.g. drawer closed).
 *  4. **Cross-cutting invalidation** — work-item writes invalidate both
 *     `['workItems']` and `['myTasks']`; user-role writes invalidate both
 *     `['admin','users']` and `['admin','employees']`.
 *  5. **Cancel by prefix, not exact key** — `cancelQueries({ queryKey: ['workItems'] })`
 *     covers all sibling filter combos.
 *  6. **Stabilize filter objects with useMemo** — query keys are compared by
 *     deep equality but closure stability still matters for callbacks.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Liveness vs. cost balance (matches the doc above):
      //  • staleTime 30s — within 30s repeated mounts use cache (instant
      //    back/forward); after 30s data is considered stale and eligible to
      //    refresh. Short enough that collaborative views (board) stay live.
      //  • refetchOnMount false — a fresh-enough cached query doesn't refetch
      //    on mount, so back-navigation stays instant.
      //  • refetchOnWindowFocus true — tab-back refreshes only stale (>30s)
      //    data, so teammates' changes appear without a manual reload. Safe to
      //    enable now that the list/board/analytics endpoints are cheap
      //    (backend N+1s collapsed) and writes are optimistic + prefix-invalidated.
      //  • gcTime 5min — unused cache survives a quick out-and-back trip.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnMount: false,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Don't retry on 404 — the resource genuinely doesn't exist.
        // Matches `ApiError` shape from `@/lib/api`.
        if (
          error &&
          typeof error === 'object' &&
          'status' in error &&
          (error as { status: number }).status === 404
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: 0,
    },
  },
});
