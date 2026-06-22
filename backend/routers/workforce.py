"""Workforce / QuickBooks integration HTTP endpoints.

Split into two namespaces:

- `/api/admin/workforce/*` — admin actions. All require the
  `admin.workforce_connect` capability. Used by the Integrations tab in
  the admin UI.
- `/api/auth/workforce/callback` — the public OAuth callback that Intuit
  redirects the admin's browser to. Not gated by capability (the admin
  is mid-flow and isn't sending an Authorization header); instead it's
  protected by a signed, single-use `state` token bound to the admin's
  user id with a 10-minute TTL.

Token storage: this router NEVER returns tokens or ciphertext in any
response. All cryptography stays inside `services/workforce_oauth.py`.
The status endpoint uses `WorkforceIntegration.to_safe_dict()` which
explicitly redacts the token columns.

This is Phase 2 of the integration plan — connect/disconnect/status.
The QB API client (employees/customers/post_time_activity) and the sync
worker live in later phases; this file does not implement them.
"""

import logging
import os
import secrets
import sys
from datetime import datetime, timedelta

from cachetools import TTLCache
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

sys.path.append("..")
from database import get_db
from models.project import Project
from models.user import User
from models.workforce_integration import WorkforceIntegration
from routers.auth import ALGORITHM, SECRET_KEY, require_capability
from services.workforce_clients import (
    clear_workforce_clients,
    last_refresh_time,
    list_active_clients,
    refresh_quietly,
    refresh_workforce_clients,
)
from services.workforce_crypto import (
    WorkforceCryptoCorrupted,
    WorkforceCryptoNotConfigured,
    decrypt,
)
from services.workforce_oauth import (
    WorkforceOAuthError,
    WorkforceOAuthMisconfigured,
    build_authorize_url,
    exchange_code_for_tokens,
    persist_tokens,
    revoke_token,
)
from services.workforce_qb_client import (
    QBApiError,
    fetch_company_info,
    resolve_service_item,
)
from services.workforce_sync import is_sync_in_progress, run_workforce_sync
from services.workforce_sync_notify import send_sync_notification

logger = logging.getLogger(__name__)

# Two routers because the callback lives under /api/auth (it's the
# inbound side of the OAuth handshake — keeping it under /api/auth is
# the convention already used by the Google SSO callback) while admin
# actions live under /api/admin/workforce.
router = APIRouter(prefix="/api/admin/workforce", tags=["workforce"])
callback_router = APIRouter(prefix="/api/auth/workforce", tags=["workforce"])


# ── State token (CSRF protection on the OAuth dance) ─────────────────────

# Short-lived JWT signed with the same SECRET_KEY as the rest of the
# app. Bound to a specific admin user id and carries a `purpose` claim
# so a regular auth token can't be substituted as a state value.
STATE_TOKEN_TTL_MINUTES = 10
STATE_TOKEN_PURPOSE = "workforce_oauth_connect"

# In-process cache of already-consumed state token JTIs. Single-use
# enforcement: once a state token completes the callback, its jti is
# inserted here and any second validation attempt is rejected (closes
# the 10-min replay window the TTL alone leaves open).
#
# In-process is fine for a single-replica Render service. If the API
# ever scales to >1 replica, this needs a shared store (Redis / DB
# row) — surfaced in REVIEW_RULES.md.
_CONSUMED_STATE_JTI: TTLCache = TTLCache(
    maxsize=10_000,
    ttl=STATE_TOKEN_TTL_MINUTES * 60,
)


