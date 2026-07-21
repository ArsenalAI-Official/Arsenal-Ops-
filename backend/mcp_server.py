"""MCP server for Arsenal Ops.

Mounts the Ops backend as an MCP (Model Context Protocol) server at ``/mcp`` so
Claude / AI agents can read Ops data through a standard, authenticated protocol.

Design (see .plans/enable-mcp-server-20260622-0945.md):

- **Transport:** stateless streamable HTTP (`stateless_http=True, json_response=True`)
  so there is no long-lived SSE connection held open against the single Render
  worker.
- **Auth:** two paths on one endpoint via `MultiAuth`. (1) Bearer HS256 JWT —
  the token the REST API issues — for Claude Code / API connector / custom
  agents, validated locally by `JWTVerifier` (not token passthrough: we issued
  it and verify it ourselves). (2) OAuth 2.1 via fastmcp's `GoogleProvider` for
  Claude Desktop, delegating login to the app's existing Google SSO. Un-tokened
  calls get 401. OAuth is enabled only when GOOGLE_CLIENT_ID/SECRET are set.
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

import os
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import BackgroundTasks, HTTPException
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.auth import AuthProvider, MultiAuth
from fastmcp.server.auth.providers.google import GoogleProvider
from fastmcp.server.auth.providers.jwt import JWTVerifier
from fastmcp.server.dependencies import get_access_token
from pydantic import ValidationError
from sqlalchemy.orm import Session

from database import SessionLocal
from models.activity_log import ActivityLog
from models.developer import Developer
from models.sprint import Sprint
from models.user import User
from models.work_item import WorkItem
from routers.auth import (
    ALGORITHM,
    SECRET_KEY,
    assert_capability,
    load_or_provision_user_by_email,
    load_user_from_claims,
)
from routers.developers import get_my_capacity, list_developers
from routers.projects import (
    ProjectCreate,
    create_project,
    get_project,
    list_projects,
    require_project_access,
)
from routers.pulse import get_pulse_derived
from routers.workitems import (
    LogHoursRequest,
    WorkItemCreate,
    WorkItemUpdate,
    create_work_item,
    get_work_item,
    list_project_sprints,
    list_work_items,
    log_hours,
    update_work_item,
)
from services.capacity_service import compute_capacity_breakdown, week_boundaries
from services.weekly_report_service import weekly_hours_report

# --- Authentication ----------------------------------------------------------
# Two client families share one /mcp endpoint via MultiAuth:
#   1. Bearer HS256 JWT (Claude Code, API connector, custom agents) — the same
#      token the REST API issues, validated locally by JWTVerifier.
#   2. Claude Desktop — OAuth 2.1 (DCR + metadata + PKCE), handled by fastmcp's
#      GoogleProvider, which delegates the actual login to the Google SSO the app
#      already uses.
# MultiAuth: the OAuth server supplies routes/metadata; the JWTVerifier stays as
# an additional verifier. OAuth is OPT-IN via MCP_OAUTH_ENABLED — it must not turn
# on just because the app's Google SSO creds happen to be in the env (they almost
# always are), so tests/local stay JWT-only unless the flag is explicitly set.
_jwt_verifier = JWTVerifier(public_key=SECRET_KEY, algorithm=ALGORITHM)

_oauth_enabled = os.getenv("MCP_OAUTH_ENABLED", "").lower() in ("1", "true", "yes")
_google_client_id = os.getenv("GOOGLE_CLIENT_ID")
_google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
# Public base URL of the mounted MCP server, used to build OAuth metadata +
# redirect URIs. For the /mcp mount this should include the mount path, e.g.
# http://localhost:8000/mcp locally, or https://<render-host>/mcp in prod.
_mcp_base_url = os.getenv("MCP_BASE_URL", "http://localhost:8000/mcp")

# Restrict which client redirect URIs Dynamic Client Registration will accept.
# fastmcp defaults to allowing ANY redirect URI (open DCR) — an attacker could
# register a client pointing at a URL they control and capture a victim's
# authorization code. Lock it to loopback (Claude Desktop / mcp-remote use a
# localhost callback) and Claude's web origins. Patterns support wildcards;
# override per-env via MCP_ALLOWED_CLIENT_REDIRECT_URIS (comma-separated).
_default_client_redirect_uris = [
    "http://localhost:*",
    "http://127.0.0.1:*",
    "https://claude.ai/*",
    "https://claude.com/*",
]
_redirects_env = os.getenv("MCP_ALLOWED_CLIENT_REDIRECT_URIS", "").strip()
_allowed_client_redirect_uris = (
    [u.strip() for u in _redirects_env.split(",") if u.strip()]
    if _redirects_env
    else _default_client_redirect_uris
)

_auth: AuthProvider
if _oauth_enabled and _google_client_id and _google_client_secret:
    # Fail fast rather than serve broken discovery/redirects: in production the
    # base URL must be the real public https://<host>/mcp, not the localhost
    # fallback. (Harmless but non-functional in dev, so only enforced in prod.)
    if os.getenv("ENVIRONMENT", "development").lower() == "production" and (
        "localhost" in _mcp_base_url or "127.0.0.1" in _mcp_base_url
    ):
        raise RuntimeError(
            "MCP_OAUTH_ENABLED is set in production but MCP_BASE_URL is unset or "
            f"points at localhost ({_mcp_base_url!r}). Set MCP_BASE_URL to the "
            "public https://<host>/mcp URL."
        )
    _google_provider = GoogleProvider(
        client_id=_google_client_id,
        client_secret=_google_client_secret,
        base_url=_mcp_base_url,
        required_scopes=["openid", "email", "profile"],
        redirect_path="/auth/callback",
        allowed_client_redirect_uris=_allowed_client_redirect_uris,
    )
    # required_scopes=[] on the resource-server gate is deliberate. MultiAuth
    # otherwise inherits the GoogleProvider's required_scopes (openid/email/
    # profile) and RequireAuthMiddleware then enforces them on EVERY token —
    # including our own Bearer JWTs (Claude Code header auth, API connector,
    # custom agents), which carry only {sub, exp} and no OAuth scope claim. That
    # made enabling OAuth silently 403 the entire JWT path with "insufficient_
    # scope". Those scopes belong to the Google *consent* flow (still requested
    # via GoogleProvider above); authorization at the tool boundary is done by
    # our RBAC capabilities (assert_capability), not by OAuth scopes — so the
    # coarse scope gate is intentionally left open and both token families pass
    # verification, then get RBAC-checked inside each tool.
    _auth = MultiAuth(server=_google_provider, verifiers=[_jwt_verifier], required_scopes=[])
else:
    _auth = _jwt_verifier  # JWT-only (OAuth flag off, or creds missing)

# mask_error_details=True: only *intentional* ToolError messages reach the agent;
# any other (unexpected) exception is replaced with a generic message instead of
# leaking internal details — stack frames, SQL, file paths — to the MCP client.
mcp: FastMCP = FastMCP("Arsenal Ops", auth=_auth, mask_error_details=True)


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
            # OAuth tokens (Claude Desktop, via GoogleProvider) carry a verified
            # `email` claim; our own Bearer JWTs carry `sub` (the Ops user id).
            # Resolve by whichever is present so both paths feed the same RBAC.
            if claims.get("email"):
                user = load_or_provision_user_by_email(db, claims["email"], claims.get("name"))
            else:
                user = load_user_from_claims(db, claims)
            if user is None:
                raise ToolError("Token is valid but does not map to a known/authorized user")
            # Enforce is_active here: the JWT path (load_user_from_claims) returns
            # the user regardless of status, unlike the REST get_current_user check.
            # Without this a deactivated employee's still-valid 24h token would keep
            # MCP access. (The OAuth path already returns None for inactive users.)
            if not user.is_active:
                raise ToolError("User account is inactive")
            yield db, user
    except ValidationError as exc:
        # Pydantic validation (e.g. WorkItemCreate / LogHoursRequest) isn't an
        # HTTPException, so without this it would be masked into a generic error.
        # Surface a concise, actionable message to the agent instead.
        problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        raise ToolError(f"Invalid input: {problems}") from exc
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


def _clamp_page(limit: int, offset: int, *, max_limit: int = 200) -> tuple[int, int]:
    """Clamp agent-supplied pagination to safe bounds. Tools call the REST
    handlers directly, bypassing FastAPI's ``Query(..., ge=1, le=...)`` guards,
    so a huge or negative ``limit``/``offset`` would otherwise reach SQL/slicing
    unchecked."""
    return max(1, min(limit, max_limit)), max(0, offset)


def _work_item_url(project_id, item_id) -> str:
    """Deep link to a work item in the app UI, so an agent can hand the user a
    clickable link to the ticket it just created/updated. Mirrors the URL
    email_service builds (``/project/{id}/board/{item_id}``) so notifications
    and MCP responses point to the same place. Reads FRONTEND_URL per call (as
    email_service does) so the link is correct per environment."""
    # `or` (not getenv's default arg) so a present-but-EMPTY FRONTEND_URL — as in
    # local dev — still yields an absolute link instead of a bare "/project/..."
    # relative path the agent can't hand off.
    base = (os.getenv("FRONTEND_URL") or "https://arsenal-ops.vercel.app").rstrip("/")
    return f"{base}/project/{project_id}/board/{item_id}"


@mcp.tool
def projects_list(limit: int = 50, offset: int = 0, category_id: int | None = None) -> list[dict]:
    """List projects the caller can access (admins see all; others see only the
    projects they're assigned to). Optionally filter by category_id.
    """
    with _caller_session() as (db, user):
        limit, offset = _clamp_page(limit, offset)
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
    query: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Search work items within a project, with optional status / type / sprint /
    assignee filters. ``project_id`` is required and access-checked, so results
    are always scoped to a project the caller can see (the REST list endpoint is
    unscoped; this tool deliberately is not).

    ``query`` is a case-insensitive substring match over key / title /
    description — use it to resolve a vaguely-described ticket ("the login
    thing") to candidates when the exact title isn't known.
    """
    with _caller_session() as (db, user):
        require_project_access(project_id, user, db)
        assert_capability(user, "project.board")
        limit, offset = _clamp_page(limit, offset)
        return list_work_items(
            project_id=project_id,
            status=status,
            type=item_type,
            sprint_id=sprint_id,
            assignee_id=assignee_id,
            search=query,
            limit=limit,
            offset=offset,
            db=db,
            current_user=user,
        )


@mcp.tool
def workitem_get(item_id: int) -> dict:
    """Get one work item by id. Requires `project.board` and access to the item's
    project.

    A missing id and an item in a project the caller can't access both return
    the same "not found" error — so item ids elsewhere can't be enumerated via a
    403-vs-404 distinction. The capability check runs first (it's user-global and
    reveals nothing about which ids exist).
    """
    with _caller_session() as (db, user):
        assert_capability(user, "project.board")
        item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
        if item is not None:
            try:
                require_project_access(item.project_id, user, db)
            except HTTPException:
                item = None  # collapse "no access" into "not found"
        if item is None:
            raise ToolError("Work item not found")
        result = get_work_item(item_id, db=db, current_user=user)
        result["url"] = _work_item_url(item.project_id, result["id"])
        return result


# --------------------------------------------------------------------------- #
# Sprints
# --------------------------------------------------------------------------- #


@mcp.tool
def sprints_list(project_id: int | None = None, status: str | None = None) -> list[dict]:
    """List sprints with computed status and progress (item counts, story points,
    completion %). Requires `project.board`.

    - ``project_id`` given: sprints for that one project (access-checked).
    - ``project_id`` omitted: sprints across every project the caller can see —
      so "what's the current sprint?" is one call with ``status="active"``.

    ``status`` filters on the *computed* status (planning/active/completed/
    cancelled), which is derived from the sprint's dates on read — a planning
    sprint whose window now contains today reads as ``active`` even if the row
    wasn't explicitly activated.
    """
    with _caller_session() as (db, user):
        assert_capability(user, "project.board")
        if project_id is not None:
            require_project_access(project_id, user, db)
            name_by_id = {project_id: get_project(project_id, db=db, current_user=user)["name"]}
        else:
            projects = list_projects(
                category_id=None, uncategorized=False, db=db, current_user=user
            )
            name_by_id = {p["id"]: p["name"] for p in projects}

        out: list[dict] = []
        for pid, pname in name_by_id.items():
            for sprint in list_project_sprints(pid, db=db, current_user=user):
                sprint["project_id"] = pid
                sprint["project_name"] = pname
                out.append(sprint)
        if status:
            wanted = status.strip().lower()
            out = [s for s in out if (s.get("status") or "").lower() == wanted]
        return out


@mcp.tool
def sprint_get(sprint_id: int) -> dict:
    """Get one sprint's status/progress plus its work items. Requires
    `project.board` and access to the sprint's project.

    Missing sprint and a sprint in an inaccessible project both return the same
    "not found" error, so sprint ids can't be enumerated via 403-vs-404.
    """
    with _caller_session() as (db, user):
        assert_capability(user, "project.board")
        sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
        if sprint is not None:
            try:
                require_project_access(sprint.project_id, user, db)
            except HTTPException:
                sprint = None  # collapse "no access" into "not found"
        if sprint is None:
            raise ToolError("Sprint not found")
        # Reuse the per-project computed-status + progress serialization, then
        # pick this sprint out of it.
        summaries = list_project_sprints(sprint.project_id, db=db, current_user=user)
        summary = next((s for s in summaries if s["id"] == sprint_id), None)
        if summary is None:
            raise ToolError("Sprint not found")
        summary["project_id"] = sprint.project_id
        summary["items"] = list_work_items(
            project_id=sprint.project_id,
            sprint_id=sprint_id,
            limit=200,
            offset=0,
            db=db,
            current_user=user,
        )
        return summary


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
    """List developers in the roster (id, name, email, github, avatar). Requires
    `project.board` — the roster (incl. emails) is not exposed to a bare token
    with no capabilities (e.g. a freshly auto-provisioned OAuth identity); a real
    working user needs it to assign work items.
    """
    with _caller_session() as (db, user):
        assert_capability(user, "project.board")
        limit, offset = _clamp_page(limit, offset)
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


@mcp.tool
def weekly_report(project_id: int | None = None) -> dict:
    """Weekly logged-hours report (Sat->Fri UTC): team total plus per-developer
    and per-project rollups of hours logged this week.

    - ``project_id`` given: scoped to that project (requires `project.board` +
      access) — answers "give a weekly report of this project."
    - ``project_id`` omitted: the whole team across all projects (requires
      `admin.employees`, mirroring the emailed weekly report).

    Internal employees only; externally-added users are excluded (as in the
    emailed report).
    """
    with _caller_session() as (db, user):
        if project_id is not None:
            require_project_access(project_id, user, db)
            assert_capability(user, "project.board")
        else:
            assert_capability(user, "admin.employees")
        return weekly_hours_report(db, project_id=project_id)


# --------------------------------------------------------------------------- #
# Work item writes
#
# Every write is gated by `project.tracker_write` + per-project access, and
# leaves an activity_log audit row. We reuse the existing write endpoints (which
# carry the real business rules — key allocation, done-ticket freezing,
# parent/child completion checks, assignee-only log-hours), calling them with an
# explicit BackgroundTasks() since we're outside a request cycle. The human-in-
# the-loop control is the MCP client's per-tool permission prompt.
# --------------------------------------------------------------------------- #


def _audit_count(db: Session, entity_id: int) -> int:
    """Number of activity_log rows for a work item (used to detect whether a
    reused endpoint already wrote its own audit row)."""
    return (
        db.query(ActivityLog)
        .filter(ActivityLog.entity_type == "work_item", ActivityLog.entity_id == entity_id)
        .count()
    )


def _ensure_audit(
    db: Session,
    *,
    project_id: int,
    user_id: int,
    action: str,
    entity_id: int,
    title: str,
    details: dict | None = None,
) -> None:
    """Backstop audit row so *every* MCP write is traceable.

    create + status/assignee updates already write their own activity_log row;
    field-only edits and log-hours do not — this fills that gap (callers invoke
    it only when the reused endpoint added nothing)."""
    db.add(
        ActivityLog(
            project_id=project_id,
            user_id=user_id,
            action=action,
            entity_type="work_item",
            entity_id=entity_id,
            title=title,
            details=details or {},
        )
    )
    db.commit()


@mcp.tool
def workitem_create(
    project_id: int,
    title: str,
    item_type: str = "task",
    description: str = "",
    status: str = "todo",
    priority: str = "medium",
    assignee_id: int | None = None,
    sprint_id: int | None = None,
    story_points: int = 0,
    estimated_hours: int = 0,
) -> dict:
    """Create a work item in a project. Requires `project.tracker_write` and
    access to the project. The create is recorded in activity_log.
    """
    with _caller_session() as (db, user):
        require_project_access(project_id, user, db)
        assert_capability(user, "project.tracker_write")
        item = WorkItemCreate(
            project_id=project_id,
            title=title,
            type=item_type,
            description=description,
            status=status,
            priority=priority,
            assignee_id=assignee_id,
            sprint_id=sprint_id,
            story_points=story_points,
            estimated_hours=estimated_hours,
        )
        # create_work_item writes its own "created" activity_log row.
        result = create_work_item(item, BackgroundTasks(), db=db, current_user=user)
        # Hand back a clickable link to the new ticket so the agent can surface it.
        result["url"] = _work_item_url(project_id, result["id"])
        return result


@mcp.tool
def workitem_update(
    item_id: int,
    status: str | None = None,
    title: str | None = None,
    description: str | None = None,
    priority: str | None = None,
    assignee_id: int | None = None,
    sprint_id: int | None = None,
    story_points: int | None = None,
    estimated_hours: int | None = None,
    item_type: str | None = None,
    tags: list[str] | None = None,
    due_date: str | None = None,
    start_date: str | None = None,
) -> dict:
    """Update a work item — status transitions and/or field edits. Only the
    fields you pass are changed. Requires `project.tracker_write` + project
    access. Always audited in activity_log.

    Note: an omitted/`None` field means "leave unchanged" — clearing a field
    (e.g. unassigning, removing a due date) is not expressible via this tool.
    """
    with _caller_session() as (db, user):
        item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
        if item is None:
            raise ToolError("Work item not found")
        require_project_access(item.project_id, user, db)
        assert_capability(user, "project.tracker_write")
        fields = {
            "status": status,
            "title": title,
            "description": description,
            "priority": priority,
            "assignee_id": assignee_id,
            "sprint_id": sprint_id,
            "story_points": story_points,
            "estimated_hours": estimated_hours,
            "type": item_type,
            "tags": tags,
            "due_date": due_date,
            "start_date": start_date,
        }
        provided = {k: v for k, v in fields.items() if v is not None}
        if not provided:
            raise ToolError("No fields provided to update")
        project_id, key = item.project_id, item.key
        before = _audit_count(db, item_id)
        result = update_work_item(
            item_id,
            WorkItemUpdate.model_validate(provided),
            BackgroundTasks(),
            db=db,
            current_user=user,
        )
        # Status/assignee changes self-audit; a field-only edit does not — backfill.
        if _audit_count(db, item_id) == before:
            _ensure_audit(
                db,
                project_id=project_id,
                user_id=user.id,
                action="updated",
                entity_id=item_id,
                title=f"Updated {key} via MCP",
                details={"source": "mcp", "fields": sorted(provided)},
            )
        result["url"] = _work_item_url(project_id, result["id"])
        return result


@mcp.tool
def workitem_log_hours(
    item_id: int,
    hours: int,
    description: str | None = None,
    developer_id: int | None = None,
) -> dict:
    """Log hours (1-24) against a work item. Requires `project.tracker_write`,
    project access, and — per the app's rule — that the caller is the ticket's
    assignee. Audited in activity_log.
    """
    with _caller_session() as (db, user):
        item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
        if item is None:
            raise ToolError("Work item not found")
        require_project_access(item.project_id, user, db)
        assert_capability(user, "project.tracker_write")
        project_id, key = item.project_id, item.key
        before = _audit_count(db, item_id)
        result = log_hours(
            item_id,
            LogHoursRequest(hours=hours, description=description, developer_id=developer_id),
            db=db,
            current_user=user,
        )
        # log_hours writes a TimeEntry + comment but no activity_log — record one.
        if _audit_count(db, item_id) == before:
            _ensure_audit(
                db,
                project_id=project_id,
                user_id=user.id,
                action="logged_hours",
                entity_id=item_id,
                title=f"Logged {hours}h on {key} via MCP",
                details={"source": "mcp", "hours": hours},
            )
        return result


@mcp.tool
def project_create(
    name: str,
    description: str = "",
    key_prefix: str = "PROJ",
    category_id: int | None = None,
) -> dict:
    """Create a new project. Requires the `project.create` capability (a
    PM/admin-level grant — not given to the default developer role). The caller
    is added as the project's creator and the create is recorded in the
    project's activity feed.
    """
    with _caller_session() as (db, user):
        assert_capability(user, "project.create")
        payload = ProjectCreate(
            name=name,
            description=description,
            key_prefix=key_prefix,
            category_id=category_id,
        )
        # create_project writes its own project-scoped activity_log entry.
        return create_project(payload, db=db, current_user=user)


# Stateless streamable-HTTP ASGI app, mounted at /mcp by main.py. `path="/"`
# means the endpoint is the mount root (i.e. /mcp/). main.py must adopt
# `mcp_app.lifespan` so the session manager is initialized on startup.
mcp_app = mcp.http_app(path="/", stateless_http=True, json_response=True)


def oauth_well_known_routes(mcp_path: str = "/") -> list:
    """OAuth discovery (well-known) routes to register on the PARENT app's root.

    When the MCP app is mounted under a sub-path, fastmcp serves its well-known
    metadata *under* that sub-path — but RFC 9728 (and our 401 challenge) advertise
    the protected-resource metadata at the host ROOT (e.g.
    /.well-known/oauth-protected-resource/mcp/). Without this, an OAuth client's
    first discovery hop 404s. main.py registers these on the root app so discovery
    resolves. No-op when OAuth is disabled (JWTVerifier has no such routes).

    `mcp_path` is the streamable endpoint path *within* the MCP app — "/" here,
    matching `http_app(path="/")` — NOT the "/mcp" mount prefix (the resource
    identifier already comes from `MCP_BASE_URL`; passing "/mcp" double-counts it).
    """
    getter = getattr(_auth, "get_well_known_routes", None)
    return list(getter(mcp_path=mcp_path)) if getter is not None else []
