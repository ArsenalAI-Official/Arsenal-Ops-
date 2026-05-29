"""
Work Items Router - Jira-style work item management with AI generation
Production-ready database storage
"""

import sys
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import case, func, text
from sqlalchemy.orm import Session, selectinload

sys.path.append("..")
from database import get_db
from models.project import Project
from models.sprint import Sprint, SprintStatus
from models.user import User
from models.work_item import WorkItem, WorkItemStatus, WorkItemType
from routers.auth import get_current_user
from services.email_service import email_service
from services.hierarchy import validate_hierarchy
from services.llm_agent import llm_agent

router = APIRouter(prefix="/api/workitems", tags=["Work Items"])


# Counter for generating work item keys
def get_next_item_number(db: Session, key_prefix: str) -> int:
    """Get the next work item number for a key prefix — queries GLOBALLY.
    Caller MUST hold the advisory lock before calling this (Postgres only).
    """
    dialect = db.bind.dialect.name
    if dialect == "postgresql":
        # Postgres: strict regex filter rules out non-numeric suffixes.
        row = db.execute(
            text("""
                SELECT COALESCE(MAX(
                    CAST(REGEXP_REPLACE(key, '^.*-', '') AS INTEGER)
                ), 0) + 1
                FROM work_items
                WHERE key LIKE :prefix
                  AND key ~ :pattern
            """),
            {"prefix": f"{key_prefix}-%", "pattern": f"^{key_prefix}-[0-9]+$"},
        ).scalar()
    else:
        # SQLite (local dev): no REGEXP_REPLACE. Strip the known prefix via
        # SUBSTR; CAST to INTEGER returns 0 for non-numeric suffixes, which
        # MAX correctly ignores.
        row = db.execute(
            text("""
                SELECT COALESCE(MAX(
                    CAST(SUBSTR(key, :prefix_len) AS INTEGER)
                ), 0) + 1
                FROM work_items
                WHERE key LIKE :prefix
            """),
            {"prefix": f"{key_prefix}-%", "prefix_len": len(key_prefix) + 2},
        ).scalar()
    return row or 1


def _creator_dev_id(db: Session, current_user: User) -> int | None:
    """Resolve the Developer.id for the currently authenticated user.

    Used as the value for WorkItem.reporter_id on creation so the side panel
    can render "Created By <name>". Returns None if the user has no linked
    Developer row (rare — typically only admin-only accounts).
    """
    from models.developer import Developer

    if not current_user or not current_user.email:
        return None
    dev = db.query(Developer).filter(Developer.email == current_user.email).first()
    return dev.id if dev else None


def update_epic_hours(epic_id: int, db: Session):
    """
    Roll up estimated_hours, logged_hours, and remaining_hours into the epic
    from BOTH levels below:
      - 2nd level: stories/tasks/bugs whose epic_id == this epic (their own,
        independent hour columns — NOT a rollup of their subtasks)
      - 3rd level: subtasks whose parent is one of those stories/tasks/bugs

    Story/Task/Bug parents keep their own direct hours independent of their
    subtasks. The epic is the only level that aggregates across the tree.

    Called whenever any descendant's hours change OR the hierarchy shifts:
      - create_work_item (with epic_id or subtask under a parent linked to an epic)
      - update_work_item (hours change, status change, epic_id/parent_id reparent)
      - log_hours endpoint
      - delete_work_item
    """
    epic = db.query(WorkItem).filter(WorkItem.id == epic_id).first()
    if not epic or epic.type != WorkItemType.EPIC.value:
        return

    # 2nd level: direct children's own hour columns
    direct_children_ids_subq = (
        db.query(WorkItem.id)
        .filter(
            WorkItem.epic_id == epic_id,
            WorkItem.type.in_(
                [WorkItemType.USER_STORY.value, WorkItemType.TASK.value, WorkItemType.BUG.value]
            ),
        )
        .subquery()
    )

    direct = (
        db.query(
            func.coalesce(func.sum(WorkItem.estimated_hours), 0).label("est"),
            func.coalesce(func.sum(WorkItem.logged_hours), 0).label("logged"),
            func.coalesce(func.sum(WorkItem.remaining_hours), 0).label("remaining"),
        )
        .filter(WorkItem.id.in_(db.query(direct_children_ids_subq.c.id)))
        .one()
    )

    # 3rd level: subtasks whose parent is one of the direct children
    subtasks = (
        db.query(
            func.coalesce(func.sum(WorkItem.estimated_hours), 0).label("est"),
            func.coalesce(func.sum(WorkItem.logged_hours), 0).label("logged"),
            func.coalesce(func.sum(WorkItem.remaining_hours), 0).label("remaining"),
        )
        .filter(
            WorkItem.type == WorkItemType.SUBTASK.value,
            WorkItem.parent_id.in_(db.query(direct_children_ids_subq.c.id)),
        )
        .one()
    )

    epic.estimated_hours = (direct.est or 0) + (subtasks.est or 0)
    epic.logged_hours = (direct.logged or 0) + (subtasks.logged or 0)
    epic.remaining_hours = (direct.remaining or 0) + (subtasks.remaining or 0)
    epic.updated_at = datetime.utcnow()


def update_parent_status_from_subtasks(parent_id: int, db: Session):
    """
    Reopen a Story/Task/Bug if it was previously marked done but one of its
    subtasks has just been reopened.

    Auto-completion was intentionally removed: parents are marked done
    EXPLICITLY by the user (the API blocks the transition if any subtask is
    still open via the rule in update_work_item). This function only handles
    the reverse direction — keeping a parent's "done" status from drifting
    into an inconsistent state when a descendant is reopened.
    """
    parent = db.query(WorkItem).filter(WorkItem.id == parent_id).first()
    if not parent:
        return
    if parent.type not in (
        WorkItemType.USER_STORY.value,
        WorkItemType.TASK.value,
        WorkItemType.BUG.value,
    ):
        return
    if parent.status != WorkItemStatus.DONE.value:
        # Parent isn't done — nothing to reopen.
        return

    subtasks = (
        db.query(WorkItem)
        .filter(
            WorkItem.parent_id == parent_id,
            WorkItem.type == WorkItemType.SUBTASK.value,
        )
        .all()
    )
    if not subtasks:
        return

    any_open = any(s.status != WorkItemStatus.DONE.value for s in subtasks)
    if any_open:
        parent.status = WorkItemStatus.TODO.value
        parent.completed_at = None
        parent.started_at = None
        parent.updated_at = datetime.utcnow()


def refresh_parent_and_epic(parent: WorkItem, db: Session):
    """
    Re-evaluate a Story/Task/Bug parent and its grandparent epic after a
    subtask change.

    Hours are NOT rolled up from subtasks to the parent — Story/Task/Bug rows
    keep their own direct estimate / logged / remaining values. The epic is
    the only level that aggregates across subtasks (it sums both 2nd and 3rd
    level items via update_epic_hours).

    What we still do at the parent level: status auto-update (all subtasks
    done → parent done, any subtask reopened → parent reopens). That rule is
    independent of hours and remains useful.
    """
    update_parent_status_from_subtasks(parent.id, db)
    if parent.epic_id is not None:
        # update_epic_hours queries the database directly; flush any pending
        # parent status writes from the call above so the epic's status rollup
        # (which depends on parent status) sees them.
        db.flush()
        update_epic_hours(parent.epic_id, db)
        update_epic_status_from_stories(parent.epic_id, db)


def propagate_from_subtask(subtask: WorkItem, db: Session):
    """
    Helper: when a subtask changes, run the parent's status rollup and then
    the grandparent epic's hours + status rollup.

    Hours go DIRECTLY from the subtask to the epic via update_epic_hours
    (which sums both 2nd and 3rd level descendants). The 2nd-level parent's
    own hour columns are not touched — by design, parents keep their own
    independent hours.
    """
    if subtask.parent_id is None:
        return
    parent = db.query(WorkItem).filter(WorkItem.id == subtask.parent_id).first()
    if parent is None:
        return
    refresh_parent_and_epic(parent, db)


def update_epic_status_from_stories(epic_id: int, db: Session):
    """
    Reopen an epic if it was previously marked done but one of its
    stories/tasks/bugs has just been reopened.

    Auto-completion was intentionally removed: epics are marked done
    EXPLICITLY by the user (the API blocks the transition if any child is
    still open via the rule in update_work_item). This function only handles
    the reverse direction — keeping the epic's "done" status from drifting
    into an inconsistent state when a child is reopened.

    Args:
        epic_id: ID of the epic to check
        db: Database session
    """
    epic = db.query(WorkItem).filter(WorkItem.id == epic_id).first()
    if not epic or epic.type != WorkItemType.EPIC.value:
        return
    if epic.status != WorkItemStatus.DONE.value:
        # Epic isn't done — nothing to reopen.
        return

    # Get all work items linked to this epic
    items = (
        db.query(WorkItem)
        .filter(
            WorkItem.epic_id == epic_id,
            WorkItem.type.in_(
                [WorkItemType.USER_STORY.value, WorkItemType.TASK.value, WorkItemType.BUG.value]
            ),
        )
        .all()
    )

    if not items:
        # No work items under this epic, don't auto-update status
        return

    any_open = any(item.status != WorkItemStatus.DONE.value for item in items)
    if any_open:
        epic.status = WorkItemStatus.TODO.value
        epic.completed_at = None
        epic.started_at = None
        epic.updated_at = datetime.utcnow()


# Request/Response models
class WorkItemCreate(BaseModel):
    type: str = "task"  # user_story, task, bug, epic
    title: str
    description: str = ""
    status: str = "todo"
    estimated_hours: int = 0
    remaining_hours: int = 0
    story_points: int = 0
    priority: str = "medium"
    assignee_id: int | None = None
    sprint_id: int | None = None
    project_id: int
    tags: list[str] = []
    epic_id: int | None = None
    parent_id: int | None = None
    acceptance_criteria: list[str] = []
    start_date: str | None = None  # ISO date string
    due_date: str | None = None  # ISO date string


class WorkItemUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    estimated_hours: int | None = None
    remaining_hours: int | None = None
    logged_hours: int | None = None  # Hours logged by developer
    story_points: int | None = None
    priority: str | None = None
    assignee_id: int | None = None
    sprint_id: int | None = None
    tags: list[str] | None = None
    type: str | None = None
    epic_id: int | None = None
    parent_id: int | None = None
    acceptance_criteria: list[str] | None = None
    start_date: str | None = None  # ISO date string
    due_date: str | None = None  # ISO date string
    # Frontend compatibility - assigned_hours maps to estimated_hours
    assigned_hours: int | None = None


class BatchStatusUpdate(BaseModel):
    item_ids: list[str]
    status: str


class GenerateStoriesRequest(BaseModel):
    product_name: str
    product_description: str
    count: int = 5
    product_id: str = "default"


class SprintCreate(BaseModel):
    name: str
    project_id: int
    goal: str = ""
    start_date: str | None = None
    end_date: str | None = None
    capacity_hours: int | None = None


