"""Tests for the MCP OAuth identity path (Phase 2).

The OAuth flow (Claude Desktop, via fastmcp's GoogleProvider) hands the server a
verified Google *email* instead of an Ops user id. `load_or_provision_user_by_email`
maps that to an Ops `User` using the same policy as `google_login`. These cover
that resolver directly (deterministic, no live OAuth), plus a guard that OAuth
stays OFF in the test environment so the suite remains JWT-only.

The full browser OAuth handshake is verified manually against Claude Desktop —
it needs a Google-console redirect URI and can't be unit-tested here.
"""

from models.developer import Developer
from models.role import Role, RoleCapability
from models.user import User
from routers.auth import load_or_provision_user_by_email


def _seed_developer_role(db):
    """Create the system 'developer' role (seed_rbac is Postgres-only, so the
    in-memory SQLite test DB needs it created manually for provisioning to link)."""
    role = Role(name="developer", description="dev", is_system=True)
    db.add(role)
    db.flush()
    db.add(RoleCapability(role_id=role.id, capability_key="project.board"))
    db.commit()
    return role


def _make_user(db, email, *, active=True):
    u = User(
        email=email,
        name=email.split("@")[0],
        hashed_password="x",
        role="developer",
        is_active=active,
        is_first_login=False,
    )
    u.roles.append(db.query(Role).filter(Role.name == "developer").first())
    db.add(u)
    db.commit()
    return u


def test_existing_active_user_returned(db):
    _seed_developer_role(db)
    _make_user(db, "ada@arsenalai.com")
    res = load_or_provision_user_by_email(db, "ada@arsenalai.com")
    assert res is not None
    assert res.email == "ada@arsenalai.com"


def test_inactive_user_rejected(db):
    _seed_developer_role(db)
    _make_user(db, "ada@arsenalai.com", active=False)
    assert load_or_provision_user_by_email(db, "ada@arsenalai.com") is None


def test_unknown_internal_domain_provisioned(db):
    _seed_developer_role(db)
    res = load_or_provision_user_by_email(db, "newbie@arsenalai.com", "New Bie")
    assert res is not None
    assert res.email == "newbie@arsenalai.com"
    # Linked to the developer role, so RBAC works immediately.
    assert "project.board" in res.effective_capability_keys()
    # Developer row created (needed for capacity / membership features).
    assert db.query(Developer).filter(Developer.email == "newbie@arsenalai.com").first() is not None


def test_unknown_external_domain_rejected(db):
    _seed_developer_role(db)
    # External + not pre-registered -> rejected, and NOT provisioned.
    assert load_or_provision_user_by_email(db, "stranger@gmail.com") is None
    assert db.query(User).filter(User.email == "stranger@gmail.com").first() is None


def test_oauth_disabled_in_test_environment():
    """Guard: the suite must run JWT-only — OAuth must not auto-enable just
    because Google SSO creds are in the environment (it's gated on MCP_OAUTH_ENABLED)."""
    import mcp_server

    assert type(mcp_server._auth).__name__ == "JWTVerifier"
