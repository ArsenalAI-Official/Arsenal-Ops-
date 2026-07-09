"""
Capability Registry - Single source of truth for RBAC capability keys.

A capability key is a dotted string naming a gateable surface in the app, e.g.
"project.tracker.analytics". Roles grant a set of keys (possibly wildcards)
and a user's effective set is the union of their roles' grants.

Wildcard grants:
    "*"                          grants every capability (including future ones)
    "project.*"                  grants every "project" or "project.foo..." key
    "project.tracker.*"          grants every "project.tracker..." key
    "project.tracker.analytics"  exact match only
"""

from collections.abc import Iterable

CAPABILITIES: dict[str, str] = {
    # Project screens
    "project.overview.prd": "View PRD analysis section",
    "project.overview.architecture": "View architecture diagram section",
    "project.overview.team": "View team roster section",
    "project.overview.resources": "View resources / hub section",
    "project.tracker.sprints": "View active sprints",
    "project.tracker.analytics": "View tracker analytics",
    "project.calendar": "View timeline tab",
    "project.pulse": "View pulse tab",
    "project.pulse.settings": "Configure pulse metric settings (admin)",
    "project.activity": "View activity feed tab",
    "project.pm": "Access project manager tab",
    "project.pm.summary_cards": "View PM summary cards",
    "project.pm.developer_hours": "View PM developer hours summary",
    # Write-side capabilities. Intentionally NOT nested under a read group's
    # namespace (e.g. `project.tracker_write`, not `project.tracker.write`)
    # so the matching read wildcard (`project.tracker.*`) does not auto-grant
    # write access. Top-level under `project` means only `project.*` and `*`
    # sweep them in.
    "project.tracker_write": "Create, edit, and delete work items and sprints",
    "project.ai.write": "Use AI generators (PRD analyzer, roadmap parser)",
    # Overview-section write cap. Underscore (not dot) so the read wildcard
    # `project.overview.*` does NOT auto-cover this — the same pattern used
    # for `project.tracker_write`. System admins (`*`), PM (`project.*`),
    # and per-project admins always have access regardless of this cap;
    # see `is_project_admin` in routers/projects.py.
    "project.overview_write": (
        "Edit Overview content (project info, team membership, project-admin role)"
    ),
    "project.create": "Create new projects",
    "project.assign_personal_task": "Assign personal tasks to a project (convert to ticket)",
    "project.board": "Open and view the Project Board (kanban + sprints)",
    # Admin screens — each tab has a read cap (for GETs / viewing the tab)
    # and, where the tab has write actions, a paired *_write cap (for
    # POST/PUT/DELETE). The combined read-cap → both reads-and-writes
    # behaviour was retired; see `reconcile_admin_write_caps` in database.py
    # for the one-shot migration that preserves access for existing roles.
    "admin.dashboard": "View admin dashboard",
    "admin.employees": "View employees",
    "admin.employees_write": "Add, edit, and delete employees",
    "admin.projects": "View projects in admin",
    "admin.projects_write": "Edit project settings (e.g. GitHub) from admin",
    "admin.users": "View users",
    "admin.users_write": "Create, edit, delete users and assign roles",
    "admin.roles": "View roles and their capability grants",
    "admin.roles_write": "Create, edit, delete roles and modify their capabilities",
    "admin.time_entries": "View all time entries across projects",
    # Connects/disconnects external integrations (currently QuickBooks
    # Time / Workforce) and triggers manual syncs. Distinct from
    # `admin.projects_write` because the latter only grants per-project
    # metadata edits (e.g. linking a project to a QB Customer) — this cap
    # gates the org-wide OAuth credentials. Defaults to the `admin`
    # system role only via `*`.
    "admin.workforce_connect": "Connect, disconnect, and sync QuickBooks integration",
}


def matches(needed: str, grants: Iterable[str]) -> bool:
    """Return True if any grant in 'grants' covers the 'needed' capability key."""
    for grant in grants:
        if grant == "*" or grant == needed:
            return True
        if grant.endswith(".*"):
            prefix = grant[:-2]
            if needed == prefix or needed.startswith(prefix + "."):
                return True
    return False


def is_valid_grant(key: str) -> bool:
    """Validate that a grant key is either a known capability or a usable wildcard."""
    if not key or not isinstance(key, str):
        return False
    if key == "*":
        return True
    if key in CAPABILITIES:
        return True
    if key.endswith(".*"):
        prefix = key[:-2]
        if not prefix:
            return False
        return any(k == prefix or k.startswith(prefix + ".") for k in CAPABILITIES)
    return False
