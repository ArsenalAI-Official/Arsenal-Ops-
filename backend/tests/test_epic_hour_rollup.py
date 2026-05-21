"""Regression tests for epic hour rollup.

The bug: `update_epic_hours` originally only summed `estimated_hours`.
After adding a child or logging hours on a child, the epic's
`logged_hours` and `remaining_hours` stayed stale, breaking math like
"allocated 25h == logged 0h + remaining 20h" while children showed
10h logged. These tests pin the corrected rollup behavior.
"""

import os
import sys
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base  # noqa: E402
from models import (  # noqa: E402, F401
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
from models.project import Project  # noqa: E402
from models.work_item import WorkItem  # noqa: E402
from routers.workitems import update_epic_hours  # noqa: E402


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


def _make_epic_with_children(db, child_specs):
    """Create one project, one epic, and N child stories/tasks with the
    given (estimated, logged, remaining) tuples. Returns the epic."""
    now = datetime(2026, 1, 1, 12, 0, 0)
    proj = Project(
        id=1, name="P", description="", status="active", github_repo_urls=[], created_at=now
    )
    db.add(proj)
    db.commit()

    epic = WorkItem(
        id=100,
        project_id=1,
        type="epic",
        title="Code optimization",
        status="todo",
        key="PROJ-100",
        estimated_hours=0,
        logged_hours=0,
        remaining_hours=0,
    )
    db.add(epic)
    db.commit()

    for idx, (est, logged, remaining) in enumerate(child_specs, start=200):
        db.add(
            WorkItem(
                id=idx,
                project_id=1,
                type="user_story",
                title=f"Story {idx}",
                status="in_progress",
                key=f"PROJ-{idx}",
                epic_id=epic.id,
                estimated_hours=est,
                logged_hours=logged,
                remaining_hours=remaining,
            )
        )
    db.commit()
    return epic


def test_rollup_sums_estimated_logged_and_remaining(db):
    """Replays the user's reported scenario: epic with 4 children
    (9+7+5+4 = 25h allocated; 5+4+0+1 = 10h logged; 4+3+5+4 = 16h
    remaining) — epic must show all three sums, not just allocated."""
    epic = _make_epic_with_children(
        db,
        [
            (9, 5, 4),  # PROJ-354 Frontend cleanup: 9h, 5h logged, 4h left
            (7, 4, 3),  # PROJ-355 Backup cleanup: 7h, 4h logged, 3h left
            (5, 0, 5),  # PROJ-356 Database cleanup: 5h, 0 logged, 5h left
            (4, 1, 4),  # PROJ-327 App perf: 4h, 1h logged, 4h left
        ],
    )

    update_epic_hours(epic.id, db)
    db.commit()
    db.refresh(epic)

    assert epic.estimated_hours == 25, "allocated must sum children"
    assert epic.logged_hours == 10, "logged_hours must roll up — this was the user's bug"
    assert epic.remaining_hours == 16, "remaining_hours must roll up too"


def test_rollup_zeroed_when_epic_has_no_children(db):
    """An epic with no children should report 0/0/0, not whatever
    stale value the row already held."""
    epic = _make_epic_with_children(db, [])
    epic.estimated_hours = 99
    epic.logged_hours = 99
    epic.remaining_hours = 99
    db.commit()

    update_epic_hours(epic.id, db)
    db.commit()
    db.refresh(epic)

    assert epic.estimated_hours == 0
    assert epic.logged_hours == 0
    assert epic.remaining_hours == 0


def test_rollup_handles_null_hour_fields(db):
    """SQLAlchemy can return None for nullable columns; the sum must
    coalesce to 0 instead of raising."""
    epic = _make_epic_with_children(db, [])
    db.add(
        WorkItem(
            id=999,
            project_id=1,
            type="user_story",
            title="Null hours",
            status="todo",
            key="PROJ-999",
            epic_id=epic.id,
            estimated_hours=None,
            logged_hours=None,
            remaining_hours=None,
        )
    )
    db.commit()

    update_epic_hours(epic.id, db)
    db.commit()
    db.refresh(epic)

    assert epic.estimated_hours == 0
    assert epic.logged_hours == 0
    assert epic.remaining_hours == 0


def test_rollup_ignores_subtasks_not_directly_under_epic(db):
    """Only children with epic_id == this epic count. A subtask whose
    parent is a child story shouldn't double-count because it has a
    parent_id but no epic_id."""
    epic = _make_epic_with_children(db, [(10, 4, 6)])
    # Add a sub-task underneath the story — has parent_id but no epic_id
    db.add(
        WorkItem(
            id=300,
            project_id=1,
            type="task",
            title="Subtask",
            status="todo",
            key="PROJ-300",
            parent_id=200,
            epic_id=None,
            estimated_hours=100,
            logged_hours=50,
            remaining_hours=50,
        )
    )
    db.commit()

    update_epic_hours(epic.id, db)
    db.commit()
    db.refresh(epic)

    assert epic.estimated_hours == 10
    assert epic.logged_hours == 4
    assert epic.remaining_hours == 6


def test_rollup_noop_on_non_epic(db):
    """Calling update_epic_hours on a story id (not an epic) must not
    mutate that story's hours."""
    _make_epic_with_children(db, [(10, 4, 6)])
    story = db.query(WorkItem).filter(WorkItem.id == 200).one()
    original = (story.estimated_hours, story.logged_hours, story.remaining_hours)

    update_epic_hours(story.id, db)
    db.commit()
    db.refresh(story)

    assert (story.estimated_hours, story.logged_hours, story.remaining_hours) == original
