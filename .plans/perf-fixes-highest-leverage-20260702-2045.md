# Perf fixes — highest-leverage slowdowns (single PR)

**Tier:** Lightweight · **Scope:** one PR · **Stack:** React 19 + TanStack Query v5 (`app/`) + FastAPI/SQLAlchemy 2.0 sync (`backend/`)
**Created:** 2026-07-02

## Summary / TL;DR

One focused PR fixing the four highest-leverage performance slowdowns found in the frontend+backend
investigation. Three are frontend query-orchestration fixes, one is a one-line backend pool bump, and
one is a backend SQL rewrite of an unbounded aggregation (included per decision). No UI/behavior
changes visible to users beyond "things load faster and don't over-refetch."

What changed from the original framing: after mapping callers, two of the items are smaller than
feared — the board's status-drag is already correctly scoped, and only **two** mutation sites
over-invalidate. The invalidation fix is surgical, not a rewrite of `invalidations.ts`.

## Goals

- ProjectDetail cold load fires **1** consolidated request (`/overview`), not ~10 parallel ones.
- Work-item writes invalidate only work-item-derived caches; stop dragging in goals/milestones/PRD/links.
- Admin tab switches within `staleTime` read from cache (no refetch-on-every-mount).
- Backend DB pool can absorb the frontend's fan-out + the sync threadpool without connection starvation.
- `/admin/developers/capacity` stops loading the entire unbounded `time_entries` table into Python.

## Non-goals (explicit — deferred to follow-ups)

