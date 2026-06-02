"""Admin router - Employee and developer management"""

import sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

sys.path.append("..")
from database import get_db
from models.developer import Developer
from models.project import Project
from models.work_item import WorkItem
from routers.auth import require_capability

router = APIRouter(prefix="/api/admin", tags=["admin"])


class EmployeeCreate(BaseModel):
    name: str
    email: str
    github_username: str | None = None
    avatar_url: str | None = None
    specialization: str | None = None  # frontend, backend, devops, etc.


class EmployeeUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    github_username: str | None = None
    avatar_url: str | None = None
    specialization: str | None = None


class EmployeeResponse(BaseModel):
    id: int
    name: str
    email: str
    github_username: str | None
    avatar_url: str | None
    specialization: str | None
    created_at: datetime
    updated_at: datetime
    project_count: int
    assigned_items_count: int

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_employees: int
    total_projects: int
    total_tickets: int
    active_sprints: int
    tickets_by_status: dict
    tickets_by_priority: dict


# Developer specialization mapping
SPECIALIZATIONS = [
    "frontend",
    "backend",
    "fullstack",
    "devops",
    "qa",
    "mobile",
    "data",
    "ml",
    "design",
    "pm",
]


@router.get(
    "/stats",
    response_model=DashboardStats,
    dependencies=[Depends(require_capability("admin.dashboard"))],
)
def get_dashboard_stats(db: Session = Depends(get_db)):
    """Get admin dashboard statistics.

    NOTE: This used to backfill missing Developer rows for active Users on GET.
    That side-effect has been moved to ``backend/scripts/backfill_developers.py``
    which must be run once at deploy.
    """
    from models.sprint import Sprint

    total_employees = db.query(Developer).count()
    total_projects = db.query(Project).count()
    total_tickets = db.query(WorkItem).count()
    active_sprints = db.query(Sprint).filter(Sprint.status == "active").count()

    # Tickets by status (single GROUP BY replaces 5 separate COUNTs)
    status_rows = db.query(WorkItem.status, func.count(WorkItem.id)).group_by(WorkItem.status).all()
    status_counts = {s: c for s, c in status_rows}
    tickets_by_status = {
        s: int(status_counts.get(s, 0))
        for s in ("backlog", "todo", "in_progress", "in_review", "done")
    }

    # Tickets by priority (single GROUP BY replaces 4 separate COUNTs)
    priority_rows = (
        db.query(WorkItem.priority, func.count(WorkItem.id)).group_by(WorkItem.priority).all()
    )
    priority_counts = {p: c for p, c in priority_rows}
    tickets_by_priority = {
        p: int(priority_counts.get(p, 0)) for p in ("low", "medium", "high", "critical")
    }

    return DashboardStats(
        total_employees=total_employees,
        total_projects=total_projects,
        total_tickets=total_tickets,
        active_sprints=active_sprints,
        tickets_by_status=tickets_by_status,
        tickets_by_priority=tickets_by_priority,
    )


@router.get(
    "/employees",
    response_model=list[EmployeeResponse],
    dependencies=[Depends(require_capability("admin.employees"))],
)
def list_employees(db: Session = Depends(get_db)):
    """Get all internal employees/developers. External users (created via
    Admin → Users → Add User) are intentionally excluded — they live in the
    Users tab, not the Employees tab."""
    # selectinload (NOT joinedload) both collections: joinedload-ing two
    # collections would produce a projects × work_items cartesian product.
    # selectinload issues 2 extra batched queries → 3 total regardless of count.
    developers = (
        db.query(Developer)
        .options(
            selectinload(Developer.projects),
            selectinload(Developer.assigned_work_items),
        )
        .filter(Developer.is_external.is_(False))
        .all()
    )

    result = []
    for dev in developers:
        # Get specialization from metadata if available
        specialization = getattr(dev, "specialization", None)

        result.append(
            EmployeeResponse(
                id=dev.id,
                name=dev.name,
                email=dev.email,
                github_username=dev.github_username,
                avatar_url=dev.avatar_url,
                specialization=specialization,
                created_at=dev.created_at,
                updated_at=dev.updated_at,
                project_count=len(dev.projects) if dev.projects else 0,
                assigned_items_count=len(dev.assigned_work_items) if dev.assigned_work_items else 0,
            )
        )

    return result


