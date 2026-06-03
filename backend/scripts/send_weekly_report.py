"""CLI entry point for the weekly team report.

Triggered by:
  • The `scheduler` container's crontab (Friday 20:00 ET by default)
  • Manual: `docker compose exec backend python -m scripts.send_weekly_report`

Reads recipients and config from env. Exits 0 if everything sent (or there
were no recipients to send to — opt-in by setting WEEKLY_REPORT_RECIPIENTS),
exits 1 if any recipient failed.
"""

from __future__ import annotations

import logging
import os
import sys

# Allow running as `python -m scripts.send_weekly_report` from /app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal  # noqa: E402
from services.weekly_report_service import send_weekly_report  # noqa: E402

logging.basicConfig(
    level=os.getenv("WEEKLY_REPORT_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s [weekly_report] %(message)s",
)
log = logging.getLogger("weekly_report")


def _recipients() -> list[str]:
    raw = os.getenv("WEEKLY_REPORT_RECIPIENTS", "")
    return [r.strip() for r in raw.split(",") if r.strip()]


def main() -> int:
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
