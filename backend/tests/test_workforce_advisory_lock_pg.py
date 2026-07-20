"""Postgres-backed integration tests for the workforce advisory lock.

These verify the H2 fix: the lock is owned by a dedicated Connection
separate from the ORM Session's connection, so per-entry ORM commits
(which can swap the Session's pooled connection) don't release or
"lose" the lock.

Gated by the ``WORKFORCE_PG_TESTS=1`` env var because they require a
running Postgres. Skipped otherwise (CI today is sqlite-only).

To run locally::

    docker compose up -d db
    WORKFORCE_PG_TESTS=1 \\
      DATABASE_URL=postgresql://arsenalops:arsenalops@localhost:5432/arsenalops \\
      python -m pytest backend/tests/test_workforce_advisory_lock_pg.py -v

The fixtures share a single engine pointed at the configured database.
Each test creates its own Session(s) and tears them down via the ORM,
without dropping tables — the lock test doesn't write to anything other
than ``pg_locks`` so leaving the schema untouched is fine.
"""

from __future__ import annotations

import os
import sys

import pytest

if os.getenv("WORKFORCE_PG_TESTS") != "1":
    pytest.skip(
        "WORKFORCE_PG_TESTS!=1 — Postgres advisory lock tests skipped. "
        "Set WORKFORCE_PG_TESTS=1 + a Postgres DATABASE_URL to run.",
        allow_module_level=True,
    )

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from services.workforce_sync import (
    ADVISORY_LOCK_KEY,
    _release_advisory_lock,
    _try_advisory_lock,
)

_DB_URL_OPT = os.environ.get("DATABASE_URL")
if not _DB_URL_OPT or not _DB_URL_OPT.startswith(("postgresql://", "postgres://")):
    pytest.skip(
        "DATABASE_URL must point at a Postgres database for these tests.",
        allow_module_level=True,
    )
# After the skip the env var is guaranteed populated; rebind to a
# non-Optional alias so `create_engine(DB_URL)` type-checks below.
DB_URL: str = _DB_URL_OPT


@pytest.fixture
def engine():
    """Pool sized at 5 so we can simulate per-entry commits comfortably."""
    eng = create_engine(DB_URL, pool_size=5, max_overflow=2)
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    Session = sessionmaker(bind=engine)
    s = Session()
    try:
        yield s
    finally:
        s.close()


def _lock_held_count(engine) -> int:
    """Query pg_locks for our advisory lock — direct DB observation, not
    via the Session under test, so we get an honest answer."""
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objid = :k"),
            {"k": ADVISORY_LOCK_KEY},
        ).scalar()
    return int(row or 0)


def test_lock_acquire_returns_connection(engine, session):
    """Happy path: acquire returns a Connection; pg_locks shows it held."""
    assert _lock_held_count(engine) == 0

    lock_conn = _try_advisory_lock(session)
    try:
        assert lock_conn is not False
        assert lock_conn is not None
        assert _lock_held_count(engine) == 1
    finally:
        _release_advisory_lock(lock_conn)

    assert _lock_held_count(engine) == 0


def test_session_commits_do_not_release_lock(engine, session):
    """The H2 regression: the Session can commit (potentially swapping
    its pooled connection) without releasing the lock held on the
    separate Connection.

    We hold the lock, then have the Session run + commit many times.
    The lock must remain held throughout, because it lives on a
    different connection.
    """
    lock_conn = _try_advisory_lock(session)
    try:
        assert lock_conn is not False
        # Simulate the per-entry-commit pattern run_workforce_sync uses.
        for _ in range(20):
            session.execute(text("SELECT 1"))
            session.commit()
            assert _lock_held_count(engine) == 1, (
                "advisory lock released by ORM Session commit — "
                "H2 regression: lock not pinned to a dedicated Connection"
            )
    finally:
        _release_advisory_lock(lock_conn)

    assert _lock_held_count(engine) == 0


def test_second_acquirer_gets_false(engine, session):
    """Concurrency: while the lock is held, a second acquirer must
    receive False, not block. The whole sync depends on this — that's
    what surfaces as ``status=locked`` to the caller."""
    first = _try_advisory_lock(session)
    try:
        assert first is not False
        # Second attempt — fresh session, hits the same engine pool.
        Session = sessionmaker(bind=engine)
        s2 = Session()
        try:
            second = _try_advisory_lock(s2)
            assert second is False
        finally:
            s2.close()
    finally:
        _release_advisory_lock(first)


def test_release_on_exception_path(engine, session):
    """If the body inside the lock raises, release still runs (the
    caller wraps in try/finally) and the lock comes off."""
    lock_conn = _try_advisory_lock(session)
    try:
        assert _lock_held_count(engine) == 1
        raise RuntimeError("simulated mid-sync failure")
    except RuntimeError:
        pass
    finally:
        _release_advisory_lock(lock_conn)

    assert _lock_held_count(engine) == 0
