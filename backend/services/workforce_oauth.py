"""Intuit (QuickBooks) OAuth 2.0 client for the Workforce integration.

This module is the single boundary between Arsenal and Intuit's OAuth
service. Three responsibilities:

1. **Build the authorize URL** that an admin clicks to grant access.
2. **Exchange the auth code** for refresh + access tokens after the
   browser redirects back to our callback.
3. **Refresh the access token** on demand (Intuit access tokens expire
   in ~1h; refresh tokens last ~100 days and roll on each refresh).

Token persistence (read/write the ciphertext columns on
`WorkforceIntegration`) is handled in `ensure_fresh_access_token` so
callers in routers / sync workers just get a usable plaintext access
token without thinking about the crypto or the refresh dance.

Endpoints used (Intuit OAuth 2.0):
- authorize: https://appcenter.intuit.com/connect/oauth2
- token (issue + refresh): https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
- revoke: https://developer.api.intuit.com/v2/oauth2/tokens/revoke

These are stable Intuit URLs; we don't host shim layers. The base URLs
can be overridden via env vars (`INTUIT_OAUTH_BASE_URL`) for tests or if
Intuit ever issues a parallel host.

Environment variables this module reads:
    INTUIT_CLIENT_ID         (required for connect/refresh)
    INTUIT_CLIENT_SECRET     (required for connect/refresh)
    INTUIT_REDIRECT_URI      (required — must match the URI registered in the Intuit app)
    INTUIT_OAUTH_BASE_URL    (optional override; default https://appcenter.intuit.com)
    INTUIT_TOKEN_URL         (optional override; default https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer)
    INTUIT_REVOKE_URL        (optional override; default https://developer.api.intuit.com/v2/oauth2/tokens/revoke)
"""

import base64
import os
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from models.workforce_integration import WorkforceIntegration
from services.workforce_crypto import decrypt, encrypt

# ── Configuration ────────────────────────────────────────────────────────

# Scope required to write TimeActivity records. `accounting` is the
# umbrella scope; the more granular `payroll` scope is for Intuit's
# legacy QuickBooks Payroll API which Arsenal isn't using.
SCOPE = "com.intuit.quickbooks.accounting"

# Refresh access tokens this many seconds *before* their stated expiry,
# to absorb clock skew between Arsenal and Intuit. Intuit issues 1h
# tokens, so a 60s skew window is generous.
ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS = 60


def _env(name: str, default: str | None = None) -> str:
    v = os.getenv(name, default)
    if not v:
        raise WorkforceOAuthMisconfigured(
            f"{name} is not set. Configure it in the backend environment "
            "before connecting the QuickBooks integration."
        )
    return v


def _env_or_default(name: str, default: str) -> str:
    """Read an env var, treating empty strings as unset.

    docker-compose forwards `KEY=${KEY}` lines as empty strings when the
    underlying env is missing, so plain `os.getenv(name, default)`
    returns "" instead of falling back to the default. Centralizing the
    check here keeps every optional-override env var consistent.
    """
    raw = os.getenv(name)
    return raw if raw else default


def _oauth_base_url() -> str:
    return _env_or_default("INTUIT_OAUTH_BASE_URL", "https://appcenter.intuit.com").rstrip("/")


def _token_url() -> str:
    return _env_or_default(
        "INTUIT_TOKEN_URL",
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    )


