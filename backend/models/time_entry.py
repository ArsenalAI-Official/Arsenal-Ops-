"""TimeEntry model - Track individual time log entries"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

sys.path.append("..")
from database import Base

if TYPE_CHECKING:
    from models.developer import Developer
    from models.work_item import WorkItem


class TimeEntry(Base):
    __tablename__ = "time_entries"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    work_item_id: Mapped[int] = mapped_column(
        ForeignKey("work_items.id", ondelete="CASCADE"), index=True
    )
    developer_id: Mapped[int | None] = mapped_column(
        ForeignKey("developers.id", ondelete="SET NULL"), index=True
    )

    # Time tracking. Fractional hours (e.g. 1.5, 0.25) so calendar blocks can be
    # logged at 15/30-minute granularity. Stored NUMERIC for exact decimal in
    # Postgres; asdecimal=False so SQLAlchemy hands the app a plain float (avoids
    # Decimal leaking into hand-built response dicts / json serialization).
    hours: Mapped[float] = mapped_column(
        Numeric(6, 2, asdecimal=False)
    )  # Hours logged in this entry
    description: Mapped[str | None] = mapped_column(Text)  # Optional description of work done

    # Positioned calendar block (UTC). When present, this entry is a block on the
    # week calendar and renders at exactly this day + time-of-day; ``hours`` is
    # derived from (end_time - start_time). Nullable so legacy/quick-log entries
    # (which only have ``hours`` + ``logged_at``) keep working — those render in
    # the calendar's "unscheduled" tray rather than at a fabricated position.
    start_time: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime)

    # Timestamp this entry was recorded (audit), distinct from start_time (when
    # the work happened).
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    work_item: Mapped["WorkItem"] = relationship("WorkItem", back_populates="time_entries")
    developer: Mapped["Developer | None"] = relationship("Developer")

    # Indexes for queries
    __table_args__ = (
        Index("idx_time_entry_work_item_date", "work_item_id", "logged_at"),
        Index("idx_time_entry_developer_date", "developer_id", "logged_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "work_item_id": self.work_item_id,
            "developer_id": self.developer_id,
            "hours": self.hours,
            "description": self.description,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "logged_at": self.logged_at.isoformat() if self.logged_at else None,
        }
