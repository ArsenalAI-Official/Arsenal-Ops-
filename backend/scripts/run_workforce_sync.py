"""CLI entry point for the QuickBooks (Workforce) hours sync — FALLBACK PATH.

As of the dev Review-and-Submit launch (spec: 2026-06-29), the primary
QB sync path is *per-developer*, inline, from the My Capacity modal:
each dev clicks Submit and their own hours sync immediately. This
script (and its admin "Force-Sync Unsubmitted Hours" twin in the
workforce router) is a **safety-net fallback**, not a scheduled job
the team should rely on for routine pushes.

Deployment note: the Render Cron Job that historically ran this every
Saturday at 08:00 UTC should be **disabled** when this feature ships.
Keep the script available for manual catch-up runs — e.g., when a dev
forgets to Submit before going on vacation and the admin needs to
push their week — but no longer schedule it. See
`docs/superpowers/specs/2026-06-29-dev-timesheet-review-submit-design.md`
for the full rationale.

Triggered by:
  • Manual (recommended):  `docker compose exec backend python -m scripts.run_workforce_sync`
  • Render Cron Job (legacy): disable in the Render dashboard when
    the per-developer Submit flow is live.

Pushes the Mon–Fri of the calendar week containing the run — for
projects linked to a QB Customer — to QuickBooks Online's TimeActivity
endpoint. See `services/workforce_sync.py::run_workforce_sync` for
details. Admin force-sync now also stamps `submitted_at` on the
entries it pushes so the (submitted_at, workforce_entry_id) state
machine is consistent with dev-initiated submits.

Exit codes (matches `scripts/send_weekly_report.py` conventions):

  0 — everything ok, OR nothing to do (integration not connected, no
      eligible entries, lock contention). The cron container shouldn't
      flag these as failures.
  1 — hard error: at least one entry failed to push, or the sync hit an
      OAuth / service-item / employees-fetch error. The cron platform
      should alert.
"""

from __future__ import annotations

import json
import logging
import os
import sys

# Allow running as `python -m scripts.run_workforce_sync` from /app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from services.workforce_sync import run_workforce_sync
from services.workforce_sync_notify import send_sync_notification

logging.basicConfig(
    level="INFO",
    format="%(asctime)s %(levelname)s [workforce_sync] %(message)s",
)
log = logging.getLogger("workforce_sync")


# Statuses that mean "no action needed / nothing to report as failure".
# Mapped to exit 0 so a Saturday cron run on a quiet week (or one where
# an admin hasn't connected QB yet) doesn't trigger ops alerts.
_OK_STATUSES = {"ok", "no_eligible", "not_connected", "locked"}


def _recipients() -> list[str]:
    """Same env var as `scripts/send_weekly_report.py` — keep ops/finance
    distribution lists in one place. Empty / unset → no email is sent."""
    raw = os.getenv("WEEKLY_REPORT_RECIPIENTS", "")
    return [r.strip() for r in raw.split(",") if r.strip()]


def main() -> int:
    db = SessionLocal()
    try:
        # batch_cap defaults to DEFAULT_BATCH_CAP inside run_workforce_sync —
        # same value the manual HTTP trigger uses.
        result = run_workforce_sync(db, triggered_by="cron")
    finally:
        db.close()

    # Always log the result dict — useful in Render's cron log view to
    # see the window range and counts at a glance without having to dig
    # through the integration row.
    log.info("result: %s", json.dumps(result, sort_keys=True))

    # Notify the configured ops recipients. Best-effort — if Gmail
    # OAuth2 isn't configured, send_sync_notification logs and returns
    # an empty dict; we still exit on the sync's status, not the
    # email's. A misconfigured mailer shouldn't fail an otherwise-
    # successful sync.
    recipients = _recipients()
    if recipients:
        try:
            send_sync_notification(
                recipients,
                result,
                triggered_by_label="Saturday cron (scheduled)",
            )
        except Exception as e:
            log.warning("Cron sync email notification failed: %s", e)
    else:
        log.info("WEEKLY_REPORT_RECIPIENTS is empty — skipping email notification.")

    status = result.get("status", "error")
    if status in _OK_STATUSES:
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
