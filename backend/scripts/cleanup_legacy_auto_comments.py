"""One-time cleanup of legacy auto-generated work-item comments.

The tracker used to write machine-generated rows into the **comment thread** for
things that are not human discussion: status changes ("Moved to In Progress"),
ticket transfers ("Ticket transferred from X to Y."), logged hours
("Logged 4h"), and field edits ("Edited — priority: medium → high"). Those are
now recorded in the ActivityLog and surfaced under the ticket panel's *Activity*
tab instead, and the write paths that produced them have been removed
(`routers/workitems.py`, `routers/developers.py`).

This script deletes the historical rows so the *Comments* tab shows only
human-written comments. It classifies each comment in Python (portable across
SQLite/Postgres) into one of four legacy categories and removes exactly those:

  hours     — Comment.time_entry_id IS NOT NULL, or content == "Logged <n>h".
              (The oldest rows predate the time_entry_id column and are NULL,
              so the content form is matched too.)
  status    — content is exactly one of "Moved to {Backlog,To Do,In Progress,
              In Review,Done}".
  transfer  — content matches "Ticket transferred from <x> to <y>."
  edit      — content starts with "Edited — ".

Anything that doesn't match all-or-nothing for a category is left untouched — a
human comment that merely mentions "moved to" mid-sentence is NOT matched
because the status form is a whole-string equality.

Destructive on production data — ALWAYS dry-run first. Idempotent: a second run
finds nothing.

Usage:
    cd backend
    # See exactly what would be deleted, change nothing.
    python -m scripts.cleanup_legacy_auto_comments --dry-run

    # Apply.
    python -m scripts.cleanup_legacy_auto_comments

    # Restrict which categories are cleaned (default: all four).
    python -m scripts.cleanup_legacy_auto_comments --categories status,transfer --dry-run

    # Scope to one work item while testing.
    python -m scripts.cleanup_legacy_auto_comments --work-item-id 333 --dry-run
"""

import argparse
import logging
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import models  # noqa: F401
from database import SessionLocal
from models import activity_log as _activity_log  # noqa: F401
from models import architecture as _architecture  # noqa: F401
from models import user as _user  # noqa: F401
from models.comment import Comment

logger = logging.getLogger(__name__)

ALL_CATEGORIES = ("hours", "status", "transfer", "edit")

# Exact whole-string status-change auto-comments (see _status_label historically).
_STATUS_CONTENTS = {
    "Moved to Backlog",
    "Moved to To Do",
    "Moved to In Progress",
    "Moved to In Review",
    "Moved to Done",
}
_HOURS_RE = re.compile(r"^Logged \d+(\.\d+)?h$")
_TRANSFER_RE = re.compile(r"^Ticket transferred from .+ to .+\.$")
_EDIT_PREFIX = "Edited — "  # em dash, matches the removed f"Edited — {...}" form


def _classify(c: Comment) -> str | None:
    """Return the legacy category of `c`, or None if it's a human comment."""
    content = (c.content or "").strip()
    if c.time_entry_id is not None or _HOURS_RE.match(content):
        return "hours"
    if content in _STATUS_CONTENTS:
        return "status"
    if _TRANSFER_RE.match(content):
        return "transfer"
    if content.startswith(_EDIT_PREFIX):
        return "edit"
    return None


def cleanup(
    dry_run: bool,
    categories: tuple[str, ...],
    work_item_id: int | None,
    session_factory=SessionLocal,
) -> dict:
    """Delete legacy auto-comments. `session_factory` is injectable for tests."""
    db = session_factory()
    wanted = set(categories)
    matched_ids: list[int] = []
    by_category: dict[str, list[Comment]] = defaultdict(list)

    try:
        q = db.query(Comment)
        if work_item_id is not None:
            q = q.filter(Comment.work_item_id == work_item_id)
        comments = q.all()
        logger.info("Scanning %d comments", len(comments))

        for c in comments:
            cat = _classify(c)
            if cat is not None and cat in wanted:
                by_category[cat].append(c)
                matched_ids.append(c.id)

        for cat in ALL_CATEGORIES:
            if cat in wanted:
                rows = by_category.get(cat, [])
                logger.info("  %-8s: %d comment(s)", cat, len(rows))
                if dry_run:
                    for c in rows[:5]:
                        snippet = (c.content or "").strip().replace("\n", " ")[:80]
                        logger.info(
                            "      id=%s work_item_id=%s content=%r",
                            c.id,
                            c.work_item_id,
                            snippet,
                        )
                    if len(rows) > 5:
                        logger.info("      (+%d more)", len(rows) - 5)

        if matched_ids and not dry_run:
            db.query(Comment).filter(Comment.id.in_(matched_ids)).delete(synchronize_session=False)
            db.commit()
            logger.info("Deleted %d legacy auto-comment(s)", len(matched_ids))
        elif not matched_ids:
            logger.info("No legacy auto-comments found. Nothing to do.")

    except Exception:
        db.rollback()
        logger.exception("Cleanup failed; rolled back")
        raise
    finally:
        db.close()

    return {
        "scanned": len(comments),
        "matched": len(matched_ids),
        "by_category": {cat: len(by_category.get(cat, [])) for cat in categories},
        "applied": not dry_run and bool(matched_ids),
    }


def _parse_categories(raw: str) -> tuple[str, ...]:
    cats = tuple(part.strip() for part in raw.split(",") if part.strip())
    invalid = [c for c in cats if c not in ALL_CATEGORIES]
    if invalid:
        raise argparse.ArgumentTypeError(
            f"unknown categor{'y' if len(invalid) == 1 else 'ies'}: {', '.join(invalid)}. "
            f"Valid: {', '.join(ALL_CATEGORIES)}"
        )
    return cats


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be deleted without changing the database.",
    )
    parser.add_argument(
        "--categories",
        type=_parse_categories,
        default=ALL_CATEGORIES,
        help=f"Comma-separated subset of {{{','.join(ALL_CATEGORIES)}}} to clean (default: all).",
    )
    parser.add_argument(
        "--work-item-id",
        type=int,
        default=None,
        help="Optional: limit scan to one work item id (useful for testing).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    summary = cleanup(
        dry_run=args.dry_run,
        categories=args.categories,
        work_item_id=args.work_item_id,
    )
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    per_cat = " ".join(f"{cat}={n}" for cat, n in summary["by_category"].items())
    print(f"[{mode}] scanned={summary['scanned']} matched={summary['matched']} ({per_cat})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
