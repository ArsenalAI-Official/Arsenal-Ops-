"""``has_project_access`` reads RBAC capabilities, not the legacy role string.

This is the read-side counterpart to ``is_project_admin``: with RBAC the
single source of truth for "system admin", the project read gate must stop
trusting the legacy comma-separated ``users.role`` column. Access is granted
to holders of the ``admin.projects`` capability (system admins via ``*``) or
to developers assigned to the project — nothing else.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.role import Role, RoleCapability
from models.user import User
from routers.projects import has_project_access
from tests.conftest import seed_project


def _user_with_caps(db, email: str, caps: list[str], role: str = "developer") -> User:
    user = User(email=email, name=email.split("@")[0], role=role)
    db.add(user)
    db.flush()
    if caps:
        r = Role(name=f"role-for-{email}", description="test", is_system=False)
        db.add(r)
        db.flush()
        for cap in caps:
            db.add(RoleCapability(role_id=r.id, capability_key=cap))
        user.roles.append(r)
    db.commit()
    return user


def test_legacy_admin_string_alone_is_denied(db):
    """`role="admin"` with no RBAC role no longer grants access."""
    project = seed_project(db, "Legacy Admin", num_developers=1)
    user = _user_with_caps(db, "legacy-admin@x.com", [], role="admin")

    assert has_project_access(project, user) is False


def test_admin_projects_capability_grants_access(db):
    project = seed_project(db, "Cap Admin", num_developers=1)
    user = _user_with_caps(db, "cap-admin@x.com", ["admin.projects"])

    assert has_project_access(project, user) is True


def test_system_admin_wildcard_grants_access(db):
    project = seed_project(db, "Wildcard Admin", num_developers=1)
    user = _user_with_caps(db, "wildcard@x.com", ["*"])

    assert has_project_access(project, user) is True


def test_overview_write_capability_grants_read_access(db):
    """`project.overview_write` grants the WRITE gate (is_project_admin); the
    READ gate must grant it too so there is no write-without-read."""
    project = seed_project(db, "Overview Write", num_developers=1)
    user = _user_with_caps(db, "overview-writer@x.com", ["project.overview_write"])

    assert has_project_access(project, user) is True


def test_assigned_developer_has_access(db):
    """A developer assigned to the project keeps read access (unchanged)."""
    project = seed_project(db, "Assigned Dev", num_developers=1)
    assigned_email = project.developers[0].email
    user = _user_with_caps(db, assigned_email, [])

    assert has_project_access(project, user) is True


def test_unrelated_user_denied(db):
    project = seed_project(db, "Unrelated", num_developers=1)
    user = _user_with_caps(db, "nobody@x.com", [])

    assert has_project_access(project, user) is False
