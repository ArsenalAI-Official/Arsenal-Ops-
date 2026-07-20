"""Refresh + read helpers for the cached QuickBooks Customer list.

Two surfaces:

- `refresh_workforce_clients(db, integration)` — fetches the full
  Customer list from QB, upserts it into `workforce_clients`, and
  soft-deactivates any row not present in the latest fetch. Called by:
    1. The OAuth callback right after a successful Connect (eager seed).
    2. The Saturday sync worker at run start (weekly refresh).
    3. The manual "Refresh clients" button on the Integrations tab.

- `list_active_clients(db)` — reads only `active=True` rows from the
  cache, sorted by name. Returns the same shape (`[{id, name}]`) the
  router used to return from the live fetch, so the picker is unchanged.

Why a cache rather than live calls:
  - Picker open should be free of Intuit round-trips (latency + rate limits).
  - Picker keeps working through transient Intuit outages.
  - Predictable refresh cadence — admin knows the list updates on
    Saturday, and can force-refresh in one click if needed.

Why soft-delete (`active=False`) rather than hard-delete:
  - A project may already be tagged to a customer that QB later
    deactivates. The project chip needs to keep rendering the name;
    soft-delete preserves the row, hard-delete would orphan it.
  - Pickers filter on `active=True`, so deactivated customers fall out
    of the dropdown automatically — no surface clutter.
"""

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models.workforce_client import WorkforceClient
from models.workforce_integration import WorkforceIntegration
from services.workforce_oauth import WorkforceOAuthError
from services.workforce_qb_client import QBApiError, fetch_qb_customers

logger = logging.getLogger(__name__)


def refresh_workforce_clients(db: Session, integration: WorkforceIntegration) -> dict[str, Any]:
    """Reconcile the local `workforce_clients` cache with QuickBooks.

    Returns a counts dict the router can return verbatim and the UI
    can show to the admin who clicked Refresh::

        {
          "added":       int,  # rows newly inserted this run
          "updated":     int,  # rows whose name or active flag changed
          "deactivated": int,  # rows present last refresh, not seen now
          "total_active": int, # count of active rows after refresh
        }

    Raises on hard failures (QB API down, OAuth refresh failed) — the
    router catches and surfaces them to the admin. Doesn't raise on
    partial weirdness (e.g. QB returns a customer with no name); those
    rows are dropped with a warning.
    """
    realm_id = integration.realm_id

    # 1. Pull current QB state. `fetch_qb_customers` already filters to
    #    Active=true on the QB side, so anything NOT in this list is
    #    either deactivated, deleted, or in a realm we no longer talk to.
    customers = fetch_qb_customers(db, integration)
    seen_ids: set[str] = set()
    added = updated = 0
    now = datetime.utcnow()

    for c in customers:
        qb_id = c.get("id")
        name = c.get("name")
        if not qb_id or not name:
            # Defensive — fetch_qb_customers should always return both.
            logger.warning("Skipping QB customer with missing id/name: %r", c)
            continue
        seen_ids.add(qb_id)

        # Composite PK is (qb_customer_id, realm_id). Match on BOTH so a
        # same-id customer in a different realm can't collide with this
        # one. (Intuit hands out small ints starting from 1, so a
        # realm-A "5" and realm-B "5" coexisting must be modelled as
        # distinct rows.)
        existing = (
            db.query(WorkforceClient)
            .filter(
                WorkforceClient.qb_customer_id == qb_id,
                WorkforceClient.realm_id == realm_id,
            )
            .first()
        )
        if existing is None:
            db.add(
                WorkforceClient(
                    qb_customer_id=qb_id,
                    name=name,
                    realm_id=realm_id,
                    active=True,
                    last_synced_at=now,
                )
            )
            added += 1
        else:
            changed = False
            if existing.name != name:
                existing.name = name
                changed = True
            if not existing.active:
                # Re-activation — customer was previously missing from
                # a refresh but is back now.
                existing.active = True
                changed = True
            existing.last_synced_at = now
            if changed:
                updated += 1

    # 2. Mark anything we didn't see as inactive. Scoped to the current
    #    realm so rows from a stale realm (rare; shouldn't happen) stay
    #    untouched — the delete on disconnect handles them separately.
    stale_query = db.query(WorkforceClient).filter(
        WorkforceClient.realm_id == realm_id,
        WorkforceClient.active.is_(True),
    )
    if seen_ids:
        stale_query = stale_query.filter(~WorkforceClient.qb_customer_id.in_(seen_ids))
    stale_rows = stale_query.all()
    deactivated = 0
    for row in stale_rows:
        row.active = False
        deactivated += 1

    db.commit()

    total_active = (
        db.query(WorkforceClient)
        .filter(
            WorkforceClient.realm_id == realm_id,
            WorkforceClient.active.is_(True),
        )
        .count()
    )

    logger.info(
        "[workforce_clients] refresh realm=%s added=%d updated=%d deactivated=%d active=%d",
        realm_id,
        added,
        updated,
        deactivated,
        total_active,
    )
    return {
        "added": added,
        "updated": updated,
        "deactivated": deactivated,
        "total_active": total_active,
    }


