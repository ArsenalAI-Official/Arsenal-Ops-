"""Task model - Kanban-style task cards with dependencies"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    # Core fields
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    acceptance_criteria: Mapped[Any | None] = mapped_column(JSON)  # List of criteria

    # Status & Priority
    status: Mapped[str] = mapped_column(
        String(50), default="todo", nullable=True
    )  # todo, in_progress, review, done
    priority: Mapped[str] = mapped_column(
        String(20), default="medium", nullable=True
    )  # low, medium, high, critical

    # Estimation
    story_points: Mapped[int] = mapped_column(default=1, nullable=True)
    estimated_hours: Mapped[int | None] = mapped_column()

    # Assignment
    assignee: Mapped[str | None] = mapped_column(String(100))

    # Dependencies (JSON array of task IDs)
    dependencies: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=True)

    # Jira-style fields
    jira_key: Mapped[str | None] = mapped_column(String(50))
    epic: Mapped[str | None] = mapped_column(String(100))
    sprint: Mapped[str | None] = mapped_column(String(100))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )
    due_date: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")
