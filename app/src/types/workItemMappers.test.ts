import { describe, it, expect } from 'vitest';
import type { WorkItem } from './workItems';
import type { SlimWorkItem, WorkItemDetailResponse } from '@/client';
import { slimToWorkItem, applyWorkItemDetail } from './workItemMappers';

describe('slimToWorkItem', () => {
  it('normalizes a slim board row into a well-formed WorkItem', () => {
    const slim: SlimWorkItem = {
      id: '210',
      key: 'A-2',
      title: 'Task',
      type: 'task',
      status: 'in_progress',
      priority: 'high',
      assignee_id: 1,
      assignee: 'Admin User',
      sprint_id: 100,
      parent_id: 201,
      epic_id: 200,
      parent_key: 'A-1',
      epic_key: 'A-0',
      story_points: 3,
      tags: ['x'],
      remaining_hours: 4,
      assigned_hours: 8,
      logged_hours: 4,
      due_date: '2026-01-10T00:00:00',
      completed_at: null,
      is_blocked: true,
    };

    const wi = slimToWorkItem(slim);

    expect(wi.id).toBe('210');
    expect(wi.assignee).toBe('Admin User');
    expect(wi.is_blocked).toBe(true);
    // Fields the slim payload omits are filled (board never renders them).
    expect(wi.description).toBe('');
    expect(wi.sprint).toBe('');
    expect(wi.epic).toBe('');
    expect(wi.product_id).toBe('');
  });

  it('fills empty-string for a null assignee and defaults missing numerics', () => {
    const slim: SlimWorkItem = {
      id: '1',
      key: 'A-1',
      title: 'No assignee',
      type: 'bug',
      status: 'todo',
      priority: 'low',
      assignee: null,
      assignee_id: null,
      sprint_id: null,
    };

    const wi = slimToWorkItem(slim);

    expect(wi.assignee).toBe('');
    expect(wi.assignee_id).toBeNull();
    expect(wi.story_points).toBe(0);
    expect(wi.remaining_hours).toBe(0);
    expect(wi.tags).toEqual([]);
    expect(wi.is_blocked).toBe(false);
  });

  it('fills every default when all optional slim fields are omitted', () => {
    // Only the six required SlimWorkItem fields present — proves each `??`
    // default fires and the enum values (epic/backlog/critical) narrow through.
    const slim: SlimWorkItem = {
      id: '9',
      key: 'A-9',
      title: 'Bare',
      type: 'epic',
      status: 'backlog',
      priority: 'critical',
    };

    const wi = slimToWorkItem(slim);

    expect(wi.type).toBe('epic');
    expect(wi.status).toBe('backlog');
    expect(wi.priority).toBe('critical');
    expect(wi.assignee).toBe('');
    expect(wi.assignee_id).toBeNull();
    expect(wi.sprint_id).toBeNull();
    expect(wi.assigned_hours).toBe(0);
    expect(wi.remaining_hours).toBe(0);
    expect(wi.logged_hours).toBe(0);
    expect(wi.story_points).toBe(0);
    expect(wi.tags).toEqual([]);
    expect(wi.is_blocked).toBe(false);
    expect(wi.parent_id).toBeNull();
    expect(wi.epic_id).toBeNull();
    expect(wi.due_date).toBeNull();
    expect(wi.completed_at).toBeNull();
  });
});

describe('applyWorkItemDetail', () => {
  const base: WorkItem = {
    id: '210',
    key: 'A-2',
    type: 'task',
    title: 'old title',
    description: 'old',
    status: 'todo',
    assigned_hours: 8,
    remaining_hours: 8,
    logged_hours: 0,
    story_points: 3,
    priority: 'high',
    assignee: 'Admin User',
    assignee_id: 1,
    sprint: 'Sprint 1',
    sprint_id: 100,
    product_id: 'prod-1',
    tags: [],
    epic: 'Epic A',
    is_blocked: false,
  };

  const detail: WorkItemDetailResponse = {
    id: 210, // numeric on the wire
    project_id: 1,
    sprint_id: 100,
    key: 'A-2',
    type: 'task',
    title: 'new title',
    description: null,
    status: 'in_progress',
    priority: 'high',
    story_points: 3,
    logged_hours: 4,
    estimated_hours: 8,
    remaining_hours: 4,
    assignee_id: 1,
    reporter_id: 1,
    created_at: '2026-01-01T12:00:00',
    updated_at: '2026-01-02T12:00:00',
    reporter_name: 'Admin User',
    assignee_name: 'Admin User',
  };

  it('overlays fresh detail fields but keeps the string id and display names', () => {
    const merged = applyWorkItemDetail(base, detail);

    // Kept from base (detail returns a numeric id / no display names).
    expect(merged.id).toBe('210');
    expect(merged.assignee).toBe('Admin User');
    expect(merged.sprint).toBe('Sprint 1');
    expect(merged.epic).toBe('Epic A');
    // Overlaid from the response.
    expect(merged.title).toBe('new title');
    expect(merged.status).toBe('in_progress');
    expect(merged.logged_hours).toBe(4);
    expect(merged.remaining_hours).toBe(4);
    // `reporter_name` is the one detail-only field the panel renders; it must
    // survive the overlay (reaches the UI only via the spread).
    expect(merged.reporter_name).toBe('Admin User');
    // Other detail-only fields (not declared on WorkItem) still ride through.
    expect((merged as unknown as WorkItemDetailResponse).assignee_name).toBe('Admin User');
  });

  it('re-narrows nullable wire fields to the non-null view-model', () => {
    const merged = applyWorkItemDetail(base, {
      ...detail,
      description: null,
      remaining_hours: null,
    });
    expect(merged.description).toBe('');
    expect(merged.remaining_hours).toBe(0);
  });
});
