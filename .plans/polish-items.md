🔴 P0 — Hard Blockers (Fix Before Any Real Traffic)
These are issues where shipping as-is causes a security incident, data loss, or outage.

Hardcoded JWT secret — backend/routers/auth.py:31: SECRET_KEY = "your-secret-key-change-in-production". Anyone with the source can forge tokens. Move to env, fail startup if unset.
Weak password hashing (SHA-256, unsalted) — backend/routers/auth.py:101-109. create_admin.py already uses bcrypt; the login path doesn't. Migrate to passlib bcrypt/argon2 with a one-time rehash on next login.
Dev-login endpoint always registered — backend/routers/auth.py:535-589. Gated only by an env flag at runtime. One config slip = instant admin. Gate at router-inclusion time or strip in prod builds.
Unsafe file upload — backend/routers/projects.py:1322,1387-1394. Uses file.filename in filesystem path with no sanitization, MIME validation, or size cap. Directory traversal trivially possible.
JWT in localStorage — app/src/lib/api.ts:30, app/src/contexts/AuthContext.tsx:87. XSS-readable. Move to httpOnly cookies (also fixes the missing refresh flow).
Frontend Dockerfile runs npm run dev in prod — app/Dockerfile:13. Vite dev server in production, no static build, no security headers. Multi-stage build → Nginx.
Stack-trace leak via global 500 handler — backend/main.py:123-127. Returns str(exc) to clients (SQL, file paths, internals). Log server-side; return opaque 500.
Hardcoded DB password in docker-compose.yml — docker-compose.yml:10. Even as a dev default this should be ${POSTGRES_PASSWORD}.
No migration system — Four ad-hoc backend/migrate_*.py scripts run in startup, racy under multiple Gunicorn workers, no versioning, no rollback. Adopt Alembic with advisory locks.
Lint CI is non-blocking — .github/workflows/lint.yml is not in required status checks. PRs can merge red. Add to branch protection + add tests/typecheck to CI.
🟠 P1 — Production Fragility (First Sprint Post-Launch)
No error tracking anywhere (Sentry/Rollbar). Frontend crashes silently; backend errors only hit local log files. Add Sentry on both sides.
No frontend tests at all — no vitest/RTL/Playwright. The .playwright-mcp/ dir is recording artifacts, not tests. Start with 3–5 Playwright user journeys (login → create project → log hours → admin) and component tests on the riskiest pages.
7 of ~10 backend routers have zero tests — auth, admin, comments, developers, personal_tasks, prd_analysis, roadmap. The tested ones are mostly capacity/hours rollup (driven by recent incidents).
IDOR holes — backend/routers/personal_tasks.py:171-279 (assignee not validated against project membership); backend/routers/comments.py:86-96 (no project-access check). Cross-tenant reads/writes possible.
No rate limiting on /login — brute-force is wide open. Add slowapi (5/15min per IP+email) + failed-login counter.
GitHub tokens stored plaintext in DB — backend/routers/admin.py:512-513. Use a Fernet-encrypted column; never echo token state in admin responses.
Render Postgres exposed to the public internet — render.yaml:50 ipAllowList: [] opens to all IPs. Restrict to backend service IP only. Add DATABASE_SSL_MODE=require.
No DB backups configured anywhere in render.yaml or docs.
Foreign keys not enforced in SQLite dev (backend/database.py:18) — missing PRAGMA foreign_keys=ON. Dev silently tolerates referential bugs that explode in Postgres prod.
Service name mismatch — render.yaml uses arsenal-ops-db; docker-compose + .env.example reference productmind-db. Will break in one of the two environments.
N+1 on list endpoints — backend/routers/projects.py:390-401 loops over project.developers; same in workitems.py:114. Add selectinload().
Concurrent-write races on log_hours — no isolation level set, two concurrent calls can double-count (this is what caused the recent capacity hotfix).
God files — backend/routers/workitems.py is 2,622 lines; backend/routers/projects.py is 1,528. Business logic lives in route handlers. Extract a services/ layer — the structure already exists, just unused.
Token expiry 24h, no refresh, no revocation — backend/routers/auth.py:33. 15–60 min access + refresh token rotation.
Logging on Render is unstructured stdout — backend/logging_config.py:14 skips file logs on Render and emits flat strings. No correlation IDs, no JSON, no aggregation. Add structlog + request-ID middleware.
No graceful shutdown handler — Gunicorn --graceful-timeout 30 set but no @app.on_event("shutdown") to close DB sessions/flush logs.
🟡 P2 — Quality, Performance, Polish
85 any types in frontend; no zod/OpenAPI-generated types shared with backend. Generate from FastAPI's OpenAPI schema (openapi-typescript).
No React error boundaries anywhere — one render error kills the whole app.
Monaco bundled eagerly in vite config even though only Architecture editor uses it. React.lazy() it.
15+ console.log calls in shipped frontend code; ESLint rule is warn, not error.
Admin route has no client-side role guard — app/src/App.tsx:159. Backend blocks it, but users see 403s instead of a clean redirect.
No API versioning — everything mounted at /api/*, no /v1. Any breaking change requires URL coordination.
No readiness/liveness split — /api/health returns a static OK and doesn't check DB. Render only does HTTP, so cold-DB will pass health but fail traffic.
No security headers anywhere (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
CORS allow_headers=["*"] with allow_credentials=True — backend/main.py:85. Whitelist headers explicitly.
Hard deletes only — no is_deleted / deleted_at; CASCADE wipes work items + comments with no recovery path.
Mixed dependency manifests — requirements.txt + pyproject.toml (no [project]) + uv.lock. Pick one source of truth.
Backend print() in shipped code — backend/routers/projects.py:439.
Email service uses sync SMTP — backend/services/email_service.py:62-65. Currently safe behind BackgroundTasks, but a refactor lands it on the event loop.
Accessibility gaps on kanban + modals (no focus trap, no keyboard alternative for drag-drop, missing ARIA).