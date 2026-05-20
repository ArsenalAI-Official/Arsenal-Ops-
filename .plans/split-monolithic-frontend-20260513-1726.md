# Plan: Split the monolithic frontend files

**Tier:** Standard
**Created:** 2026-05-13
**Revised:** 2026-05-20 — re-baselined against current `main` after substantial drift; ProjectsPage track dropped (already shipped); ProjectBoard + ProjectDetail re-scoped.
**Source:** Audit finding F-X1 (see `.branch-review/frontend-audit-20260513-1726.md`)

---

## Revision note (2026-05-20)

The original plan was written 2026-05-13 against an older `main`. Re-survey vs. current `main`:

| File | Plan baseline | Current main | Δ | Disposition |
|---|---|---|---|---|
| `pages/ProjectsPage.tsx` | 3584 | **736** | −2848 | ✅ Already split — `components/ProjectsPage/{TicketDetailPanel,MyTasksBox,ProjectsBox,QuickNotesPanel,DashboardStats}.tsx` exist; `PersonalTasksPage.tsx` (986 LOC) emerged as its own route. **PRs 5–8 dropped.** |
| `pages/ProjectBoard.tsx` | 4291 | **5382** | +1091 | New: AI Planning Roadmap path, Reviewer Panel drawer, Architecture Editor wrapper, Complete/Delete Sprint nested confirmations. Plus the Edit Sprint modal (328 LOC) wasn't in original plan. |
| `pages/AdminDashboard.tsx` | 2954 | **3171** | +217 | New: RBAC Roles tab + RoleModal (commit dad68ca1). Brings tab count to 5 and modal count to 5. |
| `pages/ProjectDetail.tsx` | 2633 | **2629** | ~0 | Capability gating added for PM + Pulse Settings tabs (commit 0bf0a2dc). Overview tab is much larger than original plan implied — needs 2 PRs not 1. |
| `components/ProjectHub/PulseSettingsView.tsx` | 1056 | **1056** | 0 | Unchanged. Note: `numberInput`/`textInput` helpers don't actually capture parent closure — original F-Perf4 rationale was overstated; they extract cleanly as utility functions. |

`PersonalTasksPage.tsx` (~986 LOC) is also large but did not exist when the plan was written. Reviewing it: it's a single coherent dedicated-route page, not a monolith waiting to be split. **Out of scope** — track separately if it crosses the threshold later.

The earlier `refactor/split-monoliths` branch contained 4 partial PRs (Admin folder, ProjectBoard folder, ProjectDetail partial, PulseSettings full) — that branch is abandoned. We start fresh off `main` per user instruction.

---

## Summary / TL;DR

Convert each oversized page into a folder containing the original orchestrator file plus extracted sub-components, modals, and section views. Every PR is a behavior-neutral file move. No types module, no state-management changes, no audit-bug fixes inside these PRs. The work runs **per-page** (4 tracks) with track 1 (AdminDashboard) establishing the conventions; the other 3 tracks can run in parallel once track 1 lands.

**Files in scope (~12,200 LOC total):**

| File | LOC | Target |
|---|---|---|
| `pages/ProjectBoard.tsx` | 5,382 | `pages/ProjectBoard/` |
| `pages/AdminDashboard.tsx` | 3,171 | `pages/AdminDashboard/` |
| `pages/ProjectDetail.tsx` | 2,629 | `pages/ProjectDetail/` |
| `components/ProjectHub/PulseSettingsView.tsx` | 1,056 | `components/ProjectHub/PulseSettingsView/` |

**Confirmed constraints:**
- Pure mechanical — no types work co-extracted
- Co-located folder layout (`pages/<Page>/<Page>.tsx + index.ts`)

---

## Goals

- Every file under `src/pages/**` and `src/components/ProjectHub/**` is ≤ ~600 LOC.
- Each extracted sub-component has a single explicit prop-list and no implicit closure dependencies on parent variables.
- `tsc --noEmit` + `npm run lint` + `npm run build` stay green after every PR.
- The pattern is documented in `app/src/pages/CONVENTIONS.md` (10 lines) so future contributors know the rules.

