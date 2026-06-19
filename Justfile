# Arsenal-Ops root developer entrypoint. See: https://just.systems/
# Run `just` (or `just --list`) to see all recipes.

default:
    just --list

# Install all dev dependencies (backend + frontend)
install:
    cd backend && pip install -r requirements.txt
    cd app && npm install

# Run all unit tests (backend + frontend)
test: test-backend test-frontend

# Run backend unit tests. NOTE: 4 tests in test_pulse_overrides.py are
# PRE-EXISTING failures on main (a system-admin-bypass gap in routers/pulse.py),
# unrelated to the test suite — CI deselects them; see .github/workflows/lint.yml.
test-backend:
    cd backend && python -m pytest tests/ -q

# Run backend contract tests (schemathesis fuzzing)
test-contract:
    cd backend && python -m pytest tests/test_contract.py -q -m contract

# Run frontend unit tests once
test-frontend:
    cd app && npm test

# Run frontend tests in watch mode
test-watch:
    cd app && npm run test:watch

# Frontend test coverage report
coverage:
    cd app && npm run test:coverage

# Lint everything (Python + Frontend)
lint:
    cd backend && ruff check . && ruff format --check .
    cd app && npm run lint && npm run format:check

# Format all code (Python + Frontend)
fmt:
    cd backend && ruff format . && ruff check . --fix
    cd app && npm run format

# TypeScript typecheck (mirrors the build + CI: project-reference graph)
typecheck:
    cd app && npx tsc -b --noEmit

# Regenerate the OpenAPI snapshot + frontend types from the backend schema
gen-api:
    cd app && npm run gen:api

# Install pre-commit hooks (run this once per clone)
precommit-install:
    pre-commit install

# e2e / Lighthouse / visual-regression recipes are intentionally absent: the
# Playwright layer is a follow-up PR (it needs a running app + fresh visual
# baselines). Add `e2e`, `e2e-ui`, and `lighthouse` recipes when that lands.
