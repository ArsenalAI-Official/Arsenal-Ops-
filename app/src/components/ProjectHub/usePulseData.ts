/**
 * React-query hooks for the DB-derived Pulse overlay and the manual Pulse
 * overrides endpoint.
 *
 * Two server-side data sources feed the Pulse view:
 *   1. `useDerivedPulse` — `GET /api/projects/{id}/pulse-derived`. A
 *      server-computed snapshot of every Pulse-view field we can derive from
 *      `work_items`, `time_entries`, `sprints`, `project_milestones`, and
 *      `activity_logs`. Wholly read-only.
 *   2. `usePulseOverrides` / `usePulseOverridesMutation` —
 *      `GET/PUT /api/projects/{id}/pulse-overrides`. The editorial blob that
 *      used to live in `localStorage` under `pulse-data:<projectId>`. The
 *      server stores `data` opaquely; the front end still owns its shape.
 *
 * `usePulseManualData` is the façade for component consumers. It hides the
 * one-shot localStorage → server migration and exposes a single `manual`
 * `PulseData` that `useMergedPulse` overlays the derived data onto.
 *
 * `useMergedPulse` pairs the derived query with the manual `PulseData` and
 * returns the merged result. While the derived endpoint is loading or errors,
 * the merged value is exactly the manual data — the Pulse view stays fully
 * functional in the degraded path.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
// Note: `useRef` is used inside `usePulseManualData` to gate the one-shot
// migration; reading refs during render is forbidden by react-hooks v6, but
// reading them inside `useEffect` (where the migration fires) is fine.
import { toast } from 'sonner';
import { apiFetch, ApiError } from '@/lib/api';
import { DerivedPulseData, PulseData, mergePulseData } from './pulseData';

/** React-query key for the derived Pulse endpoint. Prefix-compatible with
 *  `invalidateQueries({ queryKey: ['pulseDerived'] })`. */
const pulseDerivedKey = (projectId: string | number) =>
  ['pulseDerived', String(projectId)] as const;

/** React-query key for the manual Pulse overrides endpoint. */
const pulseOverridesKey = (projectId: string | number) =>
  ['pulseOverrides', String(projectId)] as const;

const STORAGE_PREFIX = 'pulse-data:';

/**
 * Fetch the server-derived Pulse snapshot for a project.
 *
 * - `staleTime: 60_000` — the data is cheap to recompute but not free; 60s is
 *   enough to absorb tab churn without staleness becoming a problem.
 * - `enabled` only fires when a `projectId` is actually present so we don't
 *   issue a `/api/projects/undefined/pulse-derived` request during route
 *   transitions.
 */
export const useDerivedPulse = (projectId: string | number | null | undefined) =>
  useQuery<DerivedPulseData>({
    queryKey: pulseDerivedKey(projectId ?? ''),
    queryFn: () => apiFetch<DerivedPulseData>(`/api/projects/${projectId}/pulse-derived`),
    staleTime: 60_000,
    enabled: projectId !== null && projectId !== undefined && projectId !== '',
  });

/**
 * Convenience wrapper: pairs `useDerivedPulse` with the caller's manual
 * `PulseData` and returns the merged result.
 *
 * `data` is non-null whenever `manual` is — loading does NOT block the view.
 * When the derived query is loading or has errored, `data === manual`.
 */
export const useMergedPulse = (
  projectId: string | number | null | undefined,
  manual: PulseData | null,
): {
  data: PulseData | null;
  isLoading: boolean;
  isError: boolean;
  degradedSections: string[];
} => {
  const derivedQuery = useDerivedPulse(projectId);
  // Why: callers consume `data` as a useMemo/useEffect dep — without memoising
  // the wrapper object we'd re-fire on every render even when nothing changed.
  return useMemo(
    () => ({
      data: manual ? mergePulseData(manual, derivedQuery.data) : null,
      isLoading: derivedQuery.isLoading,
      isError: derivedQuery.isError,
      degradedSections: derivedQuery.data?._meta?.degraded_sections ?? [],
    }),
    [manual, derivedQuery.data, derivedQuery.isLoading, derivedQuery.isError],
  );
};

// ───────────────────────────────────────────────────────────────────────────
// Manual overrides — server-backed editorial blob
// ───────────────────────────────────────────────────────────────────────────

/** Lightweight identity payload for the `updated_by` field. */
export interface PulseOverridesUser {
  id: number;
  name: string;
  email: string;
}

/** Shape returned by `GET /api/projects/{id}/pulse-overrides`. `data` is a
 *  partial `PulseData` payload — anything the PM hasn't filled in is left to
 *  the `DUMMY_PULSE_DATA` fixture defaults. */
export interface PulseOverridesResponse {
  data: Partial<PulseData>;
  updated_at: string | null;
  updated_by: PulseOverridesUser | null;
}

