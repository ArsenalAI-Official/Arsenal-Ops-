"""
Projects Router - CRUD operations for projects with work item stats
"""

import os
import sys
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import insert, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

sys.path.append("..")
from database import get_db
from models.architecture import Architecture
from models.developer import Developer, project_developers
from models.project import Project
from models.user import User, UserRole
from routers.auth import get_current_user, require_capability
from services.github_service import GitHubService, github_service

router = APIRouter(prefix="/api/projects", tags=["Projects"])


def has_project_access(project: Project, user: User) -> bool:
    """Check if user has access to a project (admin or assigned developer)"""
    # Admin has access to all projects (roles are comma-separated)
    if "admin" in user.role:
        return True

    # Check if user is assigned as a developer to this project
    return any(dev.email == user.email for dev in project.developers)


def is_project_admin(project_id: int, user: User, db: Session) -> bool:
    """Return True when the user can act as a project admin on this project.

    Two paths grant project-admin rights, matching the frontend's
    `isCurrentUserAdmin` semantics in `ProjectDetail.tsx`:
      1. Capability-based: the user holds `admin.projects` (system admins via
         `*`, or any custom role explicitly granted it). Replaces the legacy
         `"admin" in user.role` substring check, which missed users whose
         admin status came from the RBAC user_roles relationship rather than
         the legacy comma-separated `users.role` column.
      2. Membership-based: the user appears in this project's developers
         list with the `is_admin` flag set on the join row.
    """
    if user.has_capability("admin.projects"):
        return True

    result = db.execute(
        select(project_developers.c.is_admin)
        .where(
            (project_developers.c.project_id == project_id)
            & (Developer.id == project_developers.c.developer_id)
            & (Developer.email == user.email)
        )
        .join(Developer, Developer.id == project_developers.c.developer_id)
    ).first()

    return result[0] if result else False


def require_project_admin(project_id: int, user: User, db: Session):
    """Require project admin access, raise 403 if denied"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not is_project_admin(project_id, user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be a project admin to perform this action",
        )

    return project


def require_project_access(project_id: int, user: User, db: Session):
    """Require project access, raise 403 if denied"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not has_project_access(project, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You don't have access to this project"
        )

    return project


class DeveloperAssignment(BaseModel):
    developer_id: int
    role: str
    responsibilities: str | None = None


class ProjectCreate(BaseModel):
    name: str
    description: str
    key_prefix: str = "PROJ"
    github_repo_url: str | None = None
    github_repo_urls: list[str] | None = None
    developers: list[DeveloperAssignment] | None = []
    # Optional category at creation time. Validated against the DB in the
    # endpoint (400 if the id doesn't exist).
    category_id: int | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    github_repo_url: str | None = None
    github_repo_urls: list[str] | None = None
    created_at: str | None = None
    end_date: str | None = None
    # Three states for category_id on update:
    #   - field omitted from the request body → leave unchanged
    #   - field present as null  → clear the category (uncategorized)
    #   - field present as int   → set/change to that category
    # The Pydantic v2 distinction between "missing" and "explicit null" is
    # surfaced via model_fields_set; we read that in the update handler.
    category_id: int | None = None


class ProjectDeveloperResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    responsibilities: str | None
    is_admin: bool


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    key_prefix: str
    status: str
    created_at: str
    work_item_stats: dict
    developers: list[ProjectDeveloperResponse]


def _empty_stats() -> dict:
    return {
        "total": 0,
        "by_status": {},
        "total_points": 0,
        "completed": 0,
        "completion_pct": 0,
    }


def get_work_item_stats_batch(project_ids: list[int], db: Session) -> dict:
    """Return ``{project_id: stats_dict}`` for the given project ids.

    Runs a single GROUP BY query instead of one-pass-per-project. Items with a
    NULL status are bucketed as ``"todo"`` to match the legacy behavior of
    ``get_project_work_item_stats``.
    """
    from sqlalchemy import func

    from models.work_item import WorkItem

    if not project_ids:
        return {}

    status_expr = func.coalesce(WorkItem.status, "todo").label("status")
    rows = (
        db.query(
            WorkItem.project_id,
            status_expr,
            func.count().label("n"),
            func.coalesce(func.sum(WorkItem.story_points), 0).label("points"),
        )
        .filter(WorkItem.project_id.in_(project_ids))
        .group_by(WorkItem.project_id, status_expr)
        .all()
    )

    stats: dict = {pid: _empty_stats() for pid in project_ids}
    for row in rows:
        bucket = stats[row.project_id]
        bucket["by_status"][row.status] = row.n
        bucket["total"] += row.n
        bucket["total_points"] += int(row.points or 0)

    for bucket in stats.values():
        completed = bucket["by_status"].get("done", 0)
        total = bucket["total"]
        bucket["completed"] = completed
        bucket["completion_pct"] = round((completed / total * 100) if total > 0 else 0, 1)

    return stats


