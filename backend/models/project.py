"""Project model - Core entity for PM lifecycle"""

import enum
import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base
from models.developer import project_developers

if TYPE_CHECKING:
    from models.activity_log import ActivityLog
    from models.architecture import Architecture, PRDAnalysis, RoadmapTemplate
    from models.developer import Developer
    from models.market_insight import MarketInsight
    from models.milestone import Milestone
    from models.persona import Persona
    from models.project_category import ProjectCategory
    from models.project_goal import ProjectGoal
    from models.project_milestone import ProjectMilestone
    from models.sprint import Sprint
    from models.task import Task
    from models.user_story import UserStory
    from models.work_item import WorkItem


class ProjectStatus(str, enum.Enum):  # noqa: UP042
    IDEATION = "ideation"
    PLANNING = "planning"
    DEVELOPMENT = "development"
    TESTING = "testing"
    LAUNCHED = "launched"
    ARCHIVED = "archived"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    # Short key for work items (e.g., ASSE-123). Unique per project so keys are
    # globally distinct across projects (audit #25). `unique=True` builds the
    # constraint on fresh DBs (tests/local SQLite); existing Postgres DBs get it
    # via the backfill migration in database.py, which dedups first.
    key_prefix: Mapped[str] = mapped_column(String(10), default="PROJ", nullable=True, unique=True)
    description: Mapped[str] = mapped_column(Text)
    vision: Mapped[str | None] = mapped_column(Text)
    target_market: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(
        String(50), default=ProjectStatus.IDEATION.value, nullable=True
    )

    # AI-generated fields
    market_size: Mapped[str | None] = mapped_column(String(100))
    timeline_summary: Mapped[str | None] = mapped_column(Text)
    risk_assessment: Mapped[str | None] = mapped_column(Text)

    # GitHub integration
    github_repo_url: Mapped[str | None] = mapped_column(
        String(500)
    )  # e.g., https://github.com/org/repo (primary/legacy)
    github_repo_urls: Mapped[list[str]] = mapped_column(
        JSON, default=lambda: [], nullable=True
    )  # Multiple GitHub repo URLs
    github_repo_name: Mapped[str | None] = mapped_column(String(100))  # e.g., "org/repo"
    github_token: Mapped[str | None] = mapped_column(
        String(100)
    )  # Project-specific GitHub token for invitations

    # Optional admin-managed category. ON DELETE SET NULL so removing a
    # category quietly unassigns its projects rather than blocking or cascading.
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_categories.id", ondelete="SET NULL"),
        index=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime)  # Project end date
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    # Relationships
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="project", cascade="all, delete-orphan"
    )
    milestones: Mapped[list["Milestone"]] = relationship(
        "Milestone", back_populates="project", cascade="all, delete-orphan"
    )
    personas: Mapped[list["Persona"]] = relationship(
        "Persona", back_populates="project", cascade="all, delete-orphan"
    )
    user_stories: Mapped[list["UserStory"]] = relationship(
        "UserStory", back_populates="project", cascade="all, delete-orphan"
    )
    market_insights: Mapped[list["MarketInsight"]] = relationship(
        "MarketInsight", back_populates="project", cascade="all, delete-orphan"
    )
    developers: Mapped[list["Developer"]] = relationship(
        "Developer", secondary=project_developers, back_populates="projects"
    )
    work_items: Mapped[list["WorkItem"]] = relationship(
        "WorkItem", back_populates="project", cascade="all, delete-orphan"
    )
    sprints: Mapped[list["Sprint"]] = relationship(
        "Sprint", back_populates="project", cascade="all, delete-orphan"
    )
    architectures: Mapped[list["Architecture"]] = relationship(
        "Architecture", back_populates="project", cascade="all, delete-orphan"
    )
    prd_analyses: Mapped[list["PRDAnalysis"]] = relationship(
        "PRDAnalysis", back_populates="project", cascade="all, delete-orphan"
    )
    roadmap_template: Mapped["RoadmapTemplate | None"] = relationship(
        "RoadmapTemplate",
        back_populates="project",
        cascade="all, delete-orphan",
        uselist=False,
    )
    goals: Mapped[list["ProjectGoal"]] = relationship(
        "ProjectGoal", back_populates="project", cascade="all, delete-orphan"
    )
    project_milestones: Mapped[list["ProjectMilestone"]] = relationship(
        "ProjectMilestone", back_populates="project", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list["ActivityLog"]] = relationship(
        "ActivityLog", back_populates="project", cascade="all, delete-orphan"
    )
    category: Mapped["ProjectCategory | None"] = relationship(
        "ProjectCategory", back_populates="projects", lazy="joined"
    )

    # Indexes for common queries
    __table_args__ = (
        Index("idx_project_status", "status"),
        Index("idx_project_created", "created_at"),
    )
