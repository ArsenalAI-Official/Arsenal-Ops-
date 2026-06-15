"""Tests for the Google Calendar → capacity meetings feature.

Four surfaces, no live Google needed:

  1. google_calendar_service.parse_event — maps a raw Calendar API event into
     CalendarEvent field values (UTC normalization, private→"Busy", all-day,
     response status, cancelled→None).
  2. capacity_service.meeting_breakdown — the union-of-intervals meeting-hours
     math (overlaps counted once, back-to-back summed, all-day=0, declined
     excluded, week-boundary clamp).
  3. calendar_sync.reconcile_developer_events — idempotent upsert: re-running
     makes no duplicates and removes events that vanished from the calendar.
  4. capacity_service.compute_capacity_breakdown — meeting hours fold into
     this_week_capacity_used and remaining floors at 0.

Run with:
    cd backend && python -m pytest tests/test_calendar_meetings.py -v
"""

import contextlib
import os
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import every model so SQLAlchemy can resolve relationships when create_all runs.
from models import (  # noqa: F401
    activity_log,
    architecture,
    calendar_event,
    developer,
    market_insight,
    persona,
    project,
    project_file,
    project_goal,
    project_milestone,
    sprint,
    task,
    task_dependency,
    time_entry,
    user,
    user_story,
    work_item,
    work_item_assignment_history,
)

with contextlib.suppress(ImportError):
    from models import personal_task  # noqa: F401

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from models.calendar_event import PRIVATE_EVENT_TITLE, CalendarEvent
from services.calendar_sync import reconcile_developer_events
from services.capacity_service import (
    compute_capacity_breakdown,
    meeting_breakdown,
    week_boundaries,
)
from services.google_calendar_service import parse_event

# --------------- In-memory SQLite test DB ---------------
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


# =================== 1. parse_event ===================
DEV_EMAIL = "dev@arsenalai.com"


def test_parse_event_timed_accepted():
    raw = {
        "id": "evt1",
        "status": "confirmed",
        "summary": "Sprint planning",
        "organizer": {"email": "boss@arsenalai.com"},
        "start": {"dateTime": "2026-06-10T09:00:00+00:00"},
        "end": {"dateTime": "2026-06-10T10:00:00+00:00"},
        "attendees": [{"email": DEV_EMAIL, "responseStatus": "accepted"}],
    }
    ev = parse_event(raw, DEV_EMAIL)
    assert ev["google_event_id"] == "evt1"
    assert ev["title"] == "Sprint planning"
    assert ev["response_status"] == "accepted"
    assert ev["is_all_day"] is False
    assert ev["visibility"] == "default"
    # UTC-naive
    assert ev["start_at"] == datetime(2026, 6, 10, 9, 0, 0)
    assert ev["end_at"] == datetime(2026, 6, 10, 10, 0, 0)
    assert ev["start_at"].tzinfo is None


def test_parse_event_normalizes_offset_to_utc():
    # +05:30 → UTC should subtract 5h30m.
    raw = {
        "id": "evt-tz",
        "summary": "Standup",
        "start": {"dateTime": "2026-06-10T14:30:00+05:30"},
        "end": {"dateTime": "2026-06-10T15:00:00+05:30"},
    }
    ev = parse_event(raw, DEV_EMAIL)
    assert ev["start_at"] == datetime(2026, 6, 10, 9, 0, 0)
    assert ev["end_at"] == datetime(2026, 6, 10, 9, 30, 0)


def test_parse_event_private_hides_title():
    raw = {
        "id": "evt2",
        "summary": "Therapy appointment",
        "visibility": "private",
        "start": {"dateTime": "2026-06-10T09:00:00Z"},
        "end": {"dateTime": "2026-06-10T10:00:00Z"},
    }
    ev = parse_event(raw, DEV_EMAIL)
    assert ev["title"] == PRIVATE_EVENT_TITLE
    assert ev["visibility"] == "private"


def test_parse_event_all_day():
    raw = {
        "id": "evt3",
        "summary": "Company offsite",
        "start": {"date": "2026-06-10"},
        "end": {"date": "2026-06-11"},
    }
    ev = parse_event(raw, DEV_EMAIL)
    assert ev["is_all_day"] is True
    assert ev["start_at"] == datetime(2026, 6, 10, 0, 0, 0)


