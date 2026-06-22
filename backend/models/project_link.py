"""
ProjectLink Model - Represents links/URLs for projects
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

if TYPE_CHECKING:
    from models.project import Project


class ProjectLink(Base):
    __tablename__ = "project_links"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String)
    url: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])

    def __repr__(self):
        return f"<ProjectLink {self.name} (project_id={self.project_id})>"
