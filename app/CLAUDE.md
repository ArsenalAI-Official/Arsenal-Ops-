# Frontend conventions

This file documents the patterns the `perf/request-timing-middleware` branch
established (or relies on) across the React 19 + TypeScript + Vite frontend.
**Read this before adding pages, mutations, or queries.** New code that
silently drops these patterns will introduce bugs we've already fixed once.

Pair this with `src/pages/CONVENTIONS.md`, which covers page-folder layout
specifically.

---

## Stack

- React 19.2 (concurrent rendering, react-hooks v6 ESLint rules active)
- TypeScript 5.9, `strict: true`
- Vite 7.2
- TanStack Query v5 (`@tanstack/react-query`)
- react-router-dom 7.13
- Tailwind + shadcn/ui + sonner
- ESLint flat config (`eslint.config.js`) + Prettier. Plugins: `typescript-eslint`,
  `react-hooks`, `react-refresh`, **`jsx-a11y`** (accessibility) and
  **`import-x`** (import ordering). See the ESLint posture note below.

CI runs `tsc --noEmit`, `npm run lint`, `npm run format:check`, unit tests, and
a generated-types drift check on every PR via `.github/workflows/lint.yml` (see
the CI section at the bottom). Loud but not blocking — failures show red but
don't gate merge unless added to branch protection.

---

## API types — generated from the backend

The backend's OpenAPI schema is the **source of truth** for API request/response
types. They are generated into `src/client/` by
[`@hey-api/openapi-ts`](https://heyapi.dev) and are **never hand-edited**.

We generate **types only** — no fetch SDK, no TanStack Query hooks, no Zod. The
app keeps its hand-rolled `apiFetch` (`src/lib/api.ts`) and the React Query
conventions below. The full architecture + rollout is in
`.plans/type-generation-pipeline-20260615.md`.

### The flow

```
backend Pydantic response model  (referenced by a route via response_model= or responses=)
  → backend/openapi.json          (committed snapshot; `python backend/scripts/export_openapi.py`)
  → app/src/client/types.gen.ts   (`npm run gen:types`)
  → feature code                  (import the generated type)
```

### Regenerating

```bash
npm run gen:types   # regenerate TS from the committed ../backend/openapi.json (no backend needed)
npm run gen:api     # re-dump the schema from the backend, THEN regenerate types
```

`gen:types` is backend-free and fully reproducible — it's the path most
contributors want. `gen:api` additionally runs `gen:schema`
(`cd ../backend && python scripts/export_openapi.py`), which invokes a bare
`python`: activate the backend venv first and use **Python 3.11** (the backend
uses `int | None` runtime syntax, needs 3.10+; CI pins 3.11). A different
interpreter or missing deps will fail — or worse, emit a schema that drifts from
CI.

The CI `api-types` job regenerates both and **fails on drift** — a PR that
changes a backend schema but doesn't commit the regenerated `backend/openapi.json`
+ `app/src/client` is stale by definition.

### Rules

- **Never hand-edit `src/client/**`** — it's eslint-ignored and overwritten on
  regen. Need a different shape? Change the backend schema and regenerate, or
  derive in feature code (`Pick`/`Omit` off the generated type). UI-only shapes
  that aren't API responses live next to their component.
- **A type only generates if a route references its schema** (via `response_model=`
  or `responses={200: {"model": X}}`). A Pydantic model no route references is
  invisible to the generator. So "add a type to the frontend" = "type the backend
  route."
- **Consuming:** `import type { UserResponse } from '@/client';`
- **Most API shapes now use generated types directly** (no aliases). Migrated:
  User, Developer, Comment, ProjectDeveloper, Sprint, Project (list/admin),
  Goal, Milestone, ActivityItem, ProjectLink, ProjectAnalytics, PersonalTask,
  Employee, Role, DashboardStats, the weekly-report/time-entry shapes, and more.
  When adding code, import the generated type from `@/client` — don't redeclare.
- **Still hand-written, on purpose:**
  - **FE compositions** — `WorkItem` (`@/types/workItems`) is the canonical
    VIEW-MODEL: a normalized superset no single endpoint returns. The wire
    shapes (`SlimWorkItem` board / `WorkItemDetailResponse` detail /
    `WorkItemListResponse` list / `MyTaskResponse` my-tasks) are normalized into
    it at the fetch boundaries via `@/types/workItemMappers` (`slimToWorkItem`,
    `applyWorkItemDetail`) — the one place a backend change surfaces as a
    compile error. It deliberately doesn't alias a generated type (string `id`,
    non-null hours, narrowed enum unions, FE-only `assignee`/`sprint`/`epic`/
    `product_id`). Also hand-written: `MyTask` (= `MyTaskResponse &
    { is_personal? }`), `ProjectOverview`, `HubWorkItem`, the per-view Hub
    WorkItem subsets, and the pulse `PulseData`/`Derived*` family. These compose
    or extend generated pieces; keep them.
    > Note: `Architecture`, `PRDAnalysis`, detail `Project`, and `ProjectMember`
    > were previously kept but are now migrated — the backend models were
    > tightened (nested `CostAnalysisResponse`, `pros`/`cons` → `list[str]`,
    > `tools_recommended` → `dict[str, list[str]]`, `risks`/`timeline` nested) so
    > the generated types are precise, and detail `Project`'s dead
    > `architectures[]` field was dropped.
