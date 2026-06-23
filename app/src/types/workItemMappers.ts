// Wire-type → view-model mappers for work items.
//
// `WorkItem` (see ./workItems) is the frontend's canonical view-model: a
// normalized SUPERSET with a string `id`, non-null hours/description, narrowed
// status/type/priority unions, and FE-derived display fields (`assignee`,
// `sprint`, `epic`, `product_id`) that no single endpoint returns. The backend
// exposes several *different* wire shapes for the same entity, each generated
// into `@/client`:
//
//   • SlimWorkItem          — GET /api/workitems/board   (lean; omits names/description)
//   • WorkItemDetailResponse — GET /api/workitems/{id}    (raw columns; numeric id)
//   • WorkItemListResponse   — GET /api/workitems/        (normalized list)
//
// These functions are the SINGLE place wire shapes are normalized into the
// view-model. Keeping the conversions here (rather than a blanket
// `useQuery<WorkItem>` lie at the fetch) means a backend field change surfaces
// as a compile error in exactly one spot. The status/type/priority columns are
// plain strings on the wire; `narrow` asserts them to the view-model unions
// (the backend only emits the enumerated values) and, in dev builds, warns if
// the backend ever emits an unknown value — so enum drift surfaces in QA
// instead of silently mis-grouping a card.
import type { SlimWorkItem, WorkItemDetailResponse } from '@/client';
import type { WorkItem, WorkItemType, WorkItemStatus, WorkItemPriority } from './workItems';
import { WORK_ITEM_TYPES, WORK_ITEM_STATUSES, WORK_ITEM_PRIORITIES } from './workItems';

function narrow<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (import.meta.env.DEV && !(allowed as readonly string[]).includes(value)) {
    console.warn(
      `[workItemMappers] unexpected ${field} "${value}" from backend (not in: ${allowed.join(', ')})`,
    );
  }
  return value as T;
}

const narrowType = (v: string): WorkItemType => narrow(v, WORK_ITEM_TYPES, 'type');
const narrowStatus = (v: string): WorkItemStatus => narrow(v, WORK_ITEM_STATUSES, 'status');
const narrowPriority = (v: string): WorkItemPriority => narrow(v, WORK_ITEM_PRIORITIES, 'priority');

/**
 * Board (slim) row → canonical WorkItem.
 *
 * The board endpoint deliberately omits `description`/`sprint`/`epic` names and
 * the FE-only `product_id` (the board never renders them — it groups by id and
 * resolves sprint names from the separate sprints list). They're filled with
 * empty strings so the result is a well-formed WorkItem; this matches the
 * pre-existing runtime behavior where those fields were simply absent/blank.
 */
export function slimToWorkItem(slim: SlimWorkItem): WorkItem {
  return {
    id: slim.id,
    key: slim.key,
    type: narrowType(slim.type),
    title: slim.title,
    description: '',
    status: narrowStatus(slim.status),
    assigned_hours: slim.assigned_hours ?? 0,
    remaining_hours: slim.remaining_hours ?? 0,
    logged_hours: slim.logged_hours ?? 0,
    story_points: slim.story_points ?? 0,
    priority: narrowPriority(slim.priority),
    assignee: slim.assignee ?? '',
    assignee_id: slim.assignee_id ?? null,
    sprint: '',
    sprint_id: slim.sprint_id ?? null,
    product_id: '',
    tags: slim.tags ?? [],
    epic: '',
    parent_id: slim.parent_id ?? null,
    epic_id: slim.epic_id ?? null,
    parent_key: slim.parent_key ?? null,
    epic_key: slim.epic_key ?? null,
    due_date: slim.due_date ?? null,
    completed_at: slim.completed_at ?? null,
    is_blocked: slim.is_blocked ?? false,
  };
}

/**
 * Overlay a fresh detail response onto an existing WorkItem.
 *
 * The detail endpoint returns the RAW columns: a numeric `id`, loose
 * status/type/priority strings, nullable `description`/`remaining_hours`, and
 * NO display names (`assignee`/`sprint`/`epic`) — those stay from `base`. We
 * keep the full spread so detail-only fields the panel reads (e.g.
 * `assignee_name`, `started_at`, `attachments`) still flow through, then
 * re-narrow the fields whose wire type conflicts with the view-model. Notably
 * `id` is kept from `base` (string) instead of the response's numeric id.
 */
export function applyWorkItemDetail(base: WorkItem, data: WorkItemDetailResponse): WorkItem {
  return {
    ...base,
    ...data,
    id: base.id,
    description: data.description ?? '',
    status: narrowStatus(data.status),
    type: narrowType(data.type),
    priority: narrowPriority(data.priority),
    // story_points/logged_hours/remaining_hours are nullable on the wire (the
    // raw columns); the view-model keeps them non-null.
    story_points: data.story_points ?? 0,
    logged_hours: data.logged_hours ?? 0,
    remaining_hours: data.remaining_hours ?? 0,
    tags: data.tags ?? [],
  };
}
