import { describe, it, expect } from 'vitest';
import type { WorkItem } from '@/types/workItems';
import { applyStatusChange } from './optimisticStatus';

const wi = (id: string, status: WorkItem['status']): WorkItem =>
  ({
    id,
    key: `P-${id}`,
    type: 'task',
    title: 't',
    description: '',
    status,
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
  }) as WorkItem;

describe('applyStatusChange', () => {
  it('returns [] for an undefined list', () => {
    expect(applyStatusChange(undefined, '1', 'done')).toEqual([]);
  });

  it('updates only the matching id', () => {
    const list = [wi('1', 'todo'), wi('2', 'todo')];
    const next = applyStatusChange(list, '1', 'in_progress');
    expect(next.find((t) => t.id === '1')!.status).toBe('in_progress');
    expect(next.find((t) => t.id === '2')!.status).toBe('todo');
  });

  it('is immutable: input list and items are not mutated, new array returned', () => {
    const item = wi('1', 'todo');
    const list = [item];
    const next = applyStatusChange(list, '1', 'done');
    expect(next).not.toBe(list); // new array
    expect(next[0]).not.toBe(item); // new object for the changed item
    expect(item.status).toBe('todo'); // original untouched
    expect(list[0]!.status).toBe('todo');
  });

  it('preserves item identity for unchanged items', () => {
    const a = wi('1', 'todo');
    const b = wi('2', 'todo');
    const next = applyStatusChange([a, b], '1', 'done');
    expect(next[1]).toBe(b); // unchanged item keeps reference
  });

  it('returns an unchanged-status array when no id matches', () => {
    const list = [wi('1', 'todo')];
    const next = applyStatusChange(list, 'nope', 'done');
    expect(next.map((t) => t.status)).toEqual(['todo']);
  });
});