- List/table **virtualization** (admin tables, board views).
- **Markdown** memoization (unstable plugin array).
- Analytics / pulse-derived **SQL rewrites**.
- `TimeEntriesTable` raw-`fetch` → react-query migration.
- Any **codegen / starter-alignment** work.
- Splitting `invalidations.ts` into many granular helpers (the targeted fix doesn't need it).

---

## Design sketch

### Item 1 — Gate ProjectDetail's queries behind the overview (fixes ~10→1 fan-out)

**File:** `app/src/pages/ProjectDetail/hooks/useProjectDetailData.ts`

`overviewQuery` (`['projectOverview', id]`) returns project + sprints + goals + milestones + activities +
analytics + prd + links in one call, and an effect seeds the individual caches from it. But the 8
individual queries all have `enabled: !!id`, so on cold load they **race** the overview instead of
waiting for the seed — defeating the consolidation.

**Fix:** gate the 8 individual queries so they only fire as a *fallback* if the overview hasn't
produced data. Add a shared predicate:

```ts
// True once the overview has seeded caches, OR while it's still in flight.
// Individual queries only fire if the overview has definitively failed.
const overviewCovers = !!overviewQuery.data || overviewQuery.isLoading;
// ...
enabled: !!id && !overviewCovers,   // applied to the 8 dependent queries
```

- Gate exactly the **8 queries the seeding effect populates**: `projectQuery` (`['project',id]`),
  `sprintsQuery`, `goalsQuery`, `milestonesQuery`, `activitiesQuery`, `analyticsQuery`,
  `prdAnalysisQuery`, `linksQuery`.
- **Do NOT gate** `hubWorkItemsQuery` or `developersQuery`. **Resolved (was R2):** the `/overview`
  endpoint (`backend/routers/overview.py`) returns project/sprints/goals/milestones/activities/
  analytics/prd/links but **not** work items, so the seeding effect never seeds
  `['workItems', {project_id: id}]`. Gating `hubWorkItemsQuery` would leave the hub's work items
  unfetched forever. It stays `enabled: !!id`. `developersQuery` is a shared global query
  (`useAllDevelopers`), not project-seeded — leave as-is.
- The existing seeding effect (lines ~109–120) populates the 8 gated queries' caches, so consumers
  read seeded data with no extra request.
- On overview **error**, `overviewQuery.data` is undefined and `isLoading` is false →
  `overviewCovers` is false → the 8 gated queries fire (preserves the documented low-risk fallback).

### Item 2 — Targeted invalidation: stop work-item writes calling `invalidateProjectScope`

`invalidateWorkItemScope` is already correctly scoped to work-item-derived caches (workItems,
workItem, myTasks, hub analytics + activities, overview, admin stats + capacity). The over-broad
behavior comes from two mutation sites that *additionally* call `invalidateProjectScope` (which pulls
in goals/milestones/prd/links/sprints/admin-projects — none of which a work-item edit changes):

1. **`app/src/pages/ProjectDetail/hooks/useProjectDetailData.ts:282-283`** — `taskUpdateMutation.onSettled`
   calls **both** `invalidateWorkItemScope` and `invalidateProjectScope`. → **Remove the
   `invalidateProjectScope(queryClient, id)` call (line 283).** Keep `invalidateWorkItemScope`.
2. **`app/src/pages/ProjectBoard/hooks/useWorkItemMutations.ts:191-192`** — `moveSprintMutation` calls
   `invalidateWorkItems()` then `invalidateProjectScope`. A sprint move genuinely affects **sprints**
   but not goals/milestones/prd/links. → **Replace `invalidateProjectScope(queryClient, id)` with a
   narrow `queryClient.invalidateQueries({ queryKey: ['sprints', id] })`.**

Leave alone (correctly scoped or legitimately project-wide): the board `moveMutation`/`createItemMutation`/
`saveEditMutation`/`deleteItemMutation`/`logHoursMutation` (already call only `invalidateWorkItems()`),
all project/membership/link/architecture mutations, and `useSprintMutations` (sprint CRUD legitimately
touches project scope).

**Do not** change the bodies of `invalidateWorkItemScope` / `invalidateProjectScope` themselves —
other callers depend on them.

### Item 3 — Remove `ADMIN_REFETCH` refetch-on-mount override

**File:** `app/src/pages/AdminDashboard/hooks/adminRefetch.ts`

`ADMIN_REFETCH = { refetchOnMount: true }` overrides the global `refetchOnMount: false`, so every
admin tab switch refetches even when data is <30s fresh. The global defaults
(`refetchOnMount: false` + `refetchOnWindowFocus: true` + 30s `staleTime`) already give: instant
cache read on tab switch, background refresh on tab-away-and-back, and explicit invalidation on
mutations.

**Fix:** make `ADMIN_REFETCH` an empty object so consumers inherit global defaults, keeping the spread
sites (`...ADMIN_REFETCH`) untouched so this is a one-file change:

```ts
// Admin queries inherit the global query defaults (staleTime 30s, refetchOnMount false,
// refetchOnWindowFocus true). Tab switches within staleTime read from cache; teammates'
// writes surface on window-focus refetch. Mutations invalidate explicitly.
export const ADMIN_REFETCH = {} as const;
```

Rewrite the file's doc comment to match (the current comment describes the old behavior). Leave the
~9 `...ADMIN_REFETCH` spread sites as-is. (Alternative considered: delete the constant and its
imports — more churn across 9 files for no benefit. Keep the seam.)

**Accepted trade-off:** a cross-session write this client never saw has up to ~30s visibility lag on a
direct tab switch — identical to every other view in the app, and already the documented posture.

### Item 4 — Bump backend connection pool — **DEFERRED (out of this PR)**

**Deferred** by decision. This is an infrastructure-coupled change, not app code: the peak is
`(pool_size + max_overflow)` **per worker**, and the binding constraint is Neon's free-tier
`max_connections` — owned by whoever runs deployment, not visible from source. Prod is currently a
**single** gunicorn worker on Render free tier (`render.yaml`), and Item 1 removes most of the pool
pressure by collapsing ProjectDetail's fan-out from ~10 requests to 1, so the urgency largely
evaporates once this PR ships.

**Ops follow-up (not this PR):** after Item 1 is live, observe pool behavior via `PERF_LOG` / the Neon
dashboard; if concurrency warrants, the deploy owner confirms Neon `max_connections` headroom against
`(pool_size + max_overflow) × worker_count` and bumps `pool_size` — ideally via an env var
(`DB_POOL_SIZE`) rather than a source constant.

### Item 5 — `/admin/developers/capacity`: SQL-aggregate the time-entry history

**File:** `backend/routers/admin.py` (`get_developers_capacity`, ~lines 207–287)

Today it does `db.query(TimeEntry).filter(...).all()` — **every time entry ever logged**, unbounded —
then buckets per-dev by Sat→Fri week + project in Python (`_weekly_history_for`). `time_entries` grows
forever, so this degrades with no ceiling.

**Recommended approach (lowest cross-DB risk):** aggregate to **daily** granularity in SQL (joining
to `WorkItem` for `project_id`), then keep the existing Sat→Fri **week** rollup in Python unchanged.
Grouping by day (via a cast to `Date`) is portable across Postgres (prod) and SQLite (tests); pushing
the Sat→Fri week math into SQL is **not** portable and risks drifting from the Python logic — so keep
that in Python.

```py
from sqlalchemy import func, cast, Date
day_rows = (
    db.query(
        TimeEntry.developer_id.label("dev_id"),
        WorkItem.project_id.label("project_id"),
        cast(TimeEntry.logged_at, Date).label("day"),
        func.sum(TimeEntry.hours).label("hours"),
    )
    .join(WorkItem, WorkItem.id == TimeEntry.work_item_id)
    .filter(TimeEntry.developer_id.isnot(None), TimeEntry.logged_at.isnot(None))
    .group_by(TimeEntry.developer_id, WorkItem.project_id, cast(TimeEntry.logged_at, Date))
    .all()
)
```

Then rebuild `entries_by_dev` as `{dev_id: [(day, project_id, hours), ...]}` and adapt
`_weekly_history_for` to iterate those daily tuples (compute `weekday()` from `day`) instead of raw
`TimeEntry` rows. This transfers one row per (dev, project, day) instead of one per entry — bounded by
calendar days × active projects, not total logged hours — and **preserves the exact output contract**
(`week_start`, `week_end`, per-week `hours`, sorted per-project split). The separate `wi_to_project`
lookup query is absorbed into the join and can be removed.

**Alternatives considered:** (A) full SQL week+project GROUP BY — smallest transfer but non-portable
week math and drift risk; rejected. (B) just add a date-window floor and keep Python bucketing —
smaller diff but changes output (drops old weeks) and still O(rows-in-window); rejected because the
daily-aggregate keeps behavior identical.

**Must pass:** `backend/tests/test_capacity_properties.py` and any capacity assertions unchanged.

---

## Risks (severity-ranked)

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | Item 5 SQL date-cast behaves differently on SQLite (tests) vs Postgres (prod) | **High** | Group by `cast(logged_at, Date)` only (portable); keep week math in Python; run full backend test suite incl. `test_capacity_properties.py`; spot-check one dev's history against pre-change output |
| R2 | ~~Item 1: gating `hubWorkItemsQuery` breaks the hub~~ | — | **Resolved in design:** `/overview` carries no work items, so `hubWorkItemsQuery` stays ungated; only the 8 seeded queries are gated |
| R3 | Item 2: under-invalidation shows stale goals/milestones after a work-item edit | Low | By design goals/milestones/prd/links don't change on a work-item write; overview/analytics/activities remain invalidated via `invalidateWorkItemScope` |
| R4 | ~~Item 4: pool ceiling exceeds Postgres `max_connections`~~ | — | **Deferred** out of this PR (ops-owned; see Item 4) |
| R5 | Item 1 changes loading sequencing → a flash of stale/empty on overview error path | Low | Fallback path (8 gated queries fire on overview error) is preserved; manual smoke on a 403/500 overview |

## Task checklist

- [ ] **Item 1** — add `overviewCovers` gate to the **8 seeded** queries in `useProjectDetailData.ts` (project, sprints, goals, milestones, activities, analytics, prd, links); leave `hubWorkItemsQuery` and `developersQuery` ungated; confirm seeding effect still populates caches.
- [ ] **Item 2** — remove `invalidateProjectScope` from `useProjectDetailData.ts:283`; replace it with `['sprints', id]` invalidation in `useWorkItemMutations.ts:192`.
- [ ] **Item 3** — set `ADMIN_REFETCH = {}` and rewrite its doc comment in `adminRefetch.ts`.
- [ ] ~~**Item 4** — pool bump~~ **DEFERRED** (ops follow-up).
- [ ] **Item 5** — rewrite `get_developers_capacity` time-entry load as a daily SQL aggregate; adapt `_weekly_history_for`; remove the now-redundant `wi_to_project` query.
- [ ] Run `cd app && npx tsc -b --noEmit && npm run lint && npm test`.
- [ ] Run `cd backend && ruff check . && ruff format --check . && python -m pytest`.
- [ ] Manual: cold-load ProjectDetail with `PERF_LOG=1` on the backend → confirm one `/overview` request and no `/projects/{id}`+`/goals`+… fan-out; capacity endpoint query count drops.

## Verification (empirical)

Run the backend with `PERF_LOG=1` (`middleware/perf.py`) and exercise the app:
- **ProjectDetail cold load:** expect a single `[GET /api/projects/{id}/overview]` line, no accompanying
  `/goals`, `/milestones`, `/activity`, `/analytics`, `/links`, `/sprints`, `/workitems` burst.
- **Kanban inline edit in hub:** expect no `/goals`/`/milestones`/`/prd`/`/links` refetch after a task update.
- **Admin tab switching within 30s:** expect no refetch lines on re-mount.
- **`/admin/developers/capacity`:** expect a bounded `(Q=…)` count and lower `ms` that doesn't grow with total time-entry volume.

---

## PR description draft

**Title:** `perf: cut ProjectDetail request fan-out, tighten invalidation, right-size DB pool`

**Body:**

Fixes the highest-leverage performance slowdowns from the recent frontend+backend audit. No
user-facing behavior changes beyond faster loads and fewer redundant refetches.

**Frontend**
- **ProjectDetail cold load: ~10 parallel requests → 1.** The `/overview` consolidation was being
  defeated because the 8 per-resource queries raced the overview instead of waiting for its cache
  seed. They're now gated behind the overview and only fire as a fallback if it fails.
- **Targeted invalidation on work-item writes.** Two mutation sites called the broad
  `invalidateProjectScope` (goals/milestones/PRD/links) on a work-item edit. Task updates now
  invalidate only work-item-derived caches; the sprint-move mutation invalidates just `['sprints']`.
- **Admin tabs no longer refetch on every mount.** Removed the `refetchOnMount: true` override so
  admin queries inherit the global defaults (cache read within 30s `staleTime`, refresh on
  window-focus, explicit invalidation on writes).

**Backend**
- **`/admin/developers/capacity` no longer loads the entire `time_entries` table into Python.**
  Replaced the unbounded row load with a daily SQL aggregate (per dev/project/day) and kept the
  Sat→Fri week rollup in Python. Output contract unchanged.

**Test plan**
- `tsc -b --noEmit`, `lint`, frontend `vitest` green.
- Backend `ruff` + `pytest` green (incl. `test_capacity_properties.py`).
- Manual with `PERF_LOG=1`: ProjectDetail cold load emits a single `/overview` request; hub task edit
  doesn't refetch goals/milestones/PRD/links; admin tab switches within 30s don't refetch; capacity
  endpoint query count is bounded and independent of total time-entry volume.
