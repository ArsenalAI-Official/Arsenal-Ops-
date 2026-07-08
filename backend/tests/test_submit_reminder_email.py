"""Tests for the Friday review-and-submit reminder email.

The reminder is NOT scheduled yet (per product call, awaiting CEO
approval on cadence + copy) — these tests cover the template +
dry-run path so a future "turn it on" PR can land confidently.
"""

from __future__ import annotations

import os
import sys
from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models  # noqa: F401 — registers tables with Base.metadata
from database import Base
from services.submit_reminder_email import (
    _current_week_window,
    build_reminder_email_html,
    build_reminder_email_text,
    send_one_preview,
    send_submit_reminders,
)

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Reference week: Mon 2024-01-08 through Fri 2024-01-12.
WINDOW_MONDAY = date(2024, 1, 8)
WINDOW_FRIDAY = date(2024, 1, 12)
WINDOW_SUNDAY = date(2024, 1, 14)


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


def _make_dev(db, name, email, *, is_external=False):
    from models.developer import Developer

    d = Developer(name=name, email=email, is_external=is_external)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


_wi_n = {"n": 0}
_proj_n = {"n": 0}


def _make_project(db, *, linked=True):
    from models.project import Project

    # Unique key_prefix per call — projects.key_prefix is UNIQUE, so tests
    # that create more than one project (e.g. linked + unlinked) can't share
    # the literal "P".
    _proj_n["n"] += 1
    p = Project(
        name="P",
        description="x",
        status="active",
        key_prefix=f"P{_proj_n['n']}",
        workforce_client_id="QB-CUST-1" if linked else None,
        workforce_client_name="Acme" if linked else None,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_wi(db, project_id, assignee_id):
    from models.work_item import WorkItem

    _wi_n["n"] += 1
    wi = WorkItem(
        key=f"P-{_wi_n['n']}",
        title="t",
        type="task",
        status="in_progress",
        estimated_hours=10,
        logged_hours=0,
        remaining_hours=10,
        project_id=project_id,
        assignee_id=assignee_id,
    )
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


def _make_te(db, wi, dev_id, *, hours=2, logged_at=None, **kwargs):
    from datetime import datetime

    from models.time_entry import TimeEntry

    e = TimeEntry(
        work_item_id=wi.id,
        developer_id=dev_id,
        hours=hours,
        logged_at=logged_at or datetime.combine(WINDOW_MONDAY, datetime.min.time()),
        **kwargs,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


# ── Window resolution ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("today", "expected_mon", "expected_fri"),
    [
        (date(2024, 1, 8), date(2024, 1, 8), date(2024, 1, 12)),  # Mon
        (date(2024, 1, 12), date(2024, 1, 8), date(2024, 1, 12)),  # Fri
        (date(2024, 1, 13), date(2024, 1, 8), date(2024, 1, 12)),  # Sat → still this week
        (date(2024, 1, 14), date(2024, 1, 8), date(2024, 1, 12)),  # Sun → still this week
    ],
)
def test_current_week_window_matches_workforce_sync_convention(today, expected_mon, expected_fri):
    """Reminder must target the SAME Mon-Fri window the Review modal
    shows. Friday's email body's "this week" must match what the dev
    sees when they click the link."""
    monday, friday = _current_week_window(today)
    assert monday == expected_mon
    assert friday == expected_fri


# ── Template content ────────────────────────────────────────────────────


def test_html_email_contains_required_pieces():
    html = build_reminder_email_html(
        to_name="Sahil Fayaz",
        monday=WINDOW_MONDAY,
        friday=WINDOW_FRIDAY,
        app_url="https://example.com",
    )
    # Personalized greeting uses first name only.
    assert "Hi Sahil," in html
    # Week range visible at the top.
    assert "Mon, Jan 8" in html
    assert "Fri, Jan 12" in html
    # Sunday deadline copy.
    assert "Sunday" in html
    assert "Jan 14" in html  # the Sunday two days after Friday
    # CTA link points to the app.
    assert 'href="https://example.com"' in html
    # Brand reference.
    assert "Arsenal Ops" in html


def test_text_email_mirrors_html_content():
    text = build_reminder_email_text(
        to_name="Sahil Fayaz",
        monday=WINDOW_MONDAY,
        friday=WINDOW_FRIDAY,
        app_url="https://example.com",
    )
    assert "Hi Sahil," in text
    assert "Mon, Jan 8" in text
    assert "Fri, Jan 12" in text
    assert "Sunday" in text
    assert "https://example.com" in text


def test_html_email_handles_missing_name_gracefully():
    """Defensive: a dev row with empty name shouldn't break rendering."""
    html = build_reminder_email_html(
        to_name="",
        monday=WINDOW_MONDAY,
        friday=WINDOW_FRIDAY,
        app_url="https://example.com",
    )
    assert "Hi there," in html


# ── Recipient filtering & dry-run ────────────────────────────────────────


def _seed_eligible_entry(db, dev):
    """Convenience: seed a (linked project, this-week, unsubmitted)
    TimeEntry — the shape that makes a dev a reminder recipient."""
    proj = _make_project(db, linked=True)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id)


