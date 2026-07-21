"""Tests for the MCP server auth bridge (PR 1 foundation).

Covers the acceptance criteria for the foundation PR:
- `load_user_from_claims` / `assert_capability` helpers — the auth -> RBAC ->
  identity pieces the `whoami` tool composes (no change to REST behaviour).
- `/mcp` returns 401 without (or with an invalid) Bearer token.
- `whoami` returns the authenticated user's id / email / capabilities.
- Tool DB sessions are cleaned up — no connection leak from tool calls.
- The app refuses to start on an unset / legacy-default SECRET_KEY.

NOTE: MCP tools call `database.SessionLocal()` directly (outside FastAPI's
`Depends(get_db)` lifecycle), so the conftest `get_db` override does NOT reach
them. These tests build their own in-memory engine and monkeypatch
`mcp_server.SessionLocal` so the tools and the test see the same DB.
"""

import asyncio
import os
import subprocess
import sys
from datetime import timedelta
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
from main import app
from mcp_server import mcp_app
from models.role import Role, RoleCapability
from models.user import User
from routers.auth import assert_capability, create_access_token, load_user_from_claims

BACKEND_DIR = Path(__file__).resolve().parent.parent
LEGACY_DEFAULT_SECRET = "your-secret-key-change-in-production"


@pytest.fixture
def mcp_db(monkeypatch):
    """In-memory DB shared with the MCP tools via a monkeypatched SessionLocal.

    StaticPool keeps the single in-memory connection alive across the tool's
    own `SessionLocal()` calls. Returns the sessionmaker; the bound engine is
    reachable via `mcp_db.kw["bind"]` for pool assertions.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(
        autocommit=False, autoflush=False, bind=engine, expire_on_commit=False
    )
    monkeypatch.setattr("mcp_server.SessionLocal", test_session)
    return test_session


def _seed_user(
    session_factory,
    email: str = "dev@test.local",
    caps: tuple[str, ...] = ("project.pulse",),
    active: bool = True,
) -> int:
    """Create a User linked to a developer Role granting `caps`. Returns the id."""
    db = session_factory()
    try:
        role = Role(name="developer", description="dev", is_system=True)
        db.add(role)
        db.flush()
        for cap in caps:
            db.add(RoleCapability(role_id=role.id, capability_key=cap))
        user = User(
            email=email,
            name="Dev",
            hashed_password="x",
            role="developer",
            is_active=active,
            is_first_login=False,
        )
        user.roles.append(role)
        db.add(user)
        db.commit()
        return user.id
    finally:
        db.close()


def _token(user_id: int) -> str:
    return create_access_token(data={"sub": str(user_id)}, expires_delta=timedelta(minutes=60))


def _asgi_client_factory(
    headers: dict[str, str] | None = None,
    timeout: httpx.Timeout | None = None,
    auth: httpx.Auth | None = None,
    **kwargs,
) -> httpx.AsyncClient:
    """httpx client that routes MCP requests through the mounted app in-process.

    Leading params match mcp's ``McpHttpClientFactory`` protocol (headers,
    timeout, auth); `**kwargs` absorbs the extra `follow_redirects` that
    fastmcp's client also passes. follow_redirects is forced on regardless.
    """
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        headers=headers,
        auth=auth,
        follow_redirects=True,
    )


async def _call_tool(token: str, name: str, args: dict | None = None):
    """Call an MCP tool over the real HTTP+auth path (in-process via ASGI).

    Enters only `mcp_app.lifespan` so the stateless session manager's task group
    is initialized without triggering the app's DB-init startup. A ToolError
    raised by the tool is captured inside the lifespan and re-raised outside, so
    callers can `pytest.raises(...)` it without the lifespan task group wrapping
    it in an ExceptionGroup.
    """
    captured: dict = {}
    async with mcp_app.lifespan(mcp_app):
        transport = StreamableHttpTransport(
            url="http://testserver/mcp/", auth=token, httpx_client_factory=_asgi_client_factory
        )
        async with Client(transport) as client:
            try:
                captured["result"] = await client.call_tool(name, args or {})
            except Exception as exc:  # re-raised below, outside the lifespan task group
                captured["error"] = exc
    if "error" in captured:
        raise captured["error"]
    return captured["result"]


async def _raw_post(headers: dict) -> httpx.Response:
    """Raw POST to /mcp/ (bypasses the MCP client) to assert HTTP status codes."""
    body = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "1"},
        },
    }
    async with (
        mcp_app.lifespan(mcp_app),
        httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://testserver"
        ) as client,
    ):
        return await client.post("/mcp/", json=body, headers=headers)


# --------------------------------------------------------------------------- #
# Helper unit tests — the auth -> RBAC -> identity pipeline
# --------------------------------------------------------------------------- #


def test_load_user_from_claims_valid(mcp_db):
    uid = _seed_user(mcp_db)
    db = mcp_db()
    try:
        user = load_user_from_claims(db, {"sub": str(uid)})
        assert user is not None
        assert user.id == uid
        assert user.email == "dev@test.local"
    finally:
        db.close()


def test_load_user_from_claims_missing_sub(mcp_db):
    db = mcp_db()
    try:
        assert load_user_from_claims(db, {}) is None
    finally:
        db.close()


def test_load_user_from_claims_non_integer_sub(mcp_db):
    db = mcp_db()
    try:
        assert load_user_from_claims(db, {"sub": "not-an-int"}) is None
    finally:
        db.close()


def test_load_user_from_claims_unknown_user(mcp_db):
    db = mcp_db()
    try:
        assert load_user_from_claims(db, {"sub": "99999"}) is None
    finally:
        db.close()


def test_assert_capability_allows_and_denies(mcp_db):
    uid = _seed_user(mcp_db, caps=("project.pulse",))
    db = mcp_db()
    try:
        user = load_user_from_claims(db, {"sub": str(uid)})
        assert user is not None
        assert_capability(user, "project.pulse")  # held → no raise
        with pytest.raises(HTTPException) as exc:
            assert_capability(user, "admin.users")  # not held → 403
        assert exc.value.status_code == 403
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# HTTP integration — 401 gate + whoami identity
# --------------------------------------------------------------------------- #


def test_mcp_requires_token():
    """POST /mcp/ without a Bearer token is rejected with 401."""
    resp = asyncio.run(_raw_post({"Accept": "application/json, text/event-stream"}))
    assert resp.status_code == 401


def test_mcp_rejects_invalid_token():
    """A malformed/forged Bearer token is rejected with 401."""
    resp = asyncio.run(
        _raw_post(
            {
                "Accept": "application/json, text/event-stream",
                "Authorization": "Bearer not-a-real-jwt",
            }
        )
    )
    assert resp.status_code == 401


def test_whoami_returns_identity(mcp_db):
    """whoami returns the authenticated user's id, email, and capabilities."""
    uid = _seed_user(mcp_db, email="dev@test.local", caps=("project.pulse", "project.board"))
    result = asyncio.run(_call_tool(_token(uid), "whoami"))
    assert result.data["id"] == uid
    assert result.data["email"] == "dev@test.local"
    assert set(result.data["capabilities"]) == {"project.pulse", "project.board"}


