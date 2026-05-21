"""One-shot backfill: recompute estimated/logged/remaining hours for every epic.

Why: prior versions of `update_epic_hours` only rolled up `estimated_hours`,
leaving `logged_hours` and `remaining_hours` stuck at the value they had
when the epic was created (often 0). Run this once after deploying the
rollup fix so existing epics show correct totals.

Idempotent — safe to run repeatedly.

Usage:
    cd backend && python -m scripts.recompute_epic_hours
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import every model module so every SQLAlchemy mapper is registered
# before the first query runs. Without this, lazy relationships fail
# with InvalidRequestError because target classes are unknown to the registry.
from sqlalchemy import func  # noqa: E402

import models  # noqa: F401, E402
from database import SessionLocal  # noqa: E402
from models import activity_log as _activity_log  # noqa: F401, E402
from models import architecture as _architecture  # noqa: F401, E402
from models import user as _user  # noqa: F401, E402
from models.work_item import WorkItem, WorkItemType  # noqa: E402

logger = logging.getLogger(__name__)

CHILD_TYPES = [
    WorkItemType.USER_STORY.value,
    WorkItemType.TASK.value,
    WorkItemType.BUG.value,
]


def recompute() -> int:
    db = SessionLocal()
    updated = 0
    try:
        epics = db.query(WorkItem).filter(WorkItem.type == WorkItemType.EPIC.value).all()
        logger.info("Found %d epics to recompute", len(epics))
        for epic in epics:
            row = (
                db.query(
                    func.coalesce(func.sum(WorkItem.estimated_hours), 0).label("est"),
                    func.coalesce(func.sum(WorkItem.logged_hours), 0).label("logged"),
                    func.coalesce(func.sum(WorkItem.remaining_hours), 0).label("remaining"),
                )
                .filter(
                    WorkItem.epic_id == epic.id,
                    WorkItem.type.in_(CHILD_TYPES),
                )
                .one()
            )
            new_est = row.est or 0
            new_logged = row.logged or 0
            new_remaining = row.remaining or 0

            changed = (
                (epic.estimated_hours or 0) != new_est
                or (epic.logged_hours or 0) != new_logged
                or (epic.remaining_hours or 0) != new_remaining
            )
            if changed:
                logger.info(
                    "[%s] %s -> est %s->%s, logged %s->%s, remaining %s->%s",
                    epic.key,
                    epic.title,
                    epic.estimated_hours,
                    new_est,
                    epic.logged_hours,
                    new_logged,
                    epic.remaining_hours,
                    new_remaining,
                )
                epic.estimated_hours = new_est
                epic.logged_hours = new_logged
                epic.remaining_hours = new_remaining
                updated += 1

        if updated:
            db.commit()
            logger.info("Committed updates for %d epics", updated)
        else:
            logger.info("All epics already in sync, nothing to update")
    except Exception:
        db.rollback()
        logger.exception("Failed to recompute epic hours")
        raise
    finally:
        db.close()
    return updated


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    count = recompute()
    print(f"Updated {count} epic(s).")
