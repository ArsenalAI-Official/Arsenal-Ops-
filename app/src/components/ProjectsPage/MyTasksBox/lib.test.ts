import { describe, it, expect } from 'vitest';
import { priorityColor, sortPersonalTasks, sortUpcomingTasks, sortCompletedTasks } from './lib';
import type { MyTask, PersonalTask } from '../types';

const pt = (p: Partial<PersonalTask>): PersonalTask =>
  ({
    id: 1,
    title: 't',
    description: '',
    status: 'pending',
    priority: 'medium',
    estimated_hours: 0,
    tags: [],
    is_converted: false,
    ...p,
  }) as PersonalTask;
const mt = (p: Partial<MyTask>): MyTask =>
  ({
    id: '1',
    key: 'A-1',
    title: 't',
    type: 'task',
    status: 'todo',
    priority: 'medium',
    project_id: 1,
    project_name: 'P',
    due_date: null,
    completed_at: null,
    estimated_hours: null,
    logged_hours: null,
    ...p,
  }) as MyTask;

describe('priorityColor', () => {
  it('maps priorities to canonical hex, grey fallback', () => {
    expect(priorityColor('critical')).toBe('#EF4444');
    expect(priorityColor('high')).toBe('#F97316');
    expect(priorityColor('medium')).toBe('#F59E0B');
    expect(priorityColor('low')).toBe('#737373');
  });
});

describe('sortPersonalTasks', () => {
  it('pushes done tasks below pending ones', () => {
    const done = pt({ id: 1, status: 'done', priority: 'critical' });
    const pending = pt({ id: 2, status: 'pending', priority: 'low' });
    expect([done, pending].sort(sortPersonalTasks).map((t) => t.id)).toEqual([2, 1]);
  });
  it('orders pending tasks by priority (critical first)', () => {
    const med = pt({ id: 1, status: 'pending', priority: 'medium' });
    const crit = pt({ id: 2, status: 'pending', priority: 'critical' });
    expect([med, crit].sort(sortPersonalTasks).map((t) => t.id)).toEqual([2, 1]);
  });
});

describe('sortUpcomingTasks', () => {
  it('orders by ascending due date, undated last, without mutating input', () => {
    const input = [
      mt({ id: 'a', due_date: '2026-03-10' }),
      mt({ id: 'b', due_date: null }),
      mt({ id: 'c', due_date: '2026-01-05' }),
    ];
    expect(sortUpcomingTasks(input).map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(input.map((t) => t.id)).toEqual(['a', 'b', 'c']); // unmutated
  });
});

describe('sortCompletedTasks', () => {
  it('orders latest-completed first; missing completed_at sinks to the bottom', () => {
    const input = [
      mt({ id: 'a', completed_at: '2026-01-01' }),
      mt({ id: 'b', completed_at: null }),
      mt({ id: 'c', completed_at: '2026-05-01' }),
    ];
    expect(sortCompletedTasks(input).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });
});
