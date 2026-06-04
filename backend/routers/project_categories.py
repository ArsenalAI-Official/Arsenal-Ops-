"""Project Categories Router — admin-managed labels for organizing projects.

Each endpoint is gated on `admin.projects` (the same capability the Admin →
Projects tab uses) so a non-admin curl can't reach this surface, matching the
"air-gap" RBAC pattern of the rest of the admin namespace.

The list endpoint computes ``project_count`` via a single GROUP BY query
rather than iterating ``category.projects`` per row, so it stays O(1) round
trips regardless of category count.
"""

import sys

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

sys.path.append("..")
from database import get_db
from models.project import Project
from models.project_category import ProjectCategory
from routers.auth import require_capability

router = APIRouter(prefix="/api/admin/project-categories", tags=["Project Categories"])

# Shared capability gate — anything an admin does to categories is part of
# the broader "manage projects" surface, so we reuse admin.projects rather
# than introducing a new capability key.
_ADMIN_PROJECTS = Depends(require_capability("admin.projects"))


class ProjectCategoryCreate(BaseModel):
    # Trim + length-cap on the API edge so the DB never sees junk.
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class ProjectCategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


def _project_count_map(db: Session) -> dict[int, int]:
    """Return ``{category_id: project_count}`` in one query.

    Categories with zero projects are still serialized with count=0; callers
    should ``.get(cat_id, 0)`` against this map.
    """
    rows = (
        db.query(Project.category_id, func.count(Project.id))
        .filter(Project.category_id.isnot(None))
        .group_by(Project.category_id)
        .all()
    )
    return {row[0]: row[1] for row in rows}


@router.get("/", dependencies=[_ADMIN_PROJECTS])
def list_categories(db: Session = Depends(get_db)) -> list[dict]:
    """List every category, ordered by name. Includes ``project_count``."""
    counts = _project_count_map(db)
    categories = db.query(ProjectCategory).order_by(ProjectCategory.name).all()
    return [c.to_dict(project_count=counts.get(c.id, 0)) for c in categories]


@router.post("/", status_code=status.HTTP_201_CREATED, dependencies=[_ADMIN_PROJECTS])
def create_category(payload: ProjectCategoryCreate, db: Session = Depends(get_db)) -> dict:
    """Create a category. Names are unique (case-sensitive)."""
    name = payload.name.strip()
    if db.query(ProjectCategory).filter(ProjectCategory.name == name).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A category named '{name}' already exists.",
        )
    category = ProjectCategory(
        name=name,
        description=(payload.description.strip() if payload.description else None),
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category.to_dict(project_count=0)


@router.put("/{category_id}", dependencies=[_ADMIN_PROJECTS])
def update_category(
    category_id: int,
    payload: ProjectCategoryUpdate,
    db: Session = Depends(get_db),
) -> dict:
    """Update a category. Name uniqueness checked against the other rows."""
    category = db.query(ProjectCategory).filter(ProjectCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if payload.name is not None:
        new_name = payload.name.strip()
        collision = (
            db.query(ProjectCategory)
            .filter(ProjectCategory.name == new_name, ProjectCategory.id != category_id)
            .first()
        )
        if collision:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A category named '{new_name}' already exists.",
            )
        category.name = new_name

    if payload.description is not None:
        # Empty string treated as "clear the description" so the admin can
        # remove it without supplying null.
        stripped = payload.description.strip()
        category.description = stripped or None

    db.commit()
    db.refresh(category)

    project_count = (
        db.query(func.count(Project.id)).filter(Project.category_id == category_id).scalar() or 0
    )
    return category.to_dict(project_count=project_count)


@router.delete(
    "/{category_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_ADMIN_PROJECTS]
)
def delete_category(category_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a category. Projects pointing at it are auto-unassigned via the
    ``ON DELETE SET NULL`` FK constraint — no application-level cleanup needed.
    """
    category = db.query(ProjectCategory).filter(ProjectCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()
    return None
