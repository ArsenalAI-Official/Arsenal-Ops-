"""
Personal Tasks Router - User-specific tasks that can be converted to project tickets
"""

import sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

sys.path.append("..")
from database import get_db
from models.personal_task import PersonalTask
from models.project import Project
from models.user import User
from models.work_item import WorkItem, WorkItemStatus
from routers.auth import get_current_user, require_capability
from routers.workitems import get_next_item_number

router = APIRouter(prefix="/api/personal-tasks", tags=["Personal Tasks"])


# Request/Response models
class CreatePersonalTaskRequest(BaseModel):
    title: str
    description: str | None = ""
    priority: str | None = "medium"
    estimated_hours: int | None = 0
    due_date: str | None = None
    tags: list[str] | None = []


class UpdatePersonalTaskRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    estimated_hours: int | None = None
    due_date: str | None = None
    tags: list[str] | None = None


class ConvertToTicketRequest(BaseModel):
    project_id: int
    type: str | None = "task"
    estimated_hours: int | None = None
    assignee_developer_id: int | None = None  # Optional: who to assign the ticket to


class PersonalTaskResponse(BaseModel):
    """OpenAPI/codegen response shape for a single personal task.

    Mirrors PersonalTask.to_dict() exactly. Documentation only — the routes
    keep returning their existing dicts unchanged at runtime (this is wired via
    `responses=`, not `response_model=`, so there is no runtime re-serialization).
    Nullability is taken from the to_dict serialization, not the DB columns:
    `created_at`/`updated_at` are guarded with `... if ... else None`.
    """

    id: int
    user_id: int
    title: str
    description: str | None = None
    status: str
    priority: str
    project_id: int | None = None
    work_item_id: int | None = None
    estimated_hours: int
    due_date: str | None = None
    tags: list[str]
    is_converted: bool
    converted_at: str | None = None
    # Always present on a persisted row (server-default timestamps); the
    # to_dict() `else None` guards are defensive only. Typed non-null so the
    # generated FE type doesn't force null-guards on never-null fields.
    created_at: str
    updated_at: str


