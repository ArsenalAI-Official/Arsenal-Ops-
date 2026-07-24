"""Google Calendar integration HTTP endpoints (Admin → Integrations).

Unlike QuickBooks, there is NO connect/disconnect flow: calendar access is a
domain-wide-delegation service account configured once via env
(GOOGLE_CALENDAR_SA_JSON / _FILE), the same single-org-credential pattern
email uses. So this router exposes just:

  - GET  /api/admin/calendar/status  — is it configured + a health snapshot
    (developer count, current capacity-week event count, window).
  - POST /api/admin/calendar/sync    — kick a manual sync in the background
    and email the clicker the result, mirroring the QuickBooks "Sync now".

Both require `admin.workforce_connect` — the same capability that gates the
Integrations tab itself, so the whole tab stays under one grant.
"""

from __future__ import annotations

import logging
import sys

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

sys.path.append("..")
from database import SessionLocal, get_db
from models.calendar_event import CalendarEvent
from models.developer import Developer
from routers.auth import require_capability
from services.calendar_sync import is_sync_in_progress, run_calendar_sync
from services.calendar_sync_notify import send_sync_notification
from services.capacity_service import week_boundaries
from services.google_calendar_service import google_calendar_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/calendar", tags=["calendar-integration"])


class CalendarStatusResponse(BaseModel):
    """Health snapshot for the Google Calendar card.

    `configured` mirrors `google_calendar_service.is_configured()`; when it's
    False the UI disables "Sync now" and the sync endpoint 200s with a
    not_configured result rather than doing work. Counts are derived live —
    there's no persisted last-sync row (v1), so last-run detail rides on the
    sync response / email instead.
    """

    configured: bool
    sync_in_progress: bool
    developer_count: int
    event_count: int
    window_start: str
    window_end: str


class CalendarSyncResponse(BaseModel):
    """Returned immediately from POST /sync.

    The sync runs in a FastAPI BackgroundTask after the response is sent; the
    clicker gets a result email when it finishes (counts aren't known yet, and
    hitting Google per developer can take long enough that holding the request
    open is poor UX).

    States:
      - started         → a background task was scheduled; email to follow.
      - already_running → a sync is in progress (double-click, or the weekly
                          ride-along mid-run). No task scheduled, no email.
      - not_configured  → no service account; nothing to run.
    """

    status: str  # "started" | "already_running" | "not_configured"
    message: str
    notify_email: str | None = None


def _internal_developer_count(db: Session) -> int:
    """Developers the sync will touch — internal, with an email (matches
    `sync_all_developers`'s selection exactly)."""
    return (
        db.query(Developer)
        .filter(Developer.is_external.is_(False), Developer.email.isnot(None))
        .count()
    )


@router.get("/status", response_model=CalendarStatusResponse)
def calendar_status(
    _user=Depends(require_capability("admin.workforce_connect")),
    db: Session = Depends(get_db),
):
    """Report whether the calendar integration is configured + a live snapshot."""
    week_start, week_end = week_boundaries()
    event_count = (
        db.query(CalendarEvent)
        .filter(CalendarEvent.start_at >= week_start, CalendarEvent.start_at <= week_end)
        .count()
    )
    return CalendarStatusResponse(
        configured=google_calendar_service.is_configured(),
        sync_in_progress=is_sync_in_progress(),
        developer_count=_internal_developer_count(db),
        event_count=event_count,
        window_start=week_start.date().isoformat(),
        window_end=week_end.date().isoformat(),
    )


def _run_calendar_sync_and_email(triggered_by_email: str | None, triggered_by_label: str) -> None:
    """Background task: run the sync on a fresh session, then email the result.

    Opens its own `SessionLocal` because the request's session (from
    `get_db`) is already closed by the time BackgroundTasks run. Never
    raises — a sync/email failure is logged, not propagated (there's no
    request left to fail).
    """
    db = SessionLocal()
    try:
        result = run_calendar_sync(db, triggered_by="manual")
    except Exception:
        logger.exception("[calendar_integration] background sync crashed")
        return
    finally:
        db.close()

    # `locked` shouldn't happen (the endpoint peeked first), but if it does
    # we skip the email — the running sync will send its own.
    if result.get("status") == "locked":
        return

    recipients = [triggered_by_email] if triggered_by_email else []
    try:
        send_sync_notification(
            recipients,
            result,
            triggered_by_label=triggered_by_label,
            triggered_by_email=triggered_by_email,
        )
    except Exception:
        logger.exception("[calendar_integration] result email failed")


@router.post("/sync", response_model=CalendarSyncResponse)
def calendar_sync(
    background_tasks: BackgroundTasks,
    current_user=Depends(require_capability("admin.workforce_connect")),
    db: Session = Depends(get_db),
):
    """Kick off a manual calendar sync in the background; return immediately."""
    if not google_calendar_service.is_configured():
        return CalendarSyncResponse(
            status="not_configured",
            message=(
                "Google Calendar isn't configured. Set GOOGLE_CALENDAR_SA_JSON "
                "(or GOOGLE_CALENDAR_SA_FILE) on the server, then try again."
            ),
            notify_email=None,
        )

    if is_sync_in_progress():
        return CalendarSyncResponse(
            status="already_running",
            message="A calendar sync is already running. You'll get an email when it finishes.",
            notify_email=current_user.email,
        )

    label = current_user.name or current_user.email or f"user_id={current_user.id}"
    background_tasks.add_task(
        _run_calendar_sync_and_email,
        triggered_by_email=current_user.email,
        triggered_by_label=label,
    )
    return CalendarSyncResponse(
        status="started",
        message="Calendar sync started. You'll get an email when it finishes.",
        notify_email=current_user.email,
    )
