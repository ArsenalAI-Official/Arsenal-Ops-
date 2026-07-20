"""Unit tests for `scripts.dedupe_time_entries`.

Specific focus: the workforce-idempotency contract added to the script —
synced rows (`workforce_entry_id IS NOT NULL`) must never be deleted, and
must be preferred as the keeper so the unsynced dup is the one removed.
Without these guarantees the script can orphan a QuickBooks TimeActivity
record or trigger a duplicate billable push on the next sync.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import models  # noqa: F401 — registers tables with Base.metadata
from database import Base
from models.developer import Developer
from models.project import Project
from models.time_entry import TimeEntry
from models.work_item import WorkItem

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


def _make_project(db, name="P", workforce_client_id=None, workforce_client_name=None):
    p = Project(
        name=name,
        description="x",
        status="active",
        workforce_client_id=workforce_client_id,
        workforce_client_name=workforce_client_name,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _make_dev(db, name="Dev", email="dev@example.test"):
    d = Developer(name=name, email=email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def _make_wi(db, project_id, key="WI-1"):
    wi = WorkItem(
        project_id=project_id,
        key=key,
        title="t",
        status="todo",
        type="task",
        estimated_hours=8,
        logged_hours=0,
        remaining_hours=8,
    )
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


def _make_te(db, wi, dev, hours, logged_at, workforce_entry_id=None):
    te = TimeEntry(
        work_item_id=wi.id,
        developer_id=dev.id,
        hours=hours,
        logged_at=logged_at,
        workforce_entry_id=workforce_entry_id,
    )
    db.add(te)
    db.commit()
    db.refresh(te)
    return te


def _run_dedupe(db, **kwargs):
    """Invoke the script's `dedupe()` against the test session.

    The session is shared across the script invocation by passing a
    factory that returns this same session — `dedupe()` calls
    `session_factory()` exactly once and closes it in a finally block,
    so we wrap it to suppress the close (the test fixture will close it).
    """
    from scripts.dedupe_time_entries import dedupe

    class _Wrapped:
        def __init__(self, sess):
            self._sess = sess

        def __getattr__(self, name):
            if name == "close":
                return lambda: None
            return getattr(self._sess, name)

    return dedupe(
        window_seconds=kwargs.get("window_seconds", 60),
        dry_run=kwargs.get("dry_run", False),
        work_item_id=kwargs.get("work_item_id"),
        session_factory=lambda: _Wrapped(db),
    )


def test_unsynced_duplicates_collapse_earliest_keeper(db):
    """Baseline behavior: with no synced rows in a cluster, earliest is kept."""
    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id)
    t0 = datetime(2024, 1, 8, 10, 0, 0)
    e1_id = _make_te(db, wi, dev, 2, t0).id
    e2_id = _make_te(db, wi, dev, 2, t0 + timedelta(seconds=5)).id
    e3_id = _make_te(db, wi, dev, 2, t0 + timedelta(seconds=10)).id

    summary = _run_dedupe(db)
    db.expunge_all()  # clear the test session's stale identity map
    assert summary["duplicates_found"] == 2
    assert summary["synced_conflicts"] == 0

    remaining_ids = {te.id for te in db.query(TimeEntry).all()}
    # Earliest survives; both later ones deleted.
    assert remaining_ids == {e1_id}
    assert e2_id not in remaining_ids
    assert e3_id not in remaining_ids


def test_synced_row_never_deleted_even_if_later(db):
    """Critical: if a synced row is the LATER duplicate, the script must
    swap the keeper so the unsynced earlier row is the one deleted —
    deleting the synced row would orphan a QB TimeActivity."""
    project = _make_project(db, workforce_client_id="QB-1", workforce_client_name="Acme")
    dev = _make_dev(db)
    wi = _make_wi(db, project.id)
    t0 = datetime(2024, 1, 8, 10, 0, 0)
    unsynced_earlier_id = _make_te(db, wi, dev, 2, t0).id
    synced_later_id = _make_te(
        db, wi, dev, 2, t0 + timedelta(seconds=5), workforce_entry_id="QB-ACTIVITY-99"
    ).id

    summary = _run_dedupe(db)
    db.expunge_all()
    assert summary["duplicates_found"] == 1
    assert summary["synced_conflicts"] == 0

    remaining_ids = {te.id for te in db.query(TimeEntry).all()}
    # Synced row survives even though it wasn't the earliest.
    assert synced_later_id in remaining_ids
    # Unsynced earlier row was the one deleted.
    assert unsynced_earlier_id not in remaining_ids

    survivor = db.query(TimeEntry).filter(TimeEntry.id == synced_later_id).first()
    assert survivor is not None
    assert survivor.workforce_entry_id == "QB-ACTIVITY-99"


def test_multiple_synced_rows_in_cluster_skipped(db):
    """If a cluster somehow contains >1 synced row (shouldn't happen if
    the sync's NULL gate is honoured), the script leaves the cluster
    alone — manual reconciliation only. Auto-deleting one of two
    synced rows would orphan a QB record."""
    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id)
    t0 = datetime(2024, 1, 8, 10, 0, 0)
    synced_a_id = _make_te(db, wi, dev, 2, t0, workforce_entry_id="QB-A").id
    synced_b_id = _make_te(db, wi, dev, 2, t0 + timedelta(seconds=5), workforce_entry_id="QB-B").id
    unsynced_c_id = _make_te(db, wi, dev, 2, t0 + timedelta(seconds=10)).id

    summary = _run_dedupe(db)
    db.expunge_all()
    assert summary["duplicates_found"] == 0
    assert summary["synced_conflicts"] == 1

    remaining_ids = {te.id for te in db.query(TimeEntry).all()}
    # All three rows still exist — the script refused to touch the
    # cluster because resolving the conflict is the operator's call.
    assert remaining_ids == {synced_a_id, synced_b_id, unsynced_c_id}


def test_synced_row_outside_window_is_independent(db):
    """A synced row that's outside the time window of an unsynced
    cluster forms its own (single-row) cluster and is untouched. The
    other cluster's earliest-is-keeper behavior is unaffected."""
    project = _make_project(db)
    dev = _make_dev(db)
    wi = _make_wi(db, project.id)
    t0 = datetime(2024, 1, 8, 10, 0, 0)
    # Cluster 1: two unsynced dups within 60s.
    keeper_1_id = _make_te(db, wi, dev, 2, t0).id
    dup_1_id = _make_te(db, wi, dev, 2, t0 + timedelta(seconds=5)).id
    # Cluster 2: a synced row 10 minutes later — outside the window of
    # cluster 1, in its own time-cluster.
    synced_alone_id = _make_te(
        db, wi, dev, 2, t0 + timedelta(minutes=10), workforce_entry_id="QB-1"
    ).id

    summary = _run_dedupe(db)
    db.expunge_all()
    assert summary["duplicates_found"] == 1
    assert summary["synced_conflicts"] == 0

    remaining_ids = {te.id for te in db.query(TimeEntry).all()}
    assert remaining_ids == {keeper_1_id, synced_alone_id}
    assert dup_1_id not in remaining_ids
