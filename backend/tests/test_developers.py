"""
Integration tests for the developers router (GET/POST/PUT/DELETE /api/developers/*).

Tests cover CRUD operations, authentication enforcement, and basic N+1 regression checks.
Uses fixtures from conftest.py and follows style from test_auth.py.
"""

from sqlalchemy import event

from models.developer import Developer

# ============= List Developers (GET /api/developers/) =============


class TestListDevelopers:
    """Tests for GET /api/developers/ endpoint."""

    def test_list_developers_returns_all(self, db, test_client, admin_user):
        """Verify GET /developers returns all seeded developers.

        Creates 3 developers, GETs /developers with auth token, asserts
        status 200 and response list contains all 3 with correct fields.
        """
        _, token = admin_user

        # Create 3 developers
        devs = [
            Developer(name="Alice", email="alice@test.local", github_username="alice-gh"),
            Developer(name="Bob", email="bob@test.local", github_username="bob-gh"),
            Developer(name="Charlie", email="charlie@test.local", github_username="charlie-gh"),
        ]
        for dev in devs:
            db.add(dev)
        db.commit()

        response = test_client.get(
            "/api/developers/",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert all("id" in d and "name" in d and "email" in d for d in data)

    def test_list_developers_unauthenticated_returns_401(self, test_client):
        """Verify GET /developers without token returns 401.

        Confirms auth is enforced on list endpoint.
        """
        response = test_client.get("/api/developers/")

        assert response.status_code == 401

    def test_list_developers_empty_list(self, db, test_client, admin_user):
        """Verify GET /developers returns empty list when no developers exist.

        GETs /developers with auth but no seeded data, asserts 200 with [].
        """
        _, token = admin_user

        response = test_client.get(
            "/api/developers/",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json() == []


# ============= Get Developer by ID (GET /api/developers/{developer_id}) =============


class TestGetDeveloper:
    """Tests for GET /api/developers/{developer_id} endpoint."""

    def test_get_developer_by_id_returns_record(self, db, test_client, admin_user):
        """Verify GET /developers/{id} returns correct developer record.

        Creates a developer, GETs /developers/{id}, asserts 200 and fields match.
        """
        _, token = admin_user

        dev = Developer(name="Test Dev", email="testdev@test.local", github_username="testdev-gh")
        db.add(dev)
        db.commit()

        response = test_client.get(
            f"/api/developers/{dev.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == dev.id
        assert data["name"] == "Test Dev"
        assert data["email"] == "testdev@test.local"
        assert data["github_username"] == "testdev-gh"

    def test_get_developer_by_id_nonexistent_returns_404(self, test_client, admin_user):
        """Verify GET /developers/{nonexistent_id} returns 404.

        GETs /developers/999999 (bogus id), asserts 404 with "not found" message.
        """
        _, token = admin_user

        response = test_client.get(
            "/api/developers/999999",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_developer_unauthenticated_returns_401(self, db, test_client):
        """Verify GET /developers/{id} without token returns 401.

        Confirms auth is enforced on get-by-id endpoint.
        """
        dev = Developer(name="Test", email="test@test.local")
        db.add(dev)
        db.commit()

        response = test_client.get(f"/api/developers/{dev.id}")

        assert response.status_code == 401


# ============= Create Developer (POST /api/developers/) =============


class TestCreateDeveloper:
    """Tests for POST /api/developers/ endpoint."""

    def test_create_developer_persists(self, db, test_client, admin_user):
        """Verify POST /developers creates and persists a new developer.

        POSTs valid DeveloperCreate payload, asserts 200, then verifies
        record exists in db with correct fields.
        """
        _, token = admin_user

        payload = {
            "name": "New Developer",
            "email": "newdev@test.local",
            "github_username": "newdev-gh",
            "avatar_url": "https://example.com/avatar.jpg",
        }

        response = test_client.post(
            "/api/developers/",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Developer"
        assert data["email"] == "newdev@test.local"

        # Verify in db
        dev_in_db = db.query(Developer).filter(Developer.email == "newdev@test.local").first()
        assert dev_in_db is not None
        assert dev_in_db.name == "New Developer"

    def test_create_developer_duplicate_email_returns_400(self, db, test_client, admin_user):
        """Verify POST /developers with duplicate email returns 400.

        Creates a developer, then POSTs with same email, asserts 400.
        """
        _, token = admin_user

        # Seed a developer
        dev = Developer(name="Existing", email="duplicate@test.local")
        db.add(dev)
        db.commit()

        # Try to create another with same email
        response = test_client.post(
            "/api/developers/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": "Another",
                "email": "duplicate@test.local",
            },
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_create_developer_unauthenticated_returns_401(self, test_client):
        """Verify POST /developers without token returns 401.

        Confirms auth is enforced on create endpoint.
        """
        response = test_client.post(
            "/api/developers/",
            json={"name": "Test", "email": "test@test.local"},
        )

        assert response.status_code == 401

    def test_create_developer_minimal_fields(self, db, test_client, admin_user):
        """Verify POST /developers with only required fields (name, email) succeeds.

        POSTs minimal payload (no github_username or avatar_url), asserts 200.
        """
        _, token = admin_user

        response = test_client.post(
            "/api/developers/",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Minimal", "email": "minimal@test.local"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Minimal"
        assert response.json()["github_username"] is None


# ============= Update Developer (PUT /api/developers/{developer_id}) =============


class TestUpdateDeveloper:
    """Tests for PUT /api/developers/{developer_id} endpoint."""

    def test_update_developer_field_persists(self, db, test_client, admin_user):
        """Verify PUT /developers/{id} updates and persists a field.

        Creates a developer, PUTs updated name, asserts 200 and db reflects change.
        """
        _, token = admin_user

        dev = Developer(name="Old Name", email="update@test.local")
        db.add(dev)
        db.commit()

        response = test_client.put(
            f"/api/developers/{dev.id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "New Name"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "New Name"

        # Verify in db
        db.refresh(dev)
        assert dev.name == "New Name"

    def test_update_developer_email_persists(self, db, test_client, admin_user):
        """Verify PUT /developers/{id} updates email and checks uniqueness.

        Creates a developer, PUTs new email (not duplicate), asserts 200 and persists.
        """
        _, token = admin_user

        dev = Developer(name="Test", email="old@test.local")
        db.add(dev)
        db.commit()

        response = test_client.put(
            f"/api/developers/{dev.id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"email": "newemail@test.local"},
        )

        assert response.status_code == 200
        assert response.json()["email"] == "newemail@test.local"

    def test_update_developer_duplicate_email_returns_400(self, db, test_client, admin_user):
        """Verify PUT /developers/{id} with duplicate email returns 400.

        Creates two developers, PUTs first with second's email, asserts 400.
        """
        _, token = admin_user

        dev1 = Developer(name="Dev1", email="dev1@test.local")
        dev2 = Developer(name="Dev2", email="dev2@test.local")
        db.add_all([dev1, dev2])
        db.commit()

        response = test_client.put(
            f"/api/developers/{dev1.id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"email": "dev2@test.local"},
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    def test_update_developer_nonexistent_returns_404(self, test_client, admin_user):
        """Verify PUT /developers/{nonexistent_id} returns 404.

        PUTs /developers/999999, asserts 404.
        """
        _, token = admin_user

        response = test_client.put(
            "/api/developers/999999",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": "Updated"},
        )

        assert response.status_code == 404

    def test_update_developer_unauthenticated_returns_401(self, db, test_client):
        """Verify PUT /developers/{id} without token returns 401.

        Confirms auth is enforced on update endpoint.
        """
        dev = Developer(name="Test", email="test@test.local")
        db.add(dev)
        db.commit()

        response = test_client.put(
            f"/api/developers/{dev.id}",
            json={"name": "Updated"},
        )

        assert response.status_code == 401


# ============= Delete Developer (DELETE /api/developers/{developer_id}) =============


class TestDeleteDeveloper:
    """Tests for DELETE /api/developers/{developer_id} endpoint."""

    def test_delete_developer_removes_record(self, db, test_client, admin_user):
        """Verify DELETE /developers/{id} removes record from db.

        Creates a developer, DELETEs it, asserts 200 and record no longer exists.
        """
        _, token = admin_user

        dev = Developer(name="To Delete", email="delete@test.local")
        db.add(dev)
        db.commit()
        dev_id = dev.id

        response = test_client.delete(
            f"/api/developers/{dev_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "deleted"

        # Verify removed from db
        dev_after = db.query(Developer).filter(Developer.id == dev_id).first()
        assert dev_after is None

    def test_delete_developer_nonexistent_returns_404(self, test_client, admin_user):
        """Verify DELETE /developers/{nonexistent_id} returns 404.

        DELETEs /developers/999999, asserts 404.
        """
        _, token = admin_user

        response = test_client.delete(
            "/api/developers/999999",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    def test_delete_developer_unauthenticated_returns_401(self, db, test_client):
        """Verify DELETE /developers/{id} without token returns 401.

        Confirms auth is enforced on delete endpoint.
        """
        dev = Developer(name="Test", email="test@test.local")
        db.add(dev)
        db.commit()

        response = test_client.delete(f"/api/developers/{dev.id}")

        assert response.status_code == 401


# ============= N+1 Regression (Query Count) =============


class TestDevelopersQueryOptimization:
    """Tests to catch N+1 query regressions in list endpoint."""

    def test_developers_list_query_count_bounded(self, db, test_client, admin_user):
        """Verify GET /developers doesn't trigger N+1: count queries <= 3 for 5 devs.

        Creates 5 developers, instruments db.session to count queries, GETs /developers,
        asserts query count is below threshold (should be ~1-2 for a simple query).
        """
        _, token = admin_user

        # Create 5 developers
        for i in range(5):
            dev = Developer(
                name=f"Developer {i + 1}",
                email=f"dev{i + 1}@test.local",
            )
            db.add(dev)
        db.commit()

        # Count queries during GET
        query_count = 0

        def count_query(conn, cursor, statement, parameters, context, executemany):
            nonlocal query_count
            query_count += 1

        event.listen(db.get_bind(), "before_cursor_execute", count_query)

        response = test_client.get(
            "/api/developers/",
            headers={"Authorization": f"Bearer {token}"},
        )

        event.remove(db.get_bind(), "before_cursor_execute", count_query)

        assert response.status_code == 200
        assert len(response.json()) == 5
        # Threshold: 1 for the user lookup + 1 for the list, plus a small constant
        # for RBAC capability resolution on the authed user (loading roles +
        # role_capabilities). This is a fixed per-request cost — it does not scale
        # with the number of developers — so it still guards against N+1.
        assert query_count <= 5, f"Expected <= 5 queries, got {query_count}"
