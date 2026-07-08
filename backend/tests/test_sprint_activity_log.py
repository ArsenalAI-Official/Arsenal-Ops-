"""Tests that explicit sprint operations are recorded in the activity feed.

Sprint create / update (name + dates) / complete / delete each append an
ActivityLog row with entity_type="sprint" so they surface in the project's
Activity tab. Goal- and capacity-only edits are intentionally NOT logged.
"""

import asyncio
import os
import sys
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models import (  # noqa: F401
    activity_log,
    architecture,
    developer,
    market_insight,
    persona,
    personal_task,
    project,
    project_file,
    project_goal,
    project_milestone,
    sprint,
    task,
    task_dependency,
    time_entry,
    user,
    user_story,
    work_item,
)
from models.activity_log import ActivityLog
from models.project import Project
from models.sprint import Sprint
from models.user import User
from routers.workitems import (
    SprintCreate,
    SprintUpdate,
    complete_sprint,
    create_sprint,
    delete_sprint,
    update_sprint,
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
def user_row(db):
    u = User(id=1, email="pm@example.com", name="PM", role="admin", hashed_password="x")
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def project_row(db):
    now = datetime(2026, 1, 1, 12, 0, 0)
    p = Project(
        id=1, name="P", description="", status="active", github_repo_urls=[], created_at=now
    )
    db.add(p)
    db.commit()
    return p


def _sprint_activities(db):
    return (
        db.query(ActivityLog)
        .filter(ActivityLog.entity_type == "sprint")
        .order_by(ActivityLog.id)
        .all()
    )


def _make_sprint(db, **overrides):
    fields = {
        "id": 10,
        "project_id": 1,
        "name": "Sprint 1",
        "status": "planning",
        "start_date": datetime(2026, 1, 5),
        "end_date": datetime(2026, 1, 16),
    }
    fields.update(overrides)
    s = Sprint(**fields)
    db.add(s)
    db.commit()
    return s


def test_create_sprint_logs_activity(db, user_row, project_row):
    create_sprint(
        sprint=SprintCreate(
            name="Sprint 1",
            project_id=1,
            start_date="2026-01-05",
            end_date="2026-01-16",
        ),
        db=db,
        current_user=user_row,
    )

    acts = _sprint_activities(db)
    assert len(acts) == 1
    a = acts[0]
    assert a.action == "created"
    assert a.entity_type == "sprint"
    assert a.title == "Created sprint: Sprint 1"
    assert a.details["start_date"] == "2026-01-05"
    assert a.details["end_date"] == "2026-01-16"
    assert a.user_id == user_row.id


def test_update_sprint_logs_name_and_date_changes(db, user_row, project_row):
    _make_sprint(db)

    asyncio.run(
        update_sprint(
            sprint_id=10,
            data=SprintUpdate(name="Renamed Sprint", start_date="2026-01-12"),
            db=db,
            current_user=user_row,
        )
    )

    acts = _sprint_activities(db)
    assert len(acts) == 1
    a = acts[0]
    assert a.action == "updated"
    assert a.details["name"] == {"old": "Sprint 1", "new": "Renamed Sprint"}
    assert a.details["start_date"] == {"old": "2026-01-05", "new": "2026-01-12"}
    # end_date unchanged → not recorded
    assert "end_date" not in a.details
    assert 'name "Sprint 1" → "Renamed Sprint"' in a.title


def test_update_sprint_goal_only_change_not_logged(db, user_row, project_row):
    _make_sprint(db)

    asyncio.run(
        update_sprint(
            sprint_id=10,
            data=SprintUpdate(goal="New goal", capacity_hours=80),
            db=db,
            current_user=user_row,
        )
    )

    # Neither goal nor capacity edits surface in the activity feed.
    assert _sprint_activities(db) == []


def test_complete_sprint_logs_activity(db, user_row, project_row):
    _make_sprint(db, status="active")

    complete_sprint(sprint_id=10, db=db, current_user=user_row)

    acts = _sprint_activities(db)
    assert len(acts) == 1
    assert acts[0].action == "completed"
    assert acts[0].title == "Completed sprint: Sprint 1"


def test_delete_sprint_logs_activity(db, user_row, project_row):
    _make_sprint(db)

    asyncio.run(delete_sprint(sprint_id=10, db=db, current_user=user_row))

    acts = _sprint_activities(db)
    assert len(acts) == 1
    a = acts[0]
    assert a.action == "deleted"
    assert a.title == "Deleted sprint: Sprint 1"
    # The activity row survives even though the sprint was deleted.
    assert db.query(Sprint).filter(Sprint.id == 10).first() is None
