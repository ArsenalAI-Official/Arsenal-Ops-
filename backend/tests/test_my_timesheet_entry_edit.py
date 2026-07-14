"""Edit + delete endpoints for the dev Review-and-Submit timesheet:

  PATCH  /api/developers/me/timesheet/entries/{entry_id}
  DELETE /api/developers/me/timesheet/entries/{entry_id}

The router functions are called directly (the pattern from
test_capacity_endpoints.py / test_my_timesheet_endpoints.py) so the
real auth/Developer-lookup paths run without the FastAPI stack.

The rollup that happens after an edit/delete — `work_items.logged_hours`
recomputed from the live `TimeEntry` sum, then propagated to subtask
parents and epics — is exercised here too, since silently breaking that
roll-up is exactly what would cause board/capacity totals to drift away
from the database.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models  # noqa: F401 — registers tables with Base.metadata
from database import Base

TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    s = TestSession()
    try:
        yield s
    finally:
        s.close()


# ── Helpers ──────────────────────────────────────────────────────────────


def _make_user(email="dev@arsenal.test", name="Dev"):
    return SimpleNamespace(email=email, name=name)


def _make_dev(db, name="Alice", email="dev@arsenal.test"):
    from models.developer import Developer

    d = Developer(name=name, email=email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def _make_project(db, name="Acme"):
    from models.project import Project

    p = Project(
        name=name,
        description="x",
        status="active",
        key_prefix=name[:4].upper(),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


_wi_n = {"n": 0}


def _make_wi(db, project_id, assignee_id, *, parent_id=None, epic_id=None, type_="task"):
    from models.work_item import WorkItem

    _wi_n["n"] += 1
    wi = WorkItem(
        key=f"WI-{_wi_n['n']}",
        title="Task",
        type=type_,
        status="in_progress",
        estimated_hours=20,
        logged_hours=0,
        remaining_hours=20,
        project_id=project_id,
        assignee_id=assignee_id,
        parent_id=parent_id,
        epic_id=epic_id,
    )
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


def _make_te(db, wi, dev_id, hours=4, **kwargs):
    from models.time_entry import TimeEntry

    e = TimeEntry(
        work_item_id=wi.id,
        developer_id=dev_id,
        hours=hours,
        logged_at=datetime.utcnow(),
        **kwargs,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def _set_wi_logged(db, wi, value):
    """Convenience: set the cached column directly so a test can verify
    the endpoint's recompute really did re-derive it from the entries
    instead of leaving the stale value in place."""
    wi.logged_hours = value
    db.commit()
    db.refresh(wi)


# ============================================================
# PATCH — happy path & rollup
# ============================================================


def test_edit_updates_hours_and_description(db):
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4, description="old text")

    res = edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(hours=6, description="new text"),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(entry)
    assert entry.hours == 6
    assert entry.description == "new text"
    assert res["id"] == entry.id


def test_edit_recomputes_work_item_logged_hours(db):
    """Editing an entry must recompute work_item.logged_hours from the
    live TimeEntry sum and re-derive remaining_hours."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)  # estimated_hours=20
    e1 = _make_te(db, wi, dev.id, hours=4)
    _make_te(db, wi, dev.id, hours=3)

    # Pretend a stale value sits on the work item — the recompute must
    # overwrite it from the sum.
    _set_wi_logged(db, wi, 999)

    edit_my_timesheet_entry(
        entry_id=e1.id,
        body=TimesheetEntryEditRequest(hours=10),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(wi)
    assert wi.logged_hours == 13  # 10 + 3
    assert wi.remaining_hours == 7  # 20 - 13


def test_edit_propagates_to_epic_for_2nd_level_item(db):
    """A story/task/bug under an epic propagates hours into the epic."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    epic = _make_wi(db, proj.id, dev.id, type_="epic")
    task = _make_wi(db, proj.id, dev.id, type_="task", epic_id=epic.id)
    entry = _make_te(db, task, dev.id, hours=5)

    # Manually seed the epic's logged_hours to confirm the rollup runs.
    _set_wi_logged(db, epic, 0)

    edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(hours=12),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(task)
    db.refresh(epic)
    assert task.logged_hours == 12
    # Epic picks up the 2nd-level item's hours via update_epic_hours.
    assert epic.logged_hours == 12


def test_edit_on_subtask_propagates_to_grandparent_epic(db):
    """Subtask edits roll up to the grandparent epic via
    `propagate_from_subtask`. The 2nd-level parent (task) keeps its
    own independent hour columns by design — see the docstring on
    `propagate_from_subtask` in routers/workitems.py."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    epic = _make_wi(db, proj.id, dev.id, type_="epic")
    parent_task = _make_wi(db, proj.id, dev.id, type_="task", epic_id=epic.id)
    sub = _make_wi(db, proj.id, dev.id, type_="subtask", parent_id=parent_task.id)
    entry = _make_te(db, sub, dev.id, hours=4)

    _set_wi_logged(db, epic, 0)

    edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(hours=8),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(sub)
    db.refresh(epic)
    assert sub.logged_hours == 8
    # Epic's rollup picks up the subtask hours (3rd-level descendants).
    assert epic.logged_hours == 8


# ============================================================
# PATCH — gates / validation
# ============================================================


def test_edit_rejects_zero_or_negative_hours(db):
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4)

    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=entry.id,
            body=TimesheetEntryEditRequest(hours=0),
            db=db,
            current_user=_make_user(),
        )
    assert exc.value.status_code == 400


