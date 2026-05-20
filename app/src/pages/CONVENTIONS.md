# Page-folder conventions

Pages in this directory follow a co-located folder layout so that a page's
modals, tabs, and sections live next to its orchestrator rather than in a
distant `components/` tree.

## Folder layout

```
pages/
  Foo/
    Foo.tsx          ← orchestrator; the only file App.tsx imports through index.ts
    index.ts         ← re-export: `export { default } from './Foo';`
    modals/
      FooBarModal.tsx
    tabs/
      FooSomethingTab.tsx
    sections/        ← non-tab page regions
      FooHeader.tsx
    components/      ← small reusable pieces specific to this page
      FooCard.tsx
```

`App.tsx` imports `./pages/Foo` (no extension) — the path resolves through
`index.ts`. Stack traces and file pickers still show `Foo.tsx` rather than a
generic `index.tsx`.

## Extraction rules

1. **Queries stay at the parent.** `useQuery` lives in the orchestrator;
   sub-components receive `data`/`isLoading` as props. Do not re-call
   `useQuery` with the same key in a child — it doubles subscriptions.

2. **Mutations stay at the parent.** Pass the `mutate` function down. Form
   state can live in the child (modals especially benefit from owning their
   own form state); the parent owns the cache.

3. **Each sub-component has an explicit `interface FooProps`** at the top of
   its file. No implicit closure dependencies on parent variables.

4. **Handlers extract DOWN with their component** when they're only used by
   that component. Handlers that touch multiple sub-trees stay at the parent.

5. **No central types module yet.** Inline `interface`/`type` declarations
   in each file. A shared types module (audit F-T1) is a separate initiative.

6. **No barrels until a folder has ≥4 files.** Explicit named imports keep
   the dependency graph readable.

7. **`React.lazy` only when audit or plan specifies.** Lazy-loading a small
   modal that opens on user click adds chunk-load latency for no benefit.

## Why this exists

Audit F-X1 (see `.branch-review/frontend-audit-*.md`) flagged 5 page files
over 1,000 LOC each. The split plan is in
`.plans/split-monolithic-frontend-*.md`. This document is the contract every
extraction PR follows so the splits don't drift apart.
