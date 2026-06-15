import { describe, it, expect } from 'vitest';
import type { Sprint } from '@/types/workItems';
import { isSprintCompleted, isSprintActive } from './sprintStatus';

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

const TODAY = '2026-03-15';

describe('isSprintCompleted', () => {
  it('true when status is completed', () => {
    expect(isSprintCompleted(sprint({ status: 'completed' }), TODAY)).toBe(true);
  });

  it('true when end_date is strictly before today', () => {
    expect(isSprintCompleted(sprint({ end_date: '2026-03-14' }), TODAY)).toBe(true);
  });

  it('false when end_date is today (boundary)', () => {
    expect(isSprintCompleted(sprint({ end_date: '2026-03-15' }), TODAY)).toBe(false);
  });

  it('false when end_date is in the future and not completed', () => {
    expect(isSprintCompleted(sprint({ end_date: '2026-03-20' }), TODAY)).toBe(false);
  });

  it('false when no end_date and not completed', () => {
    expect(isSprintCompleted(sprint({ end_date: null }), TODAY)).toBe(false);
  });
});

describe('isSprintActive', () => {
  it('true when status is active', () => {
    expect(isSprintActive(sprint({ status: 'active' }), TODAY)).toBe(true);
  });

  it('true when today is within [start_date, end_date] inclusive', () => {
    expect(
      isSprintActive(sprint({ start_date: '2026-03-10', end_date: '2026-03-20' }), TODAY),
    ).toBe(true);
    // boundaries inclusive
    expect(
      isSprintActive(sprint({ start_date: '2026-03-15', end_date: '2026-03-20' }), TODAY),
    ).toBe(true);
    expect(
      isSprintActive(sprint({ start_date: '2026-03-10', end_date: '2026-03-15' }), TODAY),
    ).toBe(true);
  });

  it('false when today is outside the range', () => {
    expect(
      isSprintActive(sprint({ start_date: '2026-03-16', end_date: '2026-03-20' }), TODAY),
    ).toBe(false);
    expect(
      isSprintActive(sprint({ start_date: '2026-03-01', end_date: '2026-03-14' }), TODAY),
    ).toBe(false);
  });

  it('false when dates are missing and status not active', () => {
    expect(isSprintActive(sprint({ start_date: null, end_date: null }), TODAY)).toBe(false);
  });
});
