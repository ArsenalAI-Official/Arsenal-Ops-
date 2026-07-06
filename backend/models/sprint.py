"""Sprint model - Agile sprint management"""

import enum
import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project
    from models.work_item import WorkItem


class SprintStatus(str, enum.Enum):  # noqa: UP042
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Sprint(Base):
    __tablename__ = "sprints"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )

    # Sprint details
    name: Mapped[str] = mapped_column(String(100))
    goal: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default=SprintStatus.PLANNING.value, index=True)

    # Dates
    start_date: Mapped[datetime | None] = mapped_column(DateTime)
    end_date: Mapped[datetime | None] = mapped_column(DateTime)

    # Capacity planning
    capacity_hours: Mapped[int | None] = mapped_column()  # Total team capacity
    velocity: Mapped[int | None] = mapped_column()  # Points completed in previous sprints

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="sprints")
    # NO delete cascade: deleting a sprint must NOT delete its work items.
    # They are reassigned to the backlog (sprint_id → NULL) instead — see
    # ``delete_sprint`` in routers/workitems.py and the DB-level
    # ``ondelete="SET NULL"`` on WorkItem.sprint_id. The previous
    # ``cascade="all, delete-orphan"`` silently deleted every ticket in the
    # sprint, contradicting the UI ("tickets will be moved to the backlog").
    work_items: Mapped[list["WorkItem"]] = relationship("WorkItem", back_populates="sprint")

    # Indexes for common queries
    __table_args__ = (
        Index("idx_sprint_project_status", "project_id", "status"),
        Index("idx_sprint_dates", "start_date", "end_date"),
    )
