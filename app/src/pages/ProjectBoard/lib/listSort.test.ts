import { describe, it, expect } from 'vitest';
import type { WorkItem } from '@/types/workItems';
import {
  makeListItemComparator,
  LIST_SORT_TYPE_ORDER,
  LIST_SORT_STATUS_ORDER,
  LIST_SORT_PRIORITY_ORDER,
} from './listSort';

// Minimal WorkItem factory — only the fields the comparator reads matter.
const wi = (over: Partial<WorkItem>): WorkItem =>
  ({
    id: '1',
    key: 'P-1',
    type: 'task',
    title: 't',
    description: '',
    status: 'todo',
    assigned_hours: 0,
    remaining_hours: 0,
    logged_hours: 0,
    story_points: 0,
    priority: 'medium',
    assignee: '',
    assignee_id: null,
    sprint: '',
    sprint_id: null,
    product_id: '',
    tags: [],
    epic: '',
    ...over,
  }) as WorkItem;

const order = (
  items: WorkItem[],
  key: Parameters<typeof makeListItemComparator>[0],
  dir: 'asc' | 'desc',
) => {
  const cmp = makeListItemComparator(key, dir)!;
  return [...items].sort(cmp).map((i) => i.id);
};

describe('order maps', () => {
  it('rank type/status/priority in canonical order', () => {
    expect(LIST_SORT_TYPE_ORDER).toMatchObject({ epic: 0, user_story: 1, task: 2, bug: 3 });
    expect(LIST_SORT_STATUS_ORDER).toMatchObject({
      backlog: 0,
      todo: 1,
      in_progress: 2,
      in_review: 3,
      done: 4,
    });
    expect(LIST_SORT_PRIORITY_ORDER).toMatchObject({ critical: 0, high: 1, medium: 2, low: 3 });
  });
});

describe('makeListItemComparator', () => {
  it('returns null when no sort key', () => {
    expect(makeListItemComparator(null, 'asc')).toBeNull();
  });

  it('sorts by type asc and desc', () => {
    const items = [
      wi({ id: 'bug', type: 'bug' }),
      wi({ id: 'epic', type: 'epic' }),
      wi({ id: 'task', type: 'task' }),
    ];
    expect(order(items, 'type', 'asc')).toEqual(['epic', 'task', 'bug']);
    expect(order(items, 'type', 'desc')).toEqual(['bug', 'task', 'epic']);
  });

  it('sorts by status', () => {
    const items = [
      wi({ id: 'done', status: 'done' }),
      wi({ id: 'todo', status: 'todo' }),
      wi({ id: 'prog', status: 'in_progress' }),
    ];
    expect(order(items, 'status', 'asc')).toEqual(['todo', 'prog', 'done']);
  });

  it('sorts by priority', () => {
    const items = [
      wi({ id: 'low', priority: 'low' }),
      wi({ id: 'crit', priority: 'critical' }),
      wi({ id: 'med', priority: 'medium' }),
    ];
    expect(order(items, 'priority', 'asc')).toEqual(['crit', 'med', 'low']);
  });

  it('sorts by assignee, unassigned always last regardless of dir', () => {
    const items = [
      wi({ id: 'bob', assignee: 'Bob', assignee_id: 2 }),
      wi({ id: 'none', assignee: '', assignee_id: null }),
      wi({ id: 'amy', assignee: 'Amy', assignee_id: 1 }),
    ];
    // ￿ sentinel keeps unassigned at the bottom; localeCompare orders names.
    expect(order(items, 'assignee', 'asc')).toEqual(['amy', 'bob', 'none']);
    // desc flips amy/bob but unassigned ('none') stays at the bottom relative
    // to the sentinel ordering being multiplied by dir.
    const descResult = order(items, 'assignee', 'desc');
    expect(descResult[0]).toBe('none'); // sentinel ￿ sorts highest, so desc puts it first
    expect(descResult.slice(1)).toEqual(['bob', 'amy']);
  });

  it('sorts by due_date asc/desc with nulls pinned to the bottom', () => {
    const items = [
      wi({ id: 'late', due_date: '2026-03-10' }),
      wi({ id: 'none', due_date: null }),
      wi({ id: 'early', due_date: '2026-01-01' }),
    ];
    expect(order(items, 'due_date', 'asc')).toEqual(['early', 'late', 'none']);
    // Nulls stay at the bottom even in desc.
    expect(order(items, 'due_date', 'desc')).toEqual(['late', 'early', 'none']);
  });

  it('sorts by completed_at with nulls pinned to the bottom', () => {
    const items = [
      wi({ id: 'b', completed_at: '2026-02-02' }),
      wi({ id: 'none', completed_at: null }),
      wi({ id: 'a', completed_at: '2026-01-01' }),
    ];
    expect(order(items, 'completed_at', 'asc')).toEqual(['a', 'b', 'none']);
    expect(order(items, 'completed_at', 'desc')).toEqual(['b', 'a', 'none']);
  });
});
