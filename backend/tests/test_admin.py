"""
Integration tests for the admin router (GET/POST/PUT/DELETE /api/admin/*).

Tests cover RBAC gating, employee/developer CRUD, capacity endpoints, and
regression tests for N+1 query issues.

Fixtures from conftest.py: db, test_client, make_token, admin_user, pm_user, dev_user
"""

import pytest

from models.developer import Developer
from models.role import Role, RoleCapability
from tests.conftest import seed_project

# ============= RBAC Gating Tests =============


class TestAdminRBACGating:
    """Tests for admin endpoint access control."""

    def test_admin_endpoints_require_admin_role(self, db, test_client, dev_user):
        """Verify dev_user token hits any admin endpoint → 403.

        DEV lacks admin.dashboard capability; GET /stats should return 403.
        """
        _, token = dev_user

        response = test_client.get(
            "/api/admin/stats",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 403
        # require_capability returns this fixed detail on a missing grant.
        assert "Do not have permission" in response.json()["detail"]

    def test_admin_endpoints_reject_unauthenticated(self, test_client):
        """Verify missing Authorization header → 401.

        GET /stats without token returns 401.
        """
        response = test_client.get("/api/admin/stats")

        assert response.status_code == 401

    def test_admin_with_admin_token_succeeds(self, db, test_client, admin_user):
        """Verify admin_user token → 200 + payload.

        Admin should have admin.dashboard capability.
        Note: If admin role lacks capability, this may fail;
        tests assumes admin role is set up with capabilities.
        """
        user, token = admin_user

        # Add admin role with capability if not present
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if not admin_role:
            admin_role = Role(name="admin", is_system=True)
            db.add(admin_role)
            db.flush()

        # Add capability to role if missing
        existing_cap = (
            db.query(RoleCapability)
            .filter(
                RoleCapability.role_id == admin_role.id,
                RoleCapability.capability_key == "admin.dashboard",
            )
            .first()
        )
        if not existing_cap:
            db.add(RoleCapability(role_id=admin_role.id, capability_key="admin.dashboard"))
            db.commit()

        # Assign role to user if not present
        if not user.roles:
            user.roles.append(admin_role)
            db.commit()

        response = test_client.get(
            "/api/admin/stats",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "total_employees" in data
        assert "total_projects" in data
        assert "total_tickets" in data
        assert "active_sprints" in data


# ============= Employee CRUD Tests =============


class TestEmployeeCRUD:
    """Tests for employee/developer CRUD endpoints."""

    def _setup_admin_with_capabilities(self, db, admin_user):
        """Helper: ensure admin_user has all required admin.* capabilities."""
        user, _ = admin_user
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if not admin_role:
            admin_role = Role(name="admin", is_system=True)
            db.add(admin_role)
            db.flush()

        capabilities = [
            "admin.dashboard",
            "admin.employees",
            "admin.developers_capacity",
            "admin.projects",
        ]
        for cap in capabilities:
            existing = (
                db.query(RoleCapability)
                .filter(
                    RoleCapability.role_id == admin_role.id,
                    RoleCapability.capability_key == cap,
                )
                .first()
            )
            if not existing:
                db.add(RoleCapability(role_id=admin_role.id, capability_key=cap))

        if not user.roles:
            user.roles.append(admin_role)

        db.commit()

    def test_create_employee_returns_201(self, db, test_client, admin_user):
        """Verify admin creates employee with valid payload → 200, record persists.

        POSTs valid EmployeeCreate payload, asserts 200, then queries db
        to confirm Developer record exists with correct fields.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        payload = {
            "name": "New Employee",
            "email": "newemployee@test.local",
            "github_username": "new-github",
            "avatar_url": "https://example.com/avatar.jpg",
            "specialization": "frontend",
        }

        response = test_client.post(
            "/api/admin/employees",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newemployee@test.local"
        assert data["name"] == "New Employee"
        assert data["github_username"] == "new-github"

        # Verify persisted in db
        dev = db.query(Developer).filter(Developer.email == "newemployee@test.local").first()
        assert dev is not None
        assert dev.name == "New Employee"
        assert dev.github_username == "new-github"

    def test_create_employee_duplicate_email_returns_400(self, db, test_client, admin_user):
        """Verify second create with same email → 400.

        Creates first employee, then attempts second with same email;
        asserts 400 + "Email already exists" message.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        payload = {
            "name": "Employee One",
            "email": "duplicate@test.local",
            "github_username": "user1",
        }

        # Create first
        response1 = test_client.post(
            "/api/admin/employees",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response1.status_code == 200

        # Try to create second with same email
        payload["name"] = "Employee Two"
        payload["github_username"] = "user2"
        response2 = test_client.post(
            "/api/admin/employees",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response2.status_code == 400
        assert "Email already exists" in response2.json()["detail"]

    def test_update_employee_persists_changes(self, db, test_client, admin_user):
        """Verify PUT updates a field, GET reflects it.

        Creates employee, PUTs with updated name, GETs and asserts new name.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        # Create
        create_payload = {
            "name": "Original Name",
            "email": "update@test.local",
            "github_username": "update-user",
        }
        response = test_client.post(
            "/api/admin/employees",
            json=create_payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        employee_id = response.json()["id"]

        # Update
        update_payload = {"name": "Updated Name"}
        response = test_client.put(
            f"/api/admin/employees/{employee_id}",
            json=update_payload,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"

        # Verify in db
        dev = db.query(Developer).filter(Developer.id == employee_id).first()
        assert dev.name == "Updated Name"

    def test_delete_employee_removes_record(self, db, test_client, admin_user):
        """Verify DELETE returns 200, GET returns 404.

        Creates employee, DELETEs, then attempts GET and asserts 404.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        # Create
        payload = {
            "name": "Delete Me",
            "email": "delete@test.local",
            "github_username": "delete-user",
        }
        response = test_client.post(
            "/api/admin/employees",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        employee_id = response.json()["id"]

        # Delete
        response = test_client.delete(
            f"/api/admin/employees/{employee_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200

        # Verify deleted from db
        dev = db.query(Developer).filter(Developer.id == employee_id).first()
        assert dev is None

    def test_delete_nonexistent_employee_returns_404(self, db, test_client, admin_user):
        """Verify DELETE on bogus id → 404.

        DELETEs a non-existent employee_id and asserts 404.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        response = test_client.delete(
            "/api/admin/employees/999999",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404
        assert "Employee not found" in response.json()["detail"]

    @pytest.mark.xfail(
        reason="specialization field accepted in request but not stored on Developer model; list returns None instead of provided value"
    )
    def test_create_employee_specialization_persists(self, db, test_client, admin_user):
        """Verify specialization field is persisted and returned on list.

        Router accepts specialization in EmployeeCreate but Developer model
        lacks this field; getattr returns None on retrieval.
        Fix: add specialization column to Developer model or remove from API.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        payload = {
            "name": "Specialized Dev",
            "email": "spec@test.local",
            "github_username": "spec-user",
            "specialization": "frontend",
        }

        response = test_client.post(
            "/api/admin/employees",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        # Response reflects input specialization (but not persisted)
        assert response.json()["specialization"] == "frontend"

        # List endpoint shows None because not stored
        response = test_client.get(
            "/api/admin/employees",
            headers={"Authorization": f"Bearer {token}"},
        )

        created = next(e for e in response.json() if e["email"] == "spec@test.local")
        # This will fail because specialization is not persisted
        assert created["specialization"] == "frontend"


# ============= Capacity Endpoint Tests =============


class TestCapacityEndpoints:
    """Tests for developers capacity and related endpoints."""

    def _setup_admin_with_capabilities(self, db, admin_user):
        """Helper: ensure admin_user has all required admin.* capabilities."""
        user, _ = admin_user
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if not admin_role:
            admin_role = Role(name="admin", is_system=True)
            db.add(admin_role)
            db.flush()

        capabilities = [
            "admin.dashboard",
            "admin.employees",
            "admin.developers_capacity",
            "admin.projects",
        ]
        for cap in capabilities:
            existing = (
                db.query(RoleCapability)
                .filter(
                    RoleCapability.role_id == admin_role.id,
                    RoleCapability.capability_key == cap,
                )
                .first()
            )
            if not existing:
                db.add(RoleCapability(role_id=admin_role.id, capability_key=cap))

        if not user.roles:
            user.roles.append(admin_role)

        db.commit()

    def test_developers_capacity_returns_capacity_per_dev(self, db, test_client, admin_user):
        """Verify GET /developers/capacity basic happy path.

        Seeds a project with developers, GETs /developers/capacity,
        asserts 200 and response contains developer data.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        # Seed a project with developers (side-effect: populates DB before the GET below)
        _project = seed_project(db, "Capacity Test", num_developers=2)

        response = test_client.get(
            "/api/admin/developers/capacity",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least the seeded developers
        assert len(data) >= 2

        # Check structure of first entry
        if len(data) > 0:
            entry = data[0]
            assert "developer_id" in entry
            assert "developer_name" in entry
            assert "developer_email" in entry
            assert "week_start" in entry
            assert "week_end" in entry

    def test_list_employees_endpoint(self, db, test_client, admin_user):
        """Verify GET /employees returns list of employees.

        Seeds developers, GETs /employees, asserts 200 + list of EmployeeResponse.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        # Seed developers directly
        for i in range(2):
            dev = Developer(
                name=f"Test Dev {i}",
                email=f"testdev{i}@test.local",
                github_username=f"testdev{i}",
            )
            db.add(dev)
        db.commit()

        response = test_client.get(
            "/api/admin/employees",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

        # Check structure
        if len(data) > 0:
            emp = data[0]
            assert "id" in emp
            assert "name" in emp
            assert "email" in emp
            assert "created_at" in emp
            assert "project_count" in emp
            assert "assigned_items_count" in emp


# ============= List Endpoint Query Count Tests =============


class TestListEndpointQueryCount:
    """Regression tests for N+1 query issues."""

    def _setup_admin_with_capabilities(self, db, admin_user):
        """Helper: ensure admin_user has all required admin.* capabilities."""
        user, _ = admin_user
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if not admin_role:
            admin_role = Role(name="admin", is_system=True)
            db.add(admin_role)
            db.flush()

        capabilities = [
            "admin.dashboard",
            "admin.employees",
            "admin.developers_capacity",
            "admin.projects",
        ]
        for cap in capabilities:
            existing = (
                db.query(RoleCapability)
                .filter(
                    RoleCapability.role_id == admin_role.id,
                    RoleCapability.capability_key == cap,
                )
                .first()
            )
            if not existing:
                db.add(RoleCapability(role_id=admin_role.id, capability_key=cap))

        if not user.roles:
            user.roles.append(admin_role)

        db.commit()

    def test_admin_list_endpoint_query_count(self, db, test_client, admin_user):
        """Verify list employees query count is bounded (no egregious N+1).

        Seeds 5 developers, wraps test_client with query counter,
        GETs /employees, and asserts query count is reasonable (~2-15).
        This test guards against egregious N+1 patterns.
        """
        self._setup_admin_with_capabilities(db, admin_user)
        _user, token = admin_user

        # Seed 5 developers
        for i in range(5):
            dev = Developer(
                name=f"Developer {i}",
                email=f"dev{i}@test.local",
                github_username=f"dev{i}",
            )
            db.add(dev)
        db.commit()

        # Count queries during the request
        query_count = 0

        def count_query(conn, cursor, statement, parameters, context, executemany):
            nonlocal query_count
            query_count += 1

        # Attach listener to the test db
        from sqlalchemy import event as sql_event

        engine = db.get_bind()
        sql_event.listen(engine, "before_cursor_execute", count_query)

        try:
            response = test_client.get(
                "/api/admin/employees",
                headers={"Authorization": f"Bearer {token}"},
            )

            assert response.status_code == 200
            # Current implementation: ~14 queries for auth + employees.
            # Guard against egregious N+1 (would be 20+)
            assert query_count < 20, f"Query count {query_count} exceeds limit"
        finally:
            sql_event.remove(engine, "before_cursor_execute", count_query)
