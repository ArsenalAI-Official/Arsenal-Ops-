"""
Integration tests for the PRD analysis router (POST/GET /api/prd/*).

Tests cover:
- File upload (PDF/Word) with LLM analysis
- Text-based PRD analysis
- Architecture generation and refinement
- Architecture selection and ticket generation
- RBAC and authentication gates

All LLM calls are mocked to avoid network dependencies.
Fixtures from conftest.py: db, test_client, make_token, admin_user, pm_user, dev_user
"""

import io
from datetime import datetime
from unittest.mock import patch

from models.architecture import Architecture, PRDAnalysis
from models.developer import Developer, project_developers
from models.project import Project


def seed_project(db, name: str = "Test Project", num_developers: int = 2) -> Project:
    """Factory function: create a Project + N developers + admin assignment."""
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
    for i in range(num_developers):
        dev = Developer(
            name=f"Developer {i + 1}",
            email=f"seed-dev-{i + 1}@test.local",
            github_username=f"seed-dev-{i + 1}",
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


# ============= Test: File Upload =============


class TestAnalyzePRDFile:
    """Tests for POST /api/prd/analyze-file endpoint."""

    def test_upload_prd_returns_analysis_and_architectures(self, db, test_client, admin_user):
        """Verify POST analyze-file with valid PDF → 200 + analysis + architectures.

        Creates project, POSTs PDF file with mocked LLM, asserts:
        - Status 200
        - Response contains analysis dict with summary, key_features, etc.
        - Response contains architectures list with recommended and alternative
        - Both are persisted in DB
        """
        _user, token = admin_user
        project = seed_project(db, "Test PRD Project", num_developers=1)

        # Create minimal valid PDF bytes
        pdf_bytes = b"%PDF-1.4\n%test\n1 0 obj\n<< >>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<< /Size 1 >>\nstartxref\n0\n%%EOF"

        mock_analysis = {
            "summary": "Test project summary",
            "key_features": ["Feature 1", "Feature 2"],
            "technical_requirements": ["Requirement 1"],
            "cost_analysis": {"infrastructure": {"monthly": "$500"}},
            "recommended_tools": {"frontend": ["React"], "backend": ["FastAPI"]},
            "risks": [{"risk": "test risk", "impact": "Low", "mitigation": "test mitigation"}],
            "timeline": [{"phase": "Design", "duration": "2 weeks", "tasks": ["task1"]}],
        }

        mock_architectures = {
            "recommended": {
                "name": "Recommended Architecture",
                "description": "Recommended design",
                "mermaid_code": "graph LR\n  A[Client] --> B[API]",
                "pros": ["scalable"],
                "cons": ["complex"],
                "complexity": "high",
                "estimated_cost": "$50k",
                "time_to_implement": "8 weeks",
            },
            "alternative": {
                "name": "Alternative Architecture",
                "description": "Alternative design",
                "mermaid_code": "graph LR\n  A[Client] --> B[Server]",
                "pros": ["simple"],
                "cons": ["limited"],
                "complexity": "low",
                "estimated_cost": "$20k",
                "time_to_implement": "4 weeks",
            },
        }

        with (
            patch("services.prd_processor.prd_processor.process_prd") as mock_process,
            patch(
                "services.architecture_generator.architecture_generator.analyze_prd"
            ) as mock_analyze,
            patch(
                "services.architecture_generator.architecture_generator.generate_architectures"
            ) as mock_gen_arch,
        ):
            mock_process.return_value = {"cleaned_text": "Test PRD content", "raw_text": ""}
            mock_analyze.return_value = mock_analysis
            mock_gen_arch.return_value = mock_architectures

            response = test_client.post(
                "/api/prd/analyze-file",
                data={"project_id": project.id, "additional_context": ""},
                files={"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "analysis" in data
        assert "architectures" in data
        assert data["analysis"]["summary"] == "Test project summary"
        assert len(data["architectures"]) == 2

        # Verify persisted in DB
        prd = db.query(PRDAnalysis).filter(PRDAnalysis.project_id == project.id).first()
        assert prd is not None
        assert prd.summary == "Test project summary"

        arch_list = db.query(Architecture).filter(Architecture.project_id == project.id).all()
        assert len(arch_list) == 2

    def test_upload_invalid_file_type_returns_400(self, db, test_client, admin_user):
        """Verify POST with unsupported file type → 400.

        POSTs .txt file, asserts 400 + error detail.
        """
        _user, token = admin_user
        project = seed_project(db, "Test Project", num_developers=1)

        with patch("services.prd_processor.prd_processor.process_prd") as mock_process:
            mock_process.side_effect = ValueError("Unsupported file format: test.txt")

            response = test_client.post(
                "/api/prd/analyze-file",
                data={"project_id": project.id, "additional_context": ""},
                files={"file": ("test.txt", io.BytesIO(b"plain text"), "text/plain")},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 400
        assert "Unsupported file format" in response.json()["detail"]

    def test_upload_empty_file_returns_400(self, db, test_client, admin_user):
        """Verify POST with empty file → 4xx.

        POSTs empty PDF bytes, asserts 4xx error.
        """
        _user, token = admin_user
        project = seed_project(db, "Test Project", num_developers=1)

        with patch("services.prd_processor.prd_processor.process_prd") as mock_process:
            mock_process.side_effect = ValueError("PDF file is empty or corrupted")

            response = test_client.post(
                "/api/prd/analyze-file",
                data={"project_id": project.id, "additional_context": ""},
                files={"file": ("test.pdf", io.BytesIO(b""), "application/pdf")},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert 400 <= response.status_code < 500

    def test_upload_requires_auth(self, db, test_client):
        """Verify POST without token → 401.

        POSTs without Authorization header, asserts 401.
        """
        project = seed_project(db, "Test Project", num_developers=1)

        response = test_client.post(
            "/api/prd/analyze-file",
            data={"project_id": project.id, "additional_context": ""},
            files={"file": ("test.pdf", io.BytesIO(b"dummy"), "application/pdf")},
        )

        assert response.status_code == 401
        assert "Not authenticated" in response.json()["detail"]

    def test_upload_nonexistent_project_returns_404(self, db, test_client, admin_user):
        """Verify POST with bogus project_id → 404.

        POSTs with non-existent project ID, asserts 404.
        """
        _user, token = admin_user

        response = test_client.post(
            "/api/prd/analyze-file",
            data={"project_id": 999999, "additional_context": ""},
            files={"file": ("test.pdf", io.BytesIO(b"dummy"), "application/pdf")},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]


# ============= Test: Text Analysis =============


class TestAnalyzePRDText:
    """Tests for POST /api/prd/analyze-text endpoint."""

    def test_analyze_text_returns_analysis_and_architectures(self, db, test_client, admin_user):
        """Verify POST analyze-text with PRD text → 200 + analysis + architectures.

        POSTs PRD text content with mocked LLM, asserts:
        - Status 200
        - Response contains analysis and architectures
        - Both persist in DB
        """
        _user, token = admin_user
        project = seed_project(db, "Text Analysis Project", num_developers=1)

        prd_text = "Design a real-time collaboration tool with websockets and Redis."

        mock_analysis = {
            "summary": "Collaboration platform",
            "key_features": ["Real-time sync", "User presence"],
            "technical_requirements": ["WebSocket", "Redis"],
            "cost_analysis": {},
            "recommended_tools": {},
            "risks": [],
            "timeline": [],
        }

        mock_architectures = {
            "recommended": {
                "name": "Recommended",
                "description": "Scalable design",
                "mermaid_code": "graph LR\n  A --> B",
                "pros": [],
                "cons": [],
                "complexity": "medium",
                "estimated_cost": "$30k",
                "time_to_implement": "6 weeks",
            }
        }

        with (
            patch(
                "services.architecture_generator.architecture_generator.analyze_prd"
            ) as mock_analyze,
            patch(
                "services.architecture_generator.architecture_generator.generate_architectures"
            ) as mock_gen,
        ):
            mock_analyze.return_value = mock_analysis
            mock_gen.return_value = mock_architectures

            response = test_client.post(
                "/api/prd/analyze-text",
                json={
                    "project_id": project.id,
                    "prd_content": prd_text,
                    "additional_context": "Team has 3 fullstack engineers",
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "analysis" in data
        assert "architectures" in data

        prd = db.query(PRDAnalysis).filter(PRDAnalysis.project_id == project.id).first()
        assert prd is not None
        assert prd.prd_content == prd_text

    def test_analyze_text_nonexistent_project_returns_404(self, db, test_client, admin_user):
        """Verify POST analyze-text with bogus project_id → 404."""
        _user, token = admin_user

        response = test_client.post(
            "/api/prd/analyze-text",
            json={
                "project_id": 999999,
                "prd_content": "Some PRD content",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]

    def test_analyze_text_requires_auth(self, db, test_client):
        """Verify POST without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)

        response = test_client.post(
            "/api/prd/analyze-text",
            json={"project_id": project.id, "prd_content": "test"},
        )

        assert response.status_code == 401


# ============= Test: Get Architectures =============


class TestGetArchitectures:
    """Tests for GET /api/prd/projects/{project_id}/architectures endpoint."""

    def test_get_project_architectures_returns_list(self, db, test_client, admin_user):
        """Verify GET architectures returns list of architectures.

        Creates 2 architectures, GETs them, asserts 200 + list of dicts.
        """
        _user, token = admin_user
        project = seed_project(db, "Arch Project", num_developers=1)

        arch1 = Architecture(
            project_id=project.id,
            name="Recommended",
            description="Recommended design",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
            complexity="medium",
        )
        arch2 = Architecture(
            project_id=project.id,
            name="Alternative",
            description="Alternative design",
            architecture_type="alternative",
            mermaid_code="graph LR\n  A --> C",
            complexity="low",
        )
        db.add(arch1)
        db.add(arch2)
        db.commit()

        response = test_client.get(
            f"/api/prd/projects/{project.id}/architectures",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        names = [arch["name"] for arch in data]
        assert "Recommended" in names
        assert "Alternative" in names

    def test_get_architectures_requires_auth(self, db, test_client):
        """Verify GET without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)

        response = test_client.get(f"/api/prd/projects/{project.id}/architectures")

        assert response.status_code == 401

    def test_get_architectures_empty_returns_empty_list(self, db, test_client, admin_user):
        """Verify GET on project with no architectures → 200 + empty list."""
        _user, token = admin_user
        project = seed_project(db, "Empty Project", num_developers=1)

        response = test_client.get(
            f"/api/prd/projects/{project.id}/architectures",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json() == []


# ============= Test: Get Analysis =============


class TestGetProjectAnalysis:
    """Tests for GET /api/prd/projects/{project_id}/analysis endpoint."""

    def test_get_project_analysis_returns_latest(self, db, test_client, admin_user):
        """Verify GET analysis returns latest PRDAnalysis record.

        Creates 2 PRD analyses, GETs, asserts returns the latest.
        """
        _user, token = admin_user
        project = seed_project(db, "Analysis Project", num_developers=1)

        # Explicit, distinct created_at values so "latest" is unambiguous.
        # The endpoint orders by created_at.desc(); without distinct timestamps
        # both rows tie (the model default resolves to the same flush time) and
        # the tie-break order is implementation-defined.
        from datetime import timedelta

        base = datetime(2026, 1, 1, 12, 0, 0)
        prd1 = PRDAnalysis(
            project_id=project.id,
            filename="prd1.pdf",
            prd_content="First PRD",
            summary="Summary 1",
            created_at=base,
        )
        prd2 = PRDAnalysis(
            project_id=project.id,
            filename="prd2.pdf",
            prd_content="Second PRD",
            summary="Summary 2",
            created_at=base + timedelta(hours=1),
        )
        db.add(prd1)
        db.add(prd2)
        db.commit()

        response = test_client.get(
            f"/api/prd/projects/{project.id}/analysis",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["summary"] == "Summary 2"

    def test_get_analysis_returns_none_when_not_found(self, db, test_client, admin_user):
        """Verify GET analysis on project with no analysis → 200 + null."""
        _user, token = admin_user
        project = seed_project(db, "No Analysis Project", num_developers=1)

        response = test_client.get(
            f"/api/prd/projects/{project.id}/analysis",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json() is None

    def test_get_analysis_requires_auth(self, db, test_client):
        """Verify GET without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)

        response = test_client.get(f"/api/prd/projects/{project.id}/analysis")

        assert response.status_code == 401


# ============= Test: Update Architecture =============


class TestUpdateArchitecture:
    """Tests for PUT /api/prd/architectures/{architecture_id} endpoint."""

    def test_update_architecture_mermaid_persists(self, db, test_client, admin_user):
        """Verify PUT updates mermaid_code and persists.

        Creates architecture, PUTs new mermaid_code, verifies in DB.
        """
        _user, token = admin_user
        project = seed_project(db, "Update Project", num_developers=1)

        arch = Architecture(
            project_id=project.id,
            name="Original",
            description="Original description",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
            complexity="medium",
        )
        db.add(arch)
        db.commit()

        new_code = "graph LR\n  A --> B\n  B --> C"

        response = test_client.put(
            f"/api/prd/architectures/{arch.id}",
            json={"mermaid_code": new_code, "name": "Updated"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json()["mermaid_code"] == new_code
        assert response.json()["name"] == "Updated"

        db_arch = db.query(Architecture).filter(Architecture.id == arch.id).first()
        assert db_arch.mermaid_code == new_code
        assert db_arch.name == "Updated"

    def test_update_nonexistent_architecture_returns_404(self, db, test_client, admin_user):
        """Verify PUT on bogus architecture_id → 404."""
        _user, token = admin_user

        response = test_client.put(
            "/api/prd/architectures/999999",
            json={"mermaid_code": "new code"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    def test_update_architecture_requires_auth(self, db, test_client):
        """Verify PUT without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)
        arch = Architecture(
            project_id=project.id,
            name="Test",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
        )
        db.add(arch)
        db.commit()

        response = test_client.put(
            f"/api/prd/architectures/{arch.id}",
            json={"mermaid_code": "new"},
        )

        assert response.status_code == 401


# ============= Test: Get Specific Architecture =============


class TestGetArchitecture:
    """Tests for GET /api/prd/architectures/{architecture_id} endpoint."""

    def test_get_architecture_returns_details(self, db, test_client, admin_user):
        """Verify GET architecture returns full record.

        Creates architecture, GETs it, asserts all fields present.
        """
        _user, token = admin_user
        project = seed_project(db, "Get Project", num_developers=1)

        arch = Architecture(
            project_id=project.id,
            name="Test Architecture",
            description="Test description",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
            complexity="high",
            estimated_cost="$50k",
        )
        db.add(arch)
        db.commit()

        response = test_client.get(
            f"/api/prd/architectures/{arch.id}",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Architecture"
        assert data["complexity"] == "high"

    def test_get_nonexistent_architecture_returns_404(self, db, test_client, admin_user):
        """Verify GET on bogus architecture_id → 404."""
        _user, token = admin_user

        response = test_client.get(
            "/api/prd/architectures/999999",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    def test_get_architecture_requires_auth(self, db, test_client):
        """Verify GET without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)
        arch = Architecture(
            project_id=project.id,
            name="Test",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
        )
        db.add(arch)
        db.commit()

        response = test_client.get(f"/api/prd/architectures/{arch.id}")

        assert response.status_code == 401


# ============= Test: Select Architecture =============


class TestSelectArchitecture:
    """Tests for POST /api/prd/architectures/{architecture_id}/select endpoint."""

    def test_select_architecture_sets_is_selected(self, db, test_client, admin_user):
        """Verify POST select sets is_selected=True, deselects others.

        Creates 2 architectures, selects one, verifies only that one is selected.
        """
        _user, token = admin_user
        project = seed_project(db, "Select Project", num_developers=1)

        arch1 = Architecture(
            project_id=project.id,
            name="Arch 1",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
        )
        arch2 = Architecture(
            project_id=project.id,
            name="Arch 2",
            architecture_type="alternative",
            mermaid_code="graph LR\n  A --> C",
        )
        db.add(arch1)
        db.add(arch2)
        db.commit()

        response = test_client.post(
            f"/api/prd/architectures/{arch2.id}/select",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json()["is_selected"] is True

        db.refresh(arch1)
        db.refresh(arch2)
        assert arch1.is_selected is False
        assert arch2.is_selected is True

    def test_select_nonexistent_architecture_returns_404(self, db, test_client, admin_user):
        """Verify POST select on bogus id → 404."""
        _user, token = admin_user

        response = test_client.post(
            "/api/prd/architectures/999999/select",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    def test_select_architecture_requires_auth(self, db, test_client):
        """Verify POST select without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)
        arch = Architecture(
            project_id=project.id,
            name="Test",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
        )
        db.add(arch)
        db.commit()

        response = test_client.post(f"/api/prd/architectures/{arch.id}/select")

        assert response.status_code == 401


# ============= Test: AI Refine Architecture =============


class TestAIRefineArchitecture:
    """Tests for POST /api/prd/architectures/{architecture_id}/ai-refine endpoint."""

    def test_ai_refine_updates_architecture(self, db, test_client, admin_user):
        """Verify POST ai-refine updates mermaid_code and description.

        POSTs refine request with mocked LLM, asserts:
        - Status 200
        - Architecture fields updated in DB
        """
        _user, token = admin_user
        project = seed_project(db, "Refine Project", num_developers=1)

        arch = Architecture(
            project_id=project.id,
            name="Initial Design",
            description="Simple design",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A[Client] --> B[API]",
            complexity="low",
        )
        db.add(arch)
        db.commit()

        refined_response = {
            "mermaid_code": "graph LR\n  A[Client] --> B[Cache] --> C[API]",
            "description": "Enhanced design with caching",
            "changes_applied": ["Added caching layer"],
            "ai_notes": "Cache improves performance",
        }

        with patch(
            "services.architecture_generator.architecture_generator.refine_architecture"
        ) as mock_refine:
            mock_refine.return_value = refined_response

            response = test_client.post(
                f"/api/prd/architectures/{arch.id}/ai-refine",
                json={
                    "current_mermaid_code": arch.mermaid_code,
                    "change_instructions": "Add a caching layer",
                },
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert "architecture" in data
        assert "changes_applied" in data

        db.refresh(arch)
        assert "Cache" in arch.mermaid_code
        assert arch.description is not None
        assert "caching" in arch.description

    def test_ai_refine_nonexistent_architecture_returns_404(self, db, test_client, admin_user):
        """Verify POST ai-refine on bogus id → 404."""
        _user, token = admin_user

        response = test_client.post(
            "/api/prd/architectures/999999/ai-refine",
            json={
                "current_mermaid_code": "graph LR\n  A --> B",
                "change_instructions": "Add something",
            },
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    def test_ai_refine_requires_auth(self, db, test_client):
        """Verify POST ai-refine without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)
        arch = Architecture(
            project_id=project.id,
            name="Test",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
        )
        db.add(arch)
        db.commit()

        response = test_client.post(
            f"/api/prd/architectures/{arch.id}/ai-refine",
            json={
                "current_mermaid_code": "graph LR\n  A --> B",
                "change_instructions": "refine",
            },
        )

        assert response.status_code == 401


# ============= Test: Commit Architecture (Ticket Generation) =============


class TestCommitArchitecture:
    """Tests for POST /api/prd/projects/{project_id}/commit-architecture endpoint."""

    def test_commit_architecture_generates_tickets(self, db, test_client, admin_user):
        """Verify POST commit-architecture generates work items.

        Creates architecture with mocked AI, POSTs commit, asserts:
        - Status 200 + success=True
        - Work items created in DB
        - Response includes tickets list
        """
        _user, token = admin_user
        project = seed_project(db, "Commit Project", num_developers=2)

        arch = Architecture(
            project_id=project.id,
            name="Design to Implement",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
        )
        db.add(arch)
        db.commit()

        ticket_result = {
            "tickets": [
                {
                    "type": "task",
                    "title": "Setup API Framework",
                    "description": "Initialize FastAPI",
                    "estimated_hours": 8,
                    "story_points": 5,
                    "priority": "high",
                    "assignee_id": None,
                    "assignee_reasoning": "Unassigned",
                    "sprint_number": None,
                    "tags": [],
                }
            ],
            "total_story_points": 5,
            "total_estimated_hours": 8,
            "sprint_recommendation": "Can fit in 1 sprint",
        }

        with patch(
            "services.architecture_generator.architecture_generator.generate_tickets_from_architecture"
        ) as mock_gen_tickets:
            mock_gen_tickets.return_value = ticket_result

            response = test_client.post(
                f"/api/prd/projects/{project.id}/commit-architecture",
                json={"architecture_id": arch.id},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["tickets_created"] == 1
        assert len(data["tickets"]) == 1

    def test_commit_architecture_nonexistent_project_returns_404(self, db, test_client, admin_user):
        """Verify POST commit on bogus project_id → 404."""
        _user, token = admin_user

        response = test_client.post(
            "/api/prd/projects/999999/commit-architecture",
            json={"architecture_id": 1},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404

    def test_commit_architecture_requires_auth(self, db, test_client):
        """Verify POST commit without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)

        response = test_client.post(
            f"/api/prd/projects/{project.id}/commit-architecture",
            json={"architecture_id": 1},
        )

        assert response.status_code == 401


# ============= Test: Preview Tickets =============


class TestPreviewGeneratedTickets:
    """Tests for POST /api/prd/projects/{project_id}/generate-tickets-preview endpoint."""

    def test_preview_tickets_returns_list(self, db, test_client, admin_user):
        """Verify POST preview returns tickets without creating work items.

        POSTs preview request with mocked AI, asserts:
        - Status 200 + preview=True
        - Response contains tickets but DB is empty
        """
        _user, token = admin_user
        project = seed_project(db, "Preview Project", num_developers=1)

        arch = Architecture(
            project_id=project.id,
            name="Test Arch",
            architecture_type="recommended",
            mermaid_code="graph LR\n  A --> B",
        )
        db.add(arch)
        db.commit()

        preview_result = {
            "tickets": [
                {
                    "type": "task",
                    "title": "Preview Task",
                    "description": "This is a preview",
                    "estimated_hours": 4,
                    "story_points": 2,
                    "priority": "medium",
                    "assignee_id": None,
                }
            ],
            "total_story_points": 2,
            "total_estimated_hours": 4,
            "sprint_recommendation": "Quick sprint",
        }

        with patch(
            "services.architecture_generator.architecture_generator.generate_tickets_from_architecture"
        ) as mock_gen:
            mock_gen.return_value = preview_result

            response = test_client.post(
                f"/api/prd/projects/{project.id}/generate-tickets-preview",
                json={"architecture_id": arch.id},
                headers={"Authorization": f"Bearer {token}"},
            )

        assert response.status_code == 200
        data = response.json()
        assert data["preview"] is True
        assert len(data["tickets"]) == 1

    def test_preview_tickets_requires_auth(self, db, test_client):
        """Verify POST preview without token → 401."""
        project = seed_project(db, "Test Project", num_developers=1)

        response = test_client.post(
            f"/api/prd/projects/{project.id}/generate-tickets-preview",
            json={"architecture_id": 1},
        )

        assert response.status_code == 401

    def test_preview_tickets_nonexistent_project_returns_404(self, db, test_client, admin_user):
        """Verify POST preview on bogus project_id → 404."""
        _user, token = admin_user

        response = test_client.post(
            "/api/prd/projects/999999/generate-tickets-preview",
            json={"architecture_id": 1},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 404
