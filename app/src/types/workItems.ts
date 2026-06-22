// Canonical cross-feature work-item domain types (audit F-T1). `WorkItem` is
// the single source of truth every consumer re-exports from.
//
// `WorkItem` is the frontend VIEW-MODEL: a normalized SUPERSET of the several
// wire shapes the backend exposes for a work item. It keeps a string `id`,
// non-null hours/`description`, narrowed status/type/priority unions, and
// FE-derived display fields (`assignee`, `sprint`, `epic`, `product_id`) that
// no single endpoint returns. It deliberately does NOT alias a generated
// `@/client` type — none matches this merged shape.
//
// The generated wire types (SlimWorkItem / WorkItemDetailResponse /
// WorkItemListResponse) are normalized into this view-model at the fetch
// boundaries via ./workItemMappers, which is the one place backend drift
// surfaces as a compile error. Fields any consumer treated as optional stay
// optional.
// Enum value sets, single-sourced so the unions below and the runtime
// narrow-checks in ./workItemMappers can't drift apart. These mirror the
// backend WorkItemType / WorkItemStatus / WorkItemPriority enums; `status`
// includes 'backlog' (the board's BOARD_STATUS_ORDER) since items can
// legitimately be persisted there.
export const WORK_ITEM_TYPES = ['user_story', 'task', 'bug', 'epic', 'subtask'] as const;
export const WORK_ITEM_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done'] as const;
export const WORK_ITEM_PRIORITIES = ['high', 'medium', 'low', 'critical'] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export interface WorkItem {
  id: string;
  key: string; // Ticket key like PROJ-123
  type: WorkItemType;
  title: string;
  description: string;
  status: WorkItemStatus;
  assigned_hours: number;
  remaining_hours: number;
  logged_hours: number;
  story_points: number;
  priority: WorkItemPriority;
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
  /** True when the ticket has at least one unresolved blocker comment.
   *  Server-side derived from `comments WHERE comment_type='blocker' AND
   *  NOT is_resolved`. The "Unblock" action posts to
   *  `POST /api/workitems/{id}/unblock`, which resolves all of them. */
  is_blocked?: boolean;
}
