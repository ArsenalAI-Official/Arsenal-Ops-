"""Unit tests for the QuickBooks (Workforce) sync worker.

Covers `services.workforce_sync.run_workforce_sync` end-to-end plus the
helpers it depends on (`current_work_week_window`, `build_description`).

The QB API client (`services.workforce_qb_client`) and the OAuth refresh
helper (`services.workforce_oauth`) are mocked at their import site in
`services.workforce_sync` — no real network calls, no encryption key
required, no Postgres needed. The tests use sqlite-in-memory so the
advisory lock is a no-op (verified explicitly in one test).
"""

from __future__ import annotations

import logging
import os
import sys
from datetime import date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Make the backend importable as if we were running from /app.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models  # noqa: F401 — registers tables with Base.metadata
from database import Base

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── Fixtures ─────────────────────────────────────────────────────────────


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


# Reference date that simplifies the math: 2024-01-13 is a Saturday, so
# the work-week window resolves to Mon 2024-01-08 .. Fri 2024-01-12 and
# we can place entries inside / outside the window with no ambiguity.
SAT = date(2024, 1, 13)
WINDOW_MONDAY = date(2024, 1, 8)
WINDOW_FRIDAY = date(2024, 1, 12)


# ── Domain object helpers ────────────────────────────────────────────────