- When you DO migrate one: prefer tightening the backend Pydantic model over FE
  null-guards (generated types are honestly nullable; if a field is always
  present, make it non-null in the response model and regenerate).

> Backend note: a route exposes its type to the generator via either
> `response_model=X` (runtime validation + the schema) or
> `responses={200: {"model": X}}` (the schema only, no runtime change). Existing
> typed routes (developers, auth, comments, admin) use `response_model=`; the
> projects / workitems / personal-tasks models added for this pipeline use
> `responses=` to avoid re-serializing a hand-built dict (which can change the
> wire format — e.g. int `0` → float `0.0`). Promoting those to `response_model=`
> is gated by the `backend/tests/contract/` byte-diff harness.

---

## React Query — the source of truth for server state

All pages were migrated to react-query in this branch. The provider is set
up in `App.tsx`; the client is configured in `src/lib/queryClient.ts`.

### Query keys

Use arrays, not strings. Conventions in use across the codebase:

| Key | Owner | Notes |
|---|---|---|
| `['projects']` | ProjectsPage | All projects (list view) |
| `['project', id]` | ProjectDetail, ProjectBoard | Single project + dependents |
| `['workItems', filters]` | ProjectBoard | Filtered work-item list. **`filters` must be `useMemo`-stable** — see "Pitfalls" below |
| `['workItem', id, 'comments']` | ProjectBoard | Lazy comments per item |
| `['developers']` | Many | Project developers list |
| `['sprints', projectId]` | ProjectBoard | Project sprints |
| `['personalTasks']` | PersonalTasksPage | User's personal tasks |
| `['myTasks']` | ProjectsPage home widget | User's assigned work items across all projects |
| `['hubData', projectId, sub]` | ProjectDetail | ProjectHub sub-view data |
| `['admin', resource]` | AdminDashboard | One entry per admin tab |

If you add a new query key, pick a convention that's prefix-compatible with
`invalidateQueries({ queryKey: [<prefix>] })` for cross-cutting invalidation.

### Mutation pattern (current default: optimistic)

```ts
const mutation = useMutation({
  mutationFn: (vars) => apiFetch(`/api/...`, { method: 'PUT', body: ... }),
  onMutate: async (vars) => {
    await queryClient.cancelQueries({ queryKey: ['workItems'] }); // PREFIX, not exact
    const snapshot = queryClient.getQueryData(['workItems']);
    queryClient.setQueryData(['workItems'], (old) => /* optimistic write */);
    return { snapshot };
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.snapshot) queryClient.setQueryData(['workItems'], ctx.snapshot);
    toast.error('Failed to ...');
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['workItems'] });
    queryClient.invalidateQueries({ queryKey: ['myTasks'] }); // see below
  },
});
```

### Cross-cutting invalidation rule

Work-item mutations **must invalidate both `['workItems']` and `['myTasks']`**.
The home page's "My Tasks" widget reads from `['myTasks']`, while the Board
reads from `['workItems']` — they share the same underlying data via
different endpoints. F12 in our audit fixed this for 5 sites; don't undo it.