def test_edit_rejects_over_24h(db):
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4)

    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=entry.id,
            body=TimesheetEntryEditRequest(hours=25),
            db=db,
            current_user=_make_user(),
        )
    assert exc.value.status_code == 400


def test_edit_hours_on_positioned_block_rejected(db):
    """A calendar block owns its hours via (end_time - start_time); editing
    hours from the timesheet would desync it from the drawn duration, so the
    endpoint rejects it and points the dev back to the calendar."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    start = datetime(2024, 1, 10, 9, 0)
    entry = _make_te(db, wi, dev.id, hours=2, start_time=start, end_time=start + timedelta(hours=2))

    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=entry.id,
            body=TimesheetEntryEditRequest(hours=6),
            db=db,
            current_user=_make_user(),
        )
    assert exc.value.status_code == 400
    assert "calendar" in exc.value.detail.lower()

    db.refresh(entry)
    assert entry.hours == 2  # unchanged


def test_edit_description_on_positioned_block_allowed(db):
    """Hours are calendar-owned, but description edits still work on a block."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    start = datetime(2024, 1, 10, 9, 0)
    entry = _make_te(
        db,
        wi,
        dev.id,
        hours=2,
        description="old",
        start_time=start,
        end_time=start + timedelta(hours=2),
    )

    edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(description="new note"),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(entry)
    assert entry.description == "new note"
    assert entry.hours == 2


def test_edit_404_when_entry_missing(db):
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    _make_dev(db)
    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=9999,
            body=TimesheetEntryEditRequest(hours=6),
            db=db,
            current_user=_make_user(),
        )
    assert exc.value.status_code == 404


def test_edit_403_when_not_the_owner(db):
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    me = _make_dev(db, name="Me", email="me@arsenal.test")
    other = _make_dev(db, name="Other", email="other@arsenal.test")
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, other.id)
    entry = _make_te(db, wi, other.id, hours=4)  # other dev's entry
    _ = me  # me is the current user; other's entry must be off-limits

    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=entry.id,
            body=TimesheetEntryEditRequest(hours=6),
            db=db,
            current_user=_make_user(email="me@arsenal.test"),
        )
    assert exc.value.status_code == 403
    assert "your own" in exc.value.detail.lower()


def test_edit_403_when_already_submitted(db):
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4, submitted_at=datetime.utcnow())

    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=entry.id,
            body=TimesheetEntryEditRequest(hours=6),
            db=db,
            current_user=_make_user(),
        )
    assert exc.value.status_code == 403
    assert "submitted" in exc.value.detail.lower()


def test_edit_403_when_already_synced_to_qb(db):
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(
        db,
        wi,
        dev.id,
        hours=4,
        submitted_at=datetime.utcnow(),
        workforce_entry_id="QB-TA-1",
    )

    with pytest.raises(HTTPException) as exc:
        edit_my_timesheet_entry(
            entry_id=entry.id,
            body=TimesheetEntryEditRequest(hours=6),
            db=db,
            current_user=_make_user(),
        )
    assert exc.value.status_code == 403
    assert "quickbooks" in exc.value.detail.lower()


