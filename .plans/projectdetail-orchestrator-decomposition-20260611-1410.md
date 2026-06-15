# Plan: Decompose `ProjectDetail.tsx` orchestrator (single PR)

**Tier:** Lightweight (1 PR)
**Branch:** `refactor/projectdetail-decomposition` (worktree, off `main`)
**Created:** 2026-06-11
**Source:** Next step of `.plans/split-monolithic-frontend-20260513-1726.md` (PRs 11–12 already landed; this finishes the orchestrator).
**Constraint:** Behavior-neutral. Full AdminDashboard pattern (types.ts + data hook), per user decision.

---

## Summary

`pages/ProjectDetail/ProjectDetail.tsx` is **1179 LOC** — the last un-shrunk page orchestrator.
PRs 11–12 of the original split plan already landed (`sections/`, `tabs/`, `modals/GenerateRoadmapModal`
all exist on main). This PR brings the orchestrator to **~330 LOC** by following the **realized
AdminDashboard pattern** (which the written `CONVENTIONS.md` no longer matches): extract a `types.ts`
and a data hook, plus the three remaining JSX chunks. No behavior change.

Key finding: `CONVENTIONS.md` rule 5 ("no central types module yet") and rules 1–2 (queries/mutations
stay literally in the orchestrator) were superseded by the most-decomposed sibling — `AdminDashboard`
ships a `types.ts` + `hooks/` folder and landed its orchestrator at 203 LOC. Strict JSX-only extraction
of ProjectDetail lands ~870 LOC; +types.ts → ~670; only the data-hook path clears the ≤600 target.

## Goals

- `ProjectDetail.tsx` ≤ ~600 LOC (target ~330).
- Orchestrator owns only: routing/tab state, the three effects that must stay at parent
  (Rules-of-Hooks), pulse hooks, early returns, the Architecture modal, and tab routing.
- `tsc -b` + `npm run lint` + `npm run build` + `npm run test` (vitest) green.
- Every new sub-component/hook has an explicit prop/return interface importing from the new `types.ts`.

## Non-goals

- No audit-bug fixes (F-C1/C2/S1; the `console.log` at 551/558 and native `confirm()` at 634 are
  preserved verbatim).
- No dedup of `Project`/`Developer` copies in **Admin/Board/ProjectsPage** (separate F-T1 initiative).
  Only this folder's 3 local dups get rewired.
- No Context migration, no new lazy boundaries beyond keeping existing ones.

## Recommended approach — 5 new files; orchestrator slims to a shell

| New file | Source lines | ~LOC | Contents |
|---|---|---|---|
| `types.ts` | 37–250 | 214 | 13 interfaces + `TabType` + `ProjectOverview`. JSDoc header mirroring `AdminDashboard/types.ts`. |
| `hooks/useProjectDetailData.ts` | 306–738 + effect 312–323 | ~440 | All 11 `useQuery`, 9 `useMutation` + handlers, derived consts, `hubLoading`, `isCurrentUserAdmin`, **and the cache-seeding effect**. Takes `id`; gets `queryClient`/`user`/`can` via its own `useQueryClient()`/`useAuth()`. Returns data + handlers object. |
| `tabs/OverviewTab.tsx` | 951–1074 | ~172 | Overview skeleton + the 5-section composition. **Eager import** (default tab). Explicit `OverviewTabProps`. |
| `sections/ProjectDetailHeader.tsx` | 887–947 | ~60 | Back btn, title, Open Board, tab strip. Props: `project, tabs, activeTab, onTabChange, can, navigate`. |
| `components/ProjectDetailSkeleton.tsx` | 740–819 | ~80 | Pure-JSX full-page loading skeleton, no props. |

### Stays at the parent (verified against Rules of Hooks)

- `activeTab` state + `?tab=` sync effect (264–272)
- **Access-correction effect (347–367)** — must stay above the early-return; reads `project`
  (from hook), `activeTab`, `user`, `can`.
- accessDenied toast effect (370–374)
- `editingArchitecture` state (275) + the lazy `ArchitectureEditor` modal (1160–1174)
- `usePulseManualData` / `useMergedPulse` (already hooks; feed both Pulse tabs)
- The 3 early returns, `canAccessTab`, `tabs`, `availableDevelopers`, the Suspense-wrapped tab routing

### Orchestrator after

`useProjectDetailData(id)` destructure → early returns (`<ProjectDetailSkeleton/>` etc.) →
`<ProjectDetailHeader/>` → `<OverviewTab/>` + the 6 existing lazy tabs → Architecture modal. ~330 LOC.

### Hook return contract

```ts
export interface UseProjectDetailDataResult {
  project: Project | null;
  isLoading: boolean;
  accessDenied: boolean;
  allDevelopers: Developer[];
  sprints: Sprint[];
  hubWorkItems: HubWorkItem[];
  goals: Goal[];
  milestones: Milestone[];
  activities: ActivityItem[];
  analytics: ProjectAnalytics | null;
  prdAnalysis: PRDAnalysis | null;
  links: ProjectLink[];
  linksLoading: boolean;
  hubLoading: boolean;
  handleAddLink: (link: { name: string; url: string }) => void;
  handleDeleteLink: (linkId: number) => void;
  handleTaskUpdate: (itemId: string, updates: any) => void;
  handleSaveEdit: (editForm: Partial<Project>) => void;
  handleAddDeveloper: (form: { developer_id: string; role: string; responsibilities: string }) => void;
  handleRemoveDeveloper: (developerId: number) => void;
  handlePromoteToAdmin: (developerId: number) => void;
  handleDemoteFromAdmin: (developerId: number) => void;
  handleSaveArchitecture: (archId: number, updates: { mermaid_code?: string; name?: string; description?: string }) => void;
  isCurrentUserAdmin: () => boolean;
}
export const useProjectDetailData = (id: string | undefined): UseProjectDetailDataResult => { ... }
```