def _issue_state_token(user_id: int) -> str:
    """Mint a state token the admin's browser will round-trip via Intuit.

    Carries:
      - ``sub``: admin user id (string-cast for JWT spec compliance)
      - ``purpose``: scopes the token to the OAuth callback only
      - ``exp``: 10-min TTL
      - ``jti``: random per-token id for single-use enforcement in
        ``_verify_state_token``
    """
    payload = {
        "sub": str(user_id),
        "purpose": STATE_TOKEN_PURPOSE,
        "exp": datetime.utcnow() + timedelta(minutes=STATE_TOKEN_TTL_MINUTES),
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _verify_state_token(state: str) -> int:
    """Validate the state token from the callback, returning the admin user id.

    Raises 400 on any failure — expired, wrong purpose claim, tampered
    signature, replayed jti, missing required claim. The error message
    is intentionally generic so probes don't learn why the token was
    rejected.

    Side effect on success: the token's ``jti`` is added to a TTL cache
    so a second validation of the same token (replay within the 10-min
    window) is rejected. State tokens travel in the URL bar and the
    Referer header to Intuit, so single-use is the right discipline.
    """
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired state token. Restart the connection from the admin UI.",
    )
    try:
        payload = jwt.decode(state, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise invalid from None
    # Pin required claims — `exp` is verified by jose, the rest we check
    # ourselves so a malformed token can't slip through.
    if payload.get("purpose") != STATE_TOKEN_PURPOSE:
        raise invalid
    sub = payload.get("sub")
    if not sub:
        raise invalid
    jti = payload.get("jti")
    if not jti:
        raise invalid
    if jti in _CONSUMED_STATE_JTI:
        raise invalid
    _CONSUMED_STATE_JTI[jti] = True
    try:
        return int(sub)
    except (TypeError, ValueError):
        raise invalid from None


def _post_oauth_redirect_url(qs: str) -> str:
    """Where to send the admin's browser after the callback finishes.

    The browser is sitting on the *backend* host when we issue this
    302 (the callback URL Intuit redirected to). A relative target like
    `/admin?tab=integrations` would resolve against the backend host —
    fine if the SPA is served from the same origin, broken in the
    typical split deploy (frontend on :5173 / a Vercel host, backend on
    :8000 / api.<domain>) where the backend has no `/admin` route and
    answers 404.

    Resolution:
      `FRONTEND_URL` (or `http://localhost:5173` for unset local dev) +
      `/admin?tab=integrations`. Arsenal Ops always serves the admin
      page at this path; no per-deploy override needed.
    """
    raw_frontend = os.getenv("FRONTEND_URL")
    frontend = (raw_frontend or "http://localhost:5173").rstrip("/")
    base = f"{frontend}/admin?tab=integrations"
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}{qs}"


# ── Response schemas ─────────────────────────────────────────────────────


class ConnectResponse(BaseModel):
    authorize_url: str


class StatusResponse(BaseModel):
    connected: bool
    # Populated only when connected; see WorkforceIntegration.to_safe_dict().
    integration: dict | None = None


# ── Endpoints ────────────────────────────────────────────────────────────


@router.get(
    "/status",
    response_model=StatusResponse,
    dependencies=[Depends(require_capability("admin.workforce_connect"))],
)
def get_status(db: Session = Depends(get_db)) -> StatusResponse:
    """Is the integration connected? If yes, return safe metadata only.

    Token ciphertext is REDACTED by `to_safe_dict()` — this endpoint
    never reveals encrypted tokens to the client.
    """
    integration = db.query(WorkforceIntegration).first()
    if not integration:
        return StatusResponse(connected=False)
    return StatusResponse(connected=True, integration=integration.to_safe_dict())