def _make_project(
    db, name="Acme", *, workforce_client_id="QB-CUST-1", workforce_client_name="Acme Co"
):
    from models.project import Project

    p = Project(
        name=name,
        description="x",
        status="active",
        key_prefix="ACME",
        workforce_client_id=workforce_client_id,
        workforce_client_name=workforce_client_name,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_dev(db, name="Alice", email="alice@arsenal.test"):
    from models.developer import Developer

    d = Developer(name=name, email=email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


_wi_n = {"n": 0}


def _make_wi(db, project_id, assignee_id, *, title="Task title", key=None):
    from models.work_item import WorkItem

    _wi_n["n"] += 1
    wi = WorkItem(
        key=key or f"ACME-{_wi_n['n']}",
        title=title,
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


def _make_te(db, wi, dev_id, hours=4, logged_at=None, workforce_entry_id=None, description=None):
    from models.time_entry import TimeEntry

    e = TimeEntry(
        work_item_id=wi.id,
        developer_id=dev_id,
        hours=hours,
        logged_at=logged_at
        or datetime.combine(WINDOW_MONDAY + timedelta(days=1), datetime.min.time()),
        workforce_entry_id=workforce_entry_id,
        description=description,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _make_integration(db, *, service_item_id="QB-ITEM-7", service_item_name="Hours"):
    """Connected integration row. Token ciphertexts are placeholders — the
    test suite never decrypts them because the QB client functions are
    mocked at the import site of services.workforce_sync.
    """
    from models.workforce_integration import WorkforceIntegration

    wi = WorkforceIntegration(
        realm_id="REALM-1",
        refresh_token_ciphertext="ciphertext-refresh",
        access_token_ciphertext="ciphertext-access",
        access_token_expires_at=datetime.utcnow() + timedelta(hours=1),
        service_item_id=service_item_id,
        service_item_name=service_item_name,
    )
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


# Each test patches the three QB client functions at the import site so
# the sync worker calls our doubles instead of hitting Intuit. Returning
# a tuple of (employee_map, post_calls) from this fixture lets each test
# inspect what was pushed without re-implementing the doubles.
@pytest.fixture
def qb_doubles(monkeypatch):
    # `Any` because the dict is a grab-bag of dummies, lists, and
    # exception instances — typing it precisely would need ~6 TypedDicts
    # for one fixture. The fields are documented inline.
    state: dict[str, Any] = {
        "employees": {"alice@arsenal.test": "EMP-1", "bob@arsenal.test": "EMP-2"},
        "service_item": {"id": "QB-ITEM-7", "name": "Hours"},
        "post_calls": [],
        "post_outcomes": None,  # None → success; list → pop one per call
        "fetch_employees_raises": None,
        "resolve_item_raises": None,
    }

    def fake_fetch(db, integration):
        if state["fetch_employees_raises"]:
            raise state["fetch_employees_raises"]
        return dict(state["employees"])

    def fake_resolve(db, integration, *, name="Hours"):
        if state["resolve_item_raises"]:
            raise state["resolve_item_raises"]
        return state["service_item"]

    def fake_post(
        db,
        integration,
        *,
        employee_qb_id,
        customer_qb_id,
        service_item_id,
        hours,
        txn_date,
        description=None,
    ):
        state["post_calls"].append(
            {
                "employee_qb_id": employee_qb_id,
                "customer_qb_id": customer_qb_id,
                "service_item_id": service_item_id,
                "hours": hours,
                "txn_date": txn_date,
                "description": description,
            }
        )
        # If a list of outcomes was queued, pop the next one. Otherwise
        # all calls succeed with a generated QB id.
        if state["post_outcomes"] is not None:
            outcome = state["post_outcomes"].pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        return f"QB-TA-{len(state['post_calls'])}"

    monkeypatch.setattr("services.workforce_sync.fetch_qb_employees", fake_fetch)
    monkeypatch.setattr("services.workforce_sync.resolve_service_item", fake_resolve)
    monkeypatch.setattr("services.workforce_sync.post_time_activity", fake_post)

    return state


# ============================================================
# 1. current_work_week_window
# ============================================================


@pytest.mark.parametrize(
    ("today", "expected_mon", "expected_fri"),
    [
        # Day-of-week sweep within one calendar week.
        (date(2024, 1, 8), date(2024, 1, 8), date(2024, 1, 12)),  # Mon
        (date(2024, 1, 9), date(2024, 1, 8), date(2024, 1, 12)),  # Tue
        (date(2024, 1, 10), date(2024, 1, 8), date(2024, 1, 12)),  # Wed
        (date(2024, 1, 11), date(2024, 1, 8), date(2024, 1, 12)),  # Thu
        (date(2024, 1, 12), date(2024, 1, 8), date(2024, 1, 12)),  # Fri
        (date(2024, 1, 13), date(2024, 1, 8), date(2024, 1, 12)),  # Sat
        (date(2024, 1, 14), date(2024, 1, 8), date(2024, 1, 12)),  # Sun
        # Year boundary — Sat 2025-01-04 falls in calendar week of Mon 2024-12-30.
        (date(2025, 1, 4), date(2024, 12, 30), date(2025, 1, 3)),
        # Leap-year boundary — Sat 2024-03-02 → previous Mon 2024-02-26.
        (date(2024, 3, 2), date(2024, 2, 26), date(2024, 3, 1)),
    ],
)
def test_window_resolves_to_calendar_week_mon_fri(today, expected_mon, expected_fri):
    from services.workforce_sync import current_work_week_window

    mon, fri = current_work_week_window(today)
    assert mon == expected_mon
    assert fri == expected_fri
    assert (fri - mon).days == 4


def test_window_defaults_to_date_today(monkeypatch):
    """Default `today=None` reads `date.today()` — patch it and re-verify."""
    import services.workforce_sync as ws

    class _FrozenDate(date):
        @classmethod
        def today(cls):
            return SAT

    monkeypatch.setattr(ws, "date", _FrozenDate)
    mon, fri = ws.current_work_week_window()
    assert mon == WINDOW_MONDAY
    assert fri == WINDOW_FRIDAY


# ============================================================
# 2. build_description
# ============================================================


def test_build_description_uses_key_title_and_user_text(db):
    from services.workforce_sync import build_description

    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id, key="ACME-99", title="Refactor auth")
    entry = _make_te(db, wi, dev.id, description="cleaned up tests")
    db.refresh(entry)
    # Reload with relationships so build_description can read wi.key/title.
    from models.time_entry import TimeEntry

    entry = db.query(TimeEntry).get(entry.id)
    assert build_description(entry) == "[ACME-99] Refactor auth — cleaned up tests"


def test_build_description_without_user_text(db):
    from models.time_entry import TimeEntry
    from services.workforce_sync import build_description

    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id, key="ACME-5", title="Spike")
    entry = _make_te(db, wi, dev.id, description=None)
    entry = db.query(TimeEntry).get(entry.id)
    assert build_description(entry) == "[ACME-5] Spike"


def test_build_description_truncates_to_1000_chars(db):
    from models.time_entry import TimeEntry
    from services.workforce_sync import build_description

    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id, key="ACME-T", title="t")
    # Long description guarantees we cross the 1000-char ceiling.
    entry = _make_te(db, wi, dev.id, description="x" * 2000)
    entry = db.query(TimeEntry).get(entry.id)
    out = build_description(entry)
    assert len(out) == 1000
    assert out.startswith("[ACME-T] t — x")


# ============================================================
# 3. run_workforce_sync — gating / preflight
# ============================================================


def test_returns_not_connected_when_no_integration(db, qb_doubles):
    from services.workforce_sync import run_workforce_sync

    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "not_connected"
    assert result["synced"] == 0
    assert result["window_start"] == WINDOW_MONDAY.isoformat()
    assert result["window_end"] == WINDOW_FRIDAY.isoformat()
    # No QB calls should have been made.
    assert qb_doubles["post_calls"] == []


def test_returns_no_eligible_when_no_time_entries(db, qb_doubles):
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "no_eligible"
    assert qb_doubles["post_calls"] == []


def test_entries_on_unlinked_projects_are_ignored(db, qb_doubles):
    """Project.workforce_client_id is null → its entries are never eligible."""
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db, workforce_client_id=None, workforce_client_name=None)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id)
    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "no_eligible"
    assert qb_doubles["post_calls"] == []