def test_edit_clears_description_when_passed_empty_string(db):
    """Empty description means "clear it" — stored as NULL, matching the
    log-hours convention."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4, description="something")

    edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(description=""),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(entry)
    assert entry.description is None


def test_edit_partial_body_only_updates_passed_fields(db):
    """Passing only `hours` leaves description untouched (and vice versa)."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4, description="keep this")

    edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(hours=5),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(entry)
    assert entry.hours == 5
    assert entry.description == "keep this"


# ============================================================
# DELETE
# ============================================================


def test_delete_removes_entry_and_recomputes_work_item(db):
    from models.time_entry import TimeEntry
    from routers.developers import delete_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)  # estimated_hours=20
    keep = _make_te(db, wi, dev.id, hours=3)
    drop = _make_te(db, wi, dev.id, hours=4)
    _set_wi_logged(db, wi, 7)

    delete_my_timesheet_entry(entry_id=drop.id, db=db, current_user=_make_user())

    # Row gone.
    assert db.query(TimeEntry).filter(TimeEntry.id == drop.id).first() is None
    # Surviving row untouched.
    db.refresh(keep)
    assert keep.hours == 3
    # Work item recomputed: only the kept entry's hours.
    db.refresh(wi)
    assert wi.logged_hours == 3
    assert wi.remaining_hours == 17


def test_delete_404_when_entry_missing(db):
    from routers.developers import delete_my_timesheet_entry

    _make_dev(db)
    with pytest.raises(HTTPException) as exc:
        delete_my_timesheet_entry(entry_id=9999, db=db, current_user=_make_user())
    assert exc.value.status_code == 404


def test_delete_403_for_other_devs_entry(db):
    from routers.developers import delete_my_timesheet_entry

    me = _make_dev(db, name="Me", email="me@arsenal.test")
    other = _make_dev(db, name="Other", email="other@arsenal.test")
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, other.id)
    entry = _make_te(db, wi, other.id, hours=4)
    _ = me

    with pytest.raises(HTTPException) as exc:
        delete_my_timesheet_entry(
            entry_id=entry.id, db=db, current_user=_make_user(email="me@arsenal.test")
        )
    assert exc.value.status_code == 403


def test_delete_403_when_already_submitted(db):
    from routers.developers import delete_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4, submitted_at=datetime.utcnow())

    with pytest.raises(HTTPException) as exc:
        delete_my_timesheet_entry(entry_id=entry.id, db=db, current_user=_make_user())
    assert exc.value.status_code == 403


def test_delete_403_when_already_synced(db):
    from routers.developers import delete_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(
        db,
        wi,
        dev.id,
        hours=4,
        submitted_at=datetime.utcnow(),
        workforce_entry_id="QB-TA-1",
    )

    with pytest.raises(HTTPException) as exc:
        delete_my_timesheet_entry(entry_id=entry.id, db=db, current_user=_make_user())
    assert exc.value.status_code == 403


def test_delete_propagates_to_epic(db):
    """Deleting the last entry on an epic-linked task drops the epic's
    rolled-up logged_hours back to zero."""
    from routers.developers import delete_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    epic = _make_wi(db, proj.id, dev.id, type_="epic")
    task = _make_wi(db, proj.id, dev.id, type_="task", epic_id=epic.id)
    entry = _make_te(db, task, dev.id, hours=6)
    # Simulate the rollup having stamped the epic earlier.
    _set_wi_logged(db, epic, 6)

    delete_my_timesheet_entry(entry_id=entry.id, db=db, current_user=_make_user())

    db.refresh(epic)
    assert epic.logged_hours == 0


# ============================================================
# Auto-comment sync — the "Logged Xh" comment created by log-hours
# must follow the entry through edit and delete.
# ============================================================


