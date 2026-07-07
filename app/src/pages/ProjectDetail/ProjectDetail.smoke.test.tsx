// Integration smoke net for ProjectDetail (the ~3,800-LOC orchestrator across
// ProjectDetail.tsx + its data hook + tabs/sections). Treats the page as a
// black box: mount it at a real route so `useParams` resolves `:id`, let the
// global admin auth mock grant every capability, and drive the network at the
// wire with MSW.
//
// The default handlers only serve GET /projects/:id (+ empty developers/
// sprints). ProjectDetail fans out ~11 more reads on mount (overview + each hub
// sub-resource + pulse), and an unhandled request FAILS the test — so this file
// registers the full mount-time surface via installProjectDetailHandlers().
//
// Lazy children (MermaidRenderer / ArchitectureEditor) are behind clicks and a
// null selected_architecture here, so they never resolve — we assert around the
// non-lazy chrome (header, tabs, Overview content) instead. See the note at the
// bottom for that limitation.
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import { renderPage } from '@/test-utils/render';
import ProjectDetail from './ProjectDetail';
import type { ProjectOverview } from './types';

// ── Fixtures (typed from the generated wire types) ──────────────────────────

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
  key_features: ['Auth', 'Reporting'],
  recommended_tools: {},
  risks: [],
  technical_requirements: ['Postgres'],
  timeline: [],
  summary: 'A seeded PRD summary for the smoke test.',
};

const goals: GoalResponse[] = [];
const milestones: MilestoneResponse[] = [];
const activities: ActivityResponse[] = [];
const sprints: SprintResponse[] = [];
const links: ProjectLinkResponse[] = [];
const developers: DeveloperResponse[] = [];
const workItems: WorkItemListResponse[] = [];

/** The overview round-trip bundles the project + every hub sub-resource. It
 *  reads the seeded project from the store so the bundled `project` matches the
 *  standalone GET /projects/:id handler. */
function overviewFor(project: ProjectDetailResponse): ProjectOverview {
  return { project, sprints, goals, milestones, activities, analytics, prdAnalysis, links };
}

/**
 * Register every read ProjectDetail issues on mount that the default handlers
 * don't already cover. GET /projects/:id, /developers/, and the sprints route
 * come from the default handlers (project served from the seeded store); the
 * rest are hub sub-resources + pulse endpoints registered here.
 */
function installProjectDetailHandlers(project: ProjectDetailResponse) {
  server.use(
    http.get(`${API_BASE}/projects/:id/overview`, () => HttpResponse.json(overviewFor(project))),
    http.get(`${API_BASE}/workitems/`, () => HttpResponse.json(workItems)),
    http.get(`${API_BASE}/projects/:id/goals`, () => HttpResponse.json(goals)),
    http.get(`${API_BASE}/projects/:id/milestones`, () => HttpResponse.json(milestones)),
    http.get(`${API_BASE}/projects/:id/activity`, () => HttpResponse.json(activities)),
    http.get(`${API_BASE}/workitems/projects/:id/analytics`, () => HttpResponse.json(analytics)),
    http.get(`${API_BASE}/prd/projects/:id/analysis`, () => HttpResponse.json(prdAnalysis)),
    // PRDAnalysisSection (rendered inside Overview when prdAnalysis is present)
    // probes for a saved roadmap template on mount; 404 → "no template yet".
    http.get(`${API_BASE}/prd/projects/:id/roadmap-template`, () =>
      HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
    ),
    http.get(`${API_BASE}/projects/:id/links`, () => HttpResponse.json(links)),
    http.get(`${API_BASE}/developers/`, () => HttpResponse.json(developers)),
    // Pulse endpoints fire from the parent's usePulseManualData/useMergedPulse.
    http.get(`${API_BASE}/projects/:id/pulse-derived`, () =>
      HttpResponse.json({ _meta: { degraded_sections: [] } }),
    ),
    http.get(`${API_BASE}/projects/:id/pulse-overrides`, () =>
      HttpResponse.json({ data: {}, updated_at: null, updated_by: null }),
    ),
  );
}

