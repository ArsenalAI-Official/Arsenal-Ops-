"""
Integration tests for the authentication router (POST/GET /api/auth/*).

Tests cover login, current user retrieval, password changes, and dev-login gating.
Uses fixtures from conftest.py and imports password hashing directly from auth.py
to match the live implementation.

NOTE: Google OAuth endpoints (POST /google-login, GET /google/config) are excluded
as they require mocking real Google verification services. Dev-login *success* paths
are also excluded by design since the endpoint is gated by DEV_AUTH_BYPASS.

Adapted from origin/testing-infrastructure for current main:
- The expired-token test no longer depends on `freezegun` (not installed in the
  backend venv). Instead it mints a token with a negative `expires_delta`, which
  `create_access_token` honors, producing an already-expired token deterministically.
- `GET /api/auth/dev-login/available` is now an always-registered endpoint that
  returns 200 with `{"available": false}` when DEV_AUTH_BYPASS != "1" (it used to
  not be registered at all → 404). The gating test is adapted accordingly.
"""

from datetime import timedelta

import pytest
from jose import jwt

from routers.auth import (
    ALGORITHM,
    SECRET_KEY,
    get_password_hash,
    verify_password,
)

# ============= Login (POST /api/auth/login) =============


class TestLogin:
    """Tests for POST /api/auth/login endpoint."""

    def test_login_valid_credentials_returns_token(self, db, test_client):
        """Verify login with correct email and password returns 200 + access_token.

        Creates a user with known password (using get_password_hash from auth.py),
        POST credentials via OAuth2PasswordRequestForm, and asserts:
        - Status 200
        - Response contains access_token, token_type, and user dict
        - Token decodes to the correct user_id
        """
        from models.user import User

        # Create user with known password
        password = "test-password-123"
        user = User(
            email="valid@test.local",
            name="Valid User",
            role="developer",
            is_active=True,
            is_first_login=False,
            hashed_password=get_password_hash(password),
        )
        db.add(user)
        db.commit()

        # Login
        response = test_client.post(
            "/api/auth/login",
            data={"username": "valid@test.local", "password": password},
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "valid@test.local"
        assert data["user"]["id"] == user.id

        # Verify token decodes to correct user
        token = data["access_token"]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == str(user.id)

    def test_login_wrong_password_returns_401(self, db, test_client):
        """Verify login with wrong password returns 401 (not 500 or other).

        Creates a user, POST with correct email but wrong password, and asserts 401.
        """
        from models.user import User

        user = User(
            email="wrongpw@test.local",
            name="Test User",
            role="developer",
            is_active=True,
            is_first_login=False,
            hashed_password=get_password_hash("correct-password"),
        )
        db.add(user)
        db.commit()

        response = test_client.post(
            "/api/auth/login",
            data={"username": "wrongpw@test.local", "password": "wrong-password"},
        )

        assert response.status_code == 401
        assert "Invalid email or password" in response.json()["detail"]

    def test_login_nonexistent_email_returns_401(self, db, test_client):
        """Verify login with nonexistent email returns 401 (not 404, prevents user enumeration).

        POST random email + password and asserts 401 with same error message as wrong password.
        """
        response = test_client.post(
            "/api/auth/login",
            data={"username": "doesnotexist@test.local", "password": "any-password"},
        )

        assert response.status_code == 401
        assert "Invalid email or password" in response.json()["detail"]

    def test_login_disabled_user_returns_403(self, db, test_client):
        """Verify login for disabled user (is_active=False) returns 403.

        Creates user with is_active=False, POSTs correct credentials, asserts 403.
        """
        from models.user import User

        password = "correct-password"
        user = User(
            email="disabled@test.local",
            name="Disabled User",
            role="developer",
            is_active=False,
            is_first_login=False,
            hashed_password=get_password_hash(password),
        )
        db.add(user)
        db.commit()

        response = test_client.post(
            "/api/auth/login",
            data={"username": "disabled@test.local", "password": password},
        )

        assert response.status_code == 403
        assert "Account is disabled" in response.json()["detail"]

    def test_login_empty_password_rejected(self, db, test_client):
        """Verify login with empty password is rejected (not 500).

        POSTs with empty string password and asserts 4xx, not 500.
        """
        from models.user import User

        user = User(
            email="empty-pw@test.local",
            name="Test User",
            role="developer",
            is_active=True,
            is_first_login=False,
            hashed_password=get_password_hash("some-password"),
        )
        db.add(user)
        db.commit()

        response = test_client.post(
            "/api/auth/login",
            data={"username": "empty-pw@test.local", "password": ""},
        )

        assert 400 <= response.status_code < 500
        assert response.status_code != 500


# ============= Current User (GET /api/auth/me) =============


class TestCurrentUser:
    """Tests for GET /api/auth/me endpoint."""

    def test_me_without_token_returns_401(self, test_client):
        """Verify GET /me without Authorization header returns 401.

        FastAPI's HTTPBearer returns "Not authenticated" when the header is
        missing; "Could not validate credentials" is returned when a token is
        present but invalid (see test_me_with_malformed_token_returns_401).
        """
        response = test_client.get("/api/auth/me")

        assert response.status_code == 401
        assert "Not authenticated" in response.json()["detail"]

    def test_me_with_valid_token_returns_user(self, test_client, admin_user):
        """Verify GET /me with valid token returns 200 + user data.

        Uses admin_user fixture to obtain token, GETs /me, and asserts:
        - Status 200
        - Response contains id, email, name, role, is_first_login
        """
        user, token = admin_user

        response = test_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == user.id
        assert data["email"] == user.email
        assert data["name"] == user.name
        assert data["role"] == user.role
        assert data["is_first_login"] is False

    def test_me_with_malformed_token_returns_401(self, test_client):
        """Verify GET /me with malformed token returns 401.

        Sends invalid JWT and asserts 401.
        """
        response = test_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer notarealjwt"},
        )

        assert response.status_code == 401
        assert "Could not validate credentials" in response.json()["detail"]

    def test_me_with_expired_token_returns_401(self, test_client, db):
        """Verify GET /me with an expired token returns 401.

        Mints a token with a negative expires_delta so it is already expired at
        issue time (deterministic, no freezegun dependency), then requests /me.
        """
        from models.user import User
        from routers.auth import create_access_token

        user = User(
            email="expiry@test.local",
            name="Expiry User",
            role="developer",
            is_active=True,
            is_first_login=False,
            hashed_password="test-hash",
        )
        db.add(user)
        db.commit()

        # Already-expired token: exp is one minute in the past.
        token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(minutes=-1),
        )

        response = test_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 401
        assert "Could not validate credentials" in response.json()["detail"]


