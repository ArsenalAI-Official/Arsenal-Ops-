"""Workforce / QuickBooks sync worker.

`run_workforce_sync(db)` is the single entry point used by BOTH the
weekly cron (`scripts/run_workforce_sync.py`) and the manual "Sync Now"
button (`POST /api/admin/workforce/sync`). Same code path, same
guarantees — only the trigger differs.

Window
======
Both triggers sync the **Mon–Fri of the calendar week containing the
trigger** — see `current_work_week_window`. The Saturday cron and any
manual click on the same calendar week target the same range; a Mon–Fri
click syncs the partial Mon–through–today set (later weekdays simply
don't exist yet, so the eligibility query returns the partial result
and the next click — or the Saturday cron — sweeps the remainder).

The window is derived from `date.today()`, which uses the host's local
timezone. `TimeEntry.logged_at` is stored as naive UTC. Operators are
expected to run the backend with `TZ=UTC` (Render's default) so the
two coincide; a non-UTC host can shift week boundaries on the date
boundary. See `WORKFORCE_INTEGRATION_SETUP.md` and `REVIEW_RULES.md`.

Note: a Saturday cron that slips past midnight (runs on Sunday) advances
the week pointer and would target the next calendar week — by policy
that's an ops issue, not a worker concern. Idempotency
(`workforce_entry_id IS NULL`) keeps any missed entries eligible for a
manual re-run.

Concurrency
===========
Postgres advisory lock keyed on a hardcoded int. Two simultaneous
syncs (cron + manual click) won't both push the same TimeEntry. The
lock is released automatically when the session closes or the
transaction commits.

Idempotency
===========
Even if the lock fails (e.g. SQLite in tests), the sync is still
idempotent because the eligibility filter requires
`time_entries.workforce_entry_id IS NULL`. A TimeEntry that's already
synced has the QB id set and falls out of the queue.

Errors
======
- Rate-limit (429) from Intuit → stop the run gracefully. The
  partial progress is committed; next run picks up the rest.
- Per-entry API errors → log + count, continue with the next entry.
- Missing service item → fail the run cleanly with a clear message
  instead of pushing entries to QB with a null Item ref.
"""

from __future__ import annotations

import contextlib
import logging
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload

from models.developer import Developer
from models.project import Project
from models.time_entry import TimeEntry
from models.work_item import WorkItem
from models.workforce_integration import WorkforceIntegration
from services.workforce_clients import refresh_quietly as refresh_clients_quietly
from services.workforce_oauth import WorkforceOAuthError
from services.workforce_qb_client import (
    QBApiError,
    QBRateLimitError,
    fetch_qb_employees,
    post_time_activity,
    resolve_service_item,
)

logger = logging.getLogger(__name__)


# Fixed int key for Postgres `pg_try_advisory_lock`. Arbitrary but
# stable so two backend instances pick the same slot. The high bit is
# clear so it stays a positive 32-bit int (Postgres accepts negative
# but mixing signs across versions has bitten people in the wild).
ADVISORY_LOCK_KEY = 0x57464F52  # ASCII 'WFOR'

# Hard cap on how many TimeEntries one run can push. Protects against a
# pathologically large queue exhausting the run / hitting Intuit's per-
# day limits. Hardcoded — Arsenal's weekly volume (~50–200 entries) is
# well under this; if a catch-up genuinely needs more, bump the constant
# in code rather than via an env knob (operational tuning, not config).
DEFAULT_BATCH_CAP = 500


# ── Window resolution ────────────────────────────────────────────────────


def current_work_week_window(today: date | None = None) -> tuple[date, date]:
    """Return (monday, friday) of the calendar week containing `today`.

    Calendar weeks here are Mon-Sun. The rule is uniform across
    every trigger day — both the Saturday cron and any manual click
    sync the Mon-Fri of the same calendar week as the trigger:

      today = Sat 2024-01-13  → (Mon 2024-01-08, Fri 2024-01-12)
      today = Sun 2024-01-14  → (Mon 2024-01-08, Fri 2024-01-12)
      today = Mon 2024-01-15  → (Mon 2024-01-15, Fri 2024-01-19)
      today = Wed 2024-01-17  → (Mon 2024-01-15, Fri 2024-01-19)
      today = Fri 2024-01-19  → (Mon 2024-01-15, Fri 2024-01-19)

    On Mon-Fri clicks the window naturally includes only the days
    already elapsed — Thu/Fri entries simply don't exist yet, so the
    eligibility query returns the partial set. The next click (or the
    Saturday cron) sweeps up the remainder.
    """
    if today is None:
        today = date.today()
    monday = today - timedelta(days=today.weekday())
    friday = monday + timedelta(days=4)
    return monday, friday


