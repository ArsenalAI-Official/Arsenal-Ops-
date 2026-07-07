"""Unit tests for services.timesheet_service.

Covers the per-developer Review-and-Submit flow:
  - get_my_timesheet(): grouping, totals, unlinked-projects bucket,
    submitted/synced flag projection.
  - submit_my_timesheet(): eligibility filter, partial-failure retry,
    rate-limit short-circuit, no-connection / lock gating, admin
    sync interop (admin force-sync also stamps submitted_at).

Network calls into Intuit are stubbed via monkeypatch at the import
sites in services.timesheet_service (NOT at workforce_qb_client) —
mirrors the pattern in test_workforce_sync.py so the two test files
share the same mental model.
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models  # noqa: F401 — registers tables with Base.metadata
from database import Base

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# Reference Saturday — same convention as test_workforce_sync.py.
SAT = date(2024, 1, 13)
WINDOW_MONDAY = date(2024, 1, 8)
WINDOW_FRIDAY = date(2024, 1, 12)


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


# ── Domain helpers ───────────────────────────────────────────────────────


def _make_project(
    db,
    name="Acme",
    *,
    workforce_client_id: str | None = "QB-CUST-1",
    workforce_client_name: str | None = "Acme Co",
    key_prefix: str | None = None,
):
    from models.project import Project

    p = Project(
        name=name,
        description="x",
        status="active",
        key_prefix=key_prefix or name[:4].upper(),
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


def _make_te(
    db,
    wi,
    dev_id,
    hours=4,
    logged_at=None,
    workforce_entry_id=None,
    submitted_at=None,
    description=None,
):
    from models.time_entry import TimeEntry

    e = TimeEntry(
        work_item_id=wi.id,
        developer_id=dev_id,
        hours=hours,
        logged_at=logged_at
        or datetime.combine(WINDOW_MONDAY + timedelta(days=1), datetime.min.time()),
        workforce_entry_id=workforce_entry_id,
        submitted_at=submitted_at,
        description=description,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _make_integration(db, *, service_item_id="QB-ITEM-7", service_item_name="Hours"):
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


@pytest.fixture
def qb_doubles(monkeypatch):
    """Stub QB API calls at the timesheet_service import site.

    Returns a state dict tests can mutate to script outcomes.
    """
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
        billable=False,
        class_id=None,
    ):
        state["post_calls"].append(
            {
                "employee_qb_id": employee_qb_id,
                "customer_qb_id": customer_qb_id,
                "service_item_id": service_item_id,
                "hours": hours,
                "txn_date": txn_date,
                "description": description,
                "billable": billable,
                "class_id": class_id,
            }
        )
        if state["post_outcomes"] is not None:
            outcome = state["post_outcomes"].pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        return f"QB-TA-{len(state['post_calls'])}"

    monkeypatch.setattr("services.timesheet_service.fetch_qb_employees", fake_fetch)
    monkeypatch.setattr("services.timesheet_service.resolve_service_item", fake_resolve)
    monkeypatch.setattr("services.timesheet_service.post_time_activity", fake_post)
    # No QB "class" mapping in these tests — stub it so the submit path never
    # reaches the real QB client (which would need a decryptable token).
    monkeypatch.setattr("services.timesheet_service.fetch_qb_classes", lambda db, integration: {})
    return state


# ============================================================
# 1. get_my_timesheet — grouping
# ============================================================


def test_get_my_timesheet_groups_by_client_then_project(db):
    from services.timesheet_service import get_my_timesheet

    dev = _make_dev(db)
    other_dev = _make_dev(db, name="Bob", email="bob@arsenal.test")
    proj_a = _make_project(
        db, name="Acme", workforce_client_id="QB-CUST-A", workforce_client_name="Acme Co"
    )
    proj_b = _make_project(
        db, name="Globex", workforce_client_id="QB-CUST-B", workforce_client_name="Globex"
    )
    # Two work items on Acme to confirm project grouping inside client.
    wi_a1 = _make_wi(db, proj_a.id, dev.id, title="Auth")
    wi_a2 = _make_wi(db, proj_a.id, dev.id, title="Onboarding")
    wi_b = _make_wi(db, proj_b.id, dev.id, title="Pipeline")

    _make_te(db, wi_a1, dev.id, hours=4)
    _make_te(db, wi_a2, dev.id, hours=2)
    _make_te(db, wi_b, dev.id, hours=6)
    # Entry from another developer must not leak in.
    _make_te(db, wi_a1, other_dev.id, hours=8)

    result = get_my_timesheet(db, dev, today=SAT)

    assert result["week_start"] == WINDOW_MONDAY.isoformat()
    assert result["week_end"] == WINDOW_FRIDAY.isoformat()
    assert result["total_hours"] == 12  # 4 + 2 + 6 — other dev excluded
    assert result["syncable_unsubmitted_count"] == 3
    assert len(result["clients"]) == 2
    # Sorted alphabetically by client name → Acme first.
    assert result["clients"][0]["client_name"] == "Acme Co"
    assert result["clients"][0]["subtotal_hours"] == 6
    assert len(result["clients"][0]["projects"]) == 1
    assert len(result["clients"][0]["projects"][0]["entries"]) == 2
    assert result["clients"][1]["client_name"] == "Globex"
    assert result["unlinked_projects"] == []


def test_get_my_timesheet_unlinked_projects_separate(db):
    from services.timesheet_service import get_my_timesheet

    dev = _make_dev(db)
    linked = _make_project(db, name="Acme")
    unlinked = _make_project(
        db,
        name="Internal Tools",
        workforce_client_id=None,
        workforce_client_name=None,
    )
    wi_linked = _make_wi(db, linked.id, dev.id)
    wi_unlinked = _make_wi(db, unlinked.id, dev.id, key="INT-1")

    _make_te(db, wi_linked, dev.id, hours=6)
    _make_te(db, wi_unlinked, dev.id, hours=4)

    result = get_my_timesheet(db, dev, today=SAT)

    assert result["total_hours"] == 10
    # Only the linked entry counts as syncable.
    assert result["syncable_unsubmitted_count"] == 1
    assert len(result["clients"]) == 1
    assert len(result["unlinked_projects"]) == 1
    assert result["unlinked_projects"][0]["project_name"] == "Internal Tools"
    assert result["unlinked_projects"][0]["subtotal_hours"] == 4


def test_get_my_timesheet_filters_to_current_week(db):
    """Entries outside Mon-Fri of the trigger week must not appear."""
    from services.timesheet_service import get_my_timesheet

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)

    # Inside window.
    _make_te(
        db,
        wi,
        dev.id,
        hours=4,
        logged_at=datetime.combine(WINDOW_MONDAY, datetime.min.time()),
    )
    # Before window — previous week.
    _make_te(
        db,
        wi,
        dev.id,
        hours=10,
        logged_at=datetime.combine(WINDOW_MONDAY - timedelta(days=7), datetime.min.time()),
    )
    # After window — Saturday of the window's week is OUT (Mon-Fri only).
    _make_te(
        db,
        wi,
        dev.id,
        hours=10,
        logged_at=datetime.combine(WINDOW_FRIDAY + timedelta(days=1), datetime.min.time()),
    )

    result = get_my_timesheet(db, dev, today=SAT)

    assert result["total_hours"] == 4
    assert result["syncable_unsubmitted_count"] == 1


def test_get_my_timesheet_reflects_synced_and_submitted_flags(db):
    from services.timesheet_service import get_my_timesheet

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)

    # Draft.
    _make_te(db, wi, dev.id, hours=2)
    # Submitted but not synced (failed-sync retry state).
    _make_te(db, wi, dev.id, hours=3, submitted_at=datetime(2024, 1, 9, 9, 0))
    # Fully synced.
    _make_te(
        db,
        wi,
        dev.id,
        hours=5,
        submitted_at=datetime(2024, 1, 9, 10, 0),
        workforce_entry_id="QB-TA-EXISTING",
    )

    result = get_my_timesheet(db, dev, today=SAT)
    entries = result["clients"][0]["projects"][0]["entries"]
    entries_by_hours = {e["hours"]: e for e in entries}

    assert entries_by_hours[2]["synced"] is False
    assert entries_by_hours[2]["submitted_at"] is None

    assert entries_by_hours[3]["synced"] is False
    assert entries_by_hours[3]["submitted_at"] is not None

    assert entries_by_hours[5]["synced"] is True
    assert entries_by_hours[5]["submitted_at"] is not None

    # Only the draft counts toward syncable_unsubmitted_count — submitted
    # entries are still in flight (retry-able), but the dev clicked
    # already, so they're not "unsubmitted".
    assert result["syncable_unsubmitted_count"] == 1


def test_get_my_timesheet_empty_week(db):
    from services.timesheet_service import get_my_timesheet

    dev = _make_dev(db)
    result = get_my_timesheet(db, dev, today=SAT)

    assert result["total_hours"] == 0
    assert result["syncable_unsubmitted_count"] == 0
    assert result["clients"] == []
    assert result["unlinked_projects"] == []


def test_get_my_timesheet_subtotals_math(db):
    from services.timesheet_service import get_my_timesheet

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)
    _make_te(db, wi, dev.id, hours=3)
    _make_te(db, wi, dev.id, hours=1)

    result = get_my_timesheet(db, dev, today=SAT)
    assert result["total_hours"] == 8
    assert result["clients"][0]["subtotal_hours"] == 8
    assert result["clients"][0]["projects"][0]["subtotal_hours"] == 8


# ============================================================
# 2. submit_my_timesheet — happy paths & filtering
# ============================================================


def test_submit_happy_path(db, qb_doubles):
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    e1 = _make_te(db, wi, dev.id, hours=4)
    e2 = _make_te(db, wi, dev.id, hours=2)
    e3 = _make_te(db, wi, dev.id, hours=3)

    result = submit_my_timesheet(db, dev, today=SAT)

    assert result["status"] == "ok"
    assert result["submitted_count"] == 3
    assert result["synced_count"] == 3
    assert result["failed"] == []
    # All three entries got workforce_entry_id + submitted_at set.
    db.refresh(e1)
    db.refresh(e2)
    db.refresh(e3)
    for e in (e1, e2, e3):
        assert e.workforce_entry_id is not None
        assert e.submitted_at is not None


def test_submit_skips_already_synced(db, qb_doubles):
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    # Already synced — must not be re-posted.
    _make_te(
        db, wi, dev.id, hours=4, workforce_entry_id="QB-TA-OLD", submitted_at=datetime.utcnow()
    )
    _make_te(db, wi, dev.id, hours=2)  # New, eligible

    result = submit_my_timesheet(db, dev, today=SAT)

    assert result["status"] == "ok"
    assert result["submitted_count"] == 1
    assert result["synced_count"] == 1
    # Exactly one QB POST happened.
    assert len(qb_doubles["post_calls"]) == 1
    assert qb_doubles["post_calls"][0]["hours"] == 2


def test_submit_skips_unlinked_projects(db, qb_doubles):
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    linked = _make_project(db, name="Acme")
    unlinked = _make_project(db, name="Internal", workforce_client_id=None)
    wi_linked = _make_wi(db, linked.id, dev.id)
    wi_unlinked = _make_wi(db, unlinked.id, dev.id, key="INT-1")

    _make_te(db, wi_linked, dev.id, hours=4)
    e_unlinked = _make_te(db, wi_unlinked, dev.id, hours=2)

    result = submit_my_timesheet(db, dev, today=SAT)

    assert result["submitted_count"] == 1
    assert result["synced_count"] == 1
    db.refresh(e_unlinked)
    assert e_unlinked.workforce_entry_id is None
    assert e_unlinked.submitted_at is None  # Untouched


def test_submit_skips_other_devs_entries(db, qb_doubles):
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    me = _make_dev(db, name="Alice", email="alice@arsenal.test")
    other = _make_dev(db, name="Bob", email="bob@arsenal.test")
    proj = _make_project(db)
    wi_me = _make_wi(db, proj.id, me.id)
    wi_other = _make_wi(db, proj.id, other.id)
    _make_te(db, wi_me, me.id, hours=4)
    e_other = _make_te(db, wi_other, other.id, hours=8)

    result = submit_my_timesheet(db, me, today=SAT)

    assert result["submitted_count"] == 1
    assert result["synced_count"] == 1
    db.refresh(e_other)
    assert e_other.workforce_entry_id is None


def test_submit_skips_out_of_window(db, qb_doubles):
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    # Inside the Mon-Fri window.
    _make_te(db, wi, dev.id, hours=4)
    # Outside — Saturday after the window.
    _make_te(
        db,
        wi,
        dev.id,
        hours=10,
        logged_at=datetime.combine(WINDOW_FRIDAY + timedelta(days=1), datetime.min.time()),
    )

    result = submit_my_timesheet(db, dev, today=SAT)

    assert result["submitted_count"] == 1
    assert qb_doubles["post_calls"][0]["hours"] == 4


# ============================================================
# 3. submit_my_timesheet — partial failure & retry
# ============================================================


def test_submit_partial_failure_one_entry(db, qb_doubles):
    """Mid-loop QB error keeps successes; failed row stays submitted-but-unsynced."""
    from services.timesheet_service import submit_my_timesheet
    from services.workforce_qb_client import QBApiError

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    e1 = _make_te(db, wi, dev.id, hours=4)
    e2 = _make_te(db, wi, dev.id, hours=2)  # Will fail
    e3 = _make_te(db, wi, dev.id, hours=3)

    qb_doubles["post_outcomes"] = [
        "QB-TA-1",
        QBApiError("Invalid TimeActivity payload"),
        "QB-TA-3",
    ]

    result = submit_my_timesheet(db, dev, today=SAT)

    assert result["status"] == "partial"
    assert result["submitted_count"] == 3
    assert result["synced_count"] == 2
    assert len(result["failed"]) == 1
    failed = result["failed"][0]

    db.refresh(e1)
    db.refresh(e2)
    db.refresh(e3)
    assert e1.workforce_entry_id == "QB-TA-1"
    assert e1.submitted_at is not None

    # Failed entry has submitted_at SET but no QB id — exactly the retry state.
    assert failed["entry_id"] == e2.id
    assert "Invalid TimeActivity" in failed["error"]
    assert e2.workforce_entry_id is None
    assert e2.submitted_at is not None

    assert e3.workforce_entry_id == "QB-TA-3"
    assert e3.submitted_at is not None


def test_submit_retries_only_failed_entries_on_second_call(db, qb_doubles):
    """Retry path: first call fails one entry; second call only POSTs that one."""
    from services.timesheet_service import submit_my_timesheet
    from services.workforce_qb_client import QBApiError

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)
    e_fail = _make_te(db, wi, dev.id, hours=2)
    _make_te(db, wi, dev.id, hours=3)

    qb_doubles["post_outcomes"] = ["QB-TA-1", QBApiError("transient"), "QB-TA-3"]
    result1 = submit_my_timesheet(db, dev, today=SAT)
    assert result1["status"] == "partial"
    first_call_count = len(qb_doubles["post_calls"])
    assert first_call_count == 3

    # Second call — only the previously-failed entry is eligible.
    qb_doubles["post_outcomes"] = None  # All subsequent calls succeed.
    result2 = submit_my_timesheet(db, dev, today=SAT)
    assert result2["status"] == "ok"
    assert result2["submitted_count"] == 1
    assert result2["synced_count"] == 1

    # Exactly one new QB POST since the first call.
    assert len(qb_doubles["post_calls"]) == first_call_count + 1
    assert qb_doubles["post_calls"][-1]["hours"] == 2

    db.refresh(e_fail)
    assert e_fail.workforce_entry_id is not None


def test_submit_rate_limit_short_circuits_remainder(db, qb_doubles):
    """Hitting a 429 stops further POSTs; unattempted entries flagged in `failed`."""
    from services.timesheet_service import submit_my_timesheet
    from services.workforce_qb_client import QBRateLimitError

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)
    _make_te(db, wi, dev.id, hours=2)
    _make_te(db, wi, dev.id, hours=3)

    qb_doubles["post_outcomes"] = [
        "QB-TA-1",
        QBRateLimitError("Too many requests"),
        "WOULD-NOT-REACH",
    ]
    result = submit_my_timesheet(db, dev, today=SAT)

    assert result["status"] == "partial"
    assert result["synced_count"] == 1
    # Two failed: the rate-limited one + the one we never tried.
    assert len(result["failed"]) == 2
    assert all("rate-limited" in f["error"].lower() for f in result["failed"])
    # Confirm we stopped after the second POST (didn't hit "WOULD-NOT-REACH").
    assert len(qb_doubles["post_calls"]) == 2


# ============================================================
# 4. submit_my_timesheet — operational gating
# ============================================================


def test_submit_returns_not_connected_without_integration(db, qb_doubles):
    from services.timesheet_service import submit_my_timesheet

    dev = _make_dev(db)
    result = submit_my_timesheet(db, dev, today=SAT)
    assert result["status"] == "not_connected"
    assert "QuickBooks isn't connected" in result["reason"]
    assert result["synced_count"] == 0


def test_submit_returns_error_when_dev_email_missing_from_qb(db, qb_doubles):
    """Dev's email must match a QB employee id, else surface a helpful error."""
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    qb_doubles["employees"] = {"someone-else@arsenal.test": "EMP-X"}
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)

    result = submit_my_timesheet(db, dev, today=SAT)
    assert result["status"] == "error"
    assert "No QuickBooks employee" in result["reason"]


def test_submit_with_no_eligible_entries_returns_ok_with_zero_counts(db, qb_doubles):
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    # Pre-synced — nothing to submit.
    _make_te(
        db, wi, dev.id, hours=4, workforce_entry_id="QB-TA-OLD", submitted_at=datetime.utcnow()
    )

    result = submit_my_timesheet(db, dev, today=SAT)
    assert result["status"] == "ok"
    assert result["submitted_count"] == 0
    assert result["synced_count"] == 0
    assert "No new hours" in result["reason"]


# ============================================================
# 5. Service Item & description format
# ============================================================


def test_submit_uses_hours_service_item(db, qb_doubles):
    """Hardcoded 'Hours' service item — HR rule. Must pass the integration's
    service_item_id, which our doubles set to 'QB-ITEM-7'."""
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)

    submit_my_timesheet(db, dev, today=SAT)
    assert qb_doubles["post_calls"][0]["service_item_id"] == "QB-ITEM-7"


def test_submit_passes_built_description(db, qb_doubles):
    """build_description format flows through into the QB POST payload."""
    from services.timesheet_service import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db, key_prefix="ACME")
    wi = _make_wi(db, proj.id, dev.id, key="ACME-42", title="Logout flow")
    _make_te(db, wi, dev.id, hours=4, description="fixed redirect")

    submit_my_timesheet(db, dev, today=SAT)
    assert qb_doubles["post_calls"][0]["description"] == "[ACME-42] Logout flow — fixed redirect"


