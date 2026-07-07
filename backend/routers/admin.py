"""Admin router - Employee and developer management"""

import sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

# NOTE: `cast(TimeEntry.logged_at, Date)` (as sketched in the perf plan) is NOT
# used here: on SQLite (tests) `CAST(... AS DATE)` is a no-op that returns the
# full datetime string, which SQLAlchemy's Date result processor then fails to
# parse ("fromisoformat: argument must be str"). `func.date(...)` truncates to a
# calendar day portably on both SQLite and Postgres, so we use that and
# normalize the returned day (str on SQLite, date on Postgres) in Python.

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
    tickets_by_status: dict[str, int]
    tickets_by_priority: dict[str, int]


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

    # Internal employees only — externals belong in the Users tab, not in
    # the Employees count on the admin dashboard.
    total_employees = db.query(Developer).filter(Developer.is_external.is_(False)).count()
    total_projects = db.query(Project).count()
    total_tickets = db.query(WorkItem).count()
    active_sprints = db.query(Sprint).filter(Sprint.status == "active").count()

    # Tickets by status (single GROUP BY replaces 5 separate COUNTs)
    status_rows = db.query(WorkItem.status, func.count(WorkItem.id)).group_by(WorkItem.status).all()
    status_counts: dict[str, int] = {row[0]: row[1] for row in status_rows}
    tickets_by_status = {
        s: int(status_counts.get(s, 0))
        for s in ("backlog", "todo", "in_progress", "in_review", "done")
    }

    # Tickets by priority (single GROUP BY replaces 4 separate COUNTs)
    priority_rows = (
        db.query(WorkItem.priority, func.count(WorkItem.id)).group_by(WorkItem.priority).all()
    )
    priority_counts: dict[str, int] = {row[0]: row[1] for row in priority_rows}
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
    # Re-gated on `admin.employees` after `admin.developers_capacity` was
    # retired. The capacity payload feeds the Employees tab's per-developer
    # row, so the right cap is the one that gates that tab.
    dependencies=[Depends(require_capability("admin.employees"))],
)
def get_developers_capacity(db: Session = Depends(get_db)):
    """Get weekly capacity for all developers across all projects.

    Saturday-Friday week. See backend/services/capacity_service.py for the rules.
    Response embeds a per-ticket breakdown so the UI can drill down without a
    second round-trip.
    """
    from collections import defaultdict
    from datetime import date, datetime, timedelta

    from models.project import Project
    from models.time_entry import TimeEntry
    from services.capacity_service import compute_capacity_breakdowns_batch, week_boundaries

    week_start, week_end = week_boundaries()

    # Single query that eager-loads each developer's assigned work items + each
    # work item's project. Replaces the prior N+1 (1 query per developer).
    # Internal-only: this endpoint feeds the Employees tab's capacity rows, so
    # the filter must match the list_employees endpoint above.
    developers = (
        db.query(Developer)
        .options(
            joinedload(Developer.assigned_work_items).joinedload(WorkItem.project),
            joinedload(Developer.projects),
        )
        .filter(Developer.is_external.is_(False))
        .all()
    )

    # Aggregate every developer's time entries to DAILY granularity in SQL —
    # one row per (developer, project, calendar-day) instead of one row per
    # entry. This is bounded by (active days × active projects) rather than
    # total logged hours, so it no longer grows without ceiling as the
    # time_entries table accumulates. The Sat→Fri WEEK rollup stays in Python
    # (below) — that math is not portable across Postgres/SQLite.
    #
    # OUTER join to WorkItem to preserve the original behavior: the old code
    # resolved project via `wi_to_project.get(te.work_item_id)`, which returned
    # None for a missing/unresolved work item and still counted those hours
    # under project_id=None ("Unknown"). An inner join would silently drop them.
    day_rows = (
        db.query(
            TimeEntry.developer_id.label("dev_id"),
            WorkItem.project_id.label("project_id"),
            func.date(TimeEntry.logged_at).label("day"),
            func.sum(TimeEntry.hours).label("hours"),
        )
        .outerjoin(WorkItem, WorkItem.id == TimeEntry.work_item_id)
        .filter(TimeEntry.developer_id.isnot(None), TimeEntry.logged_at.isnot(None))
        .group_by(
            TimeEntry.developer_id,
            WorkItem.project_id,
            func.date(TimeEntry.logged_at),
        )
        .all()
    )

    def _to_date(day) -> date | None:
        """Normalize the grouped `day` value to a date. `func.date(...)` returns
        a str on SQLite and a date on Postgres; be defensive about datetime too."""
        if day is None:
            return None
        if isinstance(day, str):
            return date.fromisoformat(day[:10])
        if isinstance(day, datetime):
            return day.date()
        return day  # already a date

    # dev_id → list of (day: date, project_id: int | None, hours) tuples.
    entries_by_dev: dict[int, list[tuple[date, int | None, float]]] = defaultdict(list)
    project_id_set: set[int] = set()
    for row in day_rows:
        if row.dev_id is None:
            continue
        day = _to_date(row.day)
        if day is None:
            continue
        entries_by_dev[row.dev_id].append((day, row.project_id, row.hours or 0))
        if row.project_id is not None:
            project_id_set.add(row.project_id)

    # project_id → name, for the per-week per-project split. Built from the
    # distinct project_ids present in the aggregate (replaces the old
    # wi_to_project + project_names pair of lookups; the join supplies project_id).
    project_names: dict[int, str] = (
        {
            row[0]: row[1]
            for row in db.query(Project.id, Project.name)
            .filter(Project.id.in_(project_id_set))
            .all()
        }
        if project_id_set
        else {}
    )

    def _weekly_history_for(dev_id: int) -> list[dict]:
        """Bucket this dev's daily-aggregated hours into Sat→Fri UTC weeks across
        all projects, with a per-project split per week."""
        # (week_start, project_id) → hours
        proj_bucket: dict = defaultdict(int)
        week_totals: dict = defaultdict(int)
        weeks: set = set()
        for day, pid, hours in entries_by_dev.get(dev_id, []):
            days_back = (day.weekday() + 2) % 7  # Sat=5 → 0
            ws_date = day - timedelta(days=days_back)
            # week_start is a midnight datetime (not a bare date) so .isoformat()
            # yields "YYYY-MM-DDT00:00:00" — the exact shape callers/tests expect.
            ws = datetime(ws_date.year, ws_date.month, ws_date.day)
            proj_bucket[(ws, pid)] += hours or 0
            week_totals[ws] += hours or 0
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

    # Compute every developer's breakdown in a fixed number of queries rather
    # than ~5 per developer (the prior O(developers) N+1). Behaviour matches the
    # old per-developer compute_capacity_breakdown with no project restriction.
    breakdowns = compute_capacity_breakdowns_batch(developers, week_start, db=db)

    result = []
    for dev in developers:
        # Index, don't `.get(..., {})`: the batch returns an entry for every dev,
        # so a miss is a regression in that invariant. Fail loud with a 500 rather
        # than silently shipping a row missing every capacity field the frontend
        # types expect.
        breakdown = breakdowns[dev.id]
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
    dependencies=[Depends(require_capability("admin.employees_write"))],
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
    dependencies=[Depends(require_capability("admin.employees_write"))],
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
    dependencies=[Depends(require_capability("admin.employees_write"))],
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
    # Category surface — flat fields so the admin UI can render badges and
    # filter without a second round trip.
    category_id: int | None = None
    category_name: str | None = None

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
                category_id=project.category_id,
                category_name=project.category.name if project.category else None,
            )
        )

    return result