def test_dry_run_lists_only_internal_employees(db):
    """Internal devs (is_external=False) are recipients. External
    contractors are NOT, and never appear in the dry-run preview."""
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    bob = _make_dev(db, "Bob", "bob@arsenal.test")
    contractor = _make_dev(db, "Contractor", "c@other.test", is_external=True)
    # Seed eligible hours for all three; the external filter happens
    # before the entries query, so the external dev's hours don't matter.
    _seed_eligible_entry(db, alice)
    _seed_eligible_entry(db, bob)
    _seed_eligible_entry(db, contractor)

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.dry_run is True
    assert result.recipients_total == 2  # external dev excluded by the filter
    assert result.sent == 2  # dry-run still increments "would send"
    assert result.skipped_no_email == 0
    assert result.skipped_nothing_to_submit == 0
    assert result.failed == []


def test_dry_run_skips_developers_with_no_email(db):
    """Devs without an email get counted as skipped, not failed."""
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    no_email = _make_dev(db, "NoEmail", "")
    bad_email = _make_dev(db, "AlsoNoEmail", "no-at-sign")
    for d in (alice, no_email, bad_email):
        _seed_eligible_entry(db, d)

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.recipients_total == 3
    assert result.sent == 1
    assert result.skipped_no_email == 2


def test_dry_run_does_not_call_mailer(db, monkeypatch):
    """Dry-run must NEVER hit the actual email service — regression
    guard against accidentally wiring the cron with a misset flag."""
    calls = []

    def boom(*args, **kwargs):
        calls.append((args, kwargs))
        raise RuntimeError("dry-run should not touch the mailer")

    monkeypatch.setattr("services.submit_reminder_email.email_service.send_email", boom)

    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    _seed_eligible_entry(db, alice)
    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.sent == 1
    assert calls == []  # mailer was never called


def test_live_send_aborts_if_email_service_not_configured(db, monkeypatch):
    """Live mode must hard-stop when the mailer isn't wired — better
    than silently no-op'ing for the whole team."""
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    _seed_eligible_entry(db, alice)
    monkeypatch.setattr("services.submit_reminder_email.email_service.is_configured", lambda: False)

    result = send_submit_reminders(db, dry_run=False, today=WINDOW_FRIDAY)

    assert result.dry_run is False
    assert result.sent == 0
    assert len(result.failed) >= 1
    assert "not configured" in result.failed[0]


def test_live_send_records_per_recipient_failure_and_continues(db, monkeypatch):
    """One bad email shouldn't drop the rest of the batch."""
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    bob = _make_dev(db, "Bob", "bob@arsenal.test")
    _seed_eligible_entry(db, alice)
    _seed_eligible_entry(db, bob)

    monkeypatch.setattr("services.submit_reminder_email.email_service.is_configured", lambda: True)

    def fake_send(*, to_email, subject, html_body, text_body=None):
        if "alice" in to_email:
            raise RuntimeError("smtp went sideways")
        return True

    monkeypatch.setattr("services.submit_reminder_email.email_service.send_email", fake_send)

    result = send_submit_reminders(db, dry_run=False, today=WINDOW_FRIDAY)

    assert result.sent == 1  # Bob delivered
    assert any("alice" in f for f in result.failed)
    # Bob still ran — batch wasn't aborted on Alice's failure.
    assert "bob@arsenal.test" not in " ".join(result.failed)


# ── "Skip if nothing to submit" filter ──────────────────────────────────


def test_skips_dev_with_no_logged_hours_this_week(db):
    """Devs who logged nothing this week have no reminder to send."""
    _make_dev(db, "Alice", "alice@arsenal.test")  # no entries seeded

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.sent == 0
    assert result.skipped_nothing_to_submit == 1


def test_skips_dev_whose_entries_are_already_submitted(db):
    """If `submitted_at` is set, the dev's already done their part."""
    from datetime import datetime

    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    proj = _make_project(db, linked=True)
    wi = _make_wi(db, proj.id, alice.id)
    _make_te(db, wi, alice.id, submitted_at=datetime(2024, 1, 12, 9, 0))

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.sent == 0
    assert result.skipped_nothing_to_submit == 1