# ── Lock helpers ─────────────────────────────────────────────────────────


def is_sync_in_progress(db: Session) -> bool:
    """Non-acquiring peek: is a workforce-sync advisory lock currently held?

    Used by the manual-sync HTTP endpoint to short-circuit a duplicate
    click BEFORE scheduling a background task — so the UI can show
    "Sync already running" without ever queueing a second run that
    would just hit the lock and exit.

    Postgres only. Sqlite (tests, local dev fallback) has no advisory
    lock primitive; this returns False there so the manual path
    proceeds unblocked (single-process anyway).

    Note the race window: between this peek and the background task
    actually calling ``_try_advisory_lock`` a few hundred ms later, a
    different process (the Saturday cron) could grab the lock. The
    background task's own acquire-attempt is the authoritative gate;
    this peek just avoids the common case of a user double-clicking.
    """
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    held = db.execute(
        text(
            "SELECT count(*) > 0 FROM pg_locks "
            "WHERE locktype = 'advisory' AND objid = :k AND granted = true"
        ),
        {"k": ADVISORY_LOCK_KEY},
    ).scalar()
    return bool(held)


def _try_advisory_lock(db: Session):
    """Acquire the workforce-sync advisory lock if available.

    Returns the held ``Connection`` on Postgres if we got the lock, or
    ``False`` if someone else holds it. On non-Postgres (sqlite in tests)
    returns ``None`` without acquiring a lock — the idempotency guarantee
    from ``workforce_entry_id IS NULL`` still holds.

    Why we open a dedicated Connection instead of using the ORM Session:
    Postgres advisory locks are bound to the *physical* connection that
    acquired them. The ORM Session committing inside the sync (per-entry
    ``db.commit()``) can return its connection to the pool and check out
    a different one on the next operation. A subsequent
    ``pg_advisory_unlock`` from the Session would run on a connection
    that doesn't hold the lock → unlock returns ``false``, the original
    connection silently keeps the lock until it cycles out of the pool,
    and the next sync sees a spurious "already running" until that
    happens (minutes, not days, but still wrong).

    We sidestep all of that by opening one Connection at lock acquire
    time, pinning it for the whole run, and releasing the lock on that
    same Connection before closing it.
    """
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return None  # sqlite: no lock, but the caller can still proceed

    # Use the engine's pool — not the Session's connection — so the lock
    # is owned by an explicit, separate Connection we control for the
    # whole run. ``Session.get_bind()`` returns either Engine or
    # Connection; isinstance narrows the union for mypy.
    from sqlalchemy.engine import Connection, Engine

    engine: Engine = bind.engine if isinstance(bind, Connection) else bind
    conn = engine.connect()
    try:
        got = conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"),
            {"k": ADVISORY_LOCK_KEY},
        ).scalar()
    except Exception:
        conn.close()
        raise
    if not got:
        conn.close()
        return False
    return conn


def _release_advisory_lock(lock_conn) -> None:
    """Release the advisory lock on the SAME Connection that acquired it.

    ``lock_conn`` is the value returned by ``_try_advisory_lock``:
      - ``None``         → non-Postgres, no-op
      - ``False``        → never acquired, no-op (shouldn't reach here
                            since the caller short-circuits on False)
      - ``Connection``   → run unlock on it, close it

    The unlock result is checked and logged loudly if false — that means
    the connection somehow lost the lock between acquire and release,
    which would indicate a logic error in this module worth surfacing
    rather than swallowing.
    """
    if lock_conn is None or lock_conn is False:
        return
    try:
        try:
            released = lock_conn.execute(
                text("SELECT pg_advisory_unlock(:k)"),
                {"k": ADVISORY_LOCK_KEY},
            ).scalar()
            if not released:
                logger.error(
                    "[workforce_sync] pg_advisory_unlock returned false on the "
                    "acquiring Connection — lock state may be inconsistent. "
                    "Lock will auto-release when this connection closes (next line)."
                )
        except Exception:
            with contextlib.suppress(Exception):
                lock_conn.rollback()
            raise
    finally:
        # Closing the Connection releases any advisory locks still held
        # on it (Postgres semantics), so even on an exception path the
        # lock doesn't outlive the run.
        with contextlib.suppress(Exception):
            lock_conn.close()