def _developers_by_project(project_ids: list[int], db: Session) -> dict:
    """Return ``{project_id: [developer_dict, ...]}`` in one query."""
    if not project_ids:
        return {}

    rows = db.execute(
        select(
            project_developers.c.project_id,
            Developer.id,
            Developer.name,
            Developer.email,
            Developer.github_username,
            project_developers.c.role,
            project_developers.c.responsibilities,
            project_developers.c.is_admin,
        )
        .join(project_developers, Developer.id == project_developers.c.developer_id)
        .where(project_developers.c.project_id.in_(project_ids))
    ).all()

    by_project: dict = {pid: [] for pid in project_ids}
    for row in rows:
        by_project[row.project_id].append(
            {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "github_username": row.github_username,
                "role": row.role,
                "responsibilities": row.responsibilities,
                "is_admin": row.is_admin,
            }
        )
    return by_project


def _architectures_by_project(project_ids: list[int], db: Session) -> dict:
    """Return ``{project_id: [Architecture, ...]}`` ordered by created_at desc."""
    if not project_ids:
        return {}

    rows = (
        db.query(Architecture)
        .filter(Architecture.project_id.in_(project_ids))
        .order_by(Architecture.created_at.desc())
        .all()
    )

    by_project: dict = {pid: [] for pid in project_ids}
    for arch in rows:
        by_project[arch.project_id].append(arch)
    return by_project


def format_projects_batch(projects: list[Project], db: Session) -> list[dict]:
    """Serialize a list of projects using batched DB lookups.

    Total query count: 3 (stats, developers, architectures) regardless of how
    many projects are passed in. Output is identical to calling
    ``format_project`` on each project individually.
    """
    project_ids = [p.id for p in projects]
    stats_by_id = get_work_item_stats_batch(project_ids, db)
    devs_by_id = _developers_by_project(project_ids, db)
    archs_by_id = _architectures_by_project(project_ids, db)

    out: list[dict] = []
    for project in projects:
        archs = archs_by_id.get(project.id, [])
        selected = next((a for a in archs if a.is_selected), None)

        github_repo_name = None
        if project.github_repo_url:
            github_repo_name = github_service.parse_repo_name(project.github_repo_url)

        out.append(
            {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "key_prefix": project.status or "PROJ",
                "status": project.status or "active",
                "github_repo_url": project.github_repo_url,
                "github_repo_urls": project.github_repo_urls
                if isinstance(project.github_repo_urls, list)
                else (project.github_repo_urls or []),
                "github_repo_name": github_repo_name,
                "created_at": project.created_at.isoformat()
                if project.created_at
                else datetime.utcnow().isoformat(),
                "end_date": project.end_date.isoformat() if project.end_date else None,
                "work_item_stats": stats_by_id.get(project.id, _empty_stats()),
                "developers": devs_by_id.get(project.id, []),
                "selected_architecture": selected.to_dict() if selected else None,
                # Category surface: flat fields the frontend can read without
                # joining. project.category is lazy="joined", so this lookup
                # is already in memory and adds no extra query.
                "category_id": project.category_id,
                "category_name": project.category.name if project.category else None,
                # NOTE: the full `architectures` list is intentionally NOT
                # serialized here — no client reads project.architectures (the
                # AI planning modal loads variants from /api/prd/analyze-*, a
                # different endpoint). Each arch carries mermaid_code +
                # cost_analysis JSON, so emitting the whole list bloated every
                # /api/projects response for nothing. Only the selected one ships.
            }
        )
    return out


def format_project(project: Project, db: Session) -> dict:
    """Single-project wrapper around ``format_projects_batch`` for backward compat."""
    return format_projects_batch([project], db)[0]


@router.post("/")
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("project.create")),
):
    """Create a new project (requires `project.create`)."""
    # Check for duplicate project name
    existing = db.query(Project).filter(Project.name == project.name).first()
    if existing:
        raise HTTPException(
            status_code=400, detail=f"Project with name '{project.name}' already exists"
        )

    # Parse GitHub repo name from URL
    github_repo_name = None
    github_repo_url = project.github_repo_url
    github_repo_urls = project.github_repo_urls or []

    # If single github_repo_url is provided, add it to the urls array
    if github_repo_url:
        github_repo_name = github_service.parse_repo_name(github_repo_url)
        if github_repo_url not in github_repo_urls:
            github_repo_urls.insert(0, github_repo_url)

    # Validate category before insert. Doing the lookup pre-commit means a bad
    # id 400s cleanly instead of bouncing off an FK constraint at flush time.
    if project.category_id is not None:
        from models.project_category import ProjectCategory

        cat_exists = (
            db.query(ProjectCategory.id).filter(ProjectCategory.id == project.category_id).first()
        )
        if not cat_exists:
            raise HTTPException(
                status_code=400,
                detail=f"Category {project.category_id} does not exist",
            )

    new_project = Project(
        name=project.name,
        description=project.description,
        status=project.key_prefix.upper().replace(" ", "") if project.key_prefix else "PROJ",
        github_repo_url=github_repo_url,
        github_repo_urls=github_repo_urls,
        github_repo_name=github_repo_name,
        category_id=project.category_id,
    )

    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    # Add creator as a project member with project admin role
    creator_dev = db.query(Developer).filter(Developer.email == current_user.email).first()
    if not creator_dev:
        # Create developer record if doesn't exist
        creator_dev = Developer(name=current_user.email.split("@")[0], email=current_user.email)
        db.add(creator_dev)
        db.commit()
        db.refresh(creator_dev)

    # Add creator as a project member (not admin by default)
    db.execute(
        insert(project_developers).values(
            project_id=new_project.id,
            developer_id=creator_dev.id,
            role="Project Creator",
            responsibilities=None,
            is_admin=False,
        )
    )
    db.commit()

    # Assign additional developers if provided
    if project.developers:
        for dev_assignment in project.developers:
            # Skip if this developer is already added as creator
            if dev_assignment.developer_id == creator_dev.id:
                continue

            # Verify developer exists
            developer = (
                db.query(Developer).filter(Developer.id == dev_assignment.developer_id).first()
            )
            if not developer:
                raise HTTPException(
                    status_code=400,
                    detail=f"Developer with ID {dev_assignment.developer_id} not found",
                )

            # Insert into association table (not admin by default)
            db.execute(
                insert(project_developers).values(
                    project_id=new_project.id,
                    developer_id=dev_assignment.developer_id,
                    role=dev_assignment.role,
                    responsibilities=dev_assignment.responsibilities,
                    is_admin=False,
                )
            )
        db.commit()

    return format_project(new_project, db)


