# RBAC — Role-Based Access Control

How permissions work in Arsenal-Ops, and exactly what to change when adding a new
tab, feature, or capability key.

This file documents the **actual** implementation as of the read/write split.
Read it before touching anything in `backend/capabilities.py`,
`backend/routers/auth.py`, or `app/src/pages/AdminDashboard/`.

---

## TL;DR

- **Capability** = a string key like `admin.users_write` or `project.tracker.*` that grants access to a surface.
- **Role** = a named bundle of capabilities (e.g. `developer`, `project_manager`, or any custom role).
- **User** = has zero or more roles (m2m). Effective capabilities = union of all role caps.
- **`*` wildcard** = grants everything. **`prefix.*`** = grants every cap whose key starts with `prefix.`.
- **Read/write split** = each tab that has actions gets a `*_write` cap, paired with the read cap.
- **Three layers of enforcement**: backend endpoint gate, frontend route guard, frontend UI button gate.

---

## Mental model

### 1. Capabilities are strings, not flags

Every action in the app is gated on a capability key. They live in a single
Python dict at [`backend/capabilities.py`](backend/capabilities.py):

```python
CAPABILITIES = {
    "admin.dashboard": "View admin dashboard",
    "admin.users": "View users",
    "admin.users_write": "Create, edit, delete users and assign roles",
    "project.board": "Open and view the Project Board (kanban + sprints)",
    "project.tracker_write": "Create, edit, and delete work items and sprints",
    # ... etc.
}
```

Keys use **dot notation** for grouping (`admin.X`, `project.Y`) so wildcards
work. The convention:
- `<area>.<surface>` — read access (e.g., `admin.users`, `project.calendar`)
- `<area>.<surface>_write` — write access (e.g., `admin.users_write`)
- `<area>.<feature>` — standalone features (e.g., `project.create`, `project.ai.write`)

### 2. The matcher: how `can('admin.users_write')` decides yes/no

Source of truth: [`backend/capabilities.py:matches()`](backend/capabilities.py),
mirrored exactly by the frontend at [`app/src/lib/capabilities.ts`](app/src/lib/capabilities.ts).

For a needed cap and a set of grants the user holds:

| Grant the user has | Needed cap | Match? |
|---|---|---|
| `*` | anything | ✓ (full access) |
| `admin.users_write` | `admin.users_write` | ✓ (exact) |
| `admin.*` | `admin.users_write` | ✓ (prefix wildcard covers descendants) |
| `admin.users` | `admin.users_write` | ✗ (no prefix relation) |
| `admin.users_write` | `admin.users` | ✗ (sibling, not ancestor) |

Crucial implication: `admin.users` (read) and `admin.users_write` (write) are
**siblings**, not parent-child. Granting `admin.users` does NOT cover the write
cap, by design — that's how the read/write split works. Granting the wildcard
`admin.*` covers both.

### 3. Backend enforcement: `require_capability`

Every protected endpoint uses the FastAPI dependency factory from
[`backend/routers/auth.py:require_capability()`](backend/routers/auth.py):

```python
@router.post(
    "/employees",
    dependencies=[Depends(require_capability("admin.employees_write"))],
)
def create_employee(...): ...
```

`require_capability(cap)` pulls the current user via `get_current_user`, calls
`User.has_capability(cap)` (which reads the m2m relationship, NOT the legacy
`users.role` string), and raises 403 if denied.

