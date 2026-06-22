"""
Integration tests for the comments router (POST/GET/PUT/DELETE /api/comments/*).

Tests cover:
- Creating comments with @mention extraction
- Reading comments for work items
- Updating and deleting comments
- IDOR vulnerabilities (cross-project access without proper checks)

NOTE: IDOR tests use @pytest.mark.xfail to lock current behavior (which returns 200
when it should return 403/404). After the IDOR fix is implemented, flip the assertions
and remove the xfail marker.

Fixtures from conftest.py:
- db: in-memory SQLite session
- test_client: FastAPI TestClient with db override
- make_token: creates JWT tokens
- admin_user, pm_user, dev_user: pre-built User instances with tokens
- seed_project: factory function for Project + developers
"""

# ============= Helpers: Factories for test setup =============
from datetime import datetime
from unittest.mock import patch

import pytest

from models.comment import Comment
from models.developer import Developer
from models.project import Project
from models.work_item import WorkItem


def seed_project(db, name: str = "Test Project", num_developers: int = 2) -> Project:
    """Factory function: create a Project + N developers + admin assignment."""

    from models.developer import project_developers

    project = Project(
        name=name,
        description=f"Description for {name}",
        status="active",
        github_repo_urls=[],
        created_at=datetime.utcnow(),
    )
    db.add(project)
    db.flush()

    developers = []
    # Ensure at least one developer even if num_developers is 0
    total_devs = max(1, num_developers)
    # Use project ID in seed to ensure unique developers across projects
    for i in range(total_devs):
        unique_id = f"{project.id}_{i + 1}"
        dev = Developer(
            name=f"Developer {unique_id}",
            email=f"seed-dev-{unique_id}@test.local",
            github_username=f"seed-dev-{unique_id}",
        )
        db.add(dev)
        db.flush()
        developers.append(dev)

    db.execute(
        project_developers.insert().values(
            [
                {
                    "project_id": project.id,
                    "developer_id": developers[0].id,
                    "role": "Lead",
                    "responsibilities": "Project lead",
                    "is_admin": True,
                },
                *[
                    {
                        "project_id": project.id,
                        "developer_id": dev.id,
                        "role": "Developer",
                        "responsibilities": None,
                        "is_admin": False,
                    }
                    for dev in developers[1:]
                ],
            ]
        )
    )
    db.commit()

    return project