@router.post("/connect", response_model=ConnectResponse)
def start_connect(
    current_user: User = Depends(require_capability("admin.workforce_connect")),
    db: Session = Depends(get_db),
) -> ConnectResponse:
    """Begin the OAuth handshake — returns the Intuit authorize URL.

    Two safety checks before issuing the URL:

    1. **Crypto must be configured.** If `WORKFORCE_TOKEN_ENCRYPTION_KEY`
       is missing we'd successfully OAuth and then crash trying to
       persist the tokens. Failing fast here lets the admin fix the env
       var before clicking through to Intuit.
    2. **Intuit env vars must be configured.** Same reasoning —
       `build_authorize_url` raises a typed error we surface as 503.

    We DO NOT block a re-connect when an integration row already exists.
    The callback will overwrite the row (one-singleton design). This
    lets the admin re-authorize without first hitting Disconnect, which
    matches Intuit's recommendation for re-consent flows.
    """
    # Crypto preflight — call into the helper so its missing-key error
    # message reaches the admin verbatim.
    try:
        from services.workforce_crypto import _load_cipher

        _load_cipher()
    except WorkforceCryptoNotConfigured as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e

    try:
        authorize_url = build_authorize_url(_issue_state_token(current_user.id))
    except WorkforceOAuthMisconfigured as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from e

    return ConnectResponse(authorize_url=authorize_url)


