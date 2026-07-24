"""Calendar sync — idempotent upsert of developers' weekly meetings.

Separated from google_calendar_service (which owns API access) so the DB
reconcile logic is unit-testable without touching Google. The reconcile is
keyed on the (developer_id, google_event_id) unique constraint:
  • new events are inserted,
  • changed events are updated in place,
  • events that vanished from the calendar (cancellations) are deleted,
so re-running for the same week is idempotent.

Window membership is defined by start_at ∈ [window_start, window_end]. Events
that start before the window (their bulk belongs to a prior week; v1 shows only
the current week and capacity clamps to the window anyway) are ignored — this
keeps the insert set and the delete scope identical, which is what makes the
reconcile clean.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models.calendar_event import CalendarEvent
from models.developer import Developer
from time_utils import utcnow

logger = logging.getLogger(__name__)

_FIELDS = (
    "organizer_email",
    "title",
    "project",
    "start_at",
    "end_at",
    "is_all_day",
    "response_status",
    "visibility",
)
# NOTE: `billable` is intentionally NOT synced. It isn't derivable from the
# calendar (it's an app-managed flag, dormant for now), so the sync leaves it at
# its model default on insert and never overwrites it on update.


def reconcile_developer_events(
    db: Session,
    developer_id: int,
    parsed_events: list[dict],
    window_start: datetime,
    window_end: datetime,
) -> dict:
    """Upsert this developer's in-window events; delete in-window rows that
    no longer exist on the calendar. Returns {inserted, updated, deleted}.

    Does NOT commit — the caller owns the transaction boundary.
    """
    in_window = [e for e in parsed_events if window_start <= e["start_at"] <= window_end]
    incoming_by_id = {e["google_event_id"]: e for e in in_window}

    existing = (
        db.query(CalendarEvent)
        .filter(
            CalendarEvent.developer_id == developer_id,
            CalendarEvent.start_at >= window_start,
            CalendarEvent.start_at <= window_end,
        )
        .all()
    )
    existing_by_id = {row.google_event_id: row for row in existing}

    inserted = updated = deleted = 0
    now = utcnow()

    for event_id, ev in incoming_by_id.items():
        row = existing_by_id.get(event_id)
        if row is None:
            db.add(
                CalendarEvent(
                    developer_id=developer_id,
                    google_event_id=event_id,
                    synced_at=now,
                    **{f: ev[f] for f in _FIELDS},
                )
            )
            inserted += 1
        else:
            for f in _FIELDS:
                setattr(row, f, ev[f])
            row.synced_at = now
            updated += 1

    for event_id, row in existing_by_id.items():
        if event_id not in incoming_by_id:
            db.delete(row)
            deleted += 1

    return {"inserted": inserted, "updated": updated, "deleted": deleted}


def sync_all_developers(
    db: Session,
    service,
    window_start: datetime,
    window_end: datetime,
) -> dict:
    """Sync every internal developer's calendar for the window.

    A failure for one developer is logged and skipped — one bad calendar
    shouldn't abort the whole run. Commits once at the end. Returns aggregate
    stats. Assumes service.is_configured() — the caller checks that and no-ops.
    """
    developers = (
        db.query(Developer)
        .filter(Developer.is_external.is_(False), Developer.email.isnot(None))
        .all()
    )

    totals = {"developers": 0, "inserted": 0, "updated": 0, "deleted": 0, "failed": 0}
    for dev in developers:
        try:
            events = service.get_events(dev.email, window_start, window_end)
            stats = reconcile_developer_events(db, dev.id, events, window_start, window_end)
            totals["developers"] += 1
            totals["inserted"] += stats["inserted"]
            totals["updated"] += stats["updated"]
            totals["deleted"] += stats["deleted"]
        except Exception:
            totals["failed"] += 1
            logger.exception("Calendar sync failed for developer %s (%s)", dev.id, dev.email)

    db.commit()
    return totals


# ── Manual-trigger orchestration (Admin → Integrations "Sync now") ─────────
#
# `run_calendar_sync` wraps `sync_all_developers` with the config check, the
# current capacity-week window, a status classification, and a best-effort
# in-progress guard. It's what the admin HTTP endpoint runs in a background
# task; the CLI (`scripts/sync_calendar_events.py`) and the weekly-report
# ride-along keep calling `sync_all_developers` directly.

_sync_lock = threading.Lock()
_sync_in_progress = False


def is_sync_in_progress() -> bool:
    """Best-effort peek: is a manual calendar sync running IN THIS PROCESS?

    Purely a UX guard so a double-click doesn't schedule a second background
    task — NOT a correctness lock. It's an in-memory flag set only by
    `run_calendar_sync` (the manual path), so it does NOT see the weekly-report
    ride-along or the standalone CLI: those run in a separate process and call
    `sync_all_developers` directly. That's fine — the reconcile is idempotent,
    so an overlapping run is harmless (at worst a couple of duplicate-key
    inserts get counted as per-developer failures). There is deliberately no
    cross-process coordination.
    """
    return _sync_in_progress


def run_calendar_sync(db: Session, service: Any = None, *, triggered_by: str = "manual") -> dict:
    """Sync every internal developer's current capacity-week calendar.

    Returns a result dict shaped for the API response, the result email, and
    log lines::

        {status, developers, inserted, updated, deleted, failed,
         window_start, window_end, reason?}

    ``status`` is one of ``ok`` / ``partial`` (some developers failed) /
    ``error`` (the whole run raised) / ``not_configured`` / ``locked``.
    Never raises for the normal outcomes — they're carried on ``status``.
    """
    global _sync_in_progress

    from services.capacity_service import week_boundaries
    from services.google_calendar_service import google_calendar_service

    svc = service or google_calendar_service
    week_start, week_end = week_boundaries()
    base = {
        "developers": 0,
        "inserted": 0,
        "updated": 0,
        "deleted": 0,
        "failed": 0,
        "window_start": week_start.date().isoformat(),
        "window_end": week_end.date().isoformat(),
    }

    if not svc.is_configured():
        return {
            **base,
            "status": "not_configured",
            "reason": (
                "Google Calendar service account isn't configured "
                "(set GOOGLE_CALENDAR_SA_JSON or GOOGLE_CALENDAR_SA_FILE)."
            ),
        }

    with _sync_lock:
        if _sync_in_progress:
            return {
                **base,
                "status": "locked",
                "reason": "Another calendar sync is already running.",
            }
        _sync_in_progress = True

    try:
        try:
            totals = sync_all_developers(db, svc, week_start, week_end)
        except Exception as e:
            logger.exception("[calendar_sync] %s run failed", triggered_by)
            return {**base, "status": "error", "reason": f"Calendar sync failed: {e}"}
        result = {**base, **totals}
        result["status"] = "partial" if totals.get("failed") else "ok"
        logger.info(
            "[calendar_sync] %s done status=%s developers=%s +%s ~%s -%s failed=%s window=%s..%s",
            triggered_by,
            result["status"],
            result["developers"],
            result["inserted"],
            result["updated"],
            result["deleted"],
            result["failed"],
            result["window_start"],
            result["window_end"],
        )
        return result
    finally:
        with _sync_lock:
            _sync_in_progress = False
