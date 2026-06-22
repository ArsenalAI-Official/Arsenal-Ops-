# WorkItem Type Migration — Scope

**Date:** 2026-06-16
**Status:** Implemented on `feat/migrate-workitem-to-generated`. Backend detail
model + 3 typed fetch boundaries (board/detail/hub-list) via
`@/types/workItemMappers`; `WorkItem` kept as the view-model (Approach A — the
mechanical `Pick`/`&` re-anchor in Phase 3 was rejected as it would corrupt the
view-model with wire-level looseness). All checks green.
**Prereq:** PR #61 (FE type migration onto generated `@/client` types) merged.
**Branch (proposed):** `feat/migrate-workitem-to-generated`

## Why this is its own PR

`WorkItem` was deliberately excluded from PR #61. Unlike every other type migrated there
(each maps 1:1 to a single backend response model), `WorkItem` is a **superset of four
distinct endpoint shapes** plus **FE-only derived fields**. There is no single generated
type it can become, and the work touches the backend (one untyped endpoint) before any FE
retargeting is safe.

- **543 references across 79 files** (board, work-item panel, project hub, project pages,
  shared components, hooks, tests). The review's "~52 refs" estimate was low.
- Canonical type: [app/src/types/workItems.ts](app/src/types/workItems.ts) — `WorkItem` interface, 30 fields.

## The four backend shapes feeding `WorkItem`

| Endpoint | Generated type | Typing today | Notes |
|---|---|---|---|
| `GET /api/workitems/` (list) | `WorkItemListResponse` | ✅ `responses=` | normalized, defaults applied |
| `GET /api/workitems/board` | `SlimWorkItem` | ✅ `response_model=` | lean: no description/criteria/started_at |
| `GET /api/workitems/my-tasks` | `MyTaskResponse` | ✅ `responses=` | adds `is_overdue`, `project_*`, `reporter_name`, `completed_at` |
| `GET /api/workitems/{id}` (detail) | **none** | ❌ **`200: unknown`** | raw DB columns + computed `reporter_name`/`assignee_name` |

The detail endpoint ([backend/routers/workitems.py:698-724](backend/routers/workitems.py#L698)) hand-builds a
dict from `WorkItem.__table__.columns` and returns it untyped — so the panel
([useWorkItemPanel.ts](app/src/components/WorkItemPanel/hooks/useWorkItemPanel.ts)) casts `unknown` to `WorkItem`.
**This is the one true blocker.**

## Key fact: `WorkItem` will remain hand-written

`WorkItem` carries fields **no backend response provides directly** — they're FE-mapped:
- `assignee: string` (display name; backend gives `assignee_id` + computed `assignee_name`)
- `sprint: string` (display name; backend gives `sprint_id`)
- `epic: string`, `product_id: string` (FE-only composition)

So the goal is **not** "replace `WorkItem` with a generated type." It's **anchor `WorkItem`'s
backend-derived fields to generated types** so it can't drift, while keeping the handful of
genuinely FE-derived fields explicit — and **type the fetch boundaries** precisely.

## Approach (recommended)

This keeps the FE surface stable (minimal UI/UX change) while killing the drift risk:

### Phase 1 — Backend: type the detail endpoint (the blocker)
- Add `WorkItemDetailResponse` Pydantic model in `workitems.py`, attached via
  `responses={200: {"model": WorkItemDetailResponse}}` (documentation-only, **zero runtime
  change** — same pattern proven byte-identical by the contract harness in PR #60/#61).
- Model = all DB columns + computed `reporter_name` / `assignee_name`, with field
  nullability matching the actual ORM columns.
- Add a **contract golden** for `/api/workitems/{id}` if one isn't already covering it, so
  the byte-diff harness gates this.
- `gen:api` → `WorkItemDetailResponse` appears in `client/types.gen.ts`.

### Phase 2 — FE: type the fetch boundaries
- `useWorkItemPanel.ts` fetch → `WorkItemDetailResponse` (drops the `unknown` cast).
- `useBoardData.ts` fetch → `SlimWorkItem[]`.
- list/my-tasks hooks already align (`WorkItemListResponse` / `MyTaskResponse`).
- At each boundary, map the generated response → canonical `WorkItem` in one place.

### Phase 3 — FE: re-anchor the canonical `WorkItem`
- Redefine `WorkItem` as a composition of generated fields + explicit FE-derived fields,
  e.g. pick the backend-shaped fields from the generated types and add `assignee`/`sprint`/
  `epic`/`product_id` explicitly. The 543 consumer references keep importing `WorkItem`
  unchanged — only its **definition** moves onto generated foundations.
- Decide enum handling: `status`/`type`/`priority` are string-unions in `WorkItem` but
  plain `string` in the generated types. Keep the FE unions (they're load-bearing for sort
  ordering / Record keys) — this is the one spot we intentionally narrow.

### Phase 4 — verify
- `tsc -b --noEmit` 0 errors, eslint, full vitest.
- Backend: `ruff`, `export_openapi.py --check` (no drift), `pytest tests/contract`.
- `/branch-review`.

## Open questions / asides (not acting on these yet)
- **`assigned_hours ← estimated_hours` mapping** in `list_work_items()`
  ([workitems.py:446](backend/routers/workitems.py#L446)) looks like it mirrors two distinct
  concepts. Flagged by the scope sweep; **out of scope** for a type migration — note only,
  don't fix here unless we decide to.
- Whether to retarget shared components (KanbanCard, WorkItemRow) to narrower per-source
  types instead of canonical `WorkItem`. **Not recommended** — they're shared across board
  (slim) and other views; a union/narrowest-common type would churn 79 files for no UX gain.

## Effort estimate
- Backend: small (1 model + 1 golden, same proven pattern).
- FE: medium — definition change + ~3 fetch boundaries are the real edits; the 543 refs ride
  along unchanged. Bulk of risk is enum narrowing and the panel's detail-shape mapping.
