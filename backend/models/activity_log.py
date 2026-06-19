"""ActivityLog model - Track project activity for feed"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project
    from models.user import User


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    action: Mapped[str] = mapped_column(
        String(50)
    )  # created, updated, deleted, completed, assigned, commented, logged_hours
    entity_type: Mapped[str] = mapped_column(
        String(50)
    )  # work_item, sprint, goal, milestone, project
    entity_id: Mapped[int | None] = mapped_column(index=True)

    # Stored as TEXT (unbounded) — activity titles include work item titles
    # which can be long-form acceptance criteria. The original VARCHAR(255)
    # broke status changes for tickets whose title alone exceeded that limit
    # (PROJ-345 was the canonical example). See migrate_widen_activity_log_title.py.
    title: Mapped[str | None] = mapped_column(Text)  # Human-readable action title
    details: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=True
    )  # Additional context (old_value, new_value, etc.)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="activity_logs")
    user: Mapped["User | None"] = relationship("User")

    __table_args__ = (
        Index("idx_activity_log_project_date", "project_id", "created_at"),
        Index("idx_activity_log_entity", "entity_type", "entity_id"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "title": self.title,
            "details": self.details or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "user_name": self.user.name if self.user else "System",
            "user_email": self.user.email if self.user else None,
        }
