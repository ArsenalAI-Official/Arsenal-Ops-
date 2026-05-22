# Arsenal-Ops Comprehensive Testing Plan

**Branch:** `testing-infrastructure`
**Date:** 2026-05-21
**Status:** Approved — foundation work in progress

---

## 1. Strategy

The current state is ~150 backend tests covering ~30% of routers, **zero frontend tests, no E2E, no CI gating**. The goal isn't 100% coverage — it's a **regression net** that lets us safely execute every P0/P1 fix from the production audit (auth hardening, Alembic adoption, IDOR fixes, service extraction).

Target shape — slightly inverted from a strict Cohn pyramid because the app is mostly CRUD-over-HTTP:

```
              ▲   Visual + Lighthouse  (~10, weekly)
            ◢ ◣
           ◢   ◣  E2E Playwright       (~12 journeys, on PR)
         ◢       ◣
        ◢ Contract◣ Schemathesis        (auto-generated, on PR)
       ◢ FE Page  ◣
      ◢Integration◣  Vitest + MSW       (~15 pages)
     ◢            ◣
    ◢ Backend     ◣  pytest + TestClient (all routers)
   ◢ Integration   ◣
  ◢                ◣
 ◢ Unit + Property ◣  pytest + hypothesis, Vitest (lib/hooks)
```

---

## 2. Toolchain (2026)

| Layer | Tool | Why |
|---|---|---|
| **Backend runner** | `pytest` + `pytest-asyncio` + `pytest-xdist` | Standard; xdist gives 3–5× parallelism |
| **Backend factories** | `polyfactory` | Generates from Pydantic/SQLAlchemy directly; replaces factory-boy |
| **Property-based** | `hypothesis` | Invariants for capacity math, hour rollups, sprint boundaries |
| **HTTP mocking (backend)** | `respx` | Mocks httpx cleanly for Google OAuth, LLM, email |
| **Time control** | `freezegun` | Token expiry, first-login flows |
| **Migration tests** | `testcontainers` (Postgres) | Real dialect, CI-only |
| **Contract tests** | `schemathesis` | Auto-generates fuzz tests from FastAPI OpenAPI |
| **Frontend runner** | `vitest` | Native ESM, Vite-aware, faster than Jest |
| **Component tests** | `@testing-library/react` + `@testing-library/user-event` v14 | Behavior over implementation |
| **API mocking (frontend)** | `MSW v2` | Network-level; tests real fetch/query plumbing |
| **DOM environment** | `happy-dom` for most; **vitest-browser-mode (real Chromium)** for Mermaid/Monaco/recharts | jsdom can't fake canvas/workers |
| **Type-safe contracts** | `openapi-typescript` + `openapi-fetch` | One source of truth from FastAPI's OpenAPI; kills the 85 `any` types |
| **A11y assertions** | `@axe-core/react` | One `axe()` call per component test |
| **E2E** | `Playwright` | Multi-browser, trace viewer, storageState, page.request for setup |
| **Visual regression** | Playwright `toHaveScreenshot()` | Free, in-repo, ~10 pages only |
| **Perf budgets** | `Lighthouse CI` | Non-blocking warnings on key routes |
| **Load tests** | `k6` (quarterly, not in CI) | N+1, pool exhaustion, index gaps |
| **Mutation tests** | `mutmut` (Python), `Stryker` (JS) | Weekly only, auth + capacity modules |
| **Pre-commit** | `pre-commit` + ruff + prettier + gitleaks | Catch secrets/format before CI |
| **Coverage** | `coverage.py` + `@vitest/coverage-v8` + Codecov | No-regression floor, per-package targets |
| **Local entrypoint** | `Justfile` | `just test`, `just e2e`, `just lint` |

**Deferred:** Storybook (premature given page-coupled architecture), Chromatic/Percy (Playwright snapshots are free), Cypress (Playwright wins on speed + browsers).

---

## 3. Backend Plan