## Non-goals

- Not addressing F-T1 (shared types module).
- Not fixing F-C2 (fire-and-forget mutations), F-C1 (date parsing), F-S1 (admin guard), or any other audit correctness/security bugs inside these PRs.
- Not adding `React.lazy` boundaries beyond what already exists on main.
- Not adding test infrastructure.
- No prop-drilling-to-Context migrations.
- `PersonalTasksPage.tsx` (986 LOC) — left alone; not a tangled monolith, just a long page.

---

## Recommended approach

**Per-page sequence** repeated 4 times, with track 1 (Admin) establishing conventions:

1. **Folder conversion PR** — rename `pages/Foo.tsx` → `pages/Foo/Foo.tsx`, add `pages/Foo/index.ts` re-export, update `App.tsx` import (resolves through index). Pure rename. 0 LOC delta.
2. **Modal extraction PR(s)** — pull each modal `{show && ...}` block into `pages/Foo/modals/FooXModal.tsx`. Modals have the cleanest prop boundaries.
3. **Tab/panel extraction PR(s)** — pull each tab-gated `{activeTab === 'x' && ...}` or `{selectedX && ...}` block into its own file.
4. **Section/widget extraction PR(s)** — remaining top-level chunks.

**Conventions set in track 1:**
- File naming: `PascalCase.tsx` for components, `camelCase.ts` for helpers.
- Prop types: inline `interface FooModalProps { ... }` at top of each file. No central types module yet (F-T1 deferred).
- Imports: explicit named imports, no barrels until folder has ≥4 files.
- Handlers: extract handlers DOWN with their component when possible; keep mutations (`useMutation`) at the parent and pass `mutate` references as props.
- `useQuery`: stays at the parent. Sub-components receive `data` as props.
- `useMemo`: if a derived value is used by exactly one sub-component, extract both together.

**Source for per-page-folder pattern:** matches existing `components/ProjectHub/` folder convention in this repo.

---

## Risks

| # | Severity | Risk | Mitigation | First-appears |
|---|---|---|---|---|
| R1 | High | Handler relying on parent's stale closure stops working after extraction | Per-PR smoke test + reviewer must verify every prop is "live" not captured | PR 2 onward |
| R2 | Medium | `useQuery` subscriptions duplicated when extracted child re-calls `useQuery` with same key | Convention rule: queries stay at parent. Grep `useQuery` count per page after each PR | PR 2 onward |
| R3 | Medium | Merge conflicts with concurrent feature work | Pause feature merges on the touched page during its track | All tracks |
| R4 | Medium | TS build passes but `useEffect` dep array silently changes meaning | ESLint `react-hooks/exhaustive-deps` already enabled — watch for new warnings | PR 3 onward |
| R5 | Low | Multiple folder-conversion PRs open simultaneously rebase awkwardly | Only one page's track in-flight at a time after PR 1 | After track 1 |

---

# Roadmap — 13 PRs across 4 tracks

