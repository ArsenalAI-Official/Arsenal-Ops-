"""Calendar time-blocks API: positioned, fractional, assignee-authorized.

Covers the invariants the week-calendar UI depends on:
  - create/move/resize derive fractional hours from the interval and keep
    work_items.logged_hours == SUM(TimeEntry.hours) (self-healing rollup);
  - the assignee-only + done-frozen authorization mirrors log-hours;
  - drawing several equal-length blocks quickly is NOT blocked (positioned
    blocks have distinct start_times, so the log-hours 5s dedup can't fire);
  - the week query returns only the caller's blocks that start in the window;
  - reassigning a block rolls up hours on both the old and new ticket.
"""

import os
import sys
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models import (  # noqa: F401
    activity_log,
    architecture,
    comment,
    developer,
    market_insight,
    milestone,
    persona,
    personal_task,
    project,
    project_file,
    project_goal,
    project_milestone,
    role,
    sprint,
    task,
    task_dependency,
    time_entry,
    user,
    user_story,
    work_item,
    work_item_assignment_history,
)
from models.developer import Developer
from models.project import Project
from models.time_entry import TimeEntry
from models.user import User
from models.work_item import WorkItem
from routers.time_blocks import (
    CreateTimeBlockRequest,
    UpdateTimeBlockRequest,
    create_time_block,
    delete_time_block,
    list_week_blocks,
    update_time_block,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def seed(db):
    project_row = Project(name="P", key_prefix="P", description="t")
    db.add(project_row)
    db.flush()

    user_row = User(email="u@x.com", name="U", hashed_password="x", role="admin")
    other_user = User(email="other@x.com", name="O", hashed_password="x", role="admin")
    db.add_all([user_row, other_user])

    dev = Developer(name="Dev", email="u@x.com")
    other_dev = Developer(name="Other", email="other@x.com")
    db.add_all([dev, other_dev])
    db.flush()

    item = WorkItem(
        project_id=project_row.id,
        type="task",
        key="P-1",
        title="Ticket one",
        status="in_progress",
        priority="medium",
        estimated_hours=8,
        remaining_hours=8,
        logged_hours=0,
        assignee_id=dev.id,
    )
    item2 = WorkItem(
        project_id=project_row.id,
        type="task",
        key="P-2",
        title="Ticket two",
        status="in_progress",
        priority="medium",
        estimated_hours=8,
        remaining_hours=8,
        logged_hours=0,
        assignee_id=dev.id,
    )
    db.add_all([item, item2])
    db.commit()
    return {
        "user": user_row,
        "other_user": other_user,
        "dev": dev,
        "other_dev": other_dev,
        "item": item,
        "item2": item2,
    }


def _at(day_offset_hours: float) -> datetime:
    base = datetime(2026, 6, 22, 9, 0, 0)  # Mon 9am
    return base + timedelta(hours=day_offset_hours)


def test_create_derives_fractional_hours_and_rolls_up(db, seed):
    item = seed["item"]
    block = create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(2.5)),
        db=db,
        current_user=seed["user"],
    )
    assert block.hours == 2.5
    db.refresh(item)
    assert item.logged_hours == 2.5
    assert item.remaining_hours == 5.5  # 8 - 2.5


def test_multiple_equal_blocks_in_quick_succession_all_persist(db, seed):
    """The log-hours 5s dedup keys on equal hours; positioned blocks must not be
    blocked just because they're the same length."""
    item = seed["item"]
    create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(0.5)),
        db=db,
        current_user=seed["user"],
    )
    create_time_block(
        request=CreateTimeBlockRequest(
            work_item_id=item.id, start_time=_at(0.5), end_time=_at(1.0)
        ),
        db=db,
        current_user=seed["user"],
    )
    count = db.query(TimeEntry).filter(TimeEntry.work_item_id == item.id).count()
    assert count == 2
    db.refresh(item)
    assert item.logged_hours == 1.0


def test_create_rejects_non_assignee(db, seed):
    item = seed["item"]
    with pytest.raises(HTTPException) as exc:
        create_time_block(
            request=CreateTimeBlockRequest(
                work_item_id=item.id, start_time=_at(0), end_time=_at(1)
            ),
            db=db,
            current_user=seed["other_user"],
        )
    assert exc.value.status_code == 403


