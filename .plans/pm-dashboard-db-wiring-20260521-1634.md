# PM Dashboard / Pulse — wire to DB items

**Branch:** `feat/pm-dashboard-db-wiring`
**Date:** 2026-05-21
**Author:** eli.heakins@arsenalai.com

## Problem

The Pulse view ([ProjectPulseView.tsx](app/src/components/ProjectHub/ProjectPulseView.tsx)) and the Project Manager tab ([PMView.tsx](app/src/components/PMView.tsx)) are the PM-facing surfaces on `ProjectDetail`. The PM tab is mostly already wired to DB (`/api/workitems/projects/:id/hours-analytics`). The **Pulse view, however, is driven entirely by `PulseData` saved to `localStorage`** ([pulseData.ts:163-217](app/src/components/ProjectHub/pulseData.ts#L163-L217)), and `PulseSettingsView` is the editor that lets a PM type those values in by hand.

A large fraction of those hand-entered values either already exist in the DB or are trivially derivable from data we already have (`work_items`, `time_entries`, `sprints`, `project_milestones`, `activity_logs`, `projects`). Today the PM has to mirror reality into a localStorage form — a per-browser data island that drifts the moment anyone logs an hour or closes a ticket.

## Goal

Replace every Pulse Settings field that has a credible DB source with a server-computed value. Keep the few fields that are genuinely editorial (narrative copy, contract dollars/ledger, risks, manual forecasts) as user inputs — but consider moving those off localStorage to a `project_pulse_overrides` table in a follow-up.

This PR's plan is **derivation + read-only display**, not the override-table backend work.

---

## Field-by-field audit

Sources in the DB:
- `projects` — id, name, key_prefix, end_date, created_at, status, description
- `work_items` — type, status, priority, story_points, estimated_hours, logged_hours, remaining_hours, due_date, completed_at, started_at
- `time_entries` — hours, logged_at, developer_id, work_item_id
- `sprints` — start/end dates, status, capacity_hours, velocity
- `project_milestones` — title, due_date, completed_at
- `activity_logs` — action, entity_type, title, created_at, user

### `PulseSummary` ([pulseData.ts:89-112](app/src/components/ProjectHub/pulseData.ts#L89-L112))

| Field | Source | Notes |
|---|---|---|
| `deliveryCompleted` | `COUNT(work_items WHERE status='done')` | DB-derivable |
| `deliveryTotal` | `COUNT(work_items)` | DB-derivable |
| `deliveryPct` | derived from the two above | DB-derivable |
| `overdueCount` | `COUNT(work_items WHERE due_date < now() AND status != 'done')` | DB-derivable |
| `openBugs` | `COUNT(work_items WHERE type='bug' AND status != 'done')` | DB-derivable |
| `criticalOpen` | `COUNT(work_items WHERE priority='critical' AND status != 'done')` | DB-derivable |
| `workItems` | `COUNT(work_items)` | DB-derivable |
| `pointsCompleted` | `SUM(story_points WHERE status='done')` | DB-derivable |
| `pointsTotal` | `SUM(story_points)` | DB-derivable |
| `activeSprints` | `COUNT(sprints WHERE status='active')` | DB-derivable |
| `monthLabel` / `monthIndex` / `totalMonths` | from `projects.created_at` → `projects.end_date` and current date | derivable; no DB column needed |
| `overallCompletion` | hours-based — `SUM(logged_hours)/SUM(estimated_hours)` OR points-based | DB-derivable (reuse `hours-analytics`) |
| `healthScore` | **rule** over the above (e.g. start 100, –N per overdue/critical/burn-variance) | derivable but needs a defined formula — propose v1 below |
| `healthStatus` | bucket of `healthScore` (≥80 Healthy, ≥60 At Risk, else Critical) | derived |
| `narrative` | **editorial** — keep manual | leave |
| `risksTrendNote` | derivable as `"{n} active risks"` once risks are DB-backed; until then, editorial | leave |
| `peopleTrendNote` | `COUNT(DISTINCT time_entries.developer_id WHERE logged_at > now()-30d AND work_items.project_id=?) + " active contributors"` | DB-derivable |

### `PulseProjectMeta` ([pulseData.ts:81-87](app/src/components/ProjectHub/pulseData.ts#L81-L87))

| Field | Source | Notes |
|---|---|---|
| `name` | `projects.name` | DB-derivable |
| `keyPrefix` | `projects.key_prefix` | DB-derivable |
| `contractStart` | `projects.created_at` (as default; allow override) | DB-derivable with caveat — no real contract date column today |
| `contractEnd` | `projects.end_date` | DB-derivable |
| `launchTarget` | nearest `project_milestones` with title matching `/launch|go.?live|release/i`, else `contractEnd` | DB-derivable with heuristic |

> Caveat: `contractStart` doesn't map cleanly. Options: (a) reuse `created_at`; (b) add `projects.contract_start_date` migration. Recommended: **(a) for v1**, mention (b) as a follow-up.

### `MonthRow[]` (months, monthly burn) ([pulseData.ts:13-24](app/src/components/ProjectHub/pulseData.ts#L13-L24))

| Field | Source | Notes |
|---|---|---|
| `m` (month label) | derived from contract date range | DB-derivable |
| `devAct` (dev hours actual / month) | `SUM(time_entries.hours)` grouped by `date_trunc('month', logged_at)` for this project | DB-derivable |
| `devFC` (dev hours forecast / month) | **editorial / sprint planning input** | keep manual for v1 |
| `dev`, `ad`, `gtm`, `ba`, `mgmt` (cost categories per month) | **editorial** — these are dollars per category, not hours | keep manual |
| `actual` / `partial` (flags) | derived from current date vs month | DB-derivable |
| `lastActualIdx` | derived from current date relative to the months array | DB-derivable |
| `currentMonthTrackedPct` | derived from current date within the current month | DB-derivable |

### `IncludedServicesRow` ([pulseData.ts:29-38](app/src/components/ProjectHub/pulseData.ts#L29-L38))

| Field | Source | Notes |
|---|---|---|
| `month` | derived from contract date range | DB-derivable |
| `usedHours` (cumulative through this month) | `SUM(time_entries.hours WHERE logged_at <= EOM)` | DB-derivable |
| `totalHours` | **contract input** (included hours) | keep manual |
| `billableAccrued`, `billableAccruedCost`, `billableInvoiced`, `invoiceCount` | **billing system** — no DB source | keep manual |
| `expectedRemaining` | computed if `totalHours` and `usedHours` known | derivable from manual + DB |

### `PulseMilestone[]` ([pulseData.ts:51-59](app/src/components/ProjectHub/pulseData.ts#L51-L59))

| Field | Source | Notes |
|---|---|---|
| `phase` | `project_milestones.title` | DB-derivable |
| `date` | `project_milestones.due_date` | DB-derivable |
| `status` (`done`/`in-progress`/`upcoming`) | from `completed_at` + `due_date` | DB-derivable |
| `budget`, `spent`, `pct` | **financial — manual** | keep manual; consider migration to add columns later |

### `PulseUpdate[]` ([pulseData.ts:61-66](app/src/components/ProjectHub/pulseData.ts#L61-L66))

| Field | Source | Notes |
|---|---|---|
| `when` | `activity_logs.created_at` | DB-derivable |
| `author` | `activity_logs.user.name` | DB-derivable |
| `type` (milestone/note/risk) | mapped from `activity_logs.action`/`entity_type` (with a fallback `note`) | DB-derivable |
| `text` | `activity_logs.title` | DB-derivable |

### `ForecastVsActuals` ([pulseData.ts:68-79](app/src/components/ProjectHub/pulseData.ts#L68-L79))

| Field | Source | Notes |
|---|---|---|
| `feature` | `work_items` where `type='epic'` (epic title) | DB-derivable |
| `employee` | `assignee.name` of the epic | DB-derivable |
| `act` (actual hours) | `SUM(logged_hours)` over the epic's stories+subtasks, scoped by current/last month/project | DB-derivable |
| `fc` (forecast hours) | `SUM(estimated_hours)` over the same set | DB-derivable (using estimates as the forecast) |

### `PulseRisk[]` ([pulseData.ts:43-49](app/src/components/ProjectHub/pulseData.ts#L43-L49))

No DB model. **Keep manual.** Filed as follow-up: add `project_risks` table.

### `ledger` (`LedgerRow[]`) ([pulseData.ts:3-11](app/src/components/ProjectHub/pulseData.ts#L3-L11))

Dollar amounts per contract line. No DB source. **Keep manual.**

---

## Architecture

**Backend** — single new endpoint to keep the network surface small:

```
GET /api/projects/{project_id}/pulse-derived
```

Returns a JSON shape that aligns 1:1 with the DB-derivable subset of `PulseData`. Reuses existing helpers where possible (`get_hours_analytics`, `list_project_sprints`, `get_project_milestones`, `get_project_activity`). Wrap each section in the same `_safe` pattern used by `routers/overview.py:43-54` so one failing computation doesn't 500 the whole call.

Shape sketch (only the derived fields — manual fields are NOT returned):

```jsonc
{
  "project":   { "name", "keyPrefix", "contractStart", "contractEnd", "launchTarget" },
  "summary":   { "healthScore", "healthStatus", "deliveryPct", "deliveryCompleted",
                 "deliveryTotal", "overdueCount", "openBugs", "criticalOpen",
                 "overallCompletion", "workItems", "pointsCompleted", "pointsTotal",
                 "activeSprints", "monthLabel", "monthIndex", "totalMonths",
                 "peopleTrendNote" },
  "months":    [ { "m", "devAct", "actual", "partial" } ],
  "lastActualIdx": number,
  "currentMonthTrackedPct": number,
  "includedServices": [ { "month", "usedHours" } ],
  "milestones": [ { "id", "phase", "date", "status" } ],
  "updates":    [ { "when", "author", "type", "text" } ],
  "forecastVsActuals": {
    "current": [ { "feature", "employee", "fc", "act" } ],
    "last":    [ ... ],
    "project": [ ... ]
  }
}
```

**Frontend** — thin merge layer in `pulseData.ts`:

1. New `useDerivedPulseData(projectId)` react-query hook on `['pulseDerived', projectId]`, hitting the new endpoint.
2. New `mergePulseData(derived, manual)` helper — for every field present in `derived`, derived wins. Manual `PulseData` (still in localStorage for now) supplies the gaps: `narrative`, `risksTrendNote`, `ledger`, all `risks`, `MonthRow.{dev,ad,gtm,ba,mgmt,devFC}`, `IncludedServicesRow.{totalHours,billable*,invoice*,expectedRemaining}`, milestone `{budget,spent,pct}`.
3. `ProjectPulseView` reads merged data — no rendering changes.
4. `PulseSettingsView` updates:
   - **Hide** sections fully replaced by derivation (Project meta, summary deliverables/bugs/points/sprint counts, milestones list, updates feed, forecast-vs-actuals).
   - **Trim** sections that are partially replaced (Months: only show editable category dollars + devFC; Included Services: only show contract + billing fields; Summary: only narrative + risk note).
   - Mark each retained field with a small "manual" tag and each removed section with a one-line "Now synced from project data" note.

**Health score formula (v1 proposal):**
```
score = 100
  - 3 * overdueCount
  - 8 * criticalOpen
  - 2 * openBugs
  + clamp((deliveryPct - expectedTimePct) / 2, -15, +15)
clamp to [0, 100]
status: >=80 Healthy, >=60 At Risk, else Critical
```
where `expectedTimePct = monthIndex / totalMonths * 100`. Easy to tune; document the formula inline.

---

## PR roadmap

Three PRs, mergeable in order. PR1 alone is shippable (read-only derived endpoint feeding the Pulse view); PRs 2–3 are UX cleanup.

### PR 1 — Backend: `/pulse-derived` endpoint + frontend hook

**Scope**
- New file `backend/routers/pulse.py` with `get_pulse_derived(project_id, db, user)`. Mounted under `/api/projects/{project_id}/pulse-derived`.
- Internal helpers (one function per top-level section in the response — `_derive_summary`, `_derive_months`, etc.) each wrapped in `_safe()`.
- Reuse `require_project_access` for the auth gate.
- Frontend: `useDerivedPulse(projectId)` hook in `app/src/components/ProjectHub/usePulseData.ts` (new file) + types in `pulseData.ts`. Query key: `['pulseDerived', projectId]`. Stale time 60s.
- `ProjectPulseView` switches to reading merged data via `mergePulseData(derived, manual)`. Behavior identical when derived is loading (falls back to manual) so this PR is invisible to users without data — but values become correct as soon as the endpoint responds.

**Out of scope:** Pulse Settings UI changes.

**Tests**
- `backend/tests/test_pulse_derived.py`: project with N work items, X done, Y overdue, Z bugs → assert each summary field matches the expected counts.
- One test for the health-score formula at boundary scores (100, 80, 60, 0).
- One test that derived sub-sections fail independently (mock one helper to raise; assert the others still return).

**PR description draft**
> Adds `GET /api/projects/{id}/pulse-derived`, a single endpoint that returns every Pulse-view field we can compute from work items, sprints, time entries, milestones, and activity logs. Frontend now merges this server-derived data over the localStorage manual overrides, so the Pulse view stays in sync with real project data automatically. No UI changes — the Pulse Settings editor is updated separately in a follow-up.

---

### PR 2 — Pulse Settings: hide / trim sections replaced by derivation

**Scope**
- `PulseSettingsView`:
  - Remove the `PulseProjectMetaSection` mount (project meta now sourced from `projects` table).
  - Remove `PulseMilestonesSection`'s editable fields for phase/date/status; keep only `budget`/`spent`/`pct` columns. (Or replace the whole section with a banner: "Milestones are managed under the Roadmap tab — financial inputs only here.")
  - Remove `PulseUpdatesSection` (updates come from activity log).
  - Remove `PulseFVASection` (epic estimates + logs are the source of truth).
  - `PulseSummarySection`: keep only `narrative` and `risksTrendNote`. Strip the rest.
  - `PulseMonthlyBurnSection`: hide `devAct` column (read-only-derived); keep cost categories + `devFC`.
  - `PulseServicesSection`: hide `usedHours` column; keep contract + billing fields.
- Add a small inline note under each trimmed section explaining where the derived data comes from.
- Migrate localStorage payloads: any fields that the UI no longer edits stay in storage but are ignored at merge time. No destructive migration needed.

**Out of scope:** Moving manual overrides off localStorage.

**Tests**
- Snapshot/render test: Pulse Settings no longer renders removed sections.
- Manual smoke: load a project with no localStorage override → Pulse view fully populated from DB.

---

### PR 3 — (Optional, follow-up) Move manual overrides off localStorage

**Scope**
- New table `project_pulse_overrides(project_id PK, json_blob, updated_at)` storing only the editorial subset (narrative, ledger, risks, manual month forecasts, billing inputs).
- `GET/PUT /api/projects/{id}/pulse-overrides`.
- Frontend swaps `localStorage` reads/writes in `pulseData.ts` for the new endpoint; keep localStorage as offline cache only.

**Why optional:** removes the per-browser data island, but doesn't change what Pulse displays. Worth doing once PRs 1–2 prove the derivation works.

---

## Risks / open questions

1. **`contractStart` has no real DB home.** v1 uses `projects.created_at`, which is approximate. Document and revisit.
2. **`healthScore` formula is opinionated.** v1 ships my proposal above; expect tuning after a week of real data.
3. **`forecastVsActuals.fc` from `estimated_hours` is a stretch.** Epic estimates are often empty. v1 falls back to `0` for missing estimates and surfaces a tooltip "FC = sum of estimates" on the table.
4. **localStorage merge:** if a PM has manually overridden a now-derived field, the derived value wins after PR1. This is intentional (sync with reality) but may surprise users. Mention in PR1 release notes.
5. **Performance:** the derived endpoint touches multiple tables. Should be a single round-trip per Pulse view load; 60s react-query stale time + the existing analytics query patterns should keep it cheap. Watch on Vercel logs after deploy.

---

## Files most likely to change

- `backend/routers/pulse.py` (new) — derivation endpoint
- `backend/main.py` — mount the new router
- `backend/tests/test_pulse_derived.py` (new)
- `app/src/components/ProjectHub/pulseData.ts` — `mergePulseData`, derived types
- `app/src/components/ProjectHub/usePulseData.ts` (new) — react-query hook
- `app/src/components/ProjectHub/ProjectPulseView.tsx` — consume merged data
- `app/src/components/ProjectHub/PulseSettingsView/**` — trim/remove sections (PR2)
- `app/src/pages/ProjectDetail/tabs/PulseTab.tsx` — light wiring if needed
