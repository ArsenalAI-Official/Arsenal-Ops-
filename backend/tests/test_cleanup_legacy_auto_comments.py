"""One-time legacy auto-comment cleanup: deletes machine-generated status /
transfer / hours / edit comments, leaves human comments untouched.

Covers scripts/cleanup_legacy_auto_comments.py.
"""

import os
import sys

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models import (  # noqa: F401
    activity_log,
    architecture,
    comment,
    developer,
    project,
    time_entry,
    user,
    work_item,
)
from models.comment import Comment
from models.project import Project
from models.time_entry import TimeEntry
from models.work_item import WorkItem
from scripts.cleanup_legacy_auto_comments import cleanup


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
    project_row = Project(name="P", key_prefix="P", description="t")
    db.add(project_row)
    db.flush()
    item = WorkItem(
        project_id=project_row.id, type="task", key="P-1", title="T", status="todo", priority="low"
    )
    db.add(item)
    db.flush()
    return {"db": db, "item": item, "project": project_row}


def _c(db, item, content, **kw):
    row = Comment(work_item_id=item.id, content=content, **kw)
    db.add(row)
    db.flush()
    return row


def _remaining_contents(db, item):
    return {c.content for c in db.query(Comment).filter(Comment.work_item_id == item.id).all()}


def _factory(db):
    return lambda: db


def test_deletes_all_four_legacy_categories_keeps_human(db, seed):
    item = seed["item"]
    # A time entry so the hours comment can reference it.
    te = TimeEntry(work_item_id=item.id, hours=4)
    db.add(te)
    db.flush()

    _c(db, item, "Logged 4h", time_entry_id=te.id)  # hours (linked)
    _c(db, item, "Logged 3h")  # hours (legacy, no FK)
    _c(db, item, "Moved to In Progress")  # status
    _c(db, item, "Ticket transferred from Alice to Bob.")  # transfer
    _c(db, item, "Edited — priority: medium → high")  # edit
    _c(db, item, "This looks good, shipping it.")  # human
    _c(db, item, "We moved to a new plan last week")  # human (substring, not exact)
    db.commit()

    summary = cleanup(
        dry_run=False,
        categories=("hours", "status", "transfer", "edit"),
        work_item_id=None,
        session_factory=_factory(db),
    )

    assert summary["matched"] == 5
    assert summary["by_category"] == {"hours": 2, "status": 1, "transfer": 1, "edit": 1}
    assert _remaining_contents(db, item) == {
        "This looks good, shipping it.",
        "We moved to a new plan last week",
    }


def test_human_comments_that_resemble_machine_rows_are_preserved(db, seed):
    """Near-miss human comments must survive — matching is anchored/whole-string,
    never a loose substring."""
    item = seed["item"]
    survivors = [
        "We moved to a new plan last week",  # contains "moved to", not exact
        "Moved to Done!",  # trailing punctuation → not the exact status string
        "moved to done",  # wrong case → not exact
        "Logged in and reviewed the PR",  # starts with "Logged", not "Logged Nh"
        "I logged 4h yesterday on this",  # "logged 4h" mid-sentence, not whole-string
        "Ticket transferred from A to B",  # no trailing period → not the transfer form
        "Edited the acceptance criteria",  # no em-dash "Edited — " prefix
        "Edited - fixed a typo",  # ASCII hyphen, not the em-dash the machine used
    ]
    for content in survivors:
        _c(db, item, content)
    db.commit()

    summary = cleanup(
        dry_run=False,
        categories=("hours", "status", "transfer", "edit"),
        work_item_id=None,
        session_factory=_factory(db),
    )

    assert summary["matched"] == 0
    assert _remaining_contents(db, item) == set(survivors)


def test_dry_run_changes_nothing(db, seed):
    item = seed["item"]
    _c(db, item, "Moved to Done")
    _c(db, item, "Nice work")
    db.commit()

    summary = cleanup(
        dry_run=True,
        categories=("hours", "status", "transfer", "edit"),
        work_item_id=None,
        session_factory=_factory(db),
    )

    assert summary["matched"] == 1
    assert summary["applied"] is False
    assert db.query(Comment).count() == 2  # nothing deleted


def test_category_filter_limits_deletion(db, seed):
    item = seed["item"]
    _c(db, item, "Moved to Done")  # status
    _c(db, item, "Ticket transferred from A to B.")  # transfer
    db.commit()

    cleanup(
        dry_run=False,
        categories=("status",),
        work_item_id=None,
        session_factory=_factory(db),
    )

    assert _remaining_contents(db, item) == {"Ticket transferred from A to B."}


def test_idempotent_second_run_noop(db, seed):
    item = seed["item"]
    _c(db, item, "Moved to Done")
    db.commit()

    cleanup(dry_run=False, categories=("status",), work_item_id=None, session_factory=_factory(db))
    summary = cleanup(
        dry_run=False, categories=("status",), work_item_id=None, session_factory=_factory(db)
    )
    assert summary["matched"] == 0
    assert summary["applied"] is False
