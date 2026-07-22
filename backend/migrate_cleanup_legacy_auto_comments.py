"""Startup migration: remove legacy auto-generated work-item comments.

The tracker used to write machine-generated rows into the comment thread
(status changes, ticket transfers, logged hours, field edits). Those now live
in the ActivityLog / Time Entries table, and the write paths were removed, so
the historical rows are cruft that pollute the human Comments tab.

This wraps the tested cleanup in ``scripts/cleanup_legacy_auto_comments.py`` so
the purge runs automatically on app startup (locally and on deploy) — no manual
step. It is IDEMPOTENT: once the legacy rows are gone the classify pass matches
nothing and it becomes a no-op, exactly like the column-add migrations invoked
alongside it in ``main._startup``.

Human comments are never touched — matching is all-or-nothing per category
(exact status strings, anchored transfer/hours regexes, the "Edited — " prefix,
or a non-null time_entry_id), so a human comment that merely mentions "moved to"
is left alone.

Run standalone (against DATABASE_URL) with:
    cd backend && python migrate_cleanup_legacy_auto_comments.py
"""

import logging

from scripts.cleanup_legacy_auto_comments import ALL_CATEGORIES, cleanup

logger = logging.getLogger(__name__)


def migrate(session_factory=None) -> dict:
    """Delete legacy auto-comments in all categories. Safe to run repeatedly.

    `session_factory` is injectable for tests; defaults to the app's SessionLocal
    via ``cleanup``.
    """
    kwargs = {"session_factory": session_factory} if session_factory is not None else {}
    summary = cleanup(dry_run=False, categories=ALL_CATEGORIES, work_item_id=None, **kwargs)
    if summary["matched"]:
        logger.info(
            "[MIGRATE] Removed %d legacy auto-comment(s): %s",
            summary["matched"],
            summary["by_category"],
        )
    return summary


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = migrate()
    print(f"cleanup_legacy_auto_comments: matched={result['matched']} {result['by_category']}")
