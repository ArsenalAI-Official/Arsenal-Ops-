/**
 * Admin queries inherit the global query defaults configured in
 * `src/lib/queryClient.ts` (staleTime 30s, `refetchOnMount: false`,
 * `refetchOnWindowFocus: true`). Concretely: switching between admin tabs while
 * the cached data is still fresh (<30s) reads straight from cache with no
 * spinner and no network round-trip; a teammate's write made in another session
 * that this client never invalidated surfaces on the next window-focus refetch;
 * and this client's own mutations invalidate the relevant admin keys explicitly,
 * so correctness never relies on TTL alone.
 *
 * This used to be `{ refetchOnMount: true }`, which forced every admin tab
 * switch to refetch even for <30s-fresh data. That override is gone — the empty
 * object keeps the `...ADMIN_REFETCH` spread sites as a stable seam (so future
 * per-query tuning is a one-file change) while contributing no options today.
 *
 * Accepted trade-off: a cross-session write this client never saw has up to a
 * ~30s (`staleTime`) visibility lag on a direct tab switch — identical to every
 * other view in the app, and covered in the common case by the window-focus
 * refetch.
 */
export const ADMIN_REFETCH = {} as const;