def test_entries_outside_window_are_ignored(db, qb_doubles):
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id)
    # One entry the week before the window, one the week after — neither
    # should be picked up by the Sat 2024-01-13 run.
    _make_te(
        db,
        wi,
        dev.id,
        hours=3,
        logged_at=datetime(2024, 1, 1, 10, 0),  # prior week's Monday
    )
    _make_te(
        db,
        wi,
        dev.id,
        hours=3,
        logged_at=datetime(2024, 1, 15, 10, 0),  # next week's Monday
    )
    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "no_eligible"
    assert qb_doubles["post_calls"] == []


def test_already_synced_entries_are_skipped(db, qb_doubles):
    """workforce_entry_id IS NOT NULL → entry is not re-pushed."""
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, workforce_entry_id="QB-PREV-1")
    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "no_eligible"
    assert qb_doubles["post_calls"] == []


# ============================================================
# 4. run_workforce_sync — happy path & write-back
# ============================================================


def test_happy_path_pushes_and_marks_entries_synced(db, qb_doubles):
    from services.workforce_sync import run_workforce_sync

    integration = _make_integration(db)
    project = _make_project(db)
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    bob = _make_dev(db, "Bob", "bob@arsenal.test")
    wi = _make_wi(db, project.id, alice.id, key="ACME-1", title="Build")
    e1 = _make_te(
        db,
        wi,
        alice.id,
        hours=3,
        logged_at=datetime(2024, 1, 9, 10, 0),
        description="part 1",
    )
    e2 = _make_te(
        db,
        wi,
        bob.id,
        hours=5,
        logged_at=datetime(2024, 1, 10, 14, 0),
        description="part 2",
    )

    result = run_workforce_sync(db, today=SAT, triggered_by="manual")

    assert result["status"] == "ok"
    assert result["synced"] == 2
    assert result["failed"] == 0
    assert result["skipped"] == 0

    # Each entry now carries a QB id and the QB call was shaped correctly.
    db.refresh(e1)
    db.refresh(e2)
    assert e1.workforce_entry_id is not None
    assert e2.workforce_entry_id is not None
    assert {c["employee_qb_id"] for c in qb_doubles["post_calls"]} == {"EMP-1", "EMP-2"}
    assert all(c["customer_qb_id"] == "QB-CUST-1" for c in qb_doubles["post_calls"])
    assert all(c["service_item_id"] == "QB-ITEM-7" for c in qb_doubles["post_calls"])
    assert {c["hours"] for c in qb_doubles["post_calls"]} == {3, 5}
    # Description carries the work item key.
    assert all("[ACME-1] Build" in c["description"] for c in qb_doubles["post_calls"])

    # Observability fields on the integration row updated.
    db.refresh(integration)
    assert integration.last_sync_status == "ok"
    assert integration.last_sync_at is not None
    assert integration.last_synced_count == 2
    assert integration.last_failed_count == 0
    assert integration.last_sync_error is None


def test_running_twice_pushes_each_entry_only_once(db, qb_doubles):
    """Idempotency: a second run on the same data is a no-op."""
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    first = run_workforce_sync(db, today=SAT)
    assert first["status"] == "ok"
    assert first["synced"] == 1
    assert len(qb_doubles["post_calls"]) == 1

    second = run_workforce_sync(db, today=SAT)
    assert second["status"] == "no_eligible"
    # No additional QB calls on the second run.
    assert len(qb_doubles["post_calls"]) == 1


def test_batch_cap_limits_pushes_per_run(db, qb_doubles):
    """Only `batch_cap` entries are processed per invocation."""
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id, dev.id)
    for i in range(5):
        _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, i))

    result = run_workforce_sync(db, today=SAT, batch_cap=2)
    assert result["synced"] == 2
    assert len(qb_doubles["post_calls"]) == 2
    # Next run picks up the remaining three.
    again = run_workforce_sync(db, today=SAT, batch_cap=10)
    assert again["synced"] == 3
    assert len(qb_doubles["post_calls"]) == 5