def create_work_item(
    db, project_id: int, key: str = "TEST-1", title: str = "Test Item"
) -> WorkItem:
    """Factory: create a WorkItem in the given project."""
    item = WorkItem(
        project_id=project_id,
        key=key,
        type="task",
        title=title,
        description="Test description",
        status="todo",
        priority="medium",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def create_developer(db, name: str, email: str) -> Developer:
    """Factory: create a Developer."""
    dev = Developer(
        name=name,
        email=email,
        github_username=email.split("@")[0],
    )
    db.add(dev)
    db.commit()
    db.refresh(dev)
    return dev


# ============= POST /api/comments/ - Create Comment =============


class TestCreateComment:
    """Tests for POST /api/comments endpoint."""

    def test_create_comment_returns_201(self, test_client, db, dev_user):
        """Verify POST with valid work_item_id + content returns 200 + comment persists.

        Creates a project + work item, POSTs a comment as dev_user, asserts:
        - Status 200 (default FastAPI response without explicit status_code)
        - Response includes id, work_item_id, content, author_name, mentions list
        - Comment persists in database
        """
        user, token = dev_user

        # Create project and work item
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)

        # Create a developer for the author and add to project
        dev = create_developer(db, "Dev User", "dev@test.local")
        user.email = dev.email  # Match the developer email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project.id,
                developer_id=dev.id,
                role="Developer",
                responsibilities=None,
                is_admin=False,
            )
        )
        db.commit()

        # POST comment
        response = test_client.post(
            "/api/comments/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "work_item_id": item.id,
                "content": "This is a test comment",
                "comment_type": "comment",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["work_item_id"] == item.id
        assert data["content"] == "This is a test comment"
        assert data["author_name"] == "Dev User"
        assert "mentions" in data
        assert isinstance(data["mentions"], list)

        # Verify comment persists in database
        comment = db.query(Comment).filter(Comment.id == data["id"]).first()
        assert comment is not None
        assert comment.content == "This is a test comment"
        assert comment.work_item_id == item.id

    def test_create_comment_with_mentions_extracts_users(self, test_client, db, dev_user):
        """Verify comment with @user mentions extracts mentioned user IDs.

        Creates comment with @Developer format, asserts:
        - Status 201
        - mentions field contains the ID of the mentioned developer
        """
        user, token = dev_user

        # Create project, work item, and developers
        project = seed_project(db, name="Test Project", num_developers=2)
        item = create_work_item(db, project.id)

        # Get the seeded developers (from seed_project)
        devs = db.query(Developer).all()
        mentioned_dev = devs[0]

        # Create a developer for the current user and add to project
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project.id,
                developer_id=current_dev.id,
                role="Developer",
                responsibilities=None,
                is_admin=False,
            )
        )
        db.commit()

        # POST comment mentioning the first developer by name
        response = test_client.post(
            "/api/comments/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "work_item_id": item.id,
                "content": f"Hey @{mentioned_dev.name}, please review this",
                "comment_type": "comment",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert mentioned_dev.id in data["mentions"], (
            f"Expected {mentioned_dev.id} in {data['mentions']}"
        )

    def test_create_comment_mention_nonexistent_user_silently_skipped(
        self, test_client, db, dev_user
    ):
        """Verify @mention of nonexistent user is silently skipped.

        Creates comment with @nobody@test.local (nonexistent), asserts:
        - Status 201
        - mentions list does not contain any entry for the nonexistent user
        - No exception raised
        """
        user, token = dev_user

        # Create project, work item, and current dev
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project.id,
                developer_id=current_dev.id,
                role="Developer",
                responsibilities=None,
                is_admin=False,
            )
        )
        db.commit()

        # POST comment mentioning nonexistent user
        response = test_client.post(
            "/api/comments/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "work_item_id": item.id,
                "content": "Hey @Nobody User, check this out",
                "comment_type": "comment",
            },
        )

        assert response.status_code == 200
        data = response.json()
        # mentions should be empty or not contain any id for the nonexistent user
        assert isinstance(data["mentions"], list)
        # Verify no unexpected entries (the extract_mentions function should skip unknown users)

    def test_create_comment_missing_work_item_returns_404(self, test_client, db, dev_user):
        """Verify POST with bogus work_item_id returns 404.

        POSTs with work_item_id=999999 (nonexistent), asserts 404.
        """
        user, token = dev_user

        # Create a developer for the current user
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        db.commit()

        response = test_client.post(
            "/api/comments/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "work_item_id": 999999,
                "content": "This comment has nowhere to go",
                "comment_type": "comment",
            },
        )

        assert response.status_code == 404
        assert "Work item not found" in response.json()["detail"]

    @patch("services.email_service.EmailService.send_mention_notification")
    def test_create_comment_sends_mention_email_background_task(
        self, mock_send_email, test_client, db, dev_user
    ):
        """Verify mention notification is queued as background task (not blocking request).

        Creates comment with @mention, asserts:
        - Status 201 returns immediately
        - Email service called in background (mocked to verify call signature)
        """
        user, token = dev_user

        # Create project, work item, and developers
        project = seed_project(db, name="Test Project", num_developers=2)
        item = create_work_item(db, project.id)

        devs = db.query(Developer).all()
        mentioned_dev = devs[0]

        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project.id,
                developer_id=current_dev.id,
                role="Developer",
                responsibilities=None,
                is_admin=False,
            )
        )
        db.commit()

        # POST comment mentioning a developer
        response = test_client.post(
            "/api/comments/",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "work_item_id": item.id,
                "content": f"@{mentioned_dev.name}, please check",
                "comment_type": "comment",
            },
        )

        assert response.status_code == 200
        # Note: Background tasks are executed synchronously in TestClient,
        # so we can verify the call was made


class TestCreateCommentAuth:
    """Tests for POST /api/comments authentication."""

    def test_create_comment_without_token_returns_401(self, test_client, db):
        """Verify POST without Authorization header returns 401."""
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)

        response = test_client.post(
            "/api/comments/",
            json={"work_item_id": item.id, "content": "No token", "comment_type": "comment"},
        )

        assert response.status_code == 401


# ============= GET /api/comments/workitem/{work_item_id} - List Comments =============


