"""Developer model - Team members and their roles"""

import sys
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import relationship

sys.path.append("..")
from database import Base

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

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    github_username = Column(String(100), unique=True)  # GitHub username for invitations
    avatar_url = Column(String(500))

    # External users (created via Admin → Users → Add User) are kept out of the
    # Employees tab, which surfaces only internal team members.
    is_external = Column(Boolean, default=False, nullable=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    projects = relationship("Project", secondary=project_developers, back_populates="developers")
    assigned_work_items = relationship(
        "WorkItem", foreign_keys="WorkItem.assignee_id", back_populates="assignee"
    )
    reported_work_items = relationship(
        "WorkItem", foreign_keys="WorkItem.reporter_id", back_populates="reporter"
    )
    comments = relationship("Comment", back_populates="author")
