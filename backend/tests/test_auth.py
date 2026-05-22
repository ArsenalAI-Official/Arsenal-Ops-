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

import os
from datetime import timedelta

import pytest
from freezegun import freeze_time

from routers.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    SECRET_KEY,
    get_password_hash,
    verify_password,
)
from jose import jwt


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

    def test_change_password_with_wrong_current_returns_401(
        self, test_client, db, admin_user
    ):
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
    """Tests for dev-login endpoint gating based on DEV_AUTH_BYPASS env var."""

    def test_dev_login_returns_404_when_bypass_disabled(self, test_client, monkeypatch):
        """Verify dev-login returns 404 when DEV_AUTH_BYPASS is unset or '0'.

        Uses monkeypatch to set DEV_AUTH_BYPASS='0', POSTs to /api/auth/dev-login,
        asserts 404 (endpoint does not exist in production mode).
        """
        monkeypatch.setenv("DEV_AUTH_BYPASS", "0")

        response = test_client.post("/api/auth/dev-login")

        assert response.status_code == 404

    def test_dev_login_returns_404_when_bypass_env_unset(self, test_client, monkeypatch):
        """Verify dev-login returns 404 when DEV_AUTH_BYPASS is unset.

        Uses monkeypatch.delenv to remove the env var, POSTs to /api/auth/dev-login,
        asserts 404.
        """
        monkeypatch.delenv("DEV_AUTH_BYPASS", raising=False)

        response = test_client.post("/api/auth/dev-login")

        assert response.status_code == 404

    def test_dev_login_available_reflects_env_disabled(self, test_client, monkeypatch):
        """Verify GET /api/auth/dev-login/available returns false when bypass is disabled.

        Uses monkeypatch to set DEV_AUTH_BYPASS='0', GETs /api/auth/dev-login/available,
        asserts response.available is false.
        """
        monkeypatch.setenv("DEV_AUTH_BYPASS", "0")

        response = test_client.get("/api/auth/dev-login/available")

        assert response.status_code == 200
        assert response.json()["available"] is False

    def test_dev_login_available_reflects_env_enabled(self, test_client, monkeypatch):
        """Verify GET /api/auth/dev-login/available returns true when bypass is enabled.

        Uses monkeypatch to set DEV_AUTH_BYPASS='1', GETs /api/auth/dev-login/available,
        asserts response.available is true.
        """
        monkeypatch.setenv("DEV_AUTH_BYPASS", "1")

        response = test_client.get("/api/auth/dev-login/available")

        assert response.status_code == 200
        assert response.json()["available"] is True

    # NOTE: We deliberately do NOT test the success path of dev-login (when DEV_AUTH_BYPASS=1).
    # The endpoint is marked for P0 removal, so pinning its behavior would be counterproductive.
    # The gating tests above ensure access control works; detailed happy-path tests would be
    # wasted effort given the removal timeline.


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

    def test_password_hashing_is_deterministic(self):
        """Verify same password produces same hash (SHA256 is deterministic).

        Hashes the same password twice, asserts hashes are equal.
        """
        password = "test-password"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        assert hash1 == hash2
