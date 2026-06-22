# Enable MCP for Arsenal Ops — Ops as an MCP Server

**Status:** PR 1 implemented (auth helpers + SECRET_KEY-from-env + /mcp mount + whoami + tests; ruff/mypy/pytest green, 429 passed). PR 2 (read tools) next.

**Implementation deltas (found while grounding against code):**
- `SECRET_KEY` was *fully hardcoded* (`auth.py`), never env-read, and **not set in `render.yaml`** — so prod runs on the public default today. Requiring it from env is therefore an unavoidable JWT-key rotation: deploying PR 1 logs out every active session once. Coordinate a window.
- `fastmcp>=2.11` currently resolves to **v3.4.2** (a major bump past the 2.x the plan assumed). All APIs used (`JWTVerifier(public_key=, algorithm="HS256")`, `http_app(path=, stateless_http=, json_response=)`, `get_access_token`) exist in v3.4.2 and are validated. `pip check` clean. Consider pinning `fastmcp==3.4.2` for reproducible builds.
- MCP tools call `database.SessionLocal()` directly (outside `Depends(get_db)`), so tests monkeypatch `mcp_server.SessionLocal`; the conftest get_db override does not reach tools.
- `main.py` used the deprecated `@app.on_event("startup")`; converted to a `lifespan` CM that runs the former startup body then enters `mcp_app.lifespan`.


**Created:** 2026-06-22
**Tier:** Standard (single team, single service, new dependency, auth refactor, later writes)
**Branch convention:** off fresh `main` (e.g. `laukik-enableMcp`)

---

## Summary / TL;DR

Mount an **MCP server into the existing FastAPI app at `/mcp`** using **standalone `fastmcp` 2.x**, served over **streamable HTTP (stateless mode)**. Auth reuses the **existing HS256 JWT** via `fastmcp`'s `JWTVerifier` (same `SECRET_KEY`), so `/mcp` is an OAuth2.1 resource server that 401s un-tokened calls. Inside each tool we read the validated token's `claims["sub"]`, rehydrate the `User` with capabilities, enforce **existing RBAC** (`require_capability`), then call **existing service/router logic**. Everything is a **tool** (incl. reads) — not resources — because Claude Desktop/Code don't auto-read resources. Rollout is read-first (Projects → Work items → Pulse/Developers), then write tools behind `*_write` caps with `activity_log` audit hooks.

**Changed from original framing:**
1. "Reuse the service layer" in practice means **importing the existing router/service helpers directly** — `format_project`, `get_work_item_stats_batch`, `require_project_access` are already plain functions (not `Depends`-bound), so MCP tools call them as-is. No upfront extraction PRs. (Extract later *only if* a circular import forces it.)
2. A **prerequisite security fix** — hardcoded `SECRET_KEY` default at `routers/auth.py:45` — must land before `/mcp` goes live.

**Simplicity guardrails (added per review):** no separate refactor PRs except the one genuinely-required auth split; tools return plain dicts; pagination is a simple `limit`/`offset` (skip cursor machinery and `response_format` until a real token-budget problem shows up).

---

## Goals
- `/mcp` endpoint mounted in the existing FastAPI app, reachable by Claude Code / MCP Inspector / Claude API connector.
- Every MCP call authenticates with the existing JWT and is gated by existing RBAC — an agent never exceeds its user's UI permissions.
- Read tools for Projects, Work items, Pulse, Developers/capacity.
- Write tools (later) behind `*_write` caps, every write audited via `activity_log`.
- No duplicate query logic between REST and MCP.

## Non-goals
- Ops consuming external MCP servers (client direction).
- Full OAuth 2.1 AS flow / dynamic client registration for v1 (Bearer-JWT only; OAuth metadata only if Claude Desktop needed).
- Replacing/deprecating the REST API.
- MCP resources or prompts (tools only for now).

---

## Recommended approach

