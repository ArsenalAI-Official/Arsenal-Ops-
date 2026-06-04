"""Comments router - Handle ticket comments with @mentions"""

import re
import sys
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

sys.path.append("..")
from database import get_db
from models.comment import Comment
from models.developer import Developer
from models.user import User
from models.work_item import WorkItem
from routers.auth import get_current_user
from services.email_service import email_service

router = APIRouter(prefix="/api/comments", tags=["comments"])


class CommentCreate(BaseModel):
    work_item_id: int
    content: str
    comment_type: str = "comment"  # comment, blocker, status_change


class CommentUpdate(BaseModel):
    content: str


class CommentResponse(BaseModel):
    id: int
    work_item_id: int
    author_id: int | None
    author_name: str
    content: str
    mentions: list[int]
    comment_type: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def extract_mentions(content: str, db: Session) -> list[int]:
    """Extract @mentioned user names from content. Format: @John Doe Smith.

    Performance: loads the developer roster ONCE per call (was N+1 — one query
    per mention plus a full table scan as a fallback).
    """
    mentioned_ids: list[int] = []

    matches = list(re.finditer(r"@([^@\s]+(?:\s+[^@\s]+)*)", content))
    if not matches:
        return mentioned_ids

    # Cache the roster once. Keyed by exact name for the primary lookup;
    # the same list is reused for the prefix fallback.
    all_devs = db.query(Developer).all()
    by_name = {d.name: d.id for d in all_devs}

    for match in matches:
        mention_text = match.group(1).strip()

        if mention_text.isdigit():
            mentioned_ids.append(int(mention_text))
            continue

        exact_id = by_name.get(mention_text)
        if exact_id is not None:
            mentioned_ids.append(exact_id)
            continue

        # Prefix fallback — mention may have trailing text glued on
        for d in all_devs:
            if mention_text.startswith(d.name):
                mentioned_ids.append(d.id)
                break

    return mentioned_ids


@router.get("/workitem/{work_item_id}", response_model=list[CommentResponse])
def get_comments(
    work_item_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get all comments for a work item (requires auth)"""
    comments = (
        db.query(Comment)
        .options(selectinload(Comment.author))
        .filter(Comment.work_item_id == work_item_id)
        .order_by(Comment.created_at.desc())
        .all()
    )

    result = []
    for comment in comments:
        author_name = "Unknown"
        if comment.author_id and comment.author:
            author_name = comment.author.name

        result.append(
            CommentResponse(
                id=comment.id,
                work_item_id=comment.work_item_id,
                author_id=comment.author_id,
                author_name=author_name,
                content=comment.content,
                mentions=comment.mentions or [],
                comment_type=comment.comment_type,
                created_at=comment.created_at,
                updated_at=comment.updated_at,
            )
        )

    return result


@router.post("/", response_model=CommentResponse)
def create_comment(
    comment: CommentCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new comment with @mentions (requires auth)"""
    # Verify work item exists
    work_item = db.query(WorkItem).filter(WorkItem.id == comment.work_item_id).first()
    if not work_item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Get author from current user
    author = db.query(Developer).filter(Developer.email == current_user.email).first()
    author_id = author.id if author else None

    # Extract mentions from content
    mentions = extract_mentions(comment.content, db)

    # Create comment
    new_comment = Comment(
        work_item_id=comment.work_item_id,
        author_id=author_id,
        content=comment.content,
        mentions=mentions,
        comment_type=comment.comment_type,
    )

    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    # Get author name
    author_name = author.name if author else "Unknown"

    # Send email notifications to mentioned users (off the request thread)
    is_blocker = comment.comment_type == "blocker"
    if mentions:
        mentioned_users = db.query(Developer).filter(Developer.id.in_(mentions)).all()
        for mentioned_user in mentioned_users:
            if mentioned_user.email:
                background_tasks.add_task(
                    email_service.send_mention_notification,
                    to_email=mentioned_user.email,
                    to_name=mentioned_user.name,
                    author_name=author_name,
                    work_item_key=work_item.key,
                    work_item_title=work_item.title,
                    comment_content=comment.content,
                    project_id=work_item.project_id,
                    work_item_id=work_item.id,
                    is_blocker=is_blocker,
                )

    return CommentResponse(
        id=new_comment.id,
        work_item_id=new_comment.work_item_id,
        author_id=new_comment.author_id,
        author_name=author_name,
        content=new_comment.content,
        mentions=new_comment.mentions or [],
        comment_type=new_comment.comment_type,
        created_at=new_comment.created_at,
        updated_at=new_comment.updated_at,
    )


@router.put("/{comment_id}", response_model=CommentResponse)
def update_comment(
    comment_id: int,
    update: CommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a comment (requires auth)"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment.content = update.content
    comment.mentions = extract_mentions(update.content, db)

    db.commit()
    db.refresh(comment)

    author_name = "Unknown"
    if comment.author_id and comment.author:
        author_name = comment.author.name

    return CommentResponse(
        id=comment.id,
        work_item_id=comment.work_item_id,
        author_id=comment.author_id,
        author_name=author_name,
        content=comment.content,
        mentions=comment.mentions or [],
        comment_type=comment.comment_type,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.delete("/{comment_id}")
def delete_comment(
    comment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a comment (requires auth)"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    db.delete(comment)
    db.commit()

    return {"message": "Comment deleted"}


@router.get("/project/{project_id}/business-review", response_model=list[dict])
def get_business_review_comments(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get all business review comments for a project with work item details"""
    from models.work_item import WorkItem

    # Get all comments marked as business_review in this project
    comments = (
        db.query(Comment)
        .options(selectinload(Comment.author))
        .join(WorkItem, Comment.work_item_id == WorkItem.id)
        .filter(WorkItem.project_id == project_id, Comment.comment_type == "business_review")
        .order_by(Comment.created_at.desc())
        .all()
    )

    # Bulk-load the referenced work items in one query (was one WorkItem SELECT
    # per comment inside the loop below — an N+1).
    work_item_ids = {c.work_item_id for c in comments}
    items_by_id = (
        {w.id: w for w in db.query(WorkItem).filter(WorkItem.id.in_(work_item_ids)).all()}
        if work_item_ids
        else {}
    )

    result = []
    for comment in comments:
        work_item = items_by_id.get(comment.work_item_id)
        author_name = "Unknown"
        if comment.author_id and comment.author:
            author_name = comment.author.name

        result.append(
            {
                "id": comment.id,
                "comment_id": comment.id,
                "work_item_id": comment.work_item_id,
                "work_item_key": work_item.key if work_item else f"ITEM-{comment.work_item_id}",
                "work_item_title": work_item.title if work_item else "Unknown",
                "author_id": comment.author_id,
                "author_name": author_name,
                "content": comment.content,
                "is_resolved": comment.is_resolved if comment.is_resolved is not None else False,
                "created_at": comment.created_at,
                "updated_at": comment.updated_at,
                "mentions": comment.mentions or [],
            }
        )

    return result


@router.patch("/{comment_id}/resolve")
def toggle_comment_resolved(
    comment_id: int,
    is_resolved: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a business review comment as resolved or unresolved"""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    comment.is_resolved = is_resolved
    db.commit()
    db.refresh(comment)

    author_name = "Unknown"
    if comment.author_id and comment.author:
        author_name = comment.author.name

    return CommentResponse(
        id=comment.id,
        work_item_id=comment.work_item_id,
        author_id=comment.author_id,
        author_name=author_name,
        content=comment.content,
        mentions=comment.mentions or [],
        comment_type=comment.comment_type,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )
