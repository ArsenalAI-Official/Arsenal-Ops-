"""End-to-end round-trip test for the MCP server (read + write together).

The per-tool behavior is covered in test_mcp_auth / test_mcp_read_tools /
test_mcp_write_tools. This walks a realistic agent flow over the real HTTP+auth
path to prove the read and write tools compose: create an item, see it through
the read tools, transition + log hours through the write tools, read the changes
back, and confirm the audit trail.
"""

import asyncio
from datetime import datetime, timedelta

import httpx
import pytest
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base
from main import app
from mcp_server import mcp_app
from models.activity_log import ActivityLog
from models.developer import Developer, project_developers
from models.project import Project
from models.role import Role, RoleCapability
from models.user import User
from routers.auth import create_access_token


@pytest.fixture
def mcp_db(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    test_session = sessionmaker(
        autocommit=False, autoflush=False, bind=engine, expire_on_commit=False
    )
    monkeypatch.setattr("mcp_server.SessionLocal", test_session)
    return test_session


def _asgi_client_factory(headers=None, timeout=None, auth=None, **kwargs):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        headers=headers,
        auth=auth,
        follow_redirects=True,
    )


async def _call_tool(token, name, args=None):
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


def call(token, name, args=None):
    return asyncio.run(_call_tool(token, name, args)).data


def _audit(session_factory, item_id: int):
    db = session_factory()
    try:
        return (
            db.query(ActivityLog)
            .filter(ActivityLog.entity_type == "work_item", ActivityLog.entity_id == item_id)
            .all()
        )
    finally:
        db.close()


@pytest.fixture
def world(mcp_db):
    """Seed alice: a developer with project.tracker_write, a developer profile,
    and membership in project P1 (so she can read, write, and log hours)."""
    db = mcp_db()
    try:
        dev_role = Role(name="developer", description="dev", is_system=True)
        db.add(dev_role)
        db.flush()
        for cap in ("project.board", "project.pulse", "project.tracker_write"):
            db.add(RoleCapability(role_id=dev_role.id, capability_key=cap))

        alice_dev = Developer(name="Alice", email="alice@test.local")
        db.add(alice_dev)
        db.flush()

        alice = User(
            email="alice@test.local",
            name="Alice",
            hashed_password="x",
            role="developer",
            is_active=True,
            is_first_login=False,
        )
        alice.roles.append(dev_role)
        db.add(alice)
        db.flush()

        p1 = Project(
            name="P1",
            description="d",
            status="active",
            github_repo_urls=[],
            created_at=datetime.utcnow(),
        )
        db.add(p1)
        db.flush()
        db.execute(
            project_developers.insert().values(
                project_id=p1.id,
                developer_id=alice_dev.id,
                role="Lead",
                responsibilities=None,
                is_admin=True,
            )
        )
        db.commit()
        return {
            "token": create_access_token(
                data={"sub": str(alice.id)}, expires_delta=timedelta(minutes=60)
            ),
            "p1": p1.id,
            "alice_dev": alice_dev.id,
        }
    finally:
        db.close()


def test_full_read_write_roundtrip(world, mcp_db):
    t, pid, dev_id = world["token"], world["p1"], world["alice_dev"]

    # READ: the project is visible to the caller.
    projects = call(t, "projects_list")
    assert any(p["id"] == pid for p in projects)

    # WRITE: create a work item assigned to the caller.
    created = call(
        t,
        "workitem_create",
        {
            "project_id": pid,
            "title": "Round-trip task",
            "assignee_id": dev_id,
            "estimated_hours": 6,
        },
    )
    new_id = int(created["id"])
    assert created["status"] == "todo"

    # READ: it shows up in search and get.
    items = call(t, "workitems_search", {"project_id": pid})
    assert any(int(i["id"]) == new_id for i in items)
    got = call(t, "workitem_get", {"item_id": new_id})
    assert got["title"] == "Round-trip task"
    assert got["assignee_id"] == dev_id

    # WRITE: move it to in_progress, then log hours against it (caller is assignee).
    updated = call(t, "workitem_update", {"item_id": new_id, "status": "in_progress"})
    assert updated["status"] == "in_progress"
    logged = call(t, "workitem_log_hours", {"item_id": new_id, "hours": 4})
    assert logged["logged_hours"] == 4

    # READ: the changes are reflected when reading the item back.
    final = call(t, "workitem_get", {"item_id": new_id})
    assert final["status"] == "in_progress"
    assert final["logged_hours"] == 4
    assert final["remaining_hours"] == 2  # 6 estimated - 4 logged

    # AUDIT: the writes left a trail.
    actions = {r.action for r in _audit(mcp_db, new_id)}
    assert "created" in actions
    assert "logged_hours" in actions

    # READ: capacity reflects the caller's in-progress assigned work.
    cap = call(t, "my_capacity")
    assert cap["developer_email"] == "alice@test.local"
    assert cap["this_week_capacity_used"] >= 1