@router.get(
    "/developers/capacity",
    dependencies=[Depends(require_capability("admin.developers_capacity"))],
)
def get_developers_capacity(db: Session = Depends(get_db)):
    """Get weekly capacity for all developers across all projects.

    Saturday-Friday week. See backend/services/capacity_service.py for the rules.
    Response embeds a per-ticket breakdown so the UI can drill down without a
    second round-trip.
    """
    from collections import defaultdict
    from datetime import timedelta

    from models.project import Project
    from models.time_entry import TimeEntry
    from services.capacity_service import compute_capacity_breakdown, week_boundaries

    week_start, week_end = week_boundaries()

    # Single query that eager-loads each developer's assigned work items + each
    # work item's project. Replaces the prior N+1 (1 query per developer).
    developers = (
        db.query(Developer)
        .options(
            joinedload(Developer.assigned_work_items).joinedload(WorkItem.project),
            joinedload(Developer.projects),
        )
        .all()
    )

    # Pull every time entry for every developer in a single query — used below
    # to build a per-dev weekly-logged-hours history across ALL projects, split
    # by project per week.
    all_entries = (
        db.query(TimeEntry)
        .filter(TimeEntry.developer_id.isnot(None))
        .filter(TimeEntry.logged_at.isnot(None))
        .all()
    )
    entries_by_dev: dict[int, list[TimeEntry]] = defaultdict(list)
    for te in all_entries:
        entries_by_dev[te.developer_id].append(te)

    # Resolve work_item → project_id and project_id → project_name in two cheap lookups.
    wi_ids = {te.work_item_id for te in all_entries}
    wi_to_project = (
        dict(db.query(WorkItem.id, WorkItem.project_id).filter(WorkItem.id.in_(wi_ids)).all())
        if wi_ids
        else {}
    )
    project_ids = {pid for pid in wi_to_project.values() if pid is not None}
    project_names = (
        dict(db.query(Project.id, Project.name).filter(Project.id.in_(project_ids)).all())
        if project_ids
        else {}
    )

    def _weekly_history_for(dev_id: int) -> list[dict]:
        """Bucket this dev's time entries into Sat→Fri UTC weeks across all projects,
        with a per-project split per week."""
        # (week_start, project_id) → hours
        proj_bucket: dict = defaultdict(int)
        week_totals: dict = defaultdict(int)
        weeks: set = set()
        for te in entries_by_dev.get(dev_id, []):
            if not te.logged_at:
                continue
            days_back = (te.logged_at.weekday() + 2) % 7  # Sat=5 → 0
            ws = (te.logged_at - timedelta(days=days_back)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            pid = wi_to_project.get(te.work_item_id)
            proj_bucket[(ws, pid)] += te.hours or 0
            week_totals[ws] += te.hours or 0
            weeks.add(ws)

        out = []
        for ws in sorted(weeks, reverse=True):
            projects_in_week = [
                {
                    "project_id": pid,
                    "project_name": project_names.get(pid, "Unknown")
                    if pid is not None
                    else "Unknown",
                    "hours": hrs,
                }
                for (w, pid), hrs in proj_bucket.items()
                if w == ws
            ]
            projects_in_week.sort(key=lambda p: -p["hours"])
            out.append(
                {
                    "week_start": ws.isoformat(),
                    "week_end": (
                        ws + timedelta(days=6, hours=23, minutes=59, seconds=59)
                    ).isoformat(),
                    "hours": week_totals[ws],
                    "projects": projects_in_week,
                }
            )
        return out

    result = []
    for dev in developers:
        breakdown = compute_capacity_breakdown(
            dev.assigned_work_items or [],
            week_start,
            db=db,
            developer_id=dev.id,
        )
        result.append(
            {
                "developer_id": dev.id,
                "developer_name": dev.name,
                "developer_email": dev.email,
                "avatar_url": dev.avatar_url,
                "project_count": len(dev.projects) if dev.projects else 0,
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
                "specialization": getattr(dev, "specialization", None),
                "weekly_logged_history": _weekly_history_for(dev.id),
                **breakdown,
            }
        )

    return result


class EmployeeTicketResponse(BaseModel):
    id: int
    title: str
    description: str | None
    status: str
    priority: str
    project_id: int
    project_name: str
    assigned_to: int | None
    assigned_to_name: str | None
    estimated_hours: int | None
    logged_hours: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get(
    "/employees/{employee_id}/in-progress-tickets",
    response_model=list[EmployeeTicketResponse],
    dependencies=[Depends(require_capability("admin.employees"))],
)
def get_employee_in_progress_tickets(employee_id: int, db: Session = Depends(get_db)):
    """Get all active tickets assigned to an employee across all projects, sorted by priority"""
    from sqlalchemy import case

    # Verify employee exists
    employee = db.query(Developer).filter(Developer.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Priority order: critical > high > medium > low
    priority_order = case(
        (WorkItem.priority == "critical", 1),
        (WorkItem.priority == "high", 2),
        (WorkItem.priority == "medium", 3),
        (WorkItem.priority == "low", 4),
        else_=5,
    )

    # Get only in-progress work items assigned to this employee
    work_items = (
        db.query(WorkItem)
        .filter(WorkItem.assignee_id == employee_id, WorkItem.status == "in_progress")
        .order_by(priority_order)
        .all()
    )

    result = []
    for item in work_items:
        # Get project name
        project_name = item.project.name if item.project else "Unknown Project"

        result.append(
            EmployeeTicketResponse(
                id=item.id,
                title=item.title,
                description=item.description,
                status=item.status,
                priority=item.priority,
                project_id=item.project_id,
                project_name=project_name,
                assigned_to=item.assignee_id,
                assigned_to_name=employee.name,
                estimated_hours=item.estimated_hours,
                logged_hours=item.logged_hours or 0,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
        )

    return result


@router.post(
    "/employees",
    response_model=EmployeeResponse,
    dependencies=[Depends(require_capability("admin.employees"))],
)
def create_employee(employee: EmployeeCreate, db: Session = Depends(get_db)):
    """Create a new employee/developer"""
    from models.user import User, UserRole

    # Check if email already exists in developers
    existing = db.query(Developer).filter(Developer.email == employee.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    # Normalize blank github_username to NULL so multiple blanks don't collide on the UNIQUE index
    github_username = employee.github_username.strip() if employee.github_username else None
    if not github_username:
        github_username = None

    # Check github username uniqueness if provided
    if github_username:
        existing_github = (
            db.query(Developer).filter(Developer.github_username == github_username).first()
        )
        if existing_github:
            raise HTTPException(status_code=400, detail="GitHub username already exists")

    new_employee = Developer(
        name=employee.name,
        email=employee.email,
        github_username=github_username,
        avatar_url=employee.avatar_url,
    )

    db.add(new_employee)
    db.commit()
    db.refresh(new_employee)

    # Also create a User record if it doesn't exist
    existing_user = db.query(User).filter(User.email == employee.email).first()
    if not existing_user:
        new_user = User(
            email=employee.email,
            name=employee.name,
            hashed_password="",  # Empty password for manually created employees
            role=UserRole.DEVELOPER.value,
            is_active=True,
            is_first_login=False,
        )
        db.add(new_user)
        db.commit()

    return EmployeeResponse(
        id=new_employee.id,
        name=new_employee.name,
        email=new_employee.email,
        github_username=new_employee.github_username,
        avatar_url=new_employee.avatar_url,
        specialization=employee.specialization,
        created_at=new_employee.created_at,
        updated_at=new_employee.updated_at,
        project_count=0,
        assigned_items_count=0,
    )


@router.put(
    "/employees/{employee_id}",
    response_model=EmployeeResponse,
    dependencies=[Depends(require_capability("admin.employees"))],
)
def update_employee(employee_id: int, update: EmployeeUpdate, db: Session = Depends(get_db)):
    """Update an employee/developer"""
    employee = db.query(Developer).filter(Developer.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if update.name:
        employee.name = update.name
    if update.email:
        # Check email uniqueness
        existing = (
            db.query(Developer)
            .filter(Developer.email == update.email, Developer.id != employee_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")
        employee.email = update.email
    if update.github_username is not None:
        # Normalize blank to NULL so it doesn't collide on the UNIQUE index
        new_github = update.github_username.strip() or None
        if new_github:
            existing_github = (
                db.query(Developer)
                .filter(Developer.github_username == new_github, Developer.id != employee_id)
                .first()
            )
            if existing_github:
                raise HTTPException(status_code=400, detail="GitHub username already exists")
        employee.github_username = new_github
    if update.avatar_url is not None:
        employee.avatar_url = update.avatar_url

    db.commit()
    db.refresh(employee)

    return EmployeeResponse(
        id=employee.id,
        name=employee.name,
        email=employee.email,
        github_username=employee.github_username,
        avatar_url=employee.avatar_url,
        specialization=update.specialization,
        created_at=employee.created_at,
        updated_at=employee.updated_at,
        project_count=len(employee.projects) if employee.projects else 0,
        assigned_items_count=len(employee.assigned_work_items)
        if employee.assigned_work_items
        else 0,
    )


@router.delete(
    "/employees/{employee_id}",
    dependencies=[Depends(require_capability("admin.employees"))],
)
def delete_employee(employee_id: int, db: Session = Depends(get_db)):
    """Delete an employee/developer and their user account"""
    from models.user import User

    employee = db.query(Developer).filter(Developer.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Unassign from work items
    db.query(WorkItem).filter(WorkItem.assignee_id == employee_id).update({"assignee_id": None})

    # Delete corresponding user record
    user = db.query(User).filter(User.email == employee.email).first()
    if user:
        db.delete(user)

    # Delete employee
    db.delete(employee)
    db.commit()

    return {"message": "Employee and user account deleted"}


@router.get("/specializations")
def get_specializations():
    """Get list of available specializations"""
    return {"specializations": SPECIALIZATIONS}


class ProjectGitHubUpdate(BaseModel):
    github_repo_url: str | None = None
    github_repo_name: str | None = None
    github_token: str | None = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None
    status: str
    created_at: str | None
    total_items: int
    done_items: int
    completion_pct: float
    developer_count: int
    github_repo_url: str | None
    github_repo_name: str | None
    has_github_token: bool

    class Config:
        from_attributes = True


@router.get(
    "/projects",
    response_model=list[ProjectResponse],
    dependencies=[Depends(require_capability("admin.projects"))],
)
def list_all_projects(db: Session = Depends(get_db)):
    """Get all projects with stats for admin"""
    # selectinload (NOT joinedload) both collections to avoid a
    # work_items × developers cartesian product; 3 queries total regardless
    # of project count (was 1 + 2N from per-project lazy loads).
    projects = (
        db.query(Project)
        .options(
            selectinload(Project.work_items),
            selectinload(Project.developers),
        )
        .all()
    )

    result = []
    for project in projects:
        total_items = len(project.work_items) if project.work_items else 0
        done_items = len([i for i in (project.work_items or []) if i.status == "done"])

        result.append(
            ProjectResponse(
                id=project.id,
                name=project.name,
                description=project.description,
                status=project.status,
                created_at=project.created_at.isoformat() if project.created_at else None,
                total_items=total_items,
                done_items=done_items,
                completion_pct=round((done_items / total_items * 100) if total_items > 0 else 0, 1),
                developer_count=len(project.developers) if project.developers else 0,
                github_repo_url=project.github_repo_url,
                github_repo_name=project.github_repo_name,
                has_github_token=bool(project.github_token),
            )
        )

    return result


@router.put(
    "/projects/{project_id}/github",
    dependencies=[Depends(require_capability("admin.projects"))],
)
def update_project_github(
    project_id: int, update: ProjectGitHubUpdate, db: Session = Depends(get_db)
):
    """Update project GitHub settings"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if update.github_repo_url is not None:
        project.github_repo_url = update.github_repo_url
    if update.github_repo_name is not None:
        project.github_repo_name = update.github_repo_name
    if update.github_token is not None:
        project.github_token = update.github_token

    db.commit()
    db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "github_repo_url": project.github_repo_url,
        "github_repo_name": project.github_repo_name,
        "has_github_token": bool(project.github_token),
    }
