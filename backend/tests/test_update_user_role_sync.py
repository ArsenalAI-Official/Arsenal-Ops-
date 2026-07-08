"""``update_user_role`` must keep the RBAC ``user.roles`` m2m in sync.

With RBAC as the source of truth for authorization (``has_capability`` reads
``user.roles``, not the legacy ``users.role`` string), the admin endpoint that
changes a user's role must update *both*. Otherwise a promotion to admin would
set the legacy string but leave the user with stale capabilities — and the
startup reconcile skips users whose m2m is already non-empty, so the drift
would persist until manually corrected.

These tests pin both directions: promote grants caps, demote revokes them.
"""

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SYSTEM_ROLES
from models.role import Role, RoleCapability
from models.user import User
from routers.auth import RoleUpdate, update_user_role


def _seed_system_roles(db) -> None:
    for name, desc, caps in SYSTEM_ROLES:
        if db.query(Role).filter(Role.name == name).first():
            continue
        role = Role(name=name, description=desc, is_system=True)
        db.add(role)
        db.flush()
        for cap in caps:
            db.add(RoleCapability(role_id=role.id, capability_key=cap))
    db.commit()


def _make_user(db, email: str, role_str: str) -> User:
    """User whose legacy string AND m2m both reflect ``role_str``."""
    user = User(email=email, name=email.split("@")[0], role=role_str)
    db.add(user)
    db.flush()
    names = [n.strip() for n in role_str.split(",") if n.strip()]
    for role in db.query(Role).filter(Role.name.in_(names)).all():
        user.roles.append(role)
    db.commit()
    return user


def test_promote_to_admin_grants_admin_capability(db):
    _seed_system_roles(db)
    user = _make_user(db, "dev@x.com", "developer")
    assert not user.has_capability("admin.projects")  # sanity: starts non-admin

    update_user_role(user_id=user.id, role_data=RoleUpdate(role="admin"), admin=user, db=db)

    assert user.role == "admin"
    assert user.has_capability("admin.projects")  # caps now reflect the promotion


def test_demote_from_admin_revokes_admin_capability(db):
    _seed_system_roles(db)
    target = _make_user(db, "admin1@x.com", "admin")
    # A second admin so the "cannot remove the last admin" guard doesn't fire.
    _make_user(db, "admin2@x.com", "admin")
    assert target.has_capability("admin.projects")  # sanity: starts admin

    update_user_role(user_id=target.id, role_data=RoleUpdate(role="developer"), admin=target, db=db)

    assert target.role == "developer"
    assert not target.has_capability("admin.projects")  # admin caps revoked
    assert target.has_capability("project.tracker_write")  # developer caps present


def test_unknown_role_name_rejected(db):
    """A name that resolves to no known system role is rejected (no silent
    legacy-column write with zero capability change)."""
    _seed_system_roles(db)
    user = _make_user(db, "u@x.com", "developer")

    with pytest.raises(HTTPException) as exc:
        update_user_role(user_id=user.id, role_data=RoleUpdate(role="superuser"), admin=user, db=db)
    assert exc.value.status_code == 400
    assert user.role == "developer"  # unchanged
    assert not user.has_capability("admin.projects")


def test_empty_role_string_rejected(db):
    """An empty role string would strip every system role and leave the user
    with no capabilities — reject it rather than silently apply it."""
    _seed_system_roles(db)
    user = _make_user(db, "u2@x.com", "developer")

    with pytest.raises(HTTPException) as exc:
        update_user_role(user_id=user.id, role_data=RoleUpdate(role=""), admin=user, db=db)
    assert exc.value.status_code == 400
    assert user.role == "developer"  # unchanged


def test_legacy_column_canonicalized_from_resolved_roles(db):
    """The stored legacy string is derived from the resolved roles, not the raw
    request input (so the column and the m2m can't disagree)."""
    _seed_system_roles(db)
    user = _make_user(db, "u3@x.com", "developer")

    update_user_role(
        user_id=user.id, role_data=RoleUpdate(role="admin,developer"), admin=user, db=db
    )

    assert user.role == "admin,developer"  # sorted, canonical
    assert user.has_capability("admin.projects")
    assert user.has_capability("project.tracker_write")


def test_last_admin_demotion_still_blocked(db):
    """Regression guard: the existing last-admin protection must survive."""
    _seed_system_roles(db)
    only_admin = _make_user(db, "solo-admin@x.com", "admin")

    with pytest.raises(HTTPException) as exc:
        update_user_role(
            user_id=only_admin.id,
            role_data=RoleUpdate(role="developer"),
            admin=only_admin,
            db=db,
        )
    assert exc.value.status_code == 400
