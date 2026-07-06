"""Regression tests for sprint deletion.

The bug: ``Sprint.work_items`` used ``cascade="all, delete-orphan"``, so
``db.delete(sprint)`` cascaded a DELETE to every work item in the sprint —
permanently destroying tickets. Both the endpoint docstring and the UI
("tickets will be moved to the backlog") promise the opposite: the sprint is
removed but its work items survive with ``sprint_id`` set to NULL (backlog).

These tests pin the corrected behavior: delete the sprint, keep the items.
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
from models.project import Project
from models.sprint import Sprint
from models.user import User
from models.work_item import WorkItem
from routers.workitems import delete_sprint


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
    u = User(
        id=1,
        email="pm@example.com",
        name="PM",
        role="admin",
        hashed_password="x",
    )
    db.add(u)
    db.commit()
    return u


def _make_project_with_sprint_items(db, item_count=3):
    now = datetime(2026, 1, 1, 12, 0, 0)
    proj = Project(
        id=1, name="P", description="", status="active", github_repo_urls=[], created_at=now
    )
    db.add(proj)
    sprint_row = Sprint(id=10, project_id=1, name="Sprint 1", status="active")
    db.add(sprint_row)
    db.commit()

    for i in range(item_count):
        db.add(
            WorkItem(
                id=100 + i,
                project_id=1,
                sprint_id=10,
                type="task",
                title=f"Ticket {i}",
                status="todo",
                key=f"PROJ-{100 + i}",
                estimated_hours=5,
                remaining_hours=5,
                logged_hours=0,
            )
        )
    db.commit()
    return proj, sprint_row


def test_delete_sprint_moves_items_to_backlog_not_deletes(db, user_row):
    _make_project_with_sprint_items(db, item_count=3)

    result = asyncio.run(delete_sprint(sprint_id=10, db=db, current_user=user_row))

    # Sprint is gone.
    assert db.query(Sprint).filter(Sprint.id == 10).first() is None

    # All three tickets STILL EXIST — this is the crux of the regression.
    surviving = db.query(WorkItem).all()
    assert len(surviving) == 3

    # And they've been moved to the backlog (sprint_id → NULL).
    assert all(w.sprint_id is None for w in surviving)

    # Endpoint reports how many were moved.
    assert result["ok"] is True
    assert result["items_moved_to_backlog"] == 3


def test_delete_empty_sprint_reports_zero_moved(db, user_row):
    now = datetime(2026, 1, 1, 12, 0, 0)
    db.add(
        Project(
            id=1, name="P", description="", status="active", github_repo_urls=[], created_at=now
        )
    )
    db.add(Sprint(id=10, project_id=1, name="Empty", status="planning"))
    db.commit()

    result = asyncio.run(delete_sprint(sprint_id=10, db=db, current_user=user_row))

    assert db.query(Sprint).filter(Sprint.id == 10).first() is None
    assert result["items_moved_to_backlog"] == 0


def test_delete_sprint_leaves_other_sprints_items_untouched(db, user_row):
    _make_project_with_sprint_items(db, item_count=2)
    # A second sprint with its own item that must be unaffected.
    db.add(Sprint(id=20, project_id=1, name="Sprint 2", status="planning"))
    db.add(
        WorkItem(
            id=200,
            project_id=1,
            sprint_id=20,
            type="task",
            title="Other sprint ticket",
            status="todo",
            key="PROJ-200",
            estimated_hours=3,
            remaining_hours=3,
            logged_hours=0,
        )
    )
    db.commit()

    asyncio.run(delete_sprint(sprint_id=10, db=db, current_user=user_row))

    other = db.query(WorkItem).filter(WorkItem.id == 200).first()
    assert other is not None
    assert other.sprint_id == 20  # untouched
