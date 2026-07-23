"""GET /api/workitems/{id}/activity — per-item activity feed for the ticket
panel's Activity tab. Returns this item's ActivityLog entries only, gated by
project access."""

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.activity_log import ActivityLog
from models.user import User
from models.work_item import WorkItem
from routers.auth import get_password_hash
from routers.workitems import get_work_item_activity
from tests.conftest import seed_project


def _add_item(db, project, key):
    item = WorkItem(
        project_id=project.id,
        type="task",
        key=key,
        title=key,
        status="todo",
        priority="medium",
    )
    db.add(item)
    db.flush()
    return item


def _add_activity(db, project, item, user, title):
    db.add(
        ActivityLog(
            project_id=project.id,
            user_id=user.id,
            action="updated",
            entity_type="work_item",
            entity_id=item.id,
            title=title,
        )
    )


def test_activity_endpoint_returns_only_this_items_entries(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    item = _add_item(db, project, "P-1")
    other = _add_item(db, project, "P-2")
    _add_activity(db, project, item, user, "Updated P-1")
    _add_activity(db, project, other, user, "Updated P-2")
    db.commit()

    res = get_work_item_activity(item.id, db=db, current_user=user)
    assert len(res) == 1
    assert res[0]["entity_id"] == item.id
    assert res[0]["title"] == "Updated P-1"


def test_activity_endpoint_forbidden_without_project_access(db):
    project = seed_project(db)
    item = _add_item(db, project, "P-1")
    db.commit()
    # A user with no capabilities and no membership on the project.
    outsider = User(
        email="outsider@test.local",
        name="Outsider",
        role="viewer",
        is_active=True,
        is_first_login=False,
        hashed_password=get_password_hash("x"),
    )
    db.add(outsider)
    db.commit()

    with pytest.raises(HTTPException) as exc:
        get_work_item_activity(item.id, db=db, current_user=outsider)
    assert exc.value.status_code == 403
