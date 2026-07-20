// Behavior coverage for the admin Time Entries tab. This surface is READ-ONLY
// (no log/edit-hours mutation lives under AdminDashboard — hours logging is on
// the ProjectBoard/WorkItemPanel, out of this scope), but it is MONEY-adjacent:
// it audits every hour logged across projects. The load-bearing behaviors are
// therefore (a) the filtered request carries the right query params and (b) the
// client-side (employee × project × day) aggregation sums hours correctly into
// the table. Those are what a regression would silently corrupt.
//
// Network faked at the wire by MSW; per-test we override GET /admin/time-entries
// to return a controlled payload (and capture the request URL for the filter
// assertion). Rows are stamped with "now" so they fall inside the default
// this-week preset regardless of when the suite runs — aggregation itself is
// range-independent (the client aggregates whatever the server returns).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import type { TimeEntriesResponse, TimeEntryRow } from '@/client';
import { server } from '@/mocks/node';
import { API_BASE } from '@/mocks/handlers/constants';
import { renderWithQueryClient } from '@/test-utils/render';
import TimeEntriesTab from './TimeEntriesTab';
import type { EmployeeOption, ProjectOption } from './types';

const projects: ProjectOption[] = [
  { id: 10, name: 'Apollo' },
  { id: 20, name: 'Borealis' },
];
const employees: EmployeeOption[] = [{ id: 5, name: 'Ada Lovelace', email: 'ada@x.com' }];

// Pin the wall clock so the this-week preset (computed from `new Date()` inside
// the component) is deterministic and rows stamped NOW always fall inside it,
// regardless of when the suite runs. A fixed mid-week instant.
const FIXED_NOW = new Date('2026-06-30T12:00:00.000Z');
const NOW = FIXED_NOW.toISOString();

const row = (over: Partial<TimeEntryRow>): TimeEntryRow => ({
  avatar_url: null,
  client_name: null,
  description: null,
  developer_email: 'ada@x.com',
  developer_id: 5,
  developer_name: 'Ada Lovelace',
  hours: 2,
  id: 1,
  logged_at: NOW,
  project_id: 10,
  project_name: 'Apollo',
  work_item_id: null,
  work_item_key: null,
  work_item_title: null,
  work_item_type: null,
  ...over,
});

function respondWith(payload: TimeEntriesResponse) {
  server.use(http.get(`${API_BASE}/admin/time-entries`, () => HttpResponse.json(payload)));
}

describe('TimeEntriesTab', () => {
  // shouldAdvanceTime keeps userEvent (used in the project-filter test) from
  // hanging under fake timers, while setSystemTime pins the this-week range.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('requests time entries and renders the aggregated rows', async () => {
    respondWith({ rows: [row({})], total_hours: 2, total_rows: 1, truncated: false });

    renderWithQueryClient(
      <TimeEntriesTab projects={projects} employees={employees} clients={[]} />,
    );

    // Once the query resolves, the entry renders as a row in the table body.
    // (The summary strip above the table is a date range + truncation notice,
    // not a totals card, so we assert against the aggregated row itself.)
    // Body rows are expandable, so each carries role="button" (the header <tr>
    // keeps role="row" and stays in <thead>).
    const table = await screen.findByRole('table');
    const tbody = table.querySelector('tbody') as HTMLElement;
    await waitFor(() => expect(within(tbody).getAllByRole('button').length).toBeGreaterThan(0));
    const bodyRow = within(tbody).getAllByRole('button')[0]!;
    expect(bodyRow.textContent).toContain('Ada Lovelace');
    expect(bodyRow.textContent?.replace(/\s/g, '')).toContain('2h');
  });

  it('aggregates on the (employee × project × day) key, not just employee/day', async () => {
    // Same dev, same day, but TWO projects. In the default "By Employee" view
    // the four entries roll up to ONE employee/day row (11h); its expandable
    // breakdown splits BY PROJECT — three Apollo entries → 6h, one Borealis → 5h.
    // A bug that merged on employee/day alone (ignoring project) would collapse
    // the breakdown to a single 11h child and fail the per-project assertions.
    respondWith({
      rows: [
        row({ id: 1, hours: 2 }),
        row({ id: 2, hours: 3 }),
        row({ id: 3, hours: 1 }),
        row({ id: 4, project_id: 20, project_name: 'Borealis', hours: 5 }),
      ],
      total_hours: 11,
      total_rows: 4,
      truncated: false,
    });

    const user = userEvent.setup();
    renderWithQueryClient(
      <TimeEntriesTab projects={projects} employees={employees} clients={[]} />,
    );

    // One top-level employee/day row, summing all four entries to 11h.
    const table = await screen.findByRole('table');
    const tbody = table.querySelector('tbody') as HTMLElement;
    await waitFor(() => expect(within(tbody).getAllByRole('button')).toHaveLength(1));
    const topRow = within(tbody).getAllByRole('button')[0]!;
    expect(topRow.textContent).toContain('Ada Lovelace');
    expect(topRow.textContent?.replace(/\s/g, '')).toContain('11h');

    // Expand → the breakdown splits by project: Apollo 6h + Borealis 5h. If the
    // aggregation ignored project, there'd be one 11h child instead of these two.
    await user.click(topRow);
    const breakdown = await screen.findByLabelText('Ada Lovelace breakdown');
    await waitFor(() => expect(breakdown.textContent).toContain('Borealis'));
    expect(breakdown.textContent).toContain('Apollo');
    expect(breakdown.textContent?.replace(/\s/g, '')).toContain('6h');
    expect(breakdown.textContent?.replace(/\s/g, '')).toContain('5h');
  });

  it('sends project_id in the query when a project filter is selected', async () => {
    let firstUrl = '';
    const urls: string[] = [];
    server.use(
      http.get(`${API_BASE}/admin/time-entries`, ({ request }) => {
        const u = new URL(request.url);
        urls.push(u.search);
        if (!firstUrl) firstUrl = u.search;
        return HttpResponse.json({ rows: [], total_hours: 0, total_rows: 0, truncated: false });
      }),
    );

    const user = userEvent.setup();
    renderWithQueryClient(
      <TimeEntriesTab projects={projects} employees={employees} clients={[]} />,
    );

    // Initial request (this-week preset) carries a date range but no project_id.
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(firstUrl).not.toContain('project_id');
    expect(firstUrl).toContain('date_from');

    // Select the Apollo project (id 10) → refetch with project_id=10. Query the
    // Project <select> by its accessible name, not by combobox position.
    const projectSelect = screen.getByRole('combobox', { name: /project/i });
    await user.selectOptions(projectSelect, '10');

    await waitFor(() => expect(urls.some((s) => s.includes('project_id=10'))).toBe(true));
  });

  it('shows the empty state when no entries match', async () => {
    respondWith({ rows: [], total_hours: 0, total_rows: 0, truncated: false });

    renderWithQueryClient(
      <TimeEntriesTab projects={projects} employees={employees} clients={[]} />,
    );

    expect(await screen.findByText(/No time entries match your filters/i)).toBeTruthy();
  });

  it('surfaces the error state when the request fails', async () => {
    server.use(
      http.get(`${API_BASE}/admin/time-entries`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    );

    renderWithQueryClient(
      <TimeEntriesTab projects={projects} employees={employees} clients={[]} />,
    );

    expect(await screen.findByText(/Failed to load time entries/i)).toBeTruthy();
  });
});
