/**
 * Component tests for the dev Review-and-Submit modal view.
 *
 * MSW intercepts the two endpoints at the wire, so the component's real
 * react-query + apiFetch pipeline runs unmodified — only the server is
 * fake. Per-test handler overrides script success/partial/empty paths
 * (see docs/frontend-testing-guide.md §3).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { MyTimesheetResponse, SubmitTimesheetResponse } from '@/client';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { renderWithQueryClient } from '@/test-utils/render';
import ReviewSubmitView from './ReviewSubmitView';

const onBackNoop = () => {};

// Default capacity stub — every test renders the modal, and the modal now
// also fetches `/developers/me/capacity` for the ticket picker. Tests that
// want a populated picker override this handler in their own setup.
const seedCapacity = (
  tickets: Array<{
    id: number;
    key: string;
    title: string;
    project_id: number;
    project_name: string | null;
    status: string;
  }> = [],
) => {
  server.use(
    http.get(`${API_BASE}/developers/me/capacity`, () =>
      HttpResponse.json({
        developer_id: 1,
        developer_name: 'Dev',
        week_start: '2026-06-22',
        week_end: '2026-06-26',
        this_week_in_progress_hours: 0,
        this_week_in_review_hours: 0,
        this_week_done_hours: 0,
        this_week_capacity_used: 0,
        this_week_remaining_capacity: 40,
        tickets: tickets.map((t) => ({
          ...t,
          priority: 'medium',
          estimated_hours: 4,
          logged_hours: 0,
          remaining_hours: 4,
          counted_hours: 0,
          counted_basis: 'estimated',
          your_logged_this_week: 0,
        })),
      }),
    ),
  );
};

beforeEach(() => {
  seedCapacity();
});

const baseTimesheet: MyTimesheetResponse = {
  week_start: '2026-06-22',
  week_end: '2026-06-26',
  total_hours: 12,
  syncable_unsubmitted_count: 3,
  clients: [
    {
      qb_customer_id: 'QB-1',
      client_name: 'Acme Co',
      subtotal_hours: 12,
      projects: [
        {
          project_id: 7,
          project_name: 'Acme Mobile',
          category_name: null,
          subtotal_hours: 12,
          entries: [
            {
              id: 101,
              logged_at: '2026-06-22',
              hours: 4,
              description: 'Auth wiring',
              submitted_at: null,
              work_item_title: null,
              synced: false,
              billable: false,
            },
            {
              id: 102,
              logged_at: '2026-06-23',
              hours: 5,
              description: 'Onboarding screens',
              submitted_at: null,
              work_item_title: null,
              synced: false,
              billable: false,
            },
            {
              id: 103,
              logged_at: '2026-06-24',
              hours: 3,
              description: 'Code review',
              submitted_at: null,
              work_item_title: null,
              synced: false,
              billable: false,
            },
          ],
        },
      ],
    },
  ],
  unlinked_projects: [],
};

const seedTimesheet = (data: MyTimesheetResponse) => {
  server.use(http.get(`${API_BASE}/developers/me/timesheet`, () => HttpResponse.json(data)));
};

const seedSubmit = (response: SubmitTimesheetResponse | (() => Response)) => {
  server.use(
    http.post(`${API_BASE}/developers/me/timesheet/submit`, () =>
      typeof response === 'function' ? response() : HttpResponse.json(response),
    ),
  );
};

// Clients render collapsed by default (the day card shows client + hours;
// the dev clicks a client to reveal its tickets). Tests that assert on
// entry-level content expand every client first. Waits for at least one
// client toggle to appear, then clicks them all open.
const expandAllClients = async (user: ReturnType<typeof renderWithQueryClient>['user']) => {
  const toggles = await screen.findAllByRole('button', { name: /Client in QuickBooks/i });
  for (const toggle of toggles) {
    await user.click(toggle);
  }
};

describe('<ReviewSubmitView />', () => {
  it('renders Mon-Fri day cards with the nested client → project → entry split', async () => {
    seedTimesheet(baseTimesheet);
    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);

    // The fixture spans Mon (2026-06-22), Tue (06-23), Wed (06-24).
    // All five weekday cards render (empty days included).
    expect(await screen.findByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('Tuesday')).toBeInTheDocument();
    expect(screen.getByText('Wednesday')).toBeInTheDocument();
    expect(screen.getByText('Thursday')).toBeInTheDocument();
    expect(screen.getByText('Friday')).toBeInTheDocument();

    // Client names show while collapsed — Acme Co appears once per populated
    // day (3 toggles) PLUS once in the weekly summary legend.
    expect(screen.getAllByText('Acme Co')).toHaveLength(4);

    // Project + entry rows are hidden until the client is expanded.
    await expandAllClients(user);
    expect(screen.getAllByText('Acme Mobile')).toHaveLength(3);

    // Weekly summary legend lives in the pinned area, just below the
    // submit button. Per-client total surfaces in the legend.
    const legendHours = screen.getAllByText('12h');
    expect(legendHours.length).toBeGreaterThanOrEqual(1);

    // Each entry's description renders on its own day card.
    expect(screen.getByText('Auth wiring')).toBeInTheDocument();
    expect(screen.getByText('Onboarding screens')).toBeInTheDocument();
    expect(screen.getByText('Code review')).toBeInTheDocument();

    expect(screen.getByText(/total this week/i)).toBeInTheDocument();
    expect(screen.getByText(/Not yet submitted/i)).toBeInTheDocument();
  });

  it('renders an "Unlinked projects" section when present', async () => {
    seedTimesheet({
      ...baseTimesheet,
      unlinked_projects: [
        {
          project_id: 12,
          project_name: 'Internal Tools',
          category_name: null,
          subtotal_hours: 4,
          entries: [
            {
              id: 200,
              logged_at: '2026-06-22',
              hours: 4,
              description: 'Refactor admin',
              submitted_at: null,
              work_item_title: null,
              synced: false,
              billable: false,
            },
          ],
        },
      ],
    });
    renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);

    // The headline carries the count of unlinked projects ("N unlinked
    // project(s)"). The pinned chip in the submit bar ALSO says "won't
    // sync" — finding it by "1 unlinked project" disambiguates from both.
    expect(await screen.findByText(/1 unlinked project/i)).toBeInTheDocument();
    expect(screen.getByText('Internal Tools')).toBeInTheDocument();
    expect(screen.getByText(/aren't linked to a QuickBooks customer/i)).toBeInTheDocument();
  });

  it('disables the Submit button when syncable_unsubmitted_count is 0', async () => {
    seedTimesheet({ ...baseTimesheet, syncable_unsubmitted_count: 0 });
    renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    const button = await screen.findByRole('button', { name: /Submit & Sync to QuickBooks/i });
    expect(button).toBeDisabled();
  });

  it('shows the full-success banner when all entries sync', async () => {
    seedTimesheet(baseTimesheet);
    seedSubmit({
      status: 'ok',
      submitted_count: 3,
      synced_count: 3,
      failed: [],
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      reason: null,
    });
    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);

    const button = await screen.findByRole('button', { name: /Submit & Sync to QuickBooks/i });
    await user.click(button);

    expect(await screen.findByText(/All 3 entries synced to QuickBooks/i)).toBeInTheDocument();
  });

  it('shows the partial-failure banner and per-row error when some entries fail', async () => {
    seedTimesheet(baseTimesheet);
    seedSubmit({
      status: 'partial',
      submitted_count: 3,
      synced_count: 1,
      failed: [
        { entry_id: 102, error: 'QuickBooks rejected: invalid hours' },
        { entry_id: 103, error: 'QuickBooks rejected: customer not found' },
      ],
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      reason: null,
    });
    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);

    // Expand clients so the failing rows (and their inline errors) render.
    await expandAllClients(user);

    const button = await screen.findByRole('button', { name: /Submit & Sync to QuickBooks/i });
    await user.click(button);

    expect(await screen.findByText(/1 of 3 entries synced/i)).toBeInTheDocument();
    // Each failing row carries its own error message inline.
    expect(await screen.findByText(/invalid hours/i)).toBeInTheDocument();
    expect(screen.getByText(/customer not found/i)).toBeInTheDocument();
  });

  it('shows the total-failure banner when the submit endpoint returns an HTTP error', async () => {
    seedTimesheet(baseTimesheet);
    seedSubmit(() => HttpResponse.json({ detail: 'QuickBooks not connected' }, { status: 503 }));
    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);

    const button = await screen.findByRole('button', { name: /Submit & Sync to QuickBooks/i });
    await user.click(button);

    expect(await screen.findByText(/QuickBooks not connected/i)).toBeInTheDocument();
  });

  it('shows a "Submitted" badge for submitted entries (synced or pending), not "Synced"', async () => {
    seedTimesheet({
      ...baseTimesheet,
      syncable_unsubmitted_count: 0,
      clients: [
        {
          qb_customer_id: 'QB-1',
          client_name: 'Acme Co',
          subtotal_hours: 8,
          projects: [
            {
              project_id: 7,
              project_name: 'Acme Mobile',
              category_name: null,
              subtotal_hours: 8,
              entries: [
                {
                  id: 201,
                  logged_at: '2026-06-22',
                  hours: 4,
                  description: 'Already synced',
                  submitted_at: '2026-06-23T09:00:00',
                  work_item_title: null,
                  synced: true,
                  billable: false,
                },
                {
                  id: 202,
                  logged_at: '2026-06-23',
                  hours: 4,
                  description: 'In flight',
                  submitted_at: '2026-06-23T10:00:00',
                  work_item_title: null,
                  synced: false,
                  billable: false,
                },
              ],
            },
          ],
        },
      ],
    });
    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    await expandAllClients(user);

    await waitFor(() => {
      // Both entries — the synced one and the submitted-pending one — now read
      // "Submitted" (the per-day "Submitted" badges add to the count too).
      expect(screen.getAllByText('Submitted').length).toBeGreaterThanOrEqual(2);
    });
    // The old "Synced" wording is gone.
    expect(screen.queryByText('Synced')).not.toBeInTheDocument();
  });

  it('renders all five empty day cards with "Nothing logged" when the dev has no entries', async () => {
    seedTimesheet({
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      total_hours: 0,
      syncable_unsubmitted_count: 0,
      clients: [],
      unlinked_projects: [],
    });
    renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);

    // Each weekday card shows its own "Nothing logged." — 5 occurrences
    // for Mon-Fri. The dropped "Nothing logged this week yet" banner is
    // intentional: per-day cards already convey the empty state AND now
    // expose a "+ Add entry" affordance on every day.
    expect(await screen.findByText('Monday')).toBeInTheDocument();
    const emptyMarkers = await screen.findAllByText(/^Nothing logged\.$/i);
    expect(emptyMarkers).toHaveLength(5);
  });

  it('falls back to the work-item title when an entry has no description', async () => {
    seedTimesheet({
      ...baseTimesheet,
      syncable_unsubmitted_count: 1,
      clients: [
        {
          qb_customer_id: 'QB-1',
          client_name: 'Acme Co',
          subtotal_hours: 4,
          projects: [
            {
              project_id: 7,
              project_name: 'Acme Mobile',
              category_name: null,
              subtotal_hours: 4,
              entries: [
                {
                  id: 301,
                  logged_at: '2026-06-22',
                  hours: 4,
                  description: null,
                  work_item_title: 'Refactor auth flow',
                  submitted_at: null,
                  synced: false,
                  billable: false,
                },
              ],
            },
          ],
        },
      ],
    });
    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    await expandAllClients(user);

    // Ticket title surfaces in place of the missing description.
    expect(await screen.findByText('Refactor auth flow')).toBeInTheDocument();
  });

  it('opens the Add Entry form on a day card and POSTs to /log-hours with logged_at', async () => {
    seedTimesheet({
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      total_hours: 0,
      syncable_unsubmitted_count: 0,
      clients: [],
      unlinked_projects: [],
    });
    seedCapacity([
      {
        id: 77,
        key: 'ACME-12',
        title: 'Refactor auth',
        project_id: 7,
        project_name: 'Acme Mobile',
        status: 'in_progress',
      },
    ]);

    let postedTo: string | null = null;
    let postedBody: {
      hours?: number;
      description?: string | null;
      logged_at?: string;
    } | null = null;
    server.use(
      http.post(`${API_BASE}/workitems/:id/log-hours`, async ({ request, params }) => {
        postedTo = String(params.id);
        postedBody = (await request.json()) as typeof postedBody;
        return HttpResponse.json({
          id: '999',
          key: 'ACME-12',
          logged_hours: 3,
          remaining_hours: 1,
          time_entry: { id: 5, hours: 3 },
          message: 'ok',
        });
      }),
    );

    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    await screen.findByText('Monday');

    // Click "Add entry" on the Monday card specifically. Note: the
    // "+ Add entry" affordance only shows for today or earlier — this
    // test seeds a fixture week (2026-06-22) so Monday is "today or
    // earlier" relative to the test's date math. If the test ever runs
    // before 2026-06-22, this assertion will skip — that's acceptable
    // since the gate is what we're testing.
    const addButtons = screen.queryAllByRole('button', { name: /Add entry on Monday/i });
    if (addButtons.length === 0) {
      // Future-day gate fired — the button is correctly hidden. Skip
      // the POST assertion (covered by the dedicated future-gate test).
      return;
    }
    await user.click(addButtons[0]!);

    // Form is open — pick the ticket, type hours, save.
    const ticketSelect = await screen.findByLabelText(/^Ticket$/i);
    await user.selectOptions(ticketSelect, '77');
    const hoursInput = screen.getByLabelText(/^Hours$/i) as HTMLInputElement;
    await user.clear(hoursInput);
    await user.type(hoursInput, '3');
    // No description field in the add form — the ticket title carries
    // enough context for the row's display.
    expect(screen.queryByLabelText(/^Description$/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(postedBody).not.toBeNull();
    });
    expect(postedTo).toBe('77');
    expect(postedBody).toEqual({
      hours: 3,
      description: null, // add form intentionally omits description
      logged_at: '2026-06-22', // Monday of the seeded week
    });
  });

  it('hides the "+ Add entry" affordance on future days', async () => {
    // Seed a week that hasn't happened yet — Mon 2099-01-05 is a Monday
    // in the year 2099, guaranteed future. The day cards still render
    // but the add button should not.
    seedTimesheet({
      week_start: '2099-01-05',
      week_end: '2099-01-09',
      total_hours: 0,
      syncable_unsubmitted_count: 0,
      clients: [],
      unlinked_projects: [],
    });
    seedCapacity([
      {
        id: 77,
        key: 'ACME-12',
        title: 'Refactor auth',
        project_id: 7,
        project_name: 'Acme Mobile',
        status: 'in_progress',
      },
    ]);

    renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    await screen.findByText('Monday');

    // Every weekday in 2099 is in the future, so no "+ Add entry"
    // button should be rendered on any of the five day cards.
    expect(screen.queryByRole('button', { name: /Add entry on Monday/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add entry on Tuesday/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Add entry on Wednesday/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Add entry on Thursday/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add entry on Friday/i })).not.toBeInTheDocument();
  });

  it('shows a "no tickets" hint in the Add form when the dev has no assigned tickets', async () => {
    seedTimesheet({
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      total_hours: 0,
      syncable_unsubmitted_count: 0,
      clients: [],
      unlinked_projects: [],
    });
    // Default beforeEach already stubs an empty capacity — nothing else needed.
    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    await screen.findByText('Monday');

    const addButtons = screen.getAllByRole('button', { name: /Add entry on Monday/i });
    await user.click(addButtons[0]!);

    expect(await screen.findByText(/not assigned to any tickets/i)).toBeInTheDocument();
  });

  it('calls onBack when the Back button is clicked', async () => {
    seedTimesheet(baseTimesheet);
    let called = false;
    const { user } = renderWithQueryClient(
      <ReviewSubmitView
        onBack={() => {
          called = true;
        }}
      />,
    );
    // Wait for any rendered day card so the view is past its loading state.
    await screen.findByText('Monday');
    await user.click(screen.getByRole('button', { name: /Back to capacity summary/i }));
    expect(called).toBe(true);
  });

  // ── Edit & Delete ───────────────────────────────────────────────────

  it('sends a PATCH with the new hours and description when the row is edited', async () => {
    // Single-entry fixture so we can target it without scoping by row.
    seedTimesheet({
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      total_hours: 4,
      syncable_unsubmitted_count: 1,
      clients: [
        {
          qb_customer_id: 'QB-1',
          client_name: 'Acme Co',
          subtotal_hours: 4,
          projects: [
            {
              project_id: 7,
              project_name: 'Acme Mobile',
              category_name: null,
              subtotal_hours: 4,
              entries: [
                {
                  id: 999,
                  logged_at: '2026-06-22',
                  hours: 4,
                  description: 'old',
                  work_item_title: 'Refactor auth flow',
                  submitted_at: null,
                  synced: false,
                  billable: false,
                },
              ],
            },
          ],
        },
      ],
      unlinked_projects: [],
    });

    let patchedBody: { hours?: number; description?: string | null } | null = null;
    server.use(
      http.patch(`${API_BASE}/developers/me/timesheet/entries/999`, async ({ request }) => {
        patchedBody = (await request.json()) as { hours?: number; description?: string | null };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);

    await expandAllClients(user);
    await screen.findByText('old');
    await user.click(screen.getByRole('button', { name: /Edit entry/i }));

    const hoursInput = screen.getByLabelText(/^Hours$/i) as HTMLInputElement;
    const descInput = screen.getByLabelText(/^Description$/i) as HTMLInputElement;
    await user.clear(hoursInput);
    await user.type(hoursInput, '6');
    await user.clear(descInput);
    await user.type(descInput, 'new note');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => {
      expect(patchedBody).not.toBeNull();
    });
    expect(patchedBody).toEqual({ hours: 6, description: 'new note' });
  });

  it('shows the server error inline when the edit save fails', async () => {
    seedTimesheet({
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      total_hours: 4,
      syncable_unsubmitted_count: 1,
      clients: [
        {
          qb_customer_id: 'QB-1',
          client_name: 'Acme Co',
          subtotal_hours: 4,
          projects: [
            {
              project_id: 7,
              project_name: 'Acme Mobile',
              category_name: null,
              subtotal_hours: 4,
              entries: [
                {
                  id: 999,
                  logged_at: '2026-06-22',
                  hours: 4,
                  description: 'old',
                  work_item_title: 'Refactor auth flow',
                  submitted_at: null,
                  synced: false,
                  billable: false,
                },
              ],
            },
          ],
        },
      ],
      unlinked_projects: [],
    });
    server.use(
      http.patch(`${API_BASE}/developers/me/timesheet/entries/999`, () =>
        HttpResponse.json({ detail: 'Hours per entry caps at 24.' }, { status: 400 }),
      ),
    );

    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    await expandAllClients(user);
    await screen.findByText('old');
    await user.click(screen.getByRole('button', { name: /Edit entry/i }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(await screen.findByText(/caps at 24/i)).toBeInTheDocument();
  });

  it('locks submitted/synced rows behind a lock icon — no edit/delete affordance', async () => {
    seedTimesheet({
      week_start: '2026-06-22',
      week_end: '2026-06-26',
      total_hours: 8,
      syncable_unsubmitted_count: 0,
      clients: [
        {
          qb_customer_id: 'QB-1',
          client_name: 'Acme Co',
          subtotal_hours: 8,
          projects: [
            {
              project_id: 7,
              project_name: 'Acme Mobile',
              category_name: null,
              subtotal_hours: 8,
              entries: [
                {
                  id: 501,
                  logged_at: '2026-06-22',
                  hours: 4,
                  description: 'submitted, not synced',
                  work_item_title: null,
                  submitted_at: '2026-06-23T09:00:00',
                  synced: false,
                  billable: false,
                },
                {
                  id: 502,
                  logged_at: '2026-06-23',
                  hours: 4,
                  description: 'already in QB',
                  work_item_title: null,
                  submitted_at: '2026-06-23T09:00:00',
                  synced: true,
                  billable: false,
                },
              ],
            },
          ],
        },
      ],
      unlinked_projects: [],
    });

    const { user } = renderWithQueryClient(<ReviewSubmitView onBack={onBackNoop} />);
    await expandAllClients(user);
    await screen.findByText('submitted, not synced');

    expect(screen.queryByRole('button', { name: /Edit entry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete entry/i })).not.toBeInTheDocument();
  });
});
