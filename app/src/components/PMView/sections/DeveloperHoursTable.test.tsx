import { describe, it, expect } from 'vitest';
import { renderPlain } from '@/test-utils/render';
import type { DeveloperHours, HoursAnalytics } from '../types';
import DeveloperHoursTable from './DeveloperHoursTable';

// DeveloperHoursTable is a presentational table: the aggregation happens
// upstream and arrives as props. These tests assert the rows/cells/badges
// faithfully reflect the seeded developer-hours data (money-adjacent numbers),
// the empty state, and that the row-expand affordance reveals the breakdowns.

const dev = (patch: Partial<DeveloperHours>): DeveloperHours => ({
  developer_id: 1,
  developer_name: 'Ada Lovelace',
  developer_email: 'ada@arsenalai.com',
  role: 'Engineer',
  allocated_hours: 120,
  logged_hours: 80,
  remaining_hours: 40,
  current_week_logged: 12,
  total_items: 10,
  completed_items: 6,
  my_tickets: [],
  hours_logged_on_others_tickets: [],
  attribution_note: 'Hours attributed to the logger.',
  ...patch,
});

const analytics = (developer_hours: DeveloperHours[]): HoursAnalytics => ({
  project_name: 'Lattice Ledger',
  total_allocated_hours: 0,
  total_logged_hours: 0,
  total_remaining_hours: 0,
  sprint_hours: [],
  developer_hours,
  weekly_hours: [],
});

describe('DeveloperHoursTable', () => {
  it('renders the empty state when no developers are assigned', () => {
    const { getByText } = renderPlain(<DeveloperHoursTable analytics={analytics([])} />);
    expect(getByText('No developers assigned to this project')).toBeInTheDocument();
  });

  it('renders each developer row with allocated / logged / remaining / done cells', () => {
    const { getByText } = renderPlain(
      <DeveloperHoursTable
        analytics={analytics([
          dev({
            developer_id: 1,
            developer_name: 'Ada Lovelace',
            allocated_hours: 120,
            logged_hours: 80,
            remaining_hours: 40,
            completed_items: 6,
            total_items: 10,
            this_week_capacity_used: 18,
          }),
        ])}
      />,
    );
    expect(getByText('Ada Lovelace')).toBeInTheDocument();
    expect(getByText('ada@arsenalai.com')).toBeInTheDocument();
    expect(getByText('120h')).toBeInTheDocument(); // allocated
    expect(getByText('80h')).toBeInTheDocument(); // logged
    expect(getByText('40h')).toBeInTheDocument(); // remaining
    expect(getByText('18h/40h')).toBeInTheDocument(); // this-week capacity used
    expect(getByText('6/10')).toBeInTheDocument(); // done badge (completed/total)
  });

  it('renders one row per developer', () => {
    const { getByText } = renderPlain(
      <DeveloperHoursTable
        analytics={analytics([
          dev({ developer_id: 1, developer_name: 'Ada Lovelace' }),
          dev({ developer_id: 2, developer_name: 'Alan Turing', developer_email: 'alan@x.com' }),
        ])}
      />,
    );
    expect(getByText('Ada Lovelace')).toBeInTheDocument();
    expect(getByText('Alan Turing')).toBeInTheDocument();
  });

  it('expands a developer row to reveal the capacity breakdown, incl. per-status hours', async () => {
    const { getByText, user } = renderPlain(
      <DeveloperHoursTable
        analytics={analytics([
          dev({
            week_start: '2026-06-27',
            week_end: '2026-07-03',
            this_week_in_progress_hours: 5,
            this_week_in_review_hours: 3,
            this_week_done_hours: 2,
            this_week_capacity_used: 10,
            this_week_tickets: [
              {
                id: 100,
                key: 'LDG-100',
                title: 'Wire the pipeline',
                status: 'in_progress',
                priority: 'high',
                project_id: 1,
                project_name: 'Lattice Ledger',
                estimated_hours: 8,
                logged_hours: 5,
                remaining_hours: 3,
                started_at: null,
                last_assigned_at: null,
                completed_at: null,
                counted_hours: 5,
                counted_basis: 'logged',
              },
            ],
          }),
        ])}
      />,
    );
    // The breakdown headers aren't in the DOM until the row is expanded.
    expect(document.querySelector('h4')).toBeNull();
    await user.click(getByText('Ada Lovelace'));
    // Capacity view is the default on expand → the ticket + its column show.
    expect(getByText('This Week — by status')).toBeInTheDocument();
    expect(getByText('LDG-100')).toBeInTheDocument();
    expect(getByText('Wire the pipeline')).toBeInTheDocument();
    expect(getByText('Hours attributed to the logger.')).toBeInTheDocument();
  });

  it('toggles to the weekly-logged view and shows per-week bars', async () => {
    const { getByText, user } = renderPlain(
      <DeveloperHoursTable
        analytics={analytics([
          dev({
            logged_hours: 30,
            weekly_logged_history: [
              { week_start: '2026-06-06', week_end: '2026-06-12', hours: 12 },
              { week_start: '2026-06-13', week_end: '2026-06-19', hours: 18 },
            ],
          }),
        ])}
      />,
    );
    await user.click(getByText('Ada Lovelace'));
    await user.click(getByText('Logged hours per week'));
    // Header summarises total + week count from the history array.
    expect(getByText('30h total · 2 weeks')).toBeInTheDocument();
  });

  it('shows the no-history hint in the weekly view when history is empty', async () => {
    const { getByText, user } = renderPlain(
      <DeveloperHoursTable analytics={analytics([dev({ weekly_logged_history: [] })])} />,
    );
    await user.click(getByText('Ada Lovelace'));
    await user.click(getByText('Logged hours per week'));
    expect(getByText('No logged hours yet on this project.')).toBeInTheDocument();
  });
});
