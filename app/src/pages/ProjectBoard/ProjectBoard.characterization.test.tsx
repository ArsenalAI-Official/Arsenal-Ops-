// CHARACTERIZATION net for the ProjectBoard decomposition (see
// .plans/projectboard-decomposition-20260611-1354.md). Pins the CURRENT
// board's observable behavior so the multi-commit refactor stays behavior-
// neutral. These tests treat the board as a black box and must keep passing
// through every commit.
//
// The network surface is intercepted at the wire by MSW: the default handlers
// serve the project, the board's two seeded items (Build login page / Wire up
// API client), and empty sprints/developers. Auth comes from the global hoisted
// mock (src/setupTests.ts), which grants every capability so the StatusDotMenu
// write affordance renders. Only sonner is stubbed in-file — a UI side effect,
// not the network boundary — so the reject case can assert the error toast.
//
// The highest-value case is `optimistic status change reverts on API reject`:
// it's invisible to `tsc`, fine-in-demo / broken-in-prod, and survives the
// refactor unchanged because it asserts board behavior, not internals.
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, message: vi.fn() },
  Toaster: () => null,
}));

import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { renderPage } from '@/test-utils/render';
import ProjectBoard from './ProjectBoard';

/** Make every work-item PUT reject so the optimistic write rolls back. */
function rejectWorkItemPuts() {
  server.use(
    http.put(`${API_BASE}/workitems/:id`, () =>
      HttpResponse.json({ detail: 'Subtask still open' }, { status: 400 }),
    ),
  );
}

function renderBoard() {
  return renderPage(<ProjectBoard />, {
    route: '/project/1/board',
    path: '/project/:id/board',
  });
}

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
    rejectWorkItemPuts();
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
