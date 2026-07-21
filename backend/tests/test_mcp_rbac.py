"""RBAC robustness tests for the MCP server.

Unlike the other MCP test files (which use ad-hoc roles), this one seeds the
REAL system roles from ``database.SYSTEM_ROLES`` — admin / project_manager /
developer — so the assertions track exactly what ships to production. If a
role's grants are ever changed, the resulting access change is caught here.

It asserts the properties that make the RBAC bridge *robust*, not just present:

  1. Per-role capability matrix across the MCP tools (the "what can this persona
     even call" gate).
  2. The two gates are INDEPENDENT: capability without project access is denied,
     and project access without the capability is denied.
  3. Wildcard-grant matching is correct — including the underscore write-cap
     trick (``project.tracker.*`` must NOT sweep in ``project.tracker_write``).
  4. Enumeration oracle closed: an inaccessible id and a missing id both return
     "not found", so ids can't be probed via a 403-vs-404 signal.
  5. list-scope vs direct-access asymmetry for project_manager is exactly as the
     code specifies (membership-scoped list, capability-scoped direct access).
  6. An inactive user's still-valid token is rejected.

Idempotent by construction: every test builds a fresh in-memory SQLite DB
(function-scoped fixture, monkeypatched SessionLocal). Repeated runs are
identical and no external/prod state is touched.
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

from capabilities import matches
from database import SYSTEM_ROLES, Base
from main import app
from mcp_server import mcp_app
from models.developer import Developer, project_developers
from models.project import Project
from models.role import Role, RoleCapability
from models.sprint import Sprint, SprintStatus
from models.time_entry import TimeEntry
from models.user import User
from models.work_item import WorkItem
from routers.auth import create_access_token
from services.capacity_service import week_boundaries

# --------------------------------------------------------------------------- #
# Harness (mirrors test_mcp_read_tools.py so the tools run over the real
# HTTP + auth path in-process).
# --------------------------------------------------------------------------- #


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


async def _call_tool(token: str, name: str, args: dict | None = None):
    captured: dict = {}
    async with mcp_app.lifespan(mcp_app):
        transport = StreamableHttpTransport(
            url="http://testserver/mcp/", auth=token, httpx_client_factory=_asgi_client_factory
        )
        async with Client(transport) as client:
            try:
                captured["result"] = await client.call_tool(name, args or {})
            except Exception as exc:  # re-raised outside the lifespan task group
                captured["error"] = exc
    if "error" in captured:
        raise captured["error"]
    return captured["result"]


def call(token: str, name: str, args: dict | None = None):
    return asyncio.run(_call_tool(token, name, args)).data


def allowed(token: str, name: str, args: dict | None = None) -> bool:
    """True if the tool call is permitted (no ToolError), False if RBAC-denied."""
    try:
        call(token, name, args)
        return True
    except ToolError:
        return False


def _token(user_id: int) -> str:
    return create_access_token(data={"sub": str(user_id)}, expires_delta=timedelta(minutes=60))


def _link(db, project_id: int, developer_id: int) -> None:
    db.execute(
        project_developers.insert().values(
            project_id=project_id, developer_id=developer_id, role="Engineer", is_admin=False
        )
    )


# --------------------------------------------------------------------------- #
# World: real system roles + a deliberately minimal custom role.
# --------------------------------------------------------------------------- #


@pytest.fixture
def world(mcp_db):
    """Seed real system roles, one user per role, two projects, and enough data
    for every tool to have something to act on.

    Memberships (P1 only): pm, dev, viewer. admin reaches everything by
    capability. Nobody is a member of P2 — so P2 is the "no access" probe for
    the developer, and the cross-project-capability probe for the PM.
    """
    db = mcp_db()
    try:
        # --- roles: the exact production system roles ---
        role_by_name: dict[str, Role] = {}
        for name, desc, caps in SYSTEM_ROLES:
            r = Role(name=name, description=desc, is_system=True)
            db.add(r)
            db.flush()
            for cap in caps:
                db.add(RoleCapability(role_id=r.id, capability_key=cap))
            role_by_name[name] = r
        # A minimal custom role used to isolate the capability axis: it grants a
        # read cap that gates NOTHING in the MCP surface, and crucially NOT
        # project.board / tracker_write / project.create.
        viewer_role = Role(name="viewer", description="minimal read", is_system=False)
        db.add(viewer_role)
        db.flush()
        db.add(RoleCapability(role_id=viewer_role.id, capability_key="project.overview.prd"))
        role_by_name["viewer"] = viewer_role

        def _user(email, role_obj, *, active=True, with_dev_profile=True):
            u = User(
                email=email,
                name=email.split("@")[0].title(),
                hashed_password="x",
                role=role_obj.name,
                is_active=active,
                is_first_login=False,
            )
            u.roles.append(role_obj)
            db.add(u)
            db.flush()
            dev = None
            if with_dev_profile:
                dev = Developer(name=u.name, email=email)
                db.add(dev)
                db.flush()
            return u, dev

        admin_u, _ = _user("admin@rbac.local", role_by_name["admin"], with_dev_profile=False)
        pm_u, pm_dev = _user("pm@rbac.local", role_by_name["project_manager"])
        dev_u, dev_dev = _user("dev@rbac.local", role_by_name["developer"])
        viewer_u, viewer_dev = _user("viewer@rbac.local", role_by_name["viewer"])
        inactive_u, _ = _user(
            "ghost@rbac.local", role_by_name["developer"], active=False, with_dev_profile=False
        )

        # --- projects ---
        p1 = Project(
            name="P1",
            key_prefix="P1",
            description="d",
            status="active",
            github_repo_urls=[],
            created_at=datetime.utcnow(),
        )
        p2 = Project(
            name="P2",
            key_prefix="P2",
            description="d",
            status="active",
            github_repo_urls=[],
            created_at=datetime.utcnow(),
        )
        db.add_all([p1, p2])
        db.flush()
        for d in (pm_dev, dev_dev, viewer_dev):
            _link(db, p1.id, d.id)  # everyone-but-admin is a member of P1 only

        # --- work items + sprints + a this-week time entry ---
        ws, _we = week_boundaries()
        sp1 = Sprint(
            project_id=p1.id,
            name="P1 S1",
            status=SprintStatus.ACTIVE.value,
            start_date=ws - timedelta(days=2),
            end_date=ws + timedelta(days=10),
        )
        sp2 = Sprint(
            project_id=p2.id,
            name="P2 S1",
            status=SprintStatus.ACTIVE.value,
            start_date=ws - timedelta(days=2),
            end_date=ws + timedelta(days=10),
        )
        db.add_all([sp1, sp2])
        db.flush()
        wi1 = WorkItem(
            project_id=p1.id,
            key="P1-1",
            title="Task one",
            type="task",
            status="in_progress",
            sprint_id=sp1.id,
            assignee_id=dev_dev.id,
            estimated_hours=8,
            logged_hours=3,
        )
        wi2 = WorkItem(
            project_id=p2.id,
            key="P2-1",
            title="Secret task",
            type="task",
            status="todo",
            sprint_id=sp2.id,
        )
        db.add_all([wi1, wi2])
        db.flush()
        db.add(
            TimeEntry(
                work_item_id=wi1.id,
                developer_id=dev_dev.id,
                hours=3,
                description="w",
                logged_at=ws + timedelta(days=1),
            )
        )
        db.commit()

        return {
            "admin": _token(admin_u.id),
            "pm": _token(pm_u.id),
            "dev": _token(dev_u.id),
            "viewer": _token(viewer_u.id),
            "inactive": _token(inactive_u.id),
            "p1": p1.id,
            "p2": p2.id,
            "wi1": wi1.id,
            "wi2": wi2.id,
            "sp1": sp1.id,
            "sp2": sp2.id,
            "dev_dev": dev_dev.id,
        }
    finally:
        db.close()


ROLES = ("admin", "pm", "dev", "viewer")


# --------------------------------------------------------------------------- #
# 1. Per-role capability matrix (read + admin-gated tools; side-effect free).
# --------------------------------------------------------------------------- #


def test_capability_matrix(world):
    # tool, args(world) -> dict, expected allow per role.
    matrix = [
        (
            "workitems_search",
            lambda w: {"project_id": w["p1"]},
            {"admin": True, "pm": True, "dev": True, "viewer": False},
        ),
        ("sprints_list", lambda w: {}, {"admin": True, "pm": True, "dev": True, "viewer": False}),
        (
            "sprint_get",
            lambda w: {"sprint_id": w["sp1"]},
            {"admin": True, "pm": True, "dev": True, "viewer": False},
        ),
        (
            "pulse_get",
            lambda w: {"project_id": w["p1"]},
            {"admin": True, "pm": True, "dev": True, "viewer": False},
        ),
        (
            "developers_list",
            lambda w: {},
            {"admin": True, "pm": True, "dev": True, "viewer": False},
        ),
        # admin.employees — only the admin role holds it.
        (
            "developer_capacity",
            lambda w: {"developer_id": w["dev_dev"]},
            {"admin": True, "pm": False, "dev": False, "viewer": False},
        ),
        # project-scoped weekly report: project.board + access.
        (
            "weekly_report",
            lambda w: {"project_id": w["p1"]},
            {"admin": True, "pm": True, "dev": True, "viewer": False},
        ),
        # team-wide weekly report: admin.employees — admin only.
        (
            "weekly_report",
            lambda w: {},
            {"admin": True, "pm": False, "dev": False, "viewer": False},
        ),
    ]
    failures = []
    for tool, args_fn, expected in matrix:
        args = args_fn(world)
        for role in ROLES:
            got = allowed(world[role], tool, args)
            if got != expected[role]:
                failures.append(
                    f"{tool}{args or ''} as {role}: expected "
                    f"{'ALLOW' if expected[role] else 'DENY'}, got "
                    f"{'ALLOW' if got else 'DENY'}"
                )
    assert not failures, "RBAC matrix mismatches:\n" + "\n".join(failures)


def test_project_create_capability(world):
    # project.create: admin (*), pm (project.*), dev (explicit) — yes; viewer — no.
    # Distinct key_prefix per project: key_prefix is UNIQUE, and the tool/endpoint
    # defaults it to "PROJ", so successful creates would otherwise collide.
    assert allowed(world["admin"], "project_create", {"name": "A", "key_prefix": "AAA"})
    assert allowed(world["pm"], "project_create", {"name": "B", "key_prefix": "BBB"})
    assert allowed(world["dev"], "project_create", {"name": "C", "key_prefix": "CCC"})
    assert not allowed(world["viewer"], "project_create", {"name": "D", "key_prefix": "DDD"})


# --------------------------------------------------------------------------- #
# 2. The two gates are INDEPENDENT.
# --------------------------------------------------------------------------- #


def test_capability_without_access_is_denied(world):
    """dev has project.board + tracker_write but is NOT a member of P2."""
    assert not allowed(world["dev"], "workitems_search", {"project_id": world["p2"]})
    assert not allowed(world["dev"], "workitem_create", {"project_id": world["p2"], "title": "x"})


def test_access_without_capability_is_denied(world):
    """viewer IS a member of P1 (access ok) but lacks project.board / tracker_write."""
    assert not allowed(world["viewer"], "workitems_search", {"project_id": world["p1"]})
    assert not allowed(
        world["viewer"], "workitem_create", {"project_id": world["p1"], "title": "x"}
    )


# --------------------------------------------------------------------------- #
# 3. Wildcard-grant matching correctness (the RBAC engine itself).
# --------------------------------------------------------------------------- #


def test_wildcard_matching_rules():
    # project.* sweeps in project reads/writes...
    assert matches("project.board", ["project.*"])
    assert matches("project.tracker_write", ["project.*"])
    assert matches("project.create", ["project.*"])
    # ...but NOT anything under admin.
    assert not matches("admin.employees", ["project.*"])
    assert not matches("admin.roles_write", ["project.*"])
    # The underscore write-cap trick: a read wildcard must not grant the write cap.
    assert not matches("project.tracker_write", ["project.tracker.*"])
    assert not matches("project.overview_write", ["project.overview.*"])
    # "*" grants everything; exact grants match only themselves.
    assert matches("admin.employees", ["*"])
    assert matches("project.board", ["project.board"])
    assert not matches("project.pulse", ["project.board"])


def test_seeded_role_effective_sets(world, mcp_db):
    """Assert the real system roles resolve to the expected effective power."""
    db = mcp_db()
    try:
        by_name = {u.email: u for u in db.query(User).all()}
        admin = by_name["admin@rbac.local"]
        pm = by_name["pm@rbac.local"]
        dev = by_name["dev@rbac.local"]

        # admin can do everything.
        assert admin.has_capability("admin.employees")
        assert admin.has_capability("project.tracker_write")

        # PM: full project surface incl. project.overview_write (→ cross-project
        # read access) but NO admin.* — this is why developer_capacity /
        # team-wide weekly_report are denied to PMs.
        assert pm.has_capability("project.tracker_write")
        assert pm.has_capability("project.overview_write")
        assert not pm.has_capability("admin.employees")

        # developer: board + tracker_write + create, but NOT overview_write
        # (so it stays membership-scoped) and NOT admin.*.
        assert dev.has_capability("project.board")
        assert dev.has_capability("project.tracker_write")
        assert not dev.has_capability("project.overview_write")
        assert not dev.has_capability("admin.employees")
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# 4. Enumeration oracle closed.
# --------------------------------------------------------------------------- #


def test_workitem_get_no_access_indistinguishable_from_missing(world):
    # dev can't access P2; the P2 item and a nonexistent id must look identical.
    with pytest.raises(ToolError, match="not found"):
        call(world["dev"], "workitem_get", {"item_id": world["wi2"]})
    with pytest.raises(ToolError, match="not found"):
        call(world["dev"], "workitem_get", {"item_id": 999999})


def test_sprint_get_no_access_indistinguishable_from_missing(world):
    with pytest.raises(ToolError, match="not found"):
        call(world["dev"], "sprint_get", {"sprint_id": world["sp2"]})
    with pytest.raises(ToolError, match="not found"):
        call(world["dev"], "sprint_get", {"sprint_id": 999999})


# --------------------------------------------------------------------------- #
# 5. list-scope vs direct-access asymmetry (documented quirk).
# --------------------------------------------------------------------------- #


def test_projects_list_scoping(world):
    admin_names = {p["name"] for p in call(world["admin"], "projects_list")}
    assert admin_names == {"P1", "P2"}  # admin.projects → sees all

    dev_names = {p["name"] for p in call(world["dev"], "projects_list")}
    assert dev_names == {"P1"}  # membership-scoped, no P2 leak


def test_pm_list_is_membership_scoped_but_access_is_capability_scoped(world):
    """project_manager quirk: `list_projects` keys on admin.projects (which PM
    lacks) so the LIST is membership-scoped (P1 only), yet `has_project_access`
    also honours project.overview_write (which PM has via project.*), so DIRECT
    access to an unlisted project (P2) still succeeds. Encoded so a future change
    to either gate trips this test.
    """
    pm_list = {p["name"] for p in call(world["pm"], "projects_list")}
    assert pm_list == {"P1"}  # P2 is NOT in the PM's list
    # ...but the PM can still read P2 directly by id:
    assert allowed(world["pm"], "workitems_search", {"project_id": world["p2"]})
    # contrast: the developer cannot (no overview_write, not a member).
    assert not allowed(world["dev"], "workitems_search", {"project_id": world["p2"]})


# --------------------------------------------------------------------------- #
# 6. Inactive user rejected despite a valid token.
# --------------------------------------------------------------------------- #


def test_inactive_user_rejected(world):
    with pytest.raises(ToolError, match="inactive"):
        call(world["inactive"], "whoami")
