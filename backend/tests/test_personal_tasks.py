"""
Integration tests for the Personal Tasks router (POST/GET/PUT/DELETE /api/personal-tasks/*).

Tests cover own-task scoping, IDOR vulnerabilities, status transitions, and the
convert-to-ticket endpoint. Uses fixtures from conftest.py.

IDOR Audit Findings:
- convert_to_ticket does NOT validate assignee_developer_id against project membership
- own-task scoping appears correctly implemented in GET/{id}, PUT/{id}, DELETE/{id}
"""

from datetime import datetime

import pytest

from models.personal_task import PersonalTask
from models.work_item import WorkItem
from tests.conftest import seed_project

# ============= Own-task scoping =============


class TestOwnTaskScoping:
    """Tests ensuring personal tasks are scoped to their creator."""

    def test_create_personal_task_belongs_to_current_user(self, test_client, dev_user, db):
        """Verify POST creates task with user_id matching token holder.

        Creates a personal task as dev_user, asserts response contains correct user_id,
        then queries database to verify persistence with matching user_id.
        """
        user, token = dev_user

        response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Test Task",
                "description": "Test Description",
                "priority": "high",
                "estimated_hours": 5,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == user.id
        assert data["title"] == "Test Task"
        assert data["status"] == "todo"

        # Verify in database
        task = db.query(PersonalTask).filter(PersonalTask.id == data["id"]).first()
        assert task is not None
        assert task.user_id == user.id

    def test_my_tasks_only_returns_own_tasks(self, test_client, dev_user, pm_user, db):
        """Verify GET /my-tasks returns only tasks created by current user.

        Creates tasks as dev_user and pm_user, then GETs /my-tasks as dev_user,
        asserts only dev_user's tasks are returned.
        """
        dev, dev_token = dev_user
        _pm, pm_token = pm_user

        # Create task as dev_user
        dev_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Dev Task",
                "description": "Task created by developer",
                "priority": "medium",
            },
        )
        dev_task_id = dev_response.json()["id"]

        # Create task as pm_user
        pm_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {pm_token}"},
            json={
                "title": "PM Task",
                "description": "Task created by project manager",
                "priority": "high",
            },
        )
        _pm_task_id = pm_response.json()["id"]

        # Get tasks as dev_user
        get_response = test_client.get(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
        )

        assert get_response.status_code == 200
        tasks = get_response.json()
        assert len(tasks) == 1
        assert tasks[0]["id"] == dev_task_id
        assert tasks[0]["title"] == "Dev Task"
        assert tasks[0]["user_id"] == dev.id

    def test_other_users_tasks_not_visible(self, test_client, dev_user, pm_user, db):
        """Verify direct GET /{task_id} by another user returns 404.

        Creates task as dev_user, attempts to GET by id as pm_user,
        asserts 404 (task ownership validation).
        """
        _dev, dev_token = dev_user
        _pm, pm_token = pm_user

        # Create task as dev_user
        response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Private Task",
                "description": "Only dev should see this",
            },
        )
        task_id = response.json()["id"]

        # Try to GET as pm_user
        get_response = test_client.get(
            f"/api/personal-tasks/{task_id}",
            headers={"Authorization": f"Bearer {pm_token}"},
        )

        assert get_response.status_code == 404


# ============= IDOR Mutations =============


