"""Unit tests for the cached QB Customer list refresh logic.

Covers `services.workforce_clients.refresh_workforce_clients` and its
read helpers. `fetch_qb_customers` is mocked at the import site in
`services.workforce_clients` so no real Intuit calls happen.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from typing import Any

import pytest
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


def _make_integration(db, realm_id="REALM-1"):
    from models.workforce_integration import WorkforceIntegration

    wi = WorkforceIntegration(
        realm_id=realm_id,
        refresh_token_ciphertext="rt",
        access_token_ciphertext="at",
        access_token_expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


@pytest.fixture
def qb_customers(monkeypatch):
    """Mock `fetch_qb_customers` at the import site so we control what
    "QuickBooks" returns on each refresh. Tests mutate `state["customers"]`
    to simulate adds/removes/renames between refreshes."""
    # `Any` because state mixes a list[dict] (customers) with a
    # nullable Exception (raises); typing precisely needs a TypedDict
    # for one fixture which isn't worth the noise.
    state: dict[str, Any] = {"customers": [], "raises": None}

    def fake_fetch(db, integration):
        if state["raises"]:
            raise state["raises"]
        return list(state["customers"])

    monkeypatch.setattr("services.workforce_clients.fetch_qb_customers", fake_fetch)
    return state


# ============================================================
# refresh_workforce_clients
# ============================================================


def test_initial_refresh_inserts_all_customers(db, qb_customers):
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [
        {"id": "1", "name": "Acme Co"},
        {"id": "2", "name": "Beta LLC"},
    ]

    result = refresh_workforce_clients(db, integration)
    assert result["added"] == 2
    assert result["updated"] == 0
    assert result["deactivated"] == 0
    assert result["total_active"] == 2

    rows = db.query(WorkforceClient).order_by(WorkforceClient.name).all()
    assert [r.qb_customer_id for r in rows] == ["1", "2"]
    assert [r.name for r in rows] == ["Acme Co", "Beta LLC"]
    assert all(r.active for r in rows)
    assert all(r.realm_id == "REALM-1" for r in rows)


def test_subsequent_refresh_updates_renamed_customer(db, qb_customers):
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [{"id": "1", "name": "Acme Co"}]
    refresh_workforce_clients(db, integration)

    # Admin renamed the customer in QB.
    qb_customers["customers"] = [{"id": "1", "name": "Acme International"}]
    result = refresh_workforce_clients(db, integration)
    assert result["added"] == 0
    assert result["updated"] == 1
    assert result["deactivated"] == 0

    row = db.query(WorkforceClient).filter_by(qb_customer_id="1").first()
    assert row.name == "Acme International"


def test_list_active_clients_is_realm_scoped(db, qb_customers):
    """H5 regression: a stale row from a prior realm (left behind by a
    failed clear_workforce_clients) must not leak into list_active_clients.

    The composite PK (qb_customer_id, realm_id) lets a same-id customer
    from two realms coexist; the read must filter to the current realm.
    """
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import list_active_clients

    # Pretend we connected to REALM-OLD first, refreshed clients, then
    # reconnected to REALM-NEW. The cross-realm clear silently failed
    # (try/except wraps it), leaving the REALM-OLD rows. The integration
    # row is now REALM-NEW.
    db.add(
        WorkforceClient(
            qb_customer_id="5",
            realm_id="REALM-OLD",
            name="Old Acme",
            active=True,
            last_synced_at=datetime.utcnow(),
        )
    )
    db.add(
        WorkforceClient(
            qb_customer_id="5",
            realm_id="REALM-NEW",
            name="New Beta",
            active=True,
            last_synced_at=datetime.utcnow(),
        )
    )
    _make_integration(db, realm_id="REALM-NEW")
    db.commit()

    # Reading via the singleton-resolved path: only REALM-NEW's row.
    rows = list_active_clients(db)
    assert rows == [{"id": "5", "name": "New Beta"}]

    # Reading with explicit realm_id: still scoped.
    rows = list_active_clients(db, realm_id="REALM-OLD")
    assert rows == [{"id": "5", "name": "Old Acme"}]


def test_unchanged_customer_does_not_count_as_updated(db, qb_customers):
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    refresh_workforce_clients(db, integration)

    # Re-run without any QB-side change.
    result = refresh_workforce_clients(db, integration)
    assert result["added"] == 0
    assert result["updated"] == 0
    assert result["deactivated"] == 0
    assert result["total_active"] == 1


def test_missing_customer_is_soft_deactivated(db, qb_customers):
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [
        {"id": "1", "name": "Acme"},
        {"id": "2", "name": "Beta"},
    ]
    refresh_workforce_clients(db, integration)

    # Beta was deactivated in QB and no longer appears in the query.
    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    result = refresh_workforce_clients(db, integration)
    assert result["deactivated"] == 1
    assert result["total_active"] == 1

    beta = db.query(WorkforceClient).filter_by(qb_customer_id="2").first()
    assert beta is not None  # soft delete — row stays
    assert beta.active is False


def test_empty_qb_response_deactivates_everything(db, qb_customers):
    """If QB returns no customers at all (e.g. tenant nuked), all
    cached rows go inactive but rows remain (for stale project chips)."""
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [
        {"id": "1", "name": "Acme"},
        {"id": "2", "name": "Beta"},
    ]
    refresh_workforce_clients(db, integration)

    qb_customers["customers"] = []
    result = refresh_workforce_clients(db, integration)
    assert result["deactivated"] == 2
    assert result["total_active"] == 0
    assert db.query(WorkforceClient).count() == 2


def test_reactivation_when_customer_returns(db, qb_customers):
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    refresh_workforce_clients(db, integration)

    # Customer goes away (deactivated upstream).
    qb_customers["customers"] = []
    refresh_workforce_clients(db, integration)
    assert db.query(WorkforceClient).filter_by(qb_customer_id="1").first().active is False

    # Customer comes back.
    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    result = refresh_workforce_clients(db, integration)
    assert result["updated"] == 1  # re-activation counts as an update
    row = db.query(WorkforceClient).filter_by(qb_customer_id="1").first()
    assert row.active is True


def test_rename_after_deactivation_counts_as_one_update(db, qb_customers):
    """A row that's both reactivated AND renamed in the same refresh
    should count as a single `updated`, not double-counted."""
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    refresh_workforce_clients(db, integration)

    qb_customers["customers"] = []
    refresh_workforce_clients(db, integration)

    qb_customers["customers"] = [{"id": "1", "name": "Acme International"}]
    result = refresh_workforce_clients(db, integration)
    assert result["updated"] == 1  # one row changed, not two


def test_customer_with_no_id_is_skipped(db, qb_customers):
    """Defensive — `fetch_qb_customers` should always return id+name,
    but if it ever returns junk we skip rather than crash."""
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [
        {"id": "1", "name": "Acme"},
        {"id": "", "name": "Empty id"},
        {"id": "3", "name": ""},  # also dropped — name missing
    ]
    result = refresh_workforce_clients(db, integration)
    assert result["added"] == 1
    assert result["total_active"] == 1


def test_realm_id_is_recorded_on_insert(db, qb_customers):
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import refresh_workforce_clients

    integration = _make_integration(db, realm_id="REALM-42")
    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    refresh_workforce_clients(db, integration)

    row = db.query(WorkforceClient).first()
    assert row.realm_id == "REALM-42"


def test_qb_api_error_propagates_to_caller(db, qb_customers):
    """The router catches this and surfaces 502 — the service raises."""
    from services.workforce_clients import refresh_workforce_clients
    from services.workforce_qb_client import QBApiError

    integration = _make_integration(db)
    qb_customers["raises"] = QBApiError("nope")

    with pytest.raises(QBApiError):
        refresh_workforce_clients(db, integration)


# ============================================================
# refresh_quietly — best-effort wrapper
# ============================================================


def test_refresh_quietly_swallows_qb_api_error(db, qb_customers):
    """Used by the OAuth callback / sync worker preflight where a refresh
    failure mustn't bubble up."""
    from services.workforce_clients import refresh_quietly
    from services.workforce_qb_client import QBApiError

    integration = _make_integration(db)
    qb_customers["raises"] = QBApiError("nope")

    # No exception raised.
    refresh_quietly(db, integration)


def test_refresh_quietly_succeeds_on_normal_path(db, qb_customers):
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import refresh_quietly

    integration = _make_integration(db)
    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    refresh_quietly(db, integration)
    assert db.query(WorkforceClient).count() == 1


# ============================================================
# list_active_clients + last_refresh_time + clear
# ============================================================


def test_list_active_clients_returns_only_active_sorted_by_name(db, qb_customers):
    from services.workforce_clients import list_active_clients, refresh_workforce_clients

    integration = _make_integration(db)
    qb_customers["customers"] = [
        {"id": "1", "name": "Zeta"},
        {"id": "2", "name": "Acme"},
        {"id": "3", "name": "Beta"},
    ]
    refresh_workforce_clients(db, integration)
    # Deactivate Zeta.
    qb_customers["customers"] = [
        {"id": "2", "name": "Acme"},
        {"id": "3", "name": "Beta"},
    ]
    refresh_workforce_clients(db, integration)

    out = list_active_clients(db)
    assert [c["name"] for c in out] == ["Acme", "Beta"]
    assert [c["id"] for c in out] == ["2", "3"]


def test_last_refresh_time_returns_most_recent(db, qb_customers):
    from services.workforce_clients import last_refresh_time, refresh_workforce_clients

    integration = _make_integration(db)
    assert last_refresh_time(db) is None

    qb_customers["customers"] = [{"id": "1", "name": "Acme"}]
    refresh_workforce_clients(db, integration)
    t = last_refresh_time(db)
    assert t is not None
    # Within a few seconds of now.
    assert (datetime.utcnow() - t).total_seconds() < 5


def test_clear_workforce_clients_drops_all_rows(db, qb_customers):
    """Used on Disconnect to wipe the cache so a reconnect to a
    different realm doesn't see stale rows."""
    from models.workforce_client import WorkforceClient
    from services.workforce_clients import (
        clear_workforce_clients,
        refresh_workforce_clients,
    )

    integration = _make_integration(db)
    qb_customers["customers"] = [
        {"id": "1", "name": "Acme"},
        {"id": "2", "name": "Beta"},
    ]
    refresh_workforce_clients(db, integration)

    deleted = clear_workforce_clients(db)
    assert deleted == 2
    assert db.query(WorkforceClient).count() == 0
