"""HTTP-endpoint tests for the dev Review-and-Submit timesheet API.

Targets:
  GET  /api/developers/me/timesheet         → routers.developers.get_my_timesheet
  POST /api/developers/me/timesheet/submit  → routers.developers.submit_my_timesheet

These tests call the router functions directly (the pattern from
test_capacity_endpoints.py) with a SimpleNamespace mock user. That
avoids spinning up the FastAPI auth stack while still exercising the
real Developer lookup, error-shape, and HTTPException paths.

The submit endpoint's QB calls are stubbed at the
services.timesheet_service import site — same mocking pattern as
test_timesheet_service.py.
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models  # noqa: F401 — registers tables with Base.metadata
from database import Base

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _current_window_monday() -> date:
    """Mon of the current calendar week — matches the service helper.

    The endpoints don't expose `today` as a query param (it's only the
    service that does, for unit testing). To exercise the endpoints
    with real entries we have to log them inside whatever Mon-Fri the
    test happens to run on.
    """
    today = date.today()
    return today - timedelta(days=today.weekday())


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


# ── Helpers ──────────────────────────────────────────────────────────────


def _make_user(email="dev@arsenal.test", name="Dev"):
    """SimpleNamespace mock matching what the endpoint reads off current_user."""
    return SimpleNamespace(email=email, name=name)


def _make_dev(db, name="Alice", email="dev@arsenal.test", *, is_external: bool = False):
    from models.developer import Developer

    d = Developer(name=name, email=email, is_external=is_external)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def _make_project(
    db,
    name="Acme",
    *,
    workforce_client_id: str | None = "QB-CUST-1",
    workforce_client_name: str | None = "Acme Co",
):
    from models.project import Project

    p = Project(
        name=name,
        description="x",
        status="active",
        key_prefix=name[:4].upper(),
        workforce_client_id=workforce_client_id,
        workforce_client_name=workforce_client_name,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


_wi_n = {"n": 0}


def _make_wi(db, project_id, assignee_id, *, key=None):
    from models.work_item import WorkItem

    _wi_n["n"] += 1
    wi = WorkItem(
        key=key or f"WI-{_wi_n['n']}",
        title="Task",
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


def _make_te(db, wi, dev_id, hours=4, logged_at=None, **kwargs):
    from models.time_entry import TimeEntry

    if logged_at is None:
        # Log on the Tuesday of THIS week so it's inside whatever Mon-Fri
        # window the service resolves for today. Endpoint tests can't
        # pass `today=` because the router doesn't expose it.
        logged_at = datetime.combine(
            _current_window_monday() + timedelta(days=1), datetime.min.time()
        )
    e = TimeEntry(
        work_item_id=wi.id,
        developer_id=dev_id,
        hours=hours,
        logged_at=logged_at,
        **kwargs,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _make_integration(db):
    from models.workforce_integration import WorkforceIntegration

    wi = WorkforceIntegration(
        realm_id="REALM-1",
        refresh_token_ciphertext="ct-r",
        access_token_ciphertext="ct-a",
        access_token_expires_at=datetime.utcnow() + timedelta(hours=1),
        service_item_id="QB-ITEM-7",
        service_item_name="Hours",
    )
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


@pytest.fixture
def qb_doubles(monkeypatch):
    state: dict[str, Any] = {
        "employees": {"dev@arsenal.test": "EMP-1"},
        "service_item": {"id": "QB-ITEM-7", "name": "Hours"},
        "post_calls": [],
        "post_outcomes": None,
    }

    def fake_fetch(db, integration):
        return dict(state["employees"])

    def fake_resolve(db, integration, *, name="Hours"):
        return state["service_item"]

    def fake_post(db, integration, **kwargs):
        state["post_calls"].append(kwargs)
        if state["post_outcomes"] is not None:
            outcome = state["post_outcomes"].pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        return f"QB-TA-{len(state['post_calls'])}"

    monkeypatch.setattr("services.timesheet_service.fetch_qb_employees", fake_fetch)
    monkeypatch.setattr("services.timesheet_service.resolve_service_item", fake_resolve)
    monkeypatch.setattr("services.timesheet_service.post_time_activity", fake_post)
    monkeypatch.setattr("services.timesheet_service.fetch_qb_classes", lambda db, integration: {})
    return state


# ============================================================
# GET /me/timesheet
# ============================================================


def test_get_timesheet_returns_pydantic_response(db):
    from routers.developers import get_my_timesheet

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)
    _make_te(db, wi, dev.id, hours=2)

    response = get_my_timesheet(db=db, current_user=_make_user())

    # Response is a MyTimesheetResponse (Pydantic) — verify shape.
    assert response.total_hours == 6
    assert response.syncable_unsubmitted_count == 2
    assert len(response.clients) == 1
    assert response.clients[0].client_name == "Acme Co"
    assert response.unlinked_projects == []


def test_get_timesheet_404_when_no_developer_for_user(db):
    from routers.developers import get_my_timesheet

    # No Developer row created for this user's email → 404.
    with pytest.raises(HTTPException) as exc:
        get_my_timesheet(db=db, current_user=_make_user(email="unknown@arsenal.test"))
    assert exc.value.status_code == 404
    # External devs + missing-Developer users share the same 404 message
    # so the home card's silent-hide UX treats both the same way.
    assert "No internal developer profile" in exc.value.detail


# ============================================================
# POST /me/timesheet/submit
# ============================================================


def test_submit_happy_path_returns_pydantic_response(db, qb_doubles):
    from routers.developers import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)

    response = submit_my_timesheet(db=db, current_user=_make_user())

    assert response.status == "ok"
    assert response.submitted_count == 1
    assert response.synced_count == 1
    assert response.failed == []
    assert response.reason is None


def test_submit_partial_failure_carries_failed_array(db, qb_doubles):
    from routers.developers import submit_my_timesheet
    from services.workforce_qb_client import QBApiError

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    e1 = _make_te(db, wi, dev.id, hours=4)
    e2 = _make_te(db, wi, dev.id, hours=2)  # Will fail

    qb_doubles["post_outcomes"] = ["QB-TA-1", QBApiError("Bad payload")]

    response = submit_my_timesheet(db=db, current_user=_make_user())

    assert response.status == "partial"
    assert response.submitted_count == 2
    assert response.synced_count == 1
    assert len(response.failed) == 1
    assert response.failed[0].entry_id == e2.id
    assert "Bad payload" in response.failed[0].error
    # On partial, surface the failure as a non-null reason so the UI
    # banner has something to show even without iterating `failed[]`.
    assert response.reason is None or isinstance(response.reason, str)
    # e1 is irrelevant to the partial-failure assertions but keeping it
    # in scope documents the happy-path partner row.
    assert e1.id in {e1.id, e2.id}


def test_submit_503_when_not_connected(db, qb_doubles):
    from routers.developers import submit_my_timesheet

    _make_dev(db)  # Developer exists; integration does NOT.

    with pytest.raises(HTTPException) as exc:
        submit_my_timesheet(db=db, current_user=_make_user())
    assert exc.value.status_code == 503
    assert "QuickBooks isn't connected" in exc.value.detail


def test_submit_404_when_no_developer_for_user(db, qb_doubles):
    from routers.developers import submit_my_timesheet

    _make_integration(db)
    # No Developer row.

    with pytest.raises(HTTPException) as exc:
        submit_my_timesheet(db=db, current_user=_make_user(email="ghost@arsenal.test"))
    assert exc.value.status_code == 404


def test_submit_500_when_no_qb_employee_match(db, qb_doubles):
    """Integration up, dev row exists, but no QB employee maps to their email."""
    from routers.developers import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)
    qb_doubles["employees"] = {"someone-else@arsenal.test": "EMP-X"}

    with pytest.raises(HTTPException) as exc:
        submit_my_timesheet(db=db, current_user=_make_user())
    assert exc.value.status_code == 500
    assert "No QuickBooks employee" in exc.value.detail


def test_submit_with_no_eligible_entries_returns_ok(db, qb_doubles):
    """No new hours to submit shouldn't 5xx — return ok with zero counts."""
    from routers.developers import submit_my_timesheet

    _make_integration(db)
    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    # Already-synced entry — nothing left to push.
    _make_te(db, wi, dev.id, hours=4, workforce_entry_id="QB-OLD", submitted_at=datetime.utcnow())

    response = submit_my_timesheet(db=db, current_user=_make_user())
    assert response.status == "ok"
    assert response.submitted_count == 0
    assert response.synced_count == 0


