"""Project model - Core entity for PM lifecycle"""

import enum
import sys
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

sys.path.append("..")
from database import Base
from models.developer import project_developers


class ProjectStatus(str, enum.Enum):  # noqa: UP042
    IDEATION = "ideation"
    PLANNING = "planning"
    DEVELOPMENT = "development"
    TESTING = "testing"
    LAUNCHED = "launched"
    ARCHIVED = "archived"


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    key_prefix = Column(String(10), default="PROJ")  # Short key for work items (e.g., PROJ-123)
    description = Column(Text, nullable=False)
    vision = Column(Text)
    target_market = Column(String(255))
    status = Column(String(50), default=ProjectStatus.IDEATION.value)

    # AI-generated fields
    market_size = Column(String(100))
    timeline_summary = Column(Text)
    risk_assessment = Column(Text)

    # GitHub integration
    github_repo_url = Column(String(500))  # e.g., https://github.com/org/repo (primary/legacy)
    github_repo_urls = Column(JSON, default=lambda: [])  # Multiple GitHub repo URLs
    github_repo_name = Column(String(100))  # e.g., "org/repo"
    github_token = Column(String(100))  # Project-specific GitHub token for invitations

    # Optional admin-managed category. ON DELETE SET NULL so removing a
    # category quietly unassigns its projects rather than blocking or cascading.
    category_id = Column(
        Integer,
        ForeignKey("project_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    end_date = Column(DateTime, nullable=True)  # Project end date
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    milestones = relationship("Milestone", back_populates="project", cascade="all, delete-orphan")
    personas = relationship("Persona", back_populates="project", cascade="all, delete-orphan")
    user_stories = relationship("UserStory", back_populates="project", cascade="all, delete-orphan")
    market_insights = relationship(
        "MarketInsight", back_populates="project", cascade="all, delete-orphan"
    )
    developers = relationship("Developer", secondary=project_developers, back_populates="projects")
    work_items = relationship("WorkItem", back_populates="project", cascade="all, delete-orphan")
    sprints = relationship("Sprint", back_populates="project", cascade="all, delete-orphan")
    architectures = relationship(
        "Architecture", back_populates="project", cascade="all, delete-orphan"
    )
    prd_analyses = relationship(
        "PRDAnalysis", back_populates="project", cascade="all, delete-orphan"
    )
    roadmap_template = relationship(
        "RoadmapTemplate",
        back_populates="project",
        cascade="all, delete-orphan",
        uselist=False,
    )
    goals = relationship("ProjectGoal", back_populates="project", cascade="all, delete-orphan")
    project_milestones = relationship(
        "ProjectMilestone", back_populates="project", cascade="all, delete-orphan"
    )
    activity_logs = relationship(
        "ActivityLog", back_populates="project", cascade="all, delete-orphan"
    )
    category = relationship("ProjectCategory", back_populates="projects", lazy="joined")

    # Indexes for common queries
    __table_args__ = (
        Index("idx_project_status", "status"),
        Index("idx_project_created", "created_at"),
    )
