import { describe, it, expect } from 'vitest';
import type { TimeEntryRow } from '@/client';
import { aggregateEntries } from './types';

/** Build a TimeEntryRow with sensible defaults; override only what a test cares about. */
function row(over: Partial<TimeEntryRow>): TimeEntryRow {
  return {
    id: 1,
    hours: 0,
    description: null,
    logged_at: '2026-06-01T10:00:00',
    work_item_id: null,
    work_item_key: null,
    work_item_title: null,
    work_item_type: null,
    project_id: null,
    project_name: null,
    client_name: null,
    developer_id: null,
    developer_name: null,
    developer_email: null,
    avatar_url: null,
    ...over,
  };
}

// Deterministic dataset spanning two days:
//   Jun 1 — Alice: 10h Website (Acme) + 5h Portal (Globex)
//   Jun 2 — Bob:   20h Website (Acme)
// Total = 35h
const DATA: TimeEntryRow[] = [
  row({
    id: 1,
    hours: 10,
    logged_at: '2026-06-01T10:00:00',
    developer_id: 1,
    developer_name: 'Alice',
    project_id: 100,
    project_name: 'Website',
    client_name: 'Acme',
  }),
  row({
    id: 2,
    hours: 5,
    logged_at: '2026-06-01T14:00:00',
    developer_id: 1,
    developer_name: 'Alice',
    project_id: 200,
    project_name: 'Portal',
    client_name: 'Globex',
  }),
  row({
    id: 3,
    hours: 20,
    logged_at: '2026-06-02T10:00:00',
    developer_id: 2,
    developer_name: 'Bob',
    project_id: 100,
    project_name: 'Website',
    client_name: 'Acme',
  }),
];

describe('aggregateEntries', () => {
  it('employee view: one row per (day, employee), newest day first, split by project+client', () => {
    const { groups, totalHours } = aggregateEntries(DATA, 'employee');
    expect(totalHours).toBe(35);
    expect(groups.map((g) => [g.dayKey, g.label, g.hours])).toEqual([
      ['2026-06-02', 'Bob', 20],
      ['2026-06-01', 'Alice', 15],
    ]);

    const alice = groups[1]!;
    // Children sorted desc: Website (10) then Portal (5); client is the sublabel.
    expect(alice.children.map((c) => [c.label, c.sublabel, c.hours])).toEqual([
      ['Website', 'Acme', 10],
      ['Portal', 'Globex', 5],
    ]);
  });

  it('client view: one row per (day, client), split by employee', () => {
    const { groups } = aggregateEntries(DATA, 'client');
    expect(groups.map((g) => [g.dayKey, g.label, g.hours])).toEqual([
      ['2026-06-02', 'Acme', 20], // Bob's Jun 2
      ['2026-06-01', 'Acme', 10], // Alice's Jun 1 Website
      ['2026-06-01', 'Globex', 5], // Alice's Jun 1 Portal
    ]);
    // Employee children carry no secondary column.
    expect(groups[0]!.children.map((c) => [c.label, c.sublabel, c.hours])).toEqual([
      ['Bob', null, 20],
    ]);
  });

  it('project view: one row per (day, project) with client sublabel, split by employee', () => {
    const { groups } = aggregateEntries(DATA, 'project');
    expect(groups.map((g) => [g.dayKey, g.label, g.sublabel, g.hours])).toEqual([
      ['2026-06-02', 'Website', 'Acme', 20],
      ['2026-06-01', 'Website', 'Acme', 10],
      ['2026-06-01', 'Portal', 'Globex', 5],
    ]);
    expect(groups[0]!.children.map((c) => [c.label, c.hours])).toEqual([['Bob', 20]]);
  });

  it('labels missing dimensions and ignores unparseable timestamps', () => {
    const orphan = aggregateEntries([row({ hours: 4, client_name: null })], 'client');
    expect(orphan.groups[0]!.label).toBe('No client');

    const bad = aggregateEntries([row({ hours: 9, logged_at: 'not-a-date' })], 'employee');
    expect(bad.groups).toEqual([]);
    expect(bad.totalHours).toBe(0);

    expect(aggregateEntries([], 'employee').groups).toEqual([]);
  });
});
