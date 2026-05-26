"""WorkItem model - Jira-style work items (stories, tasks, bugs, epics)"""

import enum
import sys
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

sys.path.append("..")
from database import Base


class WorkItemType(str, enum.Enum):  # noqa: UP042
    EPIC = "epic"
    USER_STORY = "user_story"
    TASK = "task"
    BUG = "bug"
    SUBTASK = "subtask"


class WorkItemStatus(str, enum.Enum):  # noqa: UP042
    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"


class WorkItemPriority(str, enum.Enum):  # noqa: UP042
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class WorkItem(Base):
    __tablename__ = "work_items"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sprint_id = Column(Integer, ForeignKey("sprints.id", ondelete="SET NULL"), index=True)

    # Core fields
    key = Column(String(50), unique=True, nullable=False, index=True)  # e.g., "PROJ-123"
    type = Column(
        String(20), default=WorkItemType.TASK.value, nullable=False
    )  # epic, user_story, task, bug
    title = Column(String(255), nullable=False)
    description = Column(Text)

    # Status & Priority
    status = Column(String(50), default=WorkItemStatus.TODO.value, nullable=False, index=True)
    priority = Column(String(20), default=WorkItemPriority.MEDIUM.value, nullable=False)

    # Estimation
    story_points = Column(Integer, default=0)
    estimated_hours = Column(Integer)
    remaining_hours = Column(Integer)
    logged_hours = Column(Integer, default=0)  # Total hours logged by developers

    # Assignment - linked to Developer model
    assignee_id = Column(Integer, ForeignKey("developers.id", ondelete="SET NULL"), index=True)
    reporter_id = Column(Integer, ForeignKey("developers.id", ondelete="SET NULL"))

    # Goal linkage
    goal_id = Column(Integer, ForeignKey("project_goals.id", ondelete="SET NULL"), index=True)

    # Hierarchy
    parent_id = Column(
        Integer, ForeignKey("work_items.id", ondelete="CASCADE"), index=True
    )  # For subtasks
    epic_id = Column(Integer, ForeignKey("work_items.id", ondelete="SET NULL"), index=True)

    # Additional data
    acceptance_criteria = Column(JSON, default=list)
    tags = Column(JSON, default=list)
    attachments = Column(JSON, default=list)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    last_assigned_at = Column(
        DateTime
    )  # Set on create + every assignee_id change. Used for transfer-aware capacity.
    due_date = Column(DateTime)
    start_date = Column(DateTime)  # For Gantt chart - planned start date

    # Relationships
    #
    # N+1 footgun: ``assignee``, ``sprint``, ``parent``, and ``epic`` are the
    # most commonly accessed relationships from list endpoints. Any handler
    # that loops over work items and reads ``item.assignee.name`` (or .sprint,
    # .parent, .epic) MUST eager-load with ``selectinload`` on the base query,
    # otherwise SQLAlchemy issues one extra SELECT per item. See
    # ``list_work_items`` and ``get_my_tasks`` in routers/workitems.py for the
    # pattern, and ``get_project_workload`` in routers/projects.py for the
    # same pattern outside the workitems router.
    project = relationship("Project", back_populates="work_items")
    sprint = relationship("Sprint", back_populates="work_items")
    assignee = relationship(
        "Developer", foreign_keys=[assignee_id], back_populates="assigned_work_items"
    )
    reporter = relationship("Developer", foreign_keys=[reporter_id])
    parent = relationship(
        "WorkItem", remote_side=[id], foreign_keys=[parent_id], back_populates="subtasks"
    )
    subtasks = relationship("WorkItem", foreign_keys=[parent_id], back_populates="parent")
    epic = relationship(
        "WorkItem", remote_side=[id], foreign_keys=[epic_id], back_populates="stories"
    )
    stories = relationship("WorkItem", foreign_keys=[epic_id], back_populates="epic")
    comments = relationship("Comment", back_populates="work_item", cascade="all, delete-orphan")
    time_entries = relationship(
        "TimeEntry", back_populates="work_item", cascade="all, delete-orphan"
    )
    goal = relationship("ProjectGoal", back_populates="work_items")
    dependencies = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.work_item_id",
        back_populates="work_item",
        cascade="all, delete-orphan",
    )
    blocked_by = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.depends_on_id",
        back_populates="depends_on",
        cascade="all, delete-orphan",
    )

    # Indexes for common queries
    __table_args__ = (
        Index("idx_workitem_project_status", "project_id", "status"),
        Index("idx_workitem_project_type", "project_id", "type"),
        Index("idx_workitem_assignee", "assignee_id", "status"),
        Index("idx_workitem_sprint", "sprint_id", "status"),
        Index("idx_workitem_reporter", "reporter_id"),
        Index("idx_workitem_proj_sprint", "project_id", "sprint_id"),
        Index("idx_workitem_updated", "updated_at"),
    )
