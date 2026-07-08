# ProjectDetail: lazy tab data so first paint doesn't block on unseen charts

**Tier:** Lightweight · **Scope:** one PR · **Follow-up to:** PR #90 (request fan-out / invalidation)
**Created:** 2026-07-02 · **Approach chosen:** lazy tab data (not the analytics SQL rewrite)

## Summary / TL;DR

The ProjectDetail landing (`overview` tab) blocks its full-page skeleton on `hubLoading`, which waits
on `analyticsQuery` and `hubWorkItemsQuery` — data the Overview tab **doesn't render** (they feed the
Tracker and Timeline tabs). Worse, `analytics` is bundled as the heaviest component of the atomic
`/overview` response, so the whole page waits on `get_project_analytics` even though the landing never
shows it.

Fix: **fetch tab-specific hub data lazily, only when its tab is active**, and gate the Overview tab's
skeleton only on the data it actually renders. Overview paints as soon as the light `/overview` bundle
(project + team + links + prd + goals/milestones/activities) returns; analytics and work items load
when the user opens Tracker/Timeline. Almost entirely frontend; one line removed from the backend
bundle. No SQL, no cross-DB risk, and analytics/work-items compute is now off the first-paint path
entirely (scale-resilient).

This supersedes the earlier "SQL-rewrite `get_project_analytics`" idea: at current data scale that
compute is milliseconds, and once it's off the critical path there's nothing to optimize. Deferred
until `PERF_LOG` shows it actually slow.

## Goals

- Overview (default tab) first paint waits only on project/team/links/prd — not on analytics or work
  items.
- `analytics` is no longer computed inside the `/overview` request (removes the heaviest sub-fetch
  from the blocking bundle server-side too).
- `analyticsQuery` fetches only when the Tracker tab is open; `hubWorkItemsQuery` only when
  Tracker/Timeline is open.
- Tab switches to already-visited tabs stay instant (data cached by react-query after first visit).

## Non-goals (deferred)

- SQL rewrite of `get_project_analytics` — premature once it's off the first-paint path; revisit via
  `PERF_LOG` if it ever shows slow.
- `async def` sync-DB routes (audit item; small separate backend PR).
- Making goals/milestones/activities lazy — they're cheap and already arrive in the `/overview`
  bundle; leave them eager so Timeline/Activity stay instant.
- List virtualization, codegen, duplicate hub/board keys.

---

## Design sketch

### Tab → hub-data map (what gates what)

