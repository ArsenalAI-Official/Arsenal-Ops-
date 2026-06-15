# Code-Quality Tooling Hardening

Five chores that close gaps in the repo's linting / type-checking setup,
discussed in the tooling review. They share a theme and are mostly
independent — each can be picked up cold and shipped as its own PR. The one
ordering constraint: **Ticket 5 depends on Ticket 1** (it flips a rule that
Ticket 1 introduces). All wire into the existing `.github/workflows/lint.yml`,
following the established "loud but not blocking" pattern (red status, no
merge gate) until the team opts to add them to branch-protection required
checks.

## Roadmap

Estimates are **engineering hours with Claude Code** doing the work — config
changes and autofixable findings land fast; the time is mostly in triaging
non-autofixable findings and verifying builds/tests stay green.

| # | Ticket | Type | Est. (w/ Claude Code) | Depends on |
|---|--------|------|------|------------|
| 1 | Harden frontend ESLint + TypeScript (a11y, import order, stricter flags) | Task | 4–8 h | — |
| 2 | Expand backend Ruff rule set | Task | 1–2 h | — |
| 3 | Add mypy static type checking and resolve all non-trivial type errors | Task | 6–10 h | — |
| 4 | Add knip dead-code/dependency analysis to the frontend | Task | 2–4 h | — |
| 5 | Flip `no-explicit-any` to `error` and remove all `any` usage | Task | 4–8 h | 1 |

Suggested order: **2 and 4 first** (smallest, highest signal-per-effort —
knip will surface dead code left by the recent frontend decomposition), then
**1 and 3** (larger). **5 lands last**, after 1 has introduced the rule.

---

## Ticket 1 — Harden frontend ESLint + TypeScript

**Type:** Task / Chore
**Estimate:** 4–8 h with Claude Code

### Summary

Add accessibility + import-order ESLint rules and tighten TypeScript compiler
flags in the `app/` frontend.

### Description

The frontend ESLint flat config (`app/eslint.config.js`) currently extends the
JS / typescript-eslint / react-hooks / react-refresh recommended sets plus
`eslint-config-prettier`. Two high-value rule sources are missing:
accessibility linting and import-order enforcement. TypeScript is already
`strict: true` with `noUnusedLocals` / `noUnusedParameters`, but several
bug-catching flags are off.

This ticket adds those rules incrementally so the codebase stays green. Some
of these (notably `noUncheckedIndexedAccess` and jsx-a11y on the Kanban board)
will surface a meaningful backlog — the goal is to turn the rules **on as
warnings**, fix what's cheap, and leave the rest visible rather than blocking.

The `@typescript-eslint/no-explicit-any` → `error` flip is explicitly **out of
scope** here — `any` is intentionally a warning per `app/CLAUDE.md`, and
flipping it requires burning down the existing ~73 occurrences first. That
work is tracked separately in **Ticket 5**.

### Acceptance Criteria

- [ ] `eslint-plugin-jsx-a11y` is installed and added to `eslint.config.js`
      (flat-config recommended set), scoped to `**/*.{ts,tsx}`.
- [ ] `eslint-plugin-import-x` (or `eslint-plugin-import`) is installed and
      `import-x/order` is configured with a stable group order
      (builtin → external → internal `@/*` → relative), alphabetized, with the
      `@/*` alias recognised as `internal`.
- [ ] The following are added to `app/tsconfig.app.json` `compilerOptions`:
      `noUncheckedIndexedAccess`, `noImplicitReturns`. (`exactOptionalPropertyTypes`
      may be deferred to a follow-up if it proves too noisy — note the decision
      in the PR.)
- [ ] New a11y / import-order rules land as `warn` (not `error`) so CI stays
      non-red on the existing backlog; the import-order rule may be `error`
      since it is autofixable via `eslint --fix`.
- [ ] `npm run lint` passes with zero **errors** (warnings allowed) on the
      current tree, after running `eslint --fix` for autofixable findings.
- [ ] `npx tsc -b --noEmit` passes after the new TS flags are added (fix or
      `// TODO(ts-strict)` the residual; record count in the PR).
- [ ] `app/CLAUDE.md` "Stack" / ESLint section updated to mention the new
      plugins and the a11y posture.

### Technical Notes

- Config file: `app/eslint.config.js` — flat config using `defineConfig`.
  Append jsx-a11y to the `extends` array of the main `**/*.{ts,tsx}` block;
  add `import-x` as a plugin with a `rules` entry. Keep `prettierConfig` last.
