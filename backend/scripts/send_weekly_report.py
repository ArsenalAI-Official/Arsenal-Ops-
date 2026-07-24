"""CLI entry point for the weekly team report.

Triggered by:
  • The `scheduler` container's crontab (Friday 20:00 ET by default)
  • Manual: `docker compose exec backend python -m scripts.send_weekly_report`

Reads recipients and config from env. Exits 0 if everything sent (or there
were no recipients to send to — opt-in by setting WEEKLY_REPORT_RECIPIENTS),
exits 1 if any recipient failed.

Also runs the Google Calendar → capacity sync as a best-effort "ride-along"
before sending, so the same cron that fires this report keeps meeting hours
fresh (there is no separate calendar cron). The sync runs even when there are
no report recipients, and a sync failure never blocks the report or changes
this script's exit code.
"""

from __future__ import annotations

import logging
import os
import sys

# Allow running as `python -m scripts.send_weekly_report` from /app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from services.weekly_report_service import send_weekly_report

logging.basicConfig(
    level=os.getenv("WEEKLY_REPORT_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [weekly_report] %(message)s",
)
log = logging.getLogger("weekly_report")


def _recipients() -> list[str]:
    raw = os.getenv("WEEKLY_REPORT_RECIPIENTS", "")
    return [r.strip() for r in raw.split(",") if r.strip()]


def _run_calendar_sync() -> None:
    """Best-effort Google Calendar → capacity sync (ride-along).

    Runs the standalone sync CLI in-process so the weekly-report cron keeps
    meeting hours fresh without a separate schedule. Never raises: any failure
    (import, config, API) is logged and swallowed so it can't block the report.
    """
    try:
        from scripts.sync_calendar_events import main as sync_calendar_events

        log.info("Running calendar sync (ride-along) before weekly report…")
        rc = sync_calendar_events()
        if rc == 0:
            log.info("Calendar sync completed.")
        else:
            log.warning("Calendar sync exited with code %d (report will still send).", rc)
    except Exception:
        log.exception("Calendar sync raised (report will still send).")


def main() -> int:
    # Ride-along: keep meeting hours fresh on the same cron tick. Best-effort —
    # runs even with no recipients, and never affects the report's exit code.
    _run_calendar_sync()

    recipients = _recipients()
    if not recipients:
        log.info("WEEKLY_REPORT_RECIPIENTS is empty — nothing to send. Exiting cleanly.")
        return 0

    db = SessionLocal()
    try:
        results = send_weekly_report(db, recipients)
    finally:
        db.close()

    failed = [r for r, ok in results.items() if not ok]
    if failed:
        log.error("Failed to send to: %s", ", ".join(failed))
        return 1
    log.info("Sent weekly report to %d recipient(s).", len(results))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