### Fixture pattern (`backend/tests/conftest.py`)
- `db` → in-memory SQLite, function-scoped, fresh schema per test.
- `test_client` → `TestClient` with `app.dependency_overrides[get_db] = lambda: db`.
- `admin_user`, `pm_user`, `dev_user` → polyfactory-built users + JWT token tuples.
- `seed_project(developers=[...])` → factory composition for IDOR scenarios.

### Per-router test inventory (untested routers, 4–8 scenarios each)
- **`backend/routers/auth.py`** — login (valid/bad-pw/missing/disabled), `/me`, change-password (bcrypt path), dev-login gated by `DEV_AUTH_BYPASS`, token expiry via freezegun.
- **`backend/routers/admin.py`** — RBAC gating (403 without capability), employee CRUD, duplicate-email conflict, N+1 regression test (assert query count).
- **`backend/routers/comments.py`** — create with @mention extraction (mocked email), update recomputes mentions, **IDOR: cannot read comments on another project's work item** (locks behavior before fix).
- **`backend/routers/personal_tasks.py`** — own-task scoping, status transitions, **IDOR: cannot mutate another user's task**, convert-to-ticket assignee-validation.
- **`backend/routers/developers.py`** — list/filter, 404, auth required.
- **`backend/routers/prd_analysis.py`** — upload→job→poll (LLM mocked via respx), invalid PDF, expired job.
- **`backend/routers/roadmap.py`** — XLSX upload→sprint extraction, parser invariants via hypothesis (no overlapping sprints).
- **`backend/routers/overview.py`** — dashboard counts.

### Property tests (high ROI, recent-incident area)
- **Capacity math** — `total - allocated = available` always; allocation never negative; transfers conserve total hours (would have caught the recent hotfix).
- **Hour rollups** — epic `logged_hours = sum(story logged_hours)` for all valid trees.
- **Sprint boundaries** — `parser.py` produces non-overlapping ordered ranges.

### Migration tests (CI-only, `@pytest.mark.integration`)
- `testcontainers.PostgresContainer("postgres:16-alpine")` → `alembic upgrade head` → assert table set + key indexes present.
- Per-migration: seed pre-migration data → run migration → assert no data loss + new constraints honored.
- Critical for protecting the upcoming Alembic adoption.

### Coverage targets

| Module type | Floor | Target |
|---|---|---|
| `services/` | 80% | 90% |
| `capabilities`, `parser`, util | 85% | 95% |
| `routers/` | 70% | 85% |
| `middleware/` | 80% | 90% |
| `models/` | 60% | 75% (advisory) |

---

## 4. Frontend Plan

### Critical-path integration tests (~15 pages, MSW backend mock)

**Tier 1 (week 1–2):**
1. `app/src/components/Login.tsx` — credential + Google SSO + dev-login probe gated by `import.meta.env.DEV`.
2. `app/src/pages/ProjectsPage.tsx` — loading / empty / error / populated.
3. `app/src/pages/ProjectBoard/ProjectBoard.tsx` — board, filters, drag-drop with optimistic rollback.
4. `app/src/pages/AdminDashboard/AdminDashboard.tsx` — role gating, employee CRUD, modal flows.

**Tier 2 (week 3–4):**
5. `app/src/pages/ProjectDetail/ProjectDetail.tsx` (tabs)
6. `app/src/pages/ProjectBoard/modals/CreateItemModal.tsx` — form + mutation rollback
7. `app/src/pages/ProjectBoard/ItemDetailDrawer.tsx`
8. `app/src/pages/ProjectDetail/tabs/PulseTab.tsx`
9. `app/src/pages/PersonalTasksPage.tsx`

**Tier 3 (week 5+):** admin modals, ProjectManagerTab, ArchitectureSection (Mermaid in browser mode).

### Unit-level (high ROI, low cost)
- All pure utilities in `app/src/lib/`.
- All custom hooks (`renderHook` from testing-library).
- All zod schemas (round-trip parse).

