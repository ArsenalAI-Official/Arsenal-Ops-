// Integration smoke for the refactored WorkItemPanel, exercised through the
// real board so the whole chain runs (ProjectBoard → BoardModals →
// ItemDetailDrawer → WorkItemPanel → two-pane + Properties rail). Network is
// faked at the wire by MSW; auth is the global signed-in-admin mock. We assert
// observable behavior — the panel mounts on a ticket route, Escape closes the
// Radix Dialog, and pop-out detaches into a floating window — not internals.
//
// Radix Select interaction is deliberately NOT driven here: it's unreliable in
// jsdom (pointer-capture), and the inline-edit MUTATION path is already covered
// by boardHooks.invalidation.test.ts. Visual/interaction fidelity is Playwright's
// job (see app/CLAUDE.md).
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { projectStore } from '@/mocks/data/projects';
import { renderPage } from '@/test-utils/render';
import ProjectBoard from '@/pages/ProjectBoard/ProjectBoard';

// The open panel adds two reads beyond the board defaults: the per-item detail
// and its time-entries (TicketContributors). Literal `w1` paths so they don't
// shadow GET /workitems/board. We also seed the project with a developer so the
// rail's Assignee options are actually built — that path calls
// `avatarColor(d.id)`, and a broken color helper would crash the panel here
// (the empty-roster default would silently skip it).
function stubOpenItem() {
  server.use(
    http.get(`${API_BASE}/projects/1`, () =>
      HttpResponse.json({
        ...projectStore.get(),
        developers: [{ id: 1, name: 'Priya Menon', role: 'developer' }],
      }),
    ),
    http.get(`${API_BASE}/workitems/w1`, () =>
      HttpResponse.json({
        id: 1,
        key: 'TP-1',
        title: 'Build login page',
        status: 'todo',
        type: 'task',
        priority: 'medium',
        description: 'Detailed description of the login page work.',
        story_points: 3,
        assigned_hours: 8,
        logged_hours: 0,
        remaining_hours: 8,
        assignee_id: null,
        tags: [],
      }),
    ),
    http.get(`${API_BASE}/workitems/w1/time-entries`, () => HttpResponse.json([])),
  );
}

function renderTicket() {
  stubOpenItem();
  // Optional :ticketId so the board stays mounted when the panel closes and
  // navigates back to /board (both URLs route to ProjectBoard in the real app).
  return renderPage(<ProjectBoard />, {
    route: '/project/1/board/w1',
    path: '/project/:id/board/:ticketId?',
  });
}

describe('WorkItemPanel integration', () => {
  it('opens the docked panel for a ticket route', async () => {
    renderTicket();
    // Rail heading is unique to the open panel (the board card behind it is not
    // a reliable discriminator — the title also appears on the board).
    expect(await screen.findByText('Properties')).toBeTruthy();
    expect(screen.getByText('Description')).toBeTruthy();
  });

  it('closes on Escape (Radix Dialog)', async () => {
    const user = userEvent.setup();
    renderTicket();
    await screen.findByText('Properties');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByText('Properties')).toBeNull());
  });

  it('pop-out detaches the ticket into a floating window', async () => {
    const user = userEvent.setup();
    renderTicket();
    await screen.findByText('Properties');

    await user.click(screen.getByRole('button', { name: /pop out into a floating window/i }));

    // The docked dialog closes and a floating window renders the same ticket;
    // the floating header swaps the pop-out button for a dock-back button.
    expect(
      await screen.findByRole('button', { name: /dock back to the side panel/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pop out into a floating window/i })).toBeNull();
  });
});