def _revoke_url() -> str:
    return _env_or_default(
        "INTUIT_REVOKE_URL",
        "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    )


# ── Errors ───────────────────────────────────────────────────────────────


class WorkforceOAuthMisconfigured(RuntimeError):
    """Raised when a required env var is missing. Surface to the admin as
    "configure these env vars then redeploy" rather than a stack trace.
    """


class WorkforceOAuthError(RuntimeError):
    """Intuit returned a non-2xx response during a token exchange or refresh.
    Carries the upstream status + body excerpt so the admin can see why.
    """

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


# ── Public API ───────────────────────────────────────────────────────────


def build_authorize_url(state: str) -> str:
    """Return the Intuit authorize URL the admin's browser should visit.

    The `state` parameter is echoed back to our callback and we verify
    it there to prevent CSRF. Caller is responsible for generating a
    signed, short-TTL state token bound to the requesting admin's user
    id — see `routers/workforce.py::_issue_state_token`.
    """
    client_id = _env("INTUIT_CLIENT_ID")
    redirect_uri = _env("INTUIT_REDIRECT_URI")

    # Order is fixed so the same call always produces the same URL —
    # easier to inspect logs / repro issues. Intuit accepts any order.
    params = [
        ("client_id", client_id),
        ("response_type", "code"),
        ("scope", SCOPE),
        ("redirect_uri", redirect_uri),
        ("state", state),
    ]
    return f"{_oauth_base_url()}/connect/oauth2?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    """POST the auth code to Intuit's token endpoint, get back tokens.

    Returns a dict with `access_token`, `refresh_token`, `expires_in`
    (access token TTL seconds), and `x_refresh_token_expires_in`
    (refresh token TTL seconds, currently ~100 days).
    """
    return _post_token_request(
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": _env("INTUIT_REDIRECT_URI"),
        }
    )


def refresh_access_token(refresh_token_plaintext: str) -> dict[str, Any]:
    """Trade a refresh token for a fresh access token.

    Intuit ROTATES refresh tokens: the response includes a new
    `refresh_token` value which the caller must persist. The old
    refresh token is invalidated server-side after a brief grace period.
    """
    return _post_token_request(
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token_plaintext,
        }
    )


def revoke_token(token_plaintext: str) -> None:
    """Best-effort revoke of a refresh (or access) token at Intuit.

    Called on Disconnect so a leaked DB snapshot can't be used to act
    on the customer's QB account. Failures here are logged but NOT
    surfaced as errors — the local row deletion still proceeds. The
    worst case if revoke fails is that Intuit's record of the
    connection lingers until the refresh token's natural 100-day expiry.
    """
    client_id = _env("INTUIT_CLIENT_ID")
    client_secret = _env("INTUIT_CLIENT_SECRET")
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode("ascii")

    try:
        with httpx.Client(timeout=10.0) as client:
            client.post(
                _revoke_url(),
                json={"token": token_plaintext},
                headers={
                    "Authorization": f"Basic {auth}",
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )
        # Intuit returns 200 with empty body on success, 400 if already
        # revoked. Either way the local cleanup proceeds.
    except httpx.HTTPError:
        # Don't propagate — disconnect must always succeed locally.
        pass


def ensure_fresh_access_token(db: Session, integration: WorkforceIntegration) -> str:
    """Return a usable plaintext access token for `integration`.

    If the cached token is still valid, decrypts and returns it. If it's
    expired (or close to expiry), refreshes it using the stored refresh
    token, persists the rotated tokens, and returns the new access
    token. The caller never sees the refresh token.

    Raises `WorkforceOAuthError` if Intuit rejects the refresh, e.g.
    because the refresh token has been revoked or has aged out — the
    admin must reconnect in that case.
    """
    now = datetime.utcnow()
    expires_at = integration.access_token_expires_at
    if (
        integration.access_token_ciphertext
        and expires_at
        and expires_at - now > timedelta(seconds=ACCESS_TOKEN_REFRESH_LEEWAY_SECONDS)
    ):
        return decrypt(integration.access_token_ciphertext)

    # Need a refresh.
    refresh_token = decrypt(integration.refresh_token_ciphertext)
    fresh = refresh_access_token(refresh_token)
    persist_tokens(db, integration, fresh)
    return fresh["access_token"]


def persist_tokens(
    db: Session,
    integration: WorkforceIntegration,
    token_payload: dict[str, Any],
) -> None:
    """Write encrypted access + refresh tokens back to the integration row.

    Used by both the initial connect (after `exchange_code_for_tokens`)
    and subsequent refreshes (after `refresh_access_token`). The token
    payload shape is the same in both cases.

    Commits the session so the new tokens are durable before the caller
    returns — important on the connect path so a crash between OAuth
    success and DB commit doesn't lose the refresh token (which can't
    be re-obtained without the user re-authorizing).
    """
    integration.access_token_ciphertext = encrypt(token_payload["access_token"])
    integration.refresh_token_ciphertext = encrypt(token_payload["refresh_token"])
    integration.access_token_expires_at = datetime.utcnow() + timedelta(
        seconds=int(token_payload.get("expires_in", 3600))
    )
    db.commit()


# ── Internals ────────────────────────────────────────────────────────────


def _post_token_request(form: dict[str, str]) -> dict[str, Any]:
    """POST to Intuit's token endpoint with Basic auth + form body.

    Used by both the initial code exchange and refreshes — the only
    difference between them is the form payload, so the HTTP plumbing
    is shared here.
    """
    client_id = _env("INTUIT_CLIENT_ID")
    client_secret = _env("INTUIT_CLIENT_SECRET")
    auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode("ascii")

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                _token_url(),
                data=form,
                headers={
                    "Authorization": f"Basic {auth}",
                    "Accept": "application/json",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
    except httpx.HTTPError as e:
        raise WorkforceOAuthError(f"Could not reach Intuit token endpoint: {e}") from e

    if resp.status_code >= 400:
        # Body excerpt only — Intuit can return verbose HTML on some
        # error paths, so cap the length we propagate.
        raise WorkforceOAuthError(
            f"Intuit token request failed: {resp.text[:400]}",
            status_code=resp.status_code,
        )

    return resp.json()
