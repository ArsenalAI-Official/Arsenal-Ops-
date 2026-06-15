# Plan: Decompose the ProjectBoard god file

**Tier:** Standard
**Created:** 2026-06-11
**Source:** Continuation of `.plans/split-monolithic-frontend-20260513-1726.md` (Board track, PRs 5–10) — re-baselined against current `main`. `perf/admin-first-render` shipped Track 1 (Admin); this is the Board track, finished properly.
**Delivery model:** **ONE pull request**, delivered as a sequence of **12 green, bisectable commits** (the items in the roadmap are commits, not separate PRs). Each commit compiles, lints, builds, passes the characterization net, and is independently revertible within the branch — so the single (large) PR has a clean, reviewable history.
**Status:** Active — ready to implement.

---

## Summary / TL;DR

`pages/ProjectBoard/ProjectBoard.tsx` is **2690 LOC** — the largest remaining god file. The folder was created and the modals/cards (`AIPlanningModal`, `CreateItemModal`, `CreateSprintModal`, `EditSprintModal`, `KanbanCard`, `BoardColumn`) and the drawer wrapper (`ItemDetailDrawer` → shared `WorkItemPanel`) were already extracted by earlier work. What's left in the orchestrator is the **non-JSX core** (4 queries, 12 mutations, ~28 handlers, 13 memos, DnD, filter/sort/grouping) **plus the three view bodies** (board / list / epic, ~660 LOC of JSX) **plus the header/toolbar/filter chrome** (~470 LOC).

We decompose it behavior-neutrally into a **data-hooks + view-components** feature folder (the chosen architecture), mirroring the AdminDashboard `hooks/` + `lib/` + `types.ts` pattern, leaving a thin orchestrator (~450–550 LOC). Scope also includes **a regression-test net (first)**, **sub-splitting the 1382-LOC `AIPlanningModal`**, and **a shared `WorkItem`/`Sprint` types module** (audit F-T1).

**Delivery:** one PR, **12 sequential commits**, no behavior change. Every commit is gated on `tsc -b` + `eslint` (0 errors) + `build` + the characterization tests + a targeted board smoke check. The test net is **commit 1** so the rest of the work refactors against a safety net.

---

## Goals

- `pages/ProjectBoard/ProjectBoard.tsx` orchestrator ≤ ~550 LOC; no other new file > ~250 LOC except the genuinely-large list view.
- Queries/mutations/DnD/filtering/grouping live in `hooks/`; pure logic in `lib/` (with co-located unit tests); the three views are pure props-down components.
- A canonical `WorkItem`/`Sprint` types module exists; ProjectBoard's family imports from it (rest of repo via re-export shim — full migration deferred).
- `AIPlanningModal` becomes a thin shell + `useAIPlanning` hook + step components, staying lazy-loaded as one chunk.
- A reusable test harness + characterization net exists and stays green through every commit.
- `tsc -b --noEmit` + `npm run lint` (0 errors) + `npm run build` + `vitest run` green after **every commit** (bisectable history).
- Conventions documented: update `app/src/pages/CONVENTIONS.md` rule 5 to point at the new types module.

## Non-goals

