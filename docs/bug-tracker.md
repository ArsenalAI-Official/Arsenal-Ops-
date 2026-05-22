# Arsenal-Ops Bug Tracker

Living document. Bugs are added as they are surfaced (by the audit, by tests pinning current behavior, or by Hypothesis falsification). Each entry lists:

- **Severity** — P0 (blocks production), P1 (production fragility), P2 (quality)
- **Status** — `open`, `pinned` (xfail/FIXME in test), `in progress`, `fixed`
- **Source** — where it was first surfaced
- **Pinned by** — test or marker that locks current behavior (so the fix flips the assertion)
- **Fix plan** — outline of remediation

When a bug is fixed: change status to `fixed`, link the fix commit, and flip the pinning `xfail` to a regular assertion (drop the marker).

**Last updated:** 2026-05-22 — Week 5 E2E foundation landed (Playwright + 2 passing journeys + 13 .fixme scaffolds). 325 unit tests + 2 E2E green.

---

## P0 — Blockers (must fix before production traffic)

### P0-1 — Hardcoded JWT signing secret
- **Status:** open
- **Source:** Audit (production-readiness review)
- **Location:** [backend/routers/auth.py:31](../backend/routers/auth.py#L31) — `SECRET_KEY = "your-secret-key-change-in-production"`
- **Impact:** Anyone with the source can forge valid JWTs.
- **Pinned by:** not yet — would require a startup-guard test that the secret env var is set
- **Fix plan:** Load from env, fail startup if unset or equals the default placeholder.

### P0-2 — Weak password hashing (unsalted SHA-256)
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/auth.py:101-109](../backend/routers/auth.py#L101-L109). Note: `create_admin.py` correctly uses bcrypt; the login path doesn't.
- **Impact:** Vulnerable to rainbow tables; no per-user salt.
- **Pinned by:** auth tests (`test_auth.py`) currently exercise the SHA-256 path; they will keep passing if migrated to bcrypt via `passlib.CryptContext` + on-login rehash.
- **Fix plan:** `passlib.CryptContext(schemes=["bcrypt"], deprecated=["sha256_crypt"])` with `needs_update` migration on successful login.

### P0-3 — Dev-login endpoint always registered
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/auth.py:535-589](../backend/routers/auth.py#L535-L589) — gated by `DEV_AUTH_BYPASS` env var at runtime; endpoint is always mounted.
- **Impact:** One config slip = instant admin login in production.
- **Pinned by:** `test_auth.py::TestDevLoginGating` confirms the env-gating works **when** `DEV_AUTH_BYPASS` is unset. Does NOT pin the success path (deliberately — that endpoint should disappear in the fix).
- **Fix plan:** Gate at router-inclusion time in `main.py` rather than per-request env check, or strip the endpoint entirely in prod builds.

### P0-4 — Unsafe file upload (directory traversal)
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/projects.py:1322,1387-1394](../backend/routers/projects.py#L1322) — `file.filename` used directly in filesystem path; no MIME validation, no size cap, no sanitization.
- **Impact:** Directory traversal trivially possible (`../../../etc/passwd`).
- **Pinned by:** not yet
- **Fix plan:** `pathlib.Path(filename).name` to strip path components; validate MIME via `python-magic`; enforce max size.

### P0-5 — JWT in `localStorage` (XSS-exposed)
- **Status:** open
- **Source:** Audit
- **Location:** [app/src/lib/api.ts:30](../app/src/lib/api.ts#L30), [app/src/contexts/AuthContext.tsx:87](../app/src/contexts/AuthContext.tsx#L87)
- **Impact:** Any injected JS can read the token. Also blocks adding a refresh-token flow cleanly.
- **Pinned by:** not yet
- **Fix plan:** Move to httpOnly cookies; backend sets `Set-Cookie: HttpOnly; Secure; SameSite=Lax`.

### P0-6 — Frontend Dockerfile runs `npm run dev` in production
- **Status:** open
- **Source:** Audit
- **Location:** [app/Dockerfile:13](../app/Dockerfile#L13)
- **Impact:** Vite dev server in production; no static build, no security headers, no minification.
- **Pinned by:** N/A (config, not runtime behavior)
- **Fix plan:** Multi-stage build: `npm run build` → serve `/dist` via Nginx; add CSP, HSTS, X-Frame-Options.

### P0-7 — Stack-trace leak via global 500 handler
- **Status:** open
- **Source:** Audit
- **Location:** [backend/main.py:123-127](../backend/main.py#L123-L127) — returns `str(exc)` to clients.
- **Impact:** Leaks SQL, file paths, internal exception messages.
- **Pinned by:** not yet
- **Fix plan:** Log full exception server-side; return opaque `{"detail": "Internal error"}` with a correlation ID.

### P0-8 — DB password hardcoded in docker-compose.yml
- **Status:** open
- **Source:** Audit
- **Location:** [docker-compose.yml:10](../docker-compose.yml#L10) — `POSTGRES_PASSWORD: arsenal_ops_secret`
- **Impact:** Even as a dev default it shouldn't be in source control.
- **Fix plan:** Replace with `${POSTGRES_PASSWORD:?}`; document in `.env.example`.

### P0-9 — No migration system (ad-hoc `migrate_*.py` scripts)
- **Status:** open
- **Source:** Audit
- **Location:** [backend/migrate_*.py](../backend/), called from [backend/main.py](../backend/main.py) startup
- **Impact:** Racy under multiple Gunicorn workers, no versioning, no rollback, no dialect awareness.
- **Pinned by:** `test_capacity.py` and friends exercise the post-migration schema; a future testcontainers Postgres suite (Week 7) will pin migration correctness.
- **Fix plan:** Adopt Alembic with `pg_advisory_lock` for concurrency. Baseline against current prod schema via `pg_dump --schema-only` → `alembic stamp head`. See plan.

---

## P1 — Production Fragility

### P1-1 — IDOR: cross-project comment reads
- **Status:** pinned
- **Source:** Audit (P1 #14) — confirmed by test
- **Location:** [backend/routers/comments.py:86-96](../backend/routers/comments.py#L86-L96)
- **Pinned by:** `backend/tests/test_comments.py::TestCommentsIDOR::test_user_cannot_read_comments_on_unaffiliated_project` (xfail; flip to assert 403/404 after fix)
- **Impact:** Any authenticated user can read comments on work items in projects they aren't assigned to.
- **Fix plan:** Load `work_item.project`, verify `has_project_access(project, current_user)` before returning comments.

### P1-2 — IDOR: cross-project comment writes
- **Status:** pinned
- **Source:** Audit (P1 #14) — confirmed by test
- **Location:** [backend/routers/comments.py](../backend/routers/comments.py) (POST handler)
- **Pinned by:** `backend/tests/test_comments.py::TestCommentsIDOR::test_user_cannot_create_comment_on_unaffiliated_project` (xfail)
- **Impact:** Any authenticated user can post comments on work items in projects they aren't assigned to.
- **Fix plan:** Same as P1-1 — guard before insert.

### P1-3 — IDOR: `convert_to_ticket` accepts cross-project assignee
- **Status:** pinned
- **Source:** Audit (P1 #14) — confirmed by test
- **Location:** [backend/routers/personal_tasks.py:200-204](../backend/routers/personal_tasks.py#L200-L204)
- **Pinned by:** `backend/tests/test_personal_tasks.py::TestConvertToTicket::test_convert_to_ticket_with_assignee_outside_project` (xfail)
- **Impact:** Tickets can be assigned to developers who aren't members of the target project, breaking project isolation and capacity accounting.
- **Fix plan:** Before accepting `assignee_developer_id`, verify it appears in the target project's developer list.

### P1-4 — Admin: `specialization` field accepted but not persisted
- **Status:** pinned
- **Source:** Test (`test_admin.py`) — new finding, not in original audit
- **Location:** API contract in [backend/routers/admin.py](../backend/routers/admin.py) (`EmployeeCreate`); model in [backend/models/developer.py](../backend/models/developer.py) lacks the column.
- **Pinned by:** `backend/tests/test_admin.py::test_create_employee_specialization_persists` (xfail)
- **Impact:** Field is echoed in response from input but silently dropped. Frontend forms that send it will show the value once and lose it on refresh.
- **Fix plan:** Either add `specialization: Column(String)` to `Developer` model (with migration) OR remove from API contract.

### P1-5 — No rate limiting on `/login`
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/auth.py:183-223](../backend/routers/auth.py#L183-L223)
- **Impact:** Brute-force is wide open. No failed-attempt counter, no lockout, no CAPTCHA.
- **Fix plan:** `slowapi` middleware: 5 attempts / 15 min per (IP + email).

### P1-6 — GitHub tokens stored plaintext
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/admin.py:512-513](../backend/routers/admin.py#L512-L513), [backend/routers/projects.py](../backend/routers/projects.py)
- **Impact:** Plaintext storage; admin responses leak token existence via `has_github_token` field.
- **Fix plan:** Encrypted column via `cryptography.fernet`; never echo token state in admin responses.

### P1-7 — Render Postgres exposed to public internet
- **Status:** open
- **Source:** Audit
- **Location:** [render.yaml:50](../render.yaml#L50) — `ipAllowList: []`
- **Impact:** DB reachable from anywhere on the internet.
- **Fix plan:** Restrict to backend service IP only; set `DATABASE_SSL_MODE=require`.

### P1-8 — No DB backups configured
- **Status:** open
- **Source:** Audit
- **Location:** [render.yaml](../render.yaml) — no backup block
- **Fix plan:** Enable Render's PITR or schedule daily `pg_dump` to S3.

### P1-9 — Foreign keys not enforced in SQLite dev
- **Status:** open
- **Source:** Audit
- **Location:** [backend/database.py:18](../backend/database.py#L18)
- **Impact:** Dev tolerates referential bugs that explode in Postgres prod.
- **Fix plan:** Add `PRAGMA foreign_keys=ON` via SQLAlchemy `Engine.connect` event.

### P1-10 — Render service-name mismatch
- **Status:** open
- **Source:** Audit
- **Location:** [render.yaml](../render.yaml) uses `arsenal-ops-db`; [docker-compose.yml](../docker-compose.yml) and [.env.example](../.env.example) reference `productmind-db`.
- **Impact:** One environment will break on the name mismatch.
- **Fix plan:** Pick one canonical name; update both files.

### P1-11 — N+1 queries on project & work-item lists
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/projects.py:390-401](../backend/routers/projects.py#L390-L401); similar pattern in [backend/routers/workitems.py:114](../backend/routers/workitems.py#L114)
- **Impact:** O(N) extra queries per list call. Latency blows up with project/item count.
- **Pinned by:** `test_developers.py::test_developers_list_query_count_bounded`, `test_admin.py::test_admin_list_endpoint_query_count` — pin current bounds; will detect regressions.
- **Fix plan:** Add `selectinload(Project.developers)` and equivalents.

### P1-12 — Concurrent-write races on `log_hours`
- **Status:** open
- **Source:** Audit; caused the May 21 capacity hotfix
- **Location:** [backend/routers/workitems.py:983-1093](../backend/routers/workitems.py#L983-L1093)
- **Pinned by:** `test_capacity_properties.py::test_transfer_conservation_invariant` (passing) would have caught it pre-incident. `test_log_hours_defenses.py` pins three defenses already.
- **Fix plan:** Wrap critical section in explicit `SERIALIZABLE` isolation transaction.

### P1-13 — Token expiry 24h, no refresh, no revocation
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/auth.py:33](../backend/routers/auth.py#L33) — `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24`
- **Fix plan:** Reduce to 15–60 min; add refresh token endpoint with rotation; track issued tokens for revocation.

### P1-14 — Logging on Render is unstructured stdout
- **Status:** open
- **Source:** Audit
- **Location:** [backend/logging_config.py:14](../backend/logging_config.py#L14) — file logs skipped on Render, flat-string format
- **Fix plan:** `structlog` + request-ID middleware; JSON output for aggregator ingestion.

### P1-15 — No graceful shutdown handler
- **Status:** open
- **Source:** Audit
- **Location:** [backend/main.py](../backend/main.py)
- **Impact:** Gunicorn `--graceful-timeout 30` is set but no `@app.on_event("shutdown")` closes DB sessions or flushes logs.
- **Fix plan:** Add shutdown event; close `SessionLocal`, flush logger.

### P1-16 — Epic hour rollup may not sum from children (Hypothesis-found)
- **Status:** pinned (suspected — needs investigation)
- **Source:** Test (`test_capacity_properties.py`) — Hypothesis falsification
- **Pinned by:** Three xfail tests in `test_capacity_properties.py`:
  - `test_epic_rollup_sum_invariant` — epic.logged_hours doesn't sum from children
  - `test_epic_rollup_always_sums_correctly` — epic.estimated_hours doesn't sum from children
  - `test_developer_independence` — multi-developer interaction issue
- **Impact:** Unclear — could be a real rollup bug, could be a test setup issue (the rollup may be triggered only on specific mutations). Needs investigation before claiming as a confirmed bug.
- **Fix plan:** Manually exercise the falsifying examples Hypothesis produced; if reproducible, fix `update_epic_hours()` in [backend/routers/workitems.py](../backend/routers/workitems.py).

---

## P2 — Quality / Polish

### P2-1 — No client-side admin role guard
- **Status:** pinned
- **Source:** Audit (P2 #31) — confirmed by test
- **Location:** [app/src/App.tsx:159](../app/src/App.tsx#L159) — `/admin` route renders for any authenticated user; only backend 403s gate access.
- **Pinned by:** `app/src/pages/AdminDashboard/AdminDashboard.test.tsx` — non-admin renders the same UI; locked with FIXME.
- **Impact:** Non-admins see admin UI flash before backend rejections; bad UX, slight info leak.
- **Fix plan:** Wrap `<AdminDashboard />` route with `<RequireRole role="admin">` redirect-to-`/` HOC.

### P2-2 — ProjectBoard silently swallows API errors
- **Status:** pinned (FIXME)
- **Source:** Test (`ProjectBoard.test.tsx`) — finding
- **Location:** [app/src/pages/ProjectBoard/ProjectBoard.tsx](../app/src/pages/ProjectBoard/ProjectBoard.tsx)
- **Pinned by:** `ProjectBoard.test.tsx` — FIXME comment + skipped error-state test
- **Impact:** When `/api/workitems/board` returns 500, users see nothing — no toast, no retry, no error state.
- **Fix plan:** Add a global `useQuery` `onError` handler (or route-level error boundary) that surfaces a toast and offers retry.

### P2-3 — ProjectsPage swallows API errors silently
- **Status:** pinned (skipped)
- **Source:** Test (`ProjectsPage.test.tsx`) — Week 2 finding
- **Location:** [app/src/pages/ProjectsPage.tsx](../app/src/pages/ProjectsPage.tsx)
- **Pinned by:** `ProjectsPage.test.tsx` — error-state test skipped with FIXME
- **Fix plan:** Same as P2-2.

### P2-3a — ItemDetailDrawer silently fails on 500 errors
- **Status:** pinned (FIXME)
- **Source:** Test (`ItemDetailDrawer.test.tsx`) — Tier-2 batch finding
- **Location:** [app/src/pages/ProjectBoard/ItemDetailDrawer.tsx](../app/src/pages/ProjectBoard/ItemDetailDrawer.tsx)
- **Pinned by:** `ItemDetailDrawer.test.tsx` — test 7 documents the silent fallback to `selectedItem` prop on detail-fetch failure.
- **Impact:** When `/api/workitems/:id` returns 500, the drawer silently uses stale prop data with no error indicator. User has no way to know the fresh fetch failed.
- **Fix plan:** Same family as P2-2 — surface a toast + retry affordance. Single shared error-handling primitive would address P2-2, P2-3, and P2-3a together.

### P2-3b — ProjectDetail shows "Project not found" on any error
- **Status:** pinned (FIXME)
- **Source:** Test (`ProjectDetail.test.tsx`) — Tier-2 batch finding
- **Location:** [app/src/pages/ProjectDetail/ProjectDetail.tsx](../app/src/pages/ProjectDetail/ProjectDetail.tsx)
- **Pinned by:** `ProjectDetail.test.tsx` — 500 error test passes only because the page conflates 500 with 404, both rendering "Project not found".
- **Impact:** A transient backend failure looks identical to a missing project, hiding genuine outages from users.
- **Fix plan:** Distinguish error categories in the query's `error` handler; show a retry-able error state for 5xx vs the existing "not found" UI for 404. Companion to P2-2/P2-3/P2-3a.

**Pattern observed:** P2-2, P2-3, P2-3a, P2-3b are all instances of the same systemic frontend gap — no shared error-handling primitive. A single PR introducing a `useApiErrorToast()` hook (wired via TanStack Query's `QueryClient` global `onError`) + a `<RouteErrorBoundary />` for non-recoverable cases would close all four.

### P2-4 — 85 `any` types in frontend
- **Status:** open
- **Source:** Audit
- **Fix plan:** Generate types from FastAPI's `/openapi.json` via `openapi-typescript`; migrate `app/src/lib/api.ts` to `openapi-fetch`. Codegen script already wired in Week 1 (`npm run generate:api-types`).

### P2-5 — No React error boundaries
- **Status:** open
- **Source:** Audit
- **Impact:** One render error kills the whole app.
- **Fix plan:** Wrap each top-level route in an error boundary with a fallback UI.

### P2-6 — Monaco bundled eagerly
- **Status:** open
- **Source:** Audit
- **Location:** [app/vite.config.ts](../app/vite.config.ts), [app/src/pages/ProjectDetail/sections/ArchitectureSection.tsx](../app/src/pages/ProjectDetail/sections/ArchitectureSection.tsx)
- **Impact:** ~3 MB shipped to every user even when ArchitectureEditor is never opened.
- **Fix plan:** `React.lazy(() => import('./ArchitectureEditor'))`.

### P2-7 — `console.log` in shipped frontend
- **Status:** open
- **Source:** Audit
- **Impact:** 15+ instances; ESLint rule is `warn`, not `error`.
- **Fix plan:** Set `no-console: error`; strip via Terser config in vite.

### P2-8 — No API versioning
- **Status:** open
- **Source:** Audit
- **Fix plan:** Mount routers under `/api/v1/*`; future breaking changes use `/api/v2`.

### P2-9 — Hard deletes only (no soft delete)
- **Status:** open
- **Source:** Audit
- **Fix plan:** Add `is_deleted` + `deleted_at` columns; filter queries; soft-cascade.

### P2-10 — CORS `allow_headers=["*"]` with `allow_credentials=True`
- **Status:** open
- **Source:** Audit
- **Location:** [backend/main.py:85](../backend/main.py#L85)
- **Fix plan:** Whitelist headers explicitly.

### P2-11 — No security headers (CSP/HSTS/X-Frame-Options)
- **Status:** open
- **Source:** Audit
- **Fix plan:** `secure` middleware or hand-rolled middleware.

### P2-12 — Mixed Python dep manifests
- **Status:** open
- **Source:** Audit
- **Location:** `backend/requirements.txt` + `backend/pyproject.toml` (no `[project]`) + `backend/uv.lock`
- **Fix plan:** Move all deps to `pyproject.toml [project]`; keep `uv.lock` as the lockfile; delete `requirements.txt` or regenerate from pyproject.

### P2-13 — `print()` in shipped backend code
- **Status:** open
- **Source:** Audit
- **Location:** [backend/routers/projects.py:439](../backend/routers/projects.py#L439)
- **Fix plan:** Replace with `logger.debug(...)`.

### P2-14 — Email service uses sync SMTP
- **Status:** open
- **Source:** Audit
- **Location:** [backend/services/email_service.py:62-65](../backend/services/email_service.py#L62-L65)
- **Impact:** Safe behind `BackgroundTasks` today, but a future refactor lands it on the event loop.
- **Fix plan:** Wrap in `ThreadPoolExecutor` or migrate to `aiosmtplib`.

### P1-17 — `dev_login` had TOCTOU race on Developer insert *(fixed in Week 5)*
- **Status:** fixed
- **Source:** Surfaced during concurrent E2E agent runs (Week 5)
- **Location:** [backend/routers/auth.py:566-578](../backend/routers/auth.py#L566-L578)
- **Impact:** When `DEV_AUTH_BYPASS=1` and multiple concurrent requests hit `/api/auth/dev-login` simultaneously, the check-then-insert sequence for the `dev@local` Developer row raced on the email-unique constraint. One request would 500 with an `IntegrityError` while another committed.
- **Fix:** Wrap the `Developer` insert in try/except, rollback on conflict, re-check existence. Production is unaffected (`DEV_AUTH_BYPASS` never set in prod), but the defensive pattern is correct.
- **Commit:** Week 5 E2E commit on `testing-infrastructure` branch (capacity-transfer agent surfaced and fixed it).

### P2-15 — Kanban + modals not keyboard-accessible
- **Status:** open
- **Source:** Audit
- **Fix plan:** Focus traps on modals; ARIA labels; keyboard alternative for drag-drop.

---

## Process

- **When a new bug is surfaced**, add an entry here and (if pinning current behavior) add an xfail test with `reason="..."` that references this tracker entry by ID.
- **When a fix lands**, change status to `fixed`, add the commit SHA, and flip the pinning xfail to a regular assertion (drop the marker).
- **When in doubt about a Hypothesis-found issue**, mark status `pinned (suspected)` and investigate before promoting to a confirmed bug.

The xfail markers are the safety net: as bugs are fixed, those tests will start passing — pytest reports `XPASS` and (with `strict_markers`) can fail the build, forcing the developer to remove the xfail in the same PR as the fix.
