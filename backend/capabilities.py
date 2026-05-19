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
    "project.calendar": "View calendar / timeline tab",
    "project.pulse": "View pulse tab",
    "project.pulse.settings": "Configure pulse metric settings (admin)",
    "project.business": "View business review tab",
    "project.activity": "View activity feed tab",
    "project.pm": "Access project manager tab",
    "project.pm.summary_cards": "View PM summary cards",
    "project.pm.weekly_hours": "View PM weekly hours breakdown",
    "project.pm.developer_hours": "View PM developer hours summary",
    # Admin screens
    "admin.dashboard": "Access admin dashboard",
    "admin.employees": "Manage employees",
    "admin.projects": "Manage projects from admin",
    "admin.users": "Manage users and role assignments",
    "admin.developers_capacity": "View developers capacity",
    "admin.restrictions": "Manage legacy custom restrictions",
    "admin.roles": "Manage roles and capability grants",
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