@router.get("/", responses={200: {"model": list[PersonalTaskResponse]}})
def get_personal_tasks(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all personal tasks for the current user"""
    query = db.query(PersonalTask).filter(PersonalTask.user_id == current_user.id)

    if status:
        query = query.filter(PersonalTask.status == status)

    tasks = query.order_by(PersonalTask.created_at.desc()).all()
    return [task.to_dict() for task in tasks]


@router.post("/")
def create_personal_task(
    request: CreatePersonalTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new personal task"""
    task = PersonalTask(
        user_id=current_user.id,
        title=request.title,
        description=request.description,
        priority=request.priority,
        estimated_hours=request.estimated_hours or 0,
        due_date=datetime.fromisoformat(request.due_date) if request.due_date else None,
        tags=request.tags or [],
        status="todo",
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return task.to_dict()


@router.get("/{task_id}", responses={200: {"model": PersonalTaskResponse}})
def get_personal_task(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get a specific personal task"""
    task = (
        db.query(PersonalTask)
        .filter(PersonalTask.id == task_id, PersonalTask.user_id == current_user.id)
        .first()
    )

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return task.to_dict()


@router.put("/{task_id}")
def update_personal_task(
    task_id: int,
    request: UpdatePersonalTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a personal task"""
    task = (
        db.query(PersonalTask)
        .filter(PersonalTask.id == task_id, PersonalTask.user_id == current_user.id)
        .first()
    )

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.is_converted:
        raise HTTPException(status_code=400, detail="Cannot update a converted task")

    # Update fields
    if request.title is not None:
        task.title = request.title
    if request.description is not None:
        task.description = request.description
    if request.status is not None:
        task.status = request.status
    if request.priority is not None:
        task.priority = request.priority
    if request.estimated_hours is not None:
        task.estimated_hours = request.estimated_hours
    if request.due_date is not None:
        task.due_date = datetime.fromisoformat(request.due_date) if request.due_date else None
    if request.tags is not None:
        task.tags = request.tags

    db.commit()
    db.refresh(task)

    return task.to_dict()


@router.delete("/{task_id}")
def delete_personal_task(
    task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a personal task"""
    task = (
        db.query(PersonalTask)
        .filter(PersonalTask.id == task_id, PersonalTask.user_id == current_user.id)
        .first()
    )

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    db.delete(task)
    db.commit()

    return {"status": "deleted", "id": task_id}


@router.post("/{task_id}/convert-to-ticket")
def convert_to_ticket(
    task_id: int,
    request: ConvertToTicketRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("project.assign_personal_task")),
):
    """Convert a personal task to a project ticket (requires `project.assign_personal_task`)."""
    from models.developer import Developer
    from services.email_service import email_service

    # Get the personal task
    task = (
        db.query(PersonalTask)
        .filter(PersonalTask.id == task_id, PersonalTask.user_id == current_user.id)
        .first()
    )

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.is_converted:
        raise HTTPException(status_code=400, detail="Task already converted")

    # Verify project exists
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Resolve the current user's developer row once. Used as:
    #   - `reporter_id` on the work item → drives the "Created By" field
    #     on the ticket side panel (parallels routers/workitems.create_work_item,
    #     which uses `_creator_dev_id` for the same purpose).
    #   - the fallback assignee when the request doesn't specify one.
    creator_dev = db.query(Developer).filter(Developer.email == current_user.email).first()

    # Determine assignee: use explicitly chosen developer or fall back to creator.
    if request.assignee_developer_id:
        assignee = db.query(Developer).filter(Developer.id == request.assignee_developer_id).first()
    else:
        assignee = creator_dev

    # Generate key BEFORE inserting (key is NOT NULL). Use the shared helper
    # so the Postgres-vs-SQLite split lives in one place.
    key_prefix = project.key_prefix or "TASK"

    # Acquire the same advisory lock as create_work_item so concurrent
    # converters don't race on key numbering. No-op on SQLite.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        from sqlalchemy import text

        lock_id = abs(hash(key_prefix)) % 2_147_483_647
        db.execute(text("SELECT pg_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})

    next_number = get_next_item_number(db, key_prefix)
    generated_key = f"{key_prefix}-{next_number}"

    # Create work item with key already set.
    # `reporter_id` stamps the creator so the side panel renders "Created By"
    # — without it, the field stays blank on tickets converted from personal
    # tasks. Falls back to None when the current user has no Developer row
    # (rare; admin-only accounts) — same forgiving behaviour as _creator_dev_id
    # in routers/workitems.py.
    work_item = WorkItem(
        project_id=request.project_id,
        type=request.type or "task",
        key=generated_key,
        title=task.title,
        description=task.description or "",
        status=WorkItemStatus.TODO.value,
        priority=task.priority or "medium",
        estimated_hours=request.estimated_hours or task.estimated_hours or 0,
        remaining_hours=request.estimated_hours or task.estimated_hours or 0,
        assignee_id=assignee.id if assignee else None,
        reporter_id=creator_dev.id if creator_dev else None,
        tags=task.tags or [],
    )

    db.add(work_item)
    db.flush()  # Get the work_item.id

    # Update personal task
    task.is_converted = True
    task.converted_at = datetime.utcnow()
    task.project_id = request.project_id
    task.work_item_id = work_item.id

    db.commit()
    db.refresh(work_item)
    db.refresh(task)

    # Send assignment email notification. Skip on self-assignment —
    # converting your own personal task to a ticket assigned to yourself
    # doesn't need an "X assigned you Y" email. Matches the same guard used
    # by routers/workitems.py:create_work_item / update_work_item.
    if assignee and assignee.email and assignee.email != current_user.email:
        try:
            assigner_name = creator_dev.name if creator_dev else current_user.name
            email_service.send_task_assignment_notification(
                to_email=assignee.email,
                to_name=assignee.name,
                assigner_name=assigner_name,
                work_item_key=work_item.key,
                work_item_title=work_item.title,
                work_item_description=work_item.description or "",
                project_id=work_item.project_id,
                work_item_id=work_item.id,
                priority=work_item.priority,
            )
        except Exception as e:
            print(f"[EMAIL ERROR] Failed to send assignment notification: {e}")

    return {
        "status": "converted",
        "personal_task": task.to_dict(),
        "work_item": {
            "id": work_item.id,
            "key": work_item.key,
            "title": work_item.title,
            "project_id": work_item.project_id,
            "status": work_item.status,
            "assignee_name": assignee.name if assignee else None,
        },
    }
