"""Tests for the legacy users.role → user_roles m2m backfill.

Two surfaces are tested:

  • `_reconcile_user_roles_impl` — the startup backfill that fixes users
    historically created with only the legacy `users.role` string set.
  • `_link_roles_from_string` — the helper that wires new users to system
    Roles at creation time (Add User + SSO new-user paths).

The bug the fix addresses: `User.has_capability` reads from the m2m
`user.roles` relationship, NOT the legacy comma-string column. A user with
`users.role = "developer"` but zero `user_roles` rows holds zero effective
capabilities — even though the Roles tab shows the developer role granting
them.
"""

from __future__ import annotations

import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(__file__))

import models  # noqa: F401 — registers tables with Base.metadata
from database import Base, _reconcile_user_roles_impl

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    s = TestSession()
    try:
        yield s
    finally:
        s.close()


def _make_role(db, name: str, caps: list[str]) -> int:
    """Insert a Role + its capabilities; return the role id."""
    from models.role import Role, RoleCapability

    r = Role(name=name, description=f"test {name}", is_system=True)
    r.capabilities = [RoleCapability(capability_key=c) for c in caps]
    db.add(r)
    db.commit()
    db.refresh(r)
    return r.id


def _make_user(db, email: str, role_str: str | None):
    """Insert a User with the legacy `role` column set but no m2m links."""
    from models.user import User

    u = User(
        email=email,
        name=email.split("@")[0],
        hashed_password=None,
        role=role_str,
        is_active=True,
        is_first_login=False,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


# ============================================================
# _reconcile_user_roles_impl — startup backfill
# ============================================================


def test_reconcile_links_user_with_legacy_string_to_role(db):
    """A user with `role="developer"` and an empty user_roles set
    should end up linked to the developer Role after reconciliation."""
    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "alice@arsenalai.com", "developer")
    assert user.roles == []  # precondition

    fixed = _reconcile_user_roles_impl(db)
    db.commit()
    db.refresh(user)

    assert fixed == 1
    assert [r.name for r in user.roles] == ["developer"]
    # Capability lookup now works end-to-end.
    assert user.has_capability("project.create") is True


def test_reconcile_links_comma_separated_legacy_string(db):
    """`role="admin,developer"` should link to both Roles."""
    _make_role(db, "admin", ["*"])
    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "boss@arsenalai.com", "admin,developer")

    fixed = _reconcile_user_roles_impl(db)
    db.commit()
    db.refresh(user)

    assert fixed == 1
    assert sorted(r.name for r in user.roles) == ["admin", "developer"]


def test_reconcile_skips_already_linked_users(db):
    """A user already linked to ANY role is left alone — even on partial
    mismatch. This protects deliberate admin role adjustments."""
    admin_id = _make_role(db, "admin", ["*"])
    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "manager@arsenalai.com", "admin,developer")

    # Manually link admin only — developer is deliberately missing.
    from models.role import Role

    admin_role = db.query(Role).filter(Role.id == admin_id).first()
    user.roles.append(admin_role)
    db.commit()

    fixed = _reconcile_user_roles_impl(db)
    db.commit()
    db.refresh(user)

    # User is left alone — still only admin, not developer.
    assert fixed == 0
    assert [r.name for r in user.roles] == ["admin"]


def test_reconcile_drops_unknown_role_names(db):
    """Names in the legacy string that don't map to a Role are skipped;
    the user still gets linked for any names that DO match."""
    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "carol@arsenalai.com", "developer,ghost_role")

    fixed = _reconcile_user_roles_impl(db)
    db.commit()
    db.refresh(user)

    assert fixed == 1
    assert [r.name for r in user.roles] == ["developer"]


def test_reconcile_handles_empty_or_null_role_string(db):
    """Users with `role=NULL` or `role=""` are skipped (nothing to map).

    The User model has `default=UserRole.DEVELOPER.value` on the column,
    which fires when role is unset OR passed as None at construction.
    Force the column to NULL / "" via an explicit assignment after insert
    so we're testing the reconciliation behaviour, not the column default.
    """
    _make_role(db, "developer", ["project.create"])
    u1 = _make_user(db, "n@arsenalai.com", "developer")
    u1.role = None
    u2 = _make_user(db, "e@arsenalai.com", "developer")
    u2.role = ""
    db.commit()

    fixed = _reconcile_user_roles_impl(db)
    db.commit()
    db.refresh(u1)
    db.refresh(u2)

    assert fixed == 0
    assert u1.roles == []
    assert u2.roles == []


def test_reconcile_is_idempotent(db):
    """Running reconciliation twice should be a no-op the second time."""
    _make_role(db, "developer", ["project.create"])
    _make_user(db, "alice@arsenalai.com", "developer")

    first = _reconcile_user_roles_impl(db)
    db.commit()
    second = _reconcile_user_roles_impl(db)
    db.commit()

    assert first == 1
    assert second == 0


def test_reconcile_returns_zero_when_no_roles_seeded(db):
    """If the roles table is empty (e.g. seed_rbac hasn't run yet), the
    function exits cleanly without touching anything."""
    _make_user(db, "alice@arsenalai.com", "developer")

    fixed = _reconcile_user_roles_impl(db)
    db.commit()

    assert fixed == 0


# ============================================================
# _link_roles_from_string — creation-time helper
# ============================================================


def test_link_roles_from_string_attaches_known_roles(db):
    """Wiring a fresh user to the developer Role should populate the m2m
    and make has_capability work immediately."""
    from routers.auth import _link_roles_from_string

    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "fresh@arsenalai.com", "developer")
    # Detach from any auto-link to mimic the pre-fix state precisely
    user.roles = []
    db.commit()

    _link_roles_from_string(user, "developer", db)
    db.commit()
    db.refresh(user)

    assert [r.name for r in user.roles] == ["developer"]
    assert user.has_capability("project.create") is True


def test_link_roles_from_string_is_idempotent(db):
    """Calling the helper twice should NOT duplicate the m2m link."""
    from routers.auth import _link_roles_from_string

    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "twice@arsenalai.com", "developer")
    user.roles = []
    db.commit()

    _link_roles_from_string(user, "developer", db)
    _link_roles_from_string(user, "developer", db)
    db.commit()
    db.refresh(user)

    assert [r.name for r in user.roles] == ["developer"]


def test_link_roles_from_string_drops_unknown_names(db):
    """Unknown role names in the input string are silently skipped — the
    helper docstring promises this behaviour so the SSO/Add User paths
    don't blow up if seed_rbac hasn't created a system Role yet."""
    from routers.auth import _link_roles_from_string

    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "x@arsenalai.com", "developer,bogus")
    user.roles = []
    db.commit()

    _link_roles_from_string(user, "developer,bogus", db)
    db.commit()
    db.refresh(user)

    assert [r.name for r in user.roles] == ["developer"]


def test_link_roles_from_string_handles_empty_input(db):
    """Empty / whitespace / None inputs are no-ops."""
    from routers.auth import _link_roles_from_string

    _make_role(db, "developer", ["project.create"])
    user = _make_user(db, "blank@arsenalai.com", "")
    user.roles = []
    db.commit()

    for empty in (None, "", "   ", ",  ,"):
        _link_roles_from_string(user, empty, db)
    db.commit()
    db.refresh(user)

    assert user.roles == []


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
