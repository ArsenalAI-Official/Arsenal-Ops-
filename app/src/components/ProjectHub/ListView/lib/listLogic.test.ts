import { describe, it, expect } from 'vitest';
import { getPriorityColor, filterAndSortItems, groupItems } from './listLogic';
import type { WorkItem } from '../types';

const wi = (p: Partial<WorkItem>): WorkItem =>
  ({
    id: '1',
    key: 'AAA-1',
    title: 'x',
    type: 'task',
    status: 'todo',
    priority: 'medium',
    ...p,
  }) as WorkItem;

describe('getPriorityColor', () => {
  it('maps known priorities and falls back to gray', () => {
    expect(getPriorityColor('critical')).toContain('red');
    expect(getPriorityColor('high')).toContain('orange');
    expect(getPriorityColor('medium')).toContain('yellow');
    expect(getPriorityColor('low')).toContain('gray');
    expect(getPriorityColor('nonsense')).toContain('gray');
  });
});

describe('filterAndSortItems', () => {
  const items = [
    wi({
      id: '1',
      key: 'AAA-1',
      title: 'Login bug',
      status: 'todo',
      priority: 'high',
      assignee: 'Jane',
    }),
    wi({ id: '2', key: 'AAA-2', title: 'Signup flow', status: 'done', priority: 'low' }),
    wi({
      id: '3',
      key: 'AAA-3',
      title: 'Logout',
      status: 'todo',
      priority: 'high',
      assignee: 'Bob',
    }),
  ];

  it('filters by search term across title and key (case-insensitive)', () => {
    expect(
      filterAndSortItems(items, 'log', 'all', 'all', 'all', 'title', 'asc').map((i) => i.id),
    ).toEqual(['1', '3']); // "Login bug" + "Logout"
    expect(
      filterAndSortItems(items, 'aaa-2', 'all', 'all', 'all', 'title', 'asc').map((i) => i.id),
    ).toEqual(['2']);
  });

  it('filters by status, priority, and assignee', () => {
    expect(
      filterAndSortItems(items, '', 'done', 'all', 'all', 'title', 'asc').map((i) => i.id),
    ).toEqual(['2']);
    expect(
      filterAndSortItems(items, '', 'all', 'high', 'all', 'title', 'asc').map((i) => i.id),
    ).toEqual(['1', '3']);
    expect(
      filterAndSortItems(items, '', 'all', 'all', 'Bob', 'title', 'asc').map((i) => i.id),
    ).toEqual(['3']);
  });

  it('sorts by title ascending and descending', () => {
    expect(
      filterAndSortItems(items, '', 'all', 'all', 'all', 'title', 'asc').map((i) => i.title),
    ).toEqual(['Login bug', 'Logout', 'Signup flow']);
    expect(
      filterAndSortItems(items, '', 'all', 'all', 'all', 'title', 'desc').map((i) => i.title),
    ).toEqual(['Signup flow', 'Logout', 'Login bug']);
  });

  it('sorts missing due dates last (Infinity)', () => {
    const withDates = [
      wi({ id: 'a', due_date: '2026-03-10' }),
      wi({ id: 'b' }), // no due date
      wi({ id: 'c', due_date: '2026-01-05' }),
    ];
    expect(
      filterAndSortItems(withDates, '', 'all', 'all', 'all', 'due_date', 'asc').map((i) => i.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [wi({ id: '1', title: 'B' }), wi({ id: '2', title: 'A' })];
    const before = input.map((i) => i.id);
    filterAndSortItems(input, '', 'all', 'all', 'all', 'title', 'asc');
    expect(input.map((i) => i.id)).toEqual(before);
  });
});

describe('groupItems', () => {
  const items = [
    wi({ id: '1', status: 'todo', assignee: 'Jane', sprint: 'S1' }),
    wi({ id: '2', status: 'done' }),
  ];

  it('returns a single "All Items" group when groupBy is none', () => {
    expect(Object.keys(groupItems(items, 'none'))).toEqual(['All Items']);
  });

  it('groups by status', () => {
    const g = groupItems(items, 'status');
    expect(g.todo.map((i) => i.id)).toEqual(['1']);
    expect(g.done.map((i) => i.id)).toEqual(['2']);
  });

  it('falls back to Unassigned / No Sprint for missing values', () => {
    expect(groupItems(items, 'assignee').Unassigned.map((i) => i.id)).toEqual(['2']);
    expect(groupItems(items, 'sprint')['No Sprint'].map((i) => i.id)).toEqual(['2']);
  });
});
