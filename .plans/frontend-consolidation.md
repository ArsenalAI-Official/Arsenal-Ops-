# Frontend consolidation — scope

Branch: `chore/frontend-consolidation` (off `main`).
Goal: remove duplicated/repeated functionality found in the audit. Behavior-preserving
except where a copy had **drifted into a bug** (Tier 1) — those are intentional fixes.

> Caveat: `main` does not yet carry the test suite (it lives on
> `testing-infrastructure`). Verification here is `tsc -b` + ESLint + Prettier +
> `vite build`, plus careful behavior-preservation. The riskiest visual items
> (full design-token sweep, modal/confirm structural swaps) are scoped
> conservatively and flagged for manual QA / a rebase onto the test branch.

## Foundation modules (new)
- `src/lib/dateUtils.ts` — canonical `parseLocalDate` (ISO-timestamp-aware) + `formatLocalDate`.
- `src/lib/stringUtils.ts` — `toPascalCase`, `getInitials`.
- `src/lib/workItemConfig.ts` — canonical `TYPE_CONFIG`, `STATUS_CONFIG`, `PRIORITY_COLOR` + `getStatusColor/getStatusLabel/getPriorityColor`.
- `src/lib/calendarClassNames.ts` — shared `CALENDAR_CLASS_NAMES`.
- `src/lib/mutationToast.ts` — `toastErrorHandler(action)` factory.
- `src/hooks/useAllDevelopers.ts` — shared `['developers']` query.
- `src/components/ui/spinner.tsx` — add `size` + `tone` variants (+ `RouteSpinner`).
- `tailwind.config` / `index.css` — `gold`/surface/border design tokens + `.btn-gold` etc.

## Tier 1 — duplication hiding bugs (intentional fixes)
1. Priority colors: `ProjectHub/ReviewerView.tsx:51` critical/high swapped → import canonical `PRIORITY_COLOR`.
2. Status "done" color: `MyTasksView`, `ProjectHub/TimelineView.tsx` map done→gold → canonical teal `#34D399`.
3. Epic type color: `#C79E3B` (TimelineView) → canonical `#A78BFA`.
4. `parseLocalDate` variants (6 local defs) → import ISO-aware canonical (fixes PersonalTasks ISO mis-parse).
5. RBAC: `AdminDashboard.tsx:~1141` reimplements wildcard match → use `matchesCapability()`.
6. Invalidation: 4 AdminDashboard mutations hand-roll invalidation → use `lib/invalidations.ts` helpers.

## Tier 2 — adopt already-existing (unused) shared components
7. Modal overlay scaffold (19 hand-rolled) → `ui/dialog.tsx` `Dialog`.
8. Loading spinners (21+ inline) → `ui/spinner.tsx` `Spinner`.
9. Empty states (20+ inline) → `ui/empty.tsx` `Empty`.
10. `window.confirm` (10) → `ui/alert-dialog.tsx` `AlertDialog` (async — per-site state).

## Tier 3 — centralize config + tokens
11. `TYPE_CONFIG` (7), `STATUS_CONFIG` (4+9 inline), `PRIORITY_*` (7) → import from `lib/workItemConfig`.
12. `getStatusColor`/`getPriorityColor` inline fns (9+) → `StatusBadge`/`PriorityBadge` or shared helpers.
13. Design tokens: `#E0B954`/`#B8872A` (~736), surfaces `#0d0d0d`… (~204), `rgba(255,255,255,.0x)` borders (~620)
    → Tailwind tokens + `.btn-gold`/`.card-dark` classes. **Scope: define tokens + replace exact-match
    clusters (gradient string, common border); leave the scattered long tail unless test net present.**
14. Mutation `onError` toast boilerplate (35+) → `toastErrorHandler`.
15. Duplicated `['developers']` query (5) → `useAllDevelopers`; personal-task mutations (7, 2 pages) → shared hook.

## Tier 4 — minor
16. `toPascalCase` (3) → `lib/stringUtils`.
17. `getInitials` (2) → `lib/stringUtils`.
18. `CALENDAR_CLASS_NAMES` (2 identical) → `lib/calendarClassNames`.
19. Work-item query-key inconsistency (`['workItems', filters, 'board']` vs `['workItems', {…}]`) → document/normalize.

## Sequencing
Foundation → Tier 1 → Tier 3/4 import sweeps → Tier 2 component swaps → verify → commit per tier.
