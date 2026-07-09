"""Characterization tests pinning the full JSON response of the three
work-item MUTATION endpoints byte-for-byte.

These are the regression oracle for simplify-audit finding DD-B2 (extracting
the shared ``_serialize_work_item`` helper in ``routers/workitems.py``). They
capture the CURRENT behavior of:

* ``POST /api/workitems/``            → ``create_work_item``
* ``PUT  /api/workitems/{id}``        → ``update_work_item``
* ``PUT  /api/workitems/{id}/move-sprint`` → ``move_ticket_to_sprint``

Each test asserts the ENTIRE response dict equals an explicit expected dict,
except ``created_at``/``updated_at`` (and any other server-clock field), which
are non-deterministic timestamps — those are popped and asserted to be ISO
strings (or None) separately so the oracle stays strict on every field whose
value is produced by the serialization logic under audit.

Edges covered per endpoint:
* assigned vs unassigned developer  → "Unassigned" default + assignee_id
* with vs without sprint            → "Backlog" default + sprint_id
* with vs without parent/epic       → parent_id/epic_id passthrough
* with vs without due/start dates    → ``isoformat() if x else None`` branches
* hours present vs absent            → ``estimated_hours or 0`` / ``remaining``
                                        / ``logged_hours`` defaults, and the
                                        double emission of estimated_hours as
                                        ``assigned_hours``.
"""

import os
import sys
from datetime import datetime, timedelta

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import SYSTEM_ROLES
from models.developer import Developer, project_developers
from models.project import Project
from models.role import Role, RoleCapability
from models.sprint import Sprint
from models.user import User
from models.work_item import WorkItem
from routers.auth import create_access_token, get_password_hash
from time_utils import utcnow


