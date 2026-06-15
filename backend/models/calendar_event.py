"""CalendarEvent model - Synced Google Calendar meetings per developer.

Populated by scripts/sync_calendar_events.py, which impersonates each internal
developer's primary calendar via a domain-wide-delegation service account and
upserts the current capacity week's events. Consumed by capacity_service to
fold meeting hours into a developer's weekly capacity.

All timestamps are stored in UTC (the Calendar API returns RFC3339 with
offsets — normalize on write).
"""

import sys
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

sys.path.append("..")
from database import Base

# Generic title shown for private events so their real titles never leak into
# the admin UI (see ticket "Respect event visibility").
PRIVATE_EVENT_TITLE = "Busy"


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    developer_id = Column(
        Integer, ForeignKey("developers.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Identity on Google's side. Unique per (developer, event) so re-syncing the
    # same week updates rows in place instead of duplicating them.
    google_event_id = Column(String(1024), nullable=False)
    organizer_email = Column(String(255))  # organizer / calendar id

    # Title falls back to PRIVATE_EVENT_TITLE for private events.
    title = Column(String(1024), nullable=False, default=PRIVATE_EVENT_TITLE)

    # Timing — UTC.
    start_at = Column(DateTime, nullable=False, index=True)
    end_at = Column(DateTime, nullable=False)
    is_all_day = Column(Boolean, default=False, nullable=False)

    # accepted / tentative / declined / needs_action
    response_status = Column(String(20), default="needs_action", nullable=False)
    # default / private
    visibility = Column(String(20), default="default", nullable=False)

    synced_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    developer = relationship("Developer")

    __table_args__ = (
        UniqueConstraint("developer_id", "google_event_id", name="uq_calendar_event_dev_event"),
        Index("idx_calendar_event_dev_start", "developer_id", "start_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "developer_id": self.developer_id,
            "google_event_id": self.google_event_id,
            "organizer_email": self.organizer_email,
            "title": self.title,
            "start_at": self.start_at.isoformat() if self.start_at else None,
            "end_at": self.end_at.isoformat() if self.end_at else None,
            "is_all_day": self.is_all_day,
            "response_status": self.response_status,
            "visibility": self.visibility,
            "synced_at": self.synced_at.isoformat() if self.synced_at else None,
        }
