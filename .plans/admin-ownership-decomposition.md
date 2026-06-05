# Plan: Decompose ownership in AdminDashboard

## Context / why this exists

`split-monolithic-frontend-20260513-1726.md` split `AdminDashboard.tsx` into a
folder (tabs + modals) but **explicitly listed "no state-management changes" as
a non-goal** — its PRs kept every query and mutation in the parent and drilled
them down as props. That's why `AdminDashboard.tsx` is still ~1,600 lines after
the split: the *views* moved out, the *controller* didn't.

This plan picks up the deferred half: move **state ownership** down so the
parent becomes a thin shell. The payoff is concrete, not cosmetic:

1. **Re-render scope.** All form/UI state (`roleForm`, `employeeForm`,
   `userForm`, `editUserForm`, `gitHubForm`, `addMemberForm`, `categoryFilter`,
   `openRoleDropdown`, 6 modal open-flags) lives in the parent. A keystroke in
   any admin form re-renders the entire `AdminDashboard` function — re-running
   `teamCapacity`/`availableSpecs`/`filteredProjects`/`PICKER_CATALOG`,
   recreating ~20 mutation objects and every (non-memoized) handler closure,
   which then re-render the mounted tab (none are `React.memo`'d). Colocating
   each form's state with the modal/tab that owns it shrinks that blast radius.
2. **Initial /admin chunk weight.** The parent chunk eagerly carries all 6
   modals (static imports), the ~230-line RBAC capability-picker logic, and all
   20 mutations — downloaded on `/admin` even if you never open Roles. Moving
   tab-specific logic into the already-lazy tab chunks trims the eager chunk.
3. **Testability.** The RBAC grant-resolution logic (`wildcardCovers`,
   `isItemEffectivelyChecked`, `toggleCatalogItem`) is subtle tri-state/wildcard
   code with zero tests because it's trapped in a component. Extracting it to a
   pure module makes it directly unit-testable.

> **Note:** file-splitting alone buys *none* of #1–#3. The win comes from
> relocating state and logic, which is what this plan does.

## Base branch / dependency

**Base this work on `perf/admin-first-render`** (currently unmerged), or rebase
onto `main` after that branch lands. The refactor MUST preserve the perf work:
per-tab `enabled` gating, per-tab loading flags, lazy tab chunks, and
`refetchOnMount: true`. Doing it off stale `main` would silently revert those.

## Non-goals (do NOT do these here)

- Changing query keys (cache contract) or `ADMIN_REFETCH` semantics.
- Altering the cross-cutting invalidation rules in `app/CLAUDE.md` (user-role
  writes invalidate `['admin','users']` + `['admin','employees']`; employee
  writes invalidate `stats` + `developers-capacity` + `developers`; category
  writes invalidate the 3-key category scope). These move *with* their
  mutations, byte-for-byte.
- Fixing audit-flagged items (no error boundaries, JWT-in-localStorage, etc.).
- Touching backend or any non-Admin page.

## Target structure

```
pages/AdminDashboard/
  AdminDashboard.tsx        # shell: header + tab nav + URL state + Suspense switch (~150–250 LOC)
  types.ts                  # User, Project, Role, DashboardStats, ProjectWeeklyReport(+Row),
                            #   Capability; re-export ProjectCategory, Employee, DeveloperCapacity
  lib/
    capabilityPicker.ts     # PURE: wildcardCovers, keyIsUnderGrant, isItemChecked,
                            #   isItemEffectivelyChecked, applyToggleGrant, applyToggleCatalogItem,
                            #   buildPickerCatalog(PROJECT_TABS), toPascalCase, Catalog/Picker types
    capabilityPicker.test.ts
  hooks/
    useAdminStats.ts        # statsQuery
    useEmployeesAdmin.ts    # employees+capacity queries, teamCapacity/availableSpecs, save/delete
    useProjectsAdmin.ts     # projects/categories/weeklyReport, filteredProjects, categoryFilter,
                            #   category CRUD + setProjectCategory, github save/invites, members
    useUsersAdmin.ts        # usersQuery, user create/delete/update
    useRolesAdmin.ts        # roles+capabilities queries, role CRUD, assign/remove user role,
                            #   refreshCapsTwice, isSavingRole
  tabs/                     # existing presentational tabs (largely unchanged)
  containers/               # (PR 3) thin per-tab containers that wire hook + modals + tab
  modals/                   # existing modal components (unchanged)
```

## Roadmap — 3 PRs (+ 1 optional)

| PR | Title | Size | Depends | Render-scope win? | Chunk win? |
|----|-------|------|---------|-------------------|------------|
| 1 | Extract shared types + pure RBAC picker (+tests) | M | — | no | partial |
| 2 | Per-domain data+mutation hooks (called from parent) | L | 1 | no | no |
| 3 | Push modal+form state into per-tab containers | L | 2 | **yes** | **yes** |
| 4 | (optional) memo containers / lazy modals after profiling | S | 3 | polish | polish |

Each PR is independently mergeable and behavior-neutral. Land sequentially.

---

### PR 1 — Shared types + pure RBAC picker logic

**What moves**
- New `types.ts`: the local interfaces (`User`, `Project`, `Role`,
  `DashboardStats`, `ProjectWeeklyReportRow`, `ProjectWeeklyReport`,
  `Capability`) + re-exports of `ProjectCategory` (from CategoryManagerModal)
  and `Employee`/`DeveloperCapacity` (from EmployeesTab). Replace the in-file
  decls with imports.
- New `lib/capabilityPicker.ts`: move `wildcardCovers`, `keyIsUnderGrant`,
  `isItemChecked`, `isItemEffectivelyChecked`, `PickerItem`/`CatalogNode` types,
  `toPascalCase`, and `PICKER_CATALOG` (as `buildPickerCatalog(PROJECT_TABS)`).
  Convert the two stateful togglers to **pure** functions:
  `applyToggleGrant(grants, key, registry) → string[]` and
  `applyToggleCatalogItem(grants, node) → string[]`. The component keeps
  `roleForm` state and calls `setRoleForm(f => ({...f, capability_keys:
  applyToggleGrant(f.capability_keys, key, registry)}))`.

**Tests (the point of this PR):** `capabilityPicker.test.ts` — wildcard
coverage (`*`, `project.*` covers `project.pm.*`), auto-promote (all children →
parent checked), uncheck-sweep, and grant minimization.

**Risk:** Low — pure code motion + thin wrappers.
**Verify:** `tsc`, `lint`, `build`, new unit tests pass; manually open the Role
editor and toggle a wildcard + a child to confirm parity.
**Effect:** −~300 LOC from the component; RBAC logic gains coverage.

---

### PR 2 — Per-domain data + mutation hooks

**What moves:** Lift each domain's queries, mutations, derived memos, and
invalidation helpers into a custom hook. The parent calls the hooks and spreads
the results into the **same** tab/modal props — render tree unchanged.

- `useEmployeesAdmin(enabled)` → employees+capacity queries, `teamCapacity`,
  `availableSpecs`, save/delete mutations + handlers.
- `useProjectsAdmin(enabled)` → projects/categories/weeklyReport queries,
  `filteredProjects`, `categoryFilter` state, category CRUD + setProjectCategory,
  github save/invites, project-members query + add/remove.
- `useUsersAdmin(enabled)` → usersQuery, create/delete/update mutations.
- `useRolesAdmin(enabled)` → roles+capabilities queries, role CRUD,
  assign/remove user-role, `refreshCapsTwice`, `isSavingRole`.
- `useAdminStats(enabled)` → statsQuery (trivial; include for symmetry).

**Critical to preserve (verbatim move):**
- Every `invalidateQueries` set, especially the cross-tab ones (employee writes
  → `stats`+`developers-capacity`+`developers`; user-role → `users`+`employees`;
  category → 3-key scope). See `app/CLAUDE.md`.
- `refreshCapsTwice`'s `setTimeout` double-refresh after role mutations.
- `saveGitHubMutation.onSettled` closes over `editingProject?.id` for
  `invalidateProjectScope` — keep that state in the same hook.
- `projectMembersQuery` uses key `['project', id]` (shared with ProjectDetail) —
  keep the key.

**Risk:** Medium — mechanical but high-volume. Behavior identical.
**Verify:** Full admin manual smoke — create/edit/delete in each tab, confirm
the dependent tab updates (e.g. add a developer-role user → Employees tab
reflects it). `tsc`/`lint`/`build`.
**Effect:** −~580 LOC from the component. (No render-scope win yet — state still
lives in the parent because the hooks are called there. PR 3 delivers that.)

---

### PR 3 — Per-tab containers own modal + form state (the render-scope win)

**What changes:** Introduce a thin container per tab in `containers/` that owns
that tab's hook call, its modal open-flags + form state, and renders its modals.
The shell renders `<Suspense>` around a switch of the 5 lazy containers.

- `EmployeesContainer` → `useEmployeesAdmin`, `showEmployeeModal`/`editingEmployee`/
  `employeeForm`, renders `EmployeesTab` + `EmployeeModal`.
- `ProjectsContainer` → `useProjectsAdmin`, github/members/category modal state,
  renders `ProjectsTab` + GitHub/ProjectMembers/CategoryManager modals. Also
  calls a lightweight `useEmployeesList()` for the member dropdown (replaces the
  old `enabled: onEmployees || onProjects` OR).
- `UsersContainer` → `useUsersAdmin`, `showUserModal`/`userForm`,
  `editingUser`/`editUserForm`, `openRoleDropdown`; renders `UsersTab` +
  UserModal + EditUserModal + **the inline per-user role modal moved here**.
  Calls `useRolesList()` for the role checkboxes (replaces `enabled: onUsers ||
  onRoles`).
- `RolesContainer` → `useRolesAdmin`, `showRoleModal`/`editingRole`/`roleForm`;
  renders `RolesTab` + `RoleModal`.
- `DashboardContainer` → `useAdminStats`, renders `DashboardTab`.

**Gating simplification:** Because a container only mounts when its tab is
active, its queries fire on mount — this *replaces* the explicit `enabled: onX`
flags. The two cross-tab needs are met by the extra list-hook calls above.
Keep the per-tab loading spinner + `restricted` capability gate per container.

**Risk:** Medium-high — changes mount/render structure and removes the `enabled`
flags. **Verify carefully:**
- Network tab: landing on `/admin` fetches only `stats`; switching to Employees
  fetches employees+capacity and nothing else; Projects also fetches the
  employees list (member modal); Users also fetches roles.
- Member modal dropdown is populated; per-user role modal checkboxes populated.
- Back/forward `?tab=` URL sync still works (the effect at AdminDashboard.tsx
  L141 stays in the shell).
- `refreshCapsTwice` still fires when the current user's roles change.
- Typing in each form re-renders only that container (confirm via React
  DevTools Profiler — this is the success metric).

**Effect:** Shell → ~150–250 LOC. Form keystrokes re-render one container, not
the dashboard. Modal + mutation code moves into the lazy tab chunks → lighter
initial `/admin` chunk.

---

### PR 4 — (optional) profiling-driven polish

Only if the Profiler still shows churn after PR 3: wrap containers in
`React.memo`, `useCallback` the handlers passed across the tab boundary, and/or
lazy-load heavy modals (e.g. RoleModal) within their container. Skip if PR 3's
mount-based ownership already flattens the render cost.

## Success metrics

- React DevTools Profiler: typing in a form commits only the owning container
  (before: whole `AdminDashboard`).
- `/admin` initial JS (Network, cold) drops by the modal+mutation+RBAC weight
  now deferred into tab chunks.
- `AdminDashboard.tsx` ≤ ~250 LOC.
- `capabilityPicker` unit tests green; full admin manual smoke unchanged.

## Rollback

Each PR is behavior-neutral and independently revertable. PR 3 is the only one
that changes runtime structure; if a regression appears, revert PR 3 alone —
PRs 1–2 leave the app working identically to today with a smaller file.