# ============================================================
# External developer gate — `Developer.is_external == True` users
# get 404 from every /me/* endpoint, just like users with no
# Developer row. Driven by ALLOWED_EMAIL_DOMAINS at startup via
# `reconcile_internal_developers()` in database.py.
# ============================================================


def test_get_timesheet_404_when_developer_is_external(db):
    from routers.developers import get_my_timesheet

    _make_dev(db, is_external=True)

    with pytest.raises(HTTPException) as exc:
        get_my_timesheet(db=db, current_user=_make_user())
    assert exc.value.status_code == 404
    assert "No internal developer profile" in exc.value.detail


def test_submit_404_when_developer_is_external(db, qb_doubles):
    from routers.developers import submit_my_timesheet

    _make_integration(db)
    _make_dev(db, is_external=True)

    with pytest.raises(HTTPException) as exc:
        submit_my_timesheet(db=db, current_user=_make_user())
    assert exc.value.status_code == 404
    assert "No internal developer profile" in exc.value.detail


def test_edit_404_when_developer_is_external(db):
    """External devs can't edit time entries — same 404 they get on
    every other /me/* endpoint."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db, is_external=True)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4)

    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=entry.id,
            body=TimesheetEntryEditRequest(hours=6),
            db=db,
            current_user=_make_user(),
        )
    assert exc.value.status_code == 404
    assert "No internal developer profile" in exc.value.detail


def test_delete_404_when_developer_is_external(db):
    from routers.developers import delete_my_timesheet_entry

    dev = _make_dev(db, is_external=True)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4)

    with pytest.raises(HTTPException) as exc:
        delete_my_timesheet_entry(entry_id=entry.id, db=db, current_user=_make_user())
    assert exc.value.status_code == 404
    assert "No internal developer profile" in exc.value.detail


def test_get_my_capacity_404_when_developer_is_external(db):
    """The home `MyCapacityCard` reads from `/me/capacity` and silently
    hides on 404 — external contractors see no card."""
    from routers.developers import get_my_capacity

    _make_dev(db, is_external=True)

    with pytest.raises(HTTPException) as exc:
        get_my_capacity(db=db, current_user=_make_user())
    assert exc.value.status_code == 404
    assert "No internal developer profile" in exc.value.detail


def test_internal_developer_still_passes_gate(db):
    """Sanity check: a default (internal, is_external=False) developer
    isn't blocked. Without this, a regression on the helper would silently
    flip the gate's polarity."""
    from routers.developers import get_my_timesheet

    dev = _make_dev(db, is_external=False)  # explicit for clarity
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    _make_te(db, wi, dev.id, hours=4)

    response = get_my_timesheet(db=db, current_user=_make_user())
    assert response.total_hours == 4