@callback_router.get("/callback")
def oauth_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    realmId: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Receive the OAuth callback from Intuit and persist tokens.

    Flow:
    1. Intuit appends `?code=...&state=...&realmId=...` to our redirect URI.
    2. We verify the state token came from us and identifies a real user.
    3. We trade the code for tokens via the token endpoint.
    4. We upsert the singleton WorkforceIntegration row with encrypted tokens.
    5. We redirect the admin's browser back to the Integrations tab.

    If the user denied access, Intuit instead sends `?error=access_denied`
    and we redirect with a friendly notice — no DB write.

    Errors anywhere in steps 2-4 still redirect with an error parameter
    rather than returning JSON, because the admin is sitting in a
    browser tab; a JSON 500 would dead-end them.
    """
    # User declined consent at Intuit — bounce back to the admin UI.
    if error:
        return RedirectResponse(
            _post_oauth_redirect_url(f"workforce=denied&reason={error}"),
            status_code=302,
        )

    if not code or not state or not realmId:
        return RedirectResponse(
            _post_oauth_redirect_url("workforce=error&reason=missing_params"),
            status_code=302,
        )

    # Validate state BEFORE making an Intuit token call, so a malicious
    # caller can't burn auth codes by replaying them through us.
    try:
        admin_user_id = _verify_state_token(state)
    except HTTPException as e:
        return RedirectResponse(
            _post_oauth_redirect_url(f"workforce=error&reason=bad_state&detail={e.detail[:80]}"),
            status_code=302,
        )

    # Confirm the user still exists and still has the capability. The
    # state token's TTL is short but RBAC could have changed in the
    # interim.
    admin = db.query(User).filter(User.id == admin_user_id).first()
    if not admin or not admin.has_capability("admin.workforce_connect"):
        return RedirectResponse(
            _post_oauth_redirect_url("workforce=error&reason=unauthorized"),
            status_code=302,
        )

    try:
        token_payload = exchange_code_for_tokens(code)
    except (WorkforceOAuthError, WorkforceOAuthMisconfigured) as e:
        logger.warning("Workforce OAuth code exchange failed: %s", e)
        return RedirectResponse(
            _post_oauth_redirect_url("workforce=error&reason=token_exchange_failed"),
            status_code=302,
        )

    # Upsert the singleton integration row. We deliberately replace
    # rather than mutate so service-item state from a prior connection
    # to a different realm doesn't bleed in.
    integration = db.query(WorkforceIntegration).first()
    realm_changed = False
    if integration is None:
        integration = WorkforceIntegration(
            realm_id=realmId,
            refresh_token_ciphertext="",  # filled in below
            connected_by_user_id=admin.id,
        )
        db.add(integration)
        db.flush()  # assign id before persist_tokens commits
    else:
        # Reconnect path — refresh the connection metadata. Track
        # whether the realm changed so we can drop the cached client
        # rows (and the company name) below; otherwise a reconnect to
        # a different QB company would leave the old realm's customers
        # in the picker until the next refresh.
        realm_changed = integration.realm_id != realmId
        integration.realm_id = realmId
        integration.connected_by_user_id = admin.id
        integration.connected_at = datetime.utcnow()
        # Force re-resolution of the service item against the new realm.
        integration.service_item_id = None
        integration.service_item_name = None
        if realm_changed:
            # Stale across realms — wipe so the Integrations card doesn't
            # display the previous company's name while the new refresh
            # is in flight.
            integration.company_name = None
        # Clear stale sync observability from any prior connection.
        integration.last_sync_at = None
        integration.last_sync_status = None
        integration.last_sync_error = None
        integration.last_synced_count = 0
        integration.last_failed_count = 0

    try:
        persist_tokens(db, integration, token_payload)
    except WorkforceCryptoNotConfigured as e:
        logger.error("Workforce OAuth succeeded but tokens could not be encrypted: %s", e)
        # Roll back the partial row — leaving an integration with empty
        # ciphertext would put the app in an unrecoverable state.
        db.rollback()
        return RedirectResponse(
            _post_oauth_redirect_url("workforce=error&reason=crypto_not_configured"),
            status_code=302,
        )

    # Reconnect to a different QB realm — drop the cached customers
    # from the previous realm. Otherwise the picker would surface stale
    # rows until the next refresh, and project-link mutations could
    # write IDs that don't exist in the new realm.
    if realm_changed:
        try:
            clear_workforce_clients(db)
        except Exception as e:
            logger.warning("Workforce cross-realm cache clear failed: %s", e)

    # Eager-seed the cached client list. Runs BEFORE the service-item
    # check so a fresh QB realm without an "Hours" Service Item still
    # leaves the connect flow with a populated picker — the two
    # operations are independent. Best-effort: a refresh failure is
    # logged and swallowed (the Saturday cron and the manual Refresh
    # button will retry), but a refresh failure must not stop the
    # admin from completing the OAuth handshake.
    refresh_quietly(db, integration)

    # Fetch the friendly QB Company name so the Integrations card can
    # show "Company: Acme Co" instead of the opaque realm id. Best-
    # effort: a failure here is logged and ignored — the realm id is
    # still in the DB as a fallback display.
    try:
        company_name = fetch_company_info(db, integration)
        if company_name:
            integration.company_name = company_name
            db.commit()
    except Exception as e:
        logger.warning("Workforce connected but company name lookup failed: %s", e)

    # Best-effort resolve of the "Hours" service item against the new
    # realm. If it's missing (HR usually creates it; sometimes a fresh
    # QB account doesn't have it yet), we still mark the integration as
    # connected and let the admin fix it in QB — the sync worker
    # re-resolves lazily and surfaces a clear error if it's still gone.
    try:
        item = resolve_service_item(db, integration)
        if item:
            integration.service_item_id = item["id"]
            integration.service_item_name = item["name"]
            db.commit()
        else:
            logger.warning(
                "Workforce connected but 'Hours' service item not found in realm %s",
                realmId,
            )
            return RedirectResponse(
                _post_oauth_redirect_url("workforce=connected&warn=service_item_missing"),
                status_code=302,
            )
    except QBApiError as e:
        logger.warning("Workforce connected but service item resolution failed: %s", e)
        return RedirectResponse(
            _post_oauth_redirect_url("workforce=connected&warn=service_item_lookup_failed"),
            status_code=302,
        )

    logger.info(
        "Workforce integration connected by user_id=%s realm_id=%s service_item_id=%s",
        admin.id,
        realmId,
        integration.service_item_id,
    )
    return RedirectResponse(
        _post_oauth_redirect_url("workforce=connected"),
        status_code=302,
    )


@router.post(
    "/disconnect",
    dependencies=[Depends(require_capability("admin.workforce_connect"))],
)
def disconnect(db: Session = Depends(get_db)):
    """Revoke tokens at Intuit and delete the integration row.

    Best-effort revoke: if the network call to Intuit fails the local
    row is still deleted. The refresh token will age out at Intuit
    within ~100 days regardless. Project-level `workforce_client_id`
    tags are LEFT IN PLACE so a later reconnect restores the per-
    project mapping without manual re-tagging.
    """
    integration = db.query(WorkforceIntegration).first()
    if not integration:
        # Idempotent — nothing to do.
        return {"disconnected": True}

    # Try to revoke before deletion so even if the row delete fails the
    # token is invalidated upstream. Failures here don't propagate.
    try:
        plaintext = decrypt(integration.refresh_token_ciphertext)
        revoke_token(plaintext)
    except Exception as e:
        # Decryption can fail if the encryption key was rotated; revoke
        # itself swallows network errors. Either way we proceed to
        # delete the local row.
        logger.warning("Workforce token revoke failed (continuing with local delete): %s", e)

    # Order matters: drop the integration row FIRST so that even if the
    # subsequent cache clear blows up (FK race, DB error mid-commit) the
    # admin's view of the world is consistent — "not connected" with
    # possibly stale cached clients is fine (next Connect refreshes
    # them anyway), while "still connected with no cached clients" is
    # not (the picker would silently empty). Project-level
    # `workforce_client_id` tags ARE preserved (per Phase 2 design) so
    # a same-realm reconnect restores the per-project mapping without
    # manual re-tagging.
    db.delete(integration)
    db.commit()

    try:
        clear_workforce_clients(db)
    except Exception as e:
        # The integration is gone — the picker is hidden until reconnect
        # and the OAuth callback clears the cache when the new realm
        # differs from the old one. So a failure to clear here is
        # cosmetic, not load-bearing.
        logger.warning("Workforce client cache clear after disconnect failed: %s", e)

    return {"disconnected": True}


# ── Customer picker + per-project link ───────────────────────────────────


class WorkforceClient(BaseModel):
    id: str
    name: str


class ProjectLinkRequest(BaseModel):
    # Either both fields populated (link) or both null (unlink). The
    # name is required on link so we can cache it for the UI without a
    # round-trip to QB.
    workforce_client_id: str | None = None
    workforce_client_name: str | None = None


@router.get(
    "/clients",
    response_model=list[WorkforceClient],
    dependencies=[Depends(require_capability("admin.workforce_connect"))],
)
def list_clients(db: Session = Depends(get_db)) -> list[WorkforceClient]:
    """Return the cached QB Customer list for the project-link picker.

    Reads from the local `workforce_clients` table (populated by the
    Saturday cron, the OAuth callback, and the manual Refresh button).
    No Intuit round-trip — opening the picker is free.

    503 if the integration isn't connected — distinguishes "we have no
    cache because we haven't connected" from "QB has zero customers".
    """
    integration = db.query(WorkforceIntegration).first()
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QuickBooks integration is not connected.",
        )
    # Pass realm_id explicitly so a cross-realm cache-clear failure
    # (best-effort try/except in disconnect / reconnect paths) can never
    # leak the previous realm's customers into the picker.
    return [WorkforceClient(**c) for c in list_active_clients(db, realm_id=integration.realm_id)]


class WorkforceClientsRefreshResult(BaseModel):
    added: int
    updated: int
    deactivated: int
    total_active: int
    last_refreshed_at: str | None = None


@router.post(
    "/clients/refresh",
    response_model=WorkforceClientsRefreshResult,
    dependencies=[Depends(require_capability("admin.workforce_connect"))],
)
def refresh_clients_endpoint(db: Session = Depends(get_db)) -> WorkforceClientsRefreshResult:
    """Pull the full QB Customer list and reconcile the local cache.

    Returns the deltas (added / updated / deactivated) so the admin can
    see what changed at a glance. The cache is the source of truth for
    the picker, so the picker won't reflect any QB-side changes until
    this endpoint (or the Saturday cron) runs.
    """
    integration = db.query(WorkforceIntegration).first()
    if not integration:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="QuickBooks integration is not connected.",
        )
    try:
        counts = refresh_workforce_clients(db, integration)
    except QBApiError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"QuickBooks customer list refresh failed: {e}",
        ) from e
    except WorkforceOAuthError as e:
        # Refresh token rejected by Intuit (rotated past TTL, revoked at
        # the QB side, or admin's app was disconnected from the QB UI).
        # The admin needs to reconnect — surface 401 so the UI can
        # prompt for that explicitly instead of showing "502 bad gateway".
        logger.warning("Workforce client refresh hit OAuth error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"QuickBooks reconnection required: {e}",
        ) from e
    except (WorkforceCryptoCorrupted, WorkforceCryptoNotConfigured) as e:
        # Either the encryption key was rotated without re-encrypting
        # tokens, or the at-rest ciphertext is corrupted, or the env var
        # is missing entirely. Same recovery path either way: ops needs
        # to fix the key config (or have the admin reconnect).
        logger.error("Workforce client refresh hit crypto error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"QuickBooks integration is misconfigured: {e}",
        ) from e

    # Opportunistically refresh the cached company name too — admins
    # occasionally rename their QB company and we don't want the
    # Integrations card to stay stale. Best-effort; failure is logged
    # and ignored.
    try:
        company_name = fetch_company_info(db, integration)
        if company_name and company_name != integration.company_name:
            integration.company_name = company_name
            db.commit()
    except QBApiError as e:
        logger.warning("Workforce company name refresh failed: %s", e)

    last_at = last_refresh_time(db, realm_id=integration.realm_id)
    return WorkforceClientsRefreshResult(
        **counts,
        last_refreshed_at=(last_at.isoformat() + "Z") if last_at else None,
    )


# Per-project link endpoint. Sits on /api/admin/workforce/ instead of
# /api/projects/ because it's an admin tool: managed in the admin UI,
# gated by an admin capability, and the integration is org-wide. The
# capability is `admin.projects_write` per the design — same one that
# governs other per-project admin edits like GitHub token.
@router.put(
    "/projects/{project_id}/client",
    dependencies=[Depends(require_capability("admin.projects_write"))],
)
def link_project_to_client(
    project_id: int,
    body: ProjectLinkRequest,
    db: Session = Depends(get_db),
):
    """Link or unlink a project to a QB Customer.

    Pass `{workforce_client_id: "12", workforce_client_name: "Acme"}`
    to link, or `{workforce_client_id: null, workforce_client_name:
    null}` to unlink. We cache the display name on the project row so
    the project card can render the link without a QB API roundtrip on
    every page load.

    Tagging a project does NOT retroactively sync its existing time
    entries — only entries logged from this point forward are eligible.
    This is intentional: bulk-backfilling old entries to a newly-tagged
    client is rarely what an admin actually wants and risks duplicating
    hours that were already invoiced via another path.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Pair semantics: id and name must match (both set, or both null).
    id_set = bool(body.workforce_client_id)
    name_set = bool(body.workforce_client_name)
    if id_set != name_set:
        raise HTTPException(
            status_code=400,
            detail="workforce_client_id and workforce_client_name must be provided together.",
        )

    project.workforce_client_id = body.workforce_client_id
    project.workforce_client_name = body.workforce_client_name
    db.commit()
    return {
        "project_id": project.id,
        "workforce_client_id": project.workforce_client_id,
        "workforce_client_name": project.workforce_client_name,
    }


