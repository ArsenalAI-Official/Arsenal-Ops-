"""TimeEntry model - Track individual time log entries"""

import sys
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from time_utils import utcnow

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

    # Time tracking
    hours: Mapped[int] = mapped_column()  # Hours logged in this entry
    description: Mapped[str | None] = mapped_column(Text)  # Optional description of work done

    # Timestamp
    logged_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    # ── QuickBooks sync state ────────────────────────────────────────────
    # Once successfully pushed to QB, holds the returned TimeActivity Id.
    # Indexed because the sync worker filters on `IS NULL`; presence of
    # this column on a row also blocks re-syncing (idempotency).
    workforce_entry_id: Mapped[str | None] = mapped_column(String(64), index=True)

    # When the dev clicked "Submit & Sync" in the Review modal (or the
    # admin force-sync ran). NULL = draft (not yet reviewed by the dev).
    # Combined with `workforce_entry_id`:
    #   (NULL, NULL)         draft — editable, picked up by Submit
    #   (SET,  NULL)         submitted, sync failed — retried on next Submit
    #   (SET,  SET)          synced — locked terminal state
    # The (NULL, SET) combo is impossible post-migration: the backfill
    # backfills `submitted_at = NOW()` for any pre-existing synced row,
    # and every write path (dev submit, admin force-sync) sets both
    # together going forward.
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)

    # Whether this entry's hours are billable to the client. Controlled in
    # the Review & Submit modal at the (client, day) level — toggling a
    # client's "Billable" checkbox for a day sets this on every one of that
    # client's entries logged that day. Drives `BillableStatus` on the
    # QuickBooks push (Billable / NotBillable). Defaults to NOT billable so
    # nothing is billed to a client without an explicit opt-in.
    billable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

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
            "logged_at": self.logged_at.isoformat() if self.logged_at else None,
            "workforce_entry_id": self.workforce_entry_id,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "billable": self.billable,
        }
