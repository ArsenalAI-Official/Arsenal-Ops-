"""
Contract testing for FastAPI endpoints using schemathesis fuzzing.

Week 6 testing rollout: Validates OpenAPI schema consistency and response shapes
by fuzzing endpoints with hypothesis-generated inputs. Catches contract drift
(response shape mismatches, missing fields, type errors, undocumented status codes).

Exclusions (skipped via pytest marker):
- POST /api/prd/analyze-file (file upload endpoint; requires real binary content)
- POST /api/roadmap/parse (file upload endpoint; requires real binary Excel)
- POST /api/prd/refine-architecture (LLM-calling; requires OpenAI mock)
- GET /api/auth/dev-login/available, POST /api/auth/dev-login (dev-only; gated by DEV_AUTH_BYPASS)
- POST /api/auth/google-login, GET /api/auth/google/config (requires Google OAuth mocking)

Strategy:
- Load schema from FastAPI app via schemathesis.openapi.from_asgi()
- Parametrize test function over all endpoints
- Skip test cases for excluded endpoints via case.skip()
- For auth-required endpoints: use a hook to inject Bearer token
- Reasonable max_examples (20 per endpoint) to avoid CI timeouts
- Validate response matches declared OpenAPI schema
"""

import os
from datetime import timedelta

import pytest

# schemathesis + hypothesis are optional dev-only deps (see backend/pyproject.toml
# [project.optional-dependencies].dev). They are not installed in the default
# backend venv, so skip the whole module cleanly rather than erroring at collection.
# Install them (pip install schemathesis hypothesis) to exercise contract fuzzing.
schemathesis = pytest.importorskip("schemathesis")
pytest.importorskip("hypothesis")

from hypothesis import HealthCheck, settings  # noqa: E402

from main import app  # noqa: E402
from models.user import User  # noqa: E402
from routers.auth import create_access_token  # noqa: E402

# Load OpenAPI schema directly from the FastAPI app via ASGI
schema = schemathesis.openapi.from_asgi("/openapi.json", app=app)

# Endpoints to skip (file uploads, LLM calls, dev/google auth)
EXCLUDED_ENDPOINTS = {
    "POST /api/prd/analyze-file",  # file upload: requires real binary content
    "POST /api/roadmap/parse",  # file upload: requires real binary Excel
    "POST /api/prd/refine-architecture",  # LLM-calling: would require OpenAI mock
    "GET /api/auth/dev-login/available",  # dev-only: gated by DEV_AUTH_BYPASS
    "POST /api/auth/dev-login",  # dev-only: only enabled in dev
    "POST /api/auth/google-login",  # Google OAuth: requires real verification
    "GET /api/auth/google/config",  # Google OAuth config
}


def _create_admin_token(db) -> str:
    """Helper to create an admin token for auth-required endpoints."""
    # Create a temporary admin user
    admin = User(
        email=f"contract-test-{os.urandom(4).hex()}@test.local",
        name="Contract Test Admin",
        role="admin",
        is_active=True,
        is_first_login=False,
        hashed_password="test-hash",
    )
    db.add(admin)
    db.commit()

    # Create a token valid for this test run
    token = create_access_token(
        data={"sub": str(admin.id)},
        expires_delta=timedelta(hours=1),
    )
    return token


@schema.parametrize()
@pytest.mark.contract
@settings(
    max_examples=10,
    suppress_health_check=[
        HealthCheck.too_slow,
        HealthCheck.filter_too_much,
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
    deadline=None,
)
def test_api_contract_holds(case, test_client, db):
    """
    For every endpoint in the OpenAPI schema, fuzz inputs and verify the
    response matches the declared schema.

    Excluded endpoints (marked with pytest.skip) are logged but not executed.

    Uses test_client (FastAPI TestClient with in-memory db) to run contract tests
    without starting a real server. Auth-required endpoints receive a Bearer token
    via request headers.
    """
    # Skip excluded endpoints
    endpoint_label = f"{case.method.upper()} {case.path}"
    if endpoint_label in EXCLUDED_ENDPOINTS:
        pytest.skip(f"Excluded: {endpoint_label} (file upload / LLM / dev auth)")

    # For auth-required endpoints, inject Bearer token
    headers = case.headers or {}

    # Add admin token for any endpoint (schemathesis-generated auth headers may be invalid)
    # The API will reject it if not needed; this ensures we test secured endpoints
    admin_token = _create_admin_token(db)
    headers["Authorization"] = f"Bearer {admin_token}"

    # Call the endpoint via test_client
    response = case.call(
        session=test_client,
        headers=headers,
    )

    # Validate response against OpenAPI schema
    case.validate_response(response)
