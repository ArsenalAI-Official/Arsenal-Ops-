# Simplify Audit — `uiRefactor` branch & the subsystems it touches

**Date:** 2026-07-03
**Scope:** project-favorites feature, hours-analytics/PM reconciliation, pulse date formatting, Create-item modal / work-item mutation path, color-system migration, ProjectsPage/DashboardStats dashboard — plus the contract areas and adjacent code these touch (not just the diff).
**Off-limits (excluded):** generated `app/src/client/**` + `backend/openapi.json`; the mechanical hex→token color-token *swaps* (their consolidation opportunities are still in scope). `key_prefix`/role-casing area and test files were kept **in** scope per request.
**Method:** 5 parallel dimension threads. Deterministic seeds: `ruff --select F,W` (clean) + `knip`/`tsc noUnusedLocals` on the frontend (clean); jscpd/vulture/madge/radon absent. Web-searched, version-anchored claims for Thread 4.

---

## Executive summary

- **Both stacks are in good shape.** The frontend scope is dead-code-clean (knip + tsc). The backend has a small pocket of genuinely dead code. Most "leads" were investigated and **refuted** with safety records — a high-signal result.
- **Tier 1 (safe): 5 findings**, ~55 LOC removed + 2 mechanical clarity fixes.
- **Tier 2 (low-risk): 3 findings**, ~24 LOC removed + 2 named-constant/dedup refactors.
- **Tier 3 (structural): 1 finding** — local color maps duplicating the canonical `workItemConfig` palettes across ~8 files (wide-touching; verify hexes match before merging).
- **Tier 4 (judgment): 5 findings** — all either behavior-changing (Intl currency, `datetime.now(UTC)`, Postgres-only upsert) or cosmetic.
- **Top 3 by impact/risk:** (1) delete the two dead hours helpers in `projects.py` (~45 LOC, zero callers); (2) delete the dead duplicate `ticket_breakdown` response key in `get_hours_analytics` (~24 LOC + an O(n³) scan per request); (3) name the `story_points * 4` magic multiplier.
- **Total est. reduction ~80 LOC** across ~8000 LOC in scope (~1%) — no over-optimization risk; nothing demoted for LOC.

**Verdict:** A short, safe Tier-1/Tier-2 cleanup is worth doing (especially the three dead-code deletes). Tier 3 is a real but broader consolidation to schedule deliberately. Tier 4 items are documented so they're not rediscovered — most should be left alone.

---

## Tier 1 — Safe cleanup

### 1.1 — Delete dead hours helpers `calculate_hours_excluding_weekends` + `get_working_days_in_range`
- **Location:** `backend/routers/projects.py:1496-1517` and `1520-1542`
- **Current:** `calculate_hours_excluding_weekends` has zero callers anywhere; it calls `get_working_days_in_range`, which is called *only* by it — a self-contained dead cluster.
- **Proposed:** Remove both (~45 LOC).
- **Safety:** `grep -rn` across `backend/` + `app/src` (excl. generated) → each name resolves only to its own definition/the internal call. Neither is a route (`@router`) or a Pydantic model. Frontend clean.
- **Confidence:** High.

### 1.2 — Delete dead month helper `_end_of_month`
- **Location:** `backend/routers/pulse.py:115-123`
- **Current:** Its own docstring says it's "kept for places that want a representable end datetime" — no such call site exists. Every actual site uses the exclusive-bound `< _start_of_month(_add_month(dt))` idiom. Sibling helpers (`_month_label`, `_add_month`, `_start_of_month`, `_enumerate_months`) are all used; only this one is orphaned.
- **Proposed:** Remove (~9 LOC).
- **Safety:** `grep -rn "_end_of_month" backend` → definition only; not in tests; not a route/model.
- **Confidence:** High. *(Also surfaced by Thread 2 as premature-configurability; deduped to here.)*