def _make_linked_comment(db, wi, dev_id, time_entry_id, hours):
    """Stand-in for the auto-comment that `POST /log-hours` creates.

    Used by the sync tests so they can exercise edit/delete without
    going through the full work-item creation path (which requires a
    valid assignee + work item status). Mirrors the shape produced by
    `routers/workitems.py:log_hours` line ~1710.
    """
    from models.comment import Comment

    c = Comment(
        work_item_id=wi.id,
        author_id=dev_id,
        content=f"Logged {hours}h",
        time_entry_id=time_entry_id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_log_hours_links_auto_comment_to_time_entry(db, monkeypatch):
    """End-to-end: calling POST /log-hours creates a Comment whose
    `time_entry_id` matches the freshly created TimeEntry's id and
    whose content is the formatted "Logged Xh" string."""
    from models.comment import Comment
    from models.time_entry import TimeEntry
    from routers.workitems import LogHoursRequest, log_hours

    # Pin the guard's clock to a weekday so the no-date log-hours path isn't
    # rejected by the Mon–Fri weekend guard on weekend CI runs.
    monkeypatch.setattr("routers.workitems.utcnow", lambda: datetime(2024, 1, 3, 12, 0))

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)

    res = log_hours(
        item_id=wi.id,
        request=LogHoursRequest(hours=3, description="initial work"),
        db=db,
        current_user=_make_user(),
    )

    new_te_id = res["time_entry"]["id"]
    entry = db.query(TimeEntry).filter(TimeEntry.id == new_te_id).one()
    comments = db.query(Comment).filter(Comment.work_item_id == wi.id).all()
    log_comments = [c for c in comments if (c.content or "").startswith("Logged ")]
    assert len(log_comments) == 1
    assert log_comments[0].time_entry_id == entry.id
    assert log_comments[0].content == "Logged 3h"


def test_edit_syncs_linked_auto_comment_content(db):
    """Editing the entry's hours must update the linked Comment's text."""
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4)
    linked = _make_linked_comment(db, wi, dev.id, entry.id, 4)

    edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(hours=7),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(linked)
    assert linked.content == "Logged 7h"
    # Link itself stays intact — same row, same FK, just updated content.
    assert linked.time_entry_id == entry.id


def test_edit_does_not_touch_unrelated_comments(db):
    """Manual comments + auto-comments for OTHER entries must be untouched."""
    from models.comment import Comment
    from routers.developers import TimesheetEntryEditRequest, edit_my_timesheet_entry

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=4)
    other_entry = _make_te(db, wi, dev.id, hours=2)

    # The auto-comment for the entry under edit.
    linked = _make_linked_comment(db, wi, dev.id, entry.id, 4)
    # An auto-comment for a DIFFERENT entry on the same work item.
    other_linked = _make_linked_comment(db, wi, dev.id, other_entry.id, 2)
    # A manual user comment (no time_entry_id) — must stay untouched.
    manual = Comment(
        work_item_id=wi.id,
        author_id=dev.id,
        content="This is a real conversation, not an auto-log.",
    )
    db.add(manual)
    db.commit()
    db.refresh(manual)
    manual_id = manual.id
    manual_content = manual.content

    edit_my_timesheet_entry(
        entry_id=entry.id,
        body=TimesheetEntryEditRequest(hours=9),
        db=db,
        current_user=_make_user(),
    )

    db.refresh(linked)
    db.refresh(other_linked)
    refreshed_manual = db.query(Comment).filter(Comment.id == manual_id).one()
    assert linked.content == "Logged 9h"
    assert other_linked.content == "Logged 2h"  # untouched
    assert refreshed_manual.content == manual_content  # untouched


def test_delete_cascades_linked_auto_comment(db):
    """Deleting the TimeEntry removes the linked Comment via ON DELETE CASCADE.
    SQLite needs PRAGMA foreign_keys=ON for the cascade to fire — the test
    flips it on before exercising the path. Postgres respects FKs by default."""
    from sqlalchemy import event, text

    from models.comment import Comment
    from routers.developers import delete_my_timesheet_entry

    # Enable SQLite FK enforcement for THIS test only — keeps other tests
    # that rely on lax FK behavior (e.g. orphaned dev rows) unaffected.
    bind = db.get_bind()
    if bind.dialect.name == "sqlite":
        db.execute(text("PRAGMA foreign_keys=ON"))

        # Reconnects in the same pool need the PRAGMA too.
        @event.listens_for(bind, "connect")
        def _fk_on(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    dev = _make_dev(db)
    proj = _make_project(db)
    wi = _make_wi(db, proj.id, dev.id)
    entry = _make_te(db, wi, dev.id, hours=5)
    linked = _make_linked_comment(db, wi, dev.id, entry.id, 5)
    linked_id = linked.id

    delete_my_timesheet_entry(entry_id=entry.id, db=db, current_user=_make_user())

    assert db.query(Comment).filter(Comment.id == linked_id).first() is None


# ── Unused import keeps Ruff from F401-ing this test module ──
timedelta  # noqa: B018