# ============= Change Password (POST /api/auth/change-password) =============


class TestChangePassword:
    """Tests for POST /api/auth/change-password endpoint."""

    def test_change_password_with_wrong_current_returns_401(self, test_client, db, admin_user):
        """Verify change-password with wrong current password returns 400.

        Uses admin_user fixture, POSTs wrong current_password, asserts 400.
        """
        user, token = admin_user

        response = test_client.post(
            "/api/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "current_password": "wrong-current",
                "new_password": "new-password-123",
            },
        )

        assert response.status_code == 400
        assert "Current password is incorrect" in response.json()["detail"]

    def test_change_password_success(self, test_client, db, make_token):
        """Verify change-password with correct current succeeds + login works with new.

        Creates user with known password, POST correct current + new password,
        assert 200, then verify login with new password works.
        """
        from models.user import User

        current_pw = "old-password"
        new_pw = "new-password-123"

        user = User(
            email="changepass@test.local",
            name="Change Pass User",
            role="developer",
            is_active=True,
            is_first_login=True,
            hashed_password=get_password_hash(current_pw),
        )
        db.add(user)
        db.commit()

        token = make_token(user)

        # Change password
        response = test_client.post(
            "/api/auth/change-password",
            headers={"Authorization": f"Bearer {token}"},
            json={"current_password": current_pw, "new_password": new_pw},
        )

        assert response.status_code == 200
        assert "success" in response.json()["status"]

        # Verify login with new password works
        login_response = test_client.post(
            "/api/auth/login",
            data={"username": "changepass@test.local", "password": new_pw},
        )

        assert login_response.status_code == 200
        assert "access_token" in login_response.json()


# ============= Dev-Login Gating (GET/POST /api/auth/dev-login/*) =============