def test_skips_dev_whose_entries_are_synced(db):
    """workforce_entry_id set means the entry is in QB. No reminder."""
    from datetime import datetime

    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    proj = _make_project(db, linked=True)
    wi = _make_wi(db, proj.id, alice.id)
    _make_te(
        db,
        wi,
        alice.id,
        submitted_at=datetime(2024, 1, 12, 9, 0),
        workforce_entry_id="QB-TA-1",
    )

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.sent == 0
    assert result.skipped_nothing_to_submit == 1


def test_skips_dev_with_only_unlinked_project_hours(db):
    """If the dev's hours are all on projects with no QB customer
    link, emailing them doesn't help — admin needs to link the project
    first. The dev IS notified separately by the unlinked-projects
    section inside the Review modal."""
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    proj = _make_project(db, linked=False)
    wi = _make_wi(db, proj.id, alice.id)
    _make_te(db, wi, alice.id)

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.sent == 0
    assert result.skipped_nothing_to_submit == 1


def test_includes_dev_with_at_least_one_eligible_entry(db):
    """Mixed bag: one already-synced entry + one fresh draft. The fresh
    draft alone qualifies the dev for the reminder."""
    from datetime import datetime

    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    proj = _make_project(db, linked=True)
    wi = _make_wi(db, proj.id, alice.id)
    # One already synced — doesn't count.
    _make_te(
        db,
        wi,
        alice.id,
        submitted_at=datetime(2024, 1, 12, 9, 0),
        workforce_entry_id="QB-TA-1",
    )
    # One fresh draft — qualifies.
    _make_te(db, wi, alice.id)

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.sent == 1
    assert result.skipped_nothing_to_submit == 0


def test_send_one_preview_bypasses_recipient_filter(db, monkeypatch):
    """The single-recipient preview path ignores the
    `has-unsubmitted-hours` gate — the whole point is to land a preview
    in someone's inbox regardless of their hours state."""
    sent = []
    monkeypatch.setattr("services.submit_reminder_email.email_service.is_configured", lambda: True)

    def fake_send(*, to_email, subject, html_body, text_body=None):
        sent.append({"to_email": to_email, "subject": subject})
        return True

    monkeypatch.setattr("services.submit_reminder_email.email_service.send_email", fake_send)

    # No Developer row, no entries — broadcast wouldn't include this person.
    err = send_one_preview(db, to_email="me@arsenal.test", today=WINDOW_FRIDAY)

    assert err is None
    assert len(sent) == 1
    assert sent[0]["to_email"] == "me@arsenal.test"
    # Subject matches the broadcast verbatim — the preview path is meant
    # to show exactly what recipients will see.
    assert "review & submit your hours" in sent[0]["subject"]
    assert "PREVIEW" not in sent[0]["subject"]


def test_send_one_preview_resolves_name_from_developer_row(db, monkeypatch):
    """When `to_name` is omitted, the helper picks up the matching
    Developer's name so the email's greeting reads naturally."""
    captured = {}
    monkeypatch.setattr("services.submit_reminder_email.email_service.is_configured", lambda: True)

    def fake_send(*, to_email, subject, html_body, text_body=None):
        captured["html"] = html_body
        return True

    monkeypatch.setattr("services.submit_reminder_email.email_service.send_email", fake_send)

    _make_dev(db, "Sahil Fayaz", "sahil@arsenal.test")
    send_one_preview(db, to_email="sahil@arsenal.test", today=WINDOW_FRIDAY)

    assert "Hi Sahil," in captured["html"]


def test_send_one_preview_returns_error_when_mailer_misconfigured(db, monkeypatch):
    monkeypatch.setattr("services.submit_reminder_email.email_service.is_configured", lambda: False)

    err = send_one_preview(db, to_email="me@arsenal.test", today=WINDOW_FRIDAY)

    assert err is not None
    assert "not configured" in err


def test_skips_dev_with_only_out_of_week_entries(db):
    """An entry from last week doesn't trigger a current-week reminder."""
    from datetime import datetime, timedelta

    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    proj = _make_project(db, linked=True)
    wi = _make_wi(db, proj.id, alice.id)
    # 10 days back — solidly last week.
    old_date = datetime.combine(WINDOW_MONDAY - timedelta(days=10), datetime.min.time())
    _make_te(db, wi, alice.id, logged_at=old_date)

    result = send_submit_reminders(db, dry_run=True, today=WINDOW_FRIDAY)

    assert result.sent == 0
    assert result.skipped_nothing_to_submit == 1
