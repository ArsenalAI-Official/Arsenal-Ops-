"""
Personal Tasks Router - User-specific tasks that can be converted to project tickets
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session

import sys
sys.path.append('..')
from database import get_db
from models.personal_task import PersonalTask
from models.project import Project
from models.work_item import WorkItem, WorkItemStatus, WorkItemType
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/personal-tasks", tags=["Personal Tasks"])


# Request/Response models
class CreatePersonalTaskRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: Optional[str] = "medium"
    estimated_hours: Optional[int] = 0
    due_date: Optional[str] = None
    tags: Optional[List[str]] = []


class UpdatePersonalTaskRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    estimated_hours: Optional[int] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None


class ConvertToTicketRequest(BaseModel):
    project_id: int
    type: Optional[str] = "task"
    estimated_hours: Optional[int] = None
    assignee_developer_id: Optional[int] = None  # Optional: who to assign the ticket to


@router.get("/")
def get_personal_tasks(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
        status="todo"
    )
    
    db.add(task)
    db.commit()
    db.refresh(task)
    
    return task.to_dict()


@router.get("/{task_id}")
def get_personal_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific personal task"""
    task = db.query(PersonalTask).filter(
        PersonalTask.id == task_id,
        PersonalTask.user_id == current_user.id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return task.to_dict()


@router.put("/{task_id}")
def update_personal_task(
    task_id: int,
    request: UpdatePersonalTaskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a personal task"""
    task = db.query(PersonalTask).filter(
        PersonalTask.id == task_id,
        PersonalTask.user_id == current_user.id
    ).first()
    
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
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a personal task"""
    task = db.query(PersonalTask).filter(
        PersonalTask.id == task_id,
        PersonalTask.user_id == current_user.id
    ).first()
    
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
    current_user: User = Depends(get_current_user)
):
    """Convert a personal task to a project ticket"""
    from models.developer import Developer
    from services.email_service import email_service
    
    # Get the personal task
    task = db.query(PersonalTask).filter(
        PersonalTask.id == task_id,
        PersonalTask.user_id == current_user.id
    ).first()
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.is_converted:
        raise HTTPException(status_code=400, detail="Task already converted")
    
    # Verify project exists
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Determine assignee: use explicitly chosen developer or fall back to current user
    if request.assignee_developer_id:
        assignee = db.query(Developer).filter(Developer.id == request.assignee_developer_id).first()
    else:
        assignee = db.query(Developer).filter(Developer.email == current_user.email).first()
    
    # Generate key BEFORE inserting (key is NOT NULL)
    from sqlalchemy import text
    key_prefix = project.key_prefix or "TASK"
    result = db.execute(text("""
        SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(key, '^.*-', '') AS INTEGER)), 0) + 1
        FROM work_items WHERE key LIKE :prefix
    """), {"prefix": f"{key_prefix}-%"})
    next_number = result.scalar() or 1
    generated_key = f"{key_prefix}-{next_number}"
    
    # Create work item with key already set
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
    
    # Send assignment email notification
    if assignee and assignee.email:
        try:
            assigner = db.query(Developer).filter(Developer.email == current_user.email).first()
            assigner_name = assigner.name if assigner else current_user.name
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
        }
    }