- The existing `src/components/ui/**` + `src/contexts/**` override block is the
  place to relax any jsx-a11y rules that fight shadcn primitives if needed.
- a11y ties directly into the open audit item "Kanban board + 4 modals are
  keyboard-inaccessible" (`ProjectBoard.tsx`, see `app/CLAUDE.md`). Expect
  findings there — do **not** attempt to fix the board in this PR; let the
  rule flag it as warnings for a dedicated follow-up.
- `noUncheckedIndexedAccess` will flag array/record indexing across many files
  (`data[i]`, `record[key]`). Prefer narrowing/guards over `!` where cheap.
- Add the new dev-deps to `app/package.json` `devDependencies`.

### Out of Scope

- Flipping `@typescript-eslint/no-explicit-any` to `error` and remediating
  existing `any` usage — tracked in **Ticket 5**.
- Actually remediating the Kanban / modal keyboard-accessibility backlog.
- `exactOptionalPropertyTypes` if it proves disruptive (may defer).
- Adding any of these as branch-protection required checks.

---

## Ticket 2 — Expand backend Ruff rule set

**Type:** Task / Chore
**Estimate:** 1–2 h with Claude Code

### Summary

Enable additional Ruff lint rule groups for the FastAPI backend and remediate
the resulting findings.

### Description

`backend/pyproject.toml` currently selects `E, W, F, I, UP, B, SIM`. Several
cheap, high-value rule groups are available that suit a FastAPI + SQLAlchemy +
Pydantic codebase — comprehensions, pytest style, async pitfalls, and
Ruff-specific lints. This ticket adds them, runs `--fix` for autofixable
findings, and resolves or explicitly ignores the rest.

### Acceptance Criteria

- [ ] `backend/pyproject.toml` `[tool.ruff.lint] select` is extended with at
      least: `C4` (comprehensions), `RUF` (Ruff-specific), `PT` (pytest style),
      `TID` (tidy imports), `ASYNC` (async correctness — relevant to FastAPI).
- [ ] `ruff check backend/ --fix` applied; remaining findings either fixed by
      hand or added to `ignore` with a one-line justification comment (mirror
      the existing `E501` / `B008` comment style).
- [ ] `ruff check backend/` exits clean.
- [ ] `ruff format --check backend/` still passes (no formatting regressions).
- [ ] `pytest` still passes (excluding the 4 pre-existing deselects already
      tracked in CI).

### Technical Notes

- Config block: `backend/pyproject.toml` lines ~30–37. Keep the inline
  comment legend (`E,W = pycodestyle …`) updated with the new codes.
- `B008` is already ignored for `Depends(...)` — `ASYNC` may surface similar
  FastAPI-idiom false positives; ignore per-rule with justification rather than
  reverting the whole group.
- Ruff is pinned at `0.15.12` in `backend/requirements.txt`; no version bump
  needed. CI (`.github/workflows/lint.yml`) already runs `ruff check backend/`,
  so the expanded rules are enforced automatically once merged.
- Run from repo root: `ruff check backend/ --fix` then `ruff format backend/`.

### Out of Scope

- Adding `ANN` (annotations) / `TCH` (type-checking imports) — defer to the
  mypy ticket where annotation work belongs.
- Migrating Python dependencies from `requirements.txt` into `pyproject.toml`
  (called out as a separate change in the file header).

---

## Ticket 3 — Add mypy and resolve all non-trivial type errors

**Type:** Task / Chore
**Estimate:** 6–10 h with Claude Code

### Summary

Add mypy to the FastAPI backend and work through every non-trivial type error
it reports so the backend type-checks cleanly.

### Description

The backend has no static type checker — Ruff lints style and common bugs but
does not check types. Given SQLAlchemy 2.0, Pydantic, and JWT/OAuth flows,
type checking would catch a class of bugs Ruff can't. **mypy** is the chosen
tool (not pyright): it's stdlib-native, configured entirely in
`backend/pyproject.toml`, and adds no Node dependency to the Python CI job.

The bulk of this ticket is **not the setup — it's the remediation.** Adding
mypy and the CI step is ~30 minutes; the real work is the first full
`mypy backend/` run and resolving every genuine type error it surfaces across
the routers (admin, auth, projects, pulse, roadmap, workitems, etc.), the
SQLAlchemy models, and the Pydantic/OAuth layers. The goal is a clean
`mypy backend/` exit — real bugs fixed, real type annotations added — with
`# type: ignore[code]` reserved only for genuine false positives or
third-party stub gaps, each carrying a one-line reason.

