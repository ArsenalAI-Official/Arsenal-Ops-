"""UserStory model - Requirements & Development"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project


class UserStory(Base):
    __tablename__ = "user_stories"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    # Core story format
    title: Mapped[str] = mapped_column(String(255))
    as_a: Mapped[str | None] = mapped_column(String(100))  # As a [user type]
    i_want: Mapped[str | None] = mapped_column(Text)  # I want [feature]
    so_that: Mapped[str | None] = mapped_column(Text)  # So that [benefit]

    # Acceptance criteria
    acceptance_criteria: Mapped[Any | None] = mapped_column(JSON)  # List of criteria

    # Estimation
    story_points: Mapped[int] = mapped_column(default=1, nullable=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String(50), default="backlog", nullable=True
    )  # backlog, ready, in_sprint, done

    # Jira fields
    jira_key: Mapped[str | None] = mapped_column(String(50))
    epic: Mapped[str | None] = mapped_column(String(100))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="user_stories")
