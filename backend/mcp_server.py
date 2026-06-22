"""MCP server for Arsenal Ops.

Mounts the Ops backend as an MCP (Model Context Protocol) server at ``/mcp`` so
Claude / AI agents can read Ops data through a standard, authenticated protocol.

Design (see .plans/enable-mcp-server-20260622-0945.md):

- **Transport:** stateless streamable HTTP (`stateless_http=True, json_response=True`)
  so there is no long-lived SSE connection held open against the single Render
  worker.
- **Auth:** the same HS256 JWT the REST API issues. `JWTVerifier` makes ``/mcp``
  an OAuth2.1 resource server that rejects un-tokened calls with 401. This is
  NOT token passthrough — we are the resource server, we issued the token, we
  validate it locally and never forward it upstream.
- **RBAC bridge:** inside each tool we read the validated token's claims, load
  the `User` via the shared `load_user_from_claims`, and enforce the existing
  capabilities via `assert_capability` — so an agent never exceeds its user's
  UI permissions.
- **DB sessions:** tools run outside FastAPI's `Depends(get_db)` lifecycle, so
  every tool opens its own `with SessionLocal() as db:` block to avoid leaking
  connections from the (5 + 10 overflow) pool.

This module only wires the server and the `whoami` proof-of-pipeline tool. Data
read tools land in a follow-up PR.
"""

from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.auth.providers.jwt import JWTVerifier
from fastmcp.server.dependencies import get_access_token

from database import SessionLocal
from routers.auth import ALGORITHM, SECRET_KEY, load_user_from_claims

# Validate the same HS256 JWT the REST API issues. `SECRET_KEY` is required from
# the environment (routers.auth fails import if it is unset/default), so by the
# time this runs we have a real signing secret to verify against.
_jwt_verifier = JWTVerifier(public_key=SECRET_KEY, algorithm=ALGORITHM)

mcp: FastMCP = FastMCP("Arsenal Ops", auth=_jwt_verifier)


@mcp.tool
def whoami() -> dict:
    """Return the authenticated caller's id, email, and effective capabilities.

    Proves the auth -> RBAC -> identity pipeline end to end: the Bearer JWT is
    validated by JWTVerifier, its claims are rehydrated into a User, and we
    return what the REST API would consider "the current user".
    """
    access_token = get_access_token()
    claims = access_token.claims if access_token else {}
    with SessionLocal() as db:
        user = load_user_from_claims(db, claims)
        if user is None:
            raise ToolError("Token is valid but does not map to a known user")
        return {
            "id": user.id,
            "email": user.email,
            "capabilities": user.effective_capability_keys(),
        }


# Stateless streamable-HTTP ASGI app, mounted at /mcp by main.py. `path="/"`
# means the endpoint is the mount root (i.e. /mcp/). main.py must adopt
# `mcp_app.lifespan` so the session manager is initialized on startup.
mcp_app = mcp.http_app(path="/", stateless_http=True, json_response=True)