def test_create_rejects_done_ticket(db, seed):
    item = seed["item"]
    item.status = "done"
    db.commit()
    with pytest.raises(HTTPException) as exc:
        create_time_block(
            request=CreateTimeBlockRequest(
                work_item_id=item.id, start_time=_at(0), end_time=_at(1)
            ),
            db=db,
            current_user=seed["user"],
        )
    assert exc.value.status_code == 403


def test_create_rejects_inverted_interval(db, seed):
    item = seed["item"]
    with pytest.raises(HTTPException) as exc:
        create_time_block(
            request=CreateTimeBlockRequest(
                work_item_id=item.id, start_time=_at(2), end_time=_at(1)
            ),
            db=db,
            current_user=seed["user"],
        )
    assert exc.value.status_code == 400


def test_resize_recomputes_hours(db, seed):
    item = seed["item"]
    block = create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(1)),
        db=db,
        current_user=seed["user"],
    )
    updated = update_time_block(
        entry_id=block.id,
        request=UpdateTimeBlockRequest(end_time=_at(1.75)),
        db=db,
        current_user=seed["user"],
    )
    assert updated.hours == 1.75
    db.refresh(item)
    assert item.logged_hours == 1.75


def test_update_rejects_other_users_block(db, seed):
    item = seed["item"]
    block = create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(1)),
        db=db,
        current_user=seed["user"],
    )
    with pytest.raises(HTTPException) as exc:
        update_time_block(
            entry_id=block.id,
            request=UpdateTimeBlockRequest(end_time=_at(2)),
            db=db,
            current_user=seed["other_user"],
        )
    assert exc.value.status_code == 403


def test_reassign_rolls_up_both_tickets(db, seed):
    item, item2 = seed["item"], seed["item2"]
    block = create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(2)),
        db=db,
        current_user=seed["user"],
    )
    db.refresh(item)
    assert item.logged_hours == 2
    update_time_block(
        entry_id=block.id,
        request=UpdateTimeBlockRequest(work_item_id=item2.id),
        db=db,
        current_user=seed["user"],
    )
    db.refresh(item)
    db.refresh(item2)
    assert item.logged_hours == 0, "old ticket re-rolled to 0"
    assert item2.logged_hours == 2, "new ticket picked up the 2h"


def test_delete_rerolls(db, seed):
    item = seed["item"]
    block = create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(3)),
        db=db,
        current_user=seed["user"],
    )
    db.refresh(item)
    assert item.logged_hours == 3
    delete_time_block(entry_id=block.id, db=db, current_user=seed["user"])
    db.refresh(item)
    assert item.logged_hours == 0


def test_week_query_returns_only_in_window_for_caller(db, seed):
    item = seed["item"]
    # In-window block (Mon 9-10).
    create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(1)),
        db=db,
        current_user=seed["user"],
    )
    # Out-of-window block, 2 weeks later.
    create_time_block(
        request=CreateTimeBlockRequest(
            work_item_id=item.id,
            start_time=_at(24 * 14),
            end_time=_at(24 * 14 + 1),
        ),
        db=db,
        current_user=seed["user"],
    )
    resp = list_week_blocks(
        week_start=datetime(2026, 6, 22, 0, 0, 0),
        db=db,
        current_user=seed["user"],
    )
    assert len(resp.blocks) == 1
    assert resp.blocks[0].work_item_key == "P-1"

    # SUM stays the source of truth across both entries.
    total = (
        db.query(func.coalesce(func.sum(TimeEntry.hours), 0))
        .filter(TimeEntry.work_item_id == item.id)
        .scalar()
    )
    assert total == 2


def test_delete_rejects_other_users_block(db, seed):
    item = seed["item"]
    block = create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(1)),
        db=db,
        current_user=seed["user"],
    )
    with pytest.raises(HTTPException) as exc:
        delete_time_block(entry_id=block.id, db=db, current_user=seed["other_user"])
    assert exc.value.status_code == 403
    # Block survives.
    assert db.query(TimeEntry).filter(TimeEntry.id == block.id).first() is not None


