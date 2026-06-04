"""ProjectCategory model — admin-managed labels for organizing projects.

One project belongs to at most one category. Deleting a category sets the
``Project.category_id`` of any owning project to NULL (ON DELETE SET NULL),
so categories can be removed without orphaning or cascading into project rows.
"""

import sys
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

sys.path.append("..")
from database import Base


class ProjectCategory(Base):
    __tablename__ = "project_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects = relationship("Project", back_populates="category")

    def to_dict(self, project_count: int | None = None) -> dict:
        """Serialize to API shape.

        ``project_count`` is passed in by the router so we can compute it
        with a single aggregate query rather than triggering the lazy
        ``projects`` relationship load for every category.
        """
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "project_count": project_count if project_count is not None else len(self.projects),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