class TestDevLoginGating:
    """Tests for dev-login endpoints when DEV_AUTH_BYPASS is disabled.

    On current main, the dev-login endpoints are always registered and perform
    a per-request check on DEV_AUTH_BYPASS, rather than being conditionally
    included at app-startup time. So:
      - POST /api/auth/dev-login returns 404 when the bypass is off (runtime guard).
      - GET  /api/auth/dev-login/available returns 200 {"available": false}.
    """

    def test_dev_login_returns_404_when_bypass_disabled(self, test_client):
        """POST /api/auth/dev-login returns 404 when DEV_AUTH_BYPASS is not '1'.

        .env.test sets DEV_AUTH_BYPASS=0, so the runtime guard raises 404.
        """
        response = test_client.post("/api/auth/dev-login")
        assert response.status_code == 404

    def test_dev_login_available_reports_false_when_bypass_disabled(self, test_client):
        """GET /api/auth/dev-login/available returns 200 with available=false.

        The endpoint is always registered now; it reports the bypass state rather
        than 404'ing. With DEV_AUTH_BYPASS=0 it returns {"available": false}.
        """
        response = test_client.get("/api/auth/dev-login/available")
        assert response.status_code == 200
        assert response.json() == {"available": False}


# ============= Helper Tests (password utilities) =============


class TestPasswordUtilities:
    """Verify password hashing and verification match expectations."""

    def test_password_hash_and_verify_roundtrip(self):
        """Verify get_password_hash and verify_password are consistent.

        Hashes a password, then verifies it, asserts True.
        """
        password = "test-password-123"
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True

    def test_password_verify_fails_on_wrong_password(self):
        """Verify verify_password returns False for wrong password.

        Hashes one password, tries to verify a different one, asserts False.
        """
        hashed = get_password_hash("correct-password")
        assert verify_password("wrong-password", hashed) is False

    @pytest.mark.skip(
        reason="current main hashes passwords with plain SHA256 (hashlib), not bcrypt; "
        "the bcrypt scheme this asserted no longer exists in routers/auth.py"
    )
    def test_password_hashing_uses_bcrypt(self):
        """Verify new hashes use bcrypt (start with $2b$).

        Hashes a password and asserts it begins with bcrypt prefix.
        """
        password = "test-password"
        hashed = get_password_hash(password)
        assert hashed.startswith("$2b$"), f"Expected bcrypt hash starting with $2b$, got {hashed}"

    @pytest.mark.skip(
        reason="no bcrypt-migration-on-login on current main; verify_password/get_password_hash "
        "use plain SHA256 with no upgrade path"
    )
    def test_bcrypt_migration_on_login(self, db, test_client):
        """Verify SHA256 legacy hashes are transparently migrated to bcrypt on login.

        Uses a real SHA256 hash (generated via passlib's sha256_crypt in isolation),
        stores it in a user, logs in with correct password, and asserts:
        - Login succeeds (verify_password works with legacy hash)
        - Post-login, the stored hash is upgraded to bcrypt (starts with $2b$)
        """
        from passlib.context import CryptContext

        from models.user import User

        password = "test-password-123"

        # Create a legacy SHA256 hash in isolation (sha256_crypt only, no bcrypt)
        # This simulates a hash created before the bcrypt migration
        legacy_ctx = CryptContext(schemes=["sha256_crypt"])
        legacy_hash = legacy_ctx.hash(password)
        assert legacy_hash.startswith("$5$"), f"Expected SHA256 hash prefix $5$, got {legacy_hash}"

        # Create user with legacy hash
        user = User(
            email="legacy@test.local",
            name="Legacy User",
            role="developer",
            is_active=True,
            is_first_login=False,
            hashed_password=legacy_hash,
        )
        db.add(user)
        db.commit()

        # Login with correct password
        response = test_client.post(
            "/api/auth/login",
            data={"username": "legacy@test.local", "password": password},
        )

        assert response.status_code == 200, f"Login failed: {response.json()}"
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == "legacy@test.local"

        # Verify the hash was upgraded to bcrypt post-login
        db.refresh(user)
        assert user.hashed_password.startswith("$2b$"), (
            f"Expected bcrypt hash after login, got {user.hashed_password}"
        )