@router.get("/")
def list_projects(
    category_id: int | None = None,
    uncategorized: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List projects (admin sees all, developers see assigned only).

    Optional filters:
        - ``?category_id=5`` → only projects in category 5
        - ``?uncategorized=true`` → only projects with no category assigned

    The two flags are mutually exclusive; if both are supplied,
    ``uncategorized`` wins (explicit "no category" beats a numeric id).
    """
    # Check if user has admin role (handles multi-role users like 'admin,developer')
    user_roles = [role.strip() for role in current_user.role.split(",")]
    is_admin = UserRole.ADMIN.value in user_roles

    if is_admin:
        query = db.query(Project)
    else:
        query = (
            db.query(Project)
            .join(project_developers)
            .join(Developer)
            .filter(Developer.email == current_user.email)
        )

    # Category filter applied to whichever base query is in use.
    if uncategorized:
        query = query.filter(Project.category_id.is_(None))
    elif category_id is not None:
        query = query.filter(Project.category_id == category_id)

    projects = query.all()
    return format_projects_batch(projects, db)


@router.get("/{project_id}")
def get_project(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get a project with work item stats (requires access)"""
    project = require_project_access(project_id, current_user, db)
    return format_project(project, db)


@router.put("/{project_id}")
def update_project(
    project_id: int,
    update: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a project's information.

    Restricted to project admins (`is_admin` on this project's membership)
    and system admins (`admin.projects` capability). Was previously
    `require_project_access` — i.e. any assigned developer — which let regular
    team members rename or restatus the project. Now matches the same gate
    used by add/remove/promote/demote-developer endpoints.
    """
    project = require_project_admin(project_id, current_user, db)

    # Update each field if provided
    if update.name is not None:
        project.name = update.name
    if update.description is not None:
        project.description = update.description
    if update.status is not None:
        project.status = update.status

    # Handle github_repo_url update
    if update.github_repo_url is not None:
        project.github_repo_url = update.github_repo_url
        # Update github_repo_name
        if update.github_repo_url:  # Parse only if not empty
            project.github_repo_name = github_service.parse_repo_name(update.github_repo_url)
        else:
            project.github_repo_name = None
        print(f"[DEBUG] Updated github_repo_url to: {project.github_repo_url}")

    # Handle github_repo_urls update
    if update.github_repo_urls is not None:
        project.github_repo_urls = update.github_repo_urls
        flag_modified(project, "github_repo_urls")
        # Also set primary github_repo_url to the first one in the list if available
        if update.github_repo_urls and len(update.github_repo_urls) > 0:
            project.github_repo_url = update.github_repo_urls[0]
            project.github_repo_name = github_service.parse_repo_name(update.github_repo_urls[0])

    # Handle dates
    import contextlib

    if update.created_at is not None:
        with contextlib.suppress(ValueError, TypeError):
            # Parse YYYY-MM-DD format from frontend
            project.created_at = datetime.strptime(update.created_at, "%Y-%m-%d")
    if update.end_date is not None:
        with contextlib.suppress(ValueError, TypeError):
            # Parse YYYY-MM-DD format from frontend
            project.end_date = datetime.strptime(update.end_date, "%Y-%m-%d")

    # Category — three states: omitted (no-op), explicit null (clear),
    # explicit id (set/change). model_fields_set distinguishes "omitted"
    # from "explicit null" since both serialize as None on the model.
    if "category_id" in update.model_fields_set:
        from models.project_category import ProjectCategory

        if update.category_id is None:
            project.category_id = None
        else:
            exists = (
                db.query(ProjectCategory.id)
                .filter(ProjectCategory.id == update.category_id)
                .first()
            )
            if not exists:
                raise HTTPException(
                    status_code=400,
                    detail=f"Category {update.category_id} does not exist",
                )
            project.category_id = update.category_id

    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)

    result = format_project(project, db)
    print(f"[DEBUG] Response with github_repo_url: {result.get('github_repo_url')}")
    return result


@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("admin.projects")),
):
    """Delete a project and its work items.

    Restricted to tool-level admins via the `admin.projects` capability —
    project-level admins (developers with `is_admin=True` on the project's
    membership row) cannot delete the project itself. Deleting a project is
    a tool-administration action, not a per-project workflow action. The
    capability is held by the `admin` system role (`*`) and any custom role
    that explicitly grants `admin.projects`.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete project (cascade will handle related records)
    db.delete(project)
    db.commit()
    return {"status": "deleted", "id": project_id}


@router.post("/{project_id}/github-invite")
def send_github_invitations(
    project_id: int,
    role: str = "push",  # pull, push, admin, maintain, triage
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send GitHub repository invitations to all project developers.
    Uses project-specific GitHub token if configured, otherwise uses global GITHUB_TOKEN.
    (requires auth)
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not project.github_repo_url:
        raise HTTPException(
            status_code=400, detail="Project has no GitHub repository URL configured"
        )

    # Parse repo name - prefer explicit repo_name if set
    repo_name = project.github_repo_name or github_service.parse_repo_name(project.github_repo_url)
    if not repo_name:
        raise HTTPException(status_code=400, detail="Invalid GitHub repository URL")

    # Use project-specific token or fall back to global token
    project_github_service = (
        GitHubService(token=project.github_token) if project.github_token else github_service
    )

    # Check GitHub configuration
    if not project_github_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="GitHub integration not configured. Set GITHUB_TOKEN environment variable or add a project-specific token in Admin.",
        )

    # Get developers with GitHub usernames
    developers = db.execute(
        select(Developer.id, Developer.name, Developer.github_username)
        .join(project_developers, Developer.id == project_developers.c.developer_id)
        .where(project_developers.c.project_id == project_id)
    ).all()

    # Filter developers with GitHub usernames
    github_usernames = [d.github_username for d in developers if d.github_username]

    if not github_usernames:
        return {
            "success": False,
            "message": "No developers with GitHub usernames found in this project",
            "developers_without_github": [
                {"id": d.id, "name": d.name} for d in developers if not d.github_username
            ],
        }

    # Send invitations using project-specific or global service
    result = project_github_service.send_bulk_invitations(repo_name, github_usernames, role)

    return {
        "success": result["failed"] == 0,
        "project_id": project_id,
        "repo_name": repo_name,
        "used_project_token": bool(project.github_token),
        "total_invitations": result["total"],
        "successful": result["successful"],
        "failed": result["failed"],
        "results": result["results"],
        "developers_without_github": [
            {"id": d.id, "name": d.name} for d in developers if not d.github_username
        ],
    }


@router.get("/{project_id}/github-status")
def check_github_status(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Check GitHub integration status for a project (requires auth)"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get developers with GitHub usernames
    developers = db.execute(
        select(Developer.id, Developer.github_username)
        .join(project_developers, Developer.id == project_developers.c.developer_id)
        .where(project_developers.c.project_id == project_id)
    ).all()

    developers_with_github = [d for d in developers if d.github_username]

    return {
        "has_repo": bool(project.github_repo_url),
        "repo_url": project.github_repo_url,
        "repo_name": project.github_repo_name,
        "developer_count": len(developers_with_github),
        "sent_count": 0,  # TODO: Track sent invitations in database
        "configured": github_service.is_configured(),
        "has_admin_access": github_service.validate_repo_access(project.github_repo_name)
        if project.github_repo_name
        else False,
    }


@router.post("/{project_id}/developers")
def add_developer_to_project(
    project_id: int,
    assignment: DeveloperAssignment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a developer to a project.

    Restricted to project admins (`is_admin` on this project's membership)
    and system admins (`admin.projects` capability). `require_project_admin`
    handles the 404-if-no-project and 403-if-not-admin cases and returns the
    loaded Project row, so we don't repeat the lookup.
    """
    require_project_admin(project_id, current_user, db)

    developer = db.query(Developer).filter(Developer.id == assignment.developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")

    # Check if already assigned
    existing = db.execute(
        select(project_developers).where(
            project_developers.c.project_id == project_id,
            project_developers.c.developer_id == assignment.developer_id,
        )
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Developer already assigned to this project")

    # Add to association table
    db.execute(
        insert(project_developers).values(
            project_id=project_id,
            developer_id=assignment.developer_id,
            role=assignment.role,
            responsibilities=assignment.responsibilities,
        )
    )
    db.commit()

    return {"status": "success", "message": f"Developer {developer.name} added to project"}


@router.delete("/{project_id}/developers/{developer_id}")
def remove_developer_from_project(
    project_id: int,
    developer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a developer from a project.

    Restricted to project admins and system admins — same gate as add/promote.
    """
    require_project_admin(project_id, current_user, db)

    # Delete from association table
    result = db.execute(
        project_developers.delete().where(
            project_developers.c.project_id == project_id,
            project_developers.c.developer_id == developer_id,
        )
    )

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Developer not found in this project")

    # Unassign all work items in this project that were assigned to the removed developer
    from models.work_item import WorkItem

    db.query(WorkItem).filter(
        WorkItem.project_id == project_id, WorkItem.assignee_id == developer_id
    ).update({"assignee_id": None}, synchronize_session=False)

    db.commit()
    return {"status": "success", "message": "Developer removed from project"}


# ============== PROJECT ADMIN MANAGEMENT ==============


@router.put("/{project_id}/developers/{developer_id}/admin")
def set_developer_as_admin(
    project_id: int,
    developer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Promote a developer to project admin (requires project admin access)"""
    require_project_admin(project_id, current_user, db)

    # Verify developer exists in project
    result = db.execute(
        select(project_developers).where(
            (project_developers.c.project_id == project_id)
            & (project_developers.c.developer_id == developer_id)
        )
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Developer not found in this project")

    # Update is_admin to True
    db.execute(
        project_developers.update()
        .where(
            (project_developers.c.project_id == project_id)
            & (project_developers.c.developer_id == developer_id)
        )
        .values(is_admin=True)
    )
    db.commit()

    return {"status": "success", "message": "Developer promoted to project admin"}


@router.put("/{project_id}/developers/{developer_id}/member")
def remove_admin_from_developer(
    project_id: int,
    developer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Demote a developer from project admin (requires project admin access)"""
    require_project_admin(project_id, current_user, db)

    # Get current user's developer record
    current_dev = db.query(Developer).filter(Developer.email == current_user.email).first()

    # Prevent demoting yourself if you're the last admin
    if current_dev and current_dev.id == developer_id:
        # Check if there are other admins
        other_admins = db.execute(
            select(project_developers).where(
                (project_developers.c.project_id == project_id)
                & (project_developers.c.developer_id != developer_id)
                & (project_developers.c.is_admin.is_(True))
            )
        ).first()

        if not other_admins:
            raise HTTPException(
                status_code=400, detail="Cannot demote yourself if you are the last project admin"
            )

    # Verify developer exists in project
    result = db.execute(
        select(project_developers).where(
            (project_developers.c.project_id == project_id)
            & (project_developers.c.developer_id == developer_id)
        )
    ).first()

    if not result:
        raise HTTPException(status_code=404, detail="Developer not found in this project")

    # Update is_admin to False
    db.execute(
        project_developers.update()
        .where(
            (project_developers.c.project_id == project_id)
            & (project_developers.c.developer_id == developer_id)
        )
        .values(is_admin=False)
    )
    db.commit()

    return {"status": "success", "message": "Developer removed from project admin role"}


# ============== PROJECT HUB ENDPOINTS ==============

# --- Goals ---


class GoalCreate(BaseModel):
    title: str
    description: str | None = None
    due_date: datetime | None = None


class GoalUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    progress: int | None = None
    due_date: datetime | None = None


@router.get("/{project_id}/goals")
def get_project_goals(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get all goals for a project"""
    require_project_access(project_id, current_user, db)

    from models.project_goal import ProjectGoal

    goals = (
        db.query(ProjectGoal)
        .filter(ProjectGoal.project_id == project_id)
        .order_by(ProjectGoal.created_at.desc())
        .all()
    )
    return [g.to_dict() for g in goals]


@router.post("/{project_id}/goals")
def create_project_goal(
    project_id: int,
    goal: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new project goal"""
    require_project_access(project_id, current_user, db)

    from models.activity_log import ActivityLog
    from models.project_goal import ProjectGoal

    new_goal = ProjectGoal(
        project_id=project_id,
        title=goal.title,
        description=goal.description,
        due_date=goal.due_date,
    )
    db.add(new_goal)

    # Log activity
    activity = ActivityLog(
        project_id=project_id,
        user_id=current_user.id,
        action="created",
        entity_type="goal",
        entity_id=new_goal.id,
        title=f"Created goal: {goal.title}",
    )
    db.add(activity)

    db.commit()
    db.refresh(new_goal)
    return new_goal.to_dict()


@router.put("/goals/{goal_id}")
def update_project_goal(
    goal_id: int,
    goal_update: GoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a project goal"""
    from models.activity_log import ActivityLog
    from models.project_goal import ProjectGoal

    goal = db.query(ProjectGoal).filter(ProjectGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    require_project_access(goal.project_id, current_user, db)

    if goal_update.title is not None:
        goal.title = goal_update.title
    if goal_update.description is not None:
        goal.description = goal_update.description
    if goal_update.status is not None:
        goal.status = goal_update.status
        if goal_update.status == "completed":
            goal.completed_at = datetime.utcnow()
    if goal_update.progress is not None:
        goal.progress = goal_update.progress
    if goal_update.due_date is not None:
        goal.due_date = goal_update.due_date

    goal.updated_at = datetime.utcnow()

    # Log activity
    activity = ActivityLog(
        project_id=goal.project_id,
        user_id=current_user.id,
        action="updated",
        entity_type="goal",
        entity_id=goal.id,
        title=f"Updated goal: {goal.title}",
    )
    db.add(activity)

    db.commit()
    return goal.to_dict()


@router.delete("/goals/{goal_id}")
def delete_project_goal(
    goal_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a project goal"""
    from models.activity_log import ActivityLog
    from models.project_goal import ProjectGoal

    goal = db.query(ProjectGoal).filter(ProjectGoal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")

    require_project_access(goal.project_id, current_user, db)

    # Log activity before deletion
    activity = ActivityLog(
        project_id=goal.project_id,
        user_id=current_user.id,
        action="deleted",
        entity_type="goal",
        title=f"Deleted goal: {goal.title}",
    )
    db.add(activity)

    db.delete(goal)
    db.commit()
    return {"status": "deleted", "id": goal_id}


# --- Milestones ---


class MilestoneCreate(BaseModel):
    title: str
    description: str | None = None
    due_date: datetime | None = None


@router.get("/{project_id}/milestones")
def get_project_milestones(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get all milestones for a project"""
    require_project_access(project_id, current_user, db)

    from models.project_milestone import ProjectMilestone

    milestones = (
        db.query(ProjectMilestone)
        .filter(ProjectMilestone.project_id == project_id)
        .order_by(ProjectMilestone.due_date)
        .all()
    )
    return [m.to_dict() for m in milestones]


@router.post("/{project_id}/milestones")
def create_project_milestone(
    project_id: int,
    milestone: MilestoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new project milestone"""
    require_project_access(project_id, current_user, db)

    from models.activity_log import ActivityLog
    from models.project_milestone import ProjectMilestone

    new_milestone = ProjectMilestone(
        project_id=project_id,
        title=milestone.title,
        description=milestone.description,
        due_date=milestone.due_date,
    )
    db.add(new_milestone)

    # Log activity
    activity = ActivityLog(
        project_id=project_id,
        user_id=current_user.id,
        action="created",
        entity_type="milestone",
        entity_id=new_milestone.id,
        title=f"Created milestone: {milestone.title}",
    )
    db.add(activity)

    db.commit()
    db.refresh(new_milestone)
    return new_milestone.to_dict()


@router.put("/milestones/{milestone_id}")
def update_project_milestone(
    milestone_id: int,
    milestone_update: MilestoneCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a project milestone"""
    from models.project_milestone import ProjectMilestone

    milestone = db.query(ProjectMilestone).filter(ProjectMilestone.id == milestone_id).first()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    require_project_access(milestone.project_id, current_user, db)

    milestone.title = milestone_update.title
    milestone.description = milestone_update.description
    milestone.due_date = milestone_update.due_date

    db.commit()
    return milestone.to_dict()


@router.post("/milestones/{milestone_id}/complete")
def complete_project_milestone(
    milestone_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Mark a milestone as completed"""
    from models.activity_log import ActivityLog
    from models.project_milestone import ProjectMilestone

    milestone = db.query(ProjectMilestone).filter(ProjectMilestone.id == milestone_id).first()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    require_project_access(milestone.project_id, current_user, db)

    milestone.completed_at = datetime.utcnow()

    # Log activity
    activity = ActivityLog(
        project_id=milestone.project_id,
        user_id=current_user.id,
        action="completed",
        entity_type="milestone",
        entity_id=milestone.id,
        title=f"Completed milestone: {milestone.title}",
    )
    db.add(activity)

    db.commit()
    return milestone.to_dict()


@router.delete("/milestones/{milestone_id}")
def delete_project_milestone(
    milestone_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a project milestone"""
    from models.activity_log import ActivityLog
    from models.project_milestone import ProjectMilestone

    milestone = db.query(ProjectMilestone).filter(ProjectMilestone.id == milestone_id).first()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")

    require_project_access(milestone.project_id, current_user, db)

    # Log activity before deletion
    activity = ActivityLog(
        project_id=milestone.project_id,
        user_id=current_user.id,
        action="deleted",
        entity_type="milestone",
        title=f"Deleted milestone: {milestone.title}",
    )
    db.add(activity)

    db.delete(milestone)
    db.commit()
    return {"status": "deleted", "id": milestone_id}


# --- Activity Feed ---


@router.get("/{project_id}/activity")
def get_project_activity(
    project_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get activity feed for a project"""
    require_project_access(project_id, current_user, db)

    from models.activity_log import ActivityLog

    activities = (
        db.query(ActivityLog)
        .filter(ActivityLog.project_id == project_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )

    return [a.to_dict() for a in activities]


# --- Workload ---


def get_working_days_in_range(start_date: datetime, end_date: datetime) -> int:
    """Calculate number of working days (Mon-Fri) between two dates"""
    from datetime import timedelta

    if not start_date or not end_date:
        return 0

    # Ensure start <= end
    if start_date > end_date:
        start_date, end_date = end_date, start_date

    working_days = 0
    current = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = end_date.replace(hour=0, minute=0, second=0, microsecond=0)

    while current <= end:
        # weekday(): Monday=0, Sunday=6
        if current.weekday() < 5:  # Mon-Fri
            working_days += 1
        current += timedelta(days=1)

    return working_days


def calculate_hours_excluding_weekends(
    total_hours: int, start_date: datetime, end_date: datetime
) -> int:
    """Calculate hours proportionally excluding weekend days"""
    if not start_date or not end_date or total_hours <= 0:
        return 0

    # Total days in range
    total_days = (end_date - start_date).days + 1
    if total_days <= 0:
        return total_hours

    # Working days in range
    working_days = get_working_days_in_range(start_date, end_date)

    # If no working days (task spans only weekend), return 0
    if working_days == 0:
        return 0

    # Proportional hours: (working_days / total_days) * total_hours
    # But simpler: assume hours are evenly distributed across working days only
    hours_per_day = total_hours / total_days
    return int(hours_per_day * working_days)


@router.get("/{project_id}/workload")
def get_project_workload(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get workload + Sat-Fri weekly capacity for all assignees in this project.

    Capacity rules (status-based, transfer-aware) live in
    backend/services/capacity_service.py — same logic as the admin capacity endpoint.
    """
    require_project_access(project_id, current_user, db)

    from sqlalchemy.orm import selectinload

    from models.work_item import WorkItem
    from services.capacity_service import compute_capacity_breakdown, week_boundaries

    week_start, week_end = week_boundaries()
    items = (
        db.query(WorkItem)
        .options(selectinload(WorkItem.assignee))
        .filter(WorkItem.project_id == project_id)
        .all()
    )

    workload_data: dict = {}

    for item in items:
        assignee_id = item.assignee_id if item.assignee_id else "unassigned"

        if assignee_id not in workload_data:
            assignee_name = item.assignee.name if item.assignee else "Unassigned"
            workload_data[assignee_id] = {
                "developer_id": assignee_id,
                "developer_name": assignee_name,
                "total_items": 0,
                "completed_items": 0,
                "in_progress_items": 0,
                "todo_items": 0,
                "overdue_items": 0,
                "estimated_hours": 0,
                "logged_hours": 0,
                "remaining_hours": 0,
                "_items": [],  # collected, used by helper below
                "items": [],  # public list, kept for backwards compat
            }

        bucket = workload_data[assignee_id]
        bucket["total_items"] += 1
        bucket["estimated_hours"] += item.estimated_hours or 0
        bucket["logged_hours"] += item.logged_hours or 0
        bucket["remaining_hours"] += item.remaining_hours or 0
        bucket["_items"].append(item)

        if item.status == "done":
            bucket["completed_items"] += 1
        elif item.status == "in_progress":
            bucket["in_progress_items"] += 1
        else:
            bucket["todo_items"] += 1

        if item.due_date and item.due_date < datetime.utcnow() and item.status != "done":
            bucket["overdue_items"] += 1

        bucket["items"].append(
            {
                "id": item.id,
                "key": item.key,
                "title": item.title,
                "status": item.status,
                "priority": item.priority,
                "due_date": item.due_date.isoformat() if item.due_date else None,
                "estimated_hours": item.estimated_hours,
                "logged_hours": item.logged_hours,
            }
        )

    # Apply the shared Sat-Fri capacity helper per-assignee (skip "unassigned")
    for dev_id, bucket in workload_data.items():
        if dev_id == "unassigned":
            bucket.update(
                {
                    "this_week_in_progress_hours": 0,
                    "this_week_in_review_hours": 0,
                    "this_week_done_hours": 0,
                    "this_week_capacity_used": 0,
                    "this_week_remaining_capacity": 40,
                    "this_week_tickets": [],
                }
            )
        else:
            breakdown = compute_capacity_breakdown(
                bucket["_items"],
                week_start,
                db=db,
                developer_id=dev_id,
                restrict_to_project_ids={project_id},
            )
            bucket.update(
                {
                    "this_week_in_progress_hours": breakdown["this_week_in_progress_hours"],
                    "this_week_in_review_hours": breakdown["this_week_in_review_hours"],
                    "this_week_done_hours": breakdown["this_week_done_hours"],
                    "this_week_capacity_used": breakdown["this_week_capacity_used"],
                    "this_week_remaining_capacity": breakdown["this_week_remaining_capacity"],
                    "this_week_tickets": breakdown["tickets"],
                }
            )
        bucket["week_start"] = week_start.isoformat()
        bucket["week_end"] = week_end.isoformat()
        bucket.pop("_items", None)

    return list(workload_data.values())


# ============================================================================
# FILE MANAGEMENT ENDPOINTS
# ============================================================================


class ProjectFileResponse(BaseModel):
    id: int
    file_name: str
    file_size: int
    file_type: str
    file_url: str
    uploaded_by: str
    created_at: str


@router.get("/{project_id}/files")
def get_project_files(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get all files for a project"""
    from models.project_file import ProjectFile

    require_project_access(project_id, current_user, db)

    files = (
        db.query(ProjectFile)
        .filter(ProjectFile.project_id == project_id)
        .order_by(ProjectFile.created_at.desc())
        .all()
    )

    return [
        {
            "id": f.id,
            "file_name": f.file_name,
            "file_size": f.file_size,
            "file_type": f.file_type,
            "file_url": f.file_url,
            "uploaded_by": f.uploaded_by_name,
            "created_at": f.created_at.isoformat(),
        }
        for f in files
    ]


@router.post("/{project_id}/files")
async def upload_project_file(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to a project"""
    from models.project_file import ProjectFile

    require_project_access(project_id, current_user, db)

    # Create uploads directory if it doesn't exist
    upload_dir = "uploads/projects"
    os.makedirs(upload_dir, exist_ok=True)

    # Create project-specific directory
    project_upload_dir = os.path.join(upload_dir, str(project_id))
    os.makedirs(project_upload_dir, exist_ok=True)

    # Save file
    file_path = os.path.join(project_upload_dir, file.filename)
    try:
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}") from e

    # Get file size
    file_size = os.path.getsize(file_path)

    # Create database record
    db_file = ProjectFile(
        project_id=project_id,
        file_name=file.filename,
        file_size=file_size,
        file_type=file.content_type or "application/octet-stream",
        file_url="",  # Will be set after commit to get the ID
        uploaded_by=current_user.id,
        uploaded_by_name=current_user.email,
    )

    db.add(db_file)
    db.commit()
    db.refresh(db_file)

    # Update file_url with the actual file ID
    db_file.file_url = f"/api/projects/{project_id}/files/{db_file.id}/download"
    db.commit()

    return {
        "id": db_file.id,
        "file_name": db_file.file_name,
        "file_size": db_file.file_size,
        "file_type": db_file.file_type,
        "file_url": db_file.file_url,
        "uploaded_by": db_file.uploaded_by_name,
        "created_at": db_file.created_at.isoformat(),
    }


@router.get("/{project_id}/files/{file_id}/download")
def download_project_file(
    project_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a file from a project"""
    from models.project_file import ProjectFile

    require_project_access(project_id, current_user, db)

    db_file = (
        db.query(ProjectFile)
        .filter(ProjectFile.id == file_id, ProjectFile.project_id == project_id)
        .first()
    )

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Build file path
    upload_dir = "uploads/projects"
    project_dir = os.path.join(upload_dir, str(project_id))
    file_path = os.path.join(project_dir, db_file.file_name)

    # Check if file exists
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    # Return file with proper headers
    return FileResponse(path=file_path, filename=db_file.file_name, media_type=db_file.file_type)


@router.delete("/{project_id}/files/{file_id}")
def delete_project_file(
    project_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a file from a project"""
    from models.project_file import ProjectFile

    require_project_access(project_id, current_user, db)

    db_file = (
        db.query(ProjectFile)
        .filter(ProjectFile.id == file_id, ProjectFile.project_id == project_id)
        .first()
    )

    if not db_file:
        raise HTTPException(status_code=404, detail="File not found")

    # Delete physical file
    try:
        upload_dir = "uploads/projects"
        # Try to find and delete the file
        project_dir = os.path.join(upload_dir, str(project_id))
        if os.path.exists(project_dir):
            for filename in os.listdir(project_dir):
                if filename.startswith(os.path.splitext(db_file.file_name)[0]):
                    os.remove(os.path.join(project_dir, filename))
                    break
    except Exception as e:
        # Log error but don't fail - still delete DB record
        print(f"Error deleting file: {e}")

    # Delete database record
    db.delete(db_file)
    db.commit()

    return {"success": True, "message": "File deleted"}


# Project Links Endpoints
class ProjectLinkCreate(BaseModel):
    name: str
    url: str


class ProjectLinkResponse(BaseModel):
    id: int
    name: str
    url: str
    created_at: str


@router.get("/{project_id}/links", response_model=list[ProjectLinkResponse])
def get_project_links(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Get all links for a project"""
    from models.project_link import ProjectLink

    require_project_access(project_id, user, db)

    links = (
        db.query(ProjectLink)
        .filter(ProjectLink.project_id == project_id)
        .order_by(ProjectLink.created_at.desc())
        .all()
    )
    return [
        {
            "id": link.id,
            "name": link.name,
            "url": link.url,
            "created_at": link.created_at.isoformat(),
        }
        for link in links
    ]


@router.post("/{project_id}/links", response_model=ProjectLinkResponse)
def create_project_link(
    project_id: int,
    link_data: ProjectLinkCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new link for a project"""
    from models.project_link import ProjectLink

    require_project_access(project_id, user, db)

    new_link = ProjectLink(project_id=project_id, name=link_data.name, url=link_data.url)

    db.add(new_link)
    db.commit()
    db.refresh(new_link)

    return {
        "id": new_link.id,
        "name": new_link.name,
        "url": new_link.url,
        "created_at": new_link.created_at.isoformat(),
    }


@router.delete("/{project_id}/links/{link_id}")
def delete_project_link(
    project_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a link from a project"""
    from models.project_link import ProjectLink

    require_project_access(project_id, user, db)

    link = (
        db.query(ProjectLink)
        .filter(ProjectLink.id == link_id, ProjectLink.project_id == project_id)
        .first()
    )

    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    db.delete(link)
    db.commit()

    return {"success": True, "message": "Link deleted"}
