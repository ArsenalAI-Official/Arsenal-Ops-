// Pins the lazy-tab data behavior introduced by the "lazy tab data" PR
// (follow-up to #90): the ProjectDetail landing (`overview` tab) must paint as
// soon as the light `/overview` bundle is ready and must NOT fetch — nor wait
// on — the analytics / work-items queries that feed the Tracker and Timeline
// tabs. Those fetch lazily, gated on the active tab.
//
// Why this matters (plan risk R1): the Overview tab must gate only on the
// /overview bundle, never on the analytics/work-items queries. Those are
// disabled on the Overview tab, and a disabled TanStack Query v5 query reports
// `isLoading: false` (isLoading = isPending && isFetching, and a disabled query
// is not fetching). Gating Overview on such a flag would report a misleading
// "not loading" and could paint before data exists; each lazy query's flag is
// only meaningful on the tab where it's enabled. So the hook exposes a split
// loading surface:
//   - overviewLoading      → the /overview bundle (Overview + bundled tabs)
//   - analyticsLoading     → analyticsQuery (Tracker only)
//   - hubWorkItemsLoading  → hubWorkItemsQuery (Timeline only)
//
// Network is intercepted at the wire by MSW (docs/frontend-testing-guide.md).
// We count requests per endpoint to prove the lazy gating fires the right
// requests on the right tab and none on the landing. The lazy handlers use a
// small `delay` so the true→false loading transition is deterministically
// observable (otherwise an instant response can skip the loading render).
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { projectStore } from '@/mocks/data/projects';
import type { TabType } from '../types';
import { useProjectDetailData } from './useProjectDetailData';

const ID = '1';

// Per-endpoint request counters, wired via MSW so we assert *when* each lazy
// query actually hits the wire (not just its react-query enabled flag).
interface Counts {
  overview: number;
  analytics: number;
  workItems: number;
}

function installHandlers(): Counts {
  const counts: Counts = { overview: 0, analytics: 0, workItems: 0 };
  server.use(
    http.get(`${API_BASE}/projects/:id/overview`, () => {
      counts.overview += 1;
      // Only the fields the hook reads/seeds; analytics is intentionally absent
      // from the bundle now (loaded lazily by Tracker).
      return HttpResponse.json({
        project: projectStore.get(),
        sprints: [],
        goals: [],
        milestones: [],
        activities: [],
        prdAnalysis: null,
        links: [],
      });
    }),
    http.get(`${API_BASE}/workitems/projects/:id/analytics`, async () => {
      counts.analytics += 1;
      await delay(10); // keep the loading state observable for the true→false assertion
      return HttpResponse.json({
        total_items: 0,
        total_story_points: 0,
        completed_points: 0,
        status_distribution: {},
        velocity_data: [],
        burndown_data: [],
      });
    }),
    http.get(`${API_BASE}/workitems/`, async () => {
      counts.workItems += 1;
      await delay(10); // keep the loading state observable for the true→false assertion
      return HttpResponse.json([]);
    }),
  );
  return counts;
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe('useProjectDetailData — lazy tab data', () => {
  let counts: Counts;

  beforeEach(() => {
    counts = installHandlers();
  });

  it('landing on Overview paints from the bundle without fetching analytics/work-items', async () => {
    const { result } = renderHook(({ tab }: { tab: TabType }) => useProjectDetailData(ID, tab), {
      wrapper: makeWrapper(),
      initialProps: { tab: 'overview' as TabType },
    });

    // overviewLoading clears once the /overview bundle resolves...
    await waitFor(() => expect(result.current.overviewLoading).toBe(false));
    expect(result.current.project).not.toBeNull();

    // ...and it did NOT wait on (or fire) the Tracker/Timeline queries.
    expect(counts.overview).toBe(1);
    expect(counts.analytics).toBe(0);
    expect(counts.workItems).toBe(0);
  });

  it('opening Tracker lazily fetches analytics; analyticsLoading goes true → false', async () => {
    const { result, rerender } = renderHook(
      ({ tab }: { tab: TabType }) => useProjectDetailData(ID, tab),
      { wrapper: makeWrapper(), initialProps: { tab: 'overview' as TabType } },
    );

    await waitFor(() => expect(result.current.overviewLoading).toBe(false));
    expect(counts.analytics).toBe(0);

    rerender({ tab: 'tracker' as TabType });

    // The query enables and starts fetching: analyticsLoading goes true (the
    // handler delay keeps this observable)...
    await waitFor(() => expect(result.current.analyticsLoading).toBe(true));
    expect(counts.analytics).toBe(1);
    // ...then resolves to false with data.
    await waitFor(() => expect(result.current.analyticsLoading).toBe(false));
    expect(result.current.analytics).not.toBeNull();
    // Tracker reads analytics/sprints, not work items — Timeline is the sole
    // work-items consumer, so opening Tracker must not fetch them.
    expect(counts.workItems).toBe(0);
  });

  it('opening Timeline lazily fetches work-items; hubWorkItemsLoading goes true → false', async () => {
    const { result, rerender } = renderHook(
      ({ tab }: { tab: TabType }) => useProjectDetailData(ID, tab),
      { wrapper: makeWrapper(), initialProps: { tab: 'overview' as TabType } },
    );

    await waitFor(() => expect(result.current.overviewLoading).toBe(false));
    expect(counts.workItems).toBe(0);

    rerender({ tab: 'calendar' as TabType });

    // hubWorkItemsLoading goes true while the query fetches (handler delay keeps
    // it observable)...
    await waitFor(() => expect(result.current.hubWorkItemsLoading).toBe(true));
    expect(counts.workItems).toBe(1);
    // ...then resolves to false with data.
    await waitFor(() => expect(result.current.hubWorkItemsLoading).toBe(false));
    expect(result.current.hubWorkItems).toEqual([]);
    // Analytics is Tracker-only — Timeline must not have fetched it.
    expect(counts.analytics).toBe(0);
  });
});
