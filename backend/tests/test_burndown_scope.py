"""Burndown must scope each day to items that EXISTED on that day.

Regression: the series used the current total item count for all 14 days, so a
ticket created today showed as "remaining" on days before it existed.
"""

import os
import sys
from datetime import timedelta

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.work_item import WorkItem
from routers.workitems import get_project_analytics, get_project_burndown
from tests.conftest import seed_project
from time_utils import utcnow


def _add(db, project, key, *, status, created_at, completed_at=None):
    db.add(
        WorkItem(
            project_id=project.id,
            type="task",
            key=key,
            title=key,
            status=status,
            priority="medium",
            created_at=created_at,
            completed_at=completed_at,
        )
    )


def test_items_created_today_not_counted_on_past_days(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    now = utcnow()
    # Two tasks created AND completed today (the reported scenario).
    _add(db, project, "BD-1", status="done", created_at=now, completed_at=now)
    _add(db, project, "BD-2", status="done", created_at=now, completed_at=now)
    db.commit()

    bd = get_project_analytics(project.id, db=db, current_user=user)["burndown_data"]
    assert len(bd) == 15  # 14 days ago … today

    # 14 days ago: neither ticket existed → nothing remaining, nothing done.
    assert bd[0]["remaining"] == 0
    assert bd[0]["completed"] == 0

    # Today: both existed and are done → 0 remaining, 2 completed.
    assert bd[-1]["remaining"] == 0
    assert bd[-1]["completed"] == 2


def test_remaining_appears_only_from_creation_day(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    now = utcnow()
    # One still-open task created 5 days ago.
    _add(db, project, "OLD-1", status="todo", created_at=now - timedelta(days=5))
    db.commit()

    bd = get_project_analytics(project.id, db=db, current_user=user)["burndown_data"]
    # bd[j] is (14 - j) days ago.
    assert bd[0]["remaining"] == 0  # 14 days ago — before it existed
    assert bd[8]["remaining"] == 0  # 6 days ago — still before creation
    assert bd[9]["remaining"] == 1  # 5 days ago — creation day
    assert bd[-1]["remaining"] == 1  # today — still open


def test_burndown_endpoint_explicit_range(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    now = utcnow()
    _add(db, project, "R-1", status="todo", created_at=now - timedelta(days=3))
    db.commit()

    res = get_project_burndown(
        project.id,
        start=(now - timedelta(days=2)).date().isoformat(),
        end=now.date().isoformat(),
        db=db,
        current_user=user,
    )
    bd = res["burndown_data"]
    assert len(bd) == 3  # inclusive: 2 days ago, 1 day ago, today
    assert all(p["remaining"] == 1 for p in bd)  # existed (created 3 days ago) on all three


def test_burndown_endpoint_defaults_to_14_days(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    res = get_project_burndown(project.id, db=db, current_user=user)
    assert len(res["burndown_data"]) == 14  # end=today, start=today-13, inclusive


def test_burndown_endpoint_rejects_bad_date(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    with pytest.raises(HTTPException) as exc:
        get_project_burndown(project.id, start="nope", end=None, db=db, current_user=user)
    assert exc.value.status_code == 422


def test_burndown_endpoint_rejects_reversed_range(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    with pytest.raises(HTTPException) as exc:
        get_project_burndown(
            project.id, start="2026-07-10", end="2026-07-01", db=db, current_user=user
        )
    assert exc.value.status_code == 422