/**
 * Fetch the manual Pulse overrides for a project.
 *
 * Returns the raw response (data + audit metadata). Empty-state response is
 * `{ data: {}, updated_at: null, updated_by: null }` — the caller is
 * responsible for falling back to localStorage / fixture defaults.
 */
export const usePulseOverrides = (projectId: string | number | null | undefined) =>
  useQuery<PulseOverridesResponse>({
    queryKey: pulseOverridesKey(projectId ?? ''),
    queryFn: () => apiFetch<PulseOverridesResponse>(`/api/projects/${projectId}/pulse-overrides`),
    staleTime: 60_000,
    enabled: projectId !== null && projectId !== undefined && projectId !== '',
  });

/**
 * Mutation for writing the manual Pulse overrides.
 *
 * Optimistic-update pattern per `app/CLAUDE.md`: snapshot the current cache,
 * write the new `data` straight into it, roll back on error, and let the
 * server response overwrite the optimistic write on success. On success we
 * also mirror to localStorage as an offline cache backup.
 */
export const usePulseOverridesMutation = (projectId: string | number | null | undefined) => {
  const queryClient = useQueryClient();
  const key = pulseOverridesKey(projectId ?? '');

  return useMutation<
    PulseOverridesResponse,
    Error,
    { data: Partial<PulseData> },
    { snapshot: PulseOverridesResponse | undefined }
  >({
    mutationFn: ({ data }) =>
      apiFetch<PulseOverridesResponse>(`/api/projects/${projectId}/pulse-overrides`, {
        method: 'PUT',
        body: JSON.stringify({ data }),
      }),
    onMutate: async ({ data }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<PulseOverridesResponse>(key);
      // Optimistic write: keep the audit fields stale until the server confirms.
      queryClient.setQueryData<PulseOverridesResponse>(key, (old) => ({
        data,
        updated_at: old?.updated_at ?? null,
        updated_by: old?.updated_by ?? null,
      }));
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(key, ctx.snapshot);
      // Why: surface the most actionable failure modes — permission and
      // payload-size — with targeted copy. Other failures fall through to
      // whatever the caller's mutateAsync rejection handler does.
      if (err instanceof ApiError) {
        if (err.status === 403) {
          toast.error("You don't have permission to edit Pulse settings.");
        } else if (err.status === 413) {
          toast.error('Pulse data is too large to save (>1MB). Trim some fields and retry.');
        }
      }
    },
    onSuccess: (response) => {
      // Server is the source of truth — overwrite cache with the response.
      queryClient.setQueryData<PulseOverridesResponse>(key, response);
      if (projectId !== null && projectId !== undefined && projectId !== '') {
        try {
          // Mirror to localStorage as an offline cache backup. Best-effort only.
          localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(response.data));
        } catch {
          /* localStorage may be unavailable (private mode, quota) — ignore. */
        }
      }
    },
  });
};

/**
 * Façade hook used by `ProjectDetail` and `PulseSettingsView`.
 *
 * Returns the merged-with-fixture `manual` PulseData plus a stable
 * `saveMutation` for the editor. Handles the one-shot localStorage → server
 * migration when the server has no overrides yet.
 *
 * Data-flow priority on first load:
 *   1. Server has data → that wins (merged with fixture for missing fields).
 *   2. Server is empty AND localStorage has data → migrate by saving the
 *      localStorage blob to the server; UI shows the parsed local data
 *      immediately (no flash of fixture).
 *   3. Server is empty AND localStorage is empty → fixture defaults.
 *   4. While the initial query is loading and localStorage has data → use
 *      localStorage as a placeholder so the editor stays populated.
 */