class ProjectWeeklyReportRow(BaseModel):
    """One row of the admin Projects → Weekly Report table.

    Counts are work-item totals (not hours). "Done this week" uses
    ``WorkItem.completed_at`` against the week window returned by
    ``capacity_service.week_boundaries()`` so it matches the rest of the app's
    weekly accounting (Sat 00:00 → Fri 23:59 UTC).
    """

    project_id: int
    project_name: str
    category_id: int | None
    category_name: str | None
    todo_backlog: int  # backlog + todo collapsed into one bucket
    in_progress: int
    in_review: int
    done_this_week: int


class ProjectWeeklyReportResponse(BaseModel):
    week_start: str  # ISO datetime
    week_end: str  # ISO datetime
    rows: list[ProjectWeeklyReportRow]


@router.get(
    "/projects/weekly-report",
    response_model=ProjectWeeklyReportResponse,
    dependencies=[Depends(require_capability("admin.projects"))],
)
def projects_weekly_report(
    category_id: int | None = None,
    uncategorized: bool = False,
    db: Session = Depends(get_db),
):
    """Per-project counts of in-progress / in-review / done-this-week.

    Filters
    -------
    - ``?category_id=5`` → only projects in category 5
    - ``?uncategorized=true`` → only projects with no category
    - both omitted → every project

    Query strategy: one query for the project rows themselves, then two
    aggregate GROUP BY queries (active statuses + done-this-week). Three
    round trips total regardless of project count.
    """
    from services.capacity_service import week_boundaries

    week_start, week_end = week_boundaries()

    # 1. Project list, filtered by category if requested.
    projects_query = db.query(Project)
    if uncategorized:
        projects_query = projects_query.filter(Project.category_id.is_(None))
    elif category_id is not None:
        projects_query = projects_query.filter(Project.category_id == category_id)
    projects = projects_query.order_by(Project.name).all()
    if not projects:
        return ProjectWeeklyReportResponse(
            week_start=week_start.isoformat(),
            week_end=week_end.isoformat(),
            rows=[],
        )

    project_ids = [p.id for p in projects]

    # 2. Snapshot counts for the in-flight buckets (no time filter — these
    # are "what's in flight right now", not weekly events). `backlog` and
    # `todo` are SQL-distinct but we collapse them client-side into a single
    # `todo_backlog` bucket since the UI shows them as one.
    active_rows = (
        db.query(WorkItem.project_id, WorkItem.status, func.count().label("n"))
        .filter(
            WorkItem.project_id.in_(project_ids),
            WorkItem.status.in_(["backlog", "todo", "in_progress", "in_review"]),
        )
        .group_by(WorkItem.project_id, WorkItem.status)
        .all()
    )

    # All four snapshot buckets default to 0 for projects with no matching
    # items so every row in the response is well-formed.
    todo_backlog_by_project: dict[int, int] = dict.fromkeys(project_ids, 0)
    in_progress_by_project: dict[int, int] = dict.fromkeys(project_ids, 0)
    in_review_by_project: dict[int, int] = dict.fromkeys(project_ids, 0)
    for row in active_rows:
        if row.status in ("backlog", "todo"):
            todo_backlog_by_project[row.project_id] += row.n
        elif row.status == "in_progress":
            in_progress_by_project[row.project_id] = row.n
        elif row.status == "in_review":
            in_review_by_project[row.project_id] = row.n

    # 3. "Done this week" — items currently status=done whose completed_at
    # falls inside the current week window. Matches capacity_service's
    # convention so this surface and the existing dev-capacity view agree on
    # "done this week".
    done_rows = (
        db.query(WorkItem.project_id, func.count().label("n"))
        .filter(
            WorkItem.project_id.in_(project_ids),
            WorkItem.status == "done",
            WorkItem.completed_at.isnot(None),
            WorkItem.completed_at >= week_start,
            WorkItem.completed_at <= week_end,
        )
        .group_by(WorkItem.project_id)
        .all()
    )
    done_by_project: dict[int, int] = dict.fromkeys(project_ids, 0)
    for done_row in done_rows:
        done_by_project[done_row.project_id] = done_row.n

    rows = [
        ProjectWeeklyReportRow(
            project_id=p.id,
            project_name=p.name,
            category_id=p.category_id,
            category_name=p.category.name if p.category else None,
            todo_backlog=todo_backlog_by_project.get(p.id, 0),
            in_progress=in_progress_by_project.get(p.id, 0),
            in_review=in_review_by_project.get(p.id, 0),
            done_this_week=done_by_project.get(p.id, 0),
        )
        for p in projects
    ]

    return ProjectWeeklyReportResponse(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        rows=rows,
    )