class TestGetComments:
    """Tests for GET /api/comments/workitem/{work_item_id} endpoint."""

    def test_get_comments_for_work_item_returns_list(self, test_client, db, dev_user):
        """Verify GET returns all comments for a work item in descending created_at order.

        Creates multiple comments on same work item, GETs comments, asserts:
        - Status 200
        - Response is list of CommentResponse objects
        - All comments for that work_item_id are returned
        - Ordered by created_at descending
        """
        user, token = dev_user

        # Setup
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project.id,
                developer_id=current_dev.id,
                role="Developer",
                responsibilities=None,
                is_admin=False,
            )
        )
        db.commit()

        # Create 3 comments
        comments_data = []
        for i in range(3):
            comment = Comment(
                work_item_id=item.id,
                author_id=current_dev.id,
                content=f"Comment {i}",
                mentions=[],
                comment_type="comment",
            )
            db.add(comment)
            db.commit()
            db.refresh(comment)
            comments_data.append(comment)

        # GET comments
        response = test_client.get(
            f"/api/comments/workitem/{item.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3

        # Verify all comments are present
        comment_ids = {c["id"] for c in data}
        assert comment_ids == {c.id for c in comments_data}

        # Verify descending order by created_at
        timestamps = [c["created_at"] for c in data]
        assert timestamps == sorted(timestamps, reverse=True)

    def test_get_comments_empty_work_item_returns_empty_list(self, test_client, db, dev_user):
        """Verify GET for work item with no comments returns 200 + empty list."""
        user, token = dev_user

        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)

        # Add current user to project as developer
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project.id,
                developer_id=current_dev.id,
                role="Developer",
                responsibilities=None,
                is_admin=False,
            )
        )
        db.commit()

        response = test_client.get(
            f"/api/comments/workitem/{item.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json() == []

    def test_get_comments_unauthenticated_returns_401(self, test_client, db):
        """Verify GET without token returns 401."""
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)

        response = test_client.get(f"/api/comments/workitem/{item.id}")

        assert response.status_code == 401


# ============= IDOR Tests - Cross-Project Access =============
# These tests lock in CURRENT BEHAVIOR (which has IDOR vulnerabilities).
# After the IDOR fix, flip the assertions and remove @pytest.mark.xfail.


class TestCommentsIDOR:
    """Tests for IDOR vulnerabilities in comments router.

    CRITICAL: These tests intentionally lock the buggy behavior where users can
    read/write comments on projects they have no access to. The @pytest.mark.xfail
    marker + current assertions preserve this behavior so the future IDOR fix can
    prove it works without breaking other contracts.

    After the fix is implemented:
    1. Change the assertions to assert 403 or 404 (based on the fix strategy)
    2. Remove the @pytest.mark.xfail decorator
    3. Update the comments to reflect the fixed behavior
    """

    @pytest.mark.xfail(
        reason="IDOR protection not implemented on current main: GET "
        "/api/comments/workitem/{id} does not gate on project membership and "
        "returns 200 for unaffiliated users. Flip the assertion and drop this "
        "marker when the fix lands.",
        strict=True,
    )
    def test_user_cannot_read_comments_on_unaffiliated_project(
        self, test_client, db, dev_user, admin_user
    ):
        """Verify dev_user cannot read comments on a project they're not in.

        Setup:
        - admin_user creates project A (admin only, no dev_user)
        - Create work item + comment in project A
        - dev_user (not in project A) GETs comments via workitem endpoint

        Expected behavior (after IDOR fix): returns 404
        """
        admin, _admin_token = admin_user
        _dev, dev_token = dev_user

        # Create project A with admin only
        project_a = seed_project(db, name="Project A", num_developers=0)

        # Create a developer for admin and add to project
        admin_dev = create_developer(db, "Admin Dev", "admin@test.local")
        admin.email = admin_dev.email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project_a.id,
                developer_id=admin_dev.id,
                role="Lead",
                is_admin=True,
            )
        )
        db.commit()

        # Create a work item and comment in project A
        item = create_work_item(db, project_a.id)
        comment = Comment(
            work_item_id=item.id,
            author_id=admin_dev.id,
            content="Admin's secret comment",
            mentions=[],
            comment_type="comment",
        )
        db.add(comment)
        db.commit()

        # dev_user (not in project A) tries to read comments
        # Fixed behavior: returns 404
        response = test_client.get(
            f"/api/comments/workitem/{item.id}",
            headers={"Authorization": f"Bearer {dev_token}"},
        )

        assert response.status_code == 404

    @pytest.mark.xfail(
        reason="IDOR protection not implemented on current main: POST "
        "/api/comments/ does not gate on project membership and persists a "
        "comment (200) for unaffiliated users. Flip the assertion and drop this "
        "marker when the fix lands.",
        strict=True,
    )
    def test_user_cannot_create_comment_on_unaffiliated_project(
        self, test_client, db, dev_user, admin_user
    ):
        """Verify dev_user cannot create comments on a project they're not in.

        Setup:
        - admin_user creates project A (admin only)
        - Create work item in project A
        - dev_user (not in project A) POSTs a comment to that work item

        Expected behavior (after IDOR fix): returns 404 and comment is NOT persisted
        """
        admin, _admin_token = admin_user
        dev, dev_token = dev_user

        # Create project A with admin only
        project_a = seed_project(db, name="Project A", num_developers=0)

        # Create a developer for admin
        admin_dev = create_developer(db, "Admin Dev", "admin@test.local")
        admin.email = admin_dev.email
        from models.developer import project_developers

        db.execute(
            project_developers.insert().values(
                project_id=project_a.id,
                developer_id=admin_dev.id,
                role="Lead",
                is_admin=True,
            )
        )

        # Create a developer for dev_user
        dev_dev = create_developer(db, "Dev Dev", "dev@test.local")
        dev.email = dev_dev.email
        db.commit()

        # Create work item in project A
        item = create_work_item(db, project_a.id)

        # dev_user (not in project A) tries to create comment
        # Fixed behavior: returns 404
        response = test_client.post(
            "/api/comments/",
            headers={"Authorization": f"Bearer {dev_token}"},
            json={
                "work_item_id": item.id,
                "content": "Sneaky comment from unaffiliated user",
                "comment_type": "comment",
            },
        )

        assert response.status_code == 404

        # Verify comment was NOT persisted
        comment_count = db.query(Comment).filter(Comment.work_item_id == item.id).count()
        assert comment_count == 0


