"""Tests for the workitems N+1 fixes (PR 4).

Covers two hot endpoints:

* ``list_work_items`` — verifies that ``item.assignee.name`` and
  ``item.sprint.name`` access no longer triggers per-item lazy loads.
* ``my_tasks`` — verifies that the per-item project lookup is replaced
  by one batched query, and that ``item.parent.key`` / ``item.epic.key``
  / ``item.sprint.name`` are eager-loaded.

Both endpoints are called as plain functions with their dependencies
passed explicitly, which works because FastAPI's ``Depends(...)`` only
runs during request dispatch — direct calls bypass it entirely.
"""

import os
import sys
from datetime import datetime

import pytest
from sqlalchemy import create_engine, event
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
from models.developer import Developer
from models.project import Project
from models.sprint import Sprint
from models.user import User
from models.work_item import WorkItem
from routers.workitems import get_my_tasks, list_work_items


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
    """Two projects, one developer, two sprints, eight work items
    (epics + stories + tasks, varied sprints and statuses)."""
    now = datetime(2026, 1, 1, 12, 0, 0)

    user = User(  # noqa: F811 — shadows `models.user` module import (side-effect only)
        id=1, email="dev@x.com", name="Dev", role="developer", is_active=True, is_first_login=False
    )
    db.add(user)

    p1 = Project(
        id=1, name="Alpha", description="d1", status="active", github_repo_urls=[], created_at=now
    )
    p2 = Project(
        id=2, name="Beta", description="d2", status="planning", github_repo_urls=[], created_at=now
    )
    db.add_all([p1, p2])
    db.commit()

    dev = Developer(id=10, name="Dev", email="dev@x.com")
    db.add(dev)
    db.commit()

    s1 = Sprint(
        id=100,
        project_id=1,
        name="Sprint 1",
        status="active",
        start_date=datetime(2026, 1, 1),
        end_date=datetime(2026, 1, 14),
    )
    s2 = Sprint(
        id=101,
        project_id=2,
        name="Sprint 2",
        status="active",
        start_date=datetime(2026, 2, 1),
        end_date=datetime(2026, 2, 14),
    )
    db.add_all([s1, s2])
    db.commit()

    epic = WorkItem(
        id=200, project_id=1, type="epic", title="Epic A", status="in_progress", key="A-EPIC"
    )
    parent = WorkItem(id=201, project_id=1, type="story", title="Story P", status="todo", key="A-1")
    db.add_all([epic, parent])
    db.commit()

    db.add_all(
        [
            # Assigned to our developer
            WorkItem(
                id=210,
                project_id=1,
                type="task",
                title="t1",
                status="in_progress",
                key="A-2",
                assignee_id=10,
                sprint_id=100,
                parent_id=201,
                epic_id=200,
                story_points=3,
                estimated_hours=8,
            ),
            WorkItem(
                id=211,
                project_id=1,
                type="task",
                title="t2",
                status="done",
                key="A-3",
                assignee_id=10,
                sprint_id=100,
                parent_id=None,
                epic_id=200,
                story_points=2,
                estimated_hours=4,
            ),
            WorkItem(
                id=212,
                project_id=2,
                type="task",
                title="t3",
                status="todo",
                key="B-1",
                assignee_id=10,
                sprint_id=101,
                parent_id=None,
                epic_id=None,
                story_points=5,
                estimated_hours=12,
            ),
            # Not assigned to our developer
            WorkItem(
                id=213,
                project_id=1,
                type="task",
                title="t4-other",
                status="todo",
                key="A-4",
                assignee_id=None,
                sprint_id=100,
            ),
        ]
    )
    db.commit()

    return {"user": user, "developer": dev, "projects": [p1, p2]}


# ---------------------------------------------------------------------------
# list_work_items
# ---------------------------------------------------------------------------


