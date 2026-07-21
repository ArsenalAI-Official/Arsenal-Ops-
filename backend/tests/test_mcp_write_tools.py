"""Tests for the MCP write tools (PR 3).

Covers the acceptance criteria:
- Each write respects `project.tracker_write` (403 without it) and per-project
  access (403 without it), surfaced as MCP ToolErrors.
- Happy path for create / update (status + field edit) / log-hours.
- Every write leaves an activity_log audit row.

Same harness as the read-tool tests: own in-memory engine, monkeypatched
mcp_server.SessionLocal, tools driven over the real HTTP+auth path in-process.

Seeded world (all assigned to project P1 unless noted):
- alice: dev role (project.tracker_write) + assignee of the seeded work item.
- dave:  dev role (tracker_write) but NOT the assignee.
- carol: limited role (project.board only — no tracker_write).
- bob:   dev role but assigned to NO project (no access).
"""

import asyncio
from datetime import datetime, timedelta

import httpx
import pytest
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.exceptions import ToolError
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
from models.work_item import WorkItem
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


def _token(user_id: int) -> str:
    return create_access_token(data={"sub": str(user_id)}, expires_delta=timedelta(minutes=60))


def _audit(session_factory, item_id: int) -> list[ActivityLog]:
    db = session_factory()
    try:
        return (
            db.query(ActivityLog)
            .filter(ActivityLog.entity_type == "work_item", ActivityLog.entity_id == item_id)
            .all()
        )
    finally:
        db.close()


def _link(db, project_id, developer_id):
    db.execute(
        project_developers.insert().values(
            project_id=project_id,
            developer_id=developer_id,
            role="Developer",
            responsibilities=None,
            is_admin=False,
        )
    )


@pytest.fixture
def world(mcp_db):
    db = mcp_db()
    try:
        dev_role = Role(name="developer", description="dev", is_system=True)
        limited_role = Role(name="limited", description="board only", is_system=False)
        db.add_all([dev_role, limited_role])
        db.flush()
        for cap in ("project.board", "project.pulse", "project.tracker_write"):
            db.add(RoleCapability(role_id=dev_role.id, capability_key=cap))
        db.add(RoleCapability(role_id=limited_role.id, capability_key="project.board"))

        alice_dev = Developer(name="Alice", email="alice@test.local")
        dave_dev = Developer(name="Dave", email="dave@test.local")
        carol_dev = Developer(name="Carol", email="carol@test.local")
        db.add_all([alice_dev, dave_dev, carol_dev])
        db.flush()

        def _user(email, role_name, role_obj):
            u = User(
                email=email,
                name=email.split("@")[0].title(),
                hashed_password="x",
                role=role_name,
                is_active=True,
                is_first_login=False,
            )
            u.roles.append(role_obj)
            db.add(u)
            return u

        alice = _user("alice@test.local", "developer", dev_role)
        dave = _user("dave@test.local", "developer", dev_role)
        carol = _user("carol@test.local", "limited", limited_role)
        bob = _user("bob@test.local", "developer", dev_role)
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
        for d in (alice_dev, dave_dev, carol_dev):
            _link(db, p1.id, d.id)

        wi = WorkItem(
            project_id=p1.id,
            key="P1-1",
            title="Set up CI",
            type="task",
            status="in_progress",
            assignee_id=alice_dev.id,
            estimated_hours=8,
        )
        db.add(wi)
        db.commit()

        return {
            "alice": _token(alice.id),
            "dave": _token(dave.id),
            "carol": _token(carol.id),
            "bob": _token(bob.id),
            "p1": p1.id,
            "wi": wi.id,
        }
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# create
# --------------------------------------------------------------------------- #


def test_create_happy_path_and_audit(world, mcp_db):
    res = call(world["alice"], "workitem_create", {"project_id": world["p1"], "title": "New task"})
    assert res["title"] == "New task"
    assert res["status"] == "todo"
    rows = _audit(mcp_db, int(res["id"]))
    assert any(r.action == "created" for r in rows)


def test_create_returns_work_item_link(world):
    """Created work items come back with a clickable deep link to the ticket."""
    res = call(world["alice"], "workitem_create", {"project_id": world["p1"], "title": "Linked"})
    assert res["url"].endswith(f"/project/{world['p1']}/board/{res['id']}")


def test_create_denied_without_capability(world):
    with pytest.raises(ToolError):  # carol has project access but no tracker_write
        call(world["carol"], "workitem_create", {"project_id": world["p1"], "title": "Nope"})


def test_create_denied_without_project_access(world):
    with pytest.raises(ToolError):  # bob has tracker_write but isn't on the project
        call(world["bob"], "workitem_create", {"project_id": world["p1"], "title": "Nope"})


# --------------------------------------------------------------------------- #
# update (status + field edit)
# --------------------------------------------------------------------------- #


def test_update_status_is_audited(world, mcp_db):
    res = call(world["alice"], "workitem_update", {"item_id": world["wi"], "status": "done"})
    assert res["status"] == "done"
    rows = _audit(mcp_db, world["wi"])
    assert any(r.action in ("completed", "updated") for r in rows)


def test_update_field_only_is_audited(world, mcp_db):
    res = call(world["alice"], "workitem_update", {"item_id": world["wi"], "title": "Renamed"})
    assert res["title"] == "Renamed"
    # A field-only edit does not self-audit in the reused endpoint — the tool backfills.
    rows = _audit(mcp_db, world["wi"])
    assert any(r.action == "updated" for r in rows)


def test_update_requires_fields(world):
    with pytest.raises(ToolError):
        call(world["alice"], "workitem_update", {"item_id": world["wi"]})


def test_update_denied_without_capability(world):
    with pytest.raises(ToolError):
        call(world["carol"], "workitem_update", {"item_id": world["wi"], "status": "done"})


def test_update_denied_without_project_access(world):
    with pytest.raises(ToolError):
        call(world["bob"], "workitem_update", {"item_id": world["wi"], "status": "done"})


# --------------------------------------------------------------------------- #
# log hours
# --------------------------------------------------------------------------- #


def test_log_hours_happy_path_and_audit(world, mcp_db):
    res = call(world["alice"], "workitem_log_hours", {"item_id": world["wi"], "hours": 3})
    assert res["logged_hours"] == 3
    rows = _audit(mcp_db, world["wi"])
    assert any(r.action == "logged_hours" for r in rows)


def test_log_hours_denied_for_non_assignee(world):
    # dave has tracker_write + project access but is not the ticket's assignee.
    with pytest.raises(ToolError):
        call(world["dave"], "workitem_log_hours", {"item_id": world["wi"], "hours": 2})


def test_log_hours_denied_without_capability(world):
    with pytest.raises(ToolError):
        call(world["carol"], "workitem_log_hours", {"item_id": world["wi"], "hours": 2})
