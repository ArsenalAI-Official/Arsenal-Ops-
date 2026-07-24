"""Tests for the Google Calendar integration endpoints + orchestrator.

Covers three surfaces without a live Google or a real mail send:

  1. services.calendar_sync.run_calendar_sync — the manual-trigger wrapper:
     config check, status classification (ok/partial/error/not_configured),
     and the in-progress guard resetting on every exit path.
  2. GET /api/admin/calendar/status — configured flag + live snapshot, RBAC.
  3. POST /api/admin/calendar/sync — background + email handoff, the
     already_running / not_configured short-circuits, RBAC.

Run with:
    cd backend && python -m pytest tests/test_calendar_integration.py -v
"""

from __future__ import annotations

from datetime import timedelta

import routers.calendar_integration as cal_router
import services.calendar_sync as calendar_sync
from models.calendar_event import CalendarEvent
from models.developer import Developer
from services.capacity_service import week_boundaries


class _FakeService:
    """Stand-in for google_calendar_service — no network."""

    def __init__(self, configured: bool = True):
        self._configured = configured

    def is_configured(self) -> bool:
        return self._configured


def _seed_internal_devs(db, n: int) -> list[Developer]:
    devs = []
    for i in range(n):
        d = Developer(name=f"Dev {i}", email=f"dev{i}@arsenalai.com", is_external=False)
        db.add(d)
        devs.append(d)
    db.commit()
    return devs


# ─────────────────── 1. run_calendar_sync orchestrator ───────────────────


def test_run_calendar_sync_not_configured(db):
    result = calendar_sync.run_calendar_sync(db, _FakeService(configured=False))
    assert result["status"] == "not_configured"
    assert result["developers"] == 0
    # Guard never latched.
    assert calendar_sync.is_sync_in_progress() is False


def test_run_calendar_sync_ok(db, monkeypatch):
    monkeypatch.setattr(
        calendar_sync,
        "sync_all_developers",
        lambda *a, **k: {"developers": 3, "inserted": 8, "updated": 22, "deleted": 0, "failed": 0},
    )
    result = calendar_sync.run_calendar_sync(db, _FakeService())
    assert result["status"] == "ok"
    assert result["developers"] == 3
    assert result["inserted"] == 8
    assert calendar_sync.is_sync_in_progress() is False  # reset after run


def test_run_calendar_sync_partial_when_some_fail(db, monkeypatch):
    monkeypatch.setattr(
        calendar_sync,
        "sync_all_developers",
        lambda *a, **k: {"developers": 2, "inserted": 1, "updated": 0, "deleted": 0, "failed": 3},
    )
    result = calendar_sync.run_calendar_sync(db, _FakeService())
    assert result["status"] == "partial"
    assert result["failed"] == 3


def test_run_calendar_sync_error_resets_guard(db, monkeypatch):
    def _boom(*a, **k):
        raise RuntimeError("google exploded")

    monkeypatch.setattr(calendar_sync, "sync_all_developers", _boom)
    result = calendar_sync.run_calendar_sync(db, _FakeService())
    assert result["status"] == "error"
    assert "google exploded" in result["reason"]
    # Critical: the guard must reset even when the run raises, or every
    # later sync would falsely report "already running".
    assert calendar_sync.is_sync_in_progress() is False


def test_run_calendar_sync_locked_when_flag_set(db, monkeypatch):
    monkeypatch.setattr(calendar_sync, "_sync_in_progress", True)
    result = calendar_sync.run_calendar_sync(db, _FakeService())
    assert result["status"] == "locked"


# ─────────────────── 2. GET /status ───────────────────


def test_status_reports_configured_and_counts(test_client, db, admin_user, monkeypatch):
    _user, token = admin_user
    _seed_internal_devs(db, 2)
    week_start, _ = week_boundaries()
    # One event inside the current capacity week counts; the rest of the
    # snapshot is derived live.
    db.add(
        CalendarEvent(
            developer_id=1,
            google_event_id="e1",
            title="Standup",
            start_at=week_start + timedelta(days=1, hours=9),
            end_at=week_start + timedelta(days=1, hours=10),
            is_all_day=False,
            response_status="accepted",
            visibility="default",
        )
    )
    db.commit()
    monkeypatch.setattr(cal_router.google_calendar_service, "is_configured", lambda: True)

    resp = test_client.get(
        "/api/admin/calendar/status", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["configured"] is True
    assert body["developer_count"] == 2
    assert body["event_count"] == 1
    assert body["window_start"]
    assert body["window_end"]


def test_status_requires_capability(test_client, dev_user):
    _user, token = dev_user
    resp = test_client.get(
        "/api/admin/calendar/status", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


# ─────────────────── 3. POST /sync ───────────────────


def test_sync_not_configured_short_circuits(test_client, admin_user, monkeypatch):
    _user, token = admin_user
    monkeypatch.setattr(cal_router.google_calendar_service, "is_configured", lambda: False)
    called = {"bg": False}
    monkeypatch.setattr(
        cal_router, "send_sync_notification", lambda *a, **k: called.__setitem__("bg", True)
    )

    resp = test_client.post(
        "/api/admin/calendar/sync", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "not_configured"
    assert called["bg"] is False  # no background work when unconfigured


def test_sync_started_runs_background_and_emails(test_client, admin_user, monkeypatch):
    user, token = admin_user
    monkeypatch.setattr(cal_router.google_calendar_service, "is_configured", lambda: True)
    monkeypatch.setattr(cal_router, "is_sync_in_progress", lambda: False)
    # Keep the background task off Google + off a real DB session.
    monkeypatch.setattr(cal_router, "SessionLocal", lambda: _DummySession())
    canned = {"status": "ok", "developers": 3, "failed": 0}
    monkeypatch.setattr(cal_router, "run_calendar_sync", lambda *a, **k: canned)
    sent: dict = {}
    monkeypatch.setattr(
        cal_router,
        "send_sync_notification",
        lambda recipients, result, **k: sent.update(recipients=recipients, result=result, kw=k),
    )

    resp = test_client.post(
        "/api/admin/calendar/sync", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "started"
    assert body["notify_email"] == user.email
    # TestClient runs BackgroundTasks after the response — the email went out
    # to the clicker with the sync result.
    assert sent["recipients"] == [user.email]
    assert sent["result"] == canned


def test_sync_already_running_skips_background(test_client, admin_user, monkeypatch):
    _user, token = admin_user
    monkeypatch.setattr(cal_router.google_calendar_service, "is_configured", lambda: True)
    monkeypatch.setattr(cal_router, "is_sync_in_progress", lambda: True)
    called = {"bg": False}
    monkeypatch.setattr(
        cal_router, "send_sync_notification", lambda *a, **k: called.__setitem__("bg", True)
    )

    resp = test_client.post(
        "/api/admin/calendar/sync", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "already_running"
    assert called["bg"] is False  # no second run scheduled


def test_sync_requires_capability(test_client, dev_user):
    _user, token = dev_user
    resp = test_client.post(
        "/api/admin/calendar/sync", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


class _DummySession:
    """Minimal SessionLocal() stand-in for the background task test."""

    def close(self):
        pass