- **No behavior changes.** No audit bug-fixes inside these commits (preserve the fire-and-forget `handleSaveArchitecture`, the prefix-cancel/exact-write optimistic asymmetry, the mixed-controlled drawer, etc. — leave `// TODO(audit-Fxx)` where touched).
- **No repo-wide types migration.** Only ProjectBoard-family files move to the new types module; the other ~9 `WorkItem` / ~8 `Sprint` declaration sites stay behind the re-export shim, tracked as a follow-up F-T1 codemod.
- **No React Compiler / React 19 idiom adoption** (repo uses manual `useMemo`/`useCallback` — keep it; don't drop memoization that keeps `KanbanCard`/`BoardColumn` `React.memo`-stable).
- **No full RTL board suite.** The characterization net is deliberately small + high-leverage (see Test strategy); broad UI tests are out of scope for a behavior-neutral move.
- No new `React.lazy` boundaries beyond what exists; no Context migration.

---

## Test strategy (the regression net)

There is **near-zero coverage today** (2 logic-only test files, node env; `vitest.config.ts` defaults to `environment: 'node'`, opt into jsdom per-file with `// @vitest-environment jsdom`). `tsc -b` already catches all prop/shape/import breakage from relocating code, so tests target only what tsc and a quick smoke **can't** see: optimistic-update **timing/rollback**, invalidation **keys**, effect **dep semantics**, and memo **stability** (refetch storms).

Three layers, placed by ROI:

1. **Black-box characterization net (commit 1, BEFORE any refactor).** A reusable `src/test/renderWithProviders.tsx` (QueryClient + MemoryRouter + AuthContext mock + `apiFetch` mock) plus a few tests of the **current** board that survive the refactor unchanged:
   - **Optimistic status-change reverts on API reject** — the single highest-value test (R2/R3): invisible to tsc, fine-in-demo/broken-in-prod. Drive it via the **StatusDotMenu** path, not HTML5 drag (jsdom doesn't implement drag events reliably); the literal drag wiring stays on the manual smoke gate.
   - View-switch board↔list↔epic renders the correct items.
   - A filter narrows the visible set.
   - Deep-link (`?ticket=`) opens the drawer.
2. **Pure-function unit tests (with the extraction commits).** The optimistic cache-transform `(oldList, itemId, newStatus) => newList` pinned as a pure function + node test (cheapest cover for R2's core); plus `lib/` tests (comparator, week/sprint/epic grouping, `getWeekStart`/`formatWeekRange`, sprint dup/overlap validation) landing with commit 3.
3. **Invalidation tests (with the mutations commit).** Mirror `AdminDashboard/hooks/adminHooks.invalidation.test.ts` exactly: `renderHook(useWorkItemMutations)` + `vi.spyOn(queryClient,'invalidateQueries')`, assert each mutation hits the right keys (`['workItems']`+`['myTasks']` via `invalidateWorkItemScope`, `['workItem', id, 'comments']`, `['project', id]`). Catches R10. Lands with commit 5 (the hook must exist to `renderHook` it — matches the admin precedent of testing-with-extraction).

---

## Recommended approach

### Target folder structure

```
pages/ProjectBoard/
  ProjectBoard.tsx              ← thin orchestrator (~450–550 LOC): calls hooks, dispatches view, renders modals
  index.ts                      ← unchanged
  types.ts                      ← re-exports WorkItem/Sprint from @/types/workItems; owns Developer/Project/Architecture/ListSortKey

  hooks/
    useBoardData.ts             ← project/workItems/sprints/developers queries; owns the memo-stable `workItemFilters`; prefetchComments  (~70)
    useBoardInvalidations.ts    ← invalidateWorkItems / invalidateProject (wrap shared invalidateWorkItemScope/ProjectScope)              (~25)
    useWorkItemMutations.ts     ← create/save/delete/logHours/changeStatus/move (+ shared optimistic-status factory)                       (~250)
    useSprintMutations.ts       ← create/edit/complete/delete (validation delegated to lib/)                                              (~120)
    useCommentMutation.ts       ← submit comment                                                                                         (~40)
    useBoardDnd.ts              ← drag state + onDragStart/Over/Leave/Drop; injected `onMove` callback                                    (~45)
    useBoardFilters.ts          ← filter state, outside-click effect, existingTags, filteredItems, columnItemsByStatus, clear/toggle      (~150)
    useListSort.ts              ← sort state + handleListSort + comparator memo (uses lib/listSort)                                       (~70)
    useListGrouping.ts          ← listGroupBy (+localStorage), collapse state, today memos, sprint/epic/week group memos                  (~160)

  lib/                          ← pure, unit-tested
    boardConstants.ts           ← BOARD_STATUS_ORDER
    optimisticStatus.ts         ← pure (oldList,itemId,newStatus)=>newList transform   + optimisticStatus.test.ts   (pins R2 core)
    listSort.ts                 ← LIST_SORT_*_ORDER maps + comparator factory          + listSort.test.ts
    listGrouping.ts             ← getWeekStart, formatWeekRange, week-bucket builder    + listGrouping.test.ts
    sprintStatus.ts             ← isSprintCompleted / isSprintActive                    + sprintStatus.test.ts
    sprintValidation.ts         ← dup-name + date-overlap checks (shared create+edit)   + sprintValidation.test.ts
    sprintNav.ts                ← getNextSprint

  views/
    BoardView.tsx               ← kanban body (maps BOARD_STATUS_ORDER → existing BoardColumn)  (~45)
    ListView.tsx                ← list body: group-by toggle + sprint/week dispatch             (~180)
    EpicView.tsx                ← epic-group body                                               (~160)
    components/WorkItemRow.tsx  ← the 8-column row, currently triplicated across epic/week/sprint  (~120)
    components/ListSortHeader.tsx ← shared sortable header cell                                 (~25)
  components/                   ← existing BoardColumn.tsx, KanbanCard.tsx + NEW chrome:
    BoardHeader.tsx             ← top bar (back / project badge / Reviewer / AI / Overview)      (~80)
    BoardToolbar.tsx            ← stats + sprint selector + search + view tabs + add menu        (~200)
    BoardFilterMenu.tsx         ← filter dropdown (type/priority/assignee/tags)                  (~200)
    BoardSkeleton.tsx           ← loading skeleton                                               (~55)

  modals/
    AIPlanning/                 ← sub-split of the 1382-LOC modal (stays lazy, one chunk)
      AIPlanningModal.tsx       ← thin shell: owns aiStep/uploadMode, routes steps
      useAIPlanning.ts          ← all wizard state + 7 handlers + existingPRD probe query
      steps/{Upload,PrdUploadForm,RoadmapUploadForm,Analyzing,Architectures,Preview,Committing,Done}.tsx
      components/{RoadmapSummaryPanel,GeneratedTicketCard}.tsx
      lib/formatSprintRange.ts
    CreateItemModal.tsx  CreateSprintModal.tsx  EditSprintModal.tsx   ← unchanged (EditSprint STAYS static import)
  ItemDetailDrawer.tsx  ReviewerPanel.tsx  ArchitectureEditorWrapper.tsx  ← unchanged (already thin)

src/test/renderWithProviders.tsx ← NEW reusable test harness (QueryClient + MemoryRouter + AuthContext + apiFetch mock)
src/types/workItems.ts          ← NEW canonical WorkItem/Sprint/Developer/Project (superset; keeps `completed_at`)
```

### Key wiring (the orchestrator is the single hook-owner)

- `useBoardData(id)` returns `{ project, workItems, sprints, allDevelopers, isLoading, workItemFilters, prefetchComments }`. **`workItemFilters` is returned** so the mutation hooks key their optimistic `getQueryData`/`setQueryData`/rollback against the *same* memoized reference (`['workItems', workItemFilters, 'board']`).
- `useWorkItemMutations(id, { workItemFilters, queryClient, invalidate, navigate, getSelectedItem })` — never reconstructs the filter object; uses the pure `lib/optimisticStatus` transform.
- `useBoardDnd({ onMove: workItemMutations.changeStatus.mutate })` — injected callback keeps the DnD hook react-query-agnostic and unit-testable; preserves the exact `[draggedItem, onMove]` dep array.
- Views receive data + handlers **as props** — they never call `useQuery`/`useMutation` themselves (CONVENTIONS rule 1; avoids double-observer, R1).
- `AIPlanningModal` stays the only module ProjectBoard imports (via `lazy()`); its new sub-components are imported only inside the lazy chunk.

This matches current React/TanStack guidance (custom-hooks-for-logic + props-for-view supersedes container/presentational; TanStack dedupes fetches by key) while honoring the repo's "queries stay at the parent" rule. [tkdodo: react-query-as-a-state-manager; react.dev: reusing-logic-with-custom-hooks]

---

## Alternatives considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Delivery | **One PR, 12 sequential commits** | 11 separate stacked PRs | User preference; keeps the decomposition atomic. Each commit stays green/bisectable so review can still proceed commit-by-commit. |
| Query ownership | Hooks called **once in orchestrator**, props to views | Call data hooks inside each view (cache dedupes fetch) | TanStack dedupes the *request* but each `useQuery` is a separate observer → doubled refetch/render fan-out; violates CONVENTIONS rule 1 (R1). |
| Mutation grouping | **Entity-split**: `useWorkItemMutations` / `useSprintMutations` / `useCommentMutation` | One fat `useBoardMutations` (admin-style) | Sprint validation alone justifies isolation; higher cohesion; each independently testable. |
| Filters/sort/grouping | Granular `useBoardFilters` + `useListSort` + `useListGrouping` | One `useBoardViewModel` aggregator | Smaller commits, each testable. |
| Shared types home | **New `src/types/workItems.ts`** + shim on `WorkItemPanel/types.ts` | Promote `WorkItemPanel/types.ts` / put in `ProjectBoard/types.ts` | Neutral cross-feature home; avoids false page ownership / layering smell. |
| DnD hook input | Injected `onMove(itemId,status)` callback | Pass the `moveMutation` object | Keeps the hook react-query-agnostic + unit-testable. |
| AIPlanning split | Shell + `useAIPlanning` + step components | Split by `uploadMode` (PrdFlow/RoadmapFlow) | Mode-split duplicates shell/footer/spinner steps and the `aiStep` router. |
| Test net | Small black-box characterization net first + pure-fn + invalidation tests with extraction | Full RTL coverage / no tests | tsc already covers shape breakage; net targets only runtime-invisible risks (R2/R3/R10). |

---

## Risks

| # | Sev | Risk | Mitigation | First commit |
|---|---|---|---|---|
| R2 | **High** | Optimistic exact-key invariant `['workItems', filters, 'board']` broken if a hook rebuilds `{project_id:id}` instead of reusing the memoized ref → drag "snaps back", rollback fails. **No type error; demos look fine.** | Pin the transform as pure `lib/optimisticStatus` + test (commit 3); characterization render-test reverts-on-reject (commit 1); thread `workItemFilters`+`queryClient` into mutation hooks; one `boardKey` const for read/write/rollback; keep prefix-cancel/exact-write asymmetry + F-C3 comment. **Mandatory manual gate at commit 5: drag a backend-rejected card → must snap back + error toast.** | 1 (net), 5 (wiring) |
| R1 | **High** | Query-subscription duplication if a view calls the data hook itself. | Hooks called once in orchestrator; views pure-props. Review gate: `grep -rn "useQuery" views/ components/Board*` returns nothing. | 4 |
| R3 | **High** | Stale closures in extracted DnD handlers. | Hook owns drag state + handlers together; preserve exact dep arrays; rely on `react-hooks/exhaustive-deps` (CI) — no eslint-disable for a real dep. | 6 |
| R4 | **High** | `EditSprintModal` eager-import constraint broken (re-exports `CompleteSprintConfirm`/`DeleteSprintConfirm`, rendered outside Suspense). | Keep it a **static import** forever; only mutations/handlers may move to a hook. Gate: `grep "lazy(() => import('./modals/EditSprintModal'))"` returns nothing. | 7 |
| R7 | Med | Shared-types churn / the `WorkItemPanel` `WorkItem` lacks `completed_at` (board needs it) and adds `reporter_name`/`project_id`. Naive merge breaks one side. | Canonical type is a **superset** (keep `completed_at`, fields optional where any consumer treats them so). Additive re-export shims, file-by-file; don't delete inline interfaces in the creating commit. `tsc -b` gates. | 2 |
| R5 | Med | AIPlanning sub-split folds the lazy chunk into the main bundle. | Only `AIPlanningModal.tsx` is referenced by ProjectBoard (`lazy()`); sub-components imported only inside it. Post-build: an `AIPlanning*` chunk still exists in `dist/assets`. | 12 |
| R6 | Med | `react-hooks/set-state-in-effect` / `exhaustive-deps` regressions on the 2 effects (localStorage `listGroupBy`; outside-click). | Move each effect *with* its state into one hook; preserve dep arrays + lazy initializer + `typeof window` guard; `npm run lint` each commit. | 7 (filters) |
| R8 | Med | No render-level safety net (2 logic-only tests). | The characterization net (commit 1) + pure-fn/lib tests (commit 3) + invalidation tests (commit 5); gate UI commits on the smoke checklist. | 1 |
| R10/R11 | Low | Dropping `['workItem', id, 'comments']` invalidations or the `selectedItem` detail-refresh when relocating mutations. | Invalidation tests (commit 5) assert the key sets; pass `id` + a `getSelectedItem()` accessor into the mutations hook (don't snapshot at init). | 5 |

---

## Open questions

1. **Types-migration scope (recommend: ProjectBoard-family only now).** Create the canonical module + shim, migrate only ProjectBoard's files this initiative; defer the other ~9 `WorkItem`/~8 `Sprint` sites to a follow-up F-T1 codemod. Confirm you don't want the full repo-wide migration bundled in (it would bloat commit 2 into an unreviewable diff).
2. **`Sprint` shape:** widen the canonical `Sprint` to the board's rich 16-field shape (fields optional) so `WorkItemPanel`'s thin 3-field version still satisfies — OK? (Alternative: keep a board-local `BoardSprint`.)

---

# Commit sequence — 1 PR, 12 commits

Behavior-neutral throughout. **Sequential**: each commit builds on the previous and must be green (`tsc -b` + `lint` + `build` + `vitest` + targeted smoke) before the next, so the single PR's history is bisectable and each commit is revertible within the branch. EditSprintModal stays a static import across all commits.

| # | Commit | Size | Order rationale | Verify at this commit |
|---|---|---|---|---|
| 1 | **Test harness + characterization net** (`renderWithProviders`, optimistic-revert-on-reject, view switch, filter, deep-link) | M | first — net BEFORE refactor | new tests pass; current board behavior pinned |
| 2 | Canonical `src/types/workItems.ts` + shim; migrate ProjectBoard family | M | types underpin every hook/view | `tsc -b` green; board renders incl. `completed_at` due/overdue |
| 3 | Pure logic → `lib/` incl. `optimisticStatus` (+ unit tests) | M | after types; before views/hooks use them | new `vitest` tests pass; sort/group/validation unchanged |
| 4 | `useBoardData` + `useBoardInvalidations` | M | sole query owner before views | one `GET /workitems/board` per load; no refetch on view switch/keystroke |
| 5 | Mutation hooks (item/sprint/comment) **+ invalidation tests** | L | needs data hook + lib | **drag reject→snap-back+toast**; invalidation tests pass; auto-comments appear |
| 6 | `useBoardDnd` | S | needs mutations | drag all 5 columns; rollback on 500; no exhaustive-deps warnings |
| 7 | `useBoardFilters` + `useListSort` + `useListGrouping` (the 2 effects) | M | needs data+lib | filters/search/clear; sort cycle; group-by persists reload; outside-click closes menus |
| 8 | `BoardView` component | S | needs DnD + filters | board drag/drop/open/prefetch; empty column; write-gating |
| 9 | `ListView` + `EpicView` + shared `WorkItemRow`/`ListSortHeader` | L | needs grouping/sort | By-Sprint/By-Week/Epic render + sort + collapse pixel-match |
| 10 | `BoardHeader` + `BoardToolbar` + `BoardFilterMenu` + `BoardSkeleton` | M | needs filters | header actions, stats, sprint selector, filter menu, view tabs |
| 11 | Thin-orchestrator integration + `CONVENTIONS.md` update | S | after all hooks/views | **full baseline smoke**; orchestrator ≤~550 LOC; EditSprint still static |
| 12 | Sub-split `AIPlanningModal` → `modals/AIPlanning/` | L | order-independent (place last) | PRD + Roadmap flows; lazy `AIPlanning*` chunk still in `dist/assets` |

**PR description draft —** Title: `refactor(board): decompose ProjectBoard god file into data-hooks + view-components (+ test net, F-T1 types slice, AIPlanning split)`. Body: link this plan; summarize the 12 commits; emphasize behavior-neutral + the R2 manual gate; note the deferred repo-wide types migration. Test plan: the characterization net + the full baseline board smoke checklist (below).

---

## Per-commit detail

### Commit 1 — Test harness + characterization net
**Tasks:** add `src/test/renderWithProviders.tsx` (QueryClient with retry:false + MemoryRouter at `/project/:id/board` + AuthContext mock + `vi.mock('@/lib/api')`). Add `ProjectBoard.characterization.test.tsx` (`// @vitest-environment jsdom`): (a) seed workitems, change a card's status via StatusDotMenu with the PATCH mocked to **reject** → assert it reverts + error toast (R2/R3); (b) view-switch board↔list↔epic shows correct items; (c) a filter narrows visible items; (d) `?ticket=` opens the drawer. These test the **current** board and must keep passing through commit 12.
**Checkpoint:** `vitest run` green; no production code changed.

### Commit 2 — Canonical types module + shim
**Tasks:** `src/types/workItems.ts` superset `WorkItem` (incl. `completed_at?`, `reporter_name?`, `project_id?`), `Sprint` (board's 16-field shape, optionals), `Developer`, `Project`, `Architecture`. `WorkItemPanel/types.ts` re-exports from it. Point ProjectBoard + `components/{BoardColumn,KanbanCard}` + `modals/{CreateItemModal,EditSprintModal}` at it (via `ProjectBoard/types.ts`). Don't touch the other ~17 sites (shim covers them).
**Checkpoint:** `tsc -b` + `lint` + `build` green; characterization net green; due/overdue + completed-this-week rendering intact.

### Commit 3 — Pure logic → `lib/` (+ tests)
**Tasks:** move `BOARD_STATUS_ORDER`, sort-order maps + comparator, `getWeekStart`/`formatWeekRange`/week-bucketer, `isSprintCompleted`/`isSprintActive`, sprint dup/overlap validation, `getNextSprint`, **and the pure optimistic-status transform** into `lib/*.ts`. Add `*.test.ts` for each (node env). Orchestrator imports them.
**Checkpoint:** new `vitest` tests pass; characterization net green; sort/group/validation unchanged in smoke.

### Commit 4 — `useBoardData` + `useBoardInvalidations`
**Tasks:** 4 queries + memo-stable `workItemFilters` + `prefetchComments` → `hooks/useBoardData.ts`; invalidate closures → `hooks/useBoardInvalidations.ts`. Orchestrator calls each once.
**Checkpoint:** Network: one `GET /workitems/board` per load; no refetch switching board/list/epic or typing search (R1/R9); deep-link opens drawer; characterization net green.

### Commit 5 — Mutation hooks (riskiest) + invalidation tests
**Tasks:** `useWorkItemMutations` (create/save/delete/logHours/changeStatus/move + shared optimistic-status factory using `lib/optimisticStatus`), `useSprintMutations` (validation via lib), `useCommentMutation`. Thread `workItemFilters`/`queryClient`/`id`/`getSelectedItem`; keep exact `boardKey`, prefix-cancel, comment invalidations. Add `boardHooks.invalidation.test.ts` mirroring the admin file.
**Checkpoint:** invalidation tests pass; **drag a backend-rejected move → snaps back + error toast** (R2); status/log-hours auto-comments (R10); saved edit refreshes drawer (R11); characterization net green.

### Commit 6 — `useBoardDnd`
**Tasks:** drag state + 4 handlers → `hooks/useBoardDnd.ts`, built with `{ onMove: changeStatus.mutate }`. Preserve dep arrays.
**Checkpoint:** drag across all columns; rollback on simulated 500; no exhaustive-deps warnings; net green.

### Commit 7 — Filters + sort + grouping hooks
**Tasks:** `useBoardFilters` (state, outside-click effect, existingTags, filteredItems, columnItemsByStatus, clear/toggle), `useListSort`, `useListGrouping` (localStorage effect + lazy init + collapse + group memos).
**Checkpoint:** filters/search/clear; sort cycle; group-by persists reload; outside-click closes both menus; no new lint (R6); net green.

### Commit 8 — `BoardView`
**Tasks:** extract kanban body → `views/BoardView.tsx`; receives `columnItemsByStatus` + DnD bag + open/prefetch callbacks as props.
**Checkpoint:** drag/drop/open/prefetch; empty columns; canWriteTracker gating; net green.

### Commit 9 — `ListView` + `EpicView` + shared row
**Tasks:** extract list and epic bodies; factor the 3×-duplicated 8-column row into `views/components/WorkItemRow.tsx` + `ListSortHeader.tsx`.
**Checkpoint:** By-Sprint/By-Week/Epic render + sort + collapse pixel-match; overdue coloring; StatusDotMenu-vs-text write gating; net green.

### Commit 10 — Header / toolbar / filter-menu / skeleton
**Tasks:** extract `BoardHeader`, `BoardToolbar` (stats + sprint selector + search + view tabs + add menu), `BoardFilterMenu`, `BoardSkeleton`.
**Checkpoint:** all header/toolbar actions + filter menu + sprint selector + view tabs; net green.

### Commit 11 — Thin orchestrator + CONVENTIONS
**Tasks:** orchestrator now just wires hooks → views + renders modals; confirm ≤~550 LOC; keep EditSprintModal static; update `CONVENTIONS.md` rule 5 → `@/types/workItems`.
**Checkpoint:** full baseline smoke set; `tsc`/`lint`/`build`/`vitest` green.

### Commit 12 — AIPlanningModal sub-split
**Tasks:** `modals/AIPlanning/` shell + `useAIPlanning` + step components + `RoadmapSummaryPanel`/`GeneratedTicketCard` + `lib/formatSprintRange`. Keep lazy; sub-components imported only inside the chunk; prop contract byte-identical.
**Checkpoint:** PRD + Roadmap flows end-to-end (incl. embedded GenerateRoadmapModal); `dist/assets` still has a separate `AIPlanning*` chunk (R5).

---

## Baseline board smoke checklist (final gate, commit 11)

Load board; board/list/epic view switch; drag a card across all 5 columns; **drag a backend-rejected card → snaps back + toast**; move-to-sprint; create/edit/complete/delete sprint (confirm modals render eagerly, no Suspense flash); open drawer; edit item; log hours; add comment; each filter (type/priority/assignee/tag) + search + sprint selector; group-by persists across reload; AI Planning PRD flow; AI Planning Roadmap flow.

---

## Deferred (separate follow-ups)

| Item | Why |
|---|---|
| Repo-wide `WorkItem`/`Sprint` migration (other ~17 sites) | F-T1 codemod; out of scope to keep commit 2 reviewable |
| ProjectDetail orchestrator (1190 LOC) decomposition | Track 3 of the master plan — separate initiative |
| `AdminDashboard/tabs/ProjectsTab.tsx` (1029 LOC) | New god file; not in master plan |
| Audit fixes (F-C2 fire-and-forget, F-A1 a11y, F-C3 optimistic) | Behavior-neutral constraint — preserve, don't fix here |
| React Compiler adoption (would remove manual memo) | Repo-wide decision; separate slice |
| Broader RTL board coverage beyond the characterization net | Diminishing returns for a behavior-neutral move |