| # | PR | Track | Size | Stacks on | Verify after merge |
|---|---|---|---|---|---|
| 1 | Convert AdminDashboard to folder + CONVENTIONS.md | Admin | XS | — | `/admin` loads, all 5 tabs switch |
| 2 | Extract 5 AdminDashboard modals | Admin | L | #1 | Open + save each of: Role, Employee, User, GitHub, ProjectMembers |
| 3 | Extract EmployeesTab from AdminDashboard (634 LOC) | Admin | M | #1 | Filter/sort/expand capacity bars work |
| 4 | Extract remaining Admin tabs (Dashboard, Projects, Users, Roles) | Admin | M | #1 | Tab switching works; URL `?tab=` syncs |
| 5 | Convert ProjectBoard to folder | Board | XS | — | Board route loads, columns populate |
| 6 | Extract AI Planning modal (867 LOC) | Board | L | #5 | AI Planning PRD + Roadmap flows both work end-to-end |
| 7 | Extract Create Item + Create Sprint + Edit Sprint modals | Board | L | #5 | Each modal opens, validates, submits; sprint complete/delete confirmations still work |
| 8 | Extract KanbanCard + BoardColumn | Board | M | #5 | Drag-drop works; card click opens drawer |
| 9 | Extract ItemDetailDrawer (923 LOC) | Board | L | #5 | Drawer opens, edit fields, post comment, log hours, parent/child links work |
| 10 | Extract Reviewer Panel + Architecture Editor wrappers | Board | S | #5 | Open Reviewer drawer; open Architecture editor; both close cleanly |
| 11 | Convert ProjectDetail to folder + extract overview sections | Detail | L | — | Overview tab renders identically: Info, PRD Analysis, Architecture, Team, Links |
| 12 | Extract ProjectDetail's Tracker + Pulse + Activity + PM tabs | Detail | M | #11 | Each tab loads; PM + Pulse Settings stay capability-gated |
| 13 | Convert PulseSettingsView to folder + extract 9 sections | Pulse | M | — | Pulse settings opens, every section saves correctly |

**Total estimated review time:** ~1–2 hrs per PR. ~1–2 weeks for one engineer.

After PR 1 lands, tracks Board (5–10), Detail (11–12), and Pulse (13) can run in parallel.

---

## Per-PR detail

### PR 1 — Convert AdminDashboard to folder + CONVENTIONS.md

**Tasks:**
- `git mv app/src/pages/AdminDashboard.tsx app/src/pages/AdminDashboard/AdminDashboard.tsx`
- Create `app/src/pages/AdminDashboard/index.ts`: `export { default } from './AdminDashboard';`
- Verify `App.tsx` import resolves through index (path may not need to change)
- Add `app/src/pages/CONVENTIONS.md` documenting: folder structure, prop-list rules, `useQuery`-stays-at-parent rule, no-Context-yet rule
- Add one line in `CLAUDE.md` pointing at it

**Merge criterion:** `tsc --noEmit` + `npm run lint` + `npm run build` green; smoke test `/admin` route, all 5 tabs (Dashboard, Employees, Projects, Users, Roles) load identically.

---

### PR 2 — Extract 5 AdminDashboard modals

Inventory from current main (`pages/AdminDashboard.tsx`):

| Modal | Lines | LOC | Mutations |
|---|---|---|---|
| RoleModal | 2391–2661 | 271 | createRole, updateRoleMeta, replaceRoleCaps, deleteRole |
| EmployeeModal | 2662–2760 | 99 | saveEmployee, deleteEmployee |
| UserModal | 2761–2898 | 138 | createUser |
| GitHubModal | 2899–2987 | 89 | saveGitHub, sendGitHubInvites |
| ProjectMembersModal | 2988–3171 | 184 | addMember, removeMember (+ projectMembersQuery) |

**Tasks:** Create `pages/AdminDashboard/modals/{Role,Employee,User,GitHub,ProjectMembers}Modal.tsx`. Move each `{showXModal && ...}` JSX block into its modal file. Each modal receives `open`, `onClose`, form state, and the mutation `mutate` function as props. Mutations stay in parent. `projectMembersQuery` is conditional and currently parent-owned — keep it at parent and pass `members` + `isLoading` down.

**Merge criterion:** All 5 modal flows tested end-to-end; CI green.

---

### PR 3 — Extract EmployeesTab (634 LOC, lines 1332–1965)

**Tasks:** Move ~634 LOC into `pages/AdminDashboard/tabs/EmployeesTab.tsx`. Move filter/sort state (employeeSearch, employeeStatusFilter, employeeSpecFilter, employeeSort) DOWN with the tab. `expandedCapacityDevId` stays at tab level. `employeesQuery` + `capacityQuery` + `availableSpecs`/`filteredEmployeeRows`/`teamCapacity` memos stay at parent and pass `employees`/`teamCapacity` down. EmployeeModal trigger stays at parent.