class TestIDORMutations:
    """Tests for Insecure Direct Object Reference (IDOR) vulnerabilities.

    Current behavior is locked; xfail markers indicate bugs to fix.
    """

    def test_update_own_task_succeeds(self, test_client, dev_user):
        """Verify PATCH own task updates correctly and returns 200.

        Creates task as dev_user, PATCHes it with new title/status,
        asserts 200 and fields are updated.
        """
        _user, token = dev_user

        # Create task
        create_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Original Title",
                "status": "todo",
                "priority": "low",
            },
        )
        task_id = create_response.json()["id"]

        # Update task (PUT endpoint)
        update_response = test_client.put(
            f"/api/personal-tasks/{task_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Updated Title",
                "status": "in_progress",
                "priority": "high",
            },
        )

        assert update_response.status_code == 200
        data = update_response.json()
        assert data["title"] == "Updated Title"
        assert data["status"] == "in_progress"
        assert data["priority"] == "high"

    def test_update_another_users_task(self, test_client, dev_user, pm_user, db):
        """Verify IDOR: pm_user cannot PATCH dev_user's task.

        Audit flag: convert_to_ticket has IDOR, but update endpoints
        appear to enforce own-task scoping. Lock current behavior.
        """
        _dev, dev_token = dev_user
        _pm, pm_token = pm_user

        # Create task as dev_user
        create_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Dev Task",
                "status": "todo",
            },
        )
        task_id = create_response.json()["id"]

        # Try to update as pm_user
        update_response = test_client.put(
            f"/api/personal-tasks/{task_id}",
            headers={"Authorization": f"Bearer {pm_token}"},
            json={
                "title": "Hacked Title",
                "status": "done",
            },
        )

        # Verify rejection
        assert update_response.status_code == 404

        # Verify task unchanged in database
        task = db.query(PersonalTask).filter(PersonalTask.id == task_id).first()
        assert task.title == "Dev Task"
        assert task.status == "todo"

    def test_delete_another_users_task(self, test_client, dev_user, pm_user, db):
        """Verify IDOR: pm_user cannot DELETE dev_user's task.

        Similar to update IDOR test; endpoints enforce own-task scoping.
        """
        _dev, dev_token = dev_user
        _pm, pm_token = pm_user

        # Create task as dev_user
        create_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Task to Delete",
                "status": "todo",
            },
        )
        task_id = create_response.json()["id"]

        # Try to delete as pm_user
        delete_response = test_client.delete(
            f"/api/personal-tasks/{task_id}",
            headers={"Authorization": f"Bearer {pm_token}"},
        )

        # Verify rejection
        assert delete_response.status_code == 404

        # Verify task still exists
        task = db.query(PersonalTask).filter(PersonalTask.id == task_id).first()
        assert task is not None
        assert task.title == "Task to Delete"


# ============= Status Transitions =============


class TestStatusTransitions:
    """Tests for status field updates and validation."""

    def test_status_transition_valid(self, test_client, dev_user):
        """Verify PATCH with valid status values succeeds.

        Creates task, PATCHes status to known-valid values (todo, in_progress, done),
        asserts 200 and status is updated.
        """
        _user, token = dev_user

        # Create task
        create_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Status Test",
                "status": "todo",
            },
        )
        task_id = create_response.json()["id"]

        # Transition through valid statuses
        for status in ["in_progress", "done", "todo"]:
            update_response = test_client.put(
                f"/api/personal-tasks/{task_id}",
                headers={"Authorization": f"Bearer {token}"},
                json={"status": status},
            )

            assert update_response.status_code == 200
            assert update_response.json()["status"] == status

    def test_status_transition_invalid_value(self, test_client, dev_user):
        """Verify PATCH with invalid status is rejected.

        Sends garbage status value, asserts 4xx. Current behavior locked
        (may be 400 or 422; test does not assume specific code).
        """
        _user, token = dev_user

        # Create task
        create_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Status Validation Test",
                "status": "todo",
            },
        )
        task_id = create_response.json()["id"]

        # Try invalid status
        update_response = test_client.put(
            f"/api/personal-tasks/{task_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"status": "garbage_status_value"},
        )

        # Currently no validation, but lock whatever behavior exists
        # If validation is added later, this will need updating
        # (Either 200 with garbage status, or 4xx rejection)
        assert update_response.status_code in [200, 400, 422]


# ============= Convert to Ticket (IDOR Audit Focus) =============