### Acceptance Criteria

- [ ] mypy added to `backend/requirements.txt`, pinned (mirror the ruff/pytest
      pinning convention).
- [ ] `[tool.mypy]` config added to `backend/pyproject.toml`:
      `python_version = "3.11"`, `check_untyped_defs = true`,
      `warn_unused_ignores = true`, `warn_redundant_casts = true`,
      `plugins = ["pydantic.mypy"]`, and the SQLAlchemy 2.0 mypy plugin if it
      proves necessary. Exclude `migrate_*.py` and `.venv` (mirror the ruff
      excludes). `ignore_missing_imports` only for specific third-party modules
      that genuinely lack stubs, scoped via `[[tool.mypy.overrides]]` — not
      globally.
- [ ] First full `mypy backend/` run completed and **every non-trivial error
      resolved** by adding correct annotations or fixing the underlying bug —
      not by blanket-ignoring. Real bugs found during the pass are fixed and
      called out in the PR description.
- [ ] `# type: ignore[code]` is used only for genuine false positives /
      missing third-party stubs, each with a one-line justifying comment;
      `warn_unused_ignores` confirms none are stale.
- [ ] `mypy backend/` exits 0.
- [ ] `pytest` still passes (excluding the 4 pre-existing deselects) — type
      fixes must not change runtime behaviour unless fixing a real bug, which
      should be noted.
- [ ] A `mypy backend/` step is added to the backend job in
      `.github/workflows/lint.yml`, non-blocking like the rest.
- [ ] A short "Type checking" section is added to backend docs / CLAUDE
      guidance describing how to run mypy and the intended strictness ramp.

### Technical Notes

- **mypy, not pyright** — decision is made; don't re-litigate it in the PR.
- Pydantic ships its own mypy plugin (`plugins = ["pydantic.mypy"]`) — enable
  it for accurate model-field inference.
- SQLAlchemy 2.0 has native typing for `Mapped[...]` declarations; if the
  models use the older `Column(...)` style, the `sqlalchemy.ext.mypy.plugin`
  may be needed — evaluate during the first run and note the choice.
- Expect the heaviest friction in the routers around `Depends(...)`, request
  bodies, and untyped helper return values. Prefer real annotations over
  `Any`; reach for `# type: ignore` only when a third-party type is wrong.
- The CI Python job already does `setup-python` 3.11 + `pip install -r
  backend/requirements.txt`; adding a `mypy backend/` step is one line.
- Most of the 6–10 h is the remediation pass, not config — size accordingly.

### Out of Scope

- Reaching `disallow_untyped_defs = true` / `strict = true` repo-wide — this
  ticket gets to a clean run under the chosen baseline; full strict mode is a
  follow-up ratchet.
- Making the mypy CI job a required check.

---

## Ticket 4 — Add knip dead-code/dependency analysis to the frontend

**Type:** Task / Chore
**Estimate:** 2–4 h with Claude Code

### Summary

Add knip to the `app/` frontend to detect unused files, exports, and
dependencies, and triage the first run.

### Description

ESLint's `no-unused-vars` and TypeScript's `noUnusedLocals` only work within a
single file — neither detects whole-project dead code (orphaned modules,
exports nobody imports, dependencies in `package.json` that are never used).
knip builds a project-wide import graph from entry points and reports what's
unreachable.

