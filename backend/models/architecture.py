"""
Architecture Model - Stores generated architecture designs for projects
"""

import sys
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project


class Architecture(Base):
    """Architecture design for a project"""

    __tablename__ = "architectures"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )

    # Architecture details
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    architecture_type: Mapped[str] = mapped_column(
        String(50), default="recommended", nullable=True
    )  # recommended, alternative

    # Mermaid diagram
    mermaid_code: Mapped[str] = mapped_column(Text)

    # Analysis results
    cost_analysis: Mapped[Any | None] = mapped_column(JSON)  # Stores cost breakdown
    tools_recommended: Mapped[Any | None] = mapped_column(JSON)  # Stores recommended tools
    pros: Mapped[Any | None] = mapped_column(JSON)  # List of pros
    cons: Mapped[Any | None] = mapped_column(JSON)  # List of cons

    # Metadata
    estimated_cost: Mapped[str | None] = mapped_column(String(100))  # e.g., "$200-500/month"
    complexity: Mapped[str | None] = mapped_column(String(20))  # low, medium, high
    time_to_implement: Mapped[str | None] = mapped_column(String(50))  # e.g., "8-12 weeks"

    # Selection status
    is_selected: Mapped[bool] = mapped_column(default=False, nullable=True)
    selected_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="architectures")

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "name": self.name,
            "description": self.description,
            "architecture_type": self.architecture_type,
            "mermaid_code": self.mermaid_code,
            "cost_analysis": self.cost_analysis,
            "tools_recommended": self.tools_recommended or {},
            "pros": self.pros or [],
            "cons": self.cons or [],
            "estimated_cost": self.estimated_cost,
            "complexity": self.complexity,
            "time_to_implement": self.time_to_implement,
            "is_selected": self.is_selected,
            "selected_at": self.selected_at.isoformat() if self.selected_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PRDAnalysis(Base):
    """Stores PRD analysis results for a project"""

    __tablename__ = "prd_analyses"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )

    # Original PRD content
    filename: Mapped[str | None] = mapped_column(String(255))
    prd_content: Mapped[str | None] = mapped_column(Text)  # Extracted text from PRD
    additional_context: Mapped[str | None] = mapped_column(Text)  # User-provided context

    # Analysis results
    summary: Mapped[str | None] = mapped_column(Text)
    key_features: Mapped[Any | None] = mapped_column(JSON)  # List of features
    technical_requirements: Mapped[Any | None] = mapped_column(JSON)  # List of requirements
    cost_analysis: Mapped[Any | None] = mapped_column(JSON)  # Cost breakdown object
    recommended_tools: Mapped[Any | None] = mapped_column(JSON)  # Tools by category
    risks: Mapped[Any | None] = mapped_column(JSON)  # List of risk objects
    timeline: Mapped[Any | None] = mapped_column(JSON)  # List of phase objects

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="prd_analyses")

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "filename": self.filename,
            "summary": self.summary,
            "key_features": self.key_features or [],
            "technical_requirements": self.technical_requirements or [],
            "cost_analysis": self.cost_analysis,
            "recommended_tools": self.recommended_tools or {},
            "risks": self.risks or [],
            "timeline": self.timeline or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class RoadmapTemplate(Base):
    """Latest AI-generated roadmap template for a project.

    Only one row per project — the POST /generate-roadmap-template endpoint
    upserts. The xlsx is not stored; we re-render from ``suggestions`` on
    download so the renderer stays the single source of truth.
    """

    __tablename__ = "roadmap_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True,
        index=True,
    )

    # Planning window the AI was asked to fit the roadmap into.
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    sprint_weeks: Mapped[int] = mapped_column(default=2)

    # Structured AI output (milestones, epics, tasks) — same shape the
    # renderer in services/roadmap_generator.py expects.
    suggestions: Mapped[dict[str, Any]] = mapped_column(JSON)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    project: Mapped["Project"] = relationship("Project", back_populates="roadmap_template")

    def to_dict(self):
        suggestions = self.suggestions or {}
        return {
            "id": self.id,
            "project_id": self.project_id,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "sprint_weeks": self.sprint_weeks,
            "milestone_count": len(suggestions.get("milestones") or []),
            "epic_count": len(suggestions.get("epics") or []),
            "task_count": len(suggestions.get("tasks") or []),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
