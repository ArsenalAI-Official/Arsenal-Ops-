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
Alembic (migrations) · Ruff (lint + format)

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
│   │   └── App.tsx         Route table
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
│   ├── requirements.txt    Pinned deps (source of truth)
│   └── pyproject.toml      Ruff config only
├── .github/workflows/      CI (lint.yml runs tsc + eslint + prettier + ruff)
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

### Backend (`backend/`)
| Command | What it does |
|---|---|
| `uvicorn main:app --reload` | Dev server with autoreload |
| `ruff check backend/` | Lint |
| `ruff check backend/ --fix` | Lint + autofix |
| `ruff format backend/` | Apply formatter |
| `ruff format --check backend/` | Verify formatting (what CI runs) |
| `python -m pytest` | Run tests (subset; see `backend/tests/`) |

## CI

`.github/workflows/lint.yml` runs on every PR:
- **Frontend** — `tsc --noEmit`, `eslint`, `prettier --check`
- **Backend** — `ruff check`, `ruff format --check`

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
  patterns, route conventions, component layout). Required reading before
  adding frontend code.
- **`.plans/`** — design and migration plans (split-monoliths, perf passes,
  lint setup, CI). Useful context for current refactors.
- **`backend/pyproject.toml`** — ruff config + lint policy.

## License

Proprietary — Arsenal AI.