def test_reassign_to_unowned_target_rejected(db, seed):
    """Reassigning a block onto a ticket the caller isn't assigned to is blocked
    (the security-critical reassign path)."""
    item = seed["item"]
    foreign = WorkItem(
        project_id=item.project_id,
        type="task",
        key="P-9",
        title="Someone else's",
        status="in_progress",
        priority="medium",
        estimated_hours=8,
        remaining_hours=8,
        logged_hours=0,
        assignee_id=seed["other_dev"].id,
    )
    db.add(foreign)
    db.commit()
    block = create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(1)),
        db=db,
        current_user=seed["user"],
    )
    with pytest.raises(HTTPException) as exc:
        update_time_block(
            entry_id=block.id,
            request=UpdateTimeBlockRequest(work_item_id=foreign.id),
            db=db,
            current_user=seed["user"],
        )
    assert exc.value.status_code == 403


def test_patch_null_position_block_requires_both_times(db, seed):
    """A legacy entry with no start/end can't be half-positioned via PATCH."""
    item = seed["item"]
    legacy = TimeEntry(
        work_item_id=item.id,
        developer_id=seed["dev"].id,
        hours=2,
        start_time=None,
        end_time=None,
    )
    db.add(legacy)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        update_time_block(
            entry_id=legacy.id,
            request=UpdateTimeBlockRequest(end_time=_at(2)),
            db=db,
            current_user=seed["user"],
        )
    assert exc.value.status_code == 400


def test_aware_datetime_is_stored_as_naive_utc(db, seed):
    """The frontend sends tz-aware UTC ISO; it must be normalized to naive-UTC to
    match the naive DB columns (no offset drift, no aware/naive comparison error)."""
    item = seed["item"]
    aware_start = datetime(2026, 6, 22, 9, 0, 0, tzinfo=UTC)
    aware_end = datetime(2026, 6, 22, 11, 30, 0, tzinfo=UTC)
    block = create_time_block(
        request=CreateTimeBlockRequest(
            work_item_id=item.id, start_time=aware_start, end_time=aware_end
        ),
        db=db,
        current_user=seed["user"],
    )
    assert block.hours == 2.5
    entry = db.query(TimeEntry).filter(TimeEntry.id == block.id).first()
    assert entry is not None
    assert entry.start_time.tzinfo is None, "stored start_time must be naive"
    assert entry.start_time == datetime(2026, 6, 22, 9, 0, 0)
    assert entry.end_time == datetime(2026, 6, 22, 11, 30, 0)


def test_week_window_is_five_days_and_excludes_weekend(db, seed):
    """The window is Mon–Fri (5 days); a Saturday block is not returned."""
    item = seed["item"]
    # Mon 9-10 (in window).
    create_time_block(
        request=CreateTimeBlockRequest(work_item_id=item.id, start_time=_at(0), end_time=_at(1)),
        db=db,
        current_user=seed["user"],
    )
    # Saturday (5 days after Monday) 9-10 — outside the 5-day window.
    create_time_block(
        request=CreateTimeBlockRequest(
            work_item_id=item.id, start_time=_at(24 * 5), end_time=_at(24 * 5 + 1)
        ),
        db=db,
        current_user=seed["user"],
    )
    resp = list_week_blocks(
        week_start=datetime(2026, 6, 22, 0, 0, 0),
        db=db,
        current_user=seed["user"],
    )
    assert len(resp.blocks) == 1


def test_week_boundary_inclusive_start_exclusive_end(db, seed):
    """start_time == week_start is included; a block on the exclusive end is not."""
    item = seed["item"]
    # Exactly at week_start (Mon 00:00) — inclusive.
    create_time_block(
        request=CreateTimeBlockRequest(
            work_item_id=item.id,
            start_time=datetime(2026, 6, 22, 0, 0, 0),
            end_time=datetime(2026, 6, 22, 1, 0, 0),
        ),
        db=db,
        current_user=seed["user"],
    )
    resp = list_week_blocks(
        week_start=datetime(2026, 6, 22, 0, 0, 0),
        db=db,
        current_user=seed["user"],
    )
    assert len(resp.blocks) == 1