# ============================================================
# 5. run_workforce_sync — skip paths
# ============================================================


def test_unmatched_email_skips_entry(db, qb_doubles):
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    stranger = _make_dev(db, "Stranger", "stranger@elsewhere.test")
    wi = _make_wi(db, project.id, stranger.id)
    _make_te(db, wi, stranger.id, logged_at=datetime(2024, 1, 9, 10, 0))

    result = run_workforce_sync(db, today=SAT)
    assert result["skipped"] == 1
    assert result["synced"] == 0
    # No QB write attempted.
    assert qb_doubles["post_calls"] == []
    # Status calls this out via reason — match case-insensitively
    # because the user-facing literal is "Skipped (no matching QuickBooks
    # employee): …".
    assert "skipped" in (result.get("reason") or "").lower()
    assert "stranger@elsewhere.test" in (result.get("reason") or "")


def test_empty_email_skips_entry(db, qb_doubles):
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    dev = _make_dev(db, "No email", email="")
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    result = run_workforce_sync(db, today=SAT)
    assert result["skipped"] == 1
    assert qb_doubles["post_calls"] == []
    # Placeholder label was rewritten to be human-readable.
    assert "no email" in (result.get("reason") or "").lower()


def test_email_lookup_is_case_insensitive(db, qb_doubles):
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    # Mixed-case email on the Arsenal side; lowercase in the QB map.
    dev = _make_dev(db, "Alice", email="Alice@Arsenal.Test")
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    result = run_workforce_sync(db, today=SAT)
    assert result["synced"] == 1
    assert result["skipped"] == 0


# ============================================================
# 6. run_workforce_sync — error & partial paths
# ============================================================


def test_per_entry_qb_error_yields_partial(db, qb_doubles):
    from services.workforce_qb_client import QBApiError
    from services.workforce_sync import run_workforce_sync

    integration = _make_integration(db)
    project = _make_project(db)
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    bob = _make_dev(db, "Bob", "bob@arsenal.test")
    wi = _make_wi(db, project.id, alice.id)
    _make_te(db, wi, alice.id, logged_at=datetime(2024, 1, 9, 10, 0))
    _make_te(db, wi, bob.id, logged_at=datetime(2024, 1, 10, 10, 0))

    # First call fails with QBApiError, second succeeds.
    qb_doubles["post_outcomes"] = [QBApiError("nope", status_code=400), "QB-TA-OK"]

    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "partial"
    assert result["synced"] == 1
    assert result["failed"] == 1

    db.refresh(integration)
    assert integration.last_sync_status == "partial"
    assert integration.last_synced_count == 1
    assert integration.last_failed_count == 1
    assert integration.last_sync_error  # non-empty


def test_rate_limit_stops_run_and_marks_partial(db, qb_doubles):
    from services.workforce_qb_client import QBRateLimitError
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    bob = _make_dev(db, "Bob", "bob@arsenal.test")
    wi = _make_wi(db, project.id, alice.id)
    _make_te(db, wi, alice.id, logged_at=datetime(2024, 1, 9, 10, 0))
    _make_te(db, wi, bob.id, logged_at=datetime(2024, 1, 10, 10, 0))

    # First push succeeds, second hits rate limit. Anything after should
    # NOT be attempted — only two entries exist, so we verify by post-call count.
    qb_doubles["post_outcomes"] = ["QB-TA-1", QBRateLimitError("429")]

    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "partial"
    assert result["synced"] == 1
    # Rate-limited entry not counted as failed (it's untried, queued for next run).
    assert result["failed"] == 0
    # Reason is now executive-readable; "rate limit" is the user-facing phrase.
    assert "rate limit" in (result.get("reason") or "").lower()
    # Exactly two attempts — the second raised, no third call queued.
    assert len(qb_doubles["post_calls"]) == 2


def test_oauth_error_mid_run_short_circuits_with_error_status(db, qb_doubles):
    from services.workforce_oauth import WorkforceOAuthError
    from services.workforce_sync import run_workforce_sync

    integration = _make_integration(db)
    project = _make_project(db)
    alice = _make_dev(db, "Alice", "alice@arsenal.test")
    bob = _make_dev(db, "Bob", "bob@arsenal.test")
    wi = _make_wi(db, project.id, alice.id)
    _make_te(db, wi, alice.id, logged_at=datetime(2024, 1, 9, 10, 0))
    _make_te(db, wi, bob.id, logged_at=datetime(2024, 1, 10, 10, 0))

    qb_doubles["post_outcomes"] = ["QB-TA-1", WorkforceOAuthError("refresh denied")]

    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "error"
    assert result["synced"] == 1  # the first one DID commit before OAuth blew up
    assert "refresh denied" in (result.get("reason") or "")

    db.refresh(integration)
    assert integration.last_sync_status == "error"
    assert integration.last_synced_count == 1


