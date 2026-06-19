"""Persona model - Buyer personas for GTM"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project


class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))

    name: Mapped[str] = mapped_column(String(100))  # e.g., "Enterprise Emma"
    role: Mapped[str | None] = mapped_column(String(100))  # e.g., "VP of Product"

    # Demographics
    age_range: Mapped[str | None] = mapped_column(String(50))
    company_size: Mapped[str | None] = mapped_column(String(100))
    industry: Mapped[str | None] = mapped_column(String(100))

    # Psychographics
    goals: Mapped[Any | None] = mapped_column(JSON)  # List of goals
    pain_points: Mapped[Any | None] = mapped_column(JSON)  # List of pain points
    motivations: Mapped[Any | None] = mapped_column(JSON)  # List of motivations

    # Behavior
    decision_criteria: Mapped[Any | None] = mapped_column(JSON)
    preferred_channels: Mapped[Any | None] = mapped_column(JSON)

    # Summary
    bio: Mapped[str | None] = mapped_column(Text)
    quote: Mapped[str | None] = mapped_column(Text)  # Representative quote

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="personas")
