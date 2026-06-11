import { describe, it, expect } from 'vitest';
import type { Sprint } from '@/types/workItems';
import { validateSprintForm } from './sprintValidation';

const sprint = (over: Partial<Sprint>): Sprint =>
  ({
    id: 1,
    name: 'S',
    goal: '',
    status: 'planned',
    start_date: null,
    end_date: null,
    capacity_hours: null,
    velocity: null,
    total_items: 0,
    todo_count: 0,
    in_progress_count: 0,
    done_count: 0,
    total_points: 0,
    completed_points: 0,
    completion_pct: 0,
    ...over,
  }) as Sprint;

const OVERLAP = 'Sprint dates overlap with an existing sprint.';

describe('validateSprintForm', () => {
  it('passes a valid, non-overlapping sprint', () => {
    expect(
      validateSprintForm({
        form: { name: 'Sprint 2', goal: '', start_date: '2026-04-01', end_date: '2026-04-14' },
        sprints: [
          sprint({ id: 1, name: 'Sprint 1', start_date: '2026-03-01', end_date: '2026-03-14' }),
        ],
        overlapMessage: OVERLAP,
      }),
    ).toBeNull();
  });

  it('rejects a duplicate name (case/space-insensitive)', () => {
    expect(
      validateSprintForm({
        form: { name: '  sprint 1 ', goal: '', start_date: '2026-04-01', end_date: '2026-04-14' },
        sprints: [sprint({ id: 1, name: 'Sprint 1' })],
        overlapMessage: OVERLAP,
      }),
    ).toBe('A sprint with this name already exists');
  });

  it('allows reusing the edited sprint own name via excludeSprintId', () => {
    expect(
      validateSprintForm({
        form: { name: 'Sprint 1', goal: '', start_date: '2026-03-01', end_date: '2026-03-14' },
        sprints: [
          sprint({ id: 1, name: 'Sprint 1', start_date: '2026-03-01', end_date: '2026-03-14' }),
        ],
        excludeSprintId: 1,
        overlapMessage: OVERLAP,
      }),
    ).toBeNull();
  });

  it('requires start and end dates', () => {
    expect(
      validateSprintForm({
        form: { name: 'X', goal: '', start_date: '', end_date: '2026-04-14' },
        sprints: [],
        overlapMessage: OVERLAP,
      }),
    ).toBe('Start date is required');
    expect(
      validateSprintForm({
        form: { name: 'X', goal: '', start_date: '2026-04-01', end_date: '' },
        sprints: [],
        overlapMessage: OVERLAP,
      }),
    ).toBe('End date is required');
  });

  it('rejects end before start', () => {
    expect(
      validateSprintForm({
        form: { name: 'X', goal: '', start_date: '2026-04-14', end_date: '2026-04-01' },
        sprints: [],
        overlapMessage: OVERLAP,
      }),
    ).toBe('End date must be equal to or after start date');
  });

  it('rejects overlapping dates with the injected message', () => {
    expect(
      validateSprintForm({
        form: { name: 'New', goal: '', start_date: '2026-03-10', end_date: '2026-03-20' },
        sprints: [
          sprint({ id: 1, name: 'Sprint 1', start_date: '2026-03-01', end_date: '2026-03-14' }),
        ],
        overlapMessage: OVERLAP,
      }),
    ).toBe(OVERLAP);
    // create-flow message is also honored verbatim
    const createMsg = 'Sprint dates overlap with an existing sprint. Sprints cannot overlap.';
    expect(
      validateSprintForm({
        form: { name: 'New', goal: '', start_date: '2026-03-10', end_date: '2026-03-20' },
        sprints: [
          sprint({ id: 1, name: 'Sprint 1', start_date: '2026-03-01', end_date: '2026-03-14' }),
        ],
        overlapMessage: createMsg,
      }),
    ).toBe(createMsg);
  });

  it('ignores the excluded sprint when checking overlap', () => {
    expect(
      validateSprintForm({
        form: { name: 'Sprint 1', goal: '', start_date: '2026-03-10', end_date: '2026-03-20' },
        sprints: [
          sprint({ id: 1, name: 'Sprint 1', start_date: '2026-03-01', end_date: '2026-03-14' }),
        ],
        excludeSprintId: 1,
        overlapMessage: OVERLAP,
      }),
    ).toBeNull();
  });

  it('ignores existing sprints with missing dates for overlap', () => {
    expect(
      validateSprintForm({
        form: { name: 'New', goal: '', start_date: '2026-03-10', end_date: '2026-03-20' },
        sprints: [sprint({ id: 1, name: 'Sprint 1', start_date: null, end_date: null })],
        overlapMessage: OVERLAP,
      }),
    ).toBeNull();
  });
});