| Query | Consuming tab(s) | In `/overview` bundle? | Action |
|---|---|---|---|
| `analyticsQuery` | tracker | **yes (today)** | Remove from bundle; gate `enabled: activeTab==='tracker'` |
| `hubWorkItemsQuery` | tracker, calendar(Timeline) | no (separate request) | Gate `enabled: ['tracker','calendar'].includes(activeTab)` |
| `goals`, `milestones` | calendar(Timeline) | yes | Leave eager (cheap, seeded) |
| `activities` | activity | yes | Leave eager (cheap, seeded) |
| project/prd/links/sprints/developers | overview + others | yes / global | Unchanged (Item-1 gating from PR #90 stays) |

### Backend — one line

**File:** `backend/routers/overview.py` (`get_project_overview`)

Remove the `"analytics"` sub-fetch from the returned bundle (the `_safe("analytics", lambda: get_project_analytics(...), {})` entry). This makes `/overview` stop running `get_project_analytics`
(its heaviest sub-fetch) on every project load — the response gets lighter and faster, and analytics
is computed only when the standalone `/api/workitems/projects/{id}/analytics` endpoint is hit (i.e.
when the Tracker tab opens). Leave the endpoint itself untouched.

> The frontend will no longer read `analytics` from the overview response; keeping the key would just
> ship dead compute. Confirm no other consumer of `/overview` reads `analytics` (only
> `useProjectDetailData`'s seeding effect does — updated below).

### Frontend — thread `activeTab` in and gate the tab-specific queries

**Files:** `app/src/pages/ProjectDetail/ProjectDetail.tsx`, `.../hooks/useProjectDetailData.ts`,
`.../tabs/OverviewTab.tsx`

1. **Pass `activeTab` into the data hook:** `useProjectDetailData(id, activeTab, options)` (or fold
   into the options object). `activeTab` already lives in `ProjectDetail.tsx` state.

2. **Gate the tab-specific queries** (replacing the PR-#90 `overviewCovers` gate for these two, since
   they're no longer seeded/eager):
   - `analyticsQuery`: `enabled: !!id && activeTab === 'tracker'`
   - `hubWorkItemsQuery`: `enabled: !!id && (activeTab === 'tracker' || activeTab === 'calendar')`
   - Remove the `queryClient.setQueryData(['hubData', id, 'analytics'], d.analytics)` line from the
     seeding effect (analytics is no longer in the bundle).

3. **Split the loading state so Overview doesn't wait on unseen data.** Today a single `hubLoading`
   (which includes `analyticsQuery.isLoading || hubWorkItemsQuery.isLoading`) gates OverviewTab.
   Because a *disabled* query reports `isLoading: true`, an ungated OverviewTab would now hang forever
   on the Overview tab (analytics/workItems disabled there). So:
   - **OverviewTab gate** → base it on the overview bundle only: `overviewLoading = isLoading` (the
     existing overview-anchored `isLoading` from PR #90 — project/prd/links all arrive with the
     bundle). Pass `overviewLoading` in place of `hubLoading`; rename the prop for clarity.
   - **Tracker/Timeline loading** → give those tabs their own loading derived from their queries
     (`analyticsQuery.isLoading` / `hubWorkItemsQuery.isLoading`). These are only read while their tab
     is active, so the disabled-`isLoading:true` value is never observed on the wrong tab.
   - Update `hubLoading`'s definition/consumers accordingly (grep every reader; today it's OverviewTab
     + possibly Tracker/Timeline).

4. **`hubWorkItems` empty-array stability** — keep the existing `useMemo(() => hubWorkItemsQuery.data ?? [], [...])` so Timeline/Calendar row memos don't churn (already present).

**Why this is safe:** the Overview tab renders `ProjectInfoSection`/`TeamSection`/`LinksSection`/
`PRDAnalysisSection`/`ArchitectureSection` — none read `analytics` or `hubWorkItems`. Gating those two
queries and removing them from Overview's loading gate changes *when* they fetch, not *what* renders.

---

## Risks (severity-ranked)

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | Disabled-query `isLoading: true` leaks into a tab's gate → permanent skeleton | **Med** | OverviewTab gates on `overviewLoading` (bundle), never on analytics/workItems; Tracker/Timeline read their query loading only while active. Add/keep a render test per tab. |
| R2 | A consumer of `/overview` (other than the seeding effect) reads `analytics` and breaks when it's removed | Low | Grep confirms only `useProjectDetailData` seeding uses it; remove that line in the same change |
| R3 | First visit to Tracker/Timeline now shows a brief spinner (was instant via eager bundle) | Low (accepted) | Product-approved trade; subsequent visits are cached (30s staleTime); charts are a heavy view where a short load is expected |
| R4 | `hubLoading` has multiple readers; missing one leaves a tab with a wrong loading state | Low | Grep all readers before editing; TS will catch prop-shape changes |

## Task checklist

- [ ] **Backend** — remove the `analytics` entry from the `/overview` bundle in `routers/overview.py`; leave `get_project_analytics` intact. Confirm `test_overview.py` expectations (drop any assertion that the bundle contains `analytics`).
- [ ] **Hook** — thread `activeTab` into `useProjectDetailData`; gate `analyticsQuery` (tracker) and `hubWorkItemsQuery` (tracker/calendar); drop the analytics line from the seeding effect.
- [ ] **Loading split** — introduce `overviewLoading` for OverviewTab; give Tracker/Timeline their own loading; update all `hubLoading` readers.
- [ ] **OverviewTab** — consume `overviewLoading`; verify it renders as soon as project/prd/links are ready.
- [ ] **Tests** — update `test_overview.py`; add/adjust a frontend render test asserting Overview paints without analytics/workItems, and Tracker shows its loading then charts.
- [ ] `cd app && npx tsc -b --noEmit && npm run lint && npm test`
- [ ] `cd backend && ruff check . && ruff format --check . && python -m pytest`

## Verification (empirical)

Run backend with `PERF_LOG=1`:
- **Land on a project (Overview tab):** expect a single `[GET /api/projects/{id}/overview]` — and crucially **no** `[GET /api/workitems/projects/{id}/analytics]` and **no** `/api/workitems/?project_id=` until you switch tabs. Overview content paints as soon as `/overview` returns.
- **Open Tracker:** now `analytics` and work-items requests fire; charts render after.
- **Open Timeline:** work-items request fires (if not already cached from Tracker).
- **Switch back to a visited tab:** no new request (cache hit).

---

## PR description draft

**Title:** `Fetch ProjectDetail tab data lazily so the landing tab doesn't block on charts`

**Body:**

Follow-up to #90. The ProjectDetail landing (`overview` tab) blocked its skeleton on `analytics` and
work-items data it never renders — and `analytics` was the heaviest sub-fetch bundled into the atomic
`/overview` response. This makes tab-specific hub data load lazily when its tab opens, so the landing
paints as soon as the data it actually shows is ready.

- **Backend:** `/overview` no longer computes/returns `analytics` (its heaviest sub-fetch); the
  standalone analytics endpoint is unchanged and now hit only when the Tracker tab opens.
- **Frontend:** `analyticsQuery` is gated to the Tracker tab, `hubWorkItemsQuery` to Tracker/Timeline;
  the Overview tab's loading gate now depends only on the `/overview` bundle (project/team/links/prd),
  not on analytics/work-items. Split the single `hubLoading` into per-tab loading so a disabled
  query's `isLoading: true` can't stick a spinner on the landing.

Trade-off: the first visit to Tracker/Timeline shows a brief spinner (previously instant via the eager
bundle); subsequent visits are cached. Charts are a heavy view where a short load is expected.

**Test plan:** frontend `tsc`/lint/tests; backend `ruff`/`pytest` (incl. updated `test_overview.py`).
With `PERF_LOG=1`: landing on a project emits only `/overview` (no analytics/work-items request);
those fire when Tracker/Timeline opens; revisiting a tab is a cache hit.

## Deferred / follow-ups

- SQL rewrite of `get_project_analytics` — only if `PERF_LOG` shows it slow once it's off the
  first-paint path.
- `async def` → `def` on `update_sprint`/`delete_sprint`/`upload_project_file` (small backend PR).
- List virtualization (its own PR).