@router.get("/")
def list_work_items(
    response: Response = None,
    project_id: int = None,
    status: str = None,
    type: str = None,
    sprint_id: int = None,
    assignee_id: int = None,
    limit: int = Query(500, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all work items with optional filters (requires auth).

    Supports pagination via ``limit`` (1..1000, default 500) and ``offset``
    (default 0). Total row count is returned in the ``X-Total-Count`` response
    header so the frontend can render a paginator without a second request.
    """
    query = db.query(WorkItem).options(
        selectinload(WorkItem.assignee),
        selectinload(WorkItem.sprint),
    )

    if project_id:
        query = query.filter(WorkItem.project_id == project_id)
    if status:
        query = query.filter(WorkItem.status == status)
    if type:
        query = query.filter(WorkItem.type == type)
    if sprint_id:
        query = query.filter(WorkItem.sprint_id == sprint_id)
    if assignee_id:
        query = query.filter(WorkItem.assignee_id == assignee_id)

    # Compute total BEFORE applying limit/offset so the header reflects the
    # full filtered set, not just the current page.
    total = query.with_entities(func.count(WorkItem.id)).scalar() or 0

    items = query.order_by(WorkItem.updated_at.desc()).limit(limit).offset(offset).all()

    if response is not None:
        response.headers["X-Total-Count"] = str(total)

    # Pre-fetch parent/epic keys in one batch query
    all_lookup_ids = list(
        set(
            [item.parent_id for item in items if item.parent_id]
            + [item.epic_id for item in items if item.epic_id]
        )
    )
    id_to_key: dict = {}
    if all_lookup_ids:
        related = db.query(WorkItem.id, WorkItem.key).filter(WorkItem.id.in_(all_lookup_ids)).all()
        id_to_key = {r.id: r.key for r in related}

    # Include assignee name in response
    result = []
    for item in items:
        item_dict = {
            "id": str(item.id),
            "key": item.key,
            "type": item.type,
            "title": item.title,
            "description": item.description or "",
            "status": item.status,
            "priority": item.priority,
            "story_points": item.story_points or 0,
            "assigned_hours": item.estimated_hours or 0,
            "estimated_hours": item.estimated_hours or 0,
            "remaining_hours": item.remaining_hours or 0,
            "logged_hours": item.logged_hours or 0,
            "assignee": "Unassigned",
            "assignee_id": item.assignee_id,
            "sprint": "Backlog",
            "sprint_id": item.sprint_id,
            "epic": "",
            "tags": item.tags or [],
            "acceptance_criteria": item.acceptance_criteria or [],
            "parent_id": item.parent_id,
            "epic_id": item.epic_id,
            "parent_key": id_to_key.get(item.parent_id) if item.parent_id else None,
            "epic_key": id_to_key.get(item.epic_id) if item.epic_id else None,
            "due_date": item.due_date.isoformat() if item.due_date else None,
            "start_date": item.start_date.isoformat() if item.start_date else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        }

        # Get assignee name
        if item.assignee_id and item.assignee:
            item_dict["assignee"] = item.assignee.name

        # Get sprint name and dates
        if item.sprint_id and item.sprint:
            item_dict["sprint"] = item.sprint.name
            # Use sprint dates if work item doesn't have its own dates
            if not item_dict["start_date"] and item.sprint.start_date:
                item_dict["start_date"] = item.sprint.start_date.isoformat()
            if not item_dict["due_date"] and item.sprint.end_date:
                item_dict["due_date"] = item.sprint.end_date.isoformat()

        result.append(item_dict)

    return result


class SlimWorkItem(BaseModel):
    """Slim payload used by the Kanban board endpoint.

    Excludes heavy fields (description, acceptance_criteria, started_at)
    that the board view never renders. Wire size is roughly 40-50% of
    the full row, which adds up fast on projects with hundreds of items.
    """

    id: str
    key: str
    title: str
    type: str
    status: str
    priority: str
    assignee_id: int | None = None
    assignee: str | None = None
    sprint_id: int | None = None
    parent_id: int | None = None
    epic_id: int | None = None
    parent_key: str | None = None
    epic_key: str | None = None
    story_points: int = 0
    tags: list[str] = []
    remaining_hours: int = 0
    assigned_hours: int = 0
    logged_hours: int = 0
    due_date: str | None = None
    completed_at: str | None = None


@router.get("/board", response_model=list[SlimWorkItem])
def list_board_items(
    project_id: int = Query(..., description="Required: project to fetch board items for"),
    sprint_id: int | None = Query(None, description="Optional: filter to a single sprint"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Slim variant of ``GET /api/workitems/`` used by the Kanban board.

    Skips the description/acceptance_criteria/date columns the board never
    renders. The parent/epic key batch lookup mirrors ``list_work_items`` so
    callers still see human-readable identifiers without per-row joins.
    """
    query = db.query(WorkItem).options(selectinload(WorkItem.assignee))
    query = query.filter(WorkItem.project_id == project_id)
    if sprint_id is not None:
        query = query.filter(WorkItem.sprint_id == sprint_id)

    items = query.all()

    # Batch-fetch parent/epic keys in a single IN(...) query.
    all_lookup_ids = list(
        {
            *(item.parent_id for item in items if item.parent_id),
            *(item.epic_id for item in items if item.epic_id),
        }
    )
    id_to_key: dict[int, str] = {}
    if all_lookup_ids:
        related = db.query(WorkItem.id, WorkItem.key).filter(WorkItem.id.in_(all_lookup_ids)).all()
        id_to_key = {r.id: r.key for r in related}

    return [
        SlimWorkItem(
            id=str(item.id),
            key=item.key,
            title=item.title,
            type=item.type,
            status=item.status,
            priority=item.priority,
            assignee_id=item.assignee_id,
            assignee=item.assignee.name if item.assignee_id and item.assignee else None,
            sprint_id=item.sprint_id,
            parent_id=item.parent_id,
            epic_id=item.epic_id,
            parent_key=id_to_key.get(item.parent_id) if item.parent_id else None,
            epic_key=id_to_key.get(item.epic_id) if item.epic_id else None,
            story_points=item.story_points or 0,
            tags=item.tags or [],
            remaining_hours=item.remaining_hours or 0,
            assigned_hours=item.estimated_hours or 0,
            logged_hours=item.logged_hours or 0,
            due_date=item.due_date.isoformat() if item.due_date else None,
            completed_at=item.completed_at.isoformat() if item.completed_at else None,
        )
        for item in items
    ]


@router.get("/my-tasks")
def get_my_tasks(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all tasks assigned to the current user across all projects"""
    from models.developer import Developer
    from models.project import Project

    # Find developer associated with current user
    developer = db.query(Developer).filter(Developer.email == current_user.email).first()

    if not developer:
        return []

    # Get all work items assigned to this developer (eager-load relations
    # we need in the response to avoid per-item lazy loads).
    items = (
        db.query(WorkItem)
        .options(
            selectinload(WorkItem.parent),
            selectinload(WorkItem.epic),
            selectinload(WorkItem.sprint),
            selectinload(WorkItem.reporter),
        )
        .filter(WorkItem.assignee_id == developer.id)
        .all()
    )

    # Batch-fetch the projects referenced by these items in one query.
    project_ids = {item.project_id for item in items if item.project_id}
    projects_by_id = {}
    if project_ids:
        projects_by_id = {
            p.id: p for p in db.query(Project).filter(Project.id.in_(project_ids)).all()
        }

    result = []
    for item in items:
        # Use the prebuilt projects_by_id lookup (perf branch N+1 fix) and
        # include completed_at from main.
        project = projects_by_id.get(item.project_id)

        result.append(
            {
                "id": str(item.id),
                "key": item.key,
                "title": item.title,
                "type": item.type,
                "status": item.status,
                "priority": item.priority,
                "project_id": item.project_id,
                "project_name": project.name if project else "Unknown",
                "due_date": item.due_date.isoformat() if item.due_date else None,
                "estimated_hours": item.estimated_hours,
                "logged_hours": item.logged_hours,
                "remaining_hours": item.remaining_hours,
                "is_overdue": bool(
                    item.due_date and item.due_date < datetime.utcnow() and item.status != "done"
                ),
                "completed_at": item.completed_at.isoformat() if item.completed_at else None,
                "story_points": item.story_points or 0,
                "assigned_hours": item.estimated_hours or 0,
                "assignee": developer.name,
                "reporter_name": item.reporter.name if item.reporter else None,
                "description": item.description or "",
                "tags": item.tags or [],
                "acceptance_criteria": item.acceptance_criteria or [],
                "parent_id": item.parent_id,
                "parent_key": item.parent.key if item.parent else None,
                "epic_id": item.epic_id,
                "epic_key": item.epic.key if item.epic else None,
                "sprint_id": item.sprint_id,
                "sprint": item.sprint.name if item.sprint else "Backlog",
            }
        )

    return result


@router.get("/{item_id}")
def get_work_item(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get a specific work item (requires auth).

    Augments the raw model with `reporter_name` and `assignee_name` so the
    side panel can show "Created By" / "Assigned To" without a follow-up
    lookup. The model's column dict is returned as-is otherwise.
    """
    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")
    # Column dict + relation-derived fields. SQLAlchemy auto-serialization via
    # FastAPI doesn't include relationships, so we add the names explicitly.
    payload = {c.name: getattr(item, c.name) for c in item.__table__.columns}
    payload["reporter_name"] = item.reporter.name if item.reporter else None
    payload["assignee_name"] = item.assignee.name if item.assignee else None
    return payload


@router.post("/")
def create_work_item(
    item: WorkItemCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new work item"""
    # Get project for key prefix
    project = db.query(Project).filter(Project.id == item.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    validate_hierarchy(
        db,
        item_type=item.type,
        project_id=item.project_id,
        parent_id=item.parent_id,
        epic_id=item.epic_id,
        item_id=None,
    )

    # Generate key using project's key_prefix
    key_prefix = getattr(project, "key_prefix", None) or "PROJ"

    # Acquire a PostgreSQL transaction-level advisory lock scoped to this key_prefix.
    # This serializes concurrent inserts for the same prefix across all Gunicorn workers,
    # making key collisions impossible without any retry logic. No-op on SQLite (local
    # dev), which is single-writer anyway so there's nothing to serialize.
    if db.bind.dialect.name == "postgresql":
        lock_id = abs(hash(key_prefix)) % 2_147_483_647
        db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})

    # Now we're the only transaction touching this prefix — get next number safely
    item_number = get_next_item_number(db, key_prefix)
    key = f"{key_prefix}-{item_number}"

    work_item = WorkItem(
        project_id=item.project_id,
        key=key,
        type=item.type,
        title=item.title,
        description=item.description,
        status=item.status,
        estimated_hours=item.estimated_hours,
        remaining_hours=item.estimated_hours,
        story_points=item.story_points,
        priority=item.priority,
        assignee_id=item.assignee_id,
        sprint_id=item.sprint_id,
        epic_id=item.epic_id,
        parent_id=item.parent_id,
        # Stamp the creator (looked up via Developer row matched on email).
        # Used by the ticket side panel "Created By" line. Stays NULL if the
        # current user has no linked developer record (rare — admin-only users).
        reporter_id=_creator_dev_id(db, current_user),
        tags=item.tags,
        acceptance_criteria=item.acceptance_criteria,
        start_date=datetime.fromisoformat(item.start_date) if item.start_date else None,
        due_date=datetime.fromisoformat(item.due_date) if item.due_date else None,
        started_at=datetime.utcnow() if item.status == "in_progress" else None,
        completed_at=datetime.utcnow() if item.status == "done" else None,
        last_assigned_at=datetime.utcnow() if item.assignee_id else None,
    )
    db.add(work_item)
    db.flush()  # assigns work_item.id without committing

    # Open initial assignment span for capacity attribution (if assignee provided)
    if work_item.assignee_id:
        from services.assignment_history_service import record_assignment_change

        record_assignment_change(
            db, work_item.id, work_item.assignee_id, at=work_item.last_assigned_at
        )

    # Log activity (now work_item.id is available)
    from models.activity_log import ActivityLog

    activity = ActivityLog(
        project_id=item.project_id,
        user_id=current_user.id,
        action="created",
        entity_type="work_item",
        entity_id=work_item.id,
        title=f"Created {key}: {item.title}",
    )
    db.add(activity)
    db.commit()
    db.refresh(work_item)

    # Propagation on create:
    # - For stories/tasks/bugs linked to an epic, refresh the epic's hours.
    # - For a brand-new subtask, walk up the chain (parent → grandparent epic).
    if work_item.type == WorkItemType.SUBTASK.value and work_item.parent_id:
        propagate_from_subtask(work_item, db)
        db.commit()
    elif work_item.epic_id:
        update_epic_hours(work_item.epic_id, db)
        db.commit()

    # Send assignment notification if assignee is set (off the request thread)
    if work_item.assignee_id and work_item.assignee:
        assignee = work_item.assignee
        background_tasks.add_task(
            email_service.send_task_assignment_notification,
            to_email=assignee.email,
            to_name=assignee.name,
            assigner_name=current_user.email,
            work_item_key=work_item.key,
            work_item_title=work_item.title,
            work_item_description=work_item.description or "",
            project_id=work_item.project_id,
            work_item_id=work_item.id,
            priority=work_item.priority,
            due_date=work_item.due_date.isoformat() if work_item.due_date else None,
        )

    # Return with assignee name
    assignee_name = "Unassigned"
    if work_item.assignee_id and work_item.assignee:
        assignee_name = work_item.assignee.name

    return {
        "id": str(work_item.id),
        "key": work_item.key,
        "type": work_item.type,
        "title": work_item.title,
        "description": work_item.description or "",
        "status": work_item.status,
        "priority": work_item.priority,
        "story_points": work_item.story_points or 0,
        "assigned_hours": work_item.estimated_hours or 0,
        "estimated_hours": work_item.estimated_hours
        or 0,  # Also return as estimated_hours for frontend
        "remaining_hours": work_item.remaining_hours or 0,
        "logged_hours": work_item.logged_hours or 0,
        "assignee": assignee_name,
        "assignee_id": work_item.assignee_id,
        "sprint": "Backlog",
        "epic": "",
        "tags": work_item.tags or [],
        "start_date": work_item.start_date.isoformat() if work_item.start_date else None,
        "due_date": work_item.due_date.isoformat() if work_item.due_date else None,
        "created_at": work_item.created_at.isoformat() if work_item.created_at else None,
        "updated_at": work_item.updated_at.isoformat() if work_item.updated_at else None,
    }


@router.put("/{item_id}")
def update_work_item(
    item_id: int,
    update: WorkItemUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an existing work item (requires auth)"""
    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Track old assignee before update for transfer comment
    old_assignee_id = item.assignee_id
    old_assignee_name = "Unassigned"
    if old_assignee_id and item.assignee:
        old_assignee_name = item.assignee.name

    # Track old status before update for status change notification
    old_status = item.status

    # Track old epic_id so we can recompute the FORMER epic when an item is reparented
    old_epic_id = item.epic_id

    # Track old parent_id so a re-parented subtask refreshes BOTH the old and
    # new parent (and their respective epics).
    old_parent_id = item.parent_id

    update_data = update.model_dump(exclude_unset=True)

    # logged_hours and remaining_hours are derived columns — logged_hours
    # is the SUM of TimeEntry rows; remaining_hours is estimated - logged.
    # Allowing direct writes here was the #1 cause of rollup drift (PROJ-353,
    # PROJ-357, PROJ-173, PROJ-222 etc. all got ghost-logged this way and
    # had no TimeEntry rows backing the claim). Strip them silently — to set
    # logged hours, callers must use POST /log-hours which creates a TimeEntry.
    update_data.pop("logged_hours", None)
    update_data.pop("remaining_hours", None)

    # Done tickets are frozen — only allowed mutation is a status change that
    # re-opens them (any non-done status). Combined "re-open + edit other fields"
    # in a single request is rejected: caller must re-open first, then edit.
    if item.status == WorkItemStatus.DONE.value:
        non_status_changes = [k for k in update_data if k != "status"]
        if non_status_changes:
            raise HTTPException(
                status_code=403,
                detail="This ticket is marked done. Re-open it before editing.",
            )
        # If status is being changed to a non-done value, clear completed_at so
        # the audit trail reflects the new lifecycle.
        new_status = update_data.get("status")
        if new_status and new_status != WorkItemStatus.DONE.value:
            item.completed_at = None

    # Block manually marking a parent done while any child is still open.
    # This applies in two directions:
    #   - Epic: rejected if any of its stories/tasks/bugs aren't done.
    #   - Story/Task/Bug: rejected if any of its subtasks aren't done.
    # The rule is recursive by induction — to mark an Epic done you must first
    # mark its children done, and to mark each child done its own subtasks
    # must be done. So checking direct children is sufficient to cover all
    # descendants.
    if update_data.get("status") == WorkItemStatus.DONE.value:
        if item.type == WorkItemType.EPIC.value:
            open_child = (
                db.query(WorkItem.id, WorkItem.key)
                .filter(
                    WorkItem.epic_id == item.id,
                    WorkItem.type.in_(
                        [
                            WorkItemType.USER_STORY.value,
                            WorkItemType.TASK.value,
                            WorkItemType.BUG.value,
                        ]
                    ),
                    WorkItem.status != WorkItemStatus.DONE.value,
                )
                .first()
            )
            if open_child is not None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Can't mark epic done — {open_child.key} is still open. "
                        "Complete every story/task/bug under this epic first."
                    ),
                )
        elif item.type in (
            WorkItemType.USER_STORY.value,
            WorkItemType.TASK.value,
            WorkItemType.BUG.value,
        ):
            open_subtask = (
                db.query(WorkItem.id, WorkItem.key)
                .filter(
                    WorkItem.parent_id == item.id,
                    WorkItem.type == WorkItemType.SUBTASK.value,
                    WorkItem.status != WorkItemStatus.DONE.value,
                )
                .first()
            )
            if open_subtask is not None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Can't mark this ticket done — subtask {open_subtask.key} "
                        "is still open. Complete every subtask first."
                    ),
                )

    # Handle frontend compatibility: assigned_hours -> estimated_hours
    if "assigned_hours" in update_data:
        update_data["estimated_hours"] = update_data.pop("assigned_hours")

    # Validate hierarchy if type / parent_id / epic_id is being touched.
    # Compute the proposed post-update values so we validate the final shape.
    if any(k in update_data for k in ("type", "parent_id", "epic_id")):
        validate_hierarchy(
            db,
            item_type=update_data.get("type", item.type),
            project_id=item.project_id,
            parent_id=update_data.get("parent_id", item.parent_id),
            epic_id=update_data.get("epic_id", item.epic_id),
            item_id=item.id,
        )

    # Handle date fields - parse ISO strings to datetime
    if "start_date" in update_data and update_data["start_date"]:
        update_data["start_date"] = datetime.fromisoformat(
            update_data["start_date"].replace("Z", "+00:00")
        )
    if "due_date" in update_data and update_data["due_date"]:
        update_data["due_date"] = datetime.fromisoformat(
            update_data["due_date"].replace("Z", "+00:00")
        )

    # Handle status transitions
    if "status" in update_data:
        new_status = update_data["status"]
        if new_status == WorkItemStatus.IN_PROGRESS.value and not item.started_at:
            item.started_at = datetime.utcnow()
        elif new_status == WorkItemStatus.DONE.value and not item.completed_at:
            item.completed_at = datetime.utcnow()

    for key, value in update_data.items():
        # Allow null for certain fields, skip only for others
        if (
            key in ["assignee_id", "sprint_id", "epic_id", "parent_id", "reporter_id"]
            or value is not None
        ):
            setattr(item, key, value)

    # If sprint_id was changed, set due_date to sprint end_date (Friday)
    # Skip when the caller explicitly provided a due_date — user-picked date wins.
    if "sprint_id" in update_data and "due_date" not in update_data:
        new_sprint_id = update_data["sprint_id"]
        if new_sprint_id:
            sprint = db.query(Sprint).filter(Sprint.id == new_sprint_id).first()
            if sprint and sprint.end_date:
                item.due_date = sprint.end_date
        # If sprint_id is being cleared (moved back to backlog), clear due_date
        elif new_sprint_id is None:
            item.due_date = None

    # Recalculate remaining_hours if estimated_hours or logged_hours changed
    if "estimated_hours" in update_data or "logged_hours" in update_data:
        item.remaining_hours = max(0, (item.estimated_hours or 0) - (item.logged_hours or 0))

    item.updated_at = datetime.utcnow()

    # Handle ticket transfer - create automatic comment
    if "assignee_id" in update_data:
        new_assignee_id = update_data["assignee_id"]
        # Only create comment if assignee actually changed
        if new_assignee_id != old_assignee_id:
            # Stamp the transfer time so the new assignee's capacity uses remaining (not estimated)
            item.last_assigned_at = datetime.utcnow()
            # Record the assignment change in the audit trail
            from services.assignment_history_service import record_assignment_change

            record_assignment_change(db, item.id, new_assignee_id, at=item.last_assigned_at)
            from models.developer import Developer

            new_assignee_name = "Unassigned"
            if new_assignee_id:
                new_dev = db.query(Developer).filter(Developer.id == new_assignee_id).first()
                if new_dev:
                    new_assignee_name = new_dev.name

            # Find developer associated with current user for comment author
            author_dev = db.query(Developer).filter(Developer.email == current_user.email).first()
            author_id = author_dev.id if author_dev else None

            # Create automatic transfer comment
            from models.comment import Comment

            transfer_comment = Comment(
                work_item_id=item.id,
                author_id=author_id,
                content=f"Ticket transferred from {old_assignee_name} to {new_assignee_name}.",
            )
            db.add(transfer_comment)

            # Log activity
            from models.activity_log import ActivityLog

            activity = ActivityLog(
                project_id=item.project_id,
                user_id=current_user.id,
                action="reassigned",
                entity_type="work_item",
                entity_id=item.id,
                title=f"Reassigned {item.key} from {old_assignee_name} to {new_assignee_name}",
            )
            db.add(activity)

            # Send assignment notification to new assignee if newly assigned (off the request thread)
            if new_assignee_id and new_assignee_name != "Unassigned":
                new_assignee = db.query(Developer).filter(Developer.id == new_assignee_id).first()
                if new_assignee and new_assignee.email:
                    background_tasks.add_task(
                        email_service.send_task_assignment_notification,
                        to_email=new_assignee.email,
                        to_name=new_assignee.name,
                        assigner_name=current_user.email,
                        work_item_key=item.key,
                        work_item_title=item.title,
                        work_item_description=item.description or "",
                        project_id=item.project_id,
                        work_item_id=item.id,
                        priority=item.priority,
                        due_date=item.due_date.isoformat() if item.due_date else None,
                    )

    # Log activity for status changes
    if "status" in update_data:
        from models.activity_log import ActivityLog

        action = "completed" if update_data["status"] == "done" else "updated"
        activity = ActivityLog(
            project_id=item.project_id,
            user_id=current_user.id,
            action=action,
            entity_type="work_item",
            entity_id=item.id,
            title=f"{action.capitalize()} {item.key}: {item.title}",
        )
        db.add(activity)

    # Auto-comment for every status transition — surfaces the move in the
    # ticket's comment feed alongside the existing "Ticket transferred from X
    # to Y" so the side panel reads as a single chronological audit trail.
    if "status" in update_data and update_data["status"] != old_status:
        from models.comment import Comment as _StatusComment
        from models.developer import Developer as _AuthorDev

        STATUS_LABELS = {
            WorkItemStatus.BACKLOG.value: "Backlog",
            WorkItemStatus.TODO.value: "To Do",
            WorkItemStatus.IN_PROGRESS.value: "In Progress",
            WorkItemStatus.IN_REVIEW.value: "In Review",
            WorkItemStatus.DONE.value: "Done",
        }
        new_status = update_data["status"]
        new_label = STATUS_LABELS.get(new_status, new_status.replace("_", " ").title())

        author = db.query(_AuthorDev).filter(_AuthorDev.email == current_user.email).first()
        author_id = author.id if author else None

        db.add(
            _StatusComment(
                work_item_id=item.id,
                author_id=author_id,
                content=f"Moved to {new_label}",
            )
        )

    db.commit()
    db.refresh(item)

    # Send status change email notifications to assignee and creator/reporter
    if "status" in update_data and update_data["status"] != old_status:
        from models.developer import Developer

        new_status = update_data["status"]
        changer_name = (
            current_user.name
            if hasattr(current_user, "name") and current_user.name
            else current_user.email
        )
        notified_emails = set()  # Avoid sending duplicate emails

        # Notify the assignee (if not the person making the change) — off thread
        if item.assignee_id and item.assignee and item.assignee.email:
            assignee_dev = item.assignee
            if assignee_dev.email != current_user.email:
                background_tasks.add_task(
                    email_service.send_status_change_notification,
                    to_email=assignee_dev.email,
                    to_name=assignee_dev.name,
                    changed_by=changer_name,
                    work_item_key=item.key,
                    work_item_title=item.title,
                    old_status=old_status,
                    new_status=new_status,
                    project_id=item.project_id,
                    work_item_id=item.id,
                    role="assignee",
                )
                notified_emails.add(assignee_dev.email)

        # Notify the creator/reporter (if different from assignee and not the person making the change)
        if item.reporter_id and item.reporter and item.reporter.email:
            reporter_dev = item.reporter
            if (
                reporter_dev.email != current_user.email
                and reporter_dev.email not in notified_emails
            ):
                background_tasks.add_task(
                    email_service.send_status_change_notification,
                    to_email=reporter_dev.email,
                    to_name=reporter_dev.name,
                    changed_by=changer_name,
                    work_item_key=item.key,
                    work_item_title=item.title,
                    old_status=old_status,
                    new_status=new_status,
                    project_id=item.project_id,
                    work_item_id=item.id,
                    role="creator",
                )

    hour_fields_changed = any(
        f in update_data for f in ("estimated_hours", "logged_hours", "remaining_hours")
    )

    if item.type == WorkItemType.SUBTASK.value:
        # Subtask changes propagate up to parent (story/task/bug) and then to
        # the grandparent epic via the parent's epic_id.
        status_or_hours_changed = "status" in update_data or hour_fields_changed
        parent_changed = "parent_id" in update_data and item.parent_id != old_parent_id
        if status_or_hours_changed or parent_changed:
            propagate_from_subtask(item, db)
            # If re-parented, refresh the FORMER parent too (it just lost a subtask).
            if parent_changed and old_parent_id is not None:
                old_parent = db.query(WorkItem).filter(WorkItem.id == old_parent_id).first()
                if old_parent is not None:
                    refresh_parent_and_epic(old_parent, db)
            db.commit()
    else:
        # Story / task / bug / epic — existing single-level rollup to the epic.
        if "status" in update_data and item.epic_id:
            update_epic_status_from_stories(item.epic_id, db)

        if hour_fields_changed and item.epic_id:
            update_epic_hours(item.epic_id, db)

        # epic_id changed (item moved between epics): refresh both ends.
        if "epic_id" in update_data:
            if item.epic_id:
                update_epic_hours(item.epic_id, db)
                update_epic_status_from_stories(item.epic_id, db)
            if old_epic_id and old_epic_id != item.epic_id:
                update_epic_hours(old_epic_id, db)
                update_epic_status_from_stories(old_epic_id, db)

        if ("status" in update_data or hour_fields_changed or "epic_id" in update_data) and (
            item.epic_id or old_epic_id
        ):
            db.commit()

    # Return with assignee name
    assignee_name = "Unassigned"
    if item.assignee_id and item.assignee:
        assignee_name = item.assignee.name

    sprint_name = "Backlog"
    if item.sprint_id and item.sprint:
        sprint_name = item.sprint.name

    return {
        "id": str(item.id),
        "key": item.key,
        "type": item.type,
        "title": item.title,
        "description": item.description or "",
        "status": item.status,
        "priority": item.priority,
        "story_points": item.story_points or 0,
        "assigned_hours": item.estimated_hours or 0,
        "estimated_hours": item.estimated_hours or 0,
        "remaining_hours": item.remaining_hours or 0,
        "logged_hours": item.logged_hours or 0,
        "assignee": assignee_name,
        "assignee_id": item.assignee_id,
        "sprint": sprint_name,
        "sprint_id": item.sprint_id,
        "epic": "",
        "epic_id": item.epic_id,
        "parent_id": item.parent_id,
        "tags": item.tags or [],
        "acceptance_criteria": item.acceptance_criteria or [],
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "start_date": item.start_date.isoformat() if item.start_date else None,
        "is_overdue": bool(
            item.due_date and item.due_date < datetime.utcnow() and item.status != "done"
        ),
        "started_at": item.started_at.isoformat() if item.started_at else None,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.put("/batch/status")
def batch_update_status(
    update: BatchStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batch update status for multiple work items (requires auth)"""
    items = db.query(WorkItem).filter(WorkItem.id.in_(update.item_ids)).all()

    # Block marking a parent done while any of its descendants is still open
    # (matches the single-item rule in update_work_item). Checked once per item
    # before any writes so the whole batch is rejected atomically.
    if update.status == WorkItemStatus.DONE.value:
        for item in items:
            if item.type == WorkItemType.EPIC.value:
                open_child = (
                    db.query(WorkItem.id, WorkItem.key)
                    .filter(
                        WorkItem.epic_id == item.id,
                        WorkItem.type.in_(
                            [
                                WorkItemType.USER_STORY.value,
                                WorkItemType.TASK.value,
                                WorkItemType.BUG.value,
                            ]
                        ),
                        WorkItem.status != WorkItemStatus.DONE.value,
                        WorkItem.id.notin_(update.item_ids),
                    )
                    .first()
                )
                if open_child is not None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Can't mark epic {item.key} done — {open_child.key} is still open."
                        ),
                    )
            elif item.type in (
                WorkItemType.USER_STORY.value,
                WorkItemType.TASK.value,
                WorkItemType.BUG.value,
            ):
                open_subtask = (
                    db.query(WorkItem.id, WorkItem.key)
                    .filter(
                        WorkItem.parent_id == item.id,
                        WorkItem.type == WorkItemType.SUBTASK.value,
                        WorkItem.status != WorkItemStatus.DONE.value,
                        WorkItem.id.notin_(update.item_ids),
                    )
                    .first()
                )
                if open_subtask is not None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Can't mark {item.key} done — subtask {open_subtask.key} "
                            "is still open."
                        ),
                    )

    # Collect epics that need updating
    epics_to_update = set()

    for item in items:
        item.status = update.status
        if update.status == WorkItemStatus.IN_PROGRESS.value and not item.started_at:
            item.started_at = datetime.utcnow()
        elif update.status == WorkItemStatus.DONE.value and not item.completed_at:
            item.completed_at = datetime.utcnow()
        item.updated_at = datetime.utcnow()

        # Track epics that need status updates
        if item.epic_id:
            epics_to_update.add(item.epic_id)

    db.commit()

    # Update epic statuses for all affected epics
    for epic_id in epics_to_update:
        update_epic_status_from_stories(epic_id, db)

    if epics_to_update:
        db.commit()

    return {"updated": [item.id for item in items], "count": len(items)}


@router.delete("/{item_id}")
def delete_work_item(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a work item (requires auth)"""
    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Stash linkage fields before deletion so we know what to recompute
    epic_id = item.epic_id
    parent_id = item.parent_id
    item_type = item.type

    # Log activity before deletion
    from models.activity_log import ActivityLog

    activity = ActivityLog(
        project_id=item.project_id,
        user_id=current_user.id,
        action="deleted",
        entity_type="work_item",
        title=f"Deleted {item.key}: {item.title}",
    )
    db.add(activity)

    db.delete(item)
    db.commit()

    # Propagation on delete:
    # - Subtask: walk up parent → grandparent epic
    # - Story/task/bug linked to an epic: refresh that epic
    if item_type == WorkItemType.SUBTASK.value and parent_id is not None:
        parent = db.query(WorkItem).filter(WorkItem.id == parent_id).first()
        if parent is not None:
            refresh_parent_and_epic(parent, db)
            db.commit()
    elif epic_id:
        update_epic_hours(epic_id, db)
        update_epic_status_from_stories(epic_id, db)
        db.commit()

    return {"status": "deleted", "id": item_id}


class LogHoursRequest(BaseModel):
    hours: int
    description: str | None = None
    developer_id: int | None = None  # Optional: specify who did the work (defaults to current user)


@router.post("/{item_id}/log-hours")
def log_hours(
    item_id: int,
    request: LogHoursRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Log hours to a work item - creates time entry and updates totals.

    Authorization: only the developer the ticket is assigned to may log hours
    on it. The caller is matched to a Developer row by email; if that developer
    isn't the assignee, the request is rejected. Tickets with no assignee
    cannot be logged against by anyone.
    """
    from models.developer import Developer
    from models.time_entry import TimeEntry

    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Done tickets are frozen — re-open before logging more hours.
    if item.status == WorkItemStatus.DONE.value:
        raise HTTPException(
            status_code=403,
            detail="This ticket is marked done. Re-open it before logging hours.",
        )

    # Assignee-only enforcement
    if not item.assignee_id:
        raise HTTPException(
            status_code=403,
            detail="This ticket has no assignee — hours can only be logged on assigned tickets.",
        )
    caller_dev = db.query(Developer).filter(Developer.email == current_user.email).first()
    if not caller_dev or caller_dev.id != item.assignee_id:
        raise HTTPException(
            status_code=403,
            detail="Only the ticket's assignee can log hours on it.",
        )

    if request.hours <= 0:
        raise HTTPException(status_code=400, detail="Hours must be greater than 0")

    # Sanity cap. One log call represents one work session. A 24h log is
    # essentially always a typo (e.g., "22" instead of "2" — exactly how PROJ-333
    # ended up with hours=22 on a 2h-estimated ticket). Callers who legitimately
    # need to log more time should split it across sessions.
    if request.hours > 24:
        raise HTTPException(
            status_code=400,
            detail=f"Hours per log ({request.hours}) exceeds the 24h sanity cap. Split into multiple log entries.",
        )

    # Determine who to attribute the hours to
    developer = None

    if request.developer_id:
        # Use explicitly specified developer (e.g., logging hours for someone else)
        developer = db.query(Developer).filter(Developer.id == request.developer_id).first()
        if not developer:
            raise HTTPException(
                status_code=404, detail=f"Developer with id {request.developer_id} not found"
            )
    elif item.assignee_id:
        # Default: attribute to the TICKET ASSIGNEE (the person assigned to the ticket)
        # This ensures hours are credited to the person doing the work, not the person clicking the button
        developer = db.query(Developer).filter(Developer.id == item.assignee_id).first()
    else:
        # Fallback: attribute to the person logging the time if no assignee
        developer = db.query(Developer).filter(Developer.email == current_user.email).first()

    # Reject duplicate submissions within a short window — protects against
    # rapid double-clicks on the "Log Hours" button creating duplicate TimeEntry
    # rows (the historical cause of PROJ-333 accumulating 22h of identical 2h
    # entries on a 2h-estimated ticket).
    dev_id_for_dedupe = developer.id if developer else item.assignee_id
    if dev_id_for_dedupe is not None:
        from datetime import timedelta

        dedupe_window_start = datetime.utcnow() - timedelta(seconds=5)
        recent_duplicate = (
            db.query(TimeEntry)
            .filter(
                TimeEntry.work_item_id == item_id,
                TimeEntry.developer_id == dev_id_for_dedupe,
                TimeEntry.hours == request.hours,
                TimeEntry.logged_at >= dedupe_window_start,
            )
            .first()
        )
        if recent_duplicate is not None:
            raise HTTPException(
                status_code=429,
                detail="Duplicate log-hours request detected. Please wait a moment before logging again.",
            )

    # Create time entry
    time_entry = TimeEntry(
        work_item_id=item_id,
        developer_id=developer.id if developer else item.assignee_id,  # Fallback to assignee_id
        hours=request.hours,
        description=request.description,
    )
    db.add(time_entry)
    db.flush()  # ensure the new TimeEntry is visible to the sum query below

    # Auto-comment: surfaces the log event in the ticket's comments feed
    # alongside the existing "Ticket transferred from X to Y" comments so
    # users see a single chronological audit trail in the side panel.
    from models.comment import Comment as _LogComment

    db.add(
        _LogComment(
            work_item_id=item_id,
            author_id=developer.id if developer else None,
            content=f"Logged {request.hours}h",
        )
    )

    # Recompute logged_hours from the live TimeEntry sum instead of `+=`.
    # The naive accumulator drifts whenever ANYTHING else has touched the column
    # (direct PUT writes, deleted entries, manual DB edits). Querying SUM each
    # time keeps the rollup self-healing — `logged_hours` is always exactly the
    # sum of its TimeEntry rows.
    item.logged_hours = (
        db.query(func.coalesce(func.sum(TimeEntry.hours), 0))
        .filter(TimeEntry.work_item_id == item_id)
        .scalar()
    ) or 0
    item.remaining_hours = max(0, (item.estimated_hours or 0) - (item.logged_hours or 0))
    item.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(item)

    # Roll up:
    # - Logging on a subtask propagates two levels (parent → grandparent epic).
    # - Logging on a story/task/bug under an epic propagates one level.
    if item.type == WorkItemType.SUBTASK.value and item.parent_id:
        propagate_from_subtask(item, db)
        db.commit()
    elif item.epic_id:
        update_epic_hours(item.epic_id, db)
        db.commit()

    # Return updated item
    return {
        "id": str(item.id),
        "key": item.key,
        "logged_hours": item.logged_hours,
        "remaining_hours": item.remaining_hours,
        "time_entry": time_entry.to_dict(),
        "message": f"Logged {request.hours}h successfully",
    }


@router.get("/{item_id}/time-entries")
def get_work_item_time_entries(
    item_id: int,
    this_week_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get time entries for a specific work item (requires auth)"""
    from datetime import timedelta

    from models.developer import Developer
    from models.time_entry import TimeEntry

    # Verify work item exists
    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Get all time entries for this work item
    time_entries = db.query(TimeEntry).filter(TimeEntry.work_item_id == item_id).all()

    # Calculate week boundaries if filtering by this week
    week_start = None
    week_end = None
    if this_week_only:
        today = datetime.utcnow()
        days_since_sunday = (today.weekday() + 1) % 7
        week_start = today - timedelta(days=days_since_sunday)
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    # Build response with developer info
    result = []
    for te in time_entries:
        # Filter by this week if requested
        if this_week_only and te.logged_at and not (week_start <= te.logged_at <= week_end):
            continue

        developer = (
            db.query(Developer).filter(Developer.id == te.developer_id).first()
            if te.developer_id
            else None
        )

        result.append(
            {
                "id": te.id,
                "developer_id": te.developer_id,
                "developer_name": developer.name if developer else "Unknown",
                "developer_email": developer.email if developer else None,
                "hours": te.hours,
                "description": te.description,
                "logged_at": te.logged_at.isoformat() if te.logged_at else None,
                "is_this_week": te.logged_at
                and week_start
                and week_end
                and week_start <= te.logged_at <= week_end
                if not this_week_only
                else True,
            }
        )

    # Calculate this week's total
    this_week_total = (
        sum(
            te.hours
            for te in time_entries
            if te.logged_at and week_start and week_end and week_start <= te.logged_at <= week_end
        )
        if week_start and week_end
        else 0
    )

    return {
        "work_item_id": item_id,
        "work_item_key": item.key,
        "work_item_title": item.title,
        "total_logged_hours": item.logged_hours or 0,
        "this_week_total": this_week_total,
        "week_range": {
            "start": week_start.isoformat() if week_start else None,
            "end": week_end.isoformat() if week_end else None,
        }
        if week_start
        else None,
        "time_entries": result,
        "count": len(result),
    }


@router.post("/generate")
async def generate_work_items(
    request: GenerateStoriesRequest, current_user: User = Depends(get_current_user)
):
    """Generate work items using LLM agent (requires auth)"""
    global item_counter

    # Get project key prefix
    key_prefix = "WI"
    try:
        from routers.projects import projects_db

        project = next((p for p in projects_db if str(p["id"]) == request.product_id), None)
        if project:
            key_prefix = project.get("key_prefix", "WI")
    except Exception:
        pass

    try:
        result = await llm_agent.decompose_project(
            project_description=f"{request.product_name}: {request.product_description}",
            target_market="",
        )

        generated_items = []
        tasks = result.get("tasks", [])
        stories = result.get("user_stories", [])

        all_items = []
        for task in tasks[: request.count]:
            all_items.append(
                {
                    "type": "task",
                    "title": task.get("title", "Generated Task"),
                    "description": task.get("description", ""),
                    "priority": task.get("priority", "medium"),
                    "story_points": task.get("story_points", 3),
                    "tags": task.get("dependencies", [])[:3],
                    "epic": task.get("epic", ""),
                }
            )

        for story in stories[: max(0, request.count - len(all_items))]:
            title = story.get("title", "")
            if not title and story.get("as_a"):
                title = f"As a {story['as_a']}, I want {story.get('i_want', '')}"
            all_items.append(
                {
                    "type": "user_story",
                    "title": title or "Generated Story",
                    "description": story.get("description", story.get("so_that", "")),
                    "priority": story.get("priority", "medium"),
                    "story_points": story.get("story_points", 3),
                    "tags": [],
                    "epic": "",
                }
            )

        for item_data in all_items:
            item_counter += 1
            item_id = f"{key_prefix}-{item_counter}"
            work_item = {
                "id": item_id,
                "type": item_data["type"],
                "title": item_data["title"],
                "description": item_data["description"],
                "status": "todo",
                "assigned_hours": item_data["story_points"] * 4,
                "remaining_hours": item_data["story_points"] * 4,
                "logged_hours": 0,
                "story_points": item_data["story_points"],
                "priority": item_data["priority"],
                "assignee": "Unassigned",
                "sprint": "Backlog",
                "product_id": request.product_id,
                "tags": item_data.get("tags", []),
                "epic": item_data.get("epic", ""),
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
            generated_items.append(work_item)

        return {"items": generated_items, "generated_count": len(generated_items)}

    except Exception as e:
        # Fallback: generate placeholder items
        generated_items = []
        types = ["user_story", "task", "bug"]
        priorities = ["high", "medium", "low"]
        for i in range(min(request.count, 5)):
            item_counter += 1
            item_id = f"{key_prefix}-{item_counter}"
            work_item = {
                "id": item_id,
                "type": types[i % len(types)],
                "title": f"Generated: {request.product_name} - Item {i + 1}",
                "description": f"Auto-generated item for {request.product_description}",
                "status": "todo",
                "assigned_hours": 8,
                "remaining_hours": 8,
                "logged_hours": 0,
                "story_points": [1, 2, 3, 5, 8][i % 5],
                "priority": priorities[i % len(priorities)],
                "assignee": "Unassigned",
                "sprint": "Backlog",
                "product_id": request.product_id,
                "tags": ["ai-generated"],
                "epic": "",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
            generated_items.append(work_item)

        return {
            "items": generated_items,
            "generated_count": len(generated_items),
            "note": f"Fallback generation used (AI error: {str(e)[:100]})",
        }


# Sprint endpoints
@router.post("/sprints")
def create_sprint(
    sprint: SprintCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new sprint (requires auth)"""
    # Verify project exists
    project = db.query(Project).filter(Project.id == sprint.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    new_sprint = Sprint(
        project_id=sprint.project_id,
        name=sprint.name,
        goal=sprint.goal,
        start_date=datetime.fromisoformat(sprint.start_date) if sprint.start_date else None,
        end_date=datetime.fromisoformat(sprint.end_date) if sprint.end_date else None,
        capacity_hours=sprint.capacity_hours,
    )

    db.add(new_sprint)
    db.commit()
    db.refresh(new_sprint)
    return new_sprint


@router.get("/sprints/list")
def list_sprints(
    project_id: int = None,
    status: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List sprints, optionally filtered by project (requires auth)"""
    query = db.query(Sprint)
    if project_id:
        query = query.filter(Sprint.project_id == project_id)
    if status:
        query = query.filter(Sprint.status == status)
    return query.all()


@router.get("/sprints/{sprint_id}")
def get_sprint(
    sprint_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get a specific sprint with its work items (requires auth)"""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    return sprint


@router.put("/sprints/{sprint_id}/activate")
def activate_sprint(
    sprint_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Activate a sprint (requires auth)"""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    sprint.status = SprintStatus.ACTIVE.value
    sprint.activated_at = datetime.utcnow()
    db.commit()
    db.refresh(sprint)
    return sprint


@router.put("/sprints/{sprint_id}/complete")
def complete_sprint(
    sprint_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Complete a sprint (requires auth)"""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    sprint.status = SprintStatus.COMPLETED.value
    sprint.completed_at = datetime.utcnow()

    # Calculate velocity (completed story points)
    completed_points = (
        db.query(func.sum(WorkItem.story_points))
        .filter(WorkItem.sprint_id == sprint_id, WorkItem.status == WorkItemStatus.DONE.value)
        .scalar()
        or 0
    )

    sprint.velocity = completed_points
    db.commit()
    db.refresh(sprint)
    return sprint


class SprintUpdate(BaseModel):
    name: str | None = None
    goal: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    capacity_hours: int | None = None


@router.put("/sprints/{sprint_id}")
async def update_sprint(
    sprint_id: int,
    data: SprintUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update sprint fields (requires auth)"""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    if data.name is not None:
        sprint.name = data.name
    if data.goal is not None:
        sprint.goal = data.goal
    if data.start_date is not None:
        sprint.start_date = datetime.fromisoformat(data.start_date) if data.start_date else None
    if data.end_date is not None:
        sprint.end_date = datetime.fromisoformat(data.end_date) if data.end_date else None
    if data.capacity_hours is not None:
        sprint.capacity_hours = data.capacity_hours

    sprint.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(sprint)
    return sprint


@router.delete("/sprints/{sprint_id}")
async def delete_sprint(
    sprint_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a sprint; work items are unassigned (sprint_id → NULL) (requires auth)"""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    db.delete(sprint)
    db.commit()
    return {"ok": True}


class MoveTicketRequest(BaseModel):
    target_sprint_id: int | None = None  # null means move to backlog


@router.put("/{item_id}/move-sprint")
def move_ticket_to_sprint(
    item_id: int,
    request: MoveTicketRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a ticket to a different sprint or to backlog (requires auth)"""
    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Done tickets are frozen — re-open before re-assigning to another sprint.
    if item.status == WorkItemStatus.DONE.value:
        raise HTTPException(
            status_code=403,
            detail="This ticket is marked done. Re-open it before moving sprints.",
        )

    # If moving to backlog
    if request.target_sprint_id is None:
        item.sprint_id = None
        item.status = WorkItemStatus.BACKLOG.value
    else:
        # Verify sprint exists and belongs to same project
        sprint = (
            db.query(Sprint)
            .filter(Sprint.id == request.target_sprint_id, Sprint.project_id == item.project_id)
            .first()
        )
        if not sprint:
            raise HTTPException(
                status_code=404, detail="Sprint not found or doesn't belong to this project"
            )

        item.sprint_id = request.target_sprint_id
        # If item was in backlog, move to todo
        if item.status == WorkItemStatus.BACKLOG.value:
            item.status = WorkItemStatus.TODO.value

    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)

    # Return with sprint name
    sprint_name = "Backlog"
    if item.sprint_id and item.sprint:
        sprint_name = item.sprint.name

    assignee_name = "Unassigned"
    if item.assignee_id and item.assignee:
        assignee_name = item.assignee.name

    return {
        "id": str(item.id),
        "key": item.key,
        "type": item.type,
        "title": item.title,
        "description": item.description or "",
        "status": item.status,
        "priority": item.priority,
        "story_points": item.story_points or 0,
        "assigned_hours": item.estimated_hours or 0,
        "remaining_hours": item.remaining_hours or 0,
        "logged_hours": item.logged_hours or 0,
        "assignee": assignee_name,
        "assignee_id": item.assignee_id,
        "sprint": sprint_name,
        "sprint_id": item.sprint_id,
        "epic": "",
        "tags": item.tags or [],
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "updated_at": item.updated_at.isoformat() if item.updated_at else None,
    }


@router.get("/projects/{project_id}/sprints")
def list_project_sprints(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """List all sprints for a project with work item counts (requires auth)"""
    sprints = (
        db.query(Sprint).filter(Sprint.project_id == project_id).order_by(Sprint.start_date).all()
    )

    # Compute sprint status on-read (no DB mutation on GET)
    today = datetime.utcnow()

    def _computed_status(sprint: Sprint) -> str:
        """Compute display status without mutating the row."""
        if (
            sprint.status in (SprintStatus.PLANNING.value, "planned")
            and sprint.start_date
            and sprint.end_date
        ):
            if sprint.start_date <= today <= sprint.end_date:
                return SprintStatus.ACTIVE.value
            if today > sprint.end_date:
                return SprintStatus.COMPLETED.value
        elif (
            sprint.status == SprintStatus.ACTIVE.value
            and sprint.end_date
            and today > sprint.end_date
        ):
            return SprintStatus.COMPLETED.value
        return sprint.status

    # Single GROUP BY query for all sprint counts/sums (replaces 5N queries)
    sprint_ids = [s.id for s in sprints]
    counts_by_sprint: dict[int, dict] = {}
    if sprint_ids:
        agg_rows = (
            db.query(
                WorkItem.sprint_id,
                func.sum(case((WorkItem.status == WorkItemStatus.TODO.value, 1), else_=0)).label(
                    "todo"
                ),
                func.sum(
                    case((WorkItem.status == WorkItemStatus.IN_PROGRESS.value, 1), else_=0)
                ).label("in_progress"),
                func.sum(case((WorkItem.status == WorkItemStatus.DONE.value, 1), else_=0)).label(
                    "done"
                ),
                func.sum(WorkItem.story_points).label("total_points"),
                func.sum(
                    case(
                        (WorkItem.status == WorkItemStatus.DONE.value, WorkItem.story_points),
                        else_=0,
                    )
                ).label("completed_points"),
            )
            .filter(WorkItem.sprint_id.in_(sprint_ids))
            .group_by(WorkItem.sprint_id)
            .all()
        )
        for row in agg_rows:
            counts_by_sprint[row.sprint_id] = {
                "todo": int(row.todo or 0),
                "in_progress": int(row.in_progress or 0),
                "done": int(row.done or 0),
                "total_points": int(row.total_points or 0),
                "completed_points": int(row.completed_points or 0),
            }

    result = []
    for sprint in sprints:
        stats = counts_by_sprint.get(
            sprint.id,
            {"todo": 0, "in_progress": 0, "done": 0, "total_points": 0, "completed_points": 0},
        )
        todo_count = stats["todo"]
        in_progress_count = stats["in_progress"]
        done_count = stats["done"]
        total_points = stats["total_points"]
        completed_points = stats["completed_points"]

        result.append(
            {
                "id": sprint.id,
                "name": sprint.name,
                "goal": sprint.goal,
                "status": _computed_status(sprint),
                "start_date": sprint.start_date.isoformat() if sprint.start_date else None,
                "end_date": sprint.end_date.isoformat() if sprint.end_date else None,
                "capacity_hours": sprint.capacity_hours,
                "velocity": sprint.velocity,
                "total_items": todo_count + in_progress_count + done_count,
                "todo_count": todo_count,
                "in_progress_count": in_progress_count,
                "done_count": done_count,
                "total_points": total_points,
                "completed_points": completed_points,
                "completion_pct": round(
                    (completed_points / total_points * 100) if total_points > 0 else 0, 1
                ),
            }
        )

    return result


@router.get("/projects/{project_id}/analytics")
def get_project_analytics(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get project analytics for charts and graphs (requires auth)"""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all work items for the project
    items = db.query(WorkItem).filter(WorkItem.project_id == project_id).all()

    # Status distribution
    status_counts = {}
    for status in WorkItemStatus:
        count = sum(1 for item in items if item.status == status.value)
        if count > 0:
            status_counts[status.value] = count

    # Type distribution
    type_counts = {}
    for item_type in WorkItemType:
        count = sum(1 for item in items if item.type == item_type.value)
        if count > 0:
            type_counts[item_type.value] = count

    # Priority distribution
    priority_counts = {}
    for item in items:
        priority_counts[item.priority] = priority_counts.get(item.priority, 0) + 1

    # Sprint velocity data
    sprints = (
        db.query(Sprint).filter(Sprint.project_id == project_id).order_by(Sprint.start_date).all()
    )
    # Aggregate sprint points in-Python from already-loaded items (no extra DB queries)
    points_by_sprint: dict[int, dict] = {}
    for item in items:
        if item.sprint_id is None:
            continue
        sp = item.story_points or 0
        bucket = points_by_sprint.setdefault(item.sprint_id, {"total": 0, "completed": 0})
        bucket["total"] += sp
        if item.status == WorkItemStatus.DONE.value:
            bucket["completed"] += sp

    velocity_data = []
    for sprint in sprints:
        bucket = points_by_sprint.get(sprint.id, {"total": 0, "completed": 0})
        velocity_data.append(
            {
                "sprint_name": sprint.name,
                "committed": bucket["total"],
                "completed": bucket["completed"],
                "start_date": sprint.start_date.isoformat() if sprint.start_date else None,
            }
        )

    # Burndown data (last 14 days)
    from datetime import timedelta

    burndown_data = []
    for i in range(14, -1, -1):
        date = datetime.utcnow() - timedelta(days=i)
        # Count items done by this date
        done_count = sum(
            1
            for item in items
            if item.status == WorkItemStatus.DONE.value
            and item.completed_at
            and item.completed_at.date() <= date.date()
        )
        total_count = len(items)
        remaining = total_count - done_count
        burndown_data.append(
            {"date": date.strftime("%Y-%m-%d"), "remaining": remaining, "completed": done_count}
        )

    # Team performance (by assignee)
    assignee_stats = {}
    for item in items:
        if item.assignee_id:
            if item.assignee_id not in assignee_stats:
                assignee_stats[item.assignee_id] = {
                    "name": item.assignee.name if item.assignee else f"User {item.assignee_id}",
                    "total_items": 0,
                    "completed_items": 0,
                    "total_points": 0,
                    "completed_points": 0,
                }
            assignee_stats[item.assignee_id]["total_items"] += 1
            assignee_stats[item.assignee_id]["total_points"] += item.story_points or 0
            if item.status == WorkItemStatus.DONE.value:
                assignee_stats[item.assignee_id]["completed_items"] += 1
                assignee_stats[item.assignee_id]["completed_points"] += item.story_points or 0

    return {
        "total_items": len(items),
        "total_story_points": sum(item.story_points or 0 for item in items),
        "completed_points": sum(
            item.story_points or 0 for item in items if item.status == WorkItemStatus.DONE.value
        ),
        "status_distribution": status_counts,
        "type_distribution": type_counts,
        "priority_distribution": priority_counts,
        "velocity_data": velocity_data,
        "burndown_data": burndown_data,
        "team_performance": list(assignee_stats.values()),
    }


@router.get("/projects/{project_id}/hours-analytics")
def get_hours_analytics(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Get hours analytics for project manager view.
    Authorized for users with the project.pm capability OR project-level admin
    membership on this specific project (matches frontend canSeePMTab logic).
    """
    if not current_user.has_capability("project.pm"):
        project = db.query(Project).filter(Project.id == project_id).first()
        is_project_admin = bool(
            project
            and any(d.email == current_user.email and d.is_admin for d in project.developers)
        )
        if not is_project_admin:
            raise HTTPException(
                status_code=403,
                detail="Missing required capability: project.pm or project-level admin",
            )
    from models.developer import Developer

    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all work items for the project
    items = db.query(WorkItem).filter(WorkItem.project_id == project_id).all()

    # Get all sprints
    sprints = (
        db.query(Sprint).filter(Sprint.project_id == project_id).order_by(Sprint.start_date).all()
    )

    # Compute sprint status on-read (no DB mutation on GET) — same logic as list endpoint
    now = datetime.utcnow()

    def _sprint_display_status(sprint: Sprint) -> str:
        if (
            sprint.status in (SprintStatus.PLANNING.value, "planned")
            and sprint.start_date
            and sprint.end_date
        ):
            if sprint.start_date <= now <= sprint.end_date:
                return SprintStatus.ACTIVE.value
            if now > sprint.end_date:
                return SprintStatus.COMPLETED.value
        elif (
            sprint.status == SprintStatus.ACTIVE.value and sprint.end_date and now > sprint.end_date
        ):
            return SprintStatus.COMPLETED.value
        return sprint.status

    # Get all developers assigned to this project
    developers = list(project.developers) if hasattr(project, "developers") else []

    # Hours per sprint (exclude epics to avoid duplication - epic hours are derived from children)
    sprint_hours = []
    for sprint in sprints:
        sprint_items = [
            item
            for item in items
            if item.sprint_id == sprint.id and item.type != WorkItemType.EPIC.value
        ]
        allocated = sum(item.estimated_hours or 0 for item in sprint_items)
        logged = sum(item.logged_hours or 0 for item in sprint_items)
        # Calculate remaining properly: estimated - logged for incomplete items
        remaining = sum(
            max(0, (item.estimated_hours or 0) - (item.logged_hours or 0))
            for item in sprint_items
            if item.status != WorkItemStatus.DONE.value
        )

        sprint_hours.append(
            {
                "sprint_id": sprint.id,
                "sprint_name": sprint.name,
                "status": _sprint_display_status(sprint),
                "allocated_hours": allocated,
                "logged_hours": logged,
                "remaining_hours": remaining,
                "total_items": len(sprint_items),
            }
        )

    # Hours per developer - track both current assignments AND past contributions
    developer_hours = []
    from models.time_entry import TimeEntry

    # Get all time entries for this project's work items
    work_item_ids = [item.id for item in items]
    all_time_entries = (
        db.query(TimeEntry).filter(TimeEntry.work_item_id.in_(work_item_ids)).all()
        if work_item_ids
        else []
    )

    # Also get developers who have logged time entries for this project's work items
    # (they might not be formally assigned to the project)
    developer_ids_from_entries = {te.developer_id for te in all_time_entries if te.developer_id}
    existing_ids = {d.id for d in developers}

    for dev_id in developer_ids_from_entries:
        if dev_id not in existing_ids:
            dev = db.query(Developer).filter(Developer.id == dev_id).first()
            if dev:
                developers.append(dev)
                existing_ids.add(dev_id)

    # Build maps for quick lookup
    work_item_assignee_map = {item.id: item.assignee_id for item in items}
    work_item_map = {item.id: item for item in items}
    dev_map = {d.id: d for d in developers}

    for dev in developers:
        # Tickets currently assigned to this developer (exclude epics to avoid duplication)
        dev_items = [
            item
            for item in items
            if item.assignee_id == dev.id and item.type != WorkItemType.EPIC.value
        ]

        # Hours logged BY this developer (their own time entries where developer_id = dev.id)
        # OR if developer_id is NULL, fall back to ticket assignee attribution
        dev_time_entries = [
            te
            for te in all_time_entries
            if te.developer_id == dev.id
            or (te.developer_id is None and work_item_assignee_map.get(te.work_item_id) == dev.id)
        ]
        logged = sum(te.hours for te in dev_time_entries)

        # Allocated = estimated hours on currently-assigned tickets, minus hours
        # already logged by OTHER developers on those tickets. Previous assignees'
        # work shouldn't show up on the new assignee's plate after a transfer:
        # a 6h ticket with 3h already logged before takeover becomes 3h allocated.
        # Per-ticket: total logged on the ticket minus this dev's own logs on it
        # gives "others' logs on this ticket". Subtract from the estimate.
        my_hours_per_item: dict[int, float] = {}
        for te in dev_time_entries:
            my_hours_per_item[te.work_item_id] = my_hours_per_item.get(te.work_item_id, 0.0) + (
                te.hours or 0
            )
        allocated = sum(
            max(
                0,
                (item.estimated_hours or 0)
                - max(0, (item.logged_hours or 0) - my_hours_per_item.get(item.id, 0.0)),
            )
            for item in dev_items
        )

        # Remaining = pending work on currently-assigned non-done tickets.
        # Use per-ticket (estimate - cumulative-logged), so:
        #   • hours this dev logged on OTHER tickets don't reduce their remaining
        #   • transferred-away tickets drop off (they're no longer in dev_items)
        # Matches the sprint-level calculation above.
        remaining = sum(
            max(0, (item.estimated_hours or 0) - (item.logged_hours or 0))
            for item in dev_items
            if item.status != WorkItemStatus.DONE.value
        )

        # Hours remaining on in_progress tickets (for capacity calculation at start of week)
        in_progress_remaining = sum(
            item.estimated_hours or 0
            for item in dev_items
            if item.status == WorkItemStatus.IN_PROGRESS.value
        )

        completed_items = [item for item in dev_items if item.status == WorkItemStatus.DONE.value]
        done_logged_hours = sum(item.logged_hours or 0 for item in completed_items)

        # Current week boundaries (Saturday → Friday, UTC) — shared with admin capacity.
        from services.capacity_service import compute_capacity_breakdown, week_boundaries

        current_week_start, current_week_end = week_boundaries()

        current_week_logged = sum(
            te.hours
            for te in dev_time_entries
            if te.logged_at and current_week_start <= te.logged_at <= current_week_end
        )

        # Status-based weekly capacity breakdown for THIS developer scoped to THIS project.
        # Mirrors /api/admin/developers/capacity but filtered to the current project.
        capacity_breakdown = compute_capacity_breakdown(
            dev_items,
            current_week_start,
            db=db,
            developer_id=dev.id,
            restrict_to_project_ids={project_id},
        )

        # Build detailed ticket breakdown for this developer
        ticket_breakdown = []
        for item in dev_items:
            # Get time entries for this ticket by this developer
            ticket_entries = [te for te in dev_time_entries if te.work_item_id == item.id]
            hours_on_this_ticket = sum(te.hours for te in ticket_entries)

            ticket_breakdown.append(
                {
                    "ticket_id": item.id,
                    "key": item.key,
                    "title": item.title,
                    "status": item.status,
                    "estimated_hours": item.estimated_hours or 0,
                    "total_logged_on_ticket": item.logged_hours or 0,
                    "my_logged_hours": hours_on_this_ticket,
                    "remaining_hours": item.remaining_hours or 0,
                    "time_entries": [
                        {
                            "hours": te.hours,
                            "logged_at": te.logged_at.isoformat() if te.logged_at else None,
                            "is_this_week": te.logged_at
                            and current_week_start <= te.logged_at <= current_week_end,
                            "description": te.description,
                        }
                        for te in ticket_entries
                    ],
                }
            )

        # Calculate hours logged on others' tickets
        hours_on_others_tickets = []
        for te in dev_time_entries:
            wi = work_item_map.get(te.work_item_id)
            if wi and wi.assignee_id != dev.id:
                assignee = dev_map.get(wi.assignee_id)
                hours_on_others_tickets.append(
                    {
                        "ticket_key": wi.key,
                        "ticket_title": wi.title,
                        "ticket_assignee": assignee.name if assignee else "Unassigned",
                        "hours": te.hours,
                        "logged_at": te.logged_at.isoformat() if te.logged_at else None,
                    }
                )

        developer_hours.append(
            {
                "developer_id": dev.id,
                "developer_name": dev.name,
                "developer_email": dev.email,
                "role": dev.role if hasattr(dev, "role") else "Developer",
                "allocated_hours": allocated,
                "logged_hours": logged,
                "remaining_hours": remaining,
                "current_week_logged": current_week_logged,
                "in_progress_remaining": in_progress_remaining,
                "total_items": len(dev_items),
                "completed_items": len(completed_items),
                "done_logged_hours": done_logged_hours,
                "my_tickets": ticket_breakdown,
                "hours_logged_on_others_tickets": hours_on_others_tickets,
                "attribution_note": "Hours attributed to the person who logged them, not the ticket assignee",
                # Sat-Fri capacity breakdown scoped to this project (matches admin capacity rules)
                "week_start": current_week_start.isoformat(),
                "week_end": current_week_end.isoformat(),
                "this_week_in_progress_hours": capacity_breakdown["this_week_in_progress_hours"],
                "this_week_in_review_hours": capacity_breakdown["this_week_in_review_hours"],
                "this_week_done_hours": capacity_breakdown["this_week_done_hours"],
                "this_week_capacity_used": capacity_breakdown["this_week_capacity_used"],
                "this_week_remaining_capacity": capacity_breakdown["this_week_remaining_capacity"],
                "this_week_tickets": capacity_breakdown["tickets"],
            }
        )

    # Weekly breakdown - based on calendar weeks (Monday to Sunday)
    from datetime import timedelta

    from models.time_entry import TimeEntry

    weekly_hours = []

    # Get all time entries for this project's work items
    work_item_ids = [item.id for item in items]
    time_entries = db.query(TimeEntry).filter(TimeEntry.work_item_id.in_(work_item_ids)).all()

    # Calculate weeks from first sprint start (or project start if no sprints) to now
    today = datetime.utcnow()

    # Find the earliest sprint start date, or use project creation if no sprints
    earliest_sprint = (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id, Sprint.start_date.isnot(None))
        .order_by(Sprint.start_date.asc())
        .first()
    )

    if earliest_sprint and earliest_sprint.start_date:
        # Start from the week containing the first sprint start
        period_start = earliest_sprint.start_date
    else:
        # No sprints yet - use project creation date
        period_start = project.created_at if project.created_at else today

    # Also check if there are any work items created before the period_start
    # If so, include weeks for those items too
    if items:
        earliest_item = min((item.created_at for item in items if item.created_at), default=None)
        if earliest_item and earliest_item < period_start:
            period_start = earliest_item

    # Find the Monday of the week containing period_start
    # weekday() returns 0=Monday, 1=Tuesday, ..., 6=Sunday
    # To get the Monday of the week, subtract weekday() days
    days_since_monday = period_start.weekday()
    first_monday = period_start - timedelta(days=days_since_monday)

    # Find the furthest sprint end date to include future sprints
    furthest_sprint_end = today
    if sprints:
        sprint_end_dates = [s.end_date for s in sprints if s.end_date]
        if sprint_end_dates:
            furthest_sprint_end = max(furthest_sprint_end, max(sprint_end_dates))

    # Get the earliest sprint start date for checking pre-sprint weeks
    earliest_sprint_start = None
    if earliest_sprint and earliest_sprint.start_date:
        earliest_sprint_start = earliest_sprint.start_date

    # Generate weeks from first Monday to furthest sprint end (max 10 weeks for display)
    week_num = 1
    current_week_start = first_monday

    while current_week_start <= furthest_sprint_end:
        week_end = current_week_start + timedelta(days=6)  # Sunday

        # Time entries logged this week
        week_entries = [
            te
            for te in time_entries
            if te.logged_at and current_week_start <= te.logged_at <= min(week_end, today)
        ]

        # Sum hours from time entries this week
        week_logged = sum(te.hours for te in week_entries)

        # Items completed this week
        week_items_completed = [
            item
            for item in items
            if item.completed_at and current_week_start <= item.completed_at <= min(week_end, today)
        ]

        # Allocated hours = proportional share of sprint estimated hours overlapping this week
        # This ensures weeks show allocated work even when items have no explicit due_date
        week_allocated = 0
        for sprint in sprints:
            if sprint.start_date and sprint.end_date:
                sprint_start = sprint.start_date
                sprint_end = sprint.end_date
                # Check if this sprint overlaps with the current week
                if sprint_start <= week_end and sprint_end >= current_week_start:
                    overlap_start = max(sprint_start, current_week_start)
                    overlap_end = min(sprint_end, week_end)
                    # Count working days (Mon-Fri) in the overlap
                    overlap_working_days = 0
                    d = overlap_start
                    while d <= overlap_end:
                        if d.weekday() < 5:
                            overlap_working_days += 1
                        d += timedelta(days=1)
                    # Count total working days in the sprint
                    sprint_working_days = 0
                    d = sprint_start
                    while d <= sprint_end:
                        if d.weekday() < 5:
                            sprint_working_days += 1
                        d += timedelta(days=1)
                    if sprint_working_days > 0 and overlap_working_days > 0:
                        sprint_items_in = [item for item in items if item.sprint_id == sprint.id]
                        sprint_estimated = sum(
                            item.estimated_hours or 0 for item in sprint_items_in
                        )
                        week_allocated += round(
                            sprint_estimated * overlap_working_days / sprint_working_days
                        )
            else:
                # Sprint has no dates — fall back to item-level due_date
                sprint_items_in = [item for item in items if item.sprint_id == sprint.id]
                for item in sprint_items_in:
                    if item.due_date and current_week_start <= item.due_date <= week_end:
                        week_allocated += item.estimated_hours or 0

        # Also include items created in this week that are NOT in a scheduled sprint
        # This shows allocated work for unscheduled items created this week
        # Items assigned to sprints are handled by sprint overlap logic to avoid duplication
        items_created_this_week = [
            item
            for item in items
            if item.created_at and current_week_start <= item.created_at <= week_end
        ]

        # Check if we're in a week before the earliest sprint
        is_before_earliest_sprint = (
            earliest_sprint_start and current_week_start < earliest_sprint_start
        )

        for item in items_created_this_week:
            # Only count if NOT assigned to a sprint with actual dates
            has_scheduled_sprint = False
            if item.sprint_id:
                for sprint in sprints:
                    if sprint.id == item.sprint_id and sprint.start_date and sprint.end_date:
                        has_scheduled_sprint = True
                        break

            # Skip items with scheduled sprints if we're BEFORE that sprint
            # (they'll be counted during sprint weeks instead)
            if is_before_earliest_sprint and has_scheduled_sprint:
                continue

            # If no scheduled sprint (or not before earliest sprint), count it as allocated for the creation week
            if not has_scheduled_sprint:
                week_allocated += item.estimated_hours or 0

        weekly_hours.append(
            {
                "week": current_week_start.strftime("%Y-%m-%d"),
                "week_end": week_end.strftime("%Y-%m-%d"),
                "week_label": f"Week {week_num}",
                # Always show full Sun-Sat range for the week label, not truncated to today
                "date_range": f"{current_week_start.strftime('%Y-%m-%d')} - {week_end.strftime('%Y-%m-%d')}",
                "allocated_hours": week_allocated,
                "logged_hours": week_logged,
                "items_completed": len(week_items_completed),
            }
        )

        week_num += 1
        current_week_start = current_week_start + timedelta(weeks=1)

        # Limit to 10 most recent weeks
        if week_num > 10:
            break

    # Show weeks in chronological order (earliest first)
    # weekly_hours already built in ascending order, no reverse needed

    # Totals - calculate remaining as estimated - logged if not set (exclude epics to avoid duplication)
    non_epic_items = [item for item in items if item.type != WorkItemType.EPIC.value]
    total_allocated = sum(item.estimated_hours or 0 for item in non_epic_items)
    total_logged = sum(item.logged_hours or 0 for item in non_epic_items)
    # Calculate remaining properly: estimated - logged for each item
    total_remaining = sum(
        max(0, (item.estimated_hours or 0) - (item.logged_hours or 0))
        for item in non_epic_items
        if item.status != WorkItemStatus.DONE.value
    )

    # Add per-ticket time breakdown to each developer
    for dev_data in developer_hours:
        dev_id = dev_data["developer_id"]
        # Get all time entries by this developer
        dev_entries = [te for te in time_entries if te.developer_id == dev_id]

        # Group by work item
        ticket_breakdown = []
        for entry in dev_entries:
            # Find the work item
            work_item = next((item for item in items if item.id == entry.work_item_id), None)
            if work_item:
                ticket_breakdown.append(
                    {
                        "item_id": work_item.id,
                        "item_key": work_item.key,
                        "title": work_item.title,
                        "hours_logged": entry.hours,
                        "logged_at": entry.logged_at.isoformat() if entry.logged_at else None,
                        "description": entry.description,
                    }
                )

        dev_data["ticket_breakdown"] = ticket_breakdown

    return {
        "project_name": project.name,
        "total_allocated_hours": total_allocated,
        "total_logged_hours": total_logged,
        "total_remaining_hours": total_remaining,
        "sprint_hours": sprint_hours,
        "developer_hours": developer_hours,
        "weekly_hours": weekly_hours,
    }


# ============== TASK DEPENDENCIES ==============


class DependencyCreate(BaseModel):
    depends_on_id: int
    dependency_type: str = "blocks"  # blocks, blocked_by


@router.get("/{item_id}/dependencies")
def get_item_dependencies(
    item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get all dependencies for a work item"""
    from models.task_dependency import TaskDependency

    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    dependencies = (
        db.query(TaskDependency)
        .filter(
            (TaskDependency.work_item_id == item_id) | (TaskDependency.depends_on_id == item_id)
        )
        .all()
    )

    return [d.to_dict() for d in dependencies]


@router.post("/{item_id}/dependencies")
def add_item_dependency(
    item_id: int,
    dependency: DependencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a dependency to a work item"""
    from models.activity_log import ActivityLog
    from models.task_dependency import TaskDependency

    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Done tickets are frozen — re-open before changing their dependency graph.
    if item.status == WorkItemStatus.DONE.value:
        raise HTTPException(
            status_code=403,
            detail="This ticket is marked done. Re-open it before adding dependencies.",
        )

    depends_on = db.query(WorkItem).filter(WorkItem.id == dependency.depends_on_id).first()
    if not depends_on:
        raise HTTPException(status_code=404, detail="Dependent work item not found")

    # Check for circular dependency
    if item_id == dependency.depends_on_id:
        raise HTTPException(status_code=400, detail="Cannot create self-dependency")

    # Check if dependency already exists
    existing = (
        db.query(TaskDependency)
        .filter(
            TaskDependency.work_item_id == item_id,
            TaskDependency.depends_on_id == dependency.depends_on_id,
        )
        .first()
    )

    if existing:
        raise HTTPException(status_code=400, detail="Dependency already exists")

    new_dependency = TaskDependency(
        work_item_id=item_id,
        depends_on_id=dependency.depends_on_id,
        dependency_type=dependency.dependency_type,
    )
    db.add(new_dependency)

    # Log activity
    activity = ActivityLog(
        project_id=item.project_id,
        user_id=current_user.id,
        action="updated",
        entity_type="work_item",
        entity_id=item_id,
        title=f"Added dependency: {item.key} depends on {depends_on.key}",
    )
    db.add(activity)

    db.commit()
    db.refresh(new_dependency)
    return new_dependency.to_dict()


@router.delete("/{item_id}/dependencies/{dep_id}")
def remove_item_dependency(
    item_id: int,
    dep_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a dependency from a work item"""
    from models.activity_log import ActivityLog
    from models.task_dependency import TaskDependency

    dependency = (
        db.query(TaskDependency)
        .filter(TaskDependency.id == dep_id, TaskDependency.work_item_id == item_id)
        .first()
    )

    if not dependency:
        raise HTTPException(status_code=404, detail="Dependency not found")

    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()

    # Done tickets are frozen — re-open before changing their dependency graph.
    if item and item.status == WorkItemStatus.DONE.value:
        raise HTTPException(
            status_code=403,
            detail="This ticket is marked done. Re-open it before removing dependencies.",
        )

    # Log activity
    activity = ActivityLog(
        project_id=item.project_id if item else None,
        user_id=current_user.id,
        action="updated",
        entity_type="work_item",
        entity_id=item_id,
        title=f"Removed dependency from {item.key if item else item_id}",
    )
    db.add(activity)

    db.delete(dependency)
    db.commit()
    return {"status": "deleted", "id": dep_id}


# ============== DEBUG ENDPOINTS ==============


@router.get("/projects/{project_id}/hours-debug")
def debug_hours_calculation(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """
    Debug endpoint to diagnose hours calculation issues.
    Shows detailed breakdown of all time entries and their attribution.
    """
    from datetime import timedelta

    from models.developer import Developer
    from models.time_entry import TimeEntry

    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all work items
    items = db.query(WorkItem).filter(WorkItem.project_id == project_id).all()
    work_item_ids = [item.id for item in items]

    # Get all time entries
    all_time_entries = (
        db.query(TimeEntry).filter(TimeEntry.work_item_id.in_(work_item_ids)).all()
        if work_item_ids
        else []
    )

    # Get all developers
    all_developers = db.query(Developer).all()
    dev_map = {d.id: d for d in all_developers}

    # Build work item map
    work_item_map = {item.id: item for item in items}

    # Calculate week boundaries
    today = datetime.utcnow()
    days_since_sunday = (today.weekday() + 1) % 7
    week_start = today - timedelta(days=days_since_sunday)
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    # Detailed time entries breakdown
    time_entry_details = []
    for te in all_time_entries:
        wi = work_item_map.get(te.work_item_id)
        logger = dev_map.get(te.developer_id) if te.developer_id else None
        assignee = dev_map.get(wi.assignee_id) if wi and wi.assignee_id else None

        time_entry_details.append(
            {
                "time_entry_id": te.id,
                "work_item_id": te.work_item_id,
                "work_item_key": wi.key if wi else "Unknown",
                "work_item_title": wi.title if wi else "Unknown",
                "work_item_status": wi.status if wi else "Unknown",
                "logged_hours_on_ticket": wi.logged_hours if wi else 0,
                "logger_developer_id": te.developer_id,
                "logger_name": logger.name if logger else "Unknown",
                "logger_email": logger.email if logger else "Unknown",
                "ticket_assignee_id": wi.assignee_id if wi else None,
                "ticket_assignee_name": assignee.name if assignee else "Unassigned",
                "hours_logged": te.hours,
                "logged_at": te.logged_at.isoformat() if te.logged_at else None,
                "is_this_week": te.logged_at and week_start <= te.logged_at <= week_end,
                "description": te.description,
            }
        )

    # Developer attribution summary
    developer_summary = {}
    for dev in all_developers:
        # Time entries where this dev is the logger
        dev_entries = [te for te in all_time_entries if te.developer_id == dev.id]
        total_logged = sum(te.hours for te in dev_entries)
        this_week_logged = sum(
            te.hours
            for te in dev_entries
            if te.logged_at and week_start <= te.logged_at <= week_end
        )

        # Tickets assigned to this dev
        assigned_items = [wi for wi in items if wi.assignee_id == dev.id]
        allocated = sum(wi.estimated_hours or 0 for wi in assigned_items)

        # Hours logged by OTHERS on this dev's tickets
        others_on_my_tickets = []
        for wi in assigned_items:
            entries_on_my_ticket = [
                te
                for te in all_time_entries
                if te.work_item_id == wi.id and te.developer_id != dev.id
            ]
            for te in entries_on_my_ticket:
                logger = dev_map.get(te.developer_id)
                others_on_my_tickets.append(
                    {
                        "ticket_key": wi.key,
                        "ticket_title": wi.title,
                        "logged_by": logger.name if logger else "Unknown",
                        "hours": te.hours,
                    }
                )

        # Hours this dev logged on others' tickets
        my_entries_on_others_tickets = []
        for te in dev_entries:
            wi = work_item_map.get(te.work_item_id)
            if wi and wi.assignee_id != dev.id:
                assignee = dev_map.get(wi.assignee_id)
                my_entries_on_others_tickets.append(
                    {
                        "ticket_key": wi.key,
                        "ticket_title": wi.title,
                        "ticket_assignee": assignee.name if assignee else "Unassigned",
                        "hours": te.hours,
                    }
                )

        developer_summary[dev.id] = {
            "developer_id": dev.id,
            "name": dev.name,
            "email": dev.email,
            "total_logged_hours": total_logged,
            "this_week_logged_hours": this_week_logged,
            "allocated_hours": allocated,
            "assigned_tickets_count": len(assigned_items),
            "assigned_tickets": [
                {
                    "key": wi.key,
                    "title": wi.title,
                    "estimated": wi.estimated_hours,
                    "logged": wi.logged_hours,
                }
                for wi in assigned_items
            ],
            "others_logged_on_my_tickets": others_on_my_tickets,
            "i_logged_on_others_tickets": my_entries_on_others_tickets,
            "my_time_entries": [
                {
                    "ticket": work_item_map.get(te.work_item_id).key
                    if work_item_map.get(te.work_item_id)
                    else "Unknown",
                    "hours": te.hours,
                    "when": te.logged_at.isoformat() if te.logged_at else None,
                }
                for te in dev_entries
            ],
        }

    # Data consistency checks
    consistency_issues = []
    for wi in items:
        entries_for_item = [te for te in all_time_entries if te.work_item_id == wi.id]
        sum_from_entries = sum(te.hours for te in entries_for_item)
        stored_logged = wi.logged_hours or 0

        if stored_logged != sum_from_entries:
            consistency_issues.append(
                {
                    "ticket_key": wi.key,
                    "ticket_title": wi.title,
                    "stored_logged_hours": stored_logged,
                    "sum_from_time_entries": sum_from_entries,
                    "difference": stored_logged - sum_from_entries,
                    "time_entries_count": len(entries_for_item),
                }
            )

    return {
        "project_id": project_id,
        "project_name": project.name,
        "week_range": {"start": week_start.isoformat(), "end": week_end.isoformat()},
        "total_work_items": len(items),
        "total_time_entries": len(all_time_entries),
        "time_entry_details": time_entry_details,
        "developer_summary": developer_summary,
        "consistency_issues": consistency_issues,
        "data_summary": {
            "total_hours_from_entries": sum(te.hours for te in all_time_entries),
            "total_hours_from_work_items": sum(wi.logged_hours or 0 for wi in items),
            "developers_with_entries": list(
                set(te.developer_id for te in all_time_entries if te.developer_id)
            ),
        },
    }


@router.post("/projects/{project_id}/repair-hours")
def repair_hours_calculation(
    project_id: int,
    dry_run: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Repair endpoint to fix hours calculation inconsistencies.
    Syncs work_item.logged_hours with sum of time_entries.

    Parameters:
    - dry_run: If True, only shows what would be changed without making changes

    Requires admin access.
    """
    from models.time_entry import TimeEntry

    # Check if user is admin
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")

    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all work items
    items = db.query(WorkItem).filter(WorkItem.project_id == project_id).all()
    work_item_ids = [item.id for item in items]

    # Get all time entries
    all_time_entries = (
        db.query(TimeEntry).filter(TimeEntry.work_item_id.in_(work_item_ids)).all()
        if work_item_ids
        else []
    )

    # Group time entries by work item
    entries_by_work_item = {}
    for te in all_time_entries:
        if te.work_item_id not in entries_by_work_item:
            entries_by_work_item[te.work_item_id] = []
        entries_by_work_item[te.work_item_id].append(te)

    repairs = []
    for wi in items:
        entries = entries_by_work_item.get(wi.id, [])
        sum_from_entries = sum(te.hours for te in entries)
        stored_logged = wi.logged_hours or 0

        if stored_logged != sum_from_entries:
            repairs.append(
                {
                    "ticket_id": wi.id,
                    "ticket_key": wi.key,
                    "ticket_title": wi.title,
                    "old_logged_hours": stored_logged,
                    "new_logged_hours": sum_from_entries,
                    "difference": sum_from_entries - stored_logged,
                    "time_entries_count": len(entries),
                    "would_update": not dry_run,
                }
            )

            if not dry_run:
                # Apply the fix
                wi.logged_hours = sum_from_entries
                # Recalculate remaining hours
                wi.remaining_hours = max(0, (wi.estimated_hours or 0) - sum_from_entries)

    if not dry_run and repairs:
        db.commit()

    return {
        "project_id": project_id,
        "project_name": project.name,
        "dry_run": dry_run,
        "repairs_found": len(repairs),
        "repairs_applied": len([r for r in repairs if r["would_update"]]) if not dry_run else 0,
        "repairs": repairs,
        "message": f"Found {len(repairs)} inconsistencies. "
        + ("No changes made (dry_run=True)." if dry_run else f"Applied {len(repairs)} fixes."),
    }


# ============== MY TASKS ==============
