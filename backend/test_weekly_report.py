"""Unit tests for the weekly team report builder.

Verifies that `build_weekly_report_html` includes every developer, their
correct capacity numbers, and their per-project logged-hours split. No
emails are sent — `email_service` is not invoked.
"""

from __future__ import annotations

import os
import sys
from datetime import timedelta
from html.parser import HTMLParser

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(__file__))

import models  # noqa: F401, E402 — registers tables with Base.metadata
from database import Base  # noqa: E402

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
    s = TestSession()
    try:
        yield s
    finally:
        s.close()


def _wb():
    from services.capacity_service import week_boundaries

    return week_boundaries()


def _make_project(db, name, key="P"):
    from models.project import Project

    p = Project(name=name, description="t", status="active", key_prefix=key)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_dev(db, name, email):
    from models.developer import Developer

    d = Developer(name=name, email=email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


_wi_n = {"n": 0}


def _make_wi(db, project_id, assignee_id, **kw):
    from models.work_item import WorkItem

    _wi_n["n"] += 1
    defaults = {
        "key": f"T-{_wi_n['n']}",
        "title": "t",
        "type": "task",
        "status": "todo",
        "estimated_hours": 10,
        "logged_hours": 0,
        "project_id": project_id,
        "assignee_id": assignee_id,
    }
    defaults.update(kw)
    defaults["remaining_hours"] = max(
        0, (defaults["estimated_hours"] or 0) - (defaults["logged_hours"] or 0)
    )
    wi = WorkItem(**defaults)
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


def _add_te(db, wi, dev_id, hours, logged_at):
    from models.time_entry import TimeEntry

    e = TimeEntry(work_item_id=wi.id, developer_id=dev_id, hours=hours, logged_at=logged_at)
    db.add(e)
    db.commit()
    return e


def _add_span(db, wi_id, dev_id, assigned_at, unassigned_at=None):
    from models.work_item_assignment_history import WorkItemAssignmentHistory

    s = WorkItemAssignmentHistory(
        work_item_id=wi_id,
        developer_id=dev_id,
        assigned_at=assigned_at,
        unassigned_at=unassigned_at,
    )
    db.add(s)
    db.commit()
    return s


class _TextExtractor(HTMLParser):
    """Strip HTML so assertions can match on rendered text."""

    def __init__(self):
        super().__init__()
        self.buf: list[str] = []

    def handle_data(self, data):
        self.buf.append(data)

    @classmethod
    def text_of(cls, html: str) -> str:
        p = cls()
        p.feed(html)
        return " ".join(t.strip() for t in p.buf if t.strip())


# ============================================================
# Tests
# ============================================================


def test_report_includes_all_developers_with_hours(db):
    from services.weekly_report_service import build_weekly_report_html

    p = _make_project(db, "Alpha", "A")
    alice = _make_dev(db, "Alice", "alice@t.com")
    bob = _make_dev(db, "Bob", "bob@t.com")
    ws, _ = _wb()

    a_wi = _make_wi(db, p.id, alice.id, status="in_progress", estimated_hours=10, started_at=ws)
    _add_span(db, a_wi.id, alice.id, assigned_at=ws)
    _add_te(db, a_wi, alice.id, 6, logged_at=ws + timedelta(days=1))

    b_wi = _make_wi(db, p.id, bob.id, status="in_progress", estimated_hours=10, started_at=ws)
    _add_span(db, b_wi.id, bob.id, assigned_at=ws)
    _add_te(db, b_wi, bob.id, 2, logged_at=ws + timedelta(days=2))

    html = build_weekly_report_html(db)
    text = _TextExtractor.text_of(html)

    assert "Weekly Hours Report" in text
    assert "Alice" in text and "Bob" in text
    assert "alice@t.com" in text and "bob@t.com" in text
    assert "6h" in text
    assert "2h" in text
    # Team total = 6 + 2 = 8
    assert "8h" in text
    assert "Team total" in text


def test_report_shows_per_project_split_under_each_member(db):
    """Each dev row shows the per-project breakdown and the cross-project total."""
    from services.weekly_report_service import build_weekly_report_html

    pA = _make_project(db, "Alpha", "A")
    pB = _make_project(db, "Beta", "B")
    dev = _make_dev(db, "Carol", "carol@t.com")
    ws, _ = _wb()

    wA = _make_wi(db, pA.id, dev.id, status="in_progress", estimated_hours=10, started_at=ws)
    _add_span(db, wA.id, dev.id, assigned_at=ws)
    _add_te(db, wA, dev.id, 4, logged_at=ws + timedelta(days=1))

    wB = _make_wi(db, pB.id, dev.id, status="in_progress", estimated_hours=8, started_at=ws)
    _add_span(db, wB.id, dev.id, assigned_at=ws)
    _add_te(db, wB, dev.id, 3, logged_at=ws + timedelta(days=2))

    html = build_weekly_report_html(db)
    text = _TextExtractor.text_of(html)

    assert "Carol" in text
    # Per-project lines appear with their hours
    assert "Alpha" in text
    assert "Beta" in text
    assert "4h" in text
    assert "3h" in text
    # Cross-project total = 4 + 3 = 7
    assert "7h" in text
    # Highest-hours project (Alpha, 4h) appears BEFORE lower (Beta, 3h)
    assert text.index("Alpha") < text.index("Beta")
    # Header was renamed
    assert "Name" in text
    assert "Developer" not in text


def test_report_developer_with_no_hours_shows_zero(db):
    """Devs with zero logged hours still appear, sorted to the bottom with 0h."""
    from services.weekly_report_service import build_weekly_report_html

    p = _make_project(db, "Alpha", "A")
    active = _make_dev(db, "Active Andy", "active@t.com")
    _make_dev(db, "Quiet Quinn", "quiet@t.com")  # zero-hour dev — shows up via query
    ws, _ = _wb()

    wi = _make_wi(db, p.id, active.id, status="in_progress", estimated_hours=10, started_at=ws)
    _add_span(db, wi.id, active.id, assigned_at=ws)
    _add_te(db, wi, active.id, 5, logged_at=ws + timedelta(days=1))

    html = build_weekly_report_html(db)
    text = _TextExtractor.text_of(html)

    assert "Active Andy" in text
    assert "Quiet Quinn" in text
    # Active dev appears BEFORE the quiet one (sort: hours desc, 0-hour last).
    assert text.index("Active Andy") < text.index("Quiet Quinn")
    assert "5h" in text
    assert "0h" in text


def test_report_empty_team_is_safe(db):
    from services.weekly_report_service import build_weekly_report_html

    html = build_weekly_report_html(db)
    text = _TextExtractor.text_of(html)
    assert "Weekly Hours Report" in text
    assert "No developers on record." in text


def test_report_excludes_hours_logged_outside_this_week(db):
    """Only this week's logs count — previous-week entries must not appear."""
    from services.weekly_report_service import build_weekly_report_html

    p = _make_project(db, "Alpha", "A")
    dev = _make_dev(db, "Dana", "dana@t.com")
    ws, _ = _wb()
    last_week = ws - timedelta(days=3)

    wi = _make_wi(db, p.id, dev.id, status="in_progress", estimated_hours=20, started_at=last_week)
    _add_span(db, wi.id, dev.id, assigned_at=last_week)
    _add_te(db, wi, dev.id, 8, logged_at=last_week)  # last week — must NOT count
    _add_te(db, wi, dev.id, 3, logged_at=ws + timedelta(days=1))  # this week

    html = build_weekly_report_html(db)
    text = _TextExtractor.text_of(html)

    assert "Dana" in text
    assert "3h" in text
    # The last-week 8h must not show up
    assert "8h" not in text


def test_send_weekly_report_noop_when_no_recipients(db):
    """No recipients → returns {} and does NOT touch email_service."""
    from services.weekly_report_service import send_weekly_report

    result = send_weekly_report(db, recipients=[])
    assert result == {}

    # Whitespace-only entries also drop out
    result2 = send_weekly_report(db, recipients=["", "   "])
    assert result2 == {}


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