export const usePulseManualData = (
  projectId: string | number | null | undefined,
): {
  manual: PulseData | null;
  isLoading: boolean;
  updatedAt: string | null;
  updatedBy: PulseOverridesUser | null;
  saveMutation: ReturnType<typeof usePulseOverridesMutation>;
} => {
  const overridesQuery = usePulseOverrides(projectId);
  const saveMutation = usePulseOverridesMutation(projectId);

  // Read localStorage exactly once per projectId. Used for (a) the migration
  // path when the server is empty and (b) a loading-state placeholder so the
  // editor doesn't flash the fixture defaults before the server responds.
  const localCache = useMemo(() => readLocalCache(projectId), [projectId]);

  // One-shot migration: if the server has no override row AND we have a
  // localStorage blob, push it to the server. Three states matter:
  //   - in-flight: don't re-fire while the PUT is round-tripping.
  //   - succeeded: lock so we never re-migrate on this mount.
  //   - failed: reset so the next mount can retry; show a toast so the user
  //     knows their local edits aren't yet on the server.
  // Why distinguish by `updated_at` rather than just `data === {}`: an
  // intentionally-empty server payload (PM saved an empty blob) returns
  // `data: {}` AND `updated_at: <iso>`; we must NOT migrate over that.
  const migrationStateRef = useRef<'idle' | 'in-flight' | 'succeeded'>('idle');
  useEffect(() => {
    if (!projectId) return;
    if (!overridesQuery.data) return;
    if (migrationStateRef.current !== 'idle') return;
    const noServerRow = overridesQuery.data.updated_at === null;
    const hasLocal = localCache !== null && Object.keys(localCache).length > 0;
    if (!noServerRow || !hasLocal) return;
    migrationStateRef.current = 'in-flight';
    saveMutation
      .mutateAsync({ data: localCache })
      .then(() => {
        migrationStateRef.current = 'succeeded';
      })
      .catch(() => {
        // Reset so the next mount retries. The mutation's onError already
        // toasted for 403/413; for everything else, surface a generic note.
        migrationStateRef.current = 'idle';
        toast.error("Couldn't migrate local Pulse data to server — will retry on next load.");
      });
    // Why omit `saveMutation` from deps: TanStack v5 mutation objects are
    // stable across renders; listing it would cause spurious re-fires if a
    // future TanStack version changes that contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overridesQuery.data, projectId, localCache]);

  // `DUMMY_PULSE_DATA` lives in a lazy chunk to keep it out of the main
  // bundle — resolve once on mount, then memoise the merged result.
  const fixture = useFixture();

  const manual = useMemo<PulseData | null>(() => {
    if (!fixture) return null;
    // Server has a row (any contents, including intentionally empty) → it wins.
    // Why `updated_at !== null` rather than checking `data` keys: a PM who
    // deliberately saves an empty blob still owns the project's Pulse state;
    // we must not silently re-migrate localStorage over their explicit save.
    const serverHasRow = overridesQuery.data?.updated_at != null;
    if (serverHasRow) {
      return mergeWithFixture(fixture, overridesQuery.data!.data ?? {});
    }
    // Query still loading and we have a local cache → use it as placeholder.
    if (overridesQuery.isLoading && localCache && Object.keys(localCache).length > 0) {
      return mergeWithFixture(fixture, localCache);
    }
    // Migration in-flight or server-empty: render the local cache
    // optimistically so the editor stays populated through the PUT round-trip.
    if (overridesQuery.data && !serverHasRow && localCache && Object.keys(localCache).length > 0) {
      return mergeWithFixture(fixture, localCache);
    }
    // No data anywhere → fixture defaults.
    return fixture;
  }, [fixture, overridesQuery.data, overridesQuery.isLoading, localCache]);

  return {
    manual,
    isLoading: overridesQuery.isLoading || !fixture,
    updatedAt: overridesQuery.data?.updated_at ?? null,
    updatedBy: overridesQuery.data?.updated_by ?? null,
    saveMutation,
  };
};

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

/** Read & parse the legacy localStorage blob for a project, or null. */
const readLocalCache = (
  projectId: string | number | null | undefined,
): Partial<PulseData> | null => {
  if (projectId === null || projectId === undefined || projectId === '') return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Why: defend against legacy payloads with totally wrong shape (e.g. a
    // string, an array, or an object with none of our top-level keys) — they
    // would pollute the merged result if cast blind to Partial<PulseData>.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const expectedKeys: Array<keyof PulseData> = [
      'project',
      'summary',
      'ledger',
      'months',
      'risks',
      'milestones',
      'includedServices',
      'updates',
      'forecastVsActuals',
    ];
    const hasAnyKey = expectedKeys.some((k) => k in (parsed as Record<string, unknown>));
    if (!hasAnyKey) return null;
    return parsed as Partial<PulseData>;
  } catch {
    return null;
  }
};

/** Resolve the `DUMMY_PULSE_DATA` fixture once per mount. Lives in a separate
 *  chunk so it stays out of the main bundle (`pulseData.fixtures.ts`). */
const useFixture = (): PulseData | null => {
  const [fixture, setFixture] = useState<PulseData | null>(null);
  useEffect(() => {
    if (fixture) return;
    let cancelled = false;
    import('./pulseData.fixtures').then(({ DUMMY_PULSE_DATA }) => {
      if (!cancelled) setFixture(DUMMY_PULSE_DATA);
    });
    return () => {
      cancelled = true;
    };
  }, [fixture]);
  return fixture;
};

/**
 * Deep-merge a partial `PulseData` override blob onto the fixture defaults.
 * Mirrors the legacy `loadPulseData` shape so old localStorage payloads with
 * missing top-level keys keep rendering.
 */
const mergeWithFixture = (fixture: PulseData, override: Partial<PulseData>): PulseData => ({
  ...fixture,
  ...override,
  project: { ...fixture.project, ...(override.project ?? {}) },
  summary: { ...fixture.summary, ...(override.summary ?? {}) },
  includedServices:
    override.includedServices && Array.isArray(override.includedServices)
      ? override.includedServices
      : fixture.includedServices,
  forecastVsActuals: {
    ...fixture.forecastVsActuals,
    ...(override.forecastVsActuals ?? {}),
  },
});
