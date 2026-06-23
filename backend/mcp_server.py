"""MCP server for Arsenal Ops.

Mounts the Ops backend as an MCP (Model Context Protocol) server at ``/mcp`` so
Claude / AI agents can read Ops data through a standard, authenticated protocol.

Design (see .plans/enable-mcp-server-20260622-0945.md):

- **Transport:** stateless streamable HTTP (`stateless_http=True, json_response=True`)
  so there is no long-lived SSE connection held open against the single Render
  worker.
- **Auth:** the same HS256 JWT the REST API issues. `JWTVerifier` makes ``/mcp``
  an OAuth2.1 resource server that rejects un-tokened calls with 401. This is
  NOT token passthrough — we are the resource server, we issued the token, we
  validate it locally and never forward it upstream.
- **RBAC bridge:** inside each tool we read the validated token's claims, load
  the `User` via the shared `load_user_from_claims`, and enforce the existing
  capabilities + per-project access via `assert_capability` /
  `require_project_access` — so an agent never exceeds its user's UI
  permissions. Note the read tools are intentionally *stricter* than the REST
  read endpoints, several of which are auth-only with no per-project scoping;
  the tools always scope to what the caller can see in the UI.
- **Reuse, don't duplicate:** tools call the existing router/service read logic
  directly (route handlers are plain functions whose `db`/`current_user` are
  just `Depends` defaults we override), so there is no second copy of the query
  or serialization logic.
- **DB sessions:** tools run outside FastAPI's `Depends(get_db)` lifecycle, so
  each opens its own `SessionLocal()` (see `_caller_session`) to avoid leaking
  connections from the (5 + 10 overflow) pool.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import HTTPException
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.auth.providers.jwt import JWTVerifier
from fastmcp.server.dependencies import get_access_token
from sqlalchemy.orm import Session

from database import SessionLocal
from models.developer import Developer
from models.user import User
from routers.auth import ALGORITHM, SECRET_KEY, assert_capability, load_user_from_claims
from routers.developers import get_my_capacity, list_developers
from routers.projects import get_project, list_projects, require_project_access
from routers.pulse import get_pulse_derived
from routers.workitems import get_work_item, list_work_items
from services.capacity_service import compute_capacity_breakdown, week_boundaries

# Validate the same HS256 JWT the REST API issues. `SECRET_KEY` is required from
# the environment (routers.auth fails import if it is unset/default), so by the
# time this runs we have a real signing secret to verify against.
_jwt_verifier = JWTVerifier(public_key=SECRET_KEY, algorithm=ALGORITHM)

mcp: FastMCP = FastMCP("Arsenal Ops", auth=_jwt_verifier)


@contextmanager
def _caller_session() -> Iterator[tuple[Session, User]]:
    """Yield ``(db, user)`` for a tool call, or raise a clean ToolError.

    - Resolves the caller from the JWT claims that JWTVerifier already validated.
    - Opens a dedicated DB session (tools run outside FastAPI's Depends(get_db),
      so each must manage its own — this prevents pool leaks).
    - Translates any HTTPException raised by the reused REST access checks
      (`require_project_access`, `assert_capability`) into an MCP ToolError, so
      the agent gets a clean 403/404 message rather than an opaque server error.
    """
    access_token = get_access_token()
    claims = access_token.claims if access_token else {}
    try:
        with SessionLocal() as db:
            user = load_user_from_claims(db, claims)
            if user is None:
                raise ToolError("Token is valid but does not map to a known user")
            yield db, user
    except HTTPException as exc:
        raise ToolError(f"{exc.status_code}: {exc.detail}") from exc


@mcp.tool
def whoami() -> dict:
    """Return the authenticated caller's id, email, and effective capabilities.

    Proves the auth -> RBAC -> identity pipeline end to end.
    """
    with _caller_session() as (_db, user):
        return {
            "id": user.id,
            "email": user.email,
            "capabilities": user.effective_capability_keys(),
        }


# --------------------------------------------------------------------------- #
# Projects
# --------------------------------------------------------------------------- #


@mcp.tool
def projects_list(limit: int = 50, offset: int = 0, category_id: int | None = None) -> list[dict]:
    """List projects the caller can access (admins see all; others see only the
    projects they're assigned to). Optionally filter by category_id.
    """
    with _caller_session() as (db, user):
        projects = list_projects(
            category_id=category_id, uncategorized=False, db=db, current_user=user
        )
        return projects[offset : offset + limit]


@mcp.tool
def project_get(project_id: int) -> dict:
    """Get one project by id. 403 if the caller has no access to it."""
    with _caller_session() as (db, user):
        return get_project(project_id, db=db, current_user=user)


# --------------------------------------------------------------------------- #
# Work items
# --------------------------------------------------------------------------- #


@mcp.tool
def workitems_search(
    project_id: int,
    status: str | None = None,
    item_type: str | None = None,
    sprint_id: int | None = None,
    assignee_id: int | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Search work items within a project, with optional status / type / sprint /
    assignee filters. ``project_id`` is required and access-checked, so results
    are always scoped to a project the caller can see (the REST list endpoint is
    unscoped; this tool deliberately is not).
    """
    with _caller_session() as (db, user):
        require_project_access(project_id, user, db)
        assert_capability(user, "project.board")
        return list_work_items(
            project_id=project_id,
            status=status,
            type=item_type,
            sprint_id=sprint_id,
            assignee_id=assignee_id,
            limit=limit,
            offset=offset,
            db=db,
            current_user=user,
        )


@mcp.tool
def workitem_get(item_id: int) -> dict:
    """Get one work item by id. 403 unless the caller can access its project."""
    with _caller_session() as (db, user):
        payload = get_work_item(item_id, db=db, current_user=user)  # 404s if missing
        # The REST detail endpoint has no per-project gate; enforce it here
        # before returning anything.
        require_project_access(payload["project_id"], user, db)
        assert_capability(user, "project.board")
        return payload


# --------------------------------------------------------------------------- #
# Pulse
# --------------------------------------------------------------------------- #


@mcp.tool
def pulse_get(project_id: int) -> dict:
    """Get the derived Pulse view for a project. Requires the `project.pulse`
    capability and access to the project.
    """
    with _caller_session() as (db, user):
        assert_capability(user, "project.pulse")
        return get_pulse_derived(project_id, db=db, current_user=user)


# --------------------------------------------------------------------------- #
# Developers / capacity
# --------------------------------------------------------------------------- #


@mcp.tool
def developers_list(limit: int = 100, offset: int = 0) -> list[dict]:
    """List developers in the roster (id, name, email, github, avatar)."""
    with _caller_session() as (db, user):
        developers = list_developers(db=db, current_user=user)
        return [
            {
                "id": d.id,
                "name": d.name,
                "email": d.email,
                "github_username": d.github_username,
                "avatar_url": d.avatar_url,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in developers[offset : offset + limit]
        ]


@mcp.tool
def my_capacity() -> dict:
    """Weekly capacity breakdown (Sat->Fri UTC) for the caller's own developer
    profile. 404 if the caller has no developer profile.
    """
    with _caller_session() as (db, user):
        return get_my_capacity(db=db, current_user=user)


@mcp.tool
def developer_capacity(developer_id: int) -> dict:
    """Weekly capacity breakdown for a specific developer. Requires the
    `admin.employees` capability (mirrors the admin capacity view).
    """
    with _caller_session() as (db, user):
        assert_capability(user, "admin.employees")
        dev = db.query(Developer).filter(Developer.id == developer_id).first()
        if dev is None:
            raise ToolError("Developer not found")
        week_start, week_end = week_boundaries()
        breakdown = compute_capacity_breakdown(
            dev.assigned_work_items or [], week_start, db=db, developer_id=dev.id
        )
        return {
            "developer_id": dev.id,
            "developer_name": dev.name,
            "developer_email": dev.email,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            **breakdown,
        }


# Stateless streamable-HTTP ASGI app, mounted at /mcp by main.py. `path="/"`
# means the endpoint is the mount root (i.e. /mcp/). main.py must adopt
# `mcp_app.lifespan` so the session manager is initialized on startup.
mcp_app = mcp.http_app(path="/", stateless_http=True, json_response=True)