def test_inactive_user_rejected_on_jwt_path(mcp_db):
    """A deactivated user's still-valid JWT is rejected at the tool layer.

    The JWT path resolves the user via load_user_from_claims, which (unlike the
    REST get_current_user) does not itself check is_active — _caller_session
    enforces it. Without that gate a deactivated employee would keep MCP access
    until token expiry.
    """
    uid = _seed_user(mcp_db, email="ex@test.local", active=False)
    with pytest.raises(Exception, match="inactive"):
        asyncio.run(_call_tool(_token(uid), "whoami"))


def test_whoami_closes_db_sessions(mcp_db):
    """Repeated tool calls return every checked-out connection (no pool leak).

    The tool opens `with SessionLocal() as db:`; if it leaked, pool checkouts
    would outnumber checkins. We assert they stay balanced across calls.
    """
    uid = _seed_user(mcp_db)
    engine = mcp_db.kw["bind"]
    counts = {"out": 0, "in": 0}
    event.listen(engine, "checkout", lambda *a: counts.__setitem__("out", counts["out"] + 1))
    event.listen(engine, "checkin", lambda *a: counts.__setitem__("in", counts["in"] + 1))
    for _ in range(3):
        asyncio.run(_call_tool(_token(uid), "whoami"))
    assert counts["out"] > 0
    assert counts["out"] == counts["in"]


# --------------------------------------------------------------------------- #
# Startup guard — SECRET_KEY must be set to a non-default value
# --------------------------------------------------------------------------- #


def _import_auth_with_env(env_overrides: dict) -> subprocess.CompletedProcess:
    """Import routers.auth in a clean subprocess with a controlled environment.

    routers.auth reads SECRET_KEY at import time (no load_dotenv of its own), so
    a clean env lets us assert the startup guard fires.
    """
    env = {"PATH": os.environ.get("PATH", "")}
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", "import routers.auth"],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
    )


def test_app_refuses_to_start_without_secret():
    result = _import_auth_with_env({})  # SECRET_KEY unset
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_app_refuses_legacy_default_secret():
    result = _import_auth_with_env({"SECRET_KEY": LEGACY_DEFAULT_SECRET})
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_app_starts_with_real_secret():
    result = _import_auth_with_env({"SECRET_KEY": "a-real-non-default-secret"})
    assert result.returncode == 0, result.stderr