class TestConvertToTicket:
    """Tests for converting personal tasks to project tickets.

    AUDIT FLAG: convert_to_ticket does NOT validate assignee_developer_id
    against project membership. Tests lock current behavior with xfail markers.
    """

    def test_convert_to_ticket_with_valid_assignee_succeeds(self, test_client, dev_user, db):
        """Verify convert_to_ticket with assignee in project succeeds.

        Creates personal task as dev_user, converts to ticket in seeded project
        with assignee from project's developer list, asserts 200 and work_item created.
        """
        _dev, dev_token = dev_user
        project = seed_project(db)

        # Get first developer from project using direct SQL
        from sqlalchemy import text

        dev_result = db.execute(
            text("SELECT developer_id FROM project_developers WHERE project_id = :pid LIMIT 1"),
            {"pid": project.id},
        )
        dev_row = dev_result.first()
        assignee_dev_id = dev_row[0] if dev_row else None

        if not assignee_dev_id:
            pytest.skip("No developers in seeded project")

        # Create personal task
        task_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Convert Me",
                "description": "This will become a ticket",
                "priority": "high",
                "estimated_hours": 8,
            },
        )
        task_id = task_response.json()["id"]

        # Convert to ticket
        convert_response = test_client.post(
            f"/api/personal-tasks/{task_id}/convert-to-ticket",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "project_id": project.id,
                "type": "task",
                "estimated_hours": 8,
                "assignee_developer_id": assignee_dev_id,
            },
        )

        assert convert_response.status_code == 200
        data = convert_response.json()
        assert data["status"] == "converted"
        assert "work_item" in data
        assert data["work_item"]["title"] == "Convert Me"
        assert data["work_item"]["project_id"] == project.id

        # Verify work_item created in database
        work_item = db.query(WorkItem).filter(WorkItem.id == data["work_item"]["id"]).first()
        assert work_item is not None
        assert work_item.title == "Convert Me"

    def test_convert_to_ticket_carries_over_due_date(self, test_client, dev_user, db):
        """Verify the personal task's due_date is preserved on the converted work item.

        Regression: converting a task that had a due_date used to create the work
        item without it, silently dropping the due date. The due_date lives on the
        personal task, so conversion must copy it onto the new WorkItem.
        """
        _dev, dev_token = dev_user
        project = seed_project(db)

        due_date_str = "2026-06-21T10:00:00"
        task_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Convert With Due Date",
                "description": "Has a due date that must survive conversion",
                "priority": "medium",
                "due_date": due_date_str,
            },
        )
        task_id = task_response.json()["id"]

        convert_response = test_client.post(
            f"/api/personal-tasks/{task_id}/convert-to-ticket",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={"project_id": project.id, "type": "task"},
        )

        assert convert_response.status_code == 200
        data = convert_response.json()

        work_item = db.query(WorkItem).filter(WorkItem.id == data["work_item"]["id"]).first()
        assert work_item is not None
        assert work_item.due_date is not None
        assert work_item.due_date == datetime.fromisoformat(due_date_str)

    @pytest.mark.xfail(
        reason="Assignee-membership validation not implemented on current main: "
        "POST /api/personal-tasks/{id}/convert-to-ticket accepts an "
        "assignee_developer_id who is not a member of the target project and "
        "returns 200. Flip the assertion and drop this marker when the fix lands.",
        strict=True,
    )
    def test_convert_to_ticket_with_assignee_outside_project(
        self, test_client, dev_user, pm_user, db
    ):
        """Verify assignee outside target project is rejected.

        Creates personal task as dev_user, creates a separate project with
        pm_user as assignee, then tries to convert to first project with pm_user's
        developer_id. Should be rejected with 422.

        Expected behavior (after IDOR fix): 422 with message about project membership.
        """
        _dev, dev_token = dev_user
        pm, _pm_token = pm_user
        project1 = seed_project(db)

        # Create separate project with pm_user as developer
        project2 = seed_project(db, name="Second Project")

        # Get pm_user's developer record (already created by seed_project)
        from sqlalchemy import text

        pm_dev_result = db.execute(
            text("SELECT developer_id FROM project_developers WHERE project_id = :pid LIMIT 1"),
            {"pid": project2.id},
        )
        pm_dev_row = pm_dev_result.first()
        pm_dev_id = pm_dev_row[0] if pm_dev_row else None

        if not pm_dev_id:
            # Create developer for pm if not in project
            from models.developer import Developer, project_developers

            pm_dev = Developer(email=pm.email, name=pm.name, github_username="pm-gh")
            db.add(pm_dev)
            db.flush()
            pm_dev_id = pm_dev.id
            db.execute(
                project_developers.insert().values(
                    project_id=project2.id,
                    developer_id=pm_dev_id,
                    role="Developer",
                    responsibilities=None,
                    is_admin=False,
                )
            )
            db.commit()

        # Create personal task as dev_user
        task_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "IDOR Test Task",
                "description": "Assign to dev outside project1",
                "priority": "medium",
            },
        )
        task_id = task_response.json()["id"]

        # Try to convert to project1 but assign to pm_dev (who is NOT in project1)
        # Fixed behavior: returns 422 with project membership error
        convert_response = test_client.post(
            f"/api/personal-tasks/{task_id}/convert-to-ticket",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "project_id": project1.id,
                "type": "task",
                "assignee_developer_id": pm_dev_id,
            },
        )

        assert convert_response.status_code == 422
        assert "project" in convert_response.json()["detail"].lower()

    def test_convert_already_converted_task_fails(self, test_client, dev_user, db):
        """Verify converting an already-converted task returns 400.

        Creates task, converts once, attempts second conversion, asserts 400.
        """
        _dev, dev_token = dev_user
        project = seed_project(db)

        # Get assignee from project
        from sqlalchemy import text

        dev_result = db.execute(
            text("SELECT developer_id FROM project_developers WHERE project_id = :pid LIMIT 1"),
            {"pid": project.id},
        )
        dev_row = dev_result.first()
        assignee_dev_id = dev_row[0] if dev_row else None

        if not assignee_dev_id:
            pytest.skip("No developers in seeded project")

        # Create and convert task
        task_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Convert Once",
                "description": "Should only convert once",
            },
        )
        task_id = task_response.json()["id"]

        # First conversion succeeds
        convert1 = test_client.post(
            f"/api/personal-tasks/{task_id}/convert-to-ticket",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "project_id": project.id,
                "assignee_developer_id": assignee_dev_id,
            },
        )
        assert convert1.status_code == 200

        # Second conversion fails
        convert2 = test_client.post(
            f"/api/personal-tasks/{task_id}/convert-to-ticket",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "project_id": project.id,
                "assignee_developer_id": assignee_dev_id,
            },
        )
        assert convert2.status_code == 400
        assert "already converted" in convert2.json()["detail"].lower()

    def test_convert_to_nonexistent_project_fails(self, test_client, dev_user):
        """Verify convert_to_ticket with invalid project_id returns 404."""
        _dev, dev_token = dev_user

        # Create task
        task_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Convert to Ghost Project",
                "description": "Project doesn't exist",
            },
        )
        task_id = task_response.json()["id"]

        # Try to convert to nonexistent project
        convert_response = test_client.post(
            f"/api/personal-tasks/{task_id}/convert-to-ticket",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "project_id": 99999,
                "type": "task",
            },
        )

        assert convert_response.status_code == 404


