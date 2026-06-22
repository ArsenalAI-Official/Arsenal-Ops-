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
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.project import Project
    from models.user import User


class ProjectPulseOverride(Base):
    __tablename__ = "project_pulse_overrides"

    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # MutableDict.as_mutable lets SQLAlchemy detect in-place mutations of the
    # JSON blob (e.g. ``override.data["foo"] = "bar"``). Without this the ORM
    # sees the column as unchanged and ``onupdate=datetime.utcnow`` never
    # fires on the updated_at column.
    data: Mapped[dict[str, Any]] = mapped_column(MutableDict.as_mutable(JSON), default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )

    project: Mapped["Project"] = relationship("Project")
    updated_by: Mapped["User | None"] = relationship("User")