# ── Description builder ──────────────────────────────────────────────────


def build_description(entry: TimeEntry) -> str:
    """Format the QB TimeActivity Description.

    Shape: `[PROJ-123] Title — optional user description`. Keeps the
    work-item identifier first so it's scannable in QB's TimeActivity
    list view, then the title, then the developer-typed note. Caps at
    1000 chars; QB allows up to 4000 but anything that long is almost
    certainly a paste-mistake on the Arsenal side.
    """
    item = entry.work_item
    parts: list[str] = []
    if item is not None:
        key = getattr(item, "key", None) or f"WI-{item.id}"
        title = getattr(item, "title", None) or ""
        if title:
            parts.append(f"[{key}] {title}")
        else:
            parts.append(f"[{key}]")
    if entry.description:
        parts.append(entry.description.strip())
    out = " — ".join(parts) if parts else ""
    return out[:1000]


# ── Main entry point ─────────────────────────────────────────────────────


def run_workforce_sync(
    db: Session,
    *,
    triggered_by: str = "cron",
    batch_cap: int | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """Push eligible TimeEntries from this calendar week's Mon–Fri to QuickBooks.

    Returns a dict suitable for both API response and log lines:

        {
          "status": "ok" | "partial" | "error" | "not_connected" | "locked" | "no_eligible",
          "synced": int,
          "failed": int,
          "skipped": int,
          "window_start": "YYYY-MM-DD",
          "window_end": "YYYY-MM-DD",
          "reason": str (only on non-ok statuses),
        }

    `triggered_by` is logged but not gated — both `cron` and `manual`
    take the exact same code path. The argument exists only so log lines
    distinguish them.

    No exception is raised for normal "nothing to do" or "rate-limited"
    outcomes — they're communicated via the `status` field. Hard errors
    (missing integration, OAuth refresh failure) raise once they've
    been recorded on `integration.last_sync_*` so the API can return
    them as 5xx without losing the audit trail.
    """
    # Default the cap to DEFAULT_BATCH_CAP if the caller didn't pin one.
    # No env override — operational tuning, not configuration; bump the
    # constant in code if Arsenal's volume ever outgrows it.
    if batch_cap is None:
        batch_cap = DEFAULT_BATCH_CAP

    window_start, window_end = current_work_week_window(today)
    base_result = {
        "synced": 0,
        "failed": 0,
        "skipped": 0,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
    }

    integration = db.query(WorkforceIntegration).first()
    if not integration:
        logger.info("[workforce_sync] %s: integration not connected", triggered_by)
        return {
            **base_result,
            "status": "not_connected",
            "reason": "QuickBooks isn't connected. Click Connect QuickBooks in Admin → Integrations to set it up.",
        }

    lock_conn = _try_advisory_lock(db)
    if lock_conn is False:
        logger.info("[workforce_sync] %s: another sync is already running", triggered_by)
        return {
            **base_result,
            "status": "locked",
            "reason": "Another sync is already running. The running run will email its result when it finishes.",
        }

    try:
        return _run_inside_lock(
            db,
            integration,
            window_start=window_start,
            window_end=window_end,
            batch_cap=batch_cap,
            triggered_by=triggered_by,
            base_result=base_result,
        )
    finally:
        _release_advisory_lock(lock_conn)


def _run_inside_lock(
    db: Session,
    integration: WorkforceIntegration,
    *,
    window_start: date,
    window_end: date,
    batch_cap: int,
    triggered_by: str,
    base_result: dict[str, Any],
) -> dict[str, Any]:
    """Body of the sync after we hold the advisory lock.

    Separated so the lock's `try/finally` stays small and obvious in
    the caller — every code path in here is wrapped by lock release.
    """
    # 1) Resolve / re-resolve service item. If the admin renamed
    #    "Hours" in QB the cached id might be stale; bail early with a
    #    clear error rather than push entries against a wrong item.
    service_item_id = integration.service_item_id
    if not service_item_id:
        try:
            item = resolve_service_item(db, integration)
        except QBApiError as e:
            return _finalize(
                db,
                integration,
                base_result,
                status="error",
                reason=f"Couldn't look up the 'Hours' service item in QuickBooks: {e}",
                triggered_by=triggered_by,
            )
        if not item:
            return _finalize(
                db,
                integration,
                base_result,
                status="error",
                reason=(
                    "Couldn't find a service item named 'Hours' in QuickBooks. "
                    "Create one (Products and services → New → Service, name it "
                    "exactly 'Hours') and click Sync Now again."
                ),
                triggered_by=triggered_by,
            )
        integration.service_item_id = item["id"]
        integration.service_item_name = item["name"]
        db.commit()
        service_item_id = item["id"]

    # 2) Build the email -> QB employee id map once per run.
    try:
        employee_map = fetch_qb_employees(db, integration)
    except (QBApiError, WorkforceOAuthError) as e:
        return _finalize(
            db,
            integration,
            base_result,
            status="error",
            reason=f"Couldn't load the employee list from QuickBooks: {e}",
            triggered_by=triggered_by,
        )

    # 2.5) Refresh the cached QB Customer list. Best-effort — a refresh
    # failure doesn't block the sync since the customer list is used by
    # the picker, not by the push itself (the push uses
    # `project.workforce_client_id` which is already on the project row).
    refresh_clients_quietly(db, integration)

    # 3) Pull eligible TimeEntries. Mirrors the Time Entries admin
    #    tab's JOIN shape (Project → WorkItem → TimeEntry → Developer)
    #    so what gets pushed matches what an admin sees there.
    window_start_dt = datetime.combine(window_start, time.min)
    window_end_dt = datetime.combine(window_end + timedelta(days=1), time.min)
    entries: list[TimeEntry] = (
        db.query(TimeEntry)
        .join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
        .join(Project, WorkItem.project_id == Project.id)
        .join(Developer, TimeEntry.developer_id == Developer.id)
        .filter(
            Project.workforce_client_id.isnot(None),
            TimeEntry.workforce_entry_id.is_(None),
            TimeEntry.logged_at >= window_start_dt,
            TimeEntry.logged_at < window_end_dt,
        )
        .options(
            selectinload(TimeEntry.work_item).selectinload(WorkItem.project),
            selectinload(TimeEntry.developer),
        )
        .order_by(TimeEntry.logged_at.asc(), TimeEntry.id.asc())
        .limit(batch_cap)
        .all()
    )

    if not entries:
        return _finalize(
            db,
            integration,
            base_result,
            status="no_eligible",
            reason=(
                "No eligible time entries for this week. "
                "Either nothing was logged on QuickBooks-linked projects, "
                "or every logged entry was already synced."
            ),
            triggered_by=triggered_by,
        )

    synced = failed = skipped = 0
    skip_summary: dict[str, int] = {}
    fail_summary: list[str] = []
    rate_limited = False

    for entry in entries:
        if rate_limited:
            break
        email = (entry.developer.email or "").lower().strip() if entry.developer else ""
        if not email or email not in employee_map:
            key = email or "(no email on record)"
            skip_summary[key] = skip_summary.get(key, 0) + 1
            skipped += 1
            continue

        project = entry.work_item.project if entry.work_item else None
        customer_qb_id = project.workforce_client_id if project else None
        if not customer_qb_id:
            # Project must have been unlinked between query time and now,
            # or the row was inserted between query plan and execute.
            # Treat as skip (will retry next run if re-linked).
            skip_summary["(project unlinked from QuickBooks)"] = (
                skip_summary.get("(project unlinked from QuickBooks)", 0) + 1
            )
            skipped += 1
            continue

        try:
            qb_id = post_time_activity(
                db,
                integration,
                employee_qb_id=employee_map[email],
                customer_qb_id=customer_qb_id,
                service_item_id=service_item_id,
                hours=int(entry.hours),
                txn_date=entry.logged_at.date(),
                description=build_description(entry),
            )
            entry.workforce_entry_id = qb_id
            synced += 1
            # Commit every entry so a mid-run rate-limit doesn't lose
            # work already pushed to QB. The flip side is more commits;
            # acceptable since this runs once a week with bounded N.
            db.commit()
        except QBRateLimitError as e:
            logger.warning("[workforce_sync] hit rate limit: %s", e)
            fail_summary.append(f"rate_limited: {e}")
            rate_limited = True
            # Don't count the unattempted remainder as failures —
            # they're untried, and the next run will pick them up.
            break
        except QBApiError as e:
            failed += 1
            # Label the failure with something an executive can read:
            # the work-item key (e.g. "PROJ-123") + developer email.
            # `entry.id` (a DB pk) ends up in logs, not the user-facing
            # last_sync_error column.
            wi_key = entry.work_item.key if entry.work_item else f"entry#{entry.id}"
            dev_email = entry.developer.email if entry.developer else "(unknown)"
            fail_summary.append(f"{wi_key} ({dev_email}): {e}")
            logger.warning("[workforce_sync] entry id=%s failed: %s", entry.id, e)
        except WorkforceOAuthError as e:
            # OAuth refresh failed mid-run — the integration is
            # effectively disconnected. Stop the run cleanly.
            logger.error("[workforce_sync] OAuth failure mid-run: %s", e)
            fail_summary.append(f"OAuth failed: {e}")
            return _finalize(
                db,
                integration,
                {**base_result, "synced": synced, "failed": failed, "skipped": skipped},
                status="error",
                reason=(
                    "QuickBooks authorization expired or was revoked. "
                    "Go to Admin → Integrations, click Disconnect, then "
                    f"Connect QuickBooks again. (Intuit reported: {e})"
                ),
                triggered_by=triggered_by,
            )

    status_str: str
    reason_parts: list[str] = []
    if rate_limited:
        status_str = "partial"
        reason_parts.append(
            "Hit the QuickBooks rate limit before finishing. "
            "The remaining entries will sync on the next run — no action needed."
        )
    elif failed == 0 and skipped == 0:
        status_str = "ok"
    elif synced == 0 and failed == 0:
        # synced=0 / failed=0 / skipped>0 is still a "partial" outcome —
        # we touched the queue, decided each entry was ineligible, but
        # did not push anything. Routing through "partial" keeps the
        # status set documented in WorkforceIntegration.last_sync_status
        # and lets the email/UI badge styling for partial apply.
        status_str = "no_eligible" if not skipped else "partial"
    else:
        status_str = "partial"
    if skipped:
        # Format: "Skipped (no matching QB employee): alice@arsenal.com (×3), bob@arsenal.com"
        # — the (×N) suffix is hidden when N is 1 so single-skip cases
        # read naturally; pluralised counts make a noisy week scannable.
        items = ", ".join(f"{k} (×{v})" if v > 1 else k for k, v in sorted(skip_summary.items()))
        reason_parts.append(f"Skipped (no matching QuickBooks employee): {items}")
    if fail_summary:
        # Cap fail_summary serialization so a flurry of per-entry errors
        # doesn't balloon the persisted last_sync_error column.
        reason_parts.append("Failed entries: " + "; ".join(fail_summary[:10]))
    reason = " | ".join(reason_parts) if reason_parts else None

    return _finalize(
        db,
        integration,
        {**base_result, "synced": synced, "failed": failed, "skipped": skipped},
        status=status_str,
        reason=reason,
        triggered_by=triggered_by,
    )


def _finalize(
    db: Session,
    integration: WorkforceIntegration,
    result: dict[str, Any],
    *,
    status: str,
    reason: str | None,
    triggered_by: str,
) -> dict[str, Any]:
    """Persist observability fields on the integration row and return result.

    Centralizing this means every exit path (success, partial, error,
    locked, no-eligible) updates the same fields in the same way; the
    admin UI never sees stale or inconsistent last-sync state.
    """
    integration.last_sync_at = datetime.utcnow()
    integration.last_sync_status = status
    integration.last_sync_error = (reason or None) if status != "ok" else None
    integration.last_synced_count = int(result.get("synced", 0))
    integration.last_failed_count = int(result.get("failed", 0))
    db.commit()
    logger.info(
        "[workforce_sync] %s done status=%s synced=%s failed=%s skipped=%s window=%s..%s",
        triggered_by,
        status,
        result.get("synced"),
        result.get("failed"),
        result.get("skipped"),
        result.get("window_start"),
        result.get("window_end"),
    )
    out = {**result, "status": status}
    if reason:
        out["reason"] = reason
    return out