### SDK — `fastmcp` 2.x (PrefectHQ/jlowin), not the official SDK's bundled FastMCP
Only option where mount-into-FastAPI + HS256 Bearer + token-in-tool are all first-class one-liners. Official SDK's FastMCP needs manual session-manager lifespan wiring + has a documented mounting sharp-edge (python-sdk #1367). Dependency check is **clean** — FastAPI ≥0.109, Pydantic ≥2.5, uvicorn ≥0.27, httpx, Py3.11 all satisfy `fastmcp` 2.x.

### Mount topology
```python
from fastmcp import FastMCP
mcp = FastMCP("Arsenal Ops", auth=jwt_verifier)
mcp_app = mcp.http_app(path="/")          # streamable-HTTP ASGI app
app = FastAPI(lifespan=mcp_app.lifespan)  # CRITICAL: adopt MCP's lifespan
app.mount("/mcp", mcp_app)
```
Compose `mcp_app.lifespan` with the existing `@app.on_event("startup")` DB-init hook. Use **stateless mode** (`stateless_http=True, json_response=True`) — sidesteps SSE-over-single-Render-worker timeout risk and matches the 2026-07-28 RC direction (drops session handshake).

### Auth bridge (crux)
```python
JWTVerifier(public_key=SECRET_KEY, algorithm="HS256")   # symmetric, same secret app issues with
```
```python
from fastmcp.server.dependencies import get_access_token

@mcp.tool
def list_my_workitems(...) -> dict:
    claims = get_access_token().claims
    with SessionLocal() as db:
        user = load_user_from_claims(db, claims)              # extracted from get_current_user
        assert_capability(user, "project.tracker.sprints")    # extracted from require_capability
        return workitems_read.list_for(db, user, ...)         # shared read logic
```
Spec-conformant (NOT token-passthrough): we are the resource server, we issued the token, we validate locally and never forward upstream. GitHub's official remote MCP server uses the same static-Bearer pattern.

### Required refactor (small, improves testability regardless of MCP)
In `backend/routers/auth.py`:
- `get_current_user` → thin `Depends` wrapper over `load_user_from_claims(db, claims)`
- `require_capability` → thin `Depends` wrapper over `assert_capability(user, cap)`

### Reusing read logic (no extraction)
MCP tools import the existing helpers directly: `format_project`/`get_work_item_stats_batch`/`require_project_access` from `routers/projects.py`, work-item helpers from `routers/workitems.py`, and `services/capacity_service.py` (already reusable). Only refactor a helper into a shared module if a circular import actually appears — not preemptively.

### Tool design (keep it lean)
Namespaced names (`projects_list`, `workitems_search`), clear descriptions, Pydantic-typed inputs (auto `inputSchema`), return **plain dicts**, simple `limit`/`offset` on list tools, `readOnlyHint` on reads, `isError` for recoverable failures. Skip cursor pagination, `outputSchema`, and `response_format` modes until there's a concrete need.

---

## Alternatives considered

