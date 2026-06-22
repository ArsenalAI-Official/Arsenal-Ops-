// In-memory work-item board store, typed from the generated SlimWorkItem wire
// shape (the slim 18-field projection GET /api/workitems/board returns).
import type { SlimWorkItem } from '@/client';
import { PROJECT_ID } from './projects';

function base(): Omit<SlimWorkItem, 'id' | 'key' | 'title' | 'status'> {
  return {
    type: 'task',
    priority: 'medium',
    assignee: null,
    assignee_id: null,
    story_points: 0,
    assigned_hours: 0,
    logged_hours: 0,
    remaining_hours: 0,
    due_date: null,
    completed_at: null,
    sprint_id: null,
    parent_id: null,
    parent_key: null,
    epic_id: null,
    epic_key: null,
    is_blocked: false,
    tags: [],
  };
}

export function seedBoardItems(): SlimWorkItem[] {
  return [
    { ...base(), id: 'w1', key: 'TP-1', title: 'Build login page', status: 'todo' },
    { ...base(), id: 'w2', key: 'TP-2', title: 'Wire up API client', status: 'in_progress' },
  ];
}

let board: SlimWorkItem[] = seedBoardItems();

export const workItemStore = {
  board: () => board,
  byProject: (_projectId: number) => board,
  set: (items: SlimWorkItem[]) => {
    board = items;
  },
};

export { PROJECT_ID };

export function resetWorkItemStore(): void {
  board = seedBoardItems();
}
