"""Milestone model - Timeline tracking"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project


class Milestone(Base):
    __tablename__ = "milestones"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    phase: Mapped[str | None] = mapped_column(String(100))  # Discovery, Build, Launch, Scale

    start_date: Mapped[datetime | None] = mapped_column(DateTime)
    end_date: Mapped[datetime | None] = mapped_column(DateTime)

    status: Mapped[str] = mapped_column(
        String(50), default="planned", nullable=True
    )  # planned, in_progress, completed, delayed
    progress_percent: Mapped[int] = mapped_column(default=0, nullable=True)

    deliverables: Mapped[str | None] = mapped_column(Text)  # JSON-serialized list

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="milestones")
