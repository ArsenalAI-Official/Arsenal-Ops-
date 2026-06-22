# Arsenal Ops

AI-assisted project management platform — Jira-style work tracking with built-in
PRD parsing, sprint planning, capacity allocation, and architecture/roadmap
generation backed by Azure OpenAI.

- **Frontend** — React 19 + TypeScript + Vite, deployed on Vercel
- **Backend** — FastAPI + SQLAlchemy, deployed on Render (PostgreSQL in prod, SQLite locally)
- **AI** — Azure OpenAI (gpt-4o) for PRD extraction, work-item generation, and planning assistance

## Features

- **Projects & work items** — epics, user stories, tasks, bugs with parent/epic
  hierarchy, sprints, story points, time logging, and a drag-and-drop kanban board
- **PRD analysis** — upload a PRD (PDF/DOCX/MD) and have the AI extract goals,
  personas, milestones, and a generated backlog
- **Capacity planning** — per-developer hours, role-based capabilities,
  multi-project allocation, and capacity transfers
- **AI sprint planning** — generate sprint scopes from backlog with constraints
- **Architecture editor** — Mermaid-based system diagrams stored per-project
- **Pulse** — per-project health rollup: budget, burn, services, risks,
  milestones, FVA (future value analysis)
- **Personal tasks** — lightweight todos outside any project
- **Admin** — employees, users, roles (capability-based RBAC), GitHub integration,
  project member management
- **Activity & timeline** — every state change is logged

## Tech stack

### Frontend (`app/`)
React 19.2 · TypeScript 5.9 (strict) · Vite 7.2 · TanStack Query v5 ·
react-router 7 · Tailwind · shadcn/ui (Radix primitives) · sonner ·
Monaco editor · Mermaid · ESLint flat config + Prettier

### Backend (`backend/`)
FastAPI · SQLAlchemy 2.0 · Pydantic v2 · python-jose (JWT) · passlib +
bcrypt · Azure OpenAI SDK · PyPDF2 / python-docx (PRD parsing) ·
Alembic (migrations) · Ruff (lint + format) · mypy (type checking)

### Database
PostgreSQL in production (Render-managed). SQLite locally — auto-created
from SQLAlchemy models on first backend startup; no migration step needed
for dev.

## Repo layout

```
.
├── app/                    Frontend (Vite SPA)
│   ├── src/
│   │   ├── pages/          Top-level routes (folder-per-page where split)
│   │   ├── components/     Shared components (ProjectHub, board/, ui/, ...)
│   │   ├── hooks/          React hooks (auth, capabilities, queries)
│   │   ├── lib/            queryClient, api helpers, utils
│   │   ├── client/         Generated API types (from backend OpenAPI; do not edit)
│   │   └── App.tsx         Route table
│   ├── openapi-ts.config.ts  Type-generation config (@hey-api/openapi-ts)
│   ├── CLAUDE.md           Frontend conventions (read before adding code)
│   └── package.json
├── backend/                FastAPI service
│   ├── main.py             App entrypoint + CORS + router wiring
│   ├── routers/            Endpoint modules (admin, auth, projects, workitems, ...)
│   ├── models/             SQLAlchemy models (one file per table)
│   ├── services/           Business logic (AI, parsing, capacity, etc.)
│   ├── middleware/         Request-timing, auth
│   ├── capabilities.py     Capability-based RBAC definitions
│   ├── database.py         Engine + session factory
│   ├── scripts/            export_openapi.py (dumps the OpenAPI schema)
│   ├── tests/contract/     Response byte-diff harness (gates response-model work)
│   ├── openapi.json        Committed OpenAPI snapshot (source for FE type gen)
│   ├── requirements.txt    Pinned deps (source of truth)
│   └── pyproject.toml      Ruff + mypy config
├── .github/workflows/      CI (lint.yml runs tsc + eslint + prettier + ruff + mypy)
├── .plans/                 Planning docs (kept in repo for context)
├── .env.example            Environment template — copy to .env
├── docker-compose.yml      Full-stack local dev via Docker
└── render.yaml             Render deploy manifest (backend)
```

## Local development

### Prerequisites
- Node.js 20+ and npm
- Python 3.11+
- (Optional) Docker + Docker Compose for the all-in-one path

### Option 1 — Run frontend + backend natively

