"""QuickBooks Online API client for the Workforce integration.

Three public surfaces:

- **Discovery:** `fetch_qb_employees`, `fetch_qb_customers`. Both return
  paginated full lists; used by the project-link picker and the sync
  worker's email → employee map.
- **Reference resolution:** `resolve_service_item`. Used at connect time
  (and lazily by the sync worker) to find the QB Item id for "Hours".
- **Write:** `post_time_activity`. The single mutation we make against
  QB; everything else is read-only.

Token handling: every public function takes `(db, integration)` and
calls `ensure_fresh_access_token` internally. Callers never deal with
access tokens directly — they don't need to know whether the token was
refreshed mid-call or what its expiry is.

Errors: we surface two typed errors that callers (the sync worker and
the OAuth router) want to distinguish:

- `QBRateLimitError` — Intuit returned 429. Sync worker should stop the
  current run and retry on the next cron tick (NOT spin in a retry
  loop, since rate limits are per-realm and we'd starve other syncs).
- `QBApiError` — any other non-2xx response. Sync worker records the
  error per-entry and continues; OAuth router fails open.

API reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting
"""

import contextlib
import contextvars
import logging
import os
from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx
from sqlalchemy.orm import Session

from models.workforce_integration import WorkforceIntegration
from services.workforce_oauth import ensure_fresh_access_token

logger = logging.getLogger(__name__)

# Run-scoped connection pool. A sync run pushes hundreds of entries through
# `_request` serially; without pooling each call opened a fresh
# httpx.Client() → a new TCP+TLS handshake per request. `connection_pool()`
# binds ONE keep-alive client for the duration of a batch (the `with` block),
# and `_request` reuses it. The client is torn down when the block exits, so
# connection lifetime is bounded to the run — no long-lived idle sockets.
# Callers outside a pool (one-off admin lookups) transparently fall back to a
# per-call client, preserving prior behavior.
_run_client: contextvars.ContextVar[httpx.Client | None] = contextvars.ContextVar(
    "_qb_run_client", default=None
)


@contextlib.contextmanager
def connection_pool() -> Iterator[None]:
    """Bind one keep-alive httpx.Client for a batch of QB calls (e.g. a sync run).

    Bounded to the `with` block: the client — and all pooled connections — is
    closed on exit, including on exception.
    """
    client = httpx.Client(timeout=30.0)
    token = _run_client.set(client)
    try:
        yield
    finally:
        _run_client.reset(token)
        client.close()


# ── Configuration ────────────────────────────────────────────────────────

# Intuit ships incremental API versions ("minor versions"). 65 has been
# stable since 2022 and is widely supported across endpoints we use.
# Bump if Intuit deprecates older versions; the API behaves identically
# for the operations we exercise (Employee/Customer/Item/TimeActivity).
QB_MINOR_VERSION = "65"

# How many records to ask for per page. 1000 is Intuit's maximum.
PAGE_SIZE = 1000

# The Service Item Arsenal HR mandates for every Arsenal time entry.
# Hardcoded — never changes — but pulled out as a constant so it's easy
# to find if HR ever revises the policy.
SERVICE_ITEM_NAME = "Hours"


def _api_base_url() -> str:
    """Resolve the QB API base URL — env override or production default.

    Sandbox value is `https://sandbox-quickbooks.api.intuit.com`. Local
    dev should point at the sandbox via env var.

    Treats empty strings as unset so docker-compose `KEY=${KEY}` rows
    with no value in `.env` fall back to the production default rather
    than producing a `://...` URL.
    """
    raw = os.getenv("INTUIT_API_BASE_URL")
    base = raw if raw else "https://quickbooks.api.intuit.com"
    return base.rstrip("/")


# ── Errors ───────────────────────────────────────────────────────────────


