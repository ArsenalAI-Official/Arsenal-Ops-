# `src/client` — generated API types

**Do not hand-edit `*.gen.ts` in this directory.** They are generated from the
backend's OpenAPI schema by [`@hey-api/openapi-ts`](https://heyapi.dev) and are
overwritten on every regeneration.

## What's here

- `types.gen.ts` — TypeScript types for every request/response shape the backend
  exposes via a route's `response_model` / request body.
- `index.ts` — re-exports.

We generate **types only** — no fetch SDK, no TanStack Query hooks, no Zod. The
app keeps its hand-rolled `apiFetch` (`src/lib/api.ts`) and the TanStack Query
conventions documented in `app/CLAUDE.md`.

## Regenerating

```bash
# Types only, from the committed snapshot (no backend needed):
npm run gen:types

# Full refresh — re-dump the schema from the backend, then regenerate types.
# Requires the backend Python environment (FastAPI etc.) to be importable:
npm run gen:api
```

The backend snapshot lives at `../backend/openapi.json` and is committed. A CI
job fails if the snapshot or these generated types are stale (see
`.github/workflows/lint.yml`).

## Consuming a type

Each backend schema is emitted as a flat named export — import it directly:

```ts
import type { DeveloperResponse, UserResponse } from '@/client';
```

A field's source of truth is the backend Pydantic model. To change a type, change
the backend schema and regenerate — never edit these files. For UI-only shapes
that aren't API responses, declare them next to their component.

See `.plans/type-generation-pipeline-20260615.md` for the full architecture and
the phased rollout plan.