### 1.3 — Use the existing `fmtPct` helper in `ForecastVsActualsCard`
- **Location:** `app/src/components/ProjectHub/ProjectPulseView/sections/ForecastVsActualsCard.tsx:110`
- **Current:** `{Math.round(varPct * 100)}%` (inline) where `varPct` is a 0–1 fraction. Every other Pulse consumer of a 0–1 fraction uses the local `fmtPct` (`ProjectHeroCard.tsx:84,130,164`).
- **Proposed:** `{fmtPct(varPct)}` + add the one-line import from `../lib/format`. `fmtPct = Math.round(v*100)+'%'` — byte-for-byte identical output (pinned by `format.test.ts:23-28`).
- **Safety:** Confirmed `varPct` semantics = ratio in 0–1; identical rounding; returns a plain string, safe inside the SVG `<text>` node.
- **Confidence:** High.

### 1.4 — Extract three inline render-block IIFEs in `DeveloperHoursTable`
- **Location:** `app/src/components/PMView/sections/DeveloperHoursTable.tsx` (442 LOC): the "This Week" capacity-bar cell (L124-183), the "Logged hours per week" view (L236-298), and the "This Week — by status" view (L300-423).
- **Current:** Three anonymous `(() => { ... })()` blobs nested ~7 levels deep inside the row `.map`.
- **Proposed:** Extract three presentational sub-components (`<WeekCapacityBar dev />`, `<WeeklyLoggedView dev />`, `<WeekByStatusView dev expandedView />`) in the same file, returning the JSX verbatim.
- **Impact:** Top-level component drops to a ~150-LOC readable table skeleton; nesting depth −3.
- **Safety:** Each block reads only from `dev` (+ `expandedView`, passed as prop); no hooks inside the IIFEs, no closure over loop-index side effects, no mutation — extraction preserves render output and order exactly. Existing PMView render smoke covers it.
- **Confidence:** High. *(Borderline Tier 1/2 — pure presentational, no data/math change, so Tier 1; it does touch a 442-LOC file, so review the diff.)*

### 1.5 — Name the `40` weekly-capacity literal in `DeveloperHoursTable`
- **Location:** `app/src/components/PMView/sections/DeveloperHoursTable.tsx:138,145,152,162` (three `/ 40` bar-widths + a `{capUsed}h/40h` label).
- **Current:** Four bare `40`s meaning "weekly capacity hours." Backend `services/capacity_service.py` already parameterizes it (`week_capacity: int = 40`).
- **Proposed:** `const WEEKLY_CAPACITY_HOURS = 40;` at file top; reference in all four spots. (Do **not** couple to the backend default — the payload doesn't emit the cap; that's out of scope.)
- **Safety:** All four `40`s confirmed same concept; literal→named, same value.
- **Confidence:** High.

---

## Tier 2 — Low-risk refactors