def test_parse_event_declined():
    raw = {
        "id": "evt4",
        "summary": "Optional sync",
        "start": {"dateTime": "2026-06-10T09:00:00Z"},
        "end": {"dateTime": "2026-06-10T10:00:00Z"},
        "attendees": [{"email": DEV_EMAIL, "responseStatus": "declined"}],
    }
    ev = parse_event(raw, DEV_EMAIL)
    assert ev["response_status"] == "declined"


def test_parse_event_cancelled_returns_none():
    raw = {"id": "evt5", "status": "cancelled"}
    assert parse_event(raw, DEV_EMAIL) is None


def test_parse_event_missing_id_returns_none():
    raw = {"summary": "no id", "start": {"dateTime": "2026-06-10T09:00:00Z"}}
    assert parse_event(raw, DEV_EMAIL) is None


# =================== 2. meeting_breakdown (union math) ===================
WS = datetime(2026, 6, 6, 0, 0, 0)  # a Saturday
WE = WS + timedelta(days=6, hours=23, minutes=59, seconds=59)


def _ev(
    start, end, *, response_status="accepted", is_all_day=False, title="M", visibility="default"
):
    return SimpleNamespace(
        title=title,
        start_at=start,
        end_at=end,
        response_status=response_status,
        is_all_day=is_all_day,
        visibility=visibility,
    )


def test_meeting_hours_simple_sum():
    events = [
        _ev(datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 10)),  # 1h
        _ev(datetime(2026, 6, 8, 11), datetime(2026, 6, 8, 12, 30)),  # 1.5h
    ]
    total, out = meeting_breakdown(events, WS, WE)
    assert total == 2.5
    assert len(out) == 2


def test_meeting_hours_overlap_counted_once():
    # 9–11 and 10–12 overlap → union is 9–12 = 3h, not 4h.
    events = [
        _ev(datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 11)),
        _ev(datetime(2026, 6, 8, 10), datetime(2026, 6, 8, 12)),
    ]
    total, out = meeting_breakdown(events, WS, WE)
    assert total == 3
    # Per-meeting hours still reflect each meeting's own duration.
    assert sorted(m["hours"] for m in out) == [2, 2]


def test_meeting_hours_back_to_back():
    events = [
        _ev(datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 10)),
        _ev(datetime(2026, 6, 8, 10), datetime(2026, 6, 8, 11)),
    ]
    total, _ = meeting_breakdown(events, WS, WE)
    assert total == 2


def test_meeting_hours_all_day_counts_zero():
    events = [_ev(datetime(2026, 6, 8, 0), datetime(2026, 6, 9, 0), is_all_day=True)]
    total, out = meeting_breakdown(events, WS, WE)
    assert total == 0


def test_meeting_breakdown_masks_private_title():
    # Defense-in-depth: a private event's real title must never reach the
    # breakdown, even if a row was written with its real title.
    events = [
        _ev(
            datetime(2026, 6, 8, 9),
            datetime(2026, 6, 8, 10),
            title="Therapy appointment",
            visibility="private",
        )
    ]
    _, out = meeting_breakdown(events, WS, WE)
    assert out[0]["title"] == "Busy"
    assert out[0]["hours"] == 1  # privacy masks the title only — hours still count


def test_meeting_hours_declined_excluded():
    events = [_ev(datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 10), response_status="declined")]
    total, out = meeting_breakdown(events, WS, WE)
    assert total == 0
    assert out == []


def test_meeting_hours_clamped_to_window():
    # Event starts before the window; only the in-window portion counts.
    events = [_ev(WS - timedelta(hours=2), WS + timedelta(hours=1))]
    total, _ = meeting_breakdown(events, WS, WE)
    assert total == 1


