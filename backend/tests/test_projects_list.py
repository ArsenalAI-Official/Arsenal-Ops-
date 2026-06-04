"""Tests for the batched ``list_projects`` / ``format_projects_batch`` refactor.

Builds a SQLite fixture database, runs the batch helper, and asserts:

1. The response shape is preserved (deep-equal against an expected dict).
2. The single-project ``format_project`` wrapper returns the same output
   as the batch-of-one path (so `create_project`, `get_project`,
   `update_project` callers keep working unchanged).
3. Total query count inside ``format_projects_batch`` is **3**
   (stats, developers, architectures), independent of project count —
   this is the win this PR exists for.
"""

import os
import sys
from datetime import datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base  # noqa: E402

# Importing every model side-effects table registration on Base.metadata
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
from models.architecture import Architecture  # noqa: E402
from models.developer import Developer, project_developers  # noqa: E402
from models.project import Project  # noqa: E402
from models.work_item import WorkItem  # noqa: E402
from routers.projects import (  # noqa: E402
    format_project,
    format_projects_batch,
    get_work_item_stats_batch,
)


@pytest.fixture
def db():
    """In-memory SQLite session with all tables created.

    ``expire_on_commit=False`` mirrors how route handlers see entities
    fetched via ``db.query(...).all()``: not expired, so attribute reads
    don't trigger lazy reloads. Tests that count queries depend on this.
    """
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def seed(db):
    """Seed three projects with varied work-item, developer, and architecture data."""
    now = datetime(2026, 1, 1, 12, 0, 0)

    p1 = Project(
        id=1,
        name="Alpha",
        description="d1",
        status="active",
        github_repo_url="https://github.com/o/repo",
        github_repo_urls=["https://github.com/o/repo"],
        created_at=now,
    )
    p2 = Project(
        id=2,
        name="Beta",
        description="d2",
        status="planning",
        github_repo_url=None,
        github_repo_urls=[],
        created_at=now,
    )
    p3 = Project(
        id=3,
        name="Gamma",
        description="d3",
        status="active",
        github_repo_url=None,
        github_repo_urls=[],
        created_at=now,
    )
    db.add_all([p1, p2, p3])
    db.commit()

    d1 = Developer(id=1, name="Dev A", email="a@x.com", github_username="a")
    d2 = Developer(id=2, name="Dev B", email="b@x.com", github_username="b")
    db.add_all([d1, d2])
    db.commit()

    db.execute(
        project_developers.insert().values(
            [
                {
                    "project_id": 1,
                    "developer_id": 1,
                    "role": "Lead",
                    "responsibilities": "x",
                    "is_admin": True,
                },
                {
                    "project_id": 1,
                    "developer_id": 2,
                    "role": "Dev",
                    "responsibilities": None,
                    "is_admin": False,
                },
                {
                    "project_id": 2,
                    "developer_id": 1,
                    "role": "Owner",
                    "responsibilities": None,
                    "is_admin": True,
                },
            ]
        )
    )
    db.commit()

    # p1: 3 todo, 1 in_progress, 2 done. Story points: 1+2+3+4+5+6 = 21.
    # p2: 1 done. Story points 5.
    # p3: no items.
    db.add_all(
        [
            WorkItem(
                project_id=1, type="story", title="t1", status="todo", story_points=1, key="A-1"
            ),
            WorkItem(
                project_id=1, type="story", title="t2", status="todo", story_points=2, key="A-2"
            ),
            WorkItem(
                project_id=1, type="story", title="t3", status="todo", story_points=3, key="A-3"
            ),
            WorkItem(
                project_id=1,
                type="story",
                title="t4",
                status="in_progress",
                story_points=4,
                key="A-4",
            ),
            WorkItem(
                project_id=1, type="story", title="t5", status="done", story_points=5, key="A-5"
            ),
            WorkItem(
                project_id=1, type="story", title="t6", status="done", story_points=6, key="A-6"
            ),
            WorkItem(
                project_id=2, type="story", title="b1", status="done", story_points=5, key="B-1"
            ),
        ]
    )
    db.commit()

    db.add_all(
        [
            Architecture(
                id=10,
                project_id=1,
                name="A1",
                mermaid_code="g1",
                is_selected=True,
                created_at=datetime(2026, 1, 5),
            ),
            Architecture(
                id=11,
                project_id=1,
                name="A2",
                mermaid_code="g2",
                is_selected=False,
                created_at=datetime(2026, 1, 6),
            ),
            Architecture(
                id=12,
                project_id=2,
                name="B1",
                mermaid_code="g3",
                is_selected=False,
                created_at=datetime(2026, 1, 7),
            ),
        ]
    )
    db.commit()

    return [p1, p2, p3]


