"""CLI entry point for the Friday "review & submit your hours" reminder.

**NOT WIRED TO ANY SCHEDULER.** This script ships disabled — the cron
job that would invoke it on Friday afternoons is intentionally not
added. Per product decision, the cadence + copy need CEO sign-off
before this goes live. When that approval lands:

  1. Set up a Render Cron Job (or equivalent) that runs:
         python -m scripts.send_submit_reminder --send
     on Fridays around end-of-day company time.
  2. Update this docstring to point at where the schedule lives.

Until then, this script is safe to run manually for previews. It
**defaults to dry-run** — only `--send` actually delivers mail.

Examples
========

  Preview (no mail sent, prints recipients to stdout):
      python -m scripts.send_submit_reminder

  Send ONE preview to yourself, to inspect the rendered email:
      python -m scripts.send_submit_reminder --to you@arsenalai.com

  Live broadcast (CEO-approved + production credentials configured):
      python -m scripts.send_submit_reminder --send

  Live send with a custom app link (e.g. for staging):
      FRONTEND_URL=https://staging.arsenal-ops.com python -m scripts.send_submit_reminder --send

Exit codes
==========
  0 — preview ran, single-recipient send worked, or live broadcast fully succeeded.
  1 — live broadcast had at least one failure (see logs / `failed` field), or
      single-recipient send failed.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import asdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from services.submit_reminder_email import send_one_preview, send_submit_reminders

logging.basicConfig(
    level="INFO",
    format="%(asctime)s %(levelname)s [submit_reminder] %(message)s",
)
log = logging.getLogger("submit_reminder")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="ACTUALLY SEND to every internal employee. Default is dry-run.",
    )
    parser.add_argument(
        "--to",
        metavar="EMAIL",
        help=(
            "Send a single preview email to this address (for visual review). "
            "Bypasses the recipient filter — useful for landing the email in "
            "your own inbox before turning on the broadcast. Mutually exclusive "
            "with --send."
        ),
    )
    args = parser.parse_args()

    if args.to and args.send:
        log.error("--to and --send are mutually exclusive. Pick one.")
        return 2

    # Path 1: single-recipient preview send.
    if args.to:
        log.warning("PREVIEW — sending one email to %s", args.to)
        db = SessionLocal()
        try:
            err = send_one_preview(db, to_email=args.to)
        finally:
            db.close()
        if err:
            log.error("Preview send failed: %s", err)
            return 1
        log.info("Preview email sent to %s", args.to)
        return 0

    # Path 2: dry-run or full broadcast.
    dry_run = not args.send

    if dry_run:
        log.info("Dry-run mode — no emails will be sent. Pass --send to deliver.")
    else:
        log.warning(
            "LIVE MODE — emails will be sent to every internal employee with "
            "unsubmitted hours this week. Make sure this run was approved "
            "(CEO sign-off per the script docstring)."
        )

    db = SessionLocal()
    try:
        result = send_submit_reminders(db, dry_run=dry_run)
    finally:
        db.close()

    log.info("Result: %s", json.dumps(asdict(result), sort_keys=True))

    # Exit 1 if a live send produced any failures, so the cron platform
    # (when one is eventually wired up) surfaces it as an alert.
    if not dry_run and result.failed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
