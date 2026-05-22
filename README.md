# Arsenal-Ops

## Testing

This repository uses a comprehensive testing strategy across unit, integration, E2E, and contract layers.

### Running tests locally

```bash
# Install dependencies (once)
just install

# All unit tests (backend + frontend)
just test

# Backend unit tests only
just test-backend

# Frontend unit tests only
just test-frontend

# Frontend tests in watch mode
just test-watch

# Contract tests (schemathesis fuzzing on backend OpenAPI)
just test-contract

# E2E tests (Playwright journeys)
just e2e

# E2E tests in UI mode (browser-based test runner)
just e2e-ui
```

### Pre-commit hooks

Before pushing, this repo uses pre-commit hooks to catch formatting, secrets, and YAML errors locally:

```bash
# Install hooks (once per clone)
just precommit-install
```

Hooks run automatically on `git commit`. If one fails, most fixes are automatic; stage and recommit. For details, see [`docs/precommit.md`](./docs/precommit.md).

### Known issues

See [`docs/bug-tracker.md`](./docs/bug-tracker.md) for open bugs and their status.