| Decision point | Chosen | Rejected | Why |
|---|---|---|---|
| SDK | `fastmcp` 2.x standalone | Official `mcp` SDK FastMCP | One-line FastAPI mount + lifespan; `JWTVerifier` HS256; `get_access_token()` — official needs manual session lifespan (#1367) |
| SDK | `fastmcp` 2.x | Raw `mcp.server.Server` | Would hand-roll dispatch/schemas/ASGI/header auth — no benefit |
| Transport | Stateless streamable HTTP | Stateful (session-ID) | Avoids SSE keepalive issues on single Render worker; matches 2026 spec direction |
| Primitive | Tools (incl. reads) | Resources for reads | Claude Desktop/Code don't auto-`resources/read`; tools are model-controlled + consistently supported |
| Auth | Validated Bearer JWT | Full OAuth 2.1 AS flow | Conformant for first-party; OAuth deferred unless Claude Desktop needed |
| Topology | Mount sub-app on FastAPI | Separate MCP service | Single Render service constraint; shares DB/env/config |

---

## Risks (severity-ranked)

| Sev | Risk | First appears | Mitigation |
|---|---|---|---|
| 🔴 High | Hardcoded `SECRET_KEY` default (`auth.py:45`) — exposing `/mcp` against a known default = trivial token forgery | Phase 0 | Fail startup if unset; set in Render env. Blocks `/mcp` go-live. |
| 🔴 High | New unauthenticated surface if auth bridge misconfigured | Phase 0/1 | `JWTVerifier` at mount; test asserting 401 without token before any read tool ships |
| 🟠 Med | DB session leaks — tools run outside `Depends(get_db)`; pool 5+10 | Phase 1 | Mandatory `with SessionLocal() as db:`; explicit pool-leak test |
| 🟠 Med | SSE held connections vs single Render worker / proxy timeout | Phase 1 | Stateless `json_response=True` (no long-lived SSE) |
| 🟠 Med | Write audit gap — agent writes with no trail | Phase 4 | Every write tool writes `activity_log`; test asserts row created |
| 🟡 Low | Prompt-injection / lethal-trifecta via tool results | Phase 1+ | RBAC scoping per tool; treat output as untrusted; human-in-loop for destructive writes |
| 🟡 Low | Lifespan composition bug (session mgr not initialized) | Phase 1 | `lifespan=mcp_app.lifespan` chained with startup; boot smoke test |

---

## Open questions (don't block starting; each blocks a specific later PR)
1. **`SECRET_KEY` rotation** — is prod already the default or overridden in Render? If default, rotating invalidates all live sessions (forces re-login). Blocks PR 2 cutover, not code.
2. **Target client** — Claude Code / API connector / custom agents (Bearer-friendly) vs. Claude Desktop (OAuth-only → adds PR 9). Blocks only PR 9.
3. **Write scope** — which write actions first (create work item? update status? log hours?). Blocks PR 8 chunking.
4. **Dependency conservatism** — OK to add third-party `fastmcp`? If not, official `mcp` SDK with heavier lifespan wiring. Blocks SDK pin in PR 3.

---

## Roadmap

| # | PR | Size | Relationship | Verify after merge |
|---|---|---|---|---|
| 1 | Foundation: reusable auth helpers (`load_user_from_claims`, `assert_capability` — no behavior change) + require `SECRET_KEY` from env + mount `/mcp` (stateless, `JWTVerifier(HS256)`, composed lifespan) + `whoami` tool | M | — | Auth suite green; app boots only with env secret; `/mcp` 401 w/o token, 200 + user with token; Inspector connects |
| 2 | All read tools: projects (list, get), work items (search, get), pulse, developers/capacity — import existing helpers directly | M | Stacks on #1 | Tools return data scoped to caller's RBAC/project access; match REST |
| 3 | [Deferred] Write tools behind `*_write` caps + `activity_log` | M | Depends on #2 | Respects write cap; audit row created; 403 w/o cap |

*Optional, only if Claude **Desktop** support is needed: OAuth 2.1 resource-server metadata (depends on #1). Not in the main line.*

---

## Per-PR detail

### PR 1 — Foundation: auth helpers + `SECRET_KEY` + MCP skeleton + `whoami`
**Purpose:** Land the prerequisites and prove the full pipeline in one go — auth/RBAC callable outside FastAPI, no default secret, `/mcp` mounted with Bearer-JWT validation, one tool returning the authenticated user.
**Tasks:**
- Add `load_user_from_claims(db, claims) -> User | None` (JWT-decode + `selectinload(roles→capabilities)` body of `get_current_user`) and `assert_capability(user, cap) -> None` (body of `require_capability`'s `_check`); rewire the existing deps as thin wrappers — no behavior change.
- Require `SECRET_KEY` from env; fail startup on unset/legacy-default. Document in `.env.example` / README; set in Render (ops step).
- Add `fastmcp` (≥2.11) to `requirements.txt`. New `backend/mcp_server.py`: `FastMCP("Arsenal Ops", auth=JWTVerifier(public_key=SECRET_KEY, algorithm="HS256"))`, stateless `http_app(path="/")`.
- In `main.py`: compose `mcp_app.lifespan` with existing startup; `app.mount("/mcp", mcp_app)`.
- `whoami` tool: `get_access_token().claims` → `load_user_from_claims` → `{id, email, capabilities}`.
- Tests: helper unit tests; boot with/without secret; `/mcp` 401 w/o token, 200 + identity with token; lifespan boot smoke test.
**Merge criterion:** `ruff` + `mypy` + full suite green; no route response changes; app boots only with env secret; MCP Inspector (or `claude mcp add --transport http ... --header "Authorization: Bearer <token>"`) connects and calls `whoami`.
**Verify after merge:** Log in via web app (gated route 200/403); connect a client to deployed `/mcp`, call `whoami`, confirm correct user + caps. **Coordinate:** rotating a currently-default prod secret forces re-login — see open question #1.
**PR description draft:**
> **Title:** Mount MCP server at /mcp with JWT auth (foundation)
> **Body:** Foundation for Ops-as-MCP-server. (1) Splits `get_current_user`/`require_capability` into reusable `load_user_from_claims`/`assert_capability` (no behavior change). (2) Requires `SECRET_KEY` from env — removes the hardcoded default before exposing an authenticated surface. (3) Adds `fastmcp` and mounts a stateless streamable-HTTP MCP server at `/mcp`, reusing the HS256 JWT via `JWTVerifier` so the endpoint rejects un-tokened calls. A read-only `whoami` tool proves the auth→RBAC→identity pipeline end-to-end. No data tools yet. Ops: set `SECRET_KEY` in Render before deploying.
> **Test plan:** Helper unit tests; boot with/without secret; 401/200 `/mcp` integration tests; lifespan smoke test; manual Inspector + Claude Code connection.

### PR 2 — All read tools
**Purpose:** Real data reads across all four domains.
**Tasks:** `projects_list`, `project_get`, `workitems_search` (by project/status/assignee/sprint), `workitem_get`, plus pulse, developer-roster, and capacity tools — each importing the existing router/service helpers directly (`format_project`, `get_work_item_stats_batch`, `require_project_access`, `services/capacity_service.py`). RBAC via `assert_capability` + per-project access. Simple `limit`/`offset` on lists. Tests for scoping (user sees only accessible data) + RBAC 403 + REST parity.
**Merge criterion:** Tools return correctly-scoped data matching REST; tests green.
**PR description draft:**
> **Title:** Add MCP read tools (projects, work items, pulse, developers)
> **Body:** Exposes read-only MCP tools across projects, work items, pulse, and developers/capacity, reusing existing router/service read logic directly, scoped to the caller's RBAC and per-project access.
> **Test plan:** Scoping tests (accessible vs not), RBAC 403, REST parity, basic limit/offset.

### PR 3 — [Deferred] Write tools
**Purpose:** Let agents act on data, safely.
**Blocked on:** open question #3 (which writes first).
**Tasks:** Write tools behind `*_write` caps (e.g. `project.tracker_write`); every write appends to `activity_log`; tests assert cap enforcement + audit row.
**PR description draft:** _(to be written once write scope is chosen)_

### Optional — OAuth 2.1 resource-server metadata
Only if Claude **Desktop** (OAuth-only) support is required (open question #2). Protected Resource Metadata (RFC 9728), `WWW-Authenticate` on 401. Not in the main line.

---

## Sources (key)
- FastMCP HTTP deployment / mounting / lifespan: https://gofastmcp.com/deployment/http
- FastMCP token verification (JWTVerifier HS256, v2.11+): https://gofastmcp.com/servers/auth/token-verification
- FastMCP authorization (get_access_token, claims): https://gofastmcp.com/servers/authorization
- Official python-sdk mounting friction: https://github.com/modelcontextprotocol/python-sdk/issues/1367
- MCP transports (streamable HTTP, stateless): https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP authorization (resource server, no token passthrough): https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
- Anthropic — writing tools for agents (naming, pagination, token budget): https://www.anthropic.com/engineering/writing-tools-for-agents
- OWASP LLM01 prompt injection: https://genai.owasp.org/llmrisk/llm01-prompt-injection/