**Merge criterion:** Filter, sort, search, capacity bars work; pixel-identical to pre-PR.

---

### PR 4 — Extract remaining Admin tabs

| Tab | Lines | LOC |
|---|---|---|
| DashboardTab | 1070–1331 | 262 |
| ProjectsTab | 1966–2087 | 122 |
| UsersTab | 2088–2260 | 173 |
| RolesTab | 2261–2390 | 130 |

**Tasks:** `tabs/{DashboardTab,ProjectsTab,UsersTab,RolesTab}.tsx`. Each receives its query data + mutation refs as props. URL `?tab=` sync (line 209–220 useEffect) stays at parent.

**Merge criterion:** Tab switching works, URL `?tab=` sync functions for all 5 values (`dashboard|employees|projects|users|roles`). After this PR, `AdminDashboard.tsx` orchestrator should be ≤500 LOC.

---

### PR 5 — Convert ProjectBoard to folder

**Tasks:** Mirrors PR 1 for ProjectBoard.

**Merge criterion:** Board route loads, columns populate, drag-drop still works.

---

### PR 6 — Extract AI Planning modal (867 LOC, lines 3888–4754)

**Tasks:** Move to `pages/ProjectBoard/modals/AIPlanningModal.tsx`. Modal owns its own multi-step state including the **new PRD vs Roadmap upload-mode toggle** added since the original plan. Parent passes `projectId`, `onComplete` callback. Internal calendar UIs and roadmap-parsing state move with the modal.

**Merge criterion:** AI Planning PRD path + Roadmap path both work end-to-end.

---

### PR 7 — Extract Create Item, Create Sprint, Edit Sprint modals

| Modal | Lines | LOC |
|---|---|---|
| Create Item | 3507–3887 | 381 |
| Create Sprint | 4755–4998 | 244 |
| Edit Sprint (incl. Complete + Delete nested confirmations) | 4999–5326 | 328 |

**Tasks:** Three modals to `pages/ProjectBoard/modals/`. Edit Sprint's nested Complete/Delete confirmations move with it as internal state. Per audit F-C2, `handleCreateSprint` is currently fire-and-forget — preserve exact behavior here.

**Merge criterion:** All 3 modals open + save; Complete Sprint and Delete Sprint confirmations still trigger from inside Edit Sprint.

---

### PR 8 — Extract KanbanCard + BoardColumn

**Tasks:** `pages/ProjectBoard/components/KanbanCard.tsx` (lines 2075–2210, ~136 LOC) + `BoardColumn.tsx` (lines 2034–2225 wrapper, ~192 LOC). Preserve audit-flagged a11y gaps F-A1 (no keyboard handlers) — separate initiative. Drop handlers and drag state stay at parent and are passed as props.

**Merge criterion:** Drag-drop works; card click opens drawer.

---

### PR 9 — Extract ItemDetailDrawer (923 LOC, lines 2584–3506)

**Tasks:** `pages/ProjectBoard/ItemDetailDrawer.tsx`. Mutations stay at parent. Edit form state + comments query move down. Parent/child hierarchy links (new since original plan) move with the drawer. Preserve F-M6 (mixed controlled/uncontrolled).

**Merge criterion:** Drawer opens, all edit fields work, comment submit works, log hours works, parent/child links navigate.

---

### PR 10 — Extract Reviewer Panel + Architecture Editor wrappers

**Tasks:** `pages/ProjectBoard/ReviewerPanel.tsx` (slide-in side drawer, lines 5327–5368, ~42 LOC wrapping `ReviewerView`) and `pages/ProjectBoard/ArchitectureEditorWrapper.tsx` (lines 5370–5377, ~8 LOC wrapping `ArchitectureEditor`). These are new since the original plan. Small but they push the orchestrator below the LOC target.

