"""
Pytest configuration and shared fixtures for the test suite.

Provides:
- `db` fixture: in-memory SQLite session with all tables created
- `test_client` fixture: FastAPI TestClient with db dependency override
- `make_token()` helper: creates valid JWT tokens matching auth.py's logic
- `admin_user`, `pm_user`, `dev_user` fixtures: pre-built User instances with roles
- `seed_project()` factory: creates Project + developers + admin assignment
"""

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

# Load .env.test so SECRET_KEY is set before importing main
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

load_dotenv(Path(__file__).parent.parent / ".env.test")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SYSTEM_ROLES, Base, get_db  # noqa: E402
from main import app  # noqa: E402
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
    project_link,
    project_milestone,
    sprint,
    task,
    task_dependency,
    time_entry,
    user,
    user_story,
    work_item,
    work_item_assignment_history,
)
from models.developer import (  # noqa: E402
    Developer,
    project_developers,
)
from models.project import Project  # noqa: E402
from models.role import Role, RoleCapability  # noqa: E402
from models.user import User  # noqa: E402
from routers.auth import (  # noqa: E402
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_password_hash,
)


def assign_system_role(db, target_user: User) -> None:
    """Give `target_user` the canonical DB Role matching its legacy `role` string.

    Mirrors production `seed_rbac()`, which backfills user_roles from the legacy
    `users.role` column. The in-memory SQLite test DB skips seed_rbac() (it's
    Postgres-only), so capability checks (require_capability) see no roles and
    403 unless we seed them here. Idempotent and defensive so it composes with
    tests that seed their own roles (e.g. test_admin.py).
    """
    spec = next((s for s in SYSTEM_ROLES if s[0] == target_user.role), None)
    if spec is None:
        return
    name, desc, caps = spec
    role = db.query(Role).filter(Role.name == name).first()
    if role is None:
        role = Role(name=name, description=desc, is_system=True)
        db.add(role)
        db.flush()
        for cap in caps:
            db.add(RoleCapability(role_id=role.id, capability_key=cap))
        db.flush()
    if role not in target_user.roles:
        target_user.roles.append(role)
    db.commit()


@pytest.fixture
def db():
    """In-memory SQLite session with all tables created.

    Uses StaticPool to ensure the in-memory database persists across
    all connections from both the test and the test_client's dependency
    overrides. The session uses expire_on_commit=False to mirror how
    route handlers fetch entities: attributes don't trigger lazy reloads
    when accessed. Tests that count queries depend on this behavior.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def test_client(db):
    """FastAPI TestClient with the db fixture overriding get_db dependency.

    Clears overrides on teardown to avoid test pollution.
    """

    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


def make_token(user: User, expires_delta: timedelta | None = None) -> str:  # noqa: F811
    """Create a valid JWT token for a User.

    Uses the same create_access_token() function as auth.py so tokens
    verify correctly against the live authentication logic.

    Args:
        user: User instance to encode into the token.
        expires_delta: Optional expiration delta; defaults to ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        Signed JWT token as a string.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    return create_access_token(data={"sub": str(user.id)}, expires_delta=expires_delta)


@pytest.fixture(name="make_token")
def make_token_fixture():
    """Fixture wrapper around make_token() so tests can request it by parameter name.

    Usage:
        def test_something(make_token, db):
            user = User(...)
            db.add(user); db.commit()
            token = make_token(user)
    """
    return make_token


@pytest.fixture
def admin_user(db) -> tuple[User, str]:
    """Create an admin User and return (user, token) tuple.

    The User is committed to the db fixture and has role='admin'.
    Uses a bcrypt-hashed password for compatibility with new verify_password.
    """
    user = User(  # noqa: F811 (shadows side-effect-only `user` module import)
        email="admin@test.local",
        name="Admin Test User",
        role="admin",
        is_active=True,
        is_first_login=False,
        hashed_password=get_password_hash("test-password"),
    )
    db.add(user)
    db.commit()

    assign_system_role(db, user)
    token = make_token(user)
    return user, token


@pytest.fixture
def pm_user(db) -> tuple[User, str]:
    """Create a project manager User and return (user, token) tuple.

    The User is committed to the db fixture and has role='project_manager'.
    Uses a bcrypt-hashed password for compatibility with new verify_password.
    """
    user = User(  # noqa: F811
        email="pm@test.local",
        name="PM Test User",
        role="project_manager",
        is_active=True,
        is_first_login=False,
        hashed_password=get_password_hash("test-password"),
    )
    db.add(user)
    db.commit()

    assign_system_role(db, user)
    token = make_token(user)
    return user, token


@pytest.fixture
def dev_user(db) -> tuple[User, str]:
    """Create a developer User and return (user, token) tuple.

    The User is committed to the db fixture and has role='developer'.
    Uses a bcrypt-hashed password for compatibility with new verify_password.
    """
    user = User(  # noqa: F811
        email="dev@test.local",
        name="Developer Test User",
        role="developer",
        is_active=True,
        is_first_login=False,
        hashed_password=get_password_hash("test-password"),
    )
    db.add(user)
    db.commit()

    assign_system_role(db, user)
    token = make_token(user)
    return user, token


def seed_project(db, name: str = "Test Project", num_developers: int = 2) -> Project:
    """Factory function: create a Project + N developers + admin assignment.

    Creates a new project with the given name, adds N developers to it,
    and assigns the first developer as the admin.

    Args:
        db: SQLAlchemy session fixture.
        name: Project name; defaults to "Test Project".
        num_developers: Number of developers to add; defaults to 2.

    Returns:
        The created Project instance (committed to db).
    """
    project = Project(  # noqa: F811 (shadows side-effect-only `project` module import)
        name=name,
        description=f"Description for {name}",
        status="active",
        github_repo_urls=[],
        created_at=datetime.utcnow(),
    )
    db.add(project)
    db.flush()  # Ensure project.id is set before adding developers

    developers = []
    # Ensure at least one developer even if num_developers is 0
    total_devs = max(1, num_developers)
    for i in range(total_devs):
        # Use project ID in seed to ensure unique developers across projects
        unique_id = f"{project.id}_{i + 1}"
        dev = Developer(
            name=f"Developer {unique_id}",
            email=f"seed-dev-{unique_id}@test.local",
            github_username=f"seed-dev-{unique_id}",
        )
        db.add(dev)
        db.flush()
        developers.append(dev)

    # Assign developers to the project; the first one is the admin
    db.execute(
        project_developers.insert().values(
            [
                {
                    "project_id": project.id,
                    "developer_id": developers[0].id,
                    "role": "Lead",
                    "responsibilities": "Project lead",
                    "is_admin": True,
                },
                *[
                    {
                        "project_id": project.id,
                        "developer_id": dev.id,
                        "role": "Developer",
                        "responsibilities": None,
                        "is_admin": False,
                    }
                    for dev in developers[1:]
                ],
            ]
        )
    )
    db.commit()

    return project
