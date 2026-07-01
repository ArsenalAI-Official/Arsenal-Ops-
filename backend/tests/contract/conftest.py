"""Shared fixtures for the response-contract capture + diff harness.

Goal: exercise high-traffic GET endpoints through the FULL FastAPI/HTTP
response pipeline (`fastapi.testclient.TestClient` against the real
`main.app`) so that the captured golden JSON reflects exactly what a client
receives today. This is the regression oracle that will gate adding
`response_model=` to these routes — `response_model` filtering only happens
in the HTTP response path, so direct handler calls would not catch it.

The DB is in-memory SQLite shared across the seed session AND the request
handlers via a single connection (StaticPool). A plain `:memory:` URL gives
each new connection a fresh empty DB, so the seed data would be invisible to
request handlers — StaticPool pins one connection so both see the same data.
"""

import os
import sys
from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from database import Base, get_db

# Importing every model module side-effects table registration on
# Base.metadata (copied from tests/test_projects_list.py).
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
from models.developer import Developer, project_developers
from models.personal_task import PersonalTask
from models.project import Project
from models.role import Role, RoleCapability
from models.sprint import Sprint
from models.user import User
from models.work_item import WorkItem

# Fixed clock so every captured golden is deterministic. NEVER use now()/random.
NOW = datetime(2026, 1, 1, 12, 0, 0)

# The seeded admin's email is also a Developer row so that endpoints which
# resolve the caller to a developer-by-email (my-tasks, project membership)
# see them. Keep this stable; it appears in golden files.
ADMIN_EMAIL = "admin@arsenalai.com"

# A project (id=1) that HAS developers + work items + a sprint, and a project
# (id=2) that has NONE. The detail endpoint test targets the populated one.
PROJECT_WITH_DEVS = 1
PROJECT_EMPTY = 2