class WeeklyTicket(BaseModel):
    """Compact ticket shape for the Projects → Reports drill-down.

    Designed to keep the response small: only the fields the table needs to
    render. Full ticket detail (description, comments, etc.) lives behind the
    project board.
    """

    id: int
    key: str | None
    title: str
    type: str
    priority: str
    assignee_name: str | None
    estimated_hours: int | None
    logged_hours: int | None
    completed_at: str | None  # ISO datetime, only set for the `done_this_week` bucket


class ProjectWeeklyTicketsResponse(BaseModel):
    todo_backlog: list[WeeklyTicket]
    in_progress: list[WeeklyTicket]
    in_review: list[WeeklyTicket]
    done_this_week: list[WeeklyTicket]


def _serialize_weekly_ticket(item: WorkItem) -> WeeklyTicket:
    """WorkItem → WeeklyTicket, robust against missing assignee/optional fields."""
    return WeeklyTicket(
        id=item.id,
        key=item.key,
        title=item.title,
        type=item.type,
        priority=item.priority,
        assignee_name=item.assignee.name if item.assignee else None,
        estimated_hours=item.estimated_hours,
        logged_hours=item.logged_hours,
        completed_at=item.completed_at.isoformat() if item.completed_at else None,
    )


@router.get(
    "/projects/{project_id}/weekly-tickets",
    response_model=ProjectWeeklyTicketsResponse,
    dependencies=[Depends(require_capability("admin.projects"))],
)
def project_weekly_tickets(project_id: int, db: Session = Depends(get_db)):
    """Tickets bucketed by status for the Reports → expanded-row drill-down.

    All three buckets returned in a single payload so flipping between the
    In progress / In review / Done buttons in the UI is a pure client switch
    — no extra round trip per click.

    Bucket definitions match the report endpoint:
      - in_progress / in_review: snapshot of items in that status right now
      - done_this_week:          status='done' AND completed_at in current week
    """
    from services.capacity_service import week_boundaries

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    week_start, week_end = week_boundaries()

    # Eager-load the assignee relationship so the per-item to_dict serialization
    # doesn't trigger an N+1 lazy fetch for each ticket.
    base = (
        db.query(WorkItem)
        .options(joinedload(WorkItem.assignee))
        .filter(WorkItem.project_id == project_id)
    )

    # `backlog` and `todo` collapse into one UI bucket. Order them by
    # updated_at (latest activity first) so stale items don't dominate.
    todo_backlog = (
        base.filter(WorkItem.status.in_(["backlog", "todo"]))
        .order_by(WorkItem.updated_at.desc().nullslast())
        .all()
    )
    in_progress = (
        base.filter(WorkItem.status == "in_progress")
        .order_by(WorkItem.updated_at.desc().nullslast())
        .all()
    )
    in_review = (
        base.filter(WorkItem.status == "in_review")
        .order_by(WorkItem.updated_at.desc().nullslast())
        .all()
    )
    done_this_week = (
        base.filter(
            WorkItem.status == "done",
            WorkItem.completed_at.isnot(None),
            WorkItem.completed_at >= week_start,
            WorkItem.completed_at <= week_end,
        )
        .order_by(WorkItem.completed_at.desc())
        .all()
    )

    return ProjectWeeklyTicketsResponse(
        todo_backlog=[_serialize_weekly_ticket(i) for i in todo_backlog],
        in_progress=[_serialize_weekly_ticket(i) for i in in_progress],
        in_review=[_serialize_weekly_ticket(i) for i in in_review],
        done_this_week=[_serialize_weekly_ticket(i) for i in done_this_week],
    )