For convenience the board defines a helper:

```ts
const invalidateWorkItems = () => {
  queryClient.invalidateQueries({ queryKey: ['workItems'] });
  queryClient.invalidateQueries({ queryKey: ['myTasks'] });
};
```

### Direct cache writes (not state mirrors)

When you need to optimistically update a list, **write to the react-query
cache, do not mirror it with `useState`**:

```ts
// GOOD — single source of truth
const myTasks = myTasksQuery.data ?? [];
const patchMyTasksCache = (updater: (old: MyTask[]) => MyTask[]) =>
  queryClient.setQueryData<MyTask[]>(['myTasks'], (old) => updater(old ?? []));

// BAD — creates a parallel source of truth that drifts from the cache
const [myTasksLocal, setMyTasksLocal] = useState<MyTask[]>([]);
useEffect(() => setMyTasksLocal(myTasksQuery.data ?? []), [myTasksQuery.data]);
```

---

## TypeScript patterns

### Stabilize empty-default arrays

`data ?? []` in a query consumer creates a **new empty array every render**,
which busts downstream `useMemo`/`useEffect` dependencies:

```ts
// BAD: new [] reference each render
const items = query.data ?? [];

// GOOD: stable reference
const items = useMemo(() => query.data ?? [], [query.data]);
```

We applied this pattern in AdminDashboard for `employees`, `users`, and
`developerCapacities`. Cluster 4 F10 in the audit flagged the remaining
inconsistent applications.

### `ApiError instanceof` for status checks

`apiFetch` (in `src/lib/api.ts`) throws an `ApiError` with a `.status`
field on any non-2xx response. Inspect the type before reading status:

```ts
// GOOD
if (error instanceof ApiError && error.status === 403) { ... }

// BAD — the audit flagged this elsewhere
if ((error as any).status === 403) { ... }
```

Currently only `ProjectDetail.tsx` uses this pattern correctly. New code
should follow the same shape.

### Catch bindings

ES2019 optional catch binding is on. Prefer the shortest form:

```ts
try { ... } catch { ... }          // err unused — no binding
try { ... } catch (_err) { ... }    // err captured but intentionally unused
try { ... } catch (err) { ... }     // err actually used
```

The ESLint rule `@typescript-eslint/no-unused-vars` is configured to allow
`_`-prefixed identifiers and to ignore caught-error params entirely.

### `any` is banned (error)

`@typescript-eslint/no-explicit-any` is an **error** in `eslint.config.js`.
The legacy backlog (API response shapes, recharts payloads, drag/calendar
event types — formerly ~62 `any`s) was burned down: replaced with real types,
the canonical `WorkItem`/`WorkItemUpdate` shapes, library types (e.g.
`react-big-calendar`'s `View`/`ToolbarProps`), and `unknown` + narrowing where
the value is genuinely dynamic. For dynamic values prefer `unknown` + a type
guard; for errors use `permissionAwareError(err, fallback)` (`@/lib/api`) or
`toastErrorHandler(action)` (`@/lib/mutationToast`) — never `catch (e: any)`.
Don't reintroduce `any`; there are no `eslint-disable` escape hatches for this
rule, and any genuinely unavoidable case must be justified in review.

---

## ESLint posture (a11y + import order)

- **Accessibility (`jsx-a11y`)** — the flat-config recommended set runs, but
  every rule is downgraded to **warn**. There's a known a11y backlog (the
  keyboard-inaccessible Kanban board + modals in `ProjectBoard.tsx`); we want
  it visible without turning CI red, and remediated in a dedicated follow-up.
  **Don't add new a11y warnings** in code you touch; fixing the board itself is
  out of scope until that follow-up. When a `jsx-a11y` rule genuinely fights a
  shadcn primitive, relax it in the `src/components/ui/**` + `src/contexts/**`
  override block, not globally.
- **Import order (`import-x/order`)** — **error**, because it's fully
  autofixable: run `eslint --fix`. Order is builtin → external → internal
  (`@/*`) → relative, alphabetized within each group. `newlines-between` is
  intentionally NOT enforced (it conflicts unfixably with side-effect CSS
  imports like `import './App.css'`). Test files (`**/*.test.{ts,tsx}`,
  `src/test/**`) disable the rule — they interleave `vi.mock()` between imports
  (hoisted-mock pattern), which is semantic ordering the rule can't sort.

