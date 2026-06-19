"""Developer model - Team members and their roles"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.comment import Comment
    from models.project import Project
    from models.work_item import WorkItem

# Association table for Project-Developer many-to-many relationship
project_developers = Table(
    "project_developers",
    Base.metadata,
    Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
    Column("developer_id", Integer, ForeignKey("developers.id"), primary_key=True),
    Column("role", String(100), nullable=False),  # Role in this specific project
    Column("responsibilities", Text),  # What they'll be working on
    Column("is_admin", Boolean, default=False),  # Project-specific admin role
    Column("assigned_at", DateTime, default=datetime.utcnow),
)


class Developer(Base):
    __tablename__ = "developers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    github_username: Mapped[str | None] = mapped_column(
        String(100), unique=True
    )  # GitHub username for invitations
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    # External users (created via Admin → Users → Add User) are kept out of the
    # Employees tab, which surfaces only internal team members.
    is_external: Mapped[bool] = mapped_column(default=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )

    # Relationships
    projects: Mapped[list["Project"]] = relationship(
        "Project", secondary=project_developers, back_populates="developers"
    )
    assigned_work_items: Mapped[list["WorkItem"]] = relationship(
        "WorkItem", foreign_keys="WorkItem.assignee_id", back_populates="assignee"
    )
    reported_work_items: Mapped[list["WorkItem"]] = relationship(
        "WorkItem", foreign_keys="WorkItem.reporter_id", back_populates="reporter"
    )
    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="author")