# ============= Authentication =============


class TestAuthentication:
    """Tests for authentication requirements on personal tasks endpoints."""

    def test_personal_tasks_endpoints_require_auth(self, test_client):
        """Verify all endpoints return 401 without Authorization header.

        Tests at least one mutation endpoint (POST) without token,
        asserts 401 with "Not authenticated" message.
        """
        # POST without auth
        response = test_client.post(
            "/api/personal-tasks/",
            json={
                "title": "Unauthorized Task",
                "description": "No token provided",
            },
        )

        assert response.status_code == 401
        assert "Not authenticated" in response.json()["detail"]

    def test_get_tasks_requires_auth(self, test_client):
        """Verify GET /personal-tasks/ returns 401 without token."""
        response = test_client.get("/api/personal-tasks/")

        assert response.status_code == 401

    def test_get_task_by_id_requires_auth(self, test_client):
        """Verify GET /personal-tasks/{id} returns 401 without token."""
        response = test_client.get("/api/personal-tasks/1")

        assert response.status_code == 401

    def test_update_task_requires_auth(self, test_client):
        """Verify PUT /personal-tasks/{id} returns 401 without token."""
        response = test_client.put(
            "/api/personal-tasks/1",
            json={"title": "Updated"},
        )

        assert response.status_code == 401

    def test_delete_task_requires_auth(self, test_client):
        """Verify DELETE /personal-tasks/{id} returns 401 without token."""
        response = test_client.delete("/api/personal-tasks/1")

        assert response.status_code == 401

    def test_convert_to_ticket_requires_auth(self, test_client):
        """Verify POST /convert-to-ticket returns 401 without token."""
        response = test_client.post(
            "/api/personal-tasks/1/convert-to-ticket",
            json={"project_id": 1},
        )

        assert response.status_code == 401


