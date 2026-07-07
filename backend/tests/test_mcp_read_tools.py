"""Tests for the MCP read tools (PR 2).

Covers the acceptance criteria:
- Each tool returns data scoped to the caller's RBAC + per-project access.
- A user without project access or the relevant capability gets a 403 (surfaced
  as an MCP ToolError), never data they cannot see in the UI.
- Tool output shape matches the reused REST read logic.
- Basic limit/offset on list tools.

Like test_mcp_auth.py, MCP tools call database.SessionLocal() directly, so we
build our own in-memory engine, monkeypatch mcp_server.SessionLocal, seed a
small world, and drive the tools over the real HTTP+auth path in-process.

Seeded world:
- Projects P1 and P2.
- alice: developer assigned to P1 (role: project.board + project.pulse).
- carol: developer assigned to P1 (role: project.board only — no pulse).
- bob:   developer assigned to NO project.
- admin: wildcard "*" capability, no developer profile.
- Work items: two in P1 (one todo, one in_progress assigned to alice).
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
from models.developer import Developer, project_developers
from models.project import Project
from models.role import Role, RoleCapability
from models.user import User
from models.work_item import WorkItem
from routers.auth import create_access_token


@pytest.fixture
def mcp_db(monkeypatch):
    """In-memory DB shared with the MCP tools via a monkeypatched SessionLocal."""
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


def _asgi_client_factory(headers=None, timeout=None, auth=None, **kwargs):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
        headers=headers,
        auth=auth,
        follow_redirects=True,
    )


async def _call_tool(token: str, name: str, args: dict | None = None):
    # A ToolError raised by call_tool would otherwise propagate out through
    # mcp_app.lifespan's anyio task group and get wrapped in an ExceptionGroup.
    # Capture it inside the lifespan and re-raise the bare exception afterwards
    # so tests can assert on ToolError directly.
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


def call(token: str, name: str, args: dict | None = None):
    """Sync wrapper returning the tool's structured `.data`."""
    return asyncio.run(_call_tool(token, name, args)).data


def _token(user_id: int) -> str:
    return create_access_token(data={"sub": str(user_id)}, expires_delta=timedelta(minutes=60))


def _link_dev_to_project(db, project_id: int, developer_id: int) -> None:
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
    """Seed the world described in the module docstring; return a dict of
    tokens + ids the tests assert against.
    """
    db = mcp_db()
    try:
        # Roles
        admin_role = Role(name="admin", description="admin", is_system=True)
        dev_role = Role(name="developer", description="dev", is_system=True)
        limited_role = Role(name="limited", description="board only", is_system=False)
        nocaps_role = Role(name="nocaps", description="no capabilities", is_system=False)
        db.add_all([admin_role, dev_role, limited_role, nocaps_role])
        db.flush()
        db.add(RoleCapability(role_id=admin_role.id, capability_key="*"))
        for cap in ("project.board", "project.pulse"):
            db.add(RoleCapability(role_id=dev_role.id, capability_key=cap))
        db.add(RoleCapability(role_id=limited_role.id, capability_key="project.board"))

        # Developers (email links a Developer to a User for per-project access)
        alice_dev = Developer(name="Alice", email="alice@test.local", github_username="alice")
        carol_dev = Developer(name="Carol", email="carol@test.local", github_username="carol")
        bob_dev = Developer(name="Bob", email="bob@test.local", github_username="bob")
        db.add_all([alice_dev, carol_dev, bob_dev])
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

        admin_u = _user("admin@test.local", "admin", admin_role)
        alice_u = _user("alice@test.local", "developer", dev_role)
        carol_u = _user("carol@test.local", "limited", limited_role)
        bob_u = _user("bob@test.local", "developer", dev_role)
        nocaps_u = _user("nocaps@test.local", "nocaps", nocaps_role)
        db.flush()

        # Projects
        p1 = Project(
            name="P1",
            description="d",
            status="active",
            github_repo_urls=[],
            created_at=datetime.utcnow(),
        )
        p2 = Project(
            name="P2",
            description="d",
            status="active",
            github_repo_urls=[],
            created_at=datetime.utcnow(),
        )
        db.add_all([p1, p2])
        db.flush()

        # alice + carol on P1; bob on nothing
        _link_dev_to_project(db, p1.id, alice_dev.id)
        _link_dev_to_project(db, p1.id, carol_dev.id)

        # Work items in P1
        wi1 = WorkItem(project_id=p1.id, key="P1-1", title="Task one", type="task", status="todo")
        wi2 = WorkItem(
            project_id=p1.id,
            key="P1-2",
            title="Task two",
            type="bug",
            status="in_progress",
            assignee_id=alice_dev.id,
        )
        db.add_all([wi1, wi2])
        db.commit()

        return {
            "admin": _token(admin_u.id),
            "alice": _token(alice_u.id),
            "carol": _token(carol_u.id),
            "bob": _token(bob_u.id),
            "nocaps": _token(nocaps_u.id),
            "p1": p1.id,
            "p2": p2.id,
            "wi1": wi1.id,
            "wi2": wi2.id,
            "alice_dev": alice_dev.id,
        }
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# projects_list / project_get
# --------------------------------------------------------------------------- #


