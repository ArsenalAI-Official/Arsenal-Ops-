"""ProjectPulseOverride model - editorial Pulse-view overrides per project.

Stores the JSON blob of fields that are NOT derivable from work_items /
time_entries / sprints / milestones / activity_logs — narrative copy,
ledger rows, manual risks, monthly cost categories, billing inputs,
milestone budgets. One row per project (``project_id`` is the primary
key); the frontend treats absence-or-empty as the "first-time" signal
for its one-shot localStorage migration.

The blob is intentionally opaque on the server side: the frontend
``PulseData`` types are the contract and evolve faster than this table
should. See ``backend/routers/pulse.py`` for the GET/PUT endpoints.
"""

import sys
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import relationship

sys.path.append("..")
from database import Base


class ProjectPulseOverride(Base):
    __tablename__ = "project_pulse_overrides"

    project_id = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # MutableDict.as_mutable lets SQLAlchemy detect in-place mutations of the
    # JSON blob (e.g. ``override.data["foo"] = "bar"``). Without this the ORM
    # sees the column as unchanged and ``onupdate=datetime.utcnow`` never
    # fires on the updated_at column.
    data = Column(MutableDict.as_mutable(JSON), nullable=False, default=dict)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))

    project = relationship("Project")
    updated_by = relationship("User")
