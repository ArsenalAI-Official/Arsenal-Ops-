"""Project key_prefix persistence + uniqueness (audit #25).

Pins the fix for the bug where create_project wrote the prefix into the
`status` column and left `key_prefix` at the shared 'PROJ' default, so
work-item ids weren't unique across projects.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi import HTTPException

from models.role import Role, RoleCapability
from models.user import User
from routers.projects import (
    ProjectCreate,
    ProjectUpdate,
    create_project,
    update_project,
)
from services.project_keys import derive_prefix_base, normalize_prefix


def _user(db, email="creator@x.com", caps=None):
    user = User(email=email, name=email.split("@")[0], role="admin")
    db.add(user)
    db.flush()
    if caps:
        r = Role(name=f"role-for-{email}", description="t", is_system=False)
        db.add(r)
        db.flush()
        for cap in caps:
            db.add(RoleCapability(role_id=r.id, capability_key=cap))
        user.roles.append(r)
    db.commit()
    db.refresh(user)
    return user


# --------------------------------------------------------------------------- #
# Pure helpers
# --------------------------------------------------------------------------- #


class TestPrefixHelpers:
    def test_normalize_strips_and_uppercases(self):
        assert normalize_prefix(" tea m! ") == "TEAM"
        assert normalize_prefix("proj-123") == "PROJ123"

    def test_normalize_caps_length(self):
        assert normalize_prefix("ABCDEFGHIJKLMNOP") == "ABCDEFGHIJ"  # 10 chars

    def test_normalize_empty(self):
        assert normalize_prefix("") == ""
        assert normalize_prefix(None) == ""
        assert normalize_prefix("---") == ""

    def test_derive_base_from_name(self):
        assert derive_prefix_base("AssemBuild — Pre-proj") == "ASSE"
        assert derive_prefix_base("Big Idea") == "BIGI"

    def test_derive_base_fallback(self):
        assert derive_prefix_base("") == "PROJ"
        assert derive_prefix_base("!!!") == "PROJ"


# --------------------------------------------------------------------------- #
# create_project
# --------------------------------------------------------------------------- #


class TestCreatePrefix:
    def test_explicit_prefix_persists_to_key_prefix_not_status(self, db):
        user = _user(db)
        result = create_project(
            ProjectCreate(name="Alpha One", description="d", key_prefix="team"),
            db=db,
            current_user=user,
        )
        assert result["key_prefix"] == "TEAM"
        # status must NOT be clobbered with the prefix — it keeps a real default.
        assert result["status"] != "TEAM"
        assert result["status"] in {
            "ideation",
            "planning",
            "development",
            "testing",
            "launched",
            "archived",
            "active",
        }

    def test_auto_derives_prefix_from_name_when_omitted(self, db):
        user = _user(db)
        result = create_project(
            ProjectCreate(name="Assembly Line", description="d"),
            db=db,
            current_user=user,
        )
        assert result["key_prefix"] == "ASSE"

    def test_auto_dedups_derived_collision(self, db):
        user = _user(db)
        r1 = create_project(
            ProjectCreate(name="Assembly One", description="d"), db=db, current_user=user
        )
        r2 = create_project(
            ProjectCreate(name="Assembly Two", description="d"), db=db, current_user=user
        )
        assert r1["key_prefix"] == "ASSE"
        assert r2["key_prefix"] == "ASSE2"
        assert r1["key_prefix"] != r2["key_prefix"]

    def test_duplicate_explicit_prefix_rejected(self, db):
        user = _user(db)
        create_project(
            ProjectCreate(name="First", description="d", key_prefix="DUP"),
            db=db,
            current_user=user,
        )
        with pytest.raises(HTTPException) as exc:
            create_project(
                ProjectCreate(name="Second", description="d", key_prefix="dup"),
                db=db,
                current_user=user,
            )
        assert exc.value.status_code == 400
        assert "already in use" in exc.value.detail


# --------------------------------------------------------------------------- #
# update_project
# --------------------------------------------------------------------------- #


class TestUpdatePrefix:
    def test_update_prefix_persists(self, db):
        user = _user(db, caps=["admin.projects"])
        created = create_project(
            ProjectCreate(name="Editable", description="d", key_prefix="OLD"),
            db=db,
            current_user=user,
        )
        pid = int(created["id"])
        result = update_project(pid, ProjectUpdate(key_prefix="new key"), db=db, current_user=user)
        assert result["key_prefix"] == "NEWKEY"

    def test_update_prefix_rekeys_existing_work_items(self, db):
        """Changing the prefix rewrites existing work-item keys onto it, so the
        project keeps a single key namespace (numbers preserved)."""
        from models.work_item import WorkItem

        user = _user(db, caps=["admin.projects"])
        created = create_project(
            ProjectCreate(name="Rekey Me", description="d", key_prefix="OLD"),
            db=db,
            current_user=user,
        )
        pid = int(created["id"])
        db.add_all(
            [
                WorkItem(project_id=pid, key="OLD-1", type="task", title="a"),
                WorkItem(project_id=pid, key="OLD-2", type="task", title="b"),
            ]
        )
        db.commit()

        update_project(pid, ProjectUpdate(key_prefix="new"), db=db, current_user=user)

        keys = {wi.key for wi in db.query(WorkItem).filter(WorkItem.project_id == pid).all()}
        assert keys == {"NEW-1", "NEW-2"}

    def test_update_to_taken_prefix_rejected(self, db):
        user = _user(db, caps=["admin.projects"])
        create_project(
            ProjectCreate(name="Owner", description="d", key_prefix="TAKEN"),
            db=db,
            current_user=user,
        )
        other = create_project(
            ProjectCreate(name="Mover", description="d", key_prefix="MOVE"),
            db=db,
            current_user=user,
        )
        with pytest.raises(HTTPException) as exc:
            update_project(
                int(other["id"]), ProjectUpdate(key_prefix="taken"), db=db, current_user=user
            )
        assert exc.value.status_code == 400

    def test_update_blank_prefix_rejected(self, db):
        user = _user(db, caps=["admin.projects"])
        created = create_project(
            ProjectCreate(name="Blankable", description="d", key_prefix="KEEP"),
            db=db,
            current_user=user,
        )
        with pytest.raises(HTTPException) as exc:
            update_project(
                int(created["id"]), ProjectUpdate(key_prefix="!!!"), db=db, current_user=user
            )
        assert exc.value.status_code == 400