## Alternatives considered

| Decision | Chosen | Rejected | Why |
|---|---|---|---|
| Hitting ≤600 | types.ts + data hook (Admin pattern) | JSX-only (~870) / +types only (~670) | Only the data-hook path clears 600; matches the realized 203-LOC Admin precedent. |
| OverviewTab loading | Eager | Lazy (like other 6 tabs) | Default tab — lazy adds initial-paint latency; CONVENTIONS rule 7. |
| Cache-seed effect | Into the hook | Keep at parent | Touches only hook-internal `queryClient` + `overviewQuery.data`. |
| Folder's local type dups | Rewire 3 sections to `types.ts` | Leave duplicated | Same folder, safe, removes the dup; structurally identical (verify at build). |

## Risks

| Sev | Risk | Mitigation |
|---|---|---|
| High | A handler/derived value silently captures a stale parent closure after moving into the hook | Hook takes only `id`; everything else via `useAuth`/`useQueryClient` inside. Reviewer checks every returned handler is "live." Manual smoke of all 9 mutations. |
| Med | Access-correction effect breaks if `project`/`activeTab` wiring drifts during the move | Keep that effect byte-identical at parent; only its `project` source changes (hook return). Test deep-link to a gated tab + role-change redirect. |
| Med | Rewiring the 3 sections' local types fails to compile if a dup has drifted | Diff each local interface vs the canonical one before deleting; if drifted, keep the local one and note it. |
| Low | `?tab=` deep-link / capability gating regresses | Verify PM + Pulse Settings stay hidden without the cap; all `?tab=` values resolve. |

## Open questions

None blocking. One judgment call folded in: rewiring this folder's 3 local type dups (in-scope) but
not the wider codebase (out of scope).

---

## The PR

**Title:** `refactor(project-detail): decompose ProjectDetail orchestrator into types + data hook + Overview/Header/Skeleton`
**Size:** L (~+750/−850, behavior-neutral) · **Relationship:** — (independent, off main)

**Tasks (in order):**

1. Create `types.ts` (move 37–250; JSDoc header per Admin convention).
2. Create `hooks/useProjectDetailData.ts` (move queries+mutations+handlers+derived+cache-seed effect; import types).
3. Create `components/ProjectDetailSkeleton.tsx` (move 740–819).
4. Create `sections/ProjectDetailHeader.tsx` (move 887–947).
5. Create `tabs/OverviewTab.tsx` (move 951–1074; eager).
6. Slim `ProjectDetail.tsx` to the shell; wire imports.
7. Rewire `ProjectInfoSection` / `TeamSection` / `ArchitectureSection` local dups to import from `./types` (after diffing).
8. Update `CONVENTIONS.md` rule 5 to reflect the realized types.ts + hooks pattern.

**Merge criterion:** `tsc -b` + `npm run lint` + `npm run build` + `npm run test` green; `ProjectDetail.tsx` ≤ ~600 LOC.

**Post-merge verification (manual — no tests cover this page):** Load `/project/:id` → skeleton →
Overview renders identically (Info/PRD/Architecture/Team/Links); edit project info, add/remove/
promote/demote dev, add/delete link, edit architecture all save; every tab loads on its `?tab=`;
PM + Pulse Settings stay hidden without the cap; deep-link to a gated tab redirects.

### PR description draft

> ## What
> Decomposes the 1179-LOC `pages/ProjectDetail/ProjectDetail.tsx` orchestrator into a thin shell
> (~330 LOC) plus a co-located `types.ts`, a `useProjectDetailData` data hook, and three extracted
> UI pieces (`OverviewTab`, `ProjectDetailHeader`, `ProjectDetailSkeleton`). Finishes the page-split
> initiative (`split-monolithic-frontend`) — this was the last orchestrator over the LOC target.
>
> ## Why
> Last page above the ~600-LOC convention. Follows the realized `AdminDashboard` pattern (types.ts +
> hooks/), which superseded the original "no types module" rule. Pure structural refactor.
>
> ## How
> - `types.ts` — 14 shared ProjectDetail domain types.
> - `hooks/useProjectDetailData.ts` — all queries/mutations/handlers + cache-seeding effect.
> - `tabs/OverviewTab.tsx` (eager) — overview skeleton + 5-section composition.
> - `sections/ProjectDetailHeader.tsx`, `components/ProjectDetailSkeleton.tsx`.
> - Orchestrator keeps tab/URL state, the access-correction + toast effects (Rules-of-Hooks),
>   pulse hooks, early returns, and the Architecture modal.
> - Rewired this folder's 3 sections off their local duplicate type declarations.
>
> ## Risk / verification
> Behavior-neutral; no audit bugs fixed (preserved verbatim). No automated tests cover this page —
> manually verified Overview render, all 9 mutations, every `?tab=`, and capability gating for PM +
> Pulse Settings. `tsc -b` / lint / build / vitest green.
