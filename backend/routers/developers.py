"""
Developers Router - CRUD operations for developers
"""

import sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

sys.path.append("..")
from database import get_db
from models.developer import Developer
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/developers", tags=["Developers"])


class DeveloperCreate(BaseModel):
    name: str
    email: str
    github_username: str | None = None
    avatar_url: str | None = None


class DeveloperUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    github_username: str | None = None
    avatar_url: str | None = None


class DeveloperResponse(BaseModel):
    id: int
    name: str
    email: str
    github_username: str | None
    avatar_url: str | None
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/", response_model=DeveloperResponse)
def create_developer(
    developer: DeveloperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new developer (requires auth)"""
    # Check if email already exists
    existing = db.query(Developer).filter(Developer.email == developer.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Developer with this email already exists")

    new_developer = Developer(
        name=developer.name,
        email=developer.email,
        github_username=developer.github_username,
        avatar_url=developer.avatar_url,
    )
    db.add(new_developer)
    db.commit()
    db.refresh(new_developer)
    return new_developer


@router.get("/", response_model=list[DeveloperResponse])
def list_developers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all developers (requires auth)"""
    developers = db.query(Developer).all()
    return developers


@router.get("/me/capacity")
def get_my_capacity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Weekly capacity for the currently-logged-in developer (cross-project,
    Saturday → Friday UTC). Same shape as a single row from
    /api/admin/developers/capacity. Returns 404 if the user has no Developer
    record yet (e.g., admin-only user)."""
    from services.capacity_service import compute_capacity_breakdown, week_boundaries

    dev = db.query(Developer).filter(Developer.email == current_user.email).first()
    if not dev:
        raise HTTPException(status_code=404, detail="No developer profile for this user")

    week_start, week_end = week_boundaries()
    breakdown = compute_capacity_breakdown(
        dev.assigned_work_items or [],
        week_start,
        db=db,
        developer_id=dev.id,
    )
    return {
        "developer_id": dev.id,
        "developer_name": dev.name,
        "developer_email": dev.email,
        "avatar_url": dev.avatar_url,
        "project_count": len(dev.projects) if dev.projects else 0,
        "specialization": getattr(dev, "specialization", None),
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        **breakdown,
    }


@router.get("/{developer_id}", response_model=DeveloperResponse)
def get_developer(
    developer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get a developer by ID (requires auth)"""
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    return developer


@router.put("/{developer_id}", response_model=DeveloperResponse)
def update_developer(
    developer_id: int,
    update: DeveloperUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a developer (requires auth)"""
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")

    # Check email uniqueness if updating email
    if update.email and update.email != developer.email:
        existing = db.query(Developer).filter(Developer.email == update.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Developer with this email already exists")
        developer.email = update.email

    if update.name is not None:
        developer.name = update.name
    if update.github_username is not None:
        developer.github_username = update.github_username
    if update.avatar_url is not None:
        developer.avatar_url = update.avatar_url

    developer.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(developer)
    return developer


@router.delete("/{developer_id}")
def delete_developer(
    developer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a developer (requires auth)"""
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")

    db.delete(developer)
    db.commit()
    return {"status": "deleted", "id": developer_id}