def list_active_clients(db: Session, realm_id: str | None = None) -> list[dict[str, str]]:
    """Read the cached client list for the picker. Active rows only, sorted by name.

    Realm scope: if `realm_id` is given (production path — router
    resolves it from the singleton WorkforceIntegration row), only
    customers from that realm are returned. If omitted, the function
    resolves the realm from the integration row itself.

    Returns the same shape the router used to return from live fetch
    (`[{id, name}]`) so the picker is unchanged.

    Why realm-scope matters: cross-realm hygiene (clearing the cache on
    reconnect-to-different-realm, on disconnect) is best-effort —
    callers wrap clear_workforce_clients in try/except. If a clear
    silently fails, a non-scoped read would merge two realms' customers
    into one picker; the realm filter on this read makes that
    impossible regardless of cleanup ordering.
    """
    if realm_id is None:
        # Resolve from the singleton integration row; this is the
        # production path the router actually hits.
        integration = db.query(WorkforceIntegration).first()
        if integration is None:
            return []
        realm_id = integration.realm_id

    rows = (
        db.query(WorkforceClient)
        .filter(
            WorkforceClient.realm_id == realm_id,
            WorkforceClient.active.is_(True),
        )
        .order_by(WorkforceClient.name.asc())
        .all()
    )
    return [{"id": r.qb_customer_id, "name": r.name} for r in rows]


def last_refresh_time(db: Session, realm_id: str | None = None) -> datetime | None:
    """Most recent `last_synced_at` for the given realm, or None if the
    cache has never been populated. Realm-scoped for the same reason as
    `list_active_clients` — see that docstring."""
    if realm_id is None:
        integration = db.query(WorkforceIntegration).first()
        if integration is None:
            return None
        realm_id = integration.realm_id

    row = (
        db.query(WorkforceClient)
        .filter(WorkforceClient.realm_id == realm_id)
        .order_by(WorkforceClient.last_synced_at.desc())
        .first()
    )
    return row.last_synced_at if row else None


def clear_workforce_clients(db: Session) -> int:
    """Drop every cached client. Called on Disconnect so a fresh
    Connect to a different realm doesn't see stale rows. Returns the
    deleted count."""
    deleted = db.query(WorkforceClient).delete()
    db.commit()
    return deleted


def refresh_quietly(db: Session, integration: WorkforceIntegration) -> None:
    """Best-effort wrapper used by callers that mustn't propagate a
    failure (OAuth callback, sync worker preflight). Logs and swallows.
    """
    try:
        refresh_workforce_clients(db, integration)
    except (QBApiError, WorkforceOAuthError) as e:
        logger.warning("[workforce_clients] background refresh failed: %s", e)
    except Exception as e:
        logger.exception("[workforce_clients] unexpected refresh error: %s", e)