def _seed(db):
    """Seed representative data covering edge cases.

    - 2 users (admin + a plain developer).
    - 2 developers (admin's dev row + another).
    - 2 projects: one with developers + work items + sprint, one empty.
    - 1 sprint on the populated project.
    - Work items: assigned + unassigned, with/without parent/epic/due_date.
    - Personal tasks: converted + not, with/without due_date/project.
    """
    # --- RBAC: an admin role with the wildcard grant so the admin user passes
    # every require_capability / has_capability gate (and is_project_admin). ---
    admin_role = Role(id=1, name="admin", description="System admin", is_system=True)
    admin_role.capabilities = [RoleCapability(capability_key="*")]
    db.add(admin_role)
    db.flush()

    # --- Users ---
    admin = User(
        id=1,
        email=ADMIN_EMAIL,
        name="Admin User",
        role="admin",
        is_active=True,
        is_first_login=False,
        created_at=NOW,
        last_login_at=NOW,
    )
    admin.roles.append(admin_role)
    dev_user = User(
        id=2,
        email="dev@arsenalai.com",
        name="Dev User",
        role="developer",
        is_active=True,
        is_first_login=False,
        created_at=NOW,
        last_login_at=NOW,
    )
    db.add_all([admin, dev_user])
    db.flush()

    # --- Developers (admin matches admin user's email so my-tasks resolves) ---
    admin_dev = Developer(id=1, name="Admin User", email=ADMIN_EMAIL, github_username="adminhub")
    other_dev = Developer(
        id=2, name="Other Dev", email="dev@arsenalai.com", github_username="devhub"
    )
    db.add_all([admin_dev, other_dev])
    db.flush()

    # --- Projects: one populated, one empty ---
    p1 = Project(
        id=PROJECT_WITH_DEVS,
        name="Alpha",
        description="Project with developers and work items",
        status="active",
        github_repo_url="https://github.com/org/alpha",
        github_repo_urls=["https://github.com/org/alpha"],
        created_at=NOW,
    )
    p2 = Project(
        id=PROJECT_EMPTY,
        name="Beta",
        description="Empty project, no devs or items",
        status="planning",
        github_repo_url=None,
        github_repo_urls=[],
        created_at=NOW,
    )
    db.add_all([p1, p2])
    db.flush()

    # --- Project membership (only p1) ---
    db.execute(
        project_developers.insert().values(
            [
                {
                    "project_id": PROJECT_WITH_DEVS,
                    "developer_id": 1,
                    "role": "Lead",
                    "responsibilities": "Owns the project",
                    "is_admin": True,
                },
                {
                    "project_id": PROJECT_WITH_DEVS,
                    "developer_id": 2,
                    "role": "Dev",
                    "responsibilities": None,
                    "is_admin": False,
                },
            ]
        )
    )

    # --- Sprint on p1 ---
    db.add(
        Sprint(
            id=100,
            project_id=PROJECT_WITH_DEVS,
            name="Sprint 1",
            status="active",
            start_date=datetime(2026, 1, 1),
            end_date=datetime(2026, 1, 14),
        )
    )
    db.flush()

    # --- Work items on p1: epic + parent story, then tasks covering edges ---
    epic = WorkItem(
        id=200,
        project_id=PROJECT_WITH_DEVS,
        type="epic",
        title="Epic A",
        status="in_progress",
        priority="high",
        key="A-EPIC",
        story_points=0,
        created_at=NOW,
        updated_at=NOW,
    )
    parent = WorkItem(
        id=201,
        project_id=PROJECT_WITH_DEVS,
        type="story",
        title="Story P",
        status="todo",
        priority="medium",
        key="A-1",
        story_points=5,
        created_at=NOW,
        updated_at=NOW,
    )
    db.add_all([epic, parent])
    db.flush()

    db.add_all(
        [
            # Assigned to admin's developer, with parent + epic + sprint + due_date
            WorkItem(
                id=210,
                project_id=PROJECT_WITH_DEVS,
                type="task",
                title="Assigned task with everything",
                status="in_progress",
                priority="high",
                key="A-2",
                assignee_id=1,
                reporter_id=1,
                sprint_id=100,
                parent_id=201,
                epic_id=200,
                story_points=3,
                # Fractional on purpose: exercises the int->float hours contract
                # through the golden harness (see REVIEW_RULES.md rule 6).
                estimated_hours=8,
                remaining_hours=3.5,
                logged_hours=4.5,
                due_date=datetime(2026, 1, 10),
                created_at=NOW,
                updated_at=NOW,
            ),
            # Assigned to admin's developer, no parent, no due_date
            WorkItem(
                id=211,
                project_id=PROJECT_WITH_DEVS,
                type="task",
                title="Assigned task, minimal links",
                status="done",
                priority="low",
                key="A-3",
                assignee_id=1,
                sprint_id=100,
                parent_id=None,
                epic_id=200,
                story_points=2,
                estimated_hours=4,
                remaining_hours=0,
                logged_hours=4,
                completed_at=datetime(2026, 1, 12),
                created_at=NOW,
                updated_at=NOW,
            ),
            # Unassigned, no sprint, no parent/epic
            WorkItem(
                id=212,
                project_id=PROJECT_WITH_DEVS,
                type="task",
                title="Unassigned backlog task",
                status="todo",
                priority="medium",
                key="A-4",
                assignee_id=None,
                sprint_id=None,
                parent_id=None,
                epic_id=None,
                story_points=1,
                created_at=NOW,
                updated_at=NOW,
            ),
        ]
    )
    db.flush()

    # --- Personal tasks for the admin user: converted + not, edges ---
    db.add_all(
        [
            # Not converted, with due_date, no project
            PersonalTask(
                id=300,
                user_id=1,
                title="Personal todo with due date",
                description="needs doing",
                status="todo",
                priority="high",
                project_id=None,
                work_item_id=None,
                estimated_hours=2,
                due_date=datetime(2026, 1, 20),
                tags=["personal", "urgent"],
                is_converted=False,
                created_at=NOW,
                updated_at=NOW,
            ),
            # Not converted, no due_date, no tags
            PersonalTask(
                id=301,
                user_id=1,
                title="Personal todo minimal",
                description=None,
                status="in_progress",
                priority="medium",
                project_id=None,
                work_item_id=None,
                estimated_hours=0,
                due_date=None,
                tags=[],
                is_converted=False,
                created_at=NOW,
                updated_at=NOW,
            ),
            # Converted, linked to project + work item
            PersonalTask(
                id=302,
                user_id=1,
                title="Converted personal task",
                description="became a ticket",
                status="todo",
                priority="medium",
                project_id=PROJECT_WITH_DEVS,
                work_item_id=210,
                estimated_hours=8,
                due_date=datetime(2026, 1, 15),
                tags=["converted"],
                is_converted=True,
                converted_at=datetime(2026, 1, 5),
                created_at=NOW,
                updated_at=NOW,
            ),
        ]
    )

    db.commit()
    return admin


@pytest.fixture
def client():
    """A TestClient bound to the real main.app with a seeded in-memory DB.

    Overrides:
      - database.get_db        → the seeded test session
      - auth.get_current_user  → the seeded admin User
    The admin holds the '*' capability and role='admin', so capability and
    project-access gates on the target endpoints all pass (no separate
    require_capability override is needed — it delegates to get_current_user,
    which we override).
    """
    from fastapi.testclient import TestClient

    import main
    from routers.auth import get_current_user

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    seed_session = Session()
    admin = _seed(seed_session)

    def _override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    def _override_current_user():
        return admin

    main.app.dependency_overrides[get_db] = _override_get_db
    main.app.dependency_overrides[get_current_user] = _override_current_user

    with TestClient(main.app) as c:
        yield c

    main.app.dependency_overrides.clear()
    seed_session.close()
    engine.dispose()
