"""PersonalTask model - User-specific tasks that can be converted to project tickets"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project
    from models.user import User
    from models.work_item import WorkItem


class PersonalTask(Base):
    __tablename__ = "personal_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    # Task details
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(50), default="todo", nullable=True
    )  # todo, in_progress, done
    priority: Mapped[str] = mapped_column(
        String(50), default="medium", nullable=True
    )  # low, medium, high, critical

    # Optional project association (when converted to project ticket)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    work_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("work_items.id", ondelete="SET NULL")
    )

    # Time tracking
    estimated_hours: Mapped[int] = mapped_column(default=0, nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime)

    # Metadata
    tags: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=True)
    is_converted: Mapped[bool] = mapped_column(default=False, nullable=True)
    converted_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="personal_tasks")
    project: Mapped["Project | None"] = relationship("Project")
    work_item: Mapped["WorkItem | None"] = relationship("WorkItem")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "project_id": self.project_id,
            "work_item_id": self.work_item_id,
            "estimated_hours": self.estimated_hours,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "tags": self.tags or [],
            "is_converted": self.is_converted,
            "converted_at": self.converted_at.isoformat() if self.converted_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