# ============================================================
# 6. Admin force-sync interop — stamps submitted_at
# ============================================================


def test_admin_force_sync_stamps_submitted_at_on_unsubmitted_entries(db, monkeypatch):
    """Admin force-sync now sets submitted_at on entries the dev never submitted.

    Keeps the (submitted_at, workforce_entry_id) state machine consistent
    between dev-submit and admin-force-sync paths.
    """
    from services.workforce_sync import run_workforce_sync

    # Mock the QB calls at the workforce_sync import site (mirrors
    # test_workforce_sync.py's pattern).
    state: dict[str, Any] = {
        "employees": {"alice@arsenal.test": "EMP-1"},
        "service_item": {"id": "QB-ITEM-7", "name": "Hours"},
        "post_calls": [],
    }

    def fake_fetch(db, integration):
        return dict(state["employees"])

    def fake_resolve(db, integration, *, name="Hours"):
        return state["service_item"]

    def fake_post(db, integration, **kwargs):
        state["post_calls"].append(kwargs)
        return f"QB-TA-{len(state['post_calls'])}"

    monkeypatch.setattr("services.workforce_sync.fetch_qb_employees", fake_fetch)
    monkeypatch.setattr("services.workforce_sync.resolve_service_item", fake_resolve)
    monkeypatch.setattr("services.workforce_sync.post_time_activity", fake_post)
    monkeypatch.setattr("services.workforce_sync.fetch_qb_classes", lambda db, integration: {})
    monkeypatch.setattr("services.workforce_sync.refresh_clients_quietly", lambda db, integ: None)

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    # Two unsubmitted entries.
    e1 = _make_te(db, wi, dev.id, hours=4)
    e2 = _make_te(db, wi, dev.id, hours=2)

    result = run_workforce_sync(db, triggered_by="manual", today=SAT)

    assert result["status"] == "ok"
    db.refresh(e1)
    db.refresh(e2)
    # Both got workforce_entry_id AND submitted_at — even though the dev
    # never clicked Submit.
    assert e1.workforce_entry_id is not None
    assert e1.submitted_at is not None
    assert e2.workforce_entry_id is not None
    assert e2.submitted_at is not None


