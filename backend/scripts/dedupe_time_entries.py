"""Dedupe TimeEntry rows created by rapid-click duplicate POSTs.

The "Log Hours" button used to fire on every click without disabling itself or
deduping on the backend, so a single user action could create many identical
TimeEntry rows. PROJ-333 was the worst case: 11 entries of 2h each = 22h on a
2h-estimated ticket.

This script collapses near-simultaneous identical entries:
  group_key = (work_item_id, developer_id, hours)
  Within each group, any rows logged within `--window-seconds` of an earlier
  row are considered duplicates of it and deleted. The earliest entry in each
  cluster is kept.

After deletion, `work_items.logged_hours` is recomputed from the surviving
TimeEntry rows so the rollup column matches the source of truth.

Idempotent — safe to re-run; subsequent runs find nothing to do.

Usage:
    cd backend
    # Dry run first — prints what WOULD be deleted, changes nothing.
    python -m scripts.dedupe_time_entries --dry-run

    # Apply.
    python -m scripts.dedupe_time_entries

    # Tune the dedupe window (default 60s). Genuine logs from one user on one
    # ticket usually have minutes/hours between them; raise this if you have
    # legitimate burst-logging patterns.
    python -m scripts.dedupe_time_entries --window-seconds 30

    # Scope to one ticket while testing.
    python -m scripts.dedupe_time_entries --work-item-id 333 --dry-run
"""

import argparse
import logging
import sys
from collections import defaultdict
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import func  # noqa: E402

import models  # noqa: F401, E402
from database import SessionLocal  # noqa: E402
from models import activity_log as _activity_log  # noqa: F401, E402
from models import architecture as _architecture  # noqa: F401, E402
from models import user as _user  # noqa: F401, E402
from models.time_entry import TimeEntry  # noqa: E402
from models.work_item import WorkItem  # noqa: E402

logger = logging.getLogger(__name__)


def dedupe(window_seconds: int, dry_run: bool, work_item_id: int | None) -> dict:
    db = SessionLocal()
    deleted_ids: list[int] = []
    affected_work_items: set[int] = set()
    clusters_collapsed = 0

    try:
        entries_q = db.query(TimeEntry).order_by(
            TimeEntry.work_item_id,
            TimeEntry.developer_id,
            TimeEntry.hours,
            TimeEntry.logged_at,
        )
        if work_item_id is not None:
            entries_q = entries_q.filter(TimeEntry.work_item_id == work_item_id)
        entries = entries_q.all()
        logger.info("Scanning %d time entries (window=%ds)", len(entries), window_seconds)

        # Bucket by (work_item_id, developer_id, hours), preserving order.
        groups: dict[tuple, list[TimeEntry]] = defaultdict(list)
        for te in entries:
            groups[(te.work_item_id, te.developer_id, te.hours)].append(te)

        window = timedelta(seconds=window_seconds)

        for _key, group in groups.items():
            if len(group) < 2:
                continue
            # Walk in order. The first entry in each cluster is the keeper;
            # subsequent entries whose logged_at is within `window` of the
            # keeper are flagged as duplicates. As soon as we see an entry
            # outside the window, it starts a new cluster (new keeper).
            keeper = group[0]
            cluster_start_count = 1
            for te in group[1:]:
                if (
                    te.logged_at
                    and keeper.logged_at
                    and (te.logged_at - keeper.logged_at) <= window
                ):
                    deleted_ids.append(te.id)
                    affected_work_items.add(te.work_item_id)
                    cluster_start_count += 1
                else:
                    if cluster_start_count > 1:
                        clusters_collapsed += 1
                    keeper = te
                    cluster_start_count = 1
            if cluster_start_count > 1:
                clusters_collapsed += 1

        if deleted_ids:
            logger.info(
                "Found %d duplicate entries in %d clusters across %d work item(s)",
                len(deleted_ids),
                clusters_collapsed,
                len(affected_work_items),
            )
            if dry_run:
                # Show a per-work-item summary so the operator can sanity-check.
                id_set = set(deleted_ids)
                deleted_by_wi: dict[int, list[TimeEntry]] = defaultdict(list)
                for te in entries:
                    if te.id in id_set:
                        deleted_by_wi[te.work_item_id].append(te)
                for wid, rows in deleted_by_wi.items():
                    wi = db.query(WorkItem).filter(WorkItem.id == wid).first()
                    label = wi.key if wi else f"id={wid}"
                    sample = ", ".join(
                        f"id={t.id} hours={t.hours} at={t.logged_at.isoformat() if t.logged_at else '?'}"
                        for t in rows[:5]
                    )
                    more = f" (+{len(rows) - 5} more)" if len(rows) > 5 else ""
                    logger.info(
                        "  %s: would delete %d duplicate row(s) [%s%s]",
                        label,
                        len(rows),
                        sample,
                        more,
                    )
            else:
                db.query(TimeEntry).filter(TimeEntry.id.in_(deleted_ids)).delete(
                    synchronize_session=False
                )

                # Recompute logged_hours on every affected work item from the
                # surviving TimeEntry rows. Also fix remaining_hours since it's
                # derived from estimated - logged.
                for wid in affected_work_items:
                    new_logged = (
                        db.query(func.coalesce(func.sum(TimeEntry.hours), 0))
                        .filter(TimeEntry.work_item_id == wid)
                        .scalar()
                    ) or 0
                    wi = db.query(WorkItem).filter(WorkItem.id == wid).first()
                    if wi is None:
                        continue
                    old_logged = wi.logged_hours or 0
                    wi.logged_hours = int(new_logged)
                    wi.remaining_hours = max(0, (wi.estimated_hours or 0) - int(new_logged))
                    logger.info(
                        "  %s: logged_hours %d -> %d (remaining now %d)",
                        wi.key,
                        old_logged,
                        wi.logged_hours,
                        wi.remaining_hours,
                    )
                db.commit()
                logger.info(
                    "Deleted %d duplicate TimeEntry rows and resynced rollups", len(deleted_ids)
                )
        else:
            logger.info("No duplicate clusters found within window. Nothing to do.")

    except Exception:
        db.rollback()
        logger.exception("Dedupe failed; rolled back")
        raise
    finally:
        db.close()

    return {
        "scanned": len(entries),
        "duplicates_found": len(deleted_ids),
        "clusters": clusters_collapsed,
        "affected_work_items": len(affected_work_items),
        "applied": not dry_run and bool(deleted_ids),
    }


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
        "--window-seconds",
        type=int,
        default=60,
        help="Two identical entries logged within this many seconds are treated as duplicates (default: 60).",
    )
    parser.add_argument(
        "--work-item-id",
        type=int,
        default=None,
        help="Optional: limit scan to one work item id (useful for testing).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    summary = dedupe(
        window_seconds=args.window_seconds,
        dry_run=args.dry_run,
        work_item_id=args.work_item_id,
    )
    mode = "DRY RUN" if args.dry_run else "APPLIED"
    print(
        f"[{mode}] scanned={summary['scanned']} duplicates_found={summary['duplicates_found']} "
        f"clusters={summary['clusters']} affected_work_items={summary['affected_work_items']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
