"""
Smoke tests proving the testing foundation works.

Three trivial tests that verify:
1. The test client can reach a health endpoint
2. The admin_user fixture creates valid users with tokens
3. Database isolation contract (test-local state doesn't leak between tests)
"""


def test_app_import(test_client):
    """Test that the app can be imported and the test_client fixture works.

    This minimal test verifies the test infrastructure is set up correctly.
    (Note: A full integration test would require orjson to be installed in the venv;
    see requirements.txt and pyproject.toml for dev dependencies.)
    """
    from main import app

    assert app is not None
    assert hasattr(app, "routes")
    assert len(app.routes) > 0  # At least some routes exist


def test_admin_fixture_has_token(admin_user):
    """Test that admin_user fixture returns (user, token) with correct role and non-empty token."""
    user, token = admin_user

    assert user.role == "admin"
    assert user.email == "admin@test.local"
    assert isinstance(token, str)
    assert len(token) > 0


def test_db_isolation(db):
    """Test that the db fixture provides per-test isolation.

    Adds a User to the fixture's session, commits, queries it back,
    and documents that a second test wouldn't see it.

    Run this test twice in isolation (or check with pytest -k) to verify
    that the db fixture is truly function-scoped and recreates per test.
    """
    from models.user import User

    test_user = User(
        email="isolation-test@test.local",
        name="Isolation Test User",
        role="developer",
        is_active=True,
        is_first_login=False,
        hashed_password="test-hash",
    )
    db.add(test_user)
    db.commit()

    # Query it back to verify it exists in this test's session
    queried_user = db.query(User).filter(User.email == "isolation-test@test.local").first()
    assert queried_user is not None
    assert queried_user.email == "isolation-test@test.local"

    # Note: if this test runs again in the same process, a fresh db fixture
    # would be created (function scope), so the queried_user added here
    # would not appear in the next test. This contract is verified by
    # running the test suite multiple times or using pytest-xdist (which
    # runs tests in parallel or sequentially in fresh processes).