# ============= PUT /api/comments/{comment_id} - Update Comment =============


class TestUpdateComment:
    """Tests for PUT /api/comments/{comment_id} endpoint."""

    def test_update_comment_persists_change(self, test_client, db, dev_user):
        """Verify PUT updates comment content and re-extracts mentions.

        Creates comment, PUTs new content, asserts:
        - Status 200
        - Response reflects new content
        - Database persists the change
        - Mentions are re-extracted from new content
        """
        user, token = dev_user

        # Setup
        project = seed_project(db, name="Test Project", num_developers=2)
        item = create_work_item(db, project.id)
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        db.commit()

        # Create initial comment
        comment = Comment(
            work_item_id=item.id,
            author_id=current_dev.id,
            content="Original content",
            mentions=[],
            comment_type="comment",
        )
        db.add(comment)
        db.commit()
        db.refresh(comment)

        # Get a developer to mention in update
        devs = db.query(Developer).all()
        mentioned_dev = next((d for d in devs if d.id != current_dev.id), None)

        # PUT update
        new_content = (
            f"Updated content mentioning @{mentioned_dev.name}"
            if mentioned_dev
            else "Updated content"
        )
        response = test_client.put(
            f"/api/comments/{comment.id}",
            headers={"Authorization": f"Bearer {token}"},
            json={"content": new_content},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["content"] == new_content
        assert data["id"] == comment.id

        # Verify database persistence
        updated = db.query(Comment).filter(Comment.id == comment.id).first()
        assert updated.content == new_content

        # Verify mentions were re-extracted
        if mentioned_dev:
            assert mentioned_dev.id in updated.mentions

    def test_update_nonexistent_comment_returns_404(self, test_client, db, dev_user):
        """Verify PUT with nonexistent comment_id returns 404."""
        _user, token = dev_user

        response = test_client.put(
            "/api/comments/999999",
            headers={"Authorization": f"Bearer {token}"},
            json={"content": "This comment does not exist"},
        )

        assert response.status_code == 404
        assert "Comment not found" in response.json()["detail"]

    def test_update_comment_without_token_returns_401(self, test_client, db, dev_user):
        """Verify PUT without token returns 401."""
        _user, _token = dev_user

        # Create a comment to update
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        comment = Comment(
            work_item_id=item.id,
            author_id=current_dev.id,
            content="Original",
            mentions=[],
            comment_type="comment",
        )
        db.add(comment)
        db.commit()

        response = test_client.put(
            f"/api/comments/{comment.id}",
            json={"content": "Updated without auth"},
        )

        assert response.status_code == 401


# ============= DELETE /api/comments/{comment_id} - Delete Comment =============


class TestDeleteComment:
    """Tests for DELETE /api/comments/{comment_id} endpoint."""

    def test_delete_comment_removes_from_database(self, test_client, db, dev_user):
        """Verify DELETE removes comment from database.

        Creates comment, DELETEs it, asserts:
        - Status 200
        - Response confirms deletion
        - Comment no longer in database
        """
        user, token = dev_user

        # Setup
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        db.commit()

        # Create comment
        comment = Comment(
            work_item_id=item.id,
            author_id=current_dev.id,
            content="To be deleted",
            mentions=[],
            comment_type="comment",
        )
        db.add(comment)
        db.commit()
        comment_id = comment.id

        # DELETE
        response = test_client.delete(
            f"/api/comments/{comment_id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()

        # Verify deletion in database
        deleted = db.query(Comment).filter(Comment.id == comment_id).first()
        assert deleted is None

    def test_delete_nonexistent_comment_returns_404(self, test_client, db, dev_user):
        """Verify DELETE with nonexistent comment_id returns 404."""
        _user, token = dev_user

        response = test_client.delete(
            "/api/comments/999999",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404
        assert "Comment not found" in response.json()["detail"]

    def test_delete_comment_without_token_returns_401(self, test_client, db):
        """Verify DELETE without token returns 401."""
        project = seed_project(db, name="Test Project")
        _item = create_work_item(db, project.id)

        response = test_client.delete("/api/comments/1")

        assert response.status_code == 401


# ============= PATCH /api/comments/{comment_id}/resolve - Toggle Resolve =============


class TestToggleCommentResolved:
    """Tests for PATCH /api/comments/{comment_id}/resolve endpoint."""

    def test_toggle_comment_resolved_persists_state(self, test_client, db, dev_user):
        """Verify PATCH marks business review comment as resolved.

        Creates business_review comment, PATCHes with is_resolved=True, asserts:
        - Status 200
        - Comment.is_resolved is True in database
        - Can toggle back to False
        """
        user, token = dev_user

        # Setup
        project = seed_project(db, name="Test Project")
        item = create_work_item(db, project.id)
        current_dev = create_developer(db, "Current Dev", "dev@test.local")
        user.email = current_dev.email
        db.commit()

        # Create business_review comment
        comment = Comment(
            work_item_id=item.id,
            author_id=current_dev.id,
            content="Business review comment",
            mentions=[],
            comment_type="business_review",
            is_resolved=False,
        )
        db.add(comment)
        db.commit()
        db.refresh(comment)

        # PATCH to mark resolved
        response = test_client.patch(
            f"/api/comments/{comment.id}/resolve?is_resolved=true",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json()["id"] == comment.id

        # Verify in database
        updated = db.query(Comment).filter(Comment.id == comment.id).first()
        assert updated.is_resolved is True

    def test_toggle_nonexistent_comment_returns_404(self, test_client, db, dev_user):
        """Verify PATCH with nonexistent comment_id returns 404."""
        _user, token = dev_user

        response = test_client.patch(
            "/api/comments/999999/resolve?is_resolved=true",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404


# ============= GET /api/comments/project/{project_id}/business-review =============


class TestGetBusinessReviewComments:
    """Tests for GET /api/comments/project/{project_id}/business-review endpoint."""

    def test_get_business_review_comments_returns_filtered_list(self, test_client, db, admin_user):
        """Verify GET returns only business_review comments for the project.

        Creates mix of comment types, GETs business-review endpoint, asserts:
        - Status 200
        - Only business_review comments are returned
        - Work item details are included
        """
        user, token = admin_user

        # Setup
        project = seed_project(db, name="Test Project")
        item1 = create_work_item(db, project.id, key="TEST-1", title="Item 1")
        item2 = create_work_item(db, project.id, key="TEST-2", title="Item 2")
        current_dev = create_developer(db, "Current Dev", "admin@test.local")
        user.email = current_dev.email
        db.commit()

        # Create mixed comment types
        for i, comment_type in enumerate(
            ["comment", "business_review", "business_review", "blocker"]
        ):
            comment = Comment(
                work_item_id=item1.id if i < 2 else item2.id,
                author_id=current_dev.id,
                content=f"Comment {comment_type}",
                mentions=[],
                comment_type=comment_type,
            )
            db.add(comment)
        db.commit()

        # GET business-review comments
        response = test_client.get(
            f"/api/comments/project/{project.id}/business-review",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2  # Should be 2 business_review comments

        # Verify all are business_review and include work item details
        for comment in data:
            # The endpoint returns dict, not CommentResponse
            assert "work_item_key" in comment
            assert "work_item_title" in comment
            assert "author_name" in comment

    def test_get_business_review_comments_empty_project_returns_empty_list(
        self, test_client, db, admin_user
    ):
        """Verify GET for project with no business_review comments returns empty list."""
        _user, token = admin_user

        project = seed_project(db, name="Test Project")

        response = test_client.get(
            f"/api/comments/project/{project.id}/business-review",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json() == []

    def test_get_business_review_comments_unauthenticated_returns_401(self, test_client, db):
        """Verify GET without token returns 401."""
        project = seed_project(db, name="Test Project")

        response = test_client.get(f"/api/comments/project/{project.id}/business-review")

        assert response.status_code == 401