This is especially timely: the `refactor/frontend-decomposition` branch just
broke ProjectHub, the pages, and the admin tabs into orchestrators +
sub-components over several commits (one already titled "delete dead
PersonalTasks"). Decomposition reliably leaves orphaned helpers and stranded
exports behind — knip automates finding the rest.

### Acceptance Criteria

- [ ] `knip` added to `app/package.json` `devDependencies` and a `lint:knip`
      script added (`"lint:knip": "knip"`).
- [ ] A `knip.json` (or `knip` key in `package.json`) is created, tuned for the
      stack: entry `src/main.tsx` (+ Vite/Vitest config files), project
      `src/**/*.{ts,tsx}`, `@/*` path alias respected, and
      `src/components/ui/**` ignored (vendored shadcn primitives with
      intentionally-unused exports).
- [ ] First `npx knip` run completed; genuinely-dead files/exports/deps removed
      in this PR, and any false positives documented in `knip.json` `ignore` /
      `ignoreDependencies` with a comment.
- [ ] `npm run build` (`tsc -b && vite build`) and `npm test` still pass after
      removals.
- [ ] A `knip` step is added to the frontend job in
      `.github/workflows/lint.yml`, non-blocking initially.

### Technical Notes

- knip auto-detects Vite, Vitest, Tailwind, and TypeScript via built-in
  plugins; it reads `tsconfig.app.json` for the `@/*` alias resolution.
- Watch for **false positives** from dynamic imports and `React.lazy` —
  `App.tsx` and `ProjectDetail.tsx` lazy-load route chunks and heavy
  components (`MermaidRenderer`, `ArchitectureEditor`). Verify these aren't
  reported as unused before deleting anything.
- Review every candidate before removal — knip reports candidates, not
  certainties. Do not run `knip --fix` blindly on the first pass.
- Likely-relevant deps to scrutinise from `package.json`:
  `kimi-plugin-inspect-react` (dev), and any Radix package whose component was
  removed during decomposition.

### Out of Scope

- Acting on knip's "unlisted dependencies" beyond adding them to
  `package.json` (no source changes to satisfy them).
- Running knip on the backend (Python — not in scope for knip).
- Making the knip CI job a required check.

---

## Ticket 5 — Flip `no-explicit-any` to `error` and remove all `any` usage

**Type:** Task / Chore
**Estimate:** 4–8 h with Claude Code
**Depends on:** Ticket 1 (frontend ESLint/TS hardening)

### Summary

Set `@typescript-eslint/no-explicit-any` to `error` and eliminate the ~73
existing `any` occurrences across the frontend so the rule passes with no
suppressions.

### Description

`@typescript-eslint/no-explicit-any` is currently `warn` in
`app/eslint.config.js` — a deliberate choice (`app/CLAUDE.md`) because the
codebase leans on `any` for API response shapes, recharts callback payloads,
and drag-drop event types. There are **~73 occurrences across 26 files**.

This ticket burns that backlog down and flips the rule to `error` so `any`
can't return. It is the remediation counterpart to Ticket 1, which introduces
the surrounding a11y / import-order / strict-flag hardening but deliberately
leaves `any` as a warning. This is real typing work, not a config change:
each `any` is replaced with a precise type, a generic, or `unknown` + a
narrowing guard.

### Acceptance Criteria

- [ ] All `any` usages in `app/src` are removed or replaced — `: any`,
      `as any`, `any[]`, `Array<any>`, `Record<…, any>`, `<any>`. Prefer real
      types; use `unknown` + narrowing where the shape is genuinely dynamic.
- [ ] API response payloads are typed against real interfaces (coordinate with
      the open `WorkItem`/`PersonalTask` shared-types audit item in
      `app/CLAUDE.md` rather than inventing parallel shapes).
- [ ] recharts callback and drag-drop event types use the library-provided
      types (or a documented minimal local type) instead of `any`.
- [ ] `@typescript-eslint/no-explicit-any` is changed from `warn` to `error`
      in `app/eslint.config.js`; the `app/CLAUDE.md` note that "`any` is a
      warning, not an error" is updated to reflect the new policy.
- [ ] `npm run lint` passes with **zero** `no-explicit-any` errors and **no**
      `// eslint-disable-next-line @typescript-eslint/no-explicit-any`
      escape hatches left behind (any genuinely unavoidable case must be
      justified in review).
- [ ] `npx tsc -b --noEmit`, `npm run build`, and `npm test` all pass.

### Technical Notes

- Inventory the current set with:
  `grep -rnE ': any\b|<any>|as any|any\[\]|Array<any>|Record<[^,]*, *any>' app/src`
  (~73 hits / 26 files at time of writing).
- Sequence after Ticket 1 so the import-order / strict-flag churn doesn't
  collide with this PR.
- The hardest clusters are the three `app/CLAUDE.md` calls out: response
  payloads, recharts, and drag-drop. Tackle shared response types first — a
  single shared `WorkItem`/`PersonalTask` module likely kills several `any`s
  at once.
- Where a value is truly dynamic (e.g. parsed JSON), `unknown` + a type guard
  or a zod schema (zod is already a dependency) is preferred over `any`.

### Out of Scope

- The a11y / import-order / strict-TS-flag work itself (Ticket 1).
- Backend typing (Ticket 3).
- Introducing zod validation where it doesn't already exist purely to retype
  an `any` — use `unknown` + a guard unless validation is independently
  warranted.