### 2.1 — Delete the dead duplicate `ticket_breakdown` response key in `get_hours_analytics`
- **Location:** `backend/routers/workitems.py:2983-3006` (+ its `dev_entries` precursor).
- **Current:** A second per-dev per-ticket breakdown is built *after* the richer, transfer-aware `my_tickets` block (L2723-2783) and attached as `dev_data["ticket_breakdown"]` — using an O(dev × entries × items) `next(item for item in items…)` linear scan per entry. It even emits a *different* field shape (`item_id`/`item_key`/`hours_logged`) than the frontend's `TicketBreakdown` type. The frontend reads only `my_tickets` (`PMView/types.ts:87`, rendered in `DeveloperHoursTable`).
- **Proposed:** Delete L2983-3006 and drop the `ticket_breakdown` key (~24 LOC + one nested scan/request). Keep the `time_entries` variable (used elsewhere).
- **Safety:** All 6 `ticket_breakdown` refs are inside `workitems.py`; **zero** frontend refs. Route is a bare `@router.get(...)` with no `response_model=`/`responses=`, so the key is **not** a type-generator contract source. **Caveat:** it *is* an observable HTTP field, and this endpoint hand-builds its dict — run `backend/tests/contract/` after; if a snapshot pins the key, treat as Tier 3.
- **Confidence:** Med (unread in-repo; can't prove no external consumer). *(Raised independently by Thread 1 and Thread 5.)*
- **Implication question:** does any external dashboard/report hit this endpoint and read `ticket_breakdown`? Confirm before deleting.

### 2.2 — Name the `story_points * 4` hours multiplier
- **Location:** `app/src/pages/ProjectBoard/hooks/useWorkItemMutations.ts:158-159` (real create path) and `backend/routers/workitems.py:1921-1922` (seed/demo generator).
- **Current:** The points→hours factor `4` is a bare literal at both sites; no named constant. (`typeUsesPoints` is now shared — this multiplier is the remaining unnamed half of the same rule.)
- **Proposed:** `const HOURS_PER_POINT = 4;` next to `typeUsesPoints` in `app/src/lib/workItemConfig.ts` (imported by the hook); a module constant on the backend seed side. Not a cross-stack shared constant — just a named literal per side.
- **Safety:** Grepped all `story_points *` / `* 4` sites; only these two are the rule (other `* 4` hits are unrelated: TimelineView column step, etc.). Literal→named, identical value.
- **Confidence:** High. Kept out of Tier 1 only because it's on the contract-adjacent create-payload path.

### 2.3 — Consolidate the duplicated priority-sort onto `LIST_SORT_PRIORITY_ORDER`
- **Location:** `app/src/components/ProjectsPage/MyTasksBox/lib.ts:46-53` (`sortPersonalTasks`) and `app/src/pages/PersonalTasks/PersonalTasks.tsx:94-103` (inline) both hardcode `{ critical:0, high:1, medium:2, low:3 }`, which already exists canonically as `LIST_SORT_PRIORITY_ORDER` in `app/src/pages/ProjectBoard/lib/listSort.ts:19-24`.
- **Current:** The priority-rank map is triplicated; the done-first tiebreak logic is duplicated between the two sort sites.
- **Proposed:** Import `LIST_SORT_PRIORITY_ORDER` in both; optionally lift the shared done-first+priority comparator into `MyTasksBox/lib.ts` and reuse from `PersonalTasks.tsx`.
- **Safety:** The three rank maps are byte-identical. `PersonalTasks.tsx` is outside the named subsystems but is a direct duplicate of an in-scope helper's logic. The two comparators are equivalent for the priority branch; verify the done-first ordering matches before merging the whole comparator (they do in the read).
- **Confidence:** Med-High (rank map: High; full comparator merge: verify).

---

## Tier 3 — Structural refactor (design conversation)

### 3.1 — Local color maps duplicate the canonical `workItemConfig` / `avatarColor` palettes
- **Locations (representative):** local `PRIORITY_COLORS`/`TYPE_CONFIG`/status maps hardcoding the same hexes as `app/src/lib/workItemConfig.ts` (`PRIORITY_COLOR`, `STATUS_CONFIG`, `TYPE_CONFIG`) across: `pages/ProjectBoard/components/KanbanCard.tsx`, `pages/ProjectBoard/modals/AIPlanning/components/GeneratedTicketCard.tsx`, `pages/PersonalTasks/types.ts`, `pages/AdminDashboard/tabs/DashboardTab.tsx`, `pages/AdminDashboard/tabs/ProjectsTab/types.ts` + `EmployeesTab/types.ts`, `pages/ProjectDetail/tabs/TrackerTab.tsx`, `components/ProjectsPage/constants.ts`. Each canonical color (`#E5484D` critical, `#EC7A3C` high, `#40BE86` done, `#6E62E6` in-progress, etc.) is re-typed in 6–10 files.
- **Current:** After the color migration, the *source of truth* exists (`workItemConfig`), but many pre-existing local maps still hardcode the same values, so a future palette change must be made in ~8 places or they drift.
- **Proposed:** Point the local maps at `getPriorityColor`/`getStatusColor`/`TYPE_CONFIG`. Do this incrementally, one consumer per commit.
- **Safety / caution:** **Verify each hex actually matches the canonical value before replacing** — the migration may have intentionally left a few divergent (e.g. a chart-specific shade). This is wide-touching and mostly *outside* the diff, so it's a scheduled consolidation, not a drive-by. Consider a characterization test / visual check per surface (Kanban card, admin dashboard donut, tracker) since these feed rendered colors.
- **Confidence:** Med — the duplication is real and quantified; the risk is a silently-intended divergence being flattened.

---

## Tier 4 — Judgment calls (presented, not pushed)

- **`priorityColor` pass-through wrapper** — `app/src/components/ProjectsPage/MyTasksBox/lib.ts:7` is a 1-line rename of `getPriorityColor`. Could inline at its 3 call sites (WorkItemRow ×2, PersonalTasksList) and drop the redundant test block (~8 LOC). Purely cosmetic; touches 2 components + 1 test. *(Thread 2.)*
- **`statusChangeMutation` alias** — `useWorkItemMutations` exports `statusChangeMutation = moveMutation`; a grep showed no consumer of the alias (real consumers use `moveMutation`). Documented as a backward-compat seam. Verify no external consumer, then it's a safe delete — but removing an export is seam-narrowing, so confirm first. *(Thread 2 lead; frontend knip reported clean, which is mildly contradictory — reconcile before acting.)*
- **`datetime.utcnow()` → naive-UTC modern form** — `project_favorite.py:28` default + ~7 call sites in `projects.py`/`workitems.py`. Deprecated only from **Python 3.12**; runtime is **3.11**, so no warning today. A bare `datetime.now(UTC)` returns **tz-aware**, which would break the codebase's naive-UTC comparisons — the correct form is `datetime.now(UTC).replace(tzinfo=None)` (pulse already has `_utc_now()` doing exactly this) or `server_default=func.now()`. Not urgent; behavior-sensitive. Source: Grinberg "utcnow is deprecated"; SQLAlchemy 2.0 Column Defaults. *(Thread 4.)*
- **`add_favorite` → `on_conflict_do_nothing()` upsert** — cleaner than INSERT+`IntegrityError`, but it's **PostgreSQL-dialect-only** and the app runs pytest (incl. contract harness) on **SQLite**, so it would break the test path/local dev. The current portable try/except is fine. Skip unless tests move to Postgres. Source: SQLAlchemy 2.0 PG ON CONFLICT docs. *(Thread 4.)*
- **`fmt$` → `Intl.NumberFormat`** — **not output-identical**: differs on negative half-values (`-1234.5` → hand `-$1,234` vs Intl `-$1,235`; `-2.5` → `-$2` vs `-$3`) because hand-rolled rounds the magnitude then re-signs. Pulse currency can be negative (ledger deltas), so this is a real divergence, not theoretical. Leave as-is. `fmt$k` (custom "k" label) and `fmtPct` have no equivalent. Source: MDN/V8 Intl.NumberFormat. *(Thread 4.)*
- **Due-date sort near-duplicates** — `MyTasksBox/lib.ts sortUpcomingTasks` vs the inline sorts in `PersonalTasks.tsx:74-93` differ materially (null fallback `'9999-12-31'`, done-first handling, in-place vs copy). Not safe to merge as-is; would need a unified contract first. *(Thread 3 enumeration.)*

---

## Reaffirmations — investigated, deliberately NOT recommended

- **Do NOT unify `avatarColor` (identity avatars, 6 hues, bg/ring/fg triple) with `projectDotColor` (6px task-row dot, 8-color palette).** The lead is real — the same project id maps to different colors in the Projects list vs the My Tasks dot — but the two are semantically distinct (identity tint vs saturated swatch), `avatarColor` is identity-seeded across 18 people-avatar sites, and merging would cause an unintended visual change + couple concerns that can evolve apart. A one-line doc note is the most that's warranted. *(Thread 3.)*
- **No `fmtHours` helper.** ~30 `${x}h` sites carry zero formatting logic (no rounding/locale/decimals) and many are compound (`{capUsed}h/40h`, `est {x}h`). A scalar helper would add 30 imports to save nothing and wouldn't fit the compound forms. Idiomatic inline unit-suffixing, unlike `fmt$` which centralizes real logic. *(Thread 3.)*
- **React-query optimistic boilerplate is appropriately idiomatic.** Only 2 of 8 mutations are optimistic, and they differ in cache-key shape, cancel granularity (exact vs prefix — a documented invariant), rollback field, and settle-side invalidations. A generic helper would be larger than the two explicit blocks and risks eroding the CLAUDE.md-documented cache-key discipline. The genuinely shared pieces are already extracted (`toastErrorHandler`, `invalidateWorkItems`, `applyStatusChange`). *(Thread 3.)*
- **`get_hours_analytics` length (~520 LOC) — left as a Tier-3 *candidate pending a test*, not landed.** The transfer-aware per-dev allocation + sprint-overlap proration is contract-sensitive (negatives intentional) and closes over ~6 shared locals. A safe extraction needs a characterization test snapshotting the endpoint JSON for a fixture with a transferred/over-logged ticket and a dateless-sprint week first. *(Thread 5.)*
- **`CreateItemModal` (496 LOC) and `useWorkItemMutations` (322 LOC)** — long but flat: sequential conditional field blocks gated by the now-shared `typeUsesPoints`/`fieldSupportsType`, and six distinct mutations respectively. No repeated logic, no deep nesting; extraction would be cosmetic and risk disturbing `setCreateForm` closures. Long ≠ finding. *(Thread 5.)*
- **`format_project` wrapper, `_safe` error-isolation, `workItemConfig`/`avatarColor` single-sources, `index.ts` barrels, PMView hand-written `HoursAnalytics` types** — all genuine value-adding abstractions or required contract boundaries. `format_project` has 4 callers + a parity test; the hand-written analytics types match a `responses=`-typed endpoint (no generated type exists). *(Thread 2.)*
- **Backend `sum(...)` comprehensions in hours-analytics** — operate over already-loaded objects reused across many sub-computations; converting to SQL `func.sum` would require re-querying per slice and be slower/not simpler. Legitimate load-once-aggregate-in-Python. Where SQL aggregation pays off (`get_work_item_stats_batch`, `_derive_summary`) the code already uses `func.count`/`func.sum`/`case`. *(Thread 4.)*
- **`format_projects_batch`, `pulse.py` `_derive_*` helpers, `CategoryRibbon` marker math** — already cleanly decomposed; no findings. *(Thread 5.)*

---

## Sources (Thread 4)

- SQLAlchemy 2.0 PostgreSQL ON CONFLICT — https://docs.sqlalchemy.org/en/20/dialects/postgresql.html
- SQLAlchemy 2.0 Column Defaults — https://docs.sqlalchemy.org/en/20/core/defaults.html
- Grinberg, "It's time for a change: datetime.utcnow() is now deprecated" — https://blog.miguelgrinberg.com/post/it-s-time-for-a-change-datetime-utcnow-is-now-deprecated
- MDN Intl.NumberFormat — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat/NumberFormat
- V8 Intl.NumberFormat — https://v8.dev/features/intl-numberformat

## Appendix — dropped duplicates

- `_end_of_month` dead helper: raised by Thread 1 (dead code) and Thread 2 (premature configurability) → kept Thread 1's framing (§1.2).
- `ticket_breakdown` dead key: raised by Thread 1 (dead response key) and Thread 5 (dead duplicate build) → merged into §2.1.
