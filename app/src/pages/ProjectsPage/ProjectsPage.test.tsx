// ProjectsPage (home) integration smoke. Zero coverage before this file.
//
// The home page fans out to several queries on mount — the projects list
// (['projects']), the cross-project my-tasks feed (['myTasks']), and the
// personal-tasks panel (['personalTasks']) — none of which the default MSW
// handler set covers. We register them per test. The heavy week-calendar is
// lazy and only imports when the section is expanded, so a plain mount stays
// cheap. Auth is the global hoisted admin.
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { MyTaskResponse, PersonalTaskResponse, ProjectDetailResponse } from '@/client';
import { API_BASE } from '@/mocks/handlers/constants';
import { server } from '@/mocks/node';
import { renderPage } from '@/test-utils/render';
import ProjectsPage from './ProjectsPage';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
  Toaster: () => null,
}));

function seedProject(overrides: Partial<ProjectDetailResponse> = {}): ProjectDetailResponse {
  return {
    id: 1,
    name: 'Apollo',
    key_prefix: 'AP',
    description: 'The Apollo project',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    developers: [],
    github_repo_urls: [],
    github_repo_url: null,
    github_repo_name: null,
    category_id: null,
    category_name: null,
    work_item_stats: {
      total: 0,
      by_status: {},
      total_points: 0,
      completed: 0,
      completion_pct: 42,
    },
    ...overrides,
  } as ProjectDetailResponse;
}

function seedMyTask(overrides: Partial<MyTaskResponse> = {}): MyTaskResponse {
  return {
    id: 'w1',
    key: 'AP-1',
    title: 'Wire up the launch sequence',
    type: 'task',
    status: 'todo',
    priority: 'high',
    assignee: 'Test User',
    is_overdue: false,
    project_id: 1,
    project_name: 'Apollo',
    due_date: null,
    completed_at: null,
    ...overrides,
  } as MyTaskResponse;
}

function installHomeBackend(
  opts: {
    projects?: ProjectDetailResponse[];
    myTasks?: MyTaskResponse[];
    personalTasks?: PersonalTaskResponse[];
  } = {},
) {
  server.use(
    http.get(`${API_BASE}/projects/`, () => HttpResponse.json(opts.projects ?? [])),
    http.get(`${API_BASE}/workitems/my-tasks`, () => HttpResponse.json(opts.myTasks ?? [])),
    http.get(`${API_BASE}/personal-tasks/`, () => HttpResponse.json(opts.personalTasks ?? [])),
    // DashboardStats → MyCapacityCard fetches the signed-in developer's capacity.
    http.get(`${API_BASE}/developers/me/capacity`, () =>
      HttpResponse.json({ weekly_capacity_hours: 40, allocations: [] }),
    ),
  );
}

describe('ProjectsPage (home)', () => {
  it('mounts and renders the seeded projects list', async () => {
    installHomeBackend({ projects: [seedProject({ id: 1, name: 'Apollo' })] });

    renderPage(<ProjectsPage />, { route: '/', path: '/' });

    // Column header + the seeded project row both render.
    expect(await screen.findByRole('heading', { name: /^Projects$/i })).toBeInTheDocument();
    expect(await screen.findByText('Apollo')).toBeInTheDocument();
  });

  it('renders an assigned work item from the ["myTasks"] feed in MyTasksBox', async () => {
    installHomeBackend({
      projects: [seedProject()],
      myTasks: [seedMyTask({ title: 'Wire up the launch sequence' })],
    });

    renderPage(<ProjectsPage />, { route: '/', path: '/' });

    expect(await screen.findByText('Wire up the launch sequence')).toBeInTheDocument();
  });
});
