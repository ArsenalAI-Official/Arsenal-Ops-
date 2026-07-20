// Pins the data contract of useProjectDetailData — the 528-LOC aggregator that
// fans out ProjectDetail's 11 reads and exposes the project + hub slices back to
// the orchestrator. Focus is the CONTRACT (loading→success transition, the
// slices land, the query keys are what CLAUDE.md documents, and the error/403
// paths), not every derived field of every mutation.
//
// Network is faked at the wire by MSW. The default handlers only serve
// GET /projects/:id (+ empty developers/sprints); this hook additionally reads
// overview + each hub sub-resource, and an unhandled request FAILS the test, so
// each test registers the full read surface via installHandlers(). Uses a
// createElement wrapper (not JSX in a .tsx) modeled on
// ProjectBoard/hooks/boardHooks.invalidation.test.ts — the QueryClient is the
// SAME instance the hook resolves against, so we can inspect its cache.
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type {
  ProjectDetailResponse,
  ProjectAnalyticsResponse,
  PrdAnalysisResponse,
  GoalResponse,
  MilestoneResponse,
  ActivityResponse,
  ProjectLinkResponse,
  SprintResponse,
  DeveloperResponse,
  WorkItemListResponse,
} from '@/client';

// sonner is a UI side effect (mutation success/error toasts), not the network
// boundary — stub it so the hook runs without a Toaster in the tree.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import { useProjectDetailData } from './useProjectDetailData';

const ID = '1';

// ── Fixtures (typed from the generated wire types) ──────────────────────────

const project: ProjectDetailResponse = {
  id: 1,
  name: 'Test Project',
  key_prefix: 'TP',
  description: 'A seeded project',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  developers: [],
  github_repo_urls: [],
  github_repo_url: null,
  github_repo_name: null,
  category_id: null,
  category_name: null,
  selected_architecture: null,
  work_item_stats: {
    total: 1,
    by_status: { todo: 1 },
    total_points: 0,
    completed: 0,
    completion_pct: 0,
  },
};

const analytics: ProjectAnalyticsResponse = {
  burndown_data: [],
  completed_points: 0,
  priority_distribution: {},
  status_distribution: {},
  team_performance: [],
  total_items: 0,
  total_story_points: 0,
  type_distribution: {},
  velocity_data: [],
};

const prdAnalysis: PrdAnalysisResponse = {
  id: 1,
  project_id: 1,
  key_features: ['Feature A'],
  recommended_tools: {},
  risks: [],
  technical_requirements: [],
  timeline: [],
  summary: 'Seeded PRD',
};

const goals: GoalResponse[] = [];
const milestones: MilestoneResponse[] = [];
const activities: ActivityResponse[] = [];
const links: ProjectLinkResponse[] = [];
const developers: DeveloperResponse[] = [];
const workItems: WorkItemListResponse[] = [];
const sprints: SprintResponse[] = [];

/** Register every read the hook issues on mount (default handlers cover only
 *  GET /projects/:id, /developers/, and the sprints route). */
function installHandlers() {
  server.use(
    http.get(`${API_BASE}/projects/:id/overview`, () =>
      HttpResponse.json({
        project,
        sprints,
        goals,
        milestones,
        activities,
        analytics,
        prdAnalysis,
        links,
      }),
    ),
    http.get(`${API_BASE}/projects/:id`, () => HttpResponse.json(project)),
    http.get(`${API_BASE}/workitems/`, () => HttpResponse.json(workItems)),
    http.get(`${API_BASE}/projects/:id/goals`, () => HttpResponse.json(goals)),
    http.get(`${API_BASE}/projects/:id/milestones`, () => HttpResponse.json(milestones)),
    http.get(`${API_BASE}/projects/:id/activity`, () => HttpResponse.json(activities)),
    http.get(`${API_BASE}/workitems/projects/:id/analytics`, () => HttpResponse.json(analytics)),
    http.get(`${API_BASE}/prd/projects/:id/analysis`, () => HttpResponse.json(prdAnalysis)),
    http.get(`${API_BASE}/projects/:id/links`, () => HttpResponse.json(links)),
    http.get(`${API_BASE}/developers/`, () => HttpResponse.json(developers)),
  );
}

function makeHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useProjectDetailData data contract', () => {
  it('transitions loading → success and exposes the seeded project + hub slices', async () => {
    installHandlers();
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useProjectDetailData(ID), { wrapper });

    // Starts loading (project query in flight).
    expect(result.current.isLoading).toBe(true);
    expect(result.current.project).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Project slice resolved from the seeded store.
    expect(result.current.project?.id).toBe(1);
    expect(result.current.project?.name).toBe('Test Project');
    expect(result.current.accessDenied).toBe(false);

    // Hub slices resolve to the seeded (empty) collections + analytics/prd once
    // hubLoading clears — assert the CONTRACT shape, not every derived field.
    await waitFor(() => expect(result.current.hubLoading).toBe(false));
    expect(result.current.analytics).toEqual(analytics);
    expect(result.current.prdAnalysis).toEqual(prdAnalysis);
    expect(result.current.goals).toEqual(goals);
    expect(result.current.milestones).toEqual(milestones);
    expect(result.current.activities).toEqual(activities);
    expect(result.current.sprints).toEqual(sprints);
    expect(result.current.links).toEqual(links);
    expect(result.current.hubWorkItems).toEqual(workItems);
    expect(result.current.allDevelopers).toEqual(developers);
  });

  it('populates the documented query keys in the shared cache', async () => {
    installHandlers();
    const { queryClient, wrapper } = makeHarness();
    const { result } = renderHook(() => useProjectDetailData(ID), { wrapper });

    await waitFor(() => expect(result.current.hubLoading).toBe(false));

    // The keys ProjectDetail owns per app/CLAUDE.md "Query keys". These are the
    // cross-cutting-invalidation contract other hooks rely on being prefix-
    // compatible with — a silent rename would break invalidation.
    expect(queryClient.getQueryData(['project', ID])).toBeTruthy();
    expect(queryClient.getQueryData(['projectOverview', ID])).toBeTruthy();
    expect(queryClient.getQueryData(['sprints', ID])).toEqual(sprints);
    expect(queryClient.getQueryData(['workItems', { project_id: ID }])).toEqual(workItems);
    expect(queryClient.getQueryData(['hubData', ID, 'goals'])).toEqual(goals);
    expect(queryClient.getQueryData(['hubData', ID, 'milestones'])).toEqual(milestones);
    expect(queryClient.getQueryData(['hubData', ID, 'activities'])).toEqual(activities);
    expect(queryClient.getQueryData(['hubData', ID, 'analytics'])).toEqual(analytics);
    expect(queryClient.getQueryData(['hubData', ID, 'prd'])).toEqual(prdAnalysis);
    expect(queryClient.getQueryData(['project', ID, 'links'])).toEqual(links);
    expect(queryClient.getQueryData(['developers'])).toEqual(developers);
  });

  it('sets accessDenied when the project fetch 403s (ApiError instanceof path)', async () => {
    installHandlers();
    // Fail BOTH the project fetch and overview — the overview effect primes the
    // ['project', id] cache, which would otherwise mask the 403.
    server.use(
      http.get(`${API_BASE}/projects/:id`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
      http.get(`${API_BASE}/projects/:id/overview`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useProjectDetailData(ID), { wrapper });

    await waitFor(() => expect(result.current.accessDenied).toBe(true));
    expect(result.current.project).toBeNull();
  });

  it('leaves project null (not accessDenied) when the project fetch 500s', async () => {
    installHandlers();
    server.use(
      http.get(`${API_BASE}/projects/:id`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
      http.get(`${API_BASE}/projects/:id/overview`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useProjectDetailData(ID), { wrapper });

    // A non-403 error resolves loading but does NOT flip accessDenied — the
    // orchestrator's "Project not found" fallback keys off this exact shape.
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.project).toBeNull();
    expect(result.current.accessDenied).toBe(false);
  });

  it('does not fetch (stays loading, project null) when id is undefined', async () => {
    installHandlers();
    const { queryClient, wrapper } = makeHarness();
    const { result } = renderHook(() => useProjectDetailData(undefined), { wrapper });

    // All queries are `enabled: !!id`, so nothing fires and no cache is written.
    expect(result.current.project).toBeNull();
    expect(queryClient.getQueryData(['project', undefined])).toBeUndefined();
  });
});
