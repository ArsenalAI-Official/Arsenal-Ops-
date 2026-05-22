# Arsenal-Ops root developer entrypoint.
# See: https://just.systems/

default:
    just --list

# Install all dev dependencies (backend + frontend)
install:
    cd backend && pip install -r requirements.txt
    cd app && npm install

# Run all unit tests (backend + frontend)
test:
    cd backend && python -m pytest tests/ -v
    cd app && npm run test

# Run backend unit tests only
test-backend:
    cd backend && python -m pytest tests/ -v

# Run backend contract tests (schemathesis fuzzing)
test-contract:
    cd backend && python -m pytest tests/test_contract.py -v -m contract

# Run frontend unit tests only
test-frontend:
    cd app && npm run test

# Run frontend tests in watch mode
test-watch:
    cd app && npm run test:watch

# Lint everything (Python + Frontend)
lint:
    cd backend && ruff check . && ruff format --check .
    cd app && npm run lint && npm run format:check

# Format all code (Python + Frontend)
fmt:
    cd backend && ruff format . && ruff check . --fix
    cd app && npm run format

# TypeScript typecheck
typecheck:
    cd app && npx tsc --noEmit

# Regenerate frontend API types from running backend
gen-api-types:
    cd app && npm run generate:api-types

# Run E2E tests (boots backend + frontend automatically via Playwright)
e2e:
    cd app && npm run e2e

e2e-ui:
    cd app && npm run e2e:ui

# Install pre-commit hooks (run this once per clone)
precommit-install:
    pre-commit install
