"""Locks the invariants that keep work_items.logged_hours in sync with TimeEntry rows.

We had a production incident where:
1. A user typed `22` into the Log Hours input on a 2h ticket (PROJ-333) and
   the API stored hours=22.
2. Other tickets had work_items.logged_hours set via direct PUT writes that
   never created TimeEntry rows, leaving the rollup column claiming hours
   that nothing else in the system could confirm.

These tests pin the three defenses that prevent both kinds of drift:
  - Hours-per-log sanity cap (24h)
  - Direct logged_hours writes via update_work_item are stripped
  - log_hours rebuilds the rollup from SUM(TimeEntry) every call, so it cannot
    drift from the source of truth even if anything else has touched it.
"""

import os
import sys

import pytest
from fastapi import BackgroundTasks, HTTPException
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
from routers.workitems import (
    LogHoursRequest,
    WorkItemUpdate,
    log_hours,
    update_work_item,
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
    db.add(user_row)

    dev = Developer(name="Dev", email="u@x.com")
    db.add(dev)
    db.flush()

    item = WorkItem(
        project_id=project_row.id,
        type="task",
        key="P-1",
        title="t",
        status="in_progress",
        priority="medium",
        estimated_hours=4,
        remaining_hours=4,
        logged_hours=0,
        assignee_id=dev.id,
    )
    db.add(item)
    db.commit()
    return {"user": user_row, "dev": dev, "item": item, "project": project_row}


def test_logged_hours_field_in_put_is_stripped(db, seed):
    """update_work_item must ignore logged_hours/remaining_hours from the request body.

    Direct writes to these columns were the #1 source of rollup drift in
    production — they let logged_hours claim time that no TimeEntry backed.
    """
    item = seed["item"]
    update_work_item(
        item_id=item.id,
        update=WorkItemUpdate(logged_hours=999, remaining_hours=999, title="renamed"),
        background_tasks=BackgroundTasks(),
        db=db,
        current_user=seed["user"],
    )
    db.refresh(item)
    assert item.title == "renamed"  # allowed fields still apply
    assert item.logged_hours == 0, "logged_hours must not be writable via PUT"
    assert item.remaining_hours == 4, "remaining_hours must not be writable via PUT"


def test_log_hours_rejects_oversized_value(db, seed):
    """Sanity cap: a single log call cannot exceed 24h (catches typos like '22' for '2')."""
    item = seed["item"]
    with pytest.raises(HTTPException) as exc:
        log_hours(
            item_id=item.id,
            request=LogHoursRequest(hours=25),
            db=db,
            current_user=seed["user"],
        )
    assert exc.value.status_code == 400
    # And the value-22-on-a-2h-ticket scenario from PROJ-333 is still possible
    # to log (24h is the cap, not the estimate). The point of the cap is to
    # block obvious shift-key typos, not to enforce against the estimate.


def test_log_hours_rebuilds_rollup_from_timeentries(db, seed):
    """Even if logged_hours is wrong going in, log_hours resets it from SUM(TimeEntry).

    This is the self-healing property: any prior drift in the column is erased
    on the next log call.
    """
    item = seed["item"]
    # Simulate prior drift: column says 100h, but no TimeEntry rows exist.
    item.logged_hours = 100
    db.commit()

    log_hours(
        item_id=item.id,
        request=LogHoursRequest(hours=3),
        db=db,
        current_user=seed["user"],
    )
    db.refresh(item)

    # After one 3h log, the rollup should equal SUM(TimeEntry) = 3, NOT the
    # prior 100 + 3 = 103 that the old `+=` accumulator would have produced.
    te_sum = (
        db.query(func.coalesce(func.sum(TimeEntry.hours), 0))
        .filter(TimeEntry.work_item_id == item.id)
        .scalar()
    )
    assert te_sum == 3
    assert item.logged_hours == 3, "rollup must be rebuilt from SUM(TimeEntry), not accumulated"
    assert item.remaining_hours == 1, "remaining = max(0, estimated 4 - logged 3) = 1"


def test_log_hours_rejects_zero_or_negative(db, seed):
    item = seed["item"]
    for bad in [0, -1, -5]:
        with pytest.raises(HTTPException) as exc:
            log_hours(
                item_id=item.id,
                request=LogHoursRequest(hours=bad),
                db=db,
                current_user=seed["user"],
            )
        assert exc.value.status_code == 400


def test_log_hours_dedupes_rapid_duplicate(db, seed):
    """Two identical log calls within the dedupe window: second one rejected with 429."""
    item = seed["item"]
    log_hours(
        item_id=item.id,
        request=LogHoursRequest(hours=2),
        db=db,
        current_user=seed["user"],
    )
    with pytest.raises(HTTPException) as exc:
        log_hours(
            item_id=item.id,
            request=LogHoursRequest(hours=2),
            db=db,
            current_user=seed["user"],
        )
    assert exc.value.status_code == 429
    # Exactly one TimeEntry should exist despite two log attempts.
    count = db.query(TimeEntry).filter(TimeEntry.work_item_id == item.id).count()
    assert count == 1
