// @vitest-environment jsdom
//
// CHARACTERIZATION net for the ProjectBoard decomposition (see
// .plans/projectboard-decomposition-20260611-1354.md). Pins the CURRENT
// board's observable behavior so the multi-commit refactor stays behavior-
// neutral. These tests treat the board as a black box (mock only the network
// surface + auth + sonner) and must keep passing through every commit.
//
// The highest-value case is `optimistic status change reverts on API reject`:
// it's invisible to `tsc`, fine-in-demo / broken-in-prod, and survives the
// refactor unchanged because it asserts board behavior, not internals.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────
const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

// Keep the real ApiError/permissionAwareError; override only the network fn.
vi.mock('@/lib/api', async (orig) => {
  const actual = await orig<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: apiFetchMock };
});
// can() === true so write affordances (StatusDotMenu etc.) render.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Tester', email: 't@t.com' },
    can: () => true,
    refreshCapabilities: vi.fn(),
  }),
}));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
  Toaster: () => null,
}));

import { ApiError } from '@/lib/api';
import ProjectBoard from './ProjectBoard';

// ── Fixtures ────────────────────────────────────────────────────────────────
const PROJECT = {
  id: 1,
  name: 'Test Project',
  key_prefix: 'TP',
  description: 'desc',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  developers: [],
  github_repo_url: null,
  github_repo_urls: [],
  github_repo_name: null,
  has_github_token: false,
};

const baseItem = {
  project_id: 1,
  type: 'task',
  priority: 'medium',
  assignee_id: null,
  assignee_name: null,
  reporter_name: null,
  story_points: null,
  estimated_hours: null,
  actual_hours: null,
  due_date: null,
  completed_at: null,
  sprint_id: null,
  parent_id: null,
  tags: [],
  description: '',
  created_at: '2026-01-02T00:00:00Z',
};
const ITEMS = [
  { ...baseItem, id: 'w1', key: 'TP-1', title: 'Build login page', status: 'todo' },
  { ...baseItem, id: 'w2', key: 'TP-2', title: 'Wire up API client', status: 'in_progress' },
];

function setupApiFetch({ putRejects = false }: { putRejects?: boolean } = {}) {
  apiFetchMock.mockImplementation((url: string, opts?: { method?: string }) => {
    const method = opts?.method ?? 'GET';
    if (url.startsWith('/api/workitems/') && (method === 'PUT' || method === 'PATCH')) {
      return putRejects
        ? Promise.reject(new ApiError(400, 'Subtask still open'))
        : Promise.resolve({});
    }
    if (url.startsWith('/api/projects/')) return Promise.resolve(PROJECT);
    if (url.startsWith('/api/workitems/board')) return Promise.resolve(ITEMS);
    if (url.includes('/sprints')) return Promise.resolve([]);
    if (url === '/api/developers/') return Promise.resolve([]);
    return Promise.resolve([]);
  });
}

function renderBoard(qc?: Parameters<typeof renderWithProviders>[1]) {
  return renderWithProviders(<ProjectBoard />, {
    route: '/project/1/board',
    path: '/project/:id/board',
    ...qc,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupApiFetch();
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('ProjectBoard characterization', () => {
  it('renders seeded work items on the board', async () => {
    renderBoard();
    expect(await screen.findByText('Build login page')).toBeTruthy();
    expect(screen.getByText('Wire up API client')).toBeTruthy();
  });

  it('switches board → list → epic and still shows the items', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Build login page');

    await user.click(screen.getByRole('tab', { name: /list/i }));
    expect(await screen.findByText('Build login page')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: /epic/i }));
    expect(await screen.findByText('Build login page')).toBeTruthy();
  });

  it('search filter narrows the visible items', async () => {
    const user = userEvent.setup();
    renderBoard();
    await screen.findByText('Build login page');

    const search = screen.getByPlaceholderText(/search/i);
    await user.type(search, 'login');

    await waitFor(() => expect(screen.queryByText('Wire up API client')).toBeNull());
    expect(screen.getByText('Build login page')).toBeTruthy();
  });

  it('optimistic status change REVERTS on API reject + surfaces an error toast', async () => {
    const user = userEvent.setup();
    setupApiFetch({ putRejects: true });
    renderBoard();
    await screen.findByText('Build login page');

    // StatusDotMenu lives in the list view. Switch there, open the menu for the
    // "todo" item, and pick "In Progress".
    await user.click(screen.getByRole('tab', { name: /list/i }));
    await screen.findByText('Build login page');

    const trigger = await screen.findByRole('button', {
      name: /Status: To Do\. Click to change\./i,
    });
    await user.click(trigger);

    const inProgress = await screen.findByRole('button', { name: /^In Progress$/i });
    await user.click(inProgress);

    // The PUT rejects → onError rolls the status back to "To Do" and toasts.
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls.flat().join(' ')).toMatch(/Subtask still open/i);
    // Reverted: w1's "To Do" trigger returns. (w2 is seeded in_progress, so an
    // "In Progress" trigger always exists — assert the revert via w1's label.)
    await waitFor(() =>
      expect(
        within(document.body).getByRole('button', {
          name: /Status: To Do\. Click to change\./i,
        }),
      ).toBeTruthy(),
    );
  });
});
