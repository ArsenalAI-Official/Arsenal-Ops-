"""Authorization tests for the destructive repair-hours endpoint.

``repair_hours_calculation`` (routers/workitems.py) rewrites
``work_item.logged_hours`` to match the sum of its time entries — a *project-
scoped* data mutation. It is therefore gated on ``require_project_admin`` (the
same write gate as other destructive project mutations, e.g. pulse overrides),
NOT the read-only ``admin.time_entries`` capability that backs the view-only
Time Entries tab.

These tests pin that contract: project admins and system admins may repair;
a view-only ``admin.time_entries`` grant and ordinary members may not.
"""

import os
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.developer import Developer, project_developers
from models.project import Project
from models.role import Role, RoleCapability
from models.user import User
from routers.workitems import repair_hours_calculation
from tests.conftest import seed_project


def _user_with_caps(db, email: str, caps: list[str]) -> User:
    """Build a committed User holding exactly the given capability grants."""
    user = User(email=email, name=email.split("@")[0], role="developer")
    db.add(user)
    db.flush()
    if caps:
        role = Role(name=f"role-for-{email}", description="test", is_system=False)
        db.add(role)
        db.flush()
        for cap in caps:
            db.add(RoleCapability(role_id=role.id, capability_key=cap))
        user.roles.append(role)
    db.commit()
    return user


def _add_member(db, project: Project, email: str, *, is_admin: bool) -> User:
    """Add a User + Developer assigned to the project with the given is_admin flag."""
    user = _user_with_caps(db, email, [])
    dev = Developer(email=email, name=email.split("@")[0])
    db.add(dev)
    db.commit()
    db.execute(
        project_developers.insert().values(
            project_id=project.id,
            developer_id=dev.id,
            role="developer",
            is_admin=is_admin,
        )
    )
    db.commit()
    return user


def test_repair_hours_403_for_read_only_time_entries_cap(db):
    """A view-only ``admin.time_entries`` grant must NOT unlock the mutation."""
    project = seed_project(db, "Repair RO", num_developers=1)
    user = _user_with_caps(db, "viewer@x.com", ["admin.time_entries"])

    with pytest.raises(HTTPException) as exc:
        repair_hours_calculation(project_id=project.id, dry_run=True, db=db, current_user=user)
    assert exc.value.status_code == 403


def test_repair_hours_403_for_ordinary_member(db):
    """A project member who is not a project admin cannot repair."""
    project = seed_project(db, "Repair Member", num_developers=1)
    member = _add_member(db, project, "member@x.com", is_admin=False)

    with pytest.raises(HTTPException) as exc:
        repair_hours_calculation(project_id=project.id, dry_run=True, db=db, current_user=member)
    assert exc.value.status_code == 403


def test_repair_hours_allowed_for_project_admin_member(db):
    """A project-admin membership row unlocks the mutation for that project."""
    project = seed_project(db, "Repair ProjAdmin", num_developers=1)
    admin_member = _add_member(db, project, "projadmin@x.com", is_admin=True)

    result = repair_hours_calculation(
        project_id=project.id, dry_run=True, db=db, current_user=admin_member
    )
    assert isinstance(result, dict)


def test_repair_hours_allowed_for_system_admin_wildcard(db):
    """System admins (``*``) retain access on any project."""
    project = seed_project(db, "Repair Sysadmin", num_developers=1)
    user = _user_with_caps(db, "sysadmin@x.com", ["*"])

    result = repair_hours_calculation(project_id=project.id, dry_run=True, db=db, current_user=user)
    assert isinstance(result, dict)