def test_projects_list_scoping(world):
    admin_projects = call(world["admin"], "projects_list")
    assert {p["name"] for p in admin_projects} == {"P1", "P2"}  # admin sees all

    alice_projects = call(world["alice"], "projects_list")
    assert [p["name"] for p in alice_projects] == ["P1"]  # only assigned

    bob_projects = call(world["bob"], "projects_list")
    assert bob_projects == []  # assigned to nothing


def test_projects_list_limit_offset(world):
    first = call(world["admin"], "projects_list", {"limit": 1, "offset": 0})
    second = call(world["admin"], "projects_list", {"limit": 1, "offset": 1})
    assert len(first) == 1
    assert len(second) == 1
    assert first[0]["id"] != second[0]["id"]


def test_project_get_shape_and_access(world):
    proj = call(world["alice"], "project_get", {"project_id": world["p1"]})
    # Shape parity with the reused format_project serializer.
    assert proj["id"] == world["p1"]
    assert proj["name"] == "P1"
    assert "work_item_stats" in proj
    assert "developers" in proj


def test_project_get_denied_without_access(world):
    with pytest.raises(ToolError):
        call(world["bob"], "project_get", {"project_id": world["p1"]})


# --------------------------------------------------------------------------- #
# workitems_search / workitem_get
# --------------------------------------------------------------------------- #


def test_workitems_search_returns_scoped_items(world):
    items = call(world["alice"], "workitems_search", {"project_id": world["p1"]})
    assert {i["key"] for i in items} == {"P1-1", "P1-2"}
    # Shape parity with the reused list serializer.
    assert {"id", "key", "title", "status", "assignee", "sprint"} <= set(items[0])


def test_workitems_search_status_filter(world):
    items = call(
        world["alice"], "workitems_search", {"project_id": world["p1"], "status": "in_progress"}
    )
    assert [i["key"] for i in items] == ["P1-2"]


def test_workitems_search_limit(world):
    items = call(world["alice"], "workitems_search", {"project_id": world["p1"], "limit": 1})
    assert len(items) == 1


def test_workitems_search_denied_without_access(world):
    with pytest.raises(ToolError):
        call(world["bob"], "workitems_search", {"project_id": world["p1"]})


def test_workitem_get_and_access(world):
    item = call(world["alice"], "workitem_get", {"item_id": world["wi1"]})
    assert item["id"] == world["wi1"]
    assert item["project_id"] == world["p1"]
    assert "assignee_name" in item  # REST detail augmentation preserved

    with pytest.raises(ToolError):
        call(world["bob"], "workitem_get", {"item_id": world["wi1"]})