## TypeScript strictness flags

`tsconfig.app.json` enables, on top of `strict`: `noUnusedLocals`,
`noUnusedParameters`, `noFallthroughCasesInSwitch`, **`noUncheckedIndexedAccess`**,
and **`noImplicitReturns`**. The big one is `noUncheckedIndexedAccess`: `arr[i]`
and `record[key]` are typed `T | undefined`. Prefer narrowing/guards (capture
into a local, `??=` defaults) over `!`; reserve `!` for cases where the element
is statically guaranteed (bounds-checked index, regex capture group, a config
map's known fallback key). `exactOptionalPropertyTypes` is deliberately **off**
for now — it surfaced ~34 findings and is deferred to a follow-up.

---

## React 19 / react-hooks v6 rules

The `react-hooks/set-state-in-effect` and `react-hooks/purity` rules are
active. They forbid:

- Calling `setX(...)` synchronously inside `useEffect` (causes cascading
  renders). When you legitimately need this (e.g., URL→state sync), add a
  per-line `// eslint-disable-next-line react-hooks/set-state-in-effect`
  with a one-sentence reason.
- Calling impure functions during render (`new Date()`, `Math.random()`,
  `Date.now()`). Wrap in `useMemo(..., [])` for once-per-mount, or use
  `useState(() => ({...}))` lazy initializer when the value seeds state.

Examples that exist:
- `TimelineView.tsx` uses `useState(() => ({...new Date()...}))` lazy init.
- `App.tsx` has one eslint-disable on a deliberate `setCountdown(300)`
  reset inside an effect.
- `ui/sidebar.tsx` has one eslint-disable on `Math.random()` in `useMemo`
  for non-deterministic skeleton widths.

### `useEffect` dependency arrays

ESLint enforces `react-hooks/exhaustive-deps`. Don't omit deps to "stop a
loop" — fix the root cause. Common patterns:

- React-query's `mutate` is stable across renders; safe to omit from deps.
- `setSearchParams` from react-router-dom is stable; safe to omit.
- `queryClient` is stable; safe to omit.

---

## Code splitting

`React.lazy` + `Suspense` is in use for route-level chunks (`App.tsx`) and
for heavy non-route components (`MermaidRenderer`, `ArchitectureEditor` in
`ProjectDetail.tsx`). When extracting a heavy sub-component (>500 LOC) that
isn't always rendered, consider lazy-loading it — but ONLY when the audit
or plan specifies so. Lazy-loading a small modal that opens on user click
adds chunk-load latency for no benefit.

---

## Frontend testing

Full architecture + rationale: **`docs/frontend-testing-guide.md`**. The short
version of what to do:

- **Network is faked at the wire with MSW, never by mocking `apiFetch`.**
  Components, hooks, and `apiFetch`'s real pipeline (token header, `ApiError`
  mapping, 204 handling) run unmodified — only the server is fake. The mock
  backend lives in `src/mocks/`: stateful per-domain stores (`data/`) + handlers
  (`handlers/`), reset between every test. Fixtures are typed from the generated
  `@/client` types, so a backend contract change breaks the mocks at compile
  time (`tsc -b` / `tsconfig.test.json`).
- **Don't mock `@/lib/api`.** To force an error/edge case in one test, override
  the handler with `server.use(http.put(\`${API_BASE}/...\`, () => HttpResponse.json({ detail: '...' }, { status: 400 }))`.
  An unhandled request **fails** the test (`onUnhandledRequest: 'error'`).
- **Auth is mocked once, globally** in `src/setupTests.ts` (hoisted mock of
  `@/contexts/AuthContext`, default = signed-in admin with all capabilities).
  Override per-test via `setMockAuthState(...)` / `setupAuthenticatedTest(...)`
  from `@/test-utils/authMocks`; it resets each `afterEach`.
- **Render through `@/test-utils/render`** (`renderPage` / `renderWithRouter` /
  `renderWithQueryClient` / `renderPlain`) — each gives a fresh `QueryClient`
  (`retry: false`, `gcTime: 0`) so the cache never leaks across tests.
