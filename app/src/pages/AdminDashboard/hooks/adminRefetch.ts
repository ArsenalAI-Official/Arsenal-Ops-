/**
 * Admin queries refetch on mount only when the cached data is *stale* (older
 * than the global 30s staleTime). `refetchOnMount: true` — not `'always'` —
 * means a quick out-and-back, or a tab switch within 30s, reads straight from
 * cache with no spinner and no network round-trip; only aged data refetches,
 * in the background while the cached value stays on screen. Mutations still
 * invalidate explicitly, so this isn't relying on TTL alone to stay correct.
 */
export const ADMIN_REFETCH = { refetchOnMount: true } as const;