Capability lookup is cached per-user for 60s via a `TTLCache`
([auth.py:56-57](backend/routers/auth.py#L56)). Every endpoint that mutates
role assignments or role capabilities calls `_invalidate_caps_cache()` to
flush stale entries.

### 4. Frontend enforcement: three layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 — Route guard (App.tsx)                            │
│  RequireAnyAdminCapability, RequireProjectBoardRead         │
│  Redirects unauthorized users BEFORE the component mounts   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2 — Tab/page-level gate                              │
│  `canSeeX` flags in AdminDashboard, ProjectDetail           │
│  Shows "This section is restricted" if no read cap          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3 — Action button gate                               │
│  `canWriteX` props passed to tab components                 │
│  Hides Add/Edit/Delete buttons without write cap            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 0 (always) — Backend endpoint gate                   │
│  require_capability("admin.users_write") on the route       │
│  Returns 403 even if the UI is bypassed                     │
└─────────────────────────────────────────────────────────────┘
```

**Backend gate is the security boundary.** The frontend gates are UX —
hiding buttons that would 403 on click, preventing pages from rendering
broken states.

### 5. Role model in the database

```
┌──────────┐ m2m via   ┌────────────┐ m2m via       ┌──────────────────┐
│  users   │  user_roles │  roles  │ role_caps     │ role_capabilities│
└──────────┘ ──────────→└────────────┘ ────────────→│ (cap key string) │
                                                    └──────────────────┘
```

- A user has multiple roles. A role has multiple capability keys.
- `User.effective_capability_keys()` ([models/user.py:69-75](backend/models/user.py#L69))
  returns the union of every assigned role's capabilities.
- The legacy `users.role` comma-string column is kept in sync with the m2m
  for **display purposes only** (Users tab role chips). Access decisions go
  through the m2m.

### 6. System roles — the three default roles

Defined in [`backend/database.py:SYSTEM_ROLES`](backend/database.py#L689):

| Role | Grants | Purpose |
|---|---|---|
| `admin` | `["*"]` | Full system access |
| `project_manager` | `["project.*"]` | All project tabs |
| `developer` | 10 explicit caps incl. `project.board` | Default access for individual contributors |

These are seeded on first boot by `seed_rbac()`. **Idempotent** — once
created, they're never modified by the seed code on subsequent boots. Admin
can customize them via the Roles tab and the changes persist across
deploys.

---

## Playbook: adding a new tab

Suppose you're adding a new "Reports" tab to the Admin screen with both view
(read) and configure (write) actions. Here's the complete list of changes.

### Step 1 — Register the capability keys (backend)

Edit [`backend/capabilities.py`](backend/capabilities.py):

```python
CAPABILITIES = {
    # ... existing entries ...
    "admin.reports": "View admin reports",
    "admin.reports_write": "Create, edit, delete report configurations",
}
```

That's it for cap registration. The matcher and `is_valid_grant()` pick up
the new keys automatically.

### Step 2 — Gate the backend endpoints

In your router (e.g., `backend/routers/admin.py`):

```python
@router.get(
    "/reports",
    dependencies=[Depends(require_capability("admin.reports"))],
)
def list_reports(...): ...

@router.post(
    "/reports",
    dependencies=[Depends(require_capability("admin.reports_write"))],
)
def create_report(...): ...

@router.put(
    "/reports/{id}",
    dependencies=[Depends(require_capability("admin.reports_write"))],
)
def update_report(...): ...

@router.delete(
    "/reports/{id}",
    dependencies=[Depends(require_capability("admin.reports_write"))],
)
def delete_report(...): ...
```

**Rule of thumb:** GETs use the read cap, POST/PUT/DELETE use the `_write`
cap.

### Step 3 — Add the cap to the role-editor picker

Edit [`app/src/pages/AdminDashboard/AdminDashboard.tsx`](app/src/pages/AdminDashboard/AdminDashboard.tsx)
— find `PICKER_CATALOG`, scroll to the `admin` group's `items` array, add:

```typescript
{
  label: 'Reports',
  description: 'View report configurations and export data',
  readGrant: 'admin.reports',
  writeGrant: 'admin.reports_write',
},
```

That's all you need to make the cap **grantable** via the UI.

### Step 4 — Add tab plumbing (`AdminDashboard.tsx`)

Three local edits:

```typescript
// (a) Add to AdminTab union and VALID_ADMIN_TABS
type AdminTab = 'dashboard' | 'employees' | 'projects' | 'time_entries'
              | 'users' | 'roles' | 'reports';
const VALID_ADMIN_TABS: AdminTab[] = [..., 'reports'];

// (b) Compute the cap flags (near the other canSee*/canWrite* declarations)
const canSeeReports = can('admin.reports');
const canWriteReports = can('admin.reports_write');

// (c) Tab nav button + conditional render
{...(canSeeReports ? [{ id: 'reports', label: 'Reports', icon: BarChart3 }] : [])}

{activeTab === 'reports' &&
  (canSeeReports ? (
    <ReportsTab canWriteReports={canWriteReports} ... />
  ) : (
    <div className="...">This section is restricted.</div>
  ))}
```

### Step 5 — Add the tab to `ADMIN_CAPABILITIES`

**Don't forget this one** — it's caught us before.

Edit [`app/src/lib/adminCaps.ts`](app/src/lib/adminCaps.ts):

```typescript
export const ADMIN_CAPABILITIES = [
  'admin.dashboard',
  'admin.employees',
  'admin.projects',
  'admin.time_entries',
  'admin.users',
  'admin.roles',
  'admin.reports',  // ← add here
] as const;
```

Without this, the route guard `RequireAnyAdminCapability` will redirect away
any user whose only admin cap is `admin.reports`. They'd never reach the tab.

### Step 6 — Create the tab component

`app/src/pages/AdminDashboard/tabs/ReportsTab.tsx`:

```typescript
interface ReportsTabProps {
  canWriteReports: boolean;
  // ... other props
}

const ReportsTab = ({ canWriteReports, ...rest }: ReportsTabProps) => {
  return (
    <div>
      {canWriteReports && (
        <Button onClick={onCreateReport}>New Report</Button>
      )}
      {/* table of reports — gate per-row Edit/Delete on canWriteReports */}
    </div>
  );
};
```

### Step 7 — Migrate existing roles (only if you're splitting an old combined cap)

If `admin.reports` is a **brand new** cap, skip this step. Roles that don't
have it stay without it; admin grants it through the Roles tab.

If you're splitting an existing combined cap into read+write (like we did
for `admin.users` → `admin.users` + `admin.users_write`), add a one-shot
backfill in [`backend/database.py`](backend/database.py):

```python
def reconcile_reports_write_cap():
    """One-shot backfill: grants `admin.reports_write` to roles that held
    the pre-split combined `admin.reports` cap."""
    from models.role import Role, RoleCapability

    MIGRATION_NAME = "reconcile_reports_write_cap_v1"

    db = SessionLocal()
    try:
        if not mark_migration_applied(MIGRATION_NAME, db):
            return
        # ... find roles with admin.reports but not admin.reports_write,
        #     insert admin.reports_write rows, commit, log ...
    finally:
        db.close()
```

Then call it from `init_db()`. The `mark_migration_applied` guard ensures
it runs once per database, then never again — admin customizations are
preserved on subsequent deploys.

### Step 8 — Verify

```bash
# Backend
cd backend
python -m ruff check capabilities.py routers/admin.py database.py
python -m ruff format --check capabilities.py routers/admin.py database.py
python -c "from capabilities import is_valid_grant; assert is_valid_grant('admin.reports') and is_valid_grant('admin.reports_write')"

# Frontend
cd ../app
npx tsc --noEmit
npm run lint
npm run build
```

Manual smoke checks:
1. Log in as a user without `admin.reports` → "Reports" tab not in nav.
2. Log in as admin (`*`) → tab visible, all actions work.
3. Create a custom role with only `admin.reports` (no write) → tab visible, action buttons hidden, backend writes 403.
4. Re-deploy → admin customizations to roles preserved (the one-shot migration runs at most once).

---

## Playbook: adding ONLY a new write cap to an existing tab

Use this if an existing read-only surface gets a new write action (e.g.
"Cancel Sprint" added to the existing Project Board).

1. **Add the cap** to `backend/capabilities.py`.
2. **Gate the endpoint** in the relevant router via `require_capability("project.X_write")`.
3. **Hide the button** in the frontend behind `can('project.X_write')`.
4. **Add the picker entry** in `PICKER_CATALOG` — either:
   - Add `writeGrant: 'project.X_write'` to an existing row that's now read+write, OR
   - Add a brand new write-only row (like AI Generators).
5. **If existing roles need backfill**, add a one-shot migration with
   `mark_migration_applied` gating.

The W→R dependency UI logic in `togglePickerCheckbox` handles ticking
behavior automatically — you don't need to write any toggle code.

---

## Playbook: adding a new read-only cap

For a brand-new read-only surface (e.g., a new "Audit Log" tab):

1. **Add the cap** to `backend/capabilities.py`.
2. **Gate the GET endpoint** in the relevant router.
3. **Add a picker entry** with `readGrant` only (no `writeGrant`).
4. **Compute `canSeeAuditLog = can('project.audit_log')` and gate the UI.

If the tab has no actions, that's all — the picker will render only the
Read checkbox; the Write column shows `—`.

---

## The wildcard guarantee (don't break it)

The frontend matcher and backend matcher are byte-for-byte equivalent.
**If you change one, change the other**.

- [`backend/capabilities.py:matches()`](backend/capabilities.py)
- [`app/src/lib/capabilities.ts:matchesCapability()`](app/src/lib/capabilities.ts)

Both implement: `*` matches everything; `prefix.*` matches `prefix` itself
and anything starting with `prefix.`; exact strings match exactly.

---

## Migrations and the `applied_migrations` table

Some capability changes need to **backfill existing data** to preserve
access for users in production. Two patterns exist in this codebase:

### Pattern A — state-matching one-shot in `seed_rbac()`

Used to bring the unmodified `developer` system role forward to the current
canonical grant set. Gates on **exact set equality**:

```python
PRIOR_DEV_STATES = [
    BASE_READ_GRANTS,
    BASE_READ_GRANTS | {"project.ai.write"},
    # ... known historical snapshots ...
]
if current_dev_grants in PRIOR_DEV_STATES:
    add(CANONICAL_DEV_GRANTS - current_dev_grants)
```

Safe because any admin edit breaks the exact match, making the one-shot a
no-op forever. Self-disabling on customization.

### Pattern B — marker-gated backfill via `applied_migrations`

Used when the migration logic isn't expressible as a state match (e.g.,
"any role with X gets Y"). Pattern:

```python
def reconcile_thing_v1():
    db = SessionLocal()
    try:
        if not mark_migration_applied("reconcile_thing_v1", db):
            return  # already applied on this database
        # ... do the work, commit ...
    finally:
        db.close()
```

The marker row is committed BEFORE the body runs, so even if the body
crashes mid-way, the migration won't re-run on next boot. The body itself
MUST be idempotent — see the existing two reconciles for the pattern.

**Versioning:** name the migration `<function>_v1`. If you ever need to
change the logic in a way that should re-run, bump to `_v2`. Old `_v1`
markers stay in the table forever.

### What NOT to do

❌ **Don't run a backfill on every boot without a marker.** It will
override deliberate admin customizations the next time admin removes a cap
you just added.

❌ **Don't add backfill logic to `seed_rbac()` outside the state-matching
pattern.** Use a separate `reconcile_*` function with a marker.

---

## The `users.role` legacy column

There's an old comma-separated `users.role` string column that predates the
m2m model. It's still in the DB, but **access decisions never read it**.
It's kept in sync with the m2m via `_sync_legacy_role_column()` and used
purely for display purposes (role chips in the Users tab).

If you find code that reads `user.role.split(',')` for an access decision,
that's a bug — replace it with a capability check (`user.has_capability(...)`).

The one remaining substring check in
[`backend/routers/projects.py:31`](backend/routers/projects.py#L31)
(`if "admin" in user.role`) is known and on the eventual cleanup list.

---

## Per-project admin (separate from capabilities)

Some Overview-tab writes (edit PRD, manage team, edit project info) are NOT
gated by capabilities. They're gated by **per-project admin role** — a
boolean `is_admin` on the `project_developers` join table.

This is by design: each project controls who can edit its own metadata.
The capability picker does NOT cover these — the picker's Overview entry is
read-only with a footnote: *"Editing Overview content is governed by the
per-project admin role, not by these capabilities."*

If you're adding write actions to an Overview sub-tab, decide which model
fits:
- **Capability** (`project.overview.X_write`) — system-wide, anyone with the
  cap can edit any project's overview.
- **Per-project admin** (`require_project_admin(project_id, user, db)`) —
  only project admins of THAT specific project. This is the current model.

---

## RoleModal toggle behavior (W→R dependency)

The picker auto-enforces a dependency: granting Write implies granting
Read (you can't sensibly edit without viewing). Implementation in
[`app/src/pages/AdminDashboard/AdminDashboard.tsx`](app/src/pages/AdminDashboard/AdminDashboard.tsx)
`togglePickerCheckbox`:

| User clicks | What happens |
|---|---|
| Tick **Write ON** | Also ticks Read (if Read isn't already covered by a wildcard) |
| Untick **Read OFF** | Also unticks Write (preserves no-write-without-read invariant) |
| Tick **Read ON** | Only Read added — Write stays as-is |
| Untick **Write OFF** | Only Write removed — Read stays |

For child rows (sub-tabs under a parent), the same rules apply per-row.
The parent's "Read" checkbox shows auto-promoted when all children's
reads are granted explicitly.

---

## When you're stuck

| Symptom | Likely cause |
|---|---|
| Endpoint always 403s after deploy | Cap name typo — check `is_valid_grant(your_cap)` returns True |
| New cap doesn't appear in picker | Missing entry in `PICKER_CATALOG` |
| Tab visible but user gets 403 on click | Frontend `canSee*` flag uses a different cap than the backend `require_capability` |
| User reports "I lost access on deploy" | Missing one-shot backfill — but DON'T add one that re-runs every boot. Use `mark_migration_applied`. |
| Wildcards seem to not match | Check `prefix.*` doesn't have a trailing dot. `project.*` is correct; `project.` is not. |
| `_caps_cache` shows stale caps after role edit | Confirm the mutation endpoint calls `_invalidate_caps_cache()` |
| Route redirects user before they reach a tab they have access to | Likely `ADMIN_CAPABILITIES` in `adminCaps.ts` is missing the new tab's cap |

---

## Quick reference — file map

### Backend

| File | Purpose |
|---|---|
| `backend/capabilities.py` | Capability registry + matcher + validator |
| `backend/routers/auth.py` | `require_capability`, role CRUD endpoints, `_caps_cache` |
| `backend/models/user.py` | `User.has_capability()`, `User.effective_capability_keys()` |
| `backend/models/role.py` | `Role`, `RoleCapability`, `user_roles` association |
| `backend/models/applied_migration.py` | Marker table for one-shot data migrations |
| `backend/database.py` | `SYSTEM_ROLES`, `seed_rbac`, `mark_migration_applied`, reconcile functions, `init_db` |

### Frontend

| File | Purpose |
|---|---|
| `app/src/contexts/AuthContext.tsx` | `can()` hook, cap refresh, token store |
| `app/src/lib/capabilities.ts` | Frontend matcher (mirrors backend) |
| `app/src/lib/adminCaps.ts` | `ADMIN_CAPABILITIES` + `hasAnyAdminCapability` |
| `app/src/lib/projectTabs.ts` | Project tab registry + per-tab access logic |
| `app/src/App.tsx` | Route guards: `RequireAnyAdminCapability`, `RequireProjectBoardRead` |
| `app/src/pages/AdminDashboard/AdminDashboard.tsx` | `PICKER_CATALOG`, tab plumbing, toggle helpers |
| `app/src/pages/AdminDashboard/modals/RoleModal.tsx` | Role editor UI with paired R/W checkboxes |

### Endpoint gating audit (current state)

Run `grep -rn 'require_capability(' backend/routers/` to get the live
mapping of every endpoint → capability. Useful when:
- Auditing whether a tab's reads + writes are covered
- Diagnosing a 403 ("which cap does this endpoint actually require?")
- Verifying the FE↔BE pair after adding a new feature
