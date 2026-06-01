"""
Architecture Model - Stores generated architecture designs for projects
"""

import sys
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

sys.path.append("..")
from database import Base


class Architecture(Base):
    """Architecture design for a project"""

    __tablename__ = "architectures"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Architecture details
    name = Column(String(255), nullable=False)
    description = Column(Text)
    architecture_type = Column(String(50), default="recommended")  # recommended, alternative

    # Mermaid diagram
    mermaid_code = Column(Text, nullable=False)

    # Analysis results
    cost_analysis = Column(JSON)  # Stores cost breakdown
    tools_recommended = Column(JSON)  # Stores recommended tools
    pros = Column(JSON)  # List of pros
    cons = Column(JSON)  # List of cons

    # Metadata
    estimated_cost = Column(String(100))  # e.g., "$200-500/month"
    complexity = Column(String(20))  # low, medium, high
    time_to_implement = Column(String(50))  # e.g., "8-12 weeks"

    # Selection status
    is_selected = Column(Boolean, default=False)
    selected_at = Column(DateTime)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="architectures")

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

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Original PRD content
    filename = Column(String(255))
    prd_content = Column(Text)  # Extracted text from PRD
    additional_context = Column(Text)  # User-provided context

    # Analysis results
    summary = Column(Text)
    key_features = Column(JSON)  # List of features
    technical_requirements = Column(JSON)  # List of requirements
    cost_analysis = Column(JSON)  # Cost breakdown object
    recommended_tools = Column(JSON)  # Tools by category
    risks = Column(JSON)  # List of risk objects
    timeline = Column(JSON)  # List of phase objects

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="prd_analyses")

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

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Planning window the AI was asked to fit the roadmap into.
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    sprint_weeks = Column(Integer, nullable=False, default=2)

    # Structured AI output (milestones, epics, tasks) — same shape the
    # renderer in services/roadmap_generator.py expects.
    suggestions = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="roadmap_template")

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