# ── Manual sync trigger ──────────────────────────────────────────────────


def _run_manual_sync_and_email(
    *,
    triggered_by_email: str | None,
    triggered_by_label: str,
) -> None:
    """Run the sync against a FRESH SessionLocal and email the clicker.

    Runs inside FastAPI's BackgroundTasks executor after the response
    has been sent to the browser. Opens its own DB session so the
    request's session can close normally on response — long-running
    work must not piggy-back on the request session because FastAPI
    closes it via the `get_db` dependency teardown.

    Email semantics: we only notify when there's a real result to
    report. ``status="locked"`` means another sync was already running
    when this background task started (rare race past the endpoint's
    preflight peek, e.g. the Saturday cron starting between the click
    and the task's lock acquire) — that's not a result the user needs
    to hear about, so we suppress the email for that one status.
    """
    from database import SessionLocal  # local import to avoid cycle at module load

    db = SessionLocal()
    try:
        result = run_workforce_sync(db, triggered_by="manual")
    finally:
        db.close()

    if result.get("status") == "locked":
        logger.info(
            "[workforce_sync] manual run lost the lock race; skipping email. result=%s",
            result,
        )
        return

    # Best-effort notification — a misconfigured mailer must not turn
    # a successful sync into an error the admin can't see (they already
    # got the "started" toast and the API has 200ed).
    if triggered_by_email:
        try:
            send_sync_notification(
                [triggered_by_email],
                result,
                triggered_by_label=triggered_by_label,
                triggered_by_email=triggered_by_email,
            )
        except Exception as e:
            logger.warning("Manual sync email notification failed: %s", e)
    logger.info("[workforce_sync] manual run finished: %s", result)


