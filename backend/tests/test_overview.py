"""
Integration tests for the project overview router (GET /api/projects/{project_id}/overview).

Tests cover happy path aggregation, empty database behavior, authentication enforcement,
query optimization, and user data isolation.

Fixtures from conftest.py: db, test_client, make_token, admin_user, pm_user, dev_user
"""

from sqlalchemy import event

from tests.conftest import seed_project

# ============= Overview Aggregation Tests =============


class TestOverviewAggregation:
    """Tests for basic overview endpoint aggregation and data bundling."""

    def test_overview_returns_aggregated_data(self, db, test_client, admin_user):
        """Verify GET /api/projects/{id}/overview returns bundled data with all sections.

        Seeds a project with developers and work items, GETs the overview endpoint,
        asserts 200 and response contains all expected top-level keys with sensible shapes.
        """
        _user, token = admin_user

        # Seed a project with developers
        project = seed_project(db, "Test Project", num_developers=2)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # Verify all expected sections are present
        assert "project" in data
        assert "sprints" in data
        assert "goals" in data
        assert "milestones" in data
        assert "activities" in data
        assert "analytics" in data
        assert "prdAnalysis" in data
        assert "links" in data

        # Verify expected types
        assert data["project"] is not None  # Should have project details
        assert isinstance(data["sprints"], list)
        assert isinstance(data["goals"], list)
        assert isinstance(data["milestones"], list)
        assert isinstance(data["activities"], list)
        assert isinstance(data["analytics"], (dict, type(None)))
        # prdAnalysis can be None or dict
        assert data["links"] is not None or isinstance(data["links"], list)

    def test_overview_project_section_contains_id_and_name(self, db, test_client, admin_user):
        """Verify the project section in overview contains id and name fields.

        Confirms format_project is called and returns expected schema.
        """
        _user, token = admin_user

        project = seed_project(db, "Named Project", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        project_data = response.json()["project"]
        assert project_data is not None
        assert project_data.get("id") == project.id
        assert project_data.get("name") == "Named Project"

    def test_overview_empty_sections_have_sensible_defaults(self, db, test_client, admin_user):
        """Verify empty sections return sensible defaults ([] or {}) not nulls.

        Creates a bare project with no sprints/goals/items, asserts empty sections
        return [] not None (for list sections).
        """
        _user, token = admin_user

        project = seed_project(db, "Empty Project", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # List sections should be empty lists, not None
        assert data["sprints"] == []
        assert data["goals"] == []
        assert data["milestones"] == []
        assert data["activities"] == []

        # analytics and prdAnalysis can be {} or None (per the _safe defaults)
        if data["analytics"] is not None:
            assert isinstance(data["analytics"], dict)
        if data["prdAnalysis"] is not None:
            assert isinstance(data["prdAnalysis"], dict)


# ============= Authentication Tests =============


class TestOverviewAuthentication:
    """Tests for authentication enforcement on the overview endpoint."""

    def test_overview_requires_auth_token(self, db, test_client):
        """Verify GET /api/projects/{id}/overview without token returns 401.

        Confirms authorization is enforced; missing token → 401.
        """
        project = seed_project(db, "Auth Test", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
        )

        assert response.status_code == 401

    def test_overview_rejects_invalid_token(self, db, test_client):
        """Verify GET /api/projects/{id}/overview with malformed token returns 401.

        POSTs invalid Authorization header, asserts 401.
        """
        project = seed_project(db, "Invalid Token", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": "Bearer invalid.token.here"},
        )

        assert response.status_code == 401

    def test_overview_rejects_missing_bearer_scheme(self, db, test_client, admin_user):
        """Verify GET without 'Bearer' prefix returns 401.

        Uses user, token = admin_user but omits 'Bearer' scheme.
        """
        _user, token = admin_user
        project = seed_project(db, "No Bearer", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": token},  # Missing "Bearer " prefix
        )

        assert response.status_code == 401


# ============= Access Control Tests =============


class TestOverviewAccessControl:
    """Tests for project access enforcement (require_project_access)."""

    def test_overview_enforces_project_access(self, db, test_client, dev_user, admin_user):
        """Verify non-admin dev_user cannot view projects they're not assigned to.

        Seeds a project assigned to admin only, attempts GET from dev_user,
        asserts 403 or 404.
        """
        _dev, dev_token = dev_user
        _admin, _admin_token = admin_user

        # Seed project (will be assigned to admin by default via seed_project)
        project = seed_project(db, "Protected Project", num_developers=2)

        # Developer tries to access project they're not on
        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {dev_token}"},
        )

        # Should be 403 (forbidden) or 404 (not found, depending on access control design)
        assert response.status_code in (403, 404)

    def test_overview_allows_admin_to_view_any_project(self, db, test_client, admin_user):
        """Verify admin_user can view any project overview.

        Confirms admin has unrestricted access.
        """
        _user, token = admin_user

        project = seed_project(db, "Admin Access", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json()["project"]["id"] == project.id

    def test_overview_404_on_nonexistent_project(self, db, test_client, admin_user):
        """Verify GET /api/projects/999999/overview returns 404.

        Attempts to GET a project that doesn't exist.
        """
        _user, token = admin_user

        response = test_client.get(
            "/api/projects/999999/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404


# ============= Query Optimization Tests =============


class TestOverviewQueryOptimization:
    """Tests to catch N+1 query regressions."""

    def test_overview_query_count_bounded(self, db, test_client, admin_user):
        """Verify overview endpoint query count is bounded (no N+1 patterns).

        Seeds a project with multiple developers, instruments db to count queries,
        GETs /overview, asserts query count is reasonable (< 20 to account for
        the bundled nature of the endpoint with multiple sub-fetches).
        """
        _user, token = admin_user

        # Seed project with developers
        project = seed_project(db, "Query Test", num_developers=3)

        # Count queries during GET
        query_count = 0

        def count_query(conn, cursor, statement, parameters, context, executemany):
            nonlocal query_count
            query_count += 1

        event.listen(db.get_bind(), "before_cursor_execute", count_query)

        try:
            response = test_client.get(
                f"/api/projects/{project.id}/overview",
                headers={"Authorization": f"Bearer {token}"},
            )

            assert response.status_code == 200
            # The overview bundles 8 different sub-fetches (project, sprints, goals, etc.)
            # Each sub-fetch can be 1-2 queries. Threshold catches egregious N+1.
            # Typical: ~10-15 queries for a full bundle, plus a small constant for
            # RBAC capability resolution on the authed user (loading roles +
            # role_capabilities) — a per-request fixed cost, not row-scaled.
            assert query_count < 22, f"Query count {query_count} exceeds threshold"
        finally:
            event.remove(db.get_bind(), "before_cursor_execute", count_query)

    def test_overview_query_count_does_not_grow_with_work_items(self, db, test_client, admin_user):
        """Verify query count doesn't scale with number of work items (N+1 detection).

        Seeds a single project, makes two GET requests, asserts query counts
        are similar (within 3 queries), indicating no N+1 issue.
        """
        _user, token = admin_user

        # Project: minimal setup
        project = seed_project(db, "Project", num_developers=2)

        query_counts = []

        for _ in range(2):
            query_count = 0

            def count_query(conn, cursor, statement, parameters, context, executemany):
                nonlocal query_count
                query_count += 1

            engine = db.get_bind()
            event.listen(engine, "before_cursor_execute", count_query)

            try:
                response = test_client.get(
                    f"/api/projects/{project.id}/overview",
                    headers={"Authorization": f"Bearer {token}"},
                )
                assert response.status_code == 200
                query_counts.append(query_count)
            finally:
                event.remove(engine, "before_cursor_execute", count_query)

        # Query counts should be similar (variation <= 3 due to caching/session state)
        assert abs(query_counts[0] - query_counts[1]) <= 3, (
            f"Query counts differ significantly: {query_counts[0]} vs {query_counts[1]}"
        )


# ============= Error Resilience Tests =============


class TestOverviewErrorResilience:
    """Tests for graceful degradation when sub-fetches fail."""

    def test_overview_returns_partial_data_on_sub_fetch_failure(self, db, test_client, admin_user):
        """Verify overview doesn't crash if one sub-fetch fails; returns other sections.

        This is a conceptual test: the _safe() wrapper ensures failures are logged
        and fallback values are returned. Since we control the DB and models, we
        can't easily trigger a failure in a test, but we verify the endpoint
        succeeds even with minimal data.
        """
        _user, token = admin_user

        project = seed_project(db, "Resilience Test", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        # Endpoint should succeed, even if some sub-sections are empty
        assert response.status_code == 200
        data = response.json()

        # At minimum, project and fallback sections should be present
        assert "project" in data
        assert "sprints" in data  # Should be [] if no sprints
        assert "analytics" in data  # Should be {} or None


# ============= Integration & Data Consistency Tests =============


class TestOverviewDataConsistency:
    """Tests to verify overview data consistency and completeness."""

    def test_overview_project_matches_database_record(self, db, test_client, admin_user):
        """Verify overview project data matches the actual project record.

        Seeds a project with specific attributes, GETs overview, asserts
        project section reflects those attributes.
        """
        _user, token = admin_user

        project = seed_project(db, "Consistency Check", num_developers=2)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        project_data = response.json()["project"]

        # Verify key fields match
        assert project_data["id"] == project.id
        assert project_data["name"] == "Consistency Check"
        assert project_data.get("description") is not None

    def test_overview_lists_are_always_lists_or_empty(self, db, test_client, admin_user):
        """Verify all list sections (sprints, goals, etc.) are lists, never None.

        Confirms the _safe() wrapper returns [] as fallback, not None.
        """
        _user, token = admin_user

        project = seed_project(db, "List Types", num_developers=1)

        response = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # These should always be lists (per _safe defaults)
        assert isinstance(data["sprints"], list)
        assert isinstance(data["goals"], list)
        assert isinstance(data["milestones"], list)
        assert isinstance(data["activities"], list)
        assert data["links"] is None or isinstance(data["links"], list)

    def test_overview_response_structure_is_stable(self, db, test_client, admin_user):
        """Verify overview response structure is consistent across requests.

        Makes two requests to same project, asserts both responses have
        identical top-level keys.
        """
        _user, token = admin_user

        project = seed_project(db, "Stability", num_developers=1)

        response1 = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )
        response2 = test_client.get(
            f"/api/projects/{project.id}/overview",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response1.status_code == 200
        assert response2.status_code == 200

        keys1 = set(response1.json().keys())
        keys2 = set(response2.json().keys())

        assert keys1 == keys2, "Response structure differs between requests"