# =================== 3. reconcile (idempotency) ===================
def _make_dev(db, email="dev@arsenalai.com"):
    from models.developer import Developer

    d = Developer(name="Dev", email=email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def _parsed(event_id, start, end, title="M"):
    return {
        "google_event_id": event_id,
        "organizer_email": "o@arsenalai.com",
        "title": title,
        "start_at": start,
        "end_at": end,
        "is_all_day": False,
        "response_status": "accepted",
        "visibility": "default",
    }


def test_reconcile_inserts_then_idempotent(db):
    dev = _make_dev(db)
    events = [
        _parsed("a", datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 10)),
        _parsed("b", datetime(2026, 6, 8, 11), datetime(2026, 6, 8, 12)),
    ]
    s1 = reconcile_developer_events(db, dev.id, events, WS, WE)
    db.commit()
    assert s1 == {"inserted": 2, "updated": 0, "deleted": 0}
    assert db.query(CalendarEvent).count() == 2

    # Re-run with the same data → updates in place, no duplicates.
    s2 = reconcile_developer_events(db, dev.id, events, WS, WE)
    db.commit()
    assert s2["inserted"] == 0 and s2["deleted"] == 0
    assert db.query(CalendarEvent).count() == 2


def test_reconcile_updates_changed_event(db):
    dev = _make_dev(db)
    reconcile_developer_events(
        db, dev.id, [_parsed("a", datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 10), "Old")], WS, WE
    )
    db.commit()
    reconcile_developer_events(
        db, dev.id, [_parsed("a", datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 11), "New")], WS, WE
    )
    db.commit()
    row = db.query(CalendarEvent).one()
    assert row.title == "New"
    assert row.end_at == datetime(2026, 6, 8, 11)


def test_reconcile_deletes_cancelled_event(db):
    dev = _make_dev(db)
    events = [
        _parsed("a", datetime(2026, 6, 8, 9), datetime(2026, 6, 8, 10)),
        _parsed("b", datetime(2026, 6, 8, 11), datetime(2026, 6, 8, 12)),
    ]
    reconcile_developer_events(db, dev.id, events, WS, WE)
    db.commit()
    # Second sync no longer includes "b" → it should be removed.
    s = reconcile_developer_events(db, dev.id, [events[0]], WS, WE)
    db.commit()
    assert s["deleted"] == 1
    remaining = db.query(CalendarEvent).all()
    assert {r.google_event_id for r in remaining} == {"a"}


# =================== 4. capacity integration ===================
def test_capacity_includes_meeting_hours(db):
    from models.calendar_event import CalendarEvent as CE

    week_start, week_end = week_boundaries()
    dev = _make_dev(db, email="cap@arsenalai.com")
    # A 2h accepted meeting inside the current week.
    db.add(
        CE(
            developer_id=dev.id,
            google_event_id="m1",
            title="Planning",
            start_at=week_start + timedelta(days=1, hours=9),
            end_at=week_start + timedelta(days=1, hours=11),
            is_all_day=False,
            response_status="accepted",
            visibility="default",
        )
    )
    db.commit()

    result = compute_capacity_breakdown([], week_start, db=db, developer_id=dev.id)
    assert result["this_week_meeting_hours"] == 2
    assert result["this_week_capacity_used"] == 2
    assert result["this_week_remaining_capacity"] == 38
    assert len(result["meetings"]) == 1


def test_capacity_remaining_floors_at_zero(db):
    from models.calendar_event import CalendarEvent as CE

    week_start, _ = week_boundaries()
    dev = _make_dev(db, email="busy@arsenalai.com")
    # A 50h meeting block → used exceeds 40, remaining floors at 0.
    db.add(
        CE(
            developer_id=dev.id,
            google_event_id="huge",
            title="Marathon",
            start_at=week_start + timedelta(hours=1),
            end_at=week_start + timedelta(hours=51),
            is_all_day=False,
            response_status="accepted",
            visibility="default",
        )
    )
    db.commit()

    result = compute_capacity_breakdown([], week_start, db=db, developer_id=dev.id)
    assert result["this_week_remaining_capacity"] == 0


def test_capacity_no_meetings_no_regression(db):
    week_start, _ = week_boundaries()
    dev = _make_dev(db, email="empty@arsenalai.com")
    result = compute_capacity_breakdown([], week_start, db=db, developer_id=dev.id)
    assert result["this_week_meeting_hours"] == 0
    assert result["meetings"] == []
    assert result["this_week_capacity_used"] == 0
