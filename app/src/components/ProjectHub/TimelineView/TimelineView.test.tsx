import { describe, it, expect } from 'vitest';
import type { GoalResponse, MilestoneResponse, SprintResponse } from '@/client';
import { renderPlain } from '@/test-utils/render';
import TimelineView from './TimelineView';
import type { WorkItem } from './types';

// TimelineView draws a hand-rolled Gantt with plain divs/SVG-free layout (no
// recharts, no canvas), so it mounts in jsdom. It reads `new Date()` for the
// today marker + initial view window — that's fine at runtime; we only assert
// it renders the seeded rows without throwing, not exact pixel layout.

const workItems: WorkItem[] = [
  {
    id: 'wi-1',
    key: 'LDG-1',
    title: 'Design schema',
    status: 'done',
    start_date: '2026-02-01',
    due_date: '2026-02-10',
  },
  {
    id: 'wi-2',
    key: 'LDG-2',
    title: 'Build ingestion',
    status: 'in_progress',
    start_date: '2026-02-11',
    due_date: '2026-03-01',
  },
  {
    // No dates → filtered out of the rows list.
    id: 'wi-3',
    key: 'LDG-3',
    title: 'Undated backlog item',
    status: 'todo',
  },
];

const milestones: MilestoneResponse[] = [
  {
    id: 1,
    project_id: 1,
    title: 'MVP launch',
    is_completed: false,
    due_date: '2026-03-15',
  },
];

const goals: GoalResponse[] = [
  {
    id: 1,
    project_id: 1,
    title: 'Ship beta',
    status: 'in_progress',
    progress: 40,
    due_date: '2026-03-20',
  },
];

const sprints: SprintResponse[] = [
  {
    id: 1,
    name: 'Sprint 1',
    status: 'active',
    start_date: '2026-02-01',
    end_date: '2026-02-14',
    completed_points: 0,
    completion_pct: 0,
    done_count: 0,
    in_progress_count: 1,
    todo_count: 2,
    total_items: 3,
    total_points: 10,
  },
];

describe('TimelineView (render smoke)', () => {
  it('renders task/milestone/goal rows from seeded data without throwing', () => {
    const { getByText, getByTitle } = renderPlain(
      <TimelineView
        workItems={workItems}
        milestones={milestones}
        goals={goals}
        sprints={sprints}
        projectStartDate="2026-02-01"
        projectId={1}
      />,
    );
    // Dated work items appear as labelled rows (row-label span title = full
    // label; the label may also repeat inside a wide task bar, so match by the
    // unique row-label title attribute).
    expect(getByTitle('LDG-1: Design schema')).toBeInTheDocument();
    expect(getByTitle('LDG-2: Build ingestion')).toBeInTheDocument();
    // Milestone + goal rows get emoji-prefixed labels (row-label title attr).
    expect(getByTitle('🎯 MVP launch')).toBeInTheDocument();
    expect(getByTitle('⭐ Ship beta')).toBeInTheDocument();
    // Legend renders (static footer).
    expect(getByText('Overdue')).toBeInTheDocument();
  });

  it('renders the empty-state hint when no items carry dates', () => {
    const { getByText } = renderPlain(
      <TimelineView
        workItems={[{ id: 'x', key: 'LDG-9', title: 'No dates', status: 'todo' }]}
        projectStartDate="2026-02-01"
        projectId={1}
      />,
    );
    expect(getByText(/No tasks with dates/)).toBeInTheDocument();
  });
});