def _assign_system_role(db, target_user):
    """Give the user the DB Role matching its legacy `role` string.

    Inlined (rather than imported from tests/conftest) so this module has no
    cross-conftest import that a sibling package's conftest could shadow.
    Mirrors the production RBAC backfill the in-memory SQLite test DB skips.
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


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def admin_token(db):
    """An admin User (holds project.tracker_write) + a bearer token."""
    user = User(
        email="ser-admin@test.local",
        name="Ser Admin",
        role="admin",
        is_active=True,
        is_first_login=False,
        hashed_password=get_password_hash("test-password"),
    )
    db.add(user)
    db.commit()
    _assign_system_role(db, user)
    token = create_access_token(data={"sub": str(user.id)}, expires_delta=timedelta(minutes=60))
    return user, token


@pytest.fixture
def project(db):
    """A project with a deterministic key_prefix so generated keys are stable."""
    p = Project(
        name="Serialize Project",
        description="d",
        status="active",
        github_repo_urls=[],
        created_at=utcnow(),
        key_prefix="SER",
    )
    db.add(p)
    db.commit()
    return p


@pytest.fixture
def developer(db, project):
    """A developer assigned to the project (so assignee resolution works)."""
    dev = Developer(name="Casey Dev", email="casey@test.local", github_username="casey")
    db.add(dev)
    db.flush()
    db.execute(
        project_developers.insert().values(
            project_id=project.id,
            developer_id=dev.id,
            role="Developer",
            responsibilities=None,
            is_admin=False,
        )
    )
    db.commit()
    return dev


@pytest.fixture
def sprint(db, project):
    s = Sprint(
        project_id=project.id,
        name="Sprint Uno",
        status="active",
        start_date=datetime(2026, 5, 1),
        end_date=datetime(2026, 5, 14),
    )
    db.add(s)
    db.commit()
    return s


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _pop_timestamps(payload, *fields):
    """Pop non-deterministic ISO-datetime fields and assert their shape.

    Returns the payload (mutated in place) so the caller can equality-check
    the remaining, fully-deterministic keys.
    """
    for f in fields:
        assert f in payload, f"expected {f} in response"
        val = payload.pop(f)
        # Server-clock fields: must be an ISO datetime string, never None here
        # (the endpoints set updated_at/created_at on write). date fields that
        # are legitimately None are asserted explicitly, not popped.
        assert isinstance(val, str)
        # Round-trips as an ISO datetime.
        datetime.fromisoformat(val)
    return payload


# ---------------------------------------------------------------------------
# create_work_item — POST /api/workitems/
# ---------------------------------------------------------------------------


class TestCreateWorkItemSerialization:
    def test_minimal_unassigned_no_sprint_no_dates_no_hours(
        self, test_client, admin_token, project
    ):
        _, token = admin_token
        resp = test_client.post(
            "/api/workitems/",
            headers=_auth(token),
            json={"title": "Basic Item", "project_id": project.id},
        )
        assert resp.status_code == 200
        body = resp.json()
        _pop_timestamps(body, "created_at", "updated_at")
        assert body == {
            "id": "1",
            "key": "SER-1",
            "type": "task",
            "title": "Basic Item",
            "description": "",
            "status": "todo",
            "priority": "medium",
            "story_points": 0,
            "assigned_hours": 0,
            "estimated_hours": 0,
            "remaining_hours": 0,
            "logged_hours": 0,
            "assignee": "Unassigned",
            "assignee_id": None,
            "sprint": "Backlog",
            "epic": "",
            "tags": [],
            "start_date": None,
            "due_date": None,
        }

    def test_full_assigned_with_sprint_dates_hours_tags(
        self, test_client, admin_token, project, developer, sprint
    ):
        _, token = admin_token
        resp = test_client.post(
            "/api/workitems/",
            headers=_auth(token),
            json={
                "type": "bug",
                "title": "Rich Item",
                "description": "the desc",
                "status": "in_progress",
                "priority": "high",
                "estimated_hours": 8,
                "remaining_hours": 5,
                "story_points": 3,
                "assignee_id": developer.id,
                "sprint_id": sprint.id,
                "project_id": project.id,
                "tags": ["a", "b"],
                "start_date": "2026-06-01",
                "due_date": "2026-06-10",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        _pop_timestamps(body, "created_at", "updated_at")
        assert body == {
            "id": "1",
            "key": "SER-1",
            "type": "bug",
            "title": "Rich Item",
            "description": "the desc",
            "status": "in_progress",
            "priority": "high",
            "story_points": 3,
            "assigned_hours": 8,
            "estimated_hours": 8,
            # create_work_item seeds remaining_hours FROM estimated_hours,
            # ignoring the request's remaining_hours (=5). Pinned as current.
            "remaining_hours": 8,
            "logged_hours": 0,
            "assignee": "Casey Dev",
            "assignee_id": developer.id,
            # NOTE: create_work_item hard-codes "Backlog" and does NOT resolve
            # the sprint name (only sprint_id is stored on the item). This is
            # current behavior being pinned.
            "sprint": "Backlog",
            "epic": "",
            "tags": ["a", "b"],
            "start_date": "2026-06-01T00:00:00",
            "due_date": "2026-06-10T00:00:00",
        }


# ---------------------------------------------------------------------------
# update_work_item — PUT /api/workitems/{id}
# ---------------------------------------------------------------------------


class TestUpdateWorkItemSerialization:
    def _seed_item(self, db, project, **kw):
        item = WorkItem(
            project_id=project.id,
            key="SER-100",
            type="task",
            title="Seed",
            status="todo",
            **kw,
        )
        db.add(item)
        db.commit()
        return item

    def test_minimal_unassigned_no_sprint(self, test_client, admin_token, db, project):
        _, token = admin_token
        item = self._seed_item(db, project)
        resp = test_client.put(
            f"/api/workitems/{item.id}",
            headers=_auth(token),
            json={"title": "Updated Title"},
        )
        assert resp.status_code == 200
        body = resp.json()
        _pop_timestamps(body, "created_at", "updated_at")
        assert body == {
            "id": str(item.id),
            "key": "SER-100",
            "type": "task",
            "title": "Updated Title",
            "description": "",
            "status": "todo",
            "priority": "medium",
            "story_points": 0,
            "assigned_hours": 0,
            "estimated_hours": 0,
            "remaining_hours": 0,
            "logged_hours": 0,
            "assignee": "Unassigned",
            "assignee_id": None,
            "sprint": "Backlog",
            "sprint_id": None,
            "epic": "",
            "epic_id": None,
            "parent_id": None,
            "tags": [],
            "acceptance_criteria": [],
            "due_date": None,
            "start_date": None,
            "is_overdue": False,
            "started_at": None,
            "completed_at": None,
        }

    def test_full_assigned_sprint_parent_epic_dates_overdue(
        self, test_client, admin_token, db, project, developer, sprint
    ):
        _, token = admin_token
        # A parent + epic to reference.
        parent = WorkItem(
            project_id=project.id, key="SER-90", type="story", title="Parent", status="todo"
        )
        epic = WorkItem(
            project_id=project.id, key="SER-91", type="epic", title="Epic", status="todo"
        )
        db.add_all([parent, epic])
        db.commit()

        # A fixed date well in the past → is_overdue must be True and the
        # serialized value is fully deterministic.
        past_due = datetime(2020, 1, 15, 8, 30, 0)
        item = self._seed_item(
            db,
            project,
            assignee_id=developer.id,
            sprint_id=sprint.id,
            parent_id=parent.id,
            epic_id=epic.id,
            estimated_hours=10,
            remaining_hours=7,
            logged_hours=3,
            story_points=5,
            priority="high",
            description="orig",
            tags=["x"],
            acceptance_criteria=["ac1", "ac2"],
            due_date=past_due,
            start_date=datetime(2026, 4, 1),
            started_at=datetime(2026, 4, 2, 9, 0, 0),
        )
        resp = test_client.put(
            f"/api/workitems/{item.id}",
            headers=_auth(token),
            json={"status": "in_progress"},
        )
        assert resp.status_code == 200
        body = resp.json()
        # started_at/completed_at are model-stored (deterministic) here; only
        # created_at/updated_at are server-clock. Pin the deterministic ones.
        _pop_timestamps(body, "created_at", "updated_at")
        assert body == {
            "id": str(item.id),
            "key": "SER-100",
            "type": "task",
            "title": "Seed",
            "description": "orig",
            "status": "in_progress",
            "priority": "high",
            "story_points": 5,
            "assigned_hours": 10,
            "estimated_hours": 10,
            "remaining_hours": 7,
            "logged_hours": 3,
            "assignee": "Casey Dev",
            "assignee_id": developer.id,
            "sprint": "Sprint Uno",
            "sprint_id": sprint.id,
            "epic": "",
            "epic_id": epic.id,
            "parent_id": parent.id,
            "tags": ["x"],
            "acceptance_criteria": ["ac1", "ac2"],
            "due_date": "2020-01-15T08:30:00",
            "start_date": "2026-04-01T00:00:00",
            "is_overdue": True,
            "started_at": "2026-04-02T09:00:00",
            "completed_at": None,
        }


# ---------------------------------------------------------------------------
# move_ticket_to_sprint — PUT /api/workitems/{id}/move-sprint
# ---------------------------------------------------------------------------


class TestMoveTicketToSprintSerialization:
    def _seed_item(self, db, project, status="backlog", **kw):
        item = WorkItem(
            project_id=project.id,
            key="SER-200",
            type="task",
            title="Movable",
            status=status,
            **kw,
        )
        db.add(item)
        db.commit()
        return item

    def test_move_to_sprint_assigned(
        self, test_client, admin_token, db, project, developer, sprint
    ):
        _, token = admin_token
        item = self._seed_item(
            db,
            project,
            assignee_id=developer.id,
            estimated_hours=6,
            remaining_hours=6,
            logged_hours=0,
            story_points=2,
            priority="low",
            tags=["t"],
        )
        resp = test_client.put(
            f"/api/workitems/{item.id}/move-sprint",
            headers=_auth(token),
            json={"target_sprint_id": sprint.id},
        )
        assert resp.status_code == 200
        body = resp.json()
        _pop_timestamps(body, "created_at", "updated_at")
        assert body == {
            "id": str(item.id),
            "key": "SER-200",
            "type": "task",
            "title": "Movable",
            "description": "",
            "status": "todo",  # backlog → todo on move into a sprint
            "priority": "low",
            "story_points": 2,
            "assigned_hours": 6,
            "remaining_hours": 6,
            "logged_hours": 0,
            "assignee": "Casey Dev",
            "assignee_id": developer.id,
            "sprint": "Sprint Uno",
            "sprint_id": sprint.id,
            "epic": "",
            "tags": ["t"],
        }

    def test_move_to_backlog_unassigned(self, test_client, admin_token, db, project, sprint):
        _, token = admin_token
        item = self._seed_item(db, project, sprint_id=sprint.id, status="todo")
        resp = test_client.put(
            f"/api/workitems/{item.id}/move-sprint",
            headers=_auth(token),
            json={"target_sprint_id": None},
        )
        assert resp.status_code == 200
        body = resp.json()
        _pop_timestamps(body, "created_at", "updated_at")
        assert body == {
            "id": str(item.id),
            "key": "SER-200",
            "type": "task",
            "title": "Movable",
            "description": "",
            "status": "backlog",  # moved to backlog
            "priority": "medium",
            "story_points": 0,
            "assigned_hours": 0,
            "remaining_hours": 0,
            "logged_hours": 0,
            "assignee": "Unassigned",
            "assignee_id": None,
            "sprint": "Backlog",
            "sprint_id": None,
            "epic": "",
            "tags": [],
        }
