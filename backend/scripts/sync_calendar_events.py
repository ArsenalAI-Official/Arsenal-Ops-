"""CLI entry point for syncing Google Calendar meetings into capacity.

Triggered by:
  • A scheduler/cron (to be wired up — runs e.g. hourly).
  • Manual: `docker compose exec backend python -m scripts.sync_calendar_events`

For every internal developer, upserts the current capacity week's calendar
events (same Sat→Fri UTC window capacity uses). Idempotent — safe to re-run.

Exits 0 on success or clean no-op (service unconfigured), 1 if the run errored.
"""

from __future__ import annotations

import logging
import os
import sys

# Allow running as `python -m scripts.sync_calendar_events` from /app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal  # noqa: E402
from services.calendar_sync import sync_all_developers  # noqa: E402
from services.capacity_service import week_boundaries  # noqa: E402
from services.google_calendar_service import google_calendar_service  # noqa: E402

logging.basicConfig(
    level=os.getenv("CALENDAR_SYNC_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [calendar_sync] %(message)s",
)
log = logging.getLogger("calendar_sync")


def main() -> int:
    if not google_calendar_service.is_configured():
        log.warning(
            "Google Calendar service account not configured "
            "(set GOOGLE_CALENDAR_SA_JSON or GOOGLE_CALENDAR_SA_FILE) — nothing to sync. "
            "Exiting cleanly."
        )
        return 0

    week_start, week_end = week_boundaries()
    db = SessionLocal()
    try:
        totals = sync_all_developers(db, google_calendar_service, week_start, week_end)
    except Exception:
        log.exception("Calendar sync run failed.")
        return 1
    finally:
        db.close()

    log.info(
        "Synced %d developer(s): +%d inserted, ~%d updated, -%d deleted, %d failed.",
        totals["developers"],
        totals["inserted"],
        totals["updated"],
        totals["deleted"],
        totals["failed"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