class ManualSyncResponse(BaseModel):
    """Returned immediately from POST /sync.

    The actual sync work happens in a FastAPI BackgroundTask after the
    response is sent; the admin gets a result email when it finishes.
    No counts here on purpose — they wouldn't be known yet, and a busy
    week's worth of entries can take long enough that holding the
    request open is bad UX.

    Two states:
      - ``started``         → the background task has been scheduled;
                              an email will follow when it finishes.
      - ``already_running`` → another sync is currently in progress
                              (Saturday cron, or a prior click of the
                              admin's that's still working). No new
                              task scheduled, no email — the
                              already-running sync will email its own
                              trigger when it completes.
    """

    status: str  # "started" | "already_running"
    message: str
    notify_email: str | None = None


@router.post("/sync", response_model=ManualSyncResponse)
def manual_sync(
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_capability("admin.workforce_connect")),
    db: Session = Depends(get_db),
):
    """Kick off a manual sync in the background; return immediately.

    The sync runs as a FastAPI BackgroundTask in the same worker process
    after the response is sent. The clicker receives an email with the
    result (Healthy / Partial / Error + per-status counts) using the
    same template as the Saturday cron, so the two emails read as a
    coherent series.

    Why background rather than inline: a busy week can have hundreds of
    eligible entries; pushing each one to QuickBooks plus the per-entry
    commit can take minutes. Holding the HTTP request open that long is
    poor UX (browser spinner, ALB/proxy timeouts, no progress signal)
    and the result is far more useful in an inbox than a transient
    toast that disappears in 6 seconds.

    Duplicate-click handling: if a sync is already in progress when the
    admin clicks (their own earlier click is still running, or the
    Saturday cron is mid-run), the endpoint peeks at the advisory lock
    via ``is_sync_in_progress`` and returns ``status="already_running"``
    WITHOUT scheduling a second background task or sending an email.
    The running sync will email its own trigger when it finishes; the
    re-clicker just gets a UI toast.

    The peek is best-effort — there's a sub-second race window where
    a different process could grab the lock between the peek and the
    background task starting. The background task's own lock-acquire
    attempt is the authoritative gate, and the "locked" result there
    suppresses the email for that one status (see
    `_run_manual_sync_and_email`).
    """
    if is_sync_in_progress(db):
        return ManualSyncResponse(
            status="already_running",
            message="A sync is already running. You'll get an email when it finishes.",
            notify_email=current_user.email,
        )

    label = current_user.name or current_user.email or f"user_id={current_user.id}"
    background_tasks.add_task(
        _run_manual_sync_and_email,
        triggered_by_email=current_user.email,
        triggered_by_label=label,
    )
    return ManualSyncResponse(
        status="started",
        message="Sync started. You'll get an email when it finishes.",
        notify_email=current_user.email,
    )