**Merge criterion:** Reviewer drawer opens + closes; Architecture editor opens + closes; both still update parent state on close.

---

### PR 11 — Convert ProjectDetail + extract overview sections

Overview tab is much larger than the original plan implied. Sections:

| Section | Lines | LOC |
|---|---|---|
| ProjectInfoSection (edit form + stat cards) | 1008–1312 | 304 |
| PRDAnalysisSection (summary, features, tech, tools, risks, timeline) | 1313–1547 | 235 |
| ArchitectureSection (arch details, cost, pros/cons, tools) | 1548–1780 | 233 |
| TeamSection (dev list + add/remove/promote/demote) | 1781–1902 | 122 |
| LinksSection (resources: add/delete links) | 1903–2104 | 202 |

**Tasks:** Folder convert (`pages/ProjectDetail/ProjectDetail.tsx` + `index.ts`) + extract all 5 overview sections into `pages/ProjectDetail/sections/`. Each section receives its query data + mutation refs as props. `useEffect` blocks stay at parent.

**Merge criterion:** Overview tab loads, all 5 sections render identically; add/remove dev, add/delete link, edit project info, edit architecture all work.

---

### PR 12 — Extract ProjectDetail's other tabs

| Tab | Lines | LOC |
|---|---|---|
| TrackerTab | 2105–2447 | 342 |
| TimelineTab (calendar) | 2447–2495 | 48 |
| PulseTab | 2495–2518 | 23 |
| PulseSettingsTab (gated) | 2518–2526 | 8 |
| ActivityTab | 2526–2551 | 25 |
| ProjectManagerTab (gated) | 2551–2629 | 78 |

**Tasks:** Extract each into `pages/ProjectDetail/tabs/`. **Critical:** the `canAccessPMTab()` and `can('project.pulse.settings')` gating (lines 835–859) stays at parent — the tab components are only rendered when gated-in.

**Merge criterion:** Each tab loads on its `?tab=` value; PM + Pulse Settings tabs still hidden when user lacks the capability. After this PR, `ProjectDetail.tsx` orchestrator should be ≤500 LOC.

---

### PR 13 — Convert PulseSettingsView + extract 9 sections

| Section | Lines | LOC |
|---|---|---|
| PulseProjectMetaSection | 273–307 | 35 |
| PulseSummarySection | 310–444 | 135 |
| PulseBudgetSection | 447–516 | 70 |
| PulseMonthlyBurnSection | 519–658 | 140 |
| PulseServicesSection | 661–785 | 125 |
| PulseRisksSection | 788–840 | 53 |
| PulseMilestonesSection | 843–901 | 59 |
| PulseUpdatesSection | 904–960 | 57 |
| PulseFVASection | 963–1039 | 77 |

**Tasks:** Folder convert + extract 9 sections. The `numberInput`/`textInput` helpers (lines 56–72) **do not capture parent closure** — they're pure render functions taking value+onChange params. Move them to `pages/PulseSettingsView/inputs.tsx` as plain components (not memoized — F-Perf4's perf-concern was overstated). Each section receives a slice of `data` + a `patch` callback that updates the right subtree.

**Merge criterion:** Pulse settings opens, every section saves correctly; no keystroke lag.

---

## Deferred (not in this initiative)

| Item | Why deferred |
|---|---|
| F-T1 shared types module | User confirmed pure-mechanical only |
| F-C1 date parsing fix | Separate `frontend/date-correctness` slice |
| F-C2 fire-and-forget mutations → useMutation | Separate `frontend/mutation-consistency` slice |
| F-A1/F-A2 modal + drag-drop a11y | Separate `frontend/a11y-kanban-modals` slice |
| Test infrastructure (Vitest) | Separate plan |
| `useSuspenseQuery` migration | Separate React 19 idiom slice |
| `PersonalTasksPage.tsx` (986 LOC) split | Not a tangled monolith; revisit if it crosses 1500 LOC |