class TestListWorkItems:
    def test_returns_all_items_with_assignee_and_sprint_names(self, db, seed):
        result = list_work_items(db=db, current_user=seed["user"], limit=500, offset=0)

        # 4 work items minus the parent (id=201) and epic (id=200)? No —
        # list_work_items returns ALL work items (including epics, stories,
        # tasks). Filter set to None for everything → 6 items total.
        assert len(result) == 6

        # Find the assigned-to-dev tasks and verify enriched fields.
        by_key = {r["key"]: r for r in result}
        t1 = by_key["A-2"]
        assert t1["assignee"] == "Dev"
        assert t1["sprint"] == "Sprint 1"
        assert t1["parent_key"] == "A-1"
        assert t1["epic_key"] == "A-EPIC"

        # Item with no assignee gets the "Unassigned" placeholder.
        assert by_key["A-4"]["assignee"] == "Unassigned"

        # Item with no sprint gets the "Backlog" placeholder.
        assert by_key["A-EPIC"]["sprint"] == "Backlog"

    def test_project_filter_works(self, db, seed):
        result = list_work_items(
            db=db, current_user=seed["user"], project_id=2, limit=500, offset=0
        )
        assert {r["key"] for r in result} == {"B-1"}

    def test_query_count_does_not_grow_with_item_count(self, db, seed):
        """Pre-PR-4: ``item.assignee.name`` + ``item.sprint.name`` were
        per-item lazy loads. Now they should be eager-loaded in a single
        IN(...) query each."""
        engine = db.get_bind()
        count = {"n": 0}

        @event.listens_for(engine, "before_cursor_execute")
        def _inc(conn, cursor, statement, parameters, context, executemany):
            count["n"] += 1

        try:
            list_work_items(db=db, current_user=seed["user"], limit=500, offset=0)
        finally:
            event.remove(engine, "before_cursor_execute", _inc)

        # Expected: count(*) for X-Total-Count header + main query +
        # parent/epic batch + assignee selectinload + sprint selectinload = 5
        # queries. Pagination adds the COUNT(*) query.
        assert count["n"] <= 6, f"list_work_items issued {count['n']} queries; expected ≤ 6"


# ---------------------------------------------------------------------------
# my_tasks
# ---------------------------------------------------------------------------


class TestMyTasks:
    def test_returns_only_developer_assigned_items(self, db, seed):
        result = get_my_tasks(db=db, current_user=seed["user"])
        assert {r["key"] for r in result} == {"A-2", "A-3", "B-1"}

    def test_enriches_with_project_name_parent_epic_sprint(self, db, seed):
        result = get_my_tasks(db=db, current_user=seed["user"])
        by_key = {r["key"]: r for r in result}

        a2 = by_key["A-2"]
        assert a2["project_name"] == "Alpha"
        assert a2["parent_key"] == "A-1"
        assert a2["epic_key"] == "A-EPIC"
        assert a2["sprint"] == "Sprint 1"
        assert a2["assignee"] == "Dev"

        b1 = by_key["B-1"]
        assert b1["project_name"] == "Beta"
        assert b1["sprint"] == "Sprint 2"
        assert b1["parent_key"] is None
        assert b1["epic_key"] is None

    def test_returns_empty_when_developer_has_no_account(self, db, seed):
        ghost = User(
            id=99,
            email="ghost@x.com",
            name="Ghost",
            role="developer",
            is_active=True,
            is_first_login=False,
        )
        result = get_my_tasks(db=db, current_user=ghost)
        assert result == []

    def test_query_count_constant_regardless_of_item_count(self, db, seed):
        """The smoking gun fix: pre-PR-4 each item ran a separate
        ``SELECT * FROM projects WHERE id = ?`` plus three lazy loads.
        Now: 1 developer lookup + 1 work_items + 3 selectinloads + 1
        projects-batch = 6 queries, independent of item count."""
        engine = db.get_bind()
        count = {"n": 0}

        @event.listens_for(engine, "before_cursor_execute")
        def _inc(conn, cursor, statement, parameters, context, executemany):
            count["n"] += 1

        try:
            get_my_tasks(db=db, current_user=seed["user"])
        finally:
            event.remove(engine, "before_cursor_execute", _inc)

        # Allow a small ceiling for SQLAlchemy housekeeping; the merge
        # criterion is Q ≤ 10. We expect ~6.
        assert count["n"] <= 8, f"my_tasks issued {count['n']} queries; expected ≤ 8"

    def test_query_count_constant_with_more_items(self, db, seed):
        """Add 10 more items assigned to our developer; query count must
        not grow."""
        dev_id = seed["developer"].id
        for i in range(300, 310):
            db.add(
                WorkItem(
                    id=i,
                    project_id=1,
                    type="task",
                    title=f"extra-{i}",
                    status="todo",
                    key=f"A-{i}",
                    assignee_id=dev_id,
                    sprint_id=100,
                )
            )
        db.commit()

        engine = db.get_bind()
        count = {"n": 0}

        @event.listens_for(engine, "before_cursor_execute")
        def _inc(conn, cursor, statement, parameters, context, executemany):
            count["n"] += 1

        try:
            result = get_my_tasks(db=db, current_user=seed["user"])
        finally:
            event.remove(engine, "before_cursor_execute", _inc)

        assert len(result) == 13  # 3 from seed + 10 new
        assert count["n"] <= 8, (
            f"my_tasks issued {count['n']} queries for 13 items; expected ≤ 8 (constant)"
        )
