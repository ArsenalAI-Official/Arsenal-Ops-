// Canonical cross-feature work-item domain types (audit F-T1). `WorkItem` and
// `Sprint` had drifted across ~10 / ~9 files respectively; this is the single
// source of truth they should re-export from.
//
// `WorkItem` is the SUPERSET of the ProjectBoard and WorkItemPanel copies:
// it keeps the board's `completed_at` (used by list/epic/week sort + grouping)
// and the panel's `reporter_name`/`project_id`. Fields any consumer treated as
// optional stay optional.
//
// Migration is incremental: this module + a re-export shim on
// `components/WorkItemPanel/types.ts` land first; the ProjectBoard family
// imports from here directly; the remaining declaration sites are a separate
// follow-up codemod (kept out of the decomposition PR to stay reviewable).
export interface WorkItem {
  id: string;
  key: string; // Ticket key like PROJ-123
  type: 'user_story' | 'task' | 'bug' | 'epic' | 'subtask';
  title: string;
  description: string;
  // Mirrors the backend WorkItemStatus enum (incl. BACKLOG) and the board's
  // BOARD_STATUS_ORDER — items can legitimately be persisted with 'backlog'.
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
  assigned_hours: number;
  remaining_hours: number;
  logged_hours: number;
  story_points: number;
  priority: 'high' | 'medium' | 'low' | 'critical';
  assignee: string;
  assignee_id: number | null;
  reporter_name?: string | null;
  sprint: string;
  sprint_id: number | null;
  product_id: string;
  project_id?: number;
  tags: string[];
  epic: string;
  parent_id?: number | null;
  epic_id?: number | null;
  parent_key?: string | null;
  epic_key?: string | null;
  created_at?: string;
  updated_at?: string;
  due_date?: string | null;
  completed_at?: string | null;
  estimated_hours?: number | null;
}

// Rich board-side sprint shape (the superset across the board's usages). The
// thinner `{ id, name, status }` panel copy is migrated separately.
export interface Sprint {
  id: number;
  name: string;
  goal: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  capacity_hours: number | null;
  velocity: number | null;
  total_items: number;
  todo_count: number;
  in_progress_count: number;
  done_count: number;
  total_points: number;
  completed_points: number;
  completion_pct: number;
}
