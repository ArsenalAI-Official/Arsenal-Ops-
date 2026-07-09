# Calendar-style Time Logging — 5-Day Week Grid

**Status:** Approved (design + data model). Delivery: **single PR**, preceded by an iterated UI design spec.
**Date:** 2026-06-24
**Plan tier:** Standard (schema + contract change, broad ripple, but single-team, single-repo, one PR)

---

## Summary / TL;DR

A Google-Calendar-style 5-day (Mon–Fri) hour grid for logging work. The user's assigned tickets sit in a left **palette**; the user **drags a ticket onto the grid** (or draws a block then assigns a ticket) to create a positioned time block. Blocks **snap to 15 minutes**, can be **moved, resized from either edge, and deleted**, and **persist exactly as arranged** (real `start_time`/`end_time`). One ticket can have **many blocks, including several on the same day** — each block is its own `TimeEntry` row via the existing `work_item.time_entries` one-to-many.

The enabling change: `TimeEntry` gains `start_time`/`end_time` (UTC), and `hours` becomes fractional (`Numeric(5,2)`), with the fractional value rippling (correctly) through rollups, capacity, and hours displays.

**Why:** Logging hours today is a disconnected, read-only experience. A calendar gesture makes time tracking fast, visual, and spatially meaningful.

---

## Goals / Non-goals

**Goals**
- Draw / drag-from-palette / move / resize / delete positioned time blocks.
- 15-minute snapping granularity.
- Blocks persist exactly as arranged and reload at their precise day + time-of-day.
- Many blocks per ticket, including multiple on the same day, laid out side-by-side when overlapping.
- Fractional-hours correctness across `SUM(hours)` rollups, capacity (40h cap), and all hours displays.

**Non-goals (v1)**
- Jira sync.
- Multi-user / team calendar (self-logging only; assignee-authorized).
- Recurring blocks.
- External calendar import/export.
- Changing 40h capacity-cap semantics.

---

## Data model (CONFIRMED)

**`start_time` + `end_time` on `TimeEntry`; `hours` widened to `Numeric(5,2)`.**

- Each block = one `TimeEntry` row. "Many blocks per ticket" falls out of the existing one-to-many.
- Store **UTC**, render **local**. Overlap/range queries become a trivial `WHERE start_time BETWEEN ...`.
- `hours` stays as a **denormalized cache derived from the interval on write** (`hours = (end_time - start_time)` in hours), so the existing `SUM(TimeEntry.hours)` rollups keep working with only a column-type change.
- `Numeric` (exact decimal), **not** `Float` — no rounding drift; neutralizes the case for a parallel `duration_minutes` column.
- New columns are **nullable**: legacy rows (which have `hours` + `logged_at` but no real position) keep working and render in an "unscheduled/legacy" tray, not at a faked grid position.
- `logged_at` stays as the audit "when recorded" timestamp, distinct from `start_time` "when worked."

---

## Component approach (resolved by the design spec)

The one real fork is **reuse react-big-calendar vs. build a custom grid**. Both satisfy every hard requirement; the decision is deferred to the approved design:

- **If the design fits rbc's DOM:** reuse `react-big-calendar` Week view + `withDragAndDrop` (`step={15}`, `selectable` → `onSelectSlot` for draw-to-create, `onEventDrop`/`onEventResize` for move/resize, `onDropFromOutside`/`dragFromOutsideItem` for the palette drag-source). **Zero new dependencies.** rbc 1.19.4 already supports React 19, and its drag addon uses rbc's own `Selection.js` pointer abstraction — **not** react-dnd (so the react-dnd/React-19 concern is moot).
- **If the design demands pixel-exact shadcn styling:** build a custom CSS-grid time-grid with **native Pointer Events (`setPointerCapture`)** for draw-to-create + resize (no new drag dependency either way; dnd-kit's React-19 path is unsettled and is drag-an-existing-item oriented, not draw-to-create oriented).

Either path: the existing dark-theme `.rbc-*` CSS in `CalendarView.tsx` is the styling reference.

---

## The UI design-spec prompt (first iteration — user iterates before coding)

> Design a **5-day week calendar view for logging work hours**, styled to match an existing dark-themed internal PM tool (React + Tailwind + shadcn/ui; near-black `#0d0d0d` surfaces, subtle borders, muted text, status-colored accents). It's a focused work surface, not a public marketing page.
>
> **Layout:** A left **ticket palette** (scrollable list of the user's assigned tickets — each chip shows ticket key, title, and a remaining-hours indicator) and a main **week grid**: 5 weekday columns (Mon–Fri) × hour rows (configurable working hours, e.g. 7am–7pm), with a faint 15-minute sub-grid and a "now" line.
>
> **Core interaction:** Users **drag a ticket from the palette onto the grid** to create a time block, and can also **draw a block directly on empty grid** then assign a ticket. Blocks **snap to 15-minute increments**, can be **moved**, **resized from either edge**, and **deleted**. A ticket can have **many blocks, including several on the same day**; show overlapping/adjacent blocks side-by-side cleanly. Each block displays ticket key, title, and duration (e.g. "1h 30m").
>
> **Show every state:** empty week (no blocks), a populated week with overlaps, a block being dragged (ghost + snap preview), a block being resized, hover/selected states, a small "unscheduled / legacy entries" tray for time logged without a position, loading and error states, and a confirmation affordance for delete.
>
> **Deliver:** desktop-first layout (note responsive/narrow behavior), a color/spacing/typography spec consistent with a shadcn dark theme, the block visual anatomy, and the palette chip anatomy. Annotate the snapping and drag/resize affordances. Keep it implementable with Tailwind utilities and standard shadcn primitives.

---

## Risks (severity-ranked)

| # | Severity | Risk | Location | Mitigation |
|---|---|---|---|---|
| 1 | CRITICAL | `LogHoursRequest.hours: int` → Pydantic **422 on `2.5`** | `backend/routers/workitems.py:1527` | Change to `float`; widen related schemas |
| 2 | CRITICAL | `int()` casts silently truncate fractional sums (Employees/PM/me-capacity) | `backend/services/capacity_service.py:275,299,424,444`; `pulse.py:575-576,604` | Remove casts; add fractional rollup tests |
| 3 | CRITICAL | `parseInt()` drops `.5` on hours input | `WorkItemPanel.tsx:131` + 5 more; `number-input.tsx` step | `parseFloat`/`Number`; `step=0.25` |
| 4 | HIGH | 5s dedup keys on **equal hours** → drawing equal-length blocks → false 429 | `workitems.py:1674-1693` | Re-key dedup on `start_time` (or exempt grid path) |
| 5 | HIGH | No per-`TimeEntry` move/resize/delete authz exists | `workitems.py:1626-1637` is the only template | New endpoints replicate assignee-only + done-frozen checks per entry |
| 6 | HIGH | DB columns are INTEGER; need migration + fix inline `database.py` SQL | `time_entry.py:30`, `work_item.py:72-76`, `database.py:101,443` | `ALTER ... TYPE NUMERIC` per `migrate_widen_activity_log_title.py`; add nullable start/end |
| 7 | MEDIUM | Backfill: legacy rows have no start/end; `logged_at` is creation time | `time_entry.py:34` | Nullable columns; render legacy as "unscheduled," don't fake position |
| 8 | MEDIUM | UTC "Sat–Fri" week math duplicated 5+ places; local grid vs UTC bucket mismatch at Fri/Sat midnight | `capacity_service.py:39-47` + dupes in `workitems.py`/`admin.py` | Consolidate on `week_boundaries()`; document UTC-vs-local |
| 9 | MEDIUM | OpenAPI/contract drift fails CI | `.github/workflows/lint.yml` gen:api diff; `backend/tests/contract/golden/*.json` | `npm run gen:api` + regen golden, commit both |
| 10 | LOW | Capacity bars `Math.min(100,...)` + hardcoded `40` hide over-allocation | `EmployeeCapacityTable.tsx:102,166` etc. | Format decimals; centralize capacity constant |

---

## Open questions (don't block starting; design spec will probe)
- **Working-hours window:** fixed (e.g. 7am–7pm) or full 24h scroll?
- **Overlap policy:** allow overlapping blocks (assumed **yes**, side-by-side) or reject?
- **Block → ticket required on commit:** assumed **yes** (a committed block must reference a ticket).

---

## Delivery — single PR, ordered build sequence

This ships as **one PR**. The design spec is a **pre-coding gate** (a Claude design artifact you iterate on), not a code change — coding starts only once the design is locked. Within the PR, build in this order so each layer rests on a known-good base; commit in this order for reviewability.

### Phase 0 — Design spec (pre-coding gate)
- Generate first iteration via the prompt above; iterate until approved.
- **Output:** locked design → resolves the rbc-vs-custom component decision and the open questions.

### Phase 1 — Backend foundation: model + migration
- `TimeEntry`: add nullable `start_time`/`end_time` (`DateTime`, UTC); change `hours` → `Numeric(5,2)`.
- `WorkItem`: widen `logged_hours`/`estimated_hours`/`remaining_hours` → `Numeric`.
- Migration script mirroring `migrate_widen_activity_log_title.py` (SQLite no-op; Postgres `ALTER COLUMN ... TYPE NUMERIC` + add nullable columns). Fix inline `database.py` CREATE/ADD-COLUMN SQL for fresh DBs.
- Backfill legacy rows: leave `start_time`/`end_time` NULL (render as "unscheduled"); do **not** fabricate positions.
- Update `TimeEntry.to_dict()` to include start/end.

### Phase 2 — Backend API: fractional correctness + block CRUD
- `LogHoursRequest.hours: int → float`; accept `start_time`/`end_time` (+ client-specified date). Derive `hours` from interval server-side.
- Remove `int()` truncation casts in `capacity_service.py` (×4) and `pulse.py`.
- Re-key the 5s dedup on `start_time` (not `hours`).
- New endpoints: create-positioned-block, **move/resize (PATCH)**, **delete (DELETE)** a `TimeEntry` — each with assignee-only + done-frozen authz.
- Consolidate week-boundary math on `week_boundaries()`.
- Widen Pydantic response schemas (`logged_hours`/`remaining_hours`/`assigned_hours`/`capacity_hours`) to float.

### Phase 3 — Contract regen
- `npm run gen:api` (exports `openapi.json`, regenerates `app/src/client/types.gen.ts`).
- Regenerate `backend/tests/contract/golden/*.json`. Commit schema + types + golden.

### Phase 4 — Frontend: fractional input safety (pre-grid)
- `parseInt` → `parseFloat`/`Number` in the 6 hours-input sites; `number-input.tsx` `step=0.25`.
- Format decimal hours in displays (`CapacityTile`, `DeveloperHoursTable`, `TimeEntriesTable`, contributors); centralize the `40` capacity constant.

### Phase 5 — Frontend: the week grid + palette + drag/resize
- Build per the locked design (rbc Week view OR custom pointer-event grid).
- Ticket palette from `GET /api/workitems/my-tasks`; drag-source onto grid.
- Draw-to-create, move, resize (15-min snap), delete; multiple/overlapping blocks per ticket.
- "Unscheduled/legacy" tray for null-position entries.
- TanStack Query mutations for create/move/resize/delete using the codebase's optimistic pattern (`onMutate` cancel→snapshot→optimistic `setQueryData`, `onError` rollback, `onSettled` invalidate `['timeBlocks']` + `['workItems']` + `['myTasks']`). Drive in-progress drag from local state; fire mutation on `pointerup`.
- New route + nav entry.

### Phase 6 — Tests
- **Backend:** migration round-trip (fractional value persists); fractional rollup (`2.5 + 1.25 → 3.75`) incl. capacity (guards the cast removal) and epic rollup; dedup re-keyed on start_time (two 0.5h blocks within 5s both succeed); move/resize/delete authz (non-assignee 403, done-frozen, owner ok); overlap; week-boundary/TZ at Fri/Sat UTC edge. Mirror `test_log_hours_defenses.py`, `test_capacity_*.py`, `test_epic_hour_rollup.py`.
- **Frontend (vitest + MSW):** drag-snapping pure-function unit test; optimistic create/move/resize/delete; fractional display (no truncation); `parseFloat` regression. Update the MSW `log-hours` handler (currently returns hardcoded integer hours).

### Merge criterion
- `ruff` + `mypy` clean; backend `pytest` green (incl. new tests); `npm run lint` + `vitest` green; `npm run gen:api && git diff --exit-code` clean (schema/types/golden committed).
- Behavioral: log in → open the week view → drag a ticket to Tue 10:00–11:30 → reload → block reappears at exactly Tue 10:00–11:30 → ticket's logged hours increased by 1.5 → capacity reflects 1.5 (not 1 or 2).

### Post-merge verification
- Run the migration against a staging Postgres; confirm existing entries still render (in the unscheduled tray) and totals are unchanged. Spot-check capacity/PM/Employees views for fractional values.

---

## PR description draft (ready to paste)

**Title:** Add calendar-style 5-day week view for logging hours via drag-and-drop time blocks

**Body:**

Adds a Google-Calendar-style 5-day (Mon–Fri) week grid where users see their assigned tickets in a side palette and log work by dragging tickets onto the grid (or drawing a block and assigning a ticket). Blocks snap to 15 minutes, can be moved/resized/deleted, support multiple blocks per ticket (including same-day), and persist exactly as arranged.

**Data model:** `TimeEntry` gains `start_time`/`end_time` (UTC, nullable) and `hours` widens to `Numeric(5,2)` (derived from the interval). `WorkItem.{logged,estimated,remaining}_hours` widen to `Numeric` so the existing `SUM(hours)` rollups stay correct with fractional values. Legacy entries (no position) render in an "unscheduled" tray.

**Notable changes:**
- New positioned-block endpoints (create/move/resize/delete) with assignee-only + done-frozen authz.
- `LogHoursRequest.hours` → float; removed `int()` truncation in capacity/pulse rollups; dedup re-keyed on `start_time`.
- Frontend `parseInt` → `parseFloat` on hours inputs; decimal-hours formatting; centralized capacity constant.
- Migration mirrors `migrate_widen_activity_log_title.py` (SQLite no-op; Postgres `ALTER TYPE` + nullable adds).

**Test plan:**
- Backend: migration round-trip, fractional rollups + capacity + epic, dedup with multiple equal-length blocks, move/resize/delete authz, overlap, Fri/Sat week-boundary TZ.
- Frontend: drag-snapping unit, optimistic create/move/resize/delete, fractional display, parseFloat regression.
- Manual: drag ticket → Tue 10:00–11:30 → reload restores position → logged hours +1.5 → capacity shows 1.5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
