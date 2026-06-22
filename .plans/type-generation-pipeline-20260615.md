# Backend → Frontend Type Generation Pipeline

**Status:** In progress · **Date:** 2026-06-15 · **Owner:** TBD

## Progress (what landed in the implementing PR)

- ✅ **Phase 1 — pipeline.** `backend/scripts/export_openapi.py` (static dump),
  committed `backend/openapi.json`, `@hey-api/openapi-ts` (typescript plugin
  only) + `openapi-ts.config.ts`, `gen:schema`/`gen:types`/`gen:api` scripts,
  generated `app/src/client` (eslint-ignored, README), and the `api-types` CI
  drift-check job. Two clean adoptions proving the loop end-to-end:
  `AuthContext.User → UserResponse`, `WorkItemPanel.AllDeveloper →
  DeveloperResponse` (+ fixed `useBoardData`'s inline `{id,name,email}` drift).
- ✅ **Phase 2a — contract harness.** `backend/tests/contract/` captures the
  exact JSON of 6 endpoints through `TestClient` and asserts byte-identical
  goldens. The regression oracle for response-model work.
- ✅ **Phase 2b — response schemas (`responses=`, no runtime change).**
  `ProjectDetailResponse`, `WorkItemListResponse`, `MyTaskResponse`,
  `PersonalTaskResponse` (+ nested) added and flowing into generated TS. Contract
  harness stays green, proving zero wire-format change.

### Deferred to follow-up PRs (deliberately not in the first PR)

- ⏭️ **Broad FE migration — collapse the ~35 duplicate hand-types onto generated
  types.** This is per-consumer work, not a swap: the generated types correctly
  mark fields nullable that the FE currently reads as non-null (e.g.
  `PersonalTaskResponse.description`/`created_at` are `string | null`), so each
  adoption surfaces real null-handling fixes across consumers. Do it entity by
  entity (`PersonalTask`, then `Project`, then the 6 `WorkItem` / 8 `Sprint`
  copies via `@/types/workItems` re-export), each its own reviewable change. The
  generated types are available now; `src/types/workItems.ts` is the re-export
  seam.
- ⏭️ **Phase 3 — promote `responses=` → `response_model=`** for runtime
  validation, one endpoint at a time, gated on the contract harness staying
  byte-identical. Note the serialization quirks the harness already exposed
  (int `0` vs float `0.0` for `completion_pct`; raw `datetime` on
  `GET /workitems/{id}`) — some endpoints need handler normalization first and
  may stay `responses=`-only. `get_workitems/{id}`, `overview`, `pulse` remain
  explicitly deferred.

Make the backend API schema the single source of truth for frontend
request/response types, replacing the ~57 hand-written API-shape declarations
(of which ~35 are drifting duplicates) with generated types. This is the
root-cause fix for the type-duplication and field-drift bugs that the recent
decomposition work kept surfacing (e.g. the three `ProjectDeveloper` copies
that disagree on which fields are required).

This plan adapts the `@hey-api/openapi-ts` architecture documented in
`type-generation-architecture.md` (lifted from a sibling repo) to this
codebase's realities.

---

## Decisions locked in

| Decision | Choice | Rationale |
|---|---|---|
| Generator | `@hey-api/openapi-ts` | Cross-repo consistency with the sibling project; room to grow into Zod/SDK/hooks later. |
| Generation scope (now) | **`@hey-api/typescript` plugin only** — types, no SDK/hooks/Zod | Preserves the hand-rolled `apiFetch` + `ApiError` and the documented TanStack Query layer (query-key conventions, optimistic patterns, cross-cutting invalidation rules in `app/CLAUDE.md`). Avoids a large, risky data-layer rewrite. |
| Schema dump | Static `app.openapi()` → file | This backend imports without side effects (lazy DB engine), so no running server/DB is needed — an improvement over the sibling repo's `curl :8000` step. |
| Sync model | Commit snapshot + generated tree; CI fails on drift | Standard, reviewable, FE build needs no Python step. |
| Date transformers | **Deferred** | Backend date serialization is currently inconsistent (ISO strings in `/api/workitems/`, raw `datetime` in `GET /workitems/{id}`); the `dates: true` transformer would misbehave until serialization is normalized. |

### Explicitly out of scope (for now)
- Generated SDK / fetch functions — keep `src/lib/api.ts` `apiFetch`.
- Generated TanStack Query hooks/key factories — keep the documented query-key
  conventions and the optimistic-mutation + cross-cutting-invalidation rules.
  (Adopting generated keys would require rewriting every mutation, including the
  shared `usePersonalTaskMutations` hook from PR #59.)
- Zod runtime validation — additive, can be enabled later for untrusted
  boundaries (PRD / architecture file uploads).
- SQLModel adoption — would unify ORM+schema but means rewriting all 25 model
  files; far bigger and riskier than adding response models.

---

## The core constraint (why this is mostly backend work)

The architecture doc's load-bearing rule:

> **Only schemas referenced from a route's `response_model` (or request body)
> appear in `/openapi.json`.** A model no route references is invisible to the
> generator.

That is exactly this repo's gap. Current state of the backend
(FastAPI ≥0.109, Pydantic ≥2.5):

- **~17% response-model coverage** — only ~23 of 139 route operations declare a
  concrete `response_model`. Well-typed: `developers`, `comments`, `auth`
  (`UserResponse`/`Token`), `workitems` board (`SlimWorkItem`), most `admin`.
- **The high-traffic, high-drift endpoints are untyped** — `/api/projects/`
  (list + detail), `/api/workitems/` (list + detail + `my-tasks`), all
  `/api/personal-tasks/*`, `overview`, `pulse` return hand-built `dict` /
  `list[dict]` via `format_*` / `to_dict()` helpers, not Pydantic.

So generating types *today* yields accurate types for the ~17% and
`Record<string, unknown>` for the core project/work-item views — which is where
the duplication actually hurts. **The pipeline is cheap; the value is gated on
backend `response_model` coverage.**

### The serialization-shape problem
Auto-generating Pydantic from the SQLAlchemy models (`pydantic-sqlalchemy`,
SQLModel) only describes **table rows**. The real responses are **projections**:
`format_project()` adds `work_item_stats`, nests `developers[]`, derives
`is_overdue`, joins `assignee_name`, omits columns. That shape exists only in
imperative dict-building code and must be declared (or the helpers refactored to
return models). `datamodel-code-generator` can *draft* models from sample JSON,
but single-sample inference is unreliable for optional/null — it's a scaffolder,
not a magic button, and there are no captured response bodies to feed it yet
(see the capture harness below).

---

## The critical risk: `response_model=` changes the wire format

Adding `response_model=X` to a route makes FastAPI **filter the response down to
X's fields (silently dropping extras) and coerce/validate types (500 on
mismatch).** Retrofitting it onto a hand-built dict can silently change the JSON
the frontend receives. Confirmed landmines in this codebase:

- `/api/workitems/` emits `"id": str(item.id)` (string) while
  `GET /workitems/{id}` returns an **int** id and **raw `datetime`** objects
  (not ISO strings). The team already hit this once — `SlimWorkItem` declares
  `id: str` deliberately.
- `pulse-derived` and `overview` use `_safe()` wrappers that substitute
  `{}`/`[]`/`None` on error; a strict model would reject those degraded shapes.

**Mitigation — decouple "FE gets types" from "backend behavior changes":**
FastAPI's `responses={200: {"model": X}}` parameter feeds the OpenAPI schema
(and therefore the generated TS) **without runtime validation or filtering**. So:

- **Accurate types** → via `responses=` — zero wire-format risk, ship anytime.
- **Runtime validation** → promote to `response_model=` per-endpoint *later*,
  only after a capture-harness diff proves before/after output is byte-identical.

---

## The keystone: a response-capture + diff harness

There are currently **zero captured response bodies** in `backend/tests/` (tests
call handlers in-process and assert individual keys). One small harness does
triple duty:

1. **Seed** for `datamodel-code-generator` to draft response models.
2. **Regression oracle** — the byte-diff gate before any `response_model=` flip.
3. **Living contract test** in CI.

Implementation: a `TestClient` pass over the existing seed fixtures that dumps
each target endpoint's JSON (including null/empty/degraded cases). Build this
before touching any route.

---

## Phased plan

### Phase 1 — Pipeline + the already-typed ~17% (small, zero backend-behavior risk)
Deliverables:
- **Backend:** `backend/scripts/export_openapi.py` — dumps `app.openapi()` →
  `backend/openapi.json` (sorted keys, 2-space indent for clean diffs).
- **Frontend (`app/`):**
  - `npm i -D @hey-api/openapi-ts`
  - `app/openapi-ts.config.ts`:
    ```ts
    import { defineConfig } from '@hey-api/openapi-ts';
    export default defineConfig({
      input: '../backend/openapi.json',   // committed snapshot, not a live URL
      output: { path: './src/client', clean: false, postProcess: ['prettier'] },
      plugins: ['@hey-api/typescript'],   // types only — no sdk/zod/query
    });
    ```
  - `package.json` scripts:
    - `"gen:schema": "python ../backend/scripts/export_openapi.py"`
    - `"gen:types": "openapi-ts"`
  - Guardrails (from the architecture doc): ESLint-ignore `src/client/**`;
    prettier-ignore `backend/openapi.json`; never hand-edit the generated tree.
- **Prove it end-to-end:** route 2–3 already-typed entities at the generated
  source and delete the hand-written copies — e.g. `DeveloperResponse`,
  `UserResponse`, the comments shape — consumed as
  `components['schemas']['DeveloperResponse']`. Prepare `src/types/workItems.ts`
  to re-export generated `WorkItem`/`Sprint` as coverage grows (keeps the 26
  ProjectBoard import sites working).
- **CI:** an `api-types` drift-check job (sets up Python + Node, runs
  `gen:schema` + `gen:types`, then `git diff --exit-code backend/openapi.json
  app/src/client`). Loud-but-not-blocking initially, per repo convention.

### Phase 2 — Capture harness + `responses=` models (no runtime change)
- Build the capture + diff harness.
- Author response models (draft via `datamodel-code-generator` off captured
  JSON, hand-correct optional/null/enums), wire via **`responses=`** only.
- The core views get accurate generated types here, still with zero backend
  behavior change.
- Order by cleanliness:
  1. **projects** — `format_project()` == `format_projects_batch()`, so list and
     detail share one schema (~4 schemas incl. `work_item_stats`, `developers[]`,
     `selected_architecture`). Clean win. **Effort: M.**
  2. **workitems list** — extend the existing `SlimWorkItem` with ~7 missing
     fields (`description`, `estimated_hours`, `created_at`, …). **Effort: M.**
  3. **my-tasks** — ~70% overlap with the list shape + computed `is_overdue`,
     `project_name`. **Effort: M.**
  4. **personal-tasks** — mostly model-shaped. **Effort: S.**

### Phase 3 — Promote to `response_model=` (per-endpoint, gated)
- Flip `responses=` → `response_model=` one endpoint at a time, each gated on the
  harness proving byte-identical output.
- Optionally enable the date transformer once serialization is normalized.
- **Defer indefinitely** (need handler normalization first; highest risk):
  - `GET /workitems/{id}` — int id + raw `datetime` columns.
  - `overview` — a composition re-emitting 7 other handlers' output with
    `_safe()` fallbacks; requires those to be typed first.
  - `pulse-derived` — ~8–9 nested camelCase schemas with free-form `_safe()`
    fallbacks.

---

## Effort summary

- **~20–23 distinct response schemas** total across the gap list.
- Reuse is partial: project dict is identical list-vs-detail (win), but "work
  item" appears in **three incompatible shapes** (list = str id + ISO dates;
  my-tasks = + computed fields; detail = int id + raw datetimes) — these cannot
  share one model without normalizing the handlers.