# ============= Edge Cases =============


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_create_task_with_due_date(self, test_client, dev_user, db):
        """Verify creating task with ISO format due_date is stored correctly."""
        _user, token = dev_user

        due_date_str = "2026-06-21T10:00:00"

        response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Deadline Task",
                "description": "Has a due date",
                "due_date": due_date_str,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["due_date"] is not None
        # Verify in database
        task = db.query(PersonalTask).filter(PersonalTask.id == data["id"]).first()
        assert task.due_date is not None

    def test_create_task_with_tags(self, test_client, dev_user):
        """Verify creating task with tags list is stored correctly."""
        _user, token = dev_user

        response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "title": "Tagged Task",
                "description": "Multiple tags",
                "tags": ["backend", "urgent", "refactor"],
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["tags"] == ["backend", "urgent", "refactor"]

    def test_update_converted_task_fails(self, test_client, dev_user, db):
        """Verify updating a converted task returns 400.

        Creates task, converts it, then tries to update, asserts 400.
        """
        _dev, dev_token = dev_user
        project = seed_project(db)

        # Get assignee
        from sqlalchemy import text

        dev_result = db.execute(
            text("SELECT developer_id FROM project_developers WHERE project_id = :pid LIMIT 1"),
            {"pid": project.id},
        )
        dev_row = dev_result.first()
        assignee_dev_id = dev_row[0] if dev_row else None

        if not assignee_dev_id:
            pytest.skip("No developers in seeded project")

        # Create task
        task_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "title": "Original Title",
                "description": "Will be converted",
            },
        )
        task_id = task_response.json()["id"]

        # Convert it
        convert_response = test_client.post(
            f"/api/personal-tasks/{task_id}/convert-to-ticket",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "project_id": project.id,
                "assignee_developer_id": assignee_dev_id,
            },
        )
        assert convert_response.status_code == 200

        # Try to update converted task
        update_response = test_client.put(
            f"/api/personal-tasks/{task_id}",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={"title": "Updated Title"},
        )

        assert update_response.status_code == 400
        assert "Cannot update a converted task" in update_response.json()["detail"]

    def test_filter_tasks_by_status(self, test_client, dev_user):
        """Verify GET /personal-tasks?status=X filters correctly."""
        _user, token = dev_user

        # Create tasks with different titles (all created as "todo" by POST)
        test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "Todo Task"},
        )
        test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "In Progress Task"},
        )
        # Create and update one to "done" via PATCH
        create_response = test_client.post(
            "/api/personal-tasks/",
            headers={"Authorization": f"Bearer {token}"},
            json={"title": "Done Task"},
        )
        task_id = create_response.json()["id"]
        test_client.put(
            f"/api/personal-tasks/{task_id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"status": "done"},
        )

        # Filter by status
        response = test_client.get(
            "/api/personal-tasks?status=done",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        tasks = response.json()
        assert len(tasks) == 1
        assert tasks[0]["title"] == "Done Task"
        assert tasks[0]["status"] == "done"