def test_workitem_get_no_access_indistinguishable_from_missing(world):
    """Enumeration oracle closed: an item in a project the caller can't access
    and a non-existent id both return the same "not found" — bob can't tell which
    ids exist in P1 (he has project.board but no access to P1).
    """
    with pytest.raises(ToolError, match="not found"):
        call(world["bob"], "workitem_get", {"item_id": world["wi1"]})  # exists, no access
    with pytest.raises(ToolError, match="not found"):
        call(world["bob"], "workitem_get", {"item_id": 999999})  # genuinely missing


# --------------------------------------------------------------------------- #
# pulse_get — capability gate
# --------------------------------------------------------------------------- #


def test_pulse_get_with_capability(world):
    pulse = call(world["alice"], "pulse_get", {"project_id": world["p1"]})
    assert {"project", "summary", "months", "_meta"} <= set(pulse)


def test_pulse_get_denied_without_capability(world):
    # carol is assigned to P1 (has access) but her role lacks project.pulse.
    with pytest.raises(ToolError):
        call(world["carol"], "pulse_get", {"project_id": world["p1"]})


def test_pulse_get_denied_without_access(world):
    with pytest.raises(ToolError):
        call(world["bob"], "pulse_get", {"project_id": world["p1"]})


# --------------------------------------------------------------------------- #
# developers / capacity
# --------------------------------------------------------------------------- #


def test_developers_list(world):
    devs = call(world["alice"], "developers_list")
    emails = {d["email"] for d in devs}
    assert {"alice@test.local", "bob@test.local", "carol@test.local"} <= emails
    assert {"id", "name", "email", "github_username"} <= set(devs[0])


def test_developers_list_requires_capability(world):
    # nocaps has a valid token but no project.board → the roster (incl. emails)
    # is not exposed (e.g. a freshly auto-provisioned OAuth identity with no caps).
    with pytest.raises(ToolError):
        call(world["nocaps"], "developers_list")


def test_my_capacity_for_developer(world):
    cap = call(world["alice"], "my_capacity")
    assert cap["developer_email"] == "alice@test.local"
    assert "this_week_capacity_used" in cap
    assert "week_start" in cap


def test_my_capacity_without_developer_profile(world):
    # admin has no Developer row → 404 surfaced as ToolError.
    with pytest.raises(ToolError):
        call(world["admin"], "my_capacity")


def test_developer_capacity_requires_admin_cap(world):
    cap = call(world["admin"], "developer_capacity", {"developer_id": world["alice_dev"]})
    assert cap["developer_id"] == world["alice_dev"]
    assert "this_week_capacity_used" in cap

    # alice lacks admin.employees → denied.
    with pytest.raises(ToolError):
        call(world["alice"], "developer_capacity", {"developer_id": world["alice_dev"]})


# --------------------------------------------------------------------------- #
# sprints_list / sprint_get / weekly_report  (gap-filling tools)
# --------------------------------------------------------------------------- #


@pytest.fixture
def sprint_world(world, mcp_db):
    """Extend `world` with sprints, a login-titled item, and a this-week time
    entry — kept in a separate fixture so the exact-count assertions on `world`
    stay intact.
    """
    from datetime import timedelta

    from models.sprint import Sprint, SprintStatus
    from models.time_entry import TimeEntry
    from services.capacity_service import week_boundaries

    db = mcp_db()
    try:
        ws, _we = week_boundaries()
        # Active sprint in P1 whose window contains today.
        s_active = Sprint(
            project_id=world["p1"],
            name="P1 Sprint A",
            goal="ship checkout",
            status=SprintStatus.ACTIVE.value,
            start_date=ws - timedelta(days=2),
            end_date=ws + timedelta(days=10),
            capacity_hours=40,
        )
        # Future planning sprint — must NOT read as active.
        s_future = Sprint(
            project_id=world["p1"],
            name="P1 Sprint B",
            goal="later",
            status=SprintStatus.PLANNING.value,
            start_date=ws + timedelta(days=20),
            end_date=ws + timedelta(days=34),
            capacity_hours=40,
        )
        db.add_all([s_active, s_future])
        db.flush()

        # A done, story-pointed, login-titled item in the active sprint (feeds
        # both sprint progress and the search-by-"login" test).
        login_item = WorkItem(
            project_id=world["p1"],
            key="P1-3",
            title="Fix login redirect bug",
            type="bug",
            status="done",
            sprint_id=s_active.id,
            story_points=5,
            assignee_id=world["alice_dev"],
        )
        db.add(login_item)
        db.flush()

        # Alice logs 6h this week on P1-2 → weekly_report has something to sum.
        db.add(
            TimeEntry(
                work_item_id=world["wi2"],
                developer_id=world["alice_dev"],
                hours=6,
                description="work",
                logged_at=ws + timedelta(days=1),
            )
        )
        db.commit()
        return {**world, "sprint_active": s_active.id, "sprint_future": s_future.id,
                "login_item": login_item.id}
    finally:
        db.close()