- Phase 1: ~half a day, zero backend risk. Phases 2–3: multi-PR, backend-heavy,
  but every step is gated and reversible.
- Net FE win: collapses ~57 declarations / ~35 duplicates → re-exports of a
  generated module, killing the field-drift bug class.

---

## Pitfalls to plan for (Pydantic v2 / OpenAPI 3.1 → hey-api)

1. **Nullable + optional compound.** Pydantic v2 emits nullable as
   `anyOf: [{...}, {type: "null"}]`; an optional-with-default field becomes
   `field?: X | null`. FE code must narrow for **both** `undefined` and `null`.
2. **Untyped `dict` → `Record<string, unknown>`** (never `any`), which forces
   casts at call sites. Fix at the source by typing the response model rather
   than casting in the FE.
3. **Nullable enums.** Verify they render as `("a" | "b") | null` and not a
   widened type.

---

## Guardrails (adopted from the architecture doc)

- Generated dir (`src/client/**`) is **never hand-edited**. Need a different
  shape? Fix the backend schema, or derive in feature code (`Pick`/`Omit` off the
  generated base). UI-only shapes live next to their component.
- **Commit the snapshot with the client.** A PR touching a backend schema but not
  `backend/openapi.json` is stale by definition — the CI drift check enforces it.
- **Lint-ignore the generated tree**; **prettier-ignore the snapshot**.
- **`clean: false`** so a hand-written README can live in `src/client/`.
- Generator version bumps that reflow output land in their own commit.

---

## Open questions

- **CI Python+Node job:** add a dedicated `api-types` workflow, or extend the
  existing `frontend` job in `.github/workflows/lint.yml` with a Python setup
  step? (Leaning dedicated job for separation.)
- **Snapshot location:** `backend/openapi.json` (proposed) vs `app/openapi.json`.
  Backend keeps it next to its source of truth; FE config reads `../backend/...`.
- **F-T1 overlap:** the audit's deferred `WorkItem`/`Sprint` consolidation
  (`CONVENTIONS.md` rules 5–6, `CLAUDE.md`) should be *fulfilled by* this
  pipeline rather than done separately — `src/types/workItems.ts` becomes a
  re-export of the generated types. Confirm before starting the FE migration.

---

## References
- `type-generation-architecture.md` — the sibling-repo architecture this adapts.
- `app/CLAUDE.md` — TanStack Query conventions, query keys, invalidation rules.
- `app/src/pages/CONVENTIONS.md` rules 5–6 — canonical types module + F-T1.
- `app/src/lib/api.ts` — the `apiFetch` / `ApiError` wrapper being preserved.
- PR #59 (`refactor/projects-page-data-hook`) — shared `usePersonalTaskMutations`
  hook whose optimistic logic must not be disrupted by generated query keys.
