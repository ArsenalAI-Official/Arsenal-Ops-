"""`list_projects` must scope "admin sees all" on the RBAC capability, not the
legacy `users.role` string — consistent with `has_project_access` /
`is_project_admin`, so the list gate and the per-project access gate agree.

Two divergence cases this pins:
- RBAC admin whose legacy string drifted (no "admin" substring) must still see
  every project (the list gate must not under-report reach).
- A legacy `role="admin"` user with no RBAC capability must NOT see projects
  they're 403'd from opening (the list gate must not over-disclose).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.developer import Developer, project_developers
from models.role import Role, RoleCapability
from models.user import User
from routers.projects import list_projects
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


def _assign_user_to_project(db, project, email: str) -> None:
    dev = Developer(email=email, name=email.split("@")[0])
    db.add(dev)
    db.commit()
    db.execute(
        project_developers.insert().values(
            project_id=project.id, developer_id=dev.id, role="developer", is_admin=False
        )
    )
    db.commit()


def _ids(result) -> set[int]:
    return {p["id"] for p in result}


def test_rbac_admin_sees_all_projects(db):
    """admin.projects capability → sees every project, even with no membership
    and a legacy role string that does NOT contain "admin"."""
    p1 = seed_project(db, "P1", num_developers=1)
    p2 = seed_project(db, "P2", num_developers=1)
    admin = _user_with_caps(db, "rbac-admin@x.com", ["admin.projects"], role="developer")

    result = list_projects(db=db, current_user=admin)

    assert _ids(result) >= {p1.id, p2.id}


def test_legacy_role_string_admin_without_cap_sees_only_assigned(db):
    """`role="admin"` with no RBAC capability is scoped like a developer — it
    must NOT list projects it cannot open."""
    seed_project(db, "P1", num_developers=1)
    seed_project(db, "P2", num_developers=1)
    legacy = _user_with_caps(db, "legacy-admin@x.com", [], role="admin")

    result = list_projects(db=db, current_user=legacy)

    assert _ids(result) == set()


def test_assigned_developer_sees_only_their_projects(db):
    p1 = seed_project(db, "P1", num_developers=1)
    seed_project(db, "P2", num_developers=1)
    dev = _user_with_caps(db, "dev@x.com", [])
    _assign_user_to_project(db, p1, "dev@x.com")

    result = list_projects(db=db, current_user=dev)

    assert _ids(result) == {p1.id}