def test_sprints_list_active_across_projects(sprint_world):
    # No project_id → every accessible project; status="active" uses computed status.
    active = call(sprint_world["admin"], "sprints_list", {"status": "active"})
    assert [s["name"] for s in active] == ["P1 Sprint A"]  # future planning sprint excluded
    s = active[0]
    assert s["project_id"] == sprint_world["p1"]
    assert s["project_name"] == "P1"
    # progress rollup present, and the done story-pointed item counts.
    assert s["done_count"] == 1
    assert s["completed_points"] == 5
    assert {"completion_pct", "total_items", "start_date", "end_date"} <= set(s)


def test_sprints_list_scoped_to_access(sprint_world):
    # alice (P1 only) sees P1 sprints; bob (no projects) sees none.
    alice = call(sprint_world["alice"], "sprints_list")
    assert {s["name"] for s in alice} == {"P1 Sprint A", "P1 Sprint B"}
    assert call(sprint_world["bob"], "sprints_list") == []


def test_sprints_list_requires_board_capability(sprint_world):
    with pytest.raises(ToolError):
        call(sprint_world["nocaps"], "sprints_list")


def test_sprint_get_shape_items_and_access(sprint_world):
    got = call(sprint_world["alice"], "sprint_get", {"sprint_id": sprint_world["sprint_active"]})
    assert got["name"] == "P1 Sprint A"
    assert got["status"] == "active"
    assert got["goal"] == "ship checkout"
    assert "P1-3" in {i["key"] for i in got["items"]}


def test_sprint_get_no_access_indistinguishable_from_missing(sprint_world):
    with pytest.raises(ToolError, match="not found"):
        call(sprint_world["bob"], "sprint_get", {"sprint_id": sprint_world["sprint_active"]})
    with pytest.raises(ToolError, match="not found"):
        call(sprint_world["bob"], "sprint_get", {"sprint_id": 999999})


def test_workitems_search_query_matches_title(sprint_world):
    items = call(
        sprint_world["alice"],
        "workitems_search",
        {"project_id": sprint_world["p1"], "query": "login"},
    )
    assert {i["key"] for i in items} == {"P1-3"}  # only the login-titled item


def test_weekly_report_project_scoped(sprint_world):
    rep = call(sprint_world["alice"], "weekly_report", {"project_id": sprint_world["p1"]})
    assert rep["project_id"] == sprint_world["p1"]
    assert rep["team_total_hours"] == 6
    assert rep["by_developer"][0]["developer_name"] == "Alice"
    assert rep["by_developer"][0]["total_hours"] == 6


def test_weekly_report_teamwide_requires_admin_cap(sprint_world):
    # Team-wide (no project_id) needs admin.employees.
    admin_rep = call(sprint_world["admin"], "weekly_report")
    assert admin_rep["project_id"] is None
    assert admin_rep["team_total_hours"] == 6
    # alice has project.board/pulse but not admin.employees → denied.
    with pytest.raises(ToolError):
        call(sprint_world["alice"], "weekly_report")


def test_weekly_report_project_scoped_denied_without_access(sprint_world):
    with pytest.raises(ToolError):
        call(sprint_world["bob"], "weekly_report", {"project_id": sprint_world["p1"]})