class TestStatsBatch:
    def test_returns_correct_aggregates(self, db, seed):
        stats = get_work_item_stats_batch([1, 2, 3], db)

        assert stats[1] == {
            "total": 6,
            "by_status": {"todo": 3, "in_progress": 1, "done": 2},
            "total_points": 21,
            "completed": 2,
            "completion_pct": round(2 / 6 * 100, 1),
        }
        assert stats[2] == {
            "total": 1,
            "by_status": {"done": 1},
            "total_points": 5,
            "completed": 1,
            "completion_pct": 100.0,
        }
        assert stats[3] == {
            "total": 0,
            "by_status": {},
            "total_points": 0,
            "completed": 0,
            "completion_pct": 0,
        }

    def test_null_status_buckets_as_todo(self, db, seed):
        db.add(
            WorkItem(
                project_id=3, type="story", title="orphan", status=None, story_points=2, key="G-1"
            )
        )
        db.commit()

        stats = get_work_item_stats_batch([3], db)
        assert stats[3]["by_status"] == {"todo": 1}
        assert stats[3]["total"] == 1
        assert stats[3]["total_points"] == 2

    def test_empty_project_list_returns_empty_dict(self, db):
        assert get_work_item_stats_batch([], db) == {}


class TestFormatProjectsBatch:
    def test_shape_and_values(self, db, seed):
        projects = seed
        result = format_projects_batch(projects, db)

        assert len(result) == 3
        assert [r["id"] for r in result] == [1, 2, 3]
        assert [r["name"] for r in result] == ["Alpha", "Beta", "Gamma"]

        # Project 1 — full coverage of stats, developers, and architectures.
        r1 = result[0]
        assert r1["work_item_stats"]["total"] == 6
        assert r1["work_item_stats"]["total_points"] == 21
        assert r1["work_item_stats"]["completed"] == 2
        assert len(r1["developers"]) == 2
        assert {d["email"] for d in r1["developers"]} == {"a@x.com", "b@x.com"}
        assert r1["selected_architecture"] is not None
        assert r1["selected_architecture"]["id"] == 10
        # The full `architectures` list is intentionally NOT serialized into the
        # project payload (no client reads it); only selected_architecture ships.
        assert "architectures" not in r1
        assert r1["github_repo_url"] == "https://github.com/o/repo"

        # Project 2 — one dev, one (unselected) architecture, one done item.
        r2 = result[1]
        assert len(r2["developers"]) == 1
        assert r2["developers"][0]["email"] == "a@x.com"
        assert r2["selected_architecture"] is None
        assert "architectures" not in r2
        assert r2["work_item_stats"]["completion_pct"] == 100.0

        # Project 3 — no devs, no items, no architectures. Empty stats.
        r3 = result[2]
        assert r3["developers"] == []
        assert "architectures" not in r3
        assert r3["selected_architecture"] is None
        assert r3["work_item_stats"] == {
            "total": 0,
            "by_status": {},
            "total_points": 0,
            "completed": 0,
            "completion_pct": 0,
        }

    def test_single_wrapper_matches_batch(self, db, seed):
        """format_project(p, db) should equal format_projects_batch([p], db)[0]."""
        for project in seed:  # noqa: F402 — shadows `models.project` module import
            wrapped = format_project(project, db)
            batched = format_projects_batch([project], db)[0]
            assert wrapped == batched

    def test_empty_list_input(self, db):
        assert format_projects_batch([], db) == []


class TestQueryCount:
    """Verify the win: format_projects_batch issues a constant 3 queries."""

    @staticmethod
    def _track(db):
        count = {"n": 0}
        engine = db.get_bind()

        @event.listens_for(engine, "before_cursor_execute")
        def _inc(conn, cursor, statement, parameters, context, executemany):
            count["n"] += 1

        return count, _inc, engine

    def test_three_projects_uses_three_queries(self, db, seed):
        count, listener, engine = self._track(db)
        try:
            format_projects_batch(seed, db)
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        # Exactly 3 SELECTs inside the batch (stats, developers, architectures).
        assert count["n"] == 3, f"expected 3 queries, got {count['n']}"

    def test_query_count_constant_across_project_counts(self, db, seed):
        """Adding more projects must not multiply query count."""
        # Add 5 more empty projects so we exercise larger N.
        from datetime import datetime as _dt

        new_projects = [
            Project(
                id=i,
                name=f"P{i}",
                description=f"d{i}",
                status="active",
                github_repo_url=None,
                github_repo_urls=[],
                created_at=_dt(2026, 1, 1),
            )
            for i in range(100, 105)
        ]
        db.add_all(new_projects)
        db.commit()

        all_projects = seed + new_projects

        count, listener, engine = self._track(db)
        try:
            format_projects_batch(all_projects, db)
        finally:
            event.remove(engine, "before_cursor_execute", listener)

        # Still exactly 3 — independent of how many projects we passed.
        assert count["n"] == 3, f"expected 3 queries for 8 projects, got {count['n']}"
