import { defineConfig } from '@hey-api/openapi-ts';

// Generates TypeScript types ONLY from the backend's committed OpenAPI snapshot.
// We deliberately do NOT generate the fetch SDK, TanStack Query hooks, or Zod
// schemas: the app keeps its hand-rolled `apiFetch` (src/lib/api.ts) and the
// documented TanStack Query conventions (see app/CLAUDE.md). See
// .plans/type-generation-pipeline-20260615.md for the full rationale.
//
// Regenerate with `npm run gen:types` (reads the committed ../backend/openapi.json)
// or `npm run gen:api` (re-dumps the schema from the backend first).
export default defineConfig({
  input: '../backend/openapi.json',
  output: {
    path: './src/client',
    // Don't wipe the dir on regen — keeps the hand-written README alongside the
    // generated *.gen.ts (which are overwritten every run anyway).
    clean: false,
    postProcess: ['prettier'],
  },
  plugins: ['@hey-api/typescript'],
});