/** The seeded project the default GET /projects/:id handler returns. */
function seededProject(): ProjectDetailResponse {
  return {
    id: 1,
    name: 'Test Project',
    key_prefix: 'TP',
    description: 'A seeded project for tests',
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
      total: 2,
      by_status: { todo: 1, in_progress: 1 },
      total_points: 0,
      completed: 0,
      completion_pct: 0,
    },
  };
}

function renderProjectDetail() {
  return renderPage(<ProjectDetail />, {
    route: '/project/1',
    path: '/project/:id',
  });
}

describe('ProjectDetail smoke', () => {
  it('mounts a valid project and renders the header + tab strip', async () => {
    installProjectDetailHandlers(seededProject());
    renderProjectDetail();

    // Header renders the project name once the project query resolves.
    expect(await screen.findByRole('heading', { name: 'Test Project' })).toBeInTheDocument();
    // Tab strip is populated from the registry (admin sees every tab).
    expect(screen.getByRole('button', { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /project tracker/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /timeline/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /activity/i })).toBeInTheDocument();
  });

  it('renders Overview content (PRD summary) once all hub data resolves', async () => {
    installProjectDetailHandlers(seededProject());
    renderProjectDetail();

    // hubLoading gates the Overview body behind ALL hub queries; once they
    // resolve the PRD summary from the seeded analysis appears.
    expect(await screen.findByText('A seeded PRD summary for the smoke test.')).toBeInTheDocument();
  });

  it('shows the skeleton loading state while the project query is in flight', async () => {
    installProjectDetailHandlers(seededProject());
    // Hold BOTH the project fetch and the overview open so isLoading stays true
    // (a resolved overview would prime ['project', id] and flip the query to
    // success before we can observe the skeleton).
    let releaseProject: (() => void) | undefined;
    server.use(
      http.get(`${API_BASE}/projects/:id`, async () => {
        await new Promise<void>((resolve) => {
          releaseProject = resolve;
        });
        return HttpResponse.json(seededProject());
      }),
      http.get(`${API_BASE}/projects/:id/overview`, () => new Promise(() => {})),
    );

    renderProjectDetail();

    // The skeleton renders (role="status" loading region), and the header
    // heading has not appeared yet because the project is still loading.
    expect(await screen.findByRole('status', { name: /loading project/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Test Project' })).toBeNull();

    // Release the fetch so the test doesn't leak a pending request.
    releaseProject?.();
    await screen.findByRole('heading', { name: 'Test Project' });
  });

  it('renders an Access Denied UI when the project fetch 403s (not a crash)', async () => {
    installProjectDetailHandlers(seededProject());
    // Fail BOTH the standalone project fetch and the overview round-trip: the
    // overview effect primes the ['project', id] cache via setQueryData, so a
    // succeeding overview would mask the project query's 403.
    server.use(
      http.get(`${API_BASE}/projects/:id`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
      http.get(`${API_BASE}/projects/:id/overview`, () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );

    renderProjectDetail();

    // accessDenied (ApiError instanceof + status 403) branch renders the gate.
    expect(await screen.findByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to projects/i })).toBeInTheDocument();
  });

  it('renders an error UI (not a blank crash) when the project fetch 500s', async () => {
    installProjectDetailHandlers(seededProject());
    // Fail the overview too so it can't prime ['project', id] and mask the 500.
    server.use(
      http.get(`${API_BASE}/projects/:id`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
      http.get(`${API_BASE}/projects/:id/overview`, () =>
        HttpResponse.json({ detail: 'Server error' }, { status: 500 }),
      ),
    );

    renderProjectDetail();

    // A non-403 error is not accessDenied and leaves project null → the
    // "Project not found" fallback renders instead of a blank page/crash.
    expect(await screen.findByText(/project not found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to projects/i })).toBeInTheDocument();
    // A 500 is NOT the 403 Access-Denied branch — prove that gate did not render.
    expect(screen.queryByText(/access denied/i)).toBeNull();
  });
});

// LIMITATION: the lazy-loaded ArchitectureEditor and MermaidRenderer are not
// exercised here. ArchitectureEditor only mounts on an edit-architecture click,
// and MermaidRenderer lives inside ArchitectureSection which is gated on
// `project.selected_architecture` (null in these fixtures). Both are deferred to
// a Playwright pass per the testing guide's "brittle visual → not jsdom" rule.