@router.put(
    "/projects/{project_id}/github",
    dependencies=[Depends(require_capability("admin.projects_write"))],
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


class ProjectCategoryAssignment(BaseModel):
    """Body for the category-assignment endpoint. `null` clears the
    category — making the project uncategorized."""

    category_id: int | None


@router.put(
    "/projects/{project_id}/category",
    dependencies=[Depends(require_capability("admin.projects_write"))],
)
def set_project_category(
    project_id: int,
    payload: ProjectCategoryAssignment,
    db: Session = Depends(get_db),
):
    """Assign / change / clear a project's category from the admin Projects tab.

    Gated separately on `admin.projects_write` rather than the general
    `update_project` endpoint (which uses `require_project_admin`) so that
    read-only admins and per-project admins can't reorganize the admin-wide
    categorization. Body: ``{"category_id": <int> | null}``.
    """
    from models.project_category import ProjectCategory

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if payload.category_id is not None:
        category = (
            db.query(ProjectCategory).filter(ProjectCategory.id == payload.category_id).first()
        )
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")

    project.category_id = payload.category_id
    db.commit()
    db.refresh(project)
    return {
        "id": project.id,
        "name": project.name,
        "category_id": project.category_id,
        "category_name": project.category.name if project.category else None,
    }


# ───────────────────────────────────────────────────────────────────────────
# Time Entries — admin-wide list with filters (project / developer / date).
#
# Powers the admin "Time Entries" tab, which mirrors the layout of an
# industry-standard workforce time-tracking tool: filter bar on top, flat
# list of entries below, totals strip. The capacity endpoint above already
# pulls every entry but aggregates them — this endpoint returns the raw
# rows so the admin can audit/export per-row.
# ───────────────────────────────────────────────────────────────────────────


class TimeEntryRow(BaseModel):
    """One row in the admin time-entries grid. Flattens the WorkItem and
    Developer joins so the frontend can render without nested lookups."""

    id: int
    hours: int
    description: str | None
    logged_at: datetime

    work_item_id: int | None
    work_item_key: str | None
    work_item_title: str | None
    work_item_type: str | None

    project_id: int | None
    project_name: str | None

    developer_id: int | None
    developer_name: str | None
    developer_email: str | None
    avatar_url: str | None

    class Config:
        from_attributes = True


class TimeEntriesResponse(BaseModel):
    """Wraps the rows with a totals strip and a truncation flag so the
    frontend can warn when its filters return more than the cap."""

    rows: list[TimeEntryRow]
    total_hours: int
    total_rows: int
    truncated: bool


# Hard cap to keep the response (and the in-browser table) bounded even
# when an admin clears all filters. The frontend should show a "refine
# your filters" hint when this fires.
TIME_ENTRIES_MAX_ROWS = 2000


@router.get(
    "/time-entries",
    response_model=TimeEntriesResponse,
    dependencies=[Depends(require_capability("admin.time_entries"))],
)
def list_time_entries(
    project_id: int | None = None,
    developer_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
):
    """List time entries for the admin Time Entries tab.

    Filters (all optional, combined with AND):
      - project_id:  restrict to one project (joined via WorkItem.project_id)
      - developer_id: restrict to one employee
      - date_from / date_to: inclusive ISO date strings (YYYY-MM-DD). The
        upper bound is treated as end-of-day, so `date_to=2026-06-08` keeps
        entries logged at 23:59:59 that day.

    Returns at most TIME_ENTRIES_MAX_ROWS rows ordered by logged_at DESC.
    """
    from datetime import date, time, timedelta

    from models.time_entry import TimeEntry

    # Parse date filters. We accept ISO date (no time component) and silently
    # ignore malformed input rather than 400 — the UI's date pickers can't
    # send anything malformed, so a 400 here would only fire for manual
    # callers and offers them nothing useful over an empty result.
    def _parse_date(s: str | None) -> date | None:
        if not s:
            return None
        try:
            return date.fromisoformat(s)
        except ValueError:
            return None

    df = _parse_date(date_from)
    dt = _parse_date(date_to)

    query = (
        db.query(TimeEntry)
        .options(
            joinedload(TimeEntry.work_item).joinedload(WorkItem.project),
            joinedload(TimeEntry.developer),
        )
        .order_by(TimeEntry.logged_at.desc())
    )

    if developer_id is not None:
        query = query.filter(TimeEntry.developer_id == developer_id)

    if project_id is not None:
        # Join WorkItem so we can filter by its project_id without
        # round-tripping through the in-memory join load.
        query = query.join(WorkItem, TimeEntry.work_item_id == WorkItem.id).filter(
            WorkItem.project_id == project_id
        )

    if df is not None:
        query = query.filter(TimeEntry.logged_at >= datetime.combine(df, time.min))
    if dt is not None:
        # Inclusive upper bound: end-of-day of dt = start-of-day of (dt + 1).
        query = query.filter(
            TimeEntry.logged_at < datetime.combine(dt + timedelta(days=1), time.min)
        )

    # +1 over the cap so we can detect truncation without a separate COUNT.
    fetched = query.limit(TIME_ENTRIES_MAX_ROWS + 1).all()
    truncated = len(fetched) > TIME_ENTRIES_MAX_ROWS
    entries = fetched[:TIME_ENTRIES_MAX_ROWS]

    rows: list[TimeEntryRow] = []
    total_hours = 0
    for te in entries:
        wi = te.work_item
        proj = wi.project if wi else None
        dev = te.developer
        total_hours += te.hours or 0
        rows.append(
            TimeEntryRow(
                id=te.id,
                hours=te.hours or 0,
                description=te.description,
                logged_at=te.logged_at,
                work_item_id=wi.id if wi else None,
                work_item_key=wi.key if wi else None,
                work_item_title=wi.title if wi else None,
                work_item_type=wi.type if wi else None,
                project_id=proj.id if proj else None,
                project_name=proj.name if proj else None,
                developer_id=dev.id if dev else None,
                developer_name=dev.name if dev else None,
                developer_email=dev.email if dev else None,
                avatar_url=dev.avatar_url if dev else None,
            )
        )

    return TimeEntriesResponse(
        rows=rows,
        total_hours=total_hours,
        total_rows=len(rows),
        truncated=truncated,
    )
