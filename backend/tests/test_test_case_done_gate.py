"""The User-Story → Test-Case done gate.

A User Story cannot be marked done while any of its test cases are still open.
Mirrors the existing subtask done-gate, enforced in ``update_work_item`` (and
``batch_update_status``) in routers/workitems.py.
"""

import os
import sys

import pytest
from fastapi import BackgroundTasks, HTTPException
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
from models.project import Project
from models.user import User
from models.work_item import WorkItem
from routers.workitems import WorkItemUpdate, update_work_item


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
    """A project, an admin user, a story, and one open test case under it."""
    project_row = Project(name="P", key_prefix="P", description="t")
    db.add(project_row)
    db.flush()

    user_row = User(email="u@x.com", name="U", hashed_password="x", role="admin")
    db.add(user_row)

    story = WorkItem(
        project_id=project_row.id,
        type="user_story",
        key="P-1",
        title="Story",
        status="in_progress",
        priority="medium",
    )
    db.add(story)
    db.flush()

    tc = WorkItem(
        project_id=project_row.id,
        type="test_case",
        key="P-2",
        title="Login works",
        status="todo",
        priority="medium",
        parent_id=story.id,
    )
    db.add(tc)
    db.commit()
    return {"user": user_row, "project": project_row, "story": story, "tc": tc}


def _mark_done(db, item, actor):
    return update_work_item(
        item_id=item.id,
        update=WorkItemUpdate(status="done"),
        background_tasks=BackgroundTasks(),
        db=db,
        current_user=actor,
    )


def test_story_cannot_close_with_open_test_case(db, seed):
    with pytest.raises(HTTPException) as exc:
        _mark_done(db, seed["story"], seed["user"])
    assert exc.value.status_code == 400
    assert "test case" in str(exc.value.detail).lower()
    db.refresh(seed["story"])
    assert seed["story"].status != "done", "story must not have been closed"


def test_story_closes_once_all_test_cases_done(db, seed):
    seed["tc"].status = "done"
    db.commit()
    _mark_done(db, seed["story"], seed["user"])
    db.refresh(seed["story"])
    assert seed["story"].status == "done"


def test_story_with_no_test_cases_closes(db, seed):
    # Remove the only test case; the story should then close freely.
    db.delete(seed["tc"])
    db.commit()
    _mark_done(db, seed["story"], seed["user"])
    db.refresh(seed["story"])
    assert seed["story"].status == "done"


def test_gate_message_names_the_open_test_case(db, seed):
    with pytest.raises(HTTPException) as exc:
        _mark_done(db, seed["story"], seed["user"])
    # The message should point the user at the specific open test case (P-2).
    assert "P-2" in str(exc.value.detail)
