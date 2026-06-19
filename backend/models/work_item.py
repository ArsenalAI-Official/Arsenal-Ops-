"""WorkItem model - Jira-style work items (stories, tasks, bugs, epics)"""

import enum
import sys
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.comment import Comment
    from models.developer import Developer
    from models.project import Project
    from models.project_goal import ProjectGoal
    from models.sprint import Sprint
    from models.task_dependency import TaskDependency
    from models.time_entry import TimeEntry


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

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    sprint_id: Mapped[int | None] = mapped_column(
        ForeignKey("sprints.id", ondelete="SET NULL"), index=True
    )

    # Core fields
    key: Mapped[str] = mapped_column(String(50), unique=True, index=True)  # e.g., "PROJ-123"
    type: Mapped[str] = mapped_column(
        String(20), default=WorkItemType.TASK.value
    )  # epic, user_story, task, bug
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)

    # Status & Priority
    status: Mapped[str] = mapped_column(String(50), default=WorkItemStatus.TODO.value, index=True)
    priority: Mapped[str] = mapped_column(String(20), default=WorkItemPriority.MEDIUM.value)

    # Estimation
    story_points: Mapped[int] = mapped_column(default=0, nullable=True)
    estimated_hours: Mapped[int | None] = mapped_column()
    remaining_hours: Mapped[int | None] = mapped_column()
    logged_hours: Mapped[int] = mapped_column(
        default=0, nullable=True
    )  # Total hours logged by developers

    # Assignment - linked to Developer model
    assignee_id: Mapped[int | None] = mapped_column(
        ForeignKey("developers.id", ondelete="SET NULL"), index=True
    )
    reporter_id: Mapped[int | None] = mapped_column(
        ForeignKey("developers.id", ondelete="SET NULL")
    )

    # Goal linkage
    goal_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_goals.id", ondelete="SET NULL"), index=True
    )

    # Hierarchy
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), index=True
    )  # For subtasks
    epic_id: Mapped[int | None] = mapped_column(
        ForeignKey("work_items.id", ondelete="SET NULL"), index=True
    )

    # Additional data
    acceptance_criteria: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=True)
    tags: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=True)
    attachments: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_assigned_at: Mapped[datetime | None] = mapped_column(
        DateTime
    )  # Set on create + every assignee_id change. Used for transfer-aware capacity.
    due_date: Mapped[datetime | None] = mapped_column(DateTime)
    start_date: Mapped[datetime | None] = mapped_column(DateTime)  # For Gantt - planned start date

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
    project: Mapped["Project"] = relationship("Project", back_populates="work_items")
    sprint: Mapped["Sprint | None"] = relationship("Sprint", back_populates="work_items")
    assignee: Mapped["Developer | None"] = relationship(
        "Developer", foreign_keys=[assignee_id], back_populates="assigned_work_items"
    )
    reporter: Mapped["Developer | None"] = relationship("Developer", foreign_keys=[reporter_id])
    parent: Mapped["WorkItem | None"] = relationship(
        "WorkItem", remote_side=[id], foreign_keys=[parent_id], back_populates="subtasks"
    )
    subtasks: Mapped[list["WorkItem"]] = relationship(
        "WorkItem", foreign_keys=[parent_id], back_populates="parent"
    )
    epic: Mapped["WorkItem | None"] = relationship(
        "WorkItem", remote_side=[id], foreign_keys=[epic_id], back_populates="stories"
    )
    stories: Mapped[list["WorkItem"]] = relationship(
        "WorkItem", foreign_keys=[epic_id], back_populates="epic"
    )
    comments: Mapped[list["Comment"]] = relationship(
        "Comment", back_populates="work_item", cascade="all, delete-orphan"
    )
    time_entries: Mapped[list["TimeEntry"]] = relationship(
        "TimeEntry", back_populates="work_item", cascade="all, delete-orphan"
    )
    goal: Mapped["ProjectGoal | None"] = relationship("ProjectGoal", back_populates="work_items")
    dependencies: Mapped[list["TaskDependency"]] = relationship(
        "TaskDependency",
        foreign_keys="TaskDependency.work_item_id",
        back_populates="work_item",
        cascade="all, delete-orphan",
    )
    blocked_by: Mapped[list["TaskDependency"]] = relationship(
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