class QBApiError(RuntimeError):
    """Non-2xx response from Intuit's QB API. The status code and body
    excerpt are attached so callers can decide whether to retry or skip.
    """

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class QBRateLimitError(QBApiError):
    """429 from Intuit. Treated specially because retrying the same call
    immediately will just hit the limit again — callers should back off
    and let the next cron tick pick up the slack."""


# ── HTTP plumbing ────────────────────────────────────────────────────────


def _company_path(integration: WorkforceIntegration, endpoint: str) -> str:
    """Build the realm-scoped API path. Every QB API call lives under
    `/v3/company/{realmId}/...`."""
    return f"/v3/company/{integration.realm_id}/{endpoint.lstrip('/')}"


def _request(
    db: Session,
    integration: WorkforceIntegration,
    method: str,
    endpoint: str,
    *,
    params: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Authenticated request to Intuit, with one-shot retry on 401.

    The 401 retry is here because access tokens can be invalidated
    out-of-band (admin revokes in QB UI, Intuit rotates) and our cached
    `access_token_expires_at` won't have caught up. On 401 we force a
    refresh and retry once. If the refresh itself fails the underlying
    `WorkforceOAuthError` propagates.

    Returns the parsed JSON body. Raises `QBRateLimitError` on 429 or
    `QBApiError` on any other non-2xx.
    """
    url = f"{_api_base_url()}{_company_path(integration, endpoint)}"

    # `minorversion` lives in the query string per Intuit convention.
    merged_params = dict(params or {})
    merged_params.setdefault("minorversion", QB_MINOR_VERSION)

    def _send(token: str) -> httpx.Response:
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        pooled = _run_client.get()
        if pooled is not None:
            # Reuse the run-scoped keep-alive client (see connection_pool()).
            return pooled.request(
                method, url, params=merged_params, json=json_body, headers=headers
            )
        # No active pool → one-off client (unchanged behavior for callers
        # outside a batch).
        with httpx.Client(timeout=30.0) as client:
            return client.request(
                method, url, params=merged_params, json=json_body, headers=headers
            )

    try:
        resp = _send(ensure_fresh_access_token(db, integration))
    except httpx.HTTPError as e:
        raise QBApiError(f"Could not reach Intuit API: {e}") from e

    if resp.status_code == 401:
        # Token might have been revoked at Intuit. Invalidate our cache
        # and force a refresh, then retry exactly once — don't loop,
        # otherwise a permanently bad refresh token would spin.
        integration.access_token_expires_at = None
        try:
            resp = _send(ensure_fresh_access_token(db, integration))
        except httpx.HTTPError as e:
            raise QBApiError(f"Could not reach Intuit API on retry: {e}") from e

    if resp.status_code == 429:
        raise QBRateLimitError(
            f"Intuit rate limit hit: {resp.text[:200]}",
            status_code=429,
        )

    if resp.status_code >= 400:
        raise QBApiError(
            f"QB API {method} {endpoint} returned {resp.status_code}: {resp.text[:400]}",
            status_code=resp.status_code,
        )

    try:
        return resp.json()
    except ValueError as e:
        raise QBApiError(f"Could not parse QB API response as JSON: {e}") from e


def _query_all(
    db: Session,
    integration: WorkforceIntegration,
    *,
    entity: str,
    where: str | None = None,
) -> list[dict[str, Any]]:
    """Page through a SOQL-like `SELECT * FROM {entity}` query.

    Intuit's `/query` endpoint caps results at `MAXRESULTS` per call and
    uses `STARTPOSITION` (1-indexed) for paging. We walk pages until we
    see fewer than PAGE_SIZE records back.

    `where` is appended verbatim if supplied — callers must escape any
    user-provided values themselves (we don't take user input here; all
    callers pass hardcoded clauses).
    """
    out: list[dict[str, Any]] = []
    start = 1
    while True:
        query = f"SELECT * FROM {entity}"
        if where:
            query += f" WHERE {where}"
        query += f" STARTPOSITION {start} MAXRESULTS {PAGE_SIZE}"
        data = _request(
            db,
            integration,
            "GET",
            "query",
            params={"query": query},
        )
        items = (data.get("QueryResponse") or {}).get(entity) or []
        out.extend(items)
        if len(items) < PAGE_SIZE:
            break
        start += PAGE_SIZE
    return out


# ── Public API ───────────────────────────────────────────────────────────


def fetch_qb_employees(db: Session, integration: WorkforceIntegration) -> dict[str, str]:
    """Return a `lowercased_email -> qb_employee_id` map.

    Used by the sync worker to resolve `developer.email` → QB Employee
    on each TimeActivity push. Lowercased on both sides because Intuit
    does NOT enforce email case consistency.

    Inactive employees are excluded — pushing time to a deactivated
    employee returns a confusing error from QB.

    Empty / missing emails are dropped. If two employees share an email
    (rare; Intuit doesn't enforce uniqueness) the first one wins; a
    warning is logged so the admin can de-dup in QB.
    """
    employees = _query_all(
        db,
        integration,
        entity="Employee",
        where="Active = true",
    )
    mapping: dict[str, str] = {}
    for emp in employees:
        primary = (emp.get("PrimaryEmailAddr") or {}).get("Address")
        if not primary:
            continue
        key = primary.lower().strip()
        if not key:
            continue
        if key in mapping:
            logger.warning(
                "QB employees %s and %s share email %s; first match wins",
                mapping[key],
                emp.get("Id"),
                key,
            )
            continue
        mapping[key] = str(emp.get("Id"))
    return mapping


def fetch_qb_classes(db: Session, integration: WorkforceIntegration) -> dict[str, str]:
    """Return a `lowercased_class_name -> qb_class_id` map.

    QuickBooks calls the project-category dimension a "Class". We resolve
    a project's category name to its QB Class id on each TimeActivity push
    so the entry carries a `ClassRef`. Both the leaf `Name` and the
    `FullyQualifiedName` (e.g. "Parent:Child") are indexed so a category
    named either way resolves; first writer wins on collision.

    Inactive classes are excluded. Returns an empty map when Class
    tracking is off or no classes exist — callers then simply omit the
    ClassRef rather than failing the push.
    """
    classes = _query_all(
        db,
        integration,
        entity="Class",
        where="Active = true",
    )
    mapping: dict[str, str] = {}
    for cls in classes:
        cid = str(cls.get("Id"))
        for raw in (cls.get("Name"), cls.get("FullyQualifiedName")):
            if not raw:
                continue
            key = raw.lower().strip()
            if key:
                mapping.setdefault(key, cid)
    return mapping


def fetch_qb_customers(db: Session, integration: WorkforceIntegration) -> list[dict[str, str]]:
    """Return the active QB Customer list shaped for the frontend picker.

    Only `id` and `name` are returned — the full QB Customer object is
    large and we'd rather not leak unnecessary fields to the browser.
    Sorted by name for stable UX (Intuit's natural order is creation
    order which isn't useful).

    Inactive customers are excluded so deprovisioned clients don't
    clutter the picker.
    """
    customers = _query_all(
        db,
        integration,
        entity="Customer",
        where="Active = true",
    )
    out = [
        {
            "id": str(c.get("Id")),
            "name": c.get("DisplayName") or c.get("CompanyName") or f"Customer {c.get('Id')}",
        }
        for c in customers
    ]
    out.sort(key=lambda c: c["name"].lower())
    return out


def fetch_company_info(db: Session, integration: WorkforceIntegration) -> str | None:
    """Return the QB Company name for this integration's realm.

    Hits the `companyinfo/{realm_id}` endpoint. Returns the
    `CompanyName` field, or `None` if QB doesn't include one (rare —
    fresh sandboxes occasionally have an empty name). Callers should
    treat None as "show the realm id as fallback".
    """
    data = _request(
        db,
        integration,
        "GET",
        f"companyinfo/{integration.realm_id}",
    )
    info = data.get("CompanyInfo") or {}
    name = info.get("CompanyName")
    if not name:
        return None
    return str(name).strip() or None


def resolve_service_item(
    db: Session, integration: WorkforceIntegration, *, name: str = SERVICE_ITEM_NAME
) -> dict[str, str] | None:
    """Find the QB Item with the given exact name, returning `{id, name}`.

    Returns `None` if no matching active Service item exists — the
    caller decides how to surface that (the OAuth callback warns but
    proceeds; the sync worker fails the run with a clear error).

    The lookup is exact-match on `Name` (not `DisplayName`) and filters
    `Type = 'Service'`; this is HR's contract — Arsenal hours go to
    Service Item "Hours", not "Services" or a category of the same
    name. If a customer has multiple matching items (shouldn't happen
    given QB's name uniqueness rules within a type), the first wins
    and a warning is logged.
    """
    # The Name value comes from a hardcoded constant; still, escape any
    # single quotes defensively so future callers passing user input
    # can't break out of the SQL string.
    safe_name = name.replace("'", "''")
    where = f"Name = '{safe_name}' AND Type = 'Service' AND Active = true"
    items = _query_all(db, integration, entity="Item", where=where)
    if not items:
        return None
    if len(items) > 1:
        logger.warning("Multiple QB Items named %r found; using id=%s", name, items[0].get("Id"))
    return {
        "id": str(items[0].get("Id")),
        "name": items[0].get("Name") or name,
    }


def post_time_activity(
    db: Session,
    integration: WorkforceIntegration,
    *,
    employee_qb_id: str,
    customer_qb_id: str,
    service_item_id: str,
    hours: int,
    txn_date: date,
    description: str | None = None,
    billable: bool = False,
    class_id: str | None = None,
) -> str:
    """Create a TimeActivity in QB. Returns the new TimeActivity Id.

    The four fields Arsenal tracks per entry all flow through here:
      - `CustomerRef`  — the Client (project's QB customer).
      - `ItemRef`      — the Service Item (always "Hours").
      - `BillableStatus` — driven by the caller's `billable` flag (NOT
        hardcoded): True → "Billable", False → "NotBillable". The dev
        sets it per client in the Review & Submit modal.
      - `ClassRef`     — the Class (project's category), sent only when
        the caller resolved a matching QB Class id (`class_id`); omitted
        otherwise so a push never fails when Class tracking is off.

    `Taxable = false` is left as-is. The sync worker passes integer
    `hours`; we send `Hours: N, Minutes: 0` because Arsenal logs hours,
    not finer granularity. If a future change adds minutes, this is
    where to split them.

    The `Description` is shown in QB's TimeActivity detail view. We
    pass it through verbatim (caller is responsible for truncating /
    formatting); QB has a generous 4000-char limit so this is safe.
    """
    body: dict[str, Any] = {
        "TxnDate": txn_date.isoformat(),
        "NameOf": "Employee",
        "EmployeeRef": {"value": employee_qb_id},
        "CustomerRef": {"value": customer_qb_id},
        "ItemRef": {"value": service_item_id},
        "BillableStatus": "Billable" if billable else "NotBillable",
        "Taxable": False,
        "Hours": int(hours),
        "Minutes": 0,
    }
    # Class (the project's category). Optional — only sent when the caller
    # resolved a matching QB Class id. QB rejects a ClassRef when Class
    # tracking is off, so callers pass None in that case.
    if class_id:
        body["ClassRef"] = {"value": class_id}
    if description:
        body["Description"] = description

    resp = _request(
        db,
        integration,
        "POST",
        "timeactivity",
        json_body=body,
    )
    activity = resp.get("TimeActivity") or {}
    qb_id = activity.get("Id")
    if not qb_id:
        # Defensive — Intuit always returns Id on success, but if the
        # shape ever changes a clear error beats a silent KeyError.
        raise QBApiError(f"QB TimeActivity created but response had no Id: {resp!r}"[:400])
    return str(qb_id)