**1. Environment**
```bash
cp .env.example .env
# Fill in Azure OpenAI credentials at minimum; other keys are optional
```
> **Required: `SECRET_KEY`.** The backend refuses to start unless `SECRET_KEY`
> is set in the environment to a non-default value — it signs/verifies auth
> JWTs and guards the authenticated `/mcp` endpoint. Generate one with
> `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Set it in
> Render (prod) and your local `.env`. Changing it logs out all active users.

**2. Backend**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
The dev SQLite DB (`backend/productmind.db`) is created automatically from
the models on first startup. Delete it any time to reset state.

**3. Frontend** (in a second terminal)
```bash
cd app
npm install
echo 'VITE_API_URL=http://localhost:8000' > .env
npm run dev
```
Vite serves on http://localhost:5173.

### Option 2 — Docker Compose
```bash
cp .env.example .env       # fill in Azure OpenAI keys
docker compose up --build
```
- Frontend → http://localhost:5173
- Backend  → http://localhost:8000
- Postgres → localhost:5435

## Common tasks

### Frontend (`app/`)
| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier — write |
| `npm run format:check` | Prettier — verify (what CI runs) |
| `npm run preview` | Serve the built bundle locally |
| `npm run gen:types` | Regenerate API types from the committed `backend/openapi.json` |
| `npm run gen:api` | Re-dump the backend schema **and** regenerate API types |

### Backend (`backend/`)
| Command | What it does |
|---|---|
| `uvicorn main:app --reload` | Dev server with autoreload |
| `ruff check backend/` | Lint |
| `ruff check backend/ --fix` | Lint + autofix |
| `ruff format backend/` | Apply formatter |
| `ruff format --check backend/` | Verify formatting (what CI runs) |
| `cd backend && mypy .` | Static type check (what CI runs — see "Type checking") |
| `python -m pytest` | Run tests (subset; see `backend/tests/`) |
| `python scripts/export_openapi.py` | Dump the OpenAPI schema → `backend/openapi.json` |
| `python scripts/export_openapi.py --check` | Fail if `openapi.json` is stale (what CI runs) |

#### Type checking

[mypy](https://mypy-lang.org/) statically type-checks the backend. Config lives
in `backend/pyproject.toml` (`[tool.mypy]`). **Run it from inside `backend/`** —
`cd backend && mypy .` — because mypy only auto-discovers config from the
current directory, so `mypy backend/` from the repo root would silently run
unconfigured. CI does this in the `Backend (pytest + mypy)` job; it's
loud-but-not-blocking like the rest of the lint workflow.

The models use SQLAlchemy 2.0 `Mapped[...]` typing (so no SQLAlchemy mypy
plugin is needed) and the `pydantic.mypy` plugin is enabled. Third-party
modules without stubs (`openpyxl`, `googleapiclient`) are scoped-ignored in
`[[tool.mypy.overrides]]` — never globally.

**Strictness ramp:** the current baseline is `check_untyped_defs` (bodies of
unannotated functions are checked) but *not* `disallow_untyped_defs`/`strict` —
so you don't have to annotate every function, but what's annotated must be
correct. Tightening toward `strict` is a deliberate future ratchet; keep new
code annotated so that step stays small. Use `# type: ignore[code]` only for
genuine third-party/framework false positives, each with a one-line reason
(`warn_unused_ignores` fails the build on stale ignores).

## API types (generated)

The frontend's API request/response types are **generated from the backend's
OpenAPI schema** — they are the single source of truth and are never
hand-written. The pipeline (via [`@hey-api/openapi-ts`](https://heyapi.dev),
types-only) is:

```
backend Pydantic response model   (referenced by a route via response_model= / responses=)
  → backend/openapi.json           committed snapshot — `python backend/scripts/export_openapi.py`
  → app/src/client/types.gen.ts    generated — `npm run gen:types`  (eslint-ignored, never hand-edited)
  → feature code                   import the generated type, e.g. `import type { UserResponse } from '@/client'`
```

To change an API type, change the backend Pydantic schema and regenerate — don't
edit `app/src/client`. A type only appears if some route references its schema.

```bash
# Frontend-only refresh (no backend needed): regenerate TS from the committed snapshot
cd app && npm run gen:types

# Full refresh: re-dump the schema from the backend, then regenerate types
#   (needs the backend Python env importable; the dump is static — no DB/server)
cd app && npm run gen:api
```

`backend/openapi.json` and `app/src/client` are committed; the CI `api-types`
job regenerates both and fails on drift. Backend response shapes are typed in
`backend/routers/*.py` and guarded by `backend/tests/contract/` (a byte-diff
harness). Architecture + rollout: [`app/CLAUDE.md`](app/CLAUDE.md) → "API types"
and [`.plans/type-generation-pipeline-20260615.md`](.plans/type-generation-pipeline-20260615.md).

## CI

`.github/workflows/lint.yml` runs on every PR:
- **Frontend** — `tsc --noEmit`, `eslint`, `prettier --check`, unit tests
- **Backend** — `ruff check`, `ruff format --check`, `pytest`
- **API types** — regenerate the OpenAPI snapshot + frontend types and fail if
  they're out of date (the generated-types drift check)

CI is informational unless branch protection requires it. Keep PRs green.

## Deployment

- **Frontend** — Vercel; project root is `app/`. Set `VITE_API_URL` to the
  production API URL in the Vercel dashboard.
- **Backend** — Render via `render.yaml` (web service + managed Postgres).
  Sensitive env vars (`AZURE_OPENAI_API_KEY`, `GITHUB_TOKEN`, SMTP creds,
  Google OAuth, etc.) are set manually in the Render dashboard — see
  `render.yaml` for the full list of expected `sync: false` keys.

## Authentication & RBAC

- JWT-based auth (`python-jose`); tokens issued by `/api/auth/login` and
  expected as `Authorization: Bearer ...` on protected routes.
- Capability-based RBAC — endpoints declare capabilities via
  `require_capability(...)`; users hold capabilities through assigned roles.
  See `backend/capabilities.py` for the registry, `app/src/lib/capabilities.ts`
  for the client-side helper, and `<Gate>` (`app/src/components/Gate.tsx`)
  for component-level gating.
- A `Superadmin` role with the `*` wildcard capability grants everything;
  bootstrap admins via `backend/create_admin.py`.

## Documentation pointers

- **`app/CLAUDE.md`** — frontend conventions (React Query keys, mutation
  patterns, route conventions, component layout, **generated API types**).
  Required reading before adding frontend code.
- **`app/src/client/README.md`** — how the generated API types work and how to
  consume them.
- **`.plans/`** — design and migration plans (split-monoliths, perf passes,
  lint setup, CI, **type-generation pipeline**). Useful context for current refactors.
- **`backend/pyproject.toml`** — ruff config + lint policy.

## License

Proprietary — Arsenal AI.