- **What to test where:** pure logic → plain unit test (no render); hook
  cache/invalidation → `renderHook` + a per-test `QueryClient` (+ MSW for the
  request); one integration smoke per page → `renderPage` + MSW happy path.
  Brittle visual/layout is **not** jsdom's job — defer to Playwright (a
  follow-up PR). Colocate `*.test.ts(x)` next to the code; query by role/text.
- **Scripts:** `npm test` (run once, CI), `npm run test:watch`,
  `npm run test:coverage`. Root `just test` runs backend + frontend.

---

## Dev login bypass

`POST /api/auth/dev-login` issues a JWT for `dev@local` (admin role) when
`DEV_AUTH_BYPASS=1` is set on the backend. The frontend probes
`/api/auth/dev-login/available` and conditionally renders a "Dev login"
button on the Login page.

Use this for local smoke testing when you don't have Google SSO env vars.
**Do not enable `DEV_AUTH_BYPASS` in any deployed environment.** The
endpoint returns 404 without the flag set, but defence in depth: also gate
the frontend probe with `import.meta.env.DEV` if you find time (audit I9).

---

## Things the audit flagged that we have NOT fixed yet

See `.branch-review/frontend-audit-20260513-1726.md` for the full list and
`.plans/split-monolithic-frontend-*.md` for the split plan. Highlights:

| Issue | Where | Status |
|---|---|---|
| `/admin` has no client-side role guard | `App.tsx:159` | Open |
| JWT stored in localStorage (XSS-readable) | `AuthContext.tsx`, `lib/api.ts` | Open |
| No global 401 handler — expired sessions fail silently | `lib/api.ts`, queryClient | Open |
| `WorkItem` declared 6×, `PersonalTask` 3× — no shared types module | many files | Largely fixed — most API shapes migrated to generated `src/client` types (see "API types"). Remaining hand-written types are FE-compositions or backend-too-loose cases, listed there. `WorkItem` canonical is intentionally kept as the view-model, now anchored to the generated wire types at the fetch boundaries via `@/types/workItemMappers`. |
| `new Date('YYYY-MM-DD')` UTC-parses to local-previous-day | 6 files | Open — fix exists (`parseLocalDate`) in 3 files, not shared |
| 4 fire-and-forget `apiFetch` mutations bypassing `useMutation` | `ProjectsPage`, `ProjectBoard` | Open — preserve current behaviour when extracting |
| No error boundaries anywhere | entire tree | Open |
| Kanban board + 4 modals are keyboard-inaccessible | `ProjectBoard.tsx` | Open |
| `console.log` left in 3 files (ProjectDetail, CalendarView, MermaidRenderer) | various | Open — add `'no-console': 'warn'` to ESLint when fixing |

When you touch files affected by these, **don't silently make them worse**.
If you can fix them in the same PR cheaply, do so and call it out. If
fixing them would expand scope, leave a `// TODO(audit-Fxx)` and move on.

---

## CI

`.github/workflows/lint.yml` runs four jobs:

- **Python (Ruff):** `setup-python` + pip-installs `backend/requirements.txt`
  (which pins `ruff==0.15.12`), then `ruff check backend/` and
  `ruff format --check backend/`.
- **Backend (pytest):** installs `requirements.txt` and runs `pytest` (incl. the
  `tests/contract/` response-contract harness).
- **Frontend (lint + types + tests):** `npm ci` + `npm run lint` +
  `npm run format:check` + `tsc -b --noEmit` + `npm test`.
- **API types (generated, in sync):** regenerates `backend/openapi.json` +
  `app/src/client` (`npm run gen:api`) and fails on `git diff` drift.

All jobs are "loud but not blocking" — failures show red but don't gate merge
unless the corresponding check is added to required-status-checks for `main`.

Pre-flight before pushing:

```bash
cd app && npx tsc -b --noEmit && npm run lint && npm run format:check && npm test && npm run build
cd ../backend && uv tool run ruff check . && uv tool run ruff format --check . && python -m pytest
# if you changed any backend schema:
cd ../app && npm run gen:api && git diff --exit-code ../backend/openapi.json src/client
```
