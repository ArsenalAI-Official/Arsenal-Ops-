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
from models.work_item import WorkItem
from routers.workitems import update_epic_hours


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


def test_rollup_includes_change_order_children(db):
    """A Change Order child (like Story/Task/Bug) must roll its own hours
    up into the epic's totals."""
    epic = _make_epic_with_children(db, [(9, 5, 4)])  # one story: 9/5/4
    db.add(
        WorkItem(
            id=400,
            project_id=1,
            type="change_order",
            title="Scope change",
            status="in_progress",
            key="PROJ-400",
            epic_id=epic.id,
            estimated_hours=6,
            logged_hours=2,
            remaining_hours=4,
        )
    )
    db.commit()

    update_epic_hours(epic.id, db)
    db.commit()
    db.refresh(epic)

    assert epic.estimated_hours == 15, "change order estimate must be included"
    assert epic.logged_hours == 7, "change order logged hours must be included"
    assert epic.remaining_hours == 8, "change order remaining hours must be included"


def test_rollup_includes_subtasks_under_change_order(db):
    """3rd-level rollup: a Subtask whose parent is a Change Order must roll up
    into the epic, exactly as subtasks under a Story/Task/Bug do."""
    now = datetime(2026, 1, 1, 12, 0, 0)
    db.add(
        Project(
            id=1, name="P", description="", status="active", github_repo_urls=[], created_at=now
        )
    )
    db.commit()
    epic = WorkItem(
        id=100,
        project_id=1,
        type="epic",
        title="E",
        status="todo",
        key="PROJ-100",
        estimated_hours=0,
        logged_hours=0,
        remaining_hours=0,
    )
    db.add(epic)
    db.commit()
    co = WorkItem(
        id=200,
        project_id=1,
        type="change_order",
        title="CO",
        status="in_progress",
        key="PROJ-200",
        epic_id=epic.id,
        estimated_hours=6,
        logged_hours=2,
        remaining_hours=4,
    )
    db.add(co)
    db.commit()
    db.add(
        WorkItem(
            id=300,
            project_id=1,
            type="subtask",
            title="ST",
            status="todo",
            key="PROJ-300",
            parent_id=co.id,
            epic_id=None,
            estimated_hours=3,
            logged_hours=1,
            remaining_hours=2,
        )
    )
    db.commit()

    update_epic_hours(epic.id, db)
    db.commit()
    db.refresh(epic)

    assert epic.estimated_hours == 9, "CO (6) + its subtask (3)"
    assert epic.logged_hours == 3, "CO (2) + its subtask (1)"
    assert epic.remaining_hours == 6, "CO (4) + its subtask (2)"


def test_change_order_rolls_up_identically_to_user_story(db):
    """Parity check: two identical epics — one whose child is a user_story, the
    other a change_order, each with an identical subtask — must produce
    identical epic totals. Proves CO is treated exactly like Story/Task/Bug."""
    now = datetime(2026, 1, 1, 12, 0, 0)
    db.add(
        Project(
            id=1, name="P", description="", status="active", github_repo_urls=[], created_at=now
        )
    )
    db.commit()

    def build(epic_id, child_id, child_type, subtask_id):
        epic = WorkItem(
            id=epic_id,
            project_id=1,
            type="epic",
            title="E",
            status="todo",
            key=f"PROJ-{epic_id}",
            estimated_hours=0,
            logged_hours=0,
            remaining_hours=0,
        )
        child = WorkItem(
            id=child_id,
            project_id=1,
            type=child_type,
            title="C",
            status="in_progress",
            key=f"PROJ-{child_id}",
            epic_id=epic_id,
            estimated_hours=8,
            logged_hours=5,
            remaining_hours=3,
        )
        subtask = WorkItem(
            id=subtask_id,
            project_id=1,
            type="subtask",
            title="S",
            status="todo",
            key=f"PROJ-{subtask_id}",
            parent_id=child_id,
            estimated_hours=4,
            logged_hours=1,
            remaining_hours=3,
        )
        db.add_all([epic, child, subtask])
        db.commit()
        update_epic_hours(epic_id, db)
        db.commit()
        db.refresh(epic)
        return epic

    story_epic = build(100, 200, "user_story", 300)
    co_epic = build(101, 201, "change_order", 301)

    story_totals = (story_epic.estimated_hours, story_epic.logged_hours, story_epic.remaining_hours)
    co_totals = (co_epic.estimated_hours, co_epic.logged_hours, co_epic.remaining_hours)
    assert co_totals == story_totals, "CO epic must match user_story epic exactly"
    assert co_totals == (12, 6, 6), "child (8/5/3) + subtask (4/1/3)"


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