def test_service_item_missing_aborts_with_error(db, qb_doubles):
    """resolve_service_item returning None → run aborts, nothing pushed."""
    from services.workforce_sync import run_workforce_sync

    # Integration with NO cached service_item_id — sync must lazy-resolve.
    _make_integration(db, service_item_id=None, service_item_name=None)
    project = _make_project(db)
    dev = _make_dev(db, "Alice", "alice@arsenal.test")
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    qb_doubles["service_item"] = None  # not found in QB

    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "error"
    assert qb_doubles["post_calls"] == []
    assert "Hours" in (result.get("reason") or "")


def test_resolve_service_item_api_error_aborts(db, qb_doubles):
    from services.workforce_qb_client import QBApiError
    from services.workforce_sync import run_workforce_sync

    _make_integration(db, service_item_id=None, service_item_name=None)
    project = _make_project(db)
    dev = _make_dev(db, "Alice", "alice@arsenal.test")
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    qb_doubles["resolve_item_raises"] = QBApiError("boom")
    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "error"
    # Reason wraps the QBApiError in a user-readable lead-in.
    reason = result.get("reason") or ""
    assert "service item" in reason.lower()
    assert "boom" in reason


def test_fetch_employees_error_aborts(db, qb_doubles):
    from services.workforce_qb_client import QBApiError
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    dev = _make_dev(db, "Alice", "alice@arsenal.test")
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    qb_doubles["fetch_employees_raises"] = QBApiError("boom")
    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "error"
    # Reason wraps the QBApiError in a user-readable lead-in.
    reason = result.get("reason") or ""
    assert "employee" in reason.lower()
    assert "boom" in reason
    assert qb_doubles["post_calls"] == []


def test_service_item_resolved_lazily_is_persisted(db, qb_doubles):
    """First run with null service_item resolves + saves it on the row."""
    from services.workforce_sync import run_workforce_sync

    integration = _make_integration(db, service_item_id=None, service_item_name=None)
    project = _make_project(db)
    dev = _make_dev(db, "Alice", "alice@arsenal.test")
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "ok"

    db.refresh(integration)
    assert integration.service_item_id == "QB-ITEM-7"
    assert integration.service_item_name == "Hours"


# ============================================================
# 7. run_workforce_sync — observability / triggered_by
# ============================================================


def test_triggered_by_is_logged(db, qb_doubles, caplog):
    """Both 'cron' and 'manual' run the same code path; only logs differ."""
    from services.workforce_sync import run_workforce_sync

    _make_integration(db)
    project = _make_project(db)
    dev = _make_dev(db, "Alice", "alice@arsenal.test")
    wi = _make_wi(db, project.id, dev.id)
    _make_te(db, wi, dev.id, logged_at=datetime(2024, 1, 9, 10, 0))

    with caplog.at_level(logging.INFO, logger="services.workforce_sync"):
        run_workforce_sync(db, today=SAT, triggered_by="manual")
    assert any("manual" in r.message for r in caplog.records)


def test_advisory_lock_is_noop_on_sqlite(db, qb_doubles):
    """SQLite has no advisory lock primitive — _try_advisory_lock must
    return None (the "no lock, but proceed" sentinel) so the sync still
    runs against the in-memory DB. The Postgres path returns a held
    Connection on success or False on contention.
    """
    from services.workforce_sync import _release_advisory_lock, _try_advisory_lock

    result = _try_advisory_lock(db)
    assert result is None
    # Release should accept the sentinel as a no-op.
    _release_advisory_lock(result)


def test_finalize_persists_counts_on_no_eligible(db, qb_doubles):
    """Even a zero-work run records `last_sync_at` so the UI can show
    a recent heartbeat. Counts reset to zero."""
    from services.workforce_sync import run_workforce_sync

    integration = _make_integration(db)
    # Seed prior counts to confirm they're overwritten — not appended.
    integration.last_synced_count = 99
    integration.last_failed_count = 7
    db.commit()

    result = run_workforce_sync(db, today=SAT)
    assert result["status"] == "no_eligible"

    db.refresh(integration)
    assert integration.last_sync_at is not None
    assert integration.last_synced_count == 0
    assert integration.last_failed_count == 0