def test_admin_force_sync_preserves_existing_submitted_at(db, monkeypatch):
    """Admin force-sync must not overwrite a dev's earlier submitted_at."""
    from services.workforce_sync import run_workforce_sync

    state: dict[str, Any] = {
        "employees": {"alice@arsenal.test": "EMP-1"},
        "service_item": {"id": "QB-ITEM-7", "name": "Hours"},
        "post_calls": [],
    }

    def fake_fetch(db, integration):
        return dict(state["employees"])

    def fake_resolve(db, integration, *, name="Hours"):
        return state["service_item"]

    def fake_post(db, integration, **kwargs):
        state["post_calls"].append(kwargs)
        return f"QB-TA-{len(state['post_calls'])}"

    monkeypatch.setattr("services.workforce_sync.fetch_qb_employees", fake_fetch)
    monkeypatch.setattr("services.workforce_sync.resolve_service_item", fake_resolve)
    monkeypatch.setattr("services.workforce_sync.post_time_activity", fake_post)
    monkeypatch.setattr("services.workforce_sync.fetch_qb_classes", lambda db, integration: {})
    monkeypatch.setattr("services.workforce_sync.refresh_clients_quietly", lambda db, integ: None)

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    original_submit_time = datetime(2024, 1, 9, 9, 0, 0)
    e = _make_te(db, wi, dev.id, hours=4, submitted_at=original_submit_time)

    run_workforce_sync(db, triggered_by="manual", today=SAT)

    db.refresh(e)
    assert e.workforce_entry_id is not None
    # Original timestamp preserved — the dev's audit trail is intact.
    assert e.submitted_at == original_submit_time