### Type-safe contracts
- Generate `app/src/lib/api.types.ts` from `http://localhost:8000/openapi.json` via `openapi-typescript`.
- Use generated types in MSW handler payloads → handler shapes guaranteed to match real backend.
- Migrate `app/src/lib/api.ts` to `openapi-fetch` — eliminates most `any`.

### A11y & visual regression
- One `axe()` per component-test suite.
- Playwright `toHaveScreenshot()` for 10 canonical pages, 5% threshold, baselines refreshed per sprint.

### Skip
- Storybook (revisit when there's a design-system extraction).
- Visual regression on board (changes too often).
- Testing Radix internals.

---

## 5. E2E + Contract Plan

### Playwright user journeys (12 tests, ~20 min parallelized)
1. Login → dashboard
2. Session idle-timeout modal → auto-logout
3. Project create/edit/delete
4. Work-item lifecycle: create → log 4h → done
5. **Capacity transfer between developers** (recent hotfix area)
6. Comment with @mention → persists, notifies
7. Personal tasks CRUD
8. Admin user mgmt (create/reset/delete)
9. Sprint drag-drop between sprints
10. Multi-tab refresh sync
11. Network-failure recovery
12. First-login forced password change

### Test data (hybrid)
- Per-suite `docker-compose up` → fresh Postgres + `DEV_AUTH_BYPASS=1` (E2E env only).
- First test logs in, dumps `storageState`; rest reuse → ~90s saved per suite.
- Mutations via `page.request.post()` for setup; only UI-test the assertion path.
- `POST /api/test-fixtures/seed-board` endpoint for heavy seeding (E2E-only, env-gated).

### Contract testing (schemathesis)
- `schemathesis run http://localhost:8000/openapi.json --hypothesis-max-examples=100`
- Stateful chain testing (POST→PUT→DELETE) catches missing FK/dep links.
- Runs on every PR, ~5 min.

### Cross-browser
- **PRs**: Chromium + WebKit (~8 min).
- **Nightly main**: + Firefox + mobile viewports.
- Trace + video uploaded on failure only.

### Performance
- Lighthouse CI on `/`, `/project/:id`, `/project/:id/board`. Budgets: LCP <3s, CLS <0.1. Non-blocking comment.
- k6 load test quarterly (not CI): hot endpoints, 10→100 users/60s, assert p95 < 500ms.

---

## 6. CI / Quality Infrastructure

### Workflows — single `.github/workflows/test.yml`

| Job | Trigger | Runtime | Required |
|---|---|---|---|
| `lint` (ruff + eslint + prettier) | PR + main | 2–3 min | After baseline clean |
| `typecheck` (mypy + tsc) | PR + main | 3–4 min | **Yes (day 1)** |
| `unit-backend` (pytest + cov) | PR + main | 5–8 min | **Yes** |
| `unit-frontend` (vitest + cov) | PR + main | 4–6 min | **Yes** (stub-passes if empty) |
| `integration-backend` (testcontainers) | main + path-filtered PR | 8–15 min | No (quality-level) |
| `e2e` (Playwright) | nightly main + `e2e`-labeled PR | 10–20 min | No |
| `contract` (schemathesis) | PR + main | ~5 min | After stable |
| `audit` (pip-audit, npm audit) | PR + main | 2 min | Warn-only |

Caching: pip via `setup-python cache: pip`, npm via `setup-node cache: npm`, Playwright browsers via dedicated cache key.

### Branch protection
Required: `typecheck`, `unit-backend`, `unit-frontend`. Add `lint` and `contract` once baselines clean. E2E/integration stay non-blocking initially.

### Coverage policy
- **No-regression floor** via Codecov on every PR.
- Aspirational: 85% overall by Q3.

### Pre-commit (`.pre-commit-config.yaml`)
- ruff (check + format), prettier, detect-private-key, trailing-whitespace, gitleaks.
- mypy excluded locally (CI catches it).

### Mutation tests
- Weekly Sunday cron, `mutmut` on `backend/auth`, `backend/capacity` only.
- Stryker on the highest-risk hooks. Posts results as issue comment.

### Flaky-test handling
- Only E2E tests use `pytest-rerunfailures` (max 2 retries).
- Daily report job greps for `RERUN` markers, auto-files an issue if 3+ flakes in 7 days.

### Test secrets
- `backend/.env.test` committed (test-only: `SECRET_KEY=dev_...`, `DEV_AUTH_BYPASS=1`).
- Real keys (OpenAI for smoke tests) only via GitHub `secrets.*`.

### Dependabot
- Weekly PRs, limit 3 each for pip + npm.

### Local entrypoint — root `Justfile`
- `just test` — backend + frontend unit
- `just test-watch` — vitest watch
- `just e2e` — boots stack + runs Playwright
- `just lint`, `just fmt`, `just typecheck`

---

## 7. Phased Rollout (~8 weeks)

| Week | Focus | Deliverable |
|---|---|---|
| **1** | Foundations | conftest + polyfactory + auth fixtures; Vitest + MSW + openapi-typescript setup; `Justfile`; CI skeleton (lint/typecheck/unit jobs) |
| **2** | Required gates flip | Make typecheck + unit-backend + unit-frontend **required**; auth router tests; ProjectsPage + Login FE tests; first axe assertions |
| **3** | High-IDOR routers | comments, personal_tasks, admin routers (locks IDOR behavior before fix); ProjectBoard FE integration |
| **4** | Property tests + remaining routers | hypothesis tests for capacity/hours; developers, prd_analysis, roadmap, overview routers; AdminDashboard FE |
| **5** | E2E foundation | Playwright project setup, docker-compose.test.yml, storageState auth, first 4 journeys (login, project CRUD, work-item lifecycle, capacity transfer) |
| **6** | Contract + remaining E2E | schemathesis in CI; E2E journeys 5–12; remaining FE Tier-2 pages |
| **7** | Migration tests + visual | testcontainers Alembic suite (unblocks Alembic adoption); Playwright screenshots for 10 pages; Lighthouse CI |
| **8** | Polish | Mutation tests cron; flaky-test report; pre-commit hooks; Dependabot; coverage badge; team docs |

---

## 8. Foundation PR Scope (this branch — Week 1)

A foundation PR that creates the **shape** without the volume:

### Backend
- Add `pytest-asyncio`, `polyfactory`, `hypothesis`, `respx`, `freezegun`, `pytest-cov`, `pytest-xdist` to dev deps.
- `backend/tests/conftest.py` with `db`, `test_client`, `admin_user`, `pm_user`, `dev_user`, `seed_project` fixtures.
- One smoke test (`backend/tests/test_smoke.py`) to prove the rig works.
- `backend/.env.test` committed.

### Frontend
- Add Vitest, MSW v2, `@testing-library/react`, `@testing-library/user-event`, `@vitest/coverage-v8`, `happy-dom`, `openapi-typescript`, `openapi-fetch` to dev deps.
- `app/vitest.config.ts`, `app/src/test/mocks/{server,handlers}.ts`, `app/src/test/setup.ts`.
- Generate `app/src/lib/api.types.ts` from `/openapi.json` and commit (regenerate script in package.json).
- One smoke test (`app/src/test/smoke.test.tsx`) to prove the rig works.

### CI / Tooling
- `.github/workflows/test.yml` with `typecheck` + `unit-backend` + `unit-frontend` jobs.
- Mark all three as **required status checks** on `main` in branch protection (manual GitHub step, documented).
- `Justfile` at repo root with `test`, `test-watch`, `e2e`, `lint`, `fmt`, `typecheck`.

After this PR merges, week 2's auth-router tests have somewhere to live and a CI gate that actually blocks regressions.

---

## 9. Out of Scope (for this PR)

- Actual router test suites (week 2+).
- Frontend page integration tests (week 2+).
- Playwright E2E (week 5).
- schemathesis (week 6).
- testcontainers migration tests (week 7).
- Mutation testing, visual regression, Lighthouse, pre-commit hooks (week 8).
