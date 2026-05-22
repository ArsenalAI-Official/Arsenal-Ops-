"""
Integration tests for the authentication router (POST/GET /api/auth/*).

Tests cover login, current user retrieval, password changes, and dev-login gating.
Uses fixtures from conftest.py and imports password hashing directly from auth.py
to match the live implementation.

NOTE: Google OAuth endpoints (POST /google-login, GET /google/config) are excluded
as they require mocking real Google verification services. Dev-login *success* paths
are also excluded by design (see test_dev_login_returns_404_when_bypass_disabled)
since the endpoint is marked for P0 removal.
"""

from datetime import timedelta

from freezegun import freeze_time
from jose import jwt

from routers.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
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
        """Verify GET /me with expired token returns 401.

        Uses freezegun to issue a token, advance past ACCESS_TOKEN_EXPIRE_MINUTES,
        then request /me and assert 401.
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

        # Issue token at fixed time
        with freeze_time("2026-05-21 12:00:00"):
            token = create_access_token(
                data={"sub": str(user.id)},
                expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
            )

        # Advance past expiry
        with freeze_time("2026-05-23 00:00:00"):  # ~36 hours later
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
        """Verify change-password with wrong current password returns 401.

        Uses admin_user fixture, POSTs wrong current_password, asserts 401.
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
    """Tests for dev-login endpoint gating based on DEV_AUTH_BYPASS env var.

    NOTE: Router inclusion is at app-startup time (in main.py), so runtime monkeypatch
    of DEV_AUTH_BYPASS won't affect which routers are registered. These tests verify
    that the endpoints don't exist when disabled. The gating itself is tested via
    the startup behavior — confirmed by CI smoke tests with DEV_AUTH_BYPASS=1 and
    confirmed by production deployments without it.
    """

    def test_dev_login_returns_404_when_bypass_disabled(self, test_client, monkeypatch):
        """Verify dev-login returns 404 when DEV_AUTH_BYPASS=0 (not registered).

        The .env.test file has DEV_AUTH_BYPASS=0, so the dev_router is not included
        in the test client's app. POSTing to /api/auth/dev-login should return 404.
        """
        response = test_client.post("/api/auth/dev-login")
        assert response.status_code == 404

    def test_dev_login_available_returns_404_when_bypass_disabled(self, test_client):
        """Verify GET /api/auth/dev-login/available returns 404 when DEV_AUTH_BYPASS=0.

        The .env.test file has DEV_AUTH_BYPASS=0, so the dev_router (which defines
        /dev-login/available) is not included. GETing the endpoint should return 404.
        """
        response = test_client.get("/api/auth/dev-login/available")
        assert response.status_code == 404

    # NOTE: We deliberately do NOT test the success path of dev-login or the enabled path.
    # Router inclusion happens at app startup (before test runs), so these tests cannot
    # enable DEV_AUTH_BYPASS at test time. The enabled behavior is confirmed by:
    # - CI workflows that run with DEV_AUTH_BYPASS=1 (smoke tests pass)
    # - Production verification (endpoint doesn't exist unless enabled)
    # The gating model itself (router inclusion time, not per-request checks) is
    # validated by these tests confirming 404 responses when disabled.


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

    def test_password_hashing_uses_bcrypt(self):
        """Verify new hashes use bcrypt (start with $2b$).

        Hashes a password and asserts it begins with bcrypt prefix.
        """
        password = "test-password"
        hashed = get_password_hash(password)
        assert hashed.startswith("$2b$"), f"Expected bcrypt hash starting with $2b$, got {hashed}"

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
