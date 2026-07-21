"""Edit-audit trail: EVERY work-item field edit is captured as a comment +
activity-log entry, not just status/assignee changes.

Enforced in ``update_work_item`` (general field diff) and ``batch_update_status``
(bulk status) in routers/workitems.py.
"""

import os
import sys

import pytest
from fastapi import BackgroundTasks
from sqlalchemy import create_engine
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
from models.activity_log import ActivityLog
from models.comment import Comment
from models.project import Project
from models.user import User
from models.work_item import WorkItem
from routers.workitems import (
    BatchStatusUpdate,
    WorkItemUpdate,
    batch_update_status,
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

    item = WorkItem(
        project_id=project_row.id,
        type="task",
        key="P-1",
        title="Original",
        status="in_progress",
        priority="medium",
        story_points=1,
        estimated_hours=4,
        remaining_hours=4,
    )
    db.add(item)
    db.commit()
    return {"user": user_row, "item": item, "project": project_row}


def _update(db, item, actor, **fields):
    return update_work_item(
        item_id=item.id,
        update=WorkItemUpdate(**fields),
        background_tasks=BackgroundTasks(),
        db=db,
        current_user=actor,
    )


def _comments(db, item):
    return db.query(Comment).filter(Comment.work_item_id == item.id).all()


def _edit_comments(db, item):
    return [c for c in _comments(db, item) if c.content.startswith("Edited")]


def _activities(db, item):
    return (
        db.query(ActivityLog)
        .filter(ActivityLog.entity_type == "work_item", ActivityLog.entity_id == item.id)
        .all()
    )


def test_editing_a_field_creates_comment_and_activity(db, seed):
    _update(db, seed["item"], seed["user"], priority="high")

    edits = _edit_comments(db, seed["item"])
    assert len(edits) == 1
    assert "Priority" in edits[0].content
    assert "high" in edits[0].content

    acts = _activities(db, seed["item"])
    edit_acts = [a for a in acts if a.details and "changes" in a.details]
    assert len(edit_acts) == 1
    changed_fields = {c["field"] for c in edit_acts[0].details["changes"]}
    assert changed_fields == {"priority"}
    change = edit_acts[0].details["changes"][0]
    assert change["old_value"] == "medium"
    assert change["new_value"] == "high"


def test_multiple_fields_captured_in_one_summary(db, seed):
    _update(db, seed["item"], seed["user"], title="Renamed", story_points=5)

    edits = _edit_comments(db, seed["item"])
    assert len(edits) == 1
    assert "Title" in edits[0].content
    assert "Story points" in edits[0].content

    edit_acts = [a for a in _activities(db, seed["item"]) if a.details and "changes" in a.details]
    assert len(edit_acts) == 1
    assert {c["field"] for c in edit_acts[0].details["changes"]} == {"title", "story_points"}


def test_no_op_edit_records_nothing(db, seed):
    # Same values → no diff → no audit comment or activity.
    _update(db, seed["item"], seed["user"], priority="medium", story_points=1)
    assert _edit_comments(db, seed["item"]) == []
    assert [a for a in _activities(db, seed["item"]) if a.details and "changes" in a.details] == []


def test_description_change_is_opaque(db, seed):
    _update(db, seed["item"], seed["user"], description="A long description body")
    edits = _edit_comments(db, seed["item"])
    assert len(edits) == 1
    assert "Description updated" in edits[0].content


def test_batch_status_change_is_audited(db, seed):
    # Bulk status changes were previously silent — now they log too.
    batch_update_status(
        update=BatchStatusUpdate(item_ids=[str(seed["item"].id)], status="in_review"),
        db=db,
        current_user=seed["user"],
    )
    assert any(c.content == "Moved to In Review" for c in _comments(db, seed["item"]))
    assert any(a.action == "updated" for a in _activities(db, seed["item"]))
