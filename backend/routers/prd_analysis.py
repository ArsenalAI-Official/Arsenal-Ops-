"""
PRD Analysis Router - Endpoints for PRD upload, analysis, and architecture generation
"""

import io
import re
import sys
from datetime import date, datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

sys.path.append("..")
from sqlalchemy import func

from database import get_db
from models.activity_log import ActivityLog
from models.architecture import Architecture, PRDAnalysis, RoadmapTemplate
from models.developer import Developer, project_developers
from models.project import Project
from models.sprint import Sprint, SprintStatus
from models.user import User
from models.work_item import WorkItem
from routers.auth import get_current_user, require_capability
from services.architecture_generator import architecture_generator
from services.prd_processor import prd_processor
from services.roadmap_generator import build_week_dates, roadmap_generator

router = APIRouter(prefix="/api/prd", tags=["PRD Analysis"])


class TextAnalysisRequest(BaseModel):
    project_id: int
    prd_content: str
    additional_context: str | None = ""
    start_date: str | None = None  # ISO format: YYYY-MM-DD
    end_date: str | None = None  # ISO format: YYYY-MM-DD


class ArchitectureUpdate(BaseModel):
    mermaid_code: str | None = None
    name: str | None = None
    description: str | None = None


class CommitArchitectureRequest(BaseModel):
    architecture_id: int
    start_date: str | None = None  # ISO format: YYYY-MM-DD
    end_date: str | None = None  # ISO format: YYYY-MM-DD


class AIRefineRequest(BaseModel):
    current_mermaid_code: str
    change_instructions: str  # Plain English description of changes needed


class GenerateRoadmapTemplateRequest(BaseModel):
    start_date: str  # YYYY-MM-DD
    end_date: str  # YYYY-MM-DD
    sprint_weeks: int = Field(default=2, ge=1, le=6)


# Max accepted PRD upload size. PRDs are text-heavy and rarely exceed a few MB;
# the cap exists to prevent accidental/abusive uploads from OOMing the container.
MAX_PRD_FILE_BYTES = 25 * 1024 * 1024  # 25 MB


async def _run_prd_analysis_pipeline(
    db: Session,
    project: Project,
    prd_content: str,
    additional_context: str,
    filename: str | None,
    current_user: User,
) -> dict:
    """
    Shared analyze + persist pipeline for both file and text endpoints.

    Surfaces AI failures as HTTP errors instead of silently storing the
    service-layer error stubs. PRDAnalysis is committed before architecture
    generation so a downstream AI failure still leaves the user with their
    analysis (and a clear warning) rather than nothing.
    """
    additional_context = additional_context or ""

    # Guard: one PRD per project. Once analysis exists for a project, a second
    # upload would silently shadow it (downstream queries pick the latest by
    # created_at) and run a needless LLM round trip. 409 is the correct status
    # — the request conflicts with the current state of the resource. Checked
    # before the empty-content guard so a duplicate upload doesn't depend on
    # what the new file contains.
    existing_analysis = (
        db.query(PRDAnalysis.id).filter(PRDAnalysis.project_id == project.id).first()
    )
    if existing_analysis:
        raise HTTPException(
            status_code=409,
            detail=(
                "A PRD has already been analyzed for this project. "
                "Delete the existing analysis before uploading a new one."
            ),
        )

    # Guard: empty content means the extractor returned nothing (e.g. a scanned
    # PDF with no text layer). Feeding "" to the LLM produces a hallucinated
    # analysis that ends up persisted as if real.
    if not prd_content or not prd_content.strip():
        raise HTTPException(
            status_code=400,
            detail=(
                "PRD content is empty. If this was a scanned PDF, OCR is not supported "
                "— upload a text-layer PDF or paste the content directly."
            ),
        )

    # Step 1: AI analysis. analyze_prd catches its own exceptions and returns
    # an error stub — surface that as a 502 rather than persisting it.
    analysis = await architecture_generator.analyze_prd(
        prd_content=prd_content,
        project_name=project.name,
        additional_context=additional_context,
    )
    if analysis.get("error"):
        raise HTTPException(
            status_code=502,
            detail=f"AI analysis failed: {analysis['error']}",
        )

    # Step 2: persist PRDAnalysis. Commit standalone so a downstream
    # architecture-generation failure still leaves the user with their analysis.
    prd_analysis = PRDAnalysis(
        project_id=project.id,
        filename=filename,
        prd_content=prd_content,
        additional_context=additional_context,
        summary=analysis.get("summary"),
        key_features=analysis.get("key_features"),
        technical_requirements=analysis.get("technical_requirements"),
        cost_analysis=analysis.get("cost_analysis"),
        recommended_tools=analysis.get("recommended_tools"),
        risks=analysis.get("risks"),
        timeline=analysis.get("timeline"),
    )
    db.add(prd_analysis)
    # Flush to get prd_analysis.id without committing — we'll commit both the
    # analysis row and its activity-log entry atomically below.
    db.flush()

    # Activity log entry — surfaces "Analyzed PRD: <filename>" in the project's
    # Activity tab. Atomic with the PRDAnalysis insert: if the commit fails,
    # neither row persists. Committed BEFORE architecture generation so the
    # log entry survives even if the architecture LLM call errors out.
    db.add(
        ActivityLog(
            project_id=project.id,
            user_id=current_user.id,
            action="created",
            entity_type="prd_analysis",
            entity_id=prd_analysis.id,
            title=(f"Analyzed PRD: {filename}" if filename else "Analyzed PRD from pasted text"),
        )
    )
    db.commit()
    db.refresh(prd_analysis)

    # Step 3: AI architecture generation. Same error-stub treatment — but
    # the analysis is already persisted, so return a warning instead of 502
    # so the client can render the analysis.
    architectures = await architecture_generator.generate_architectures(
        prd_content=prd_content, project_name=project.name, analysis=analysis
    )
    if architectures.get("error"):
        return {
            "analysis": prd_analysis.to_dict(),
            "architectures": [],
            "warning": f"Architecture generation failed: {architectures['error']}",
        }

    # Step 4: stage all architectures, single commit so a mid-loop failure
    # rolls them all back together.
    arch_rows = []
    for arch_type in ("recommended", "alternative"):
        if arch_type not in architectures:
            continue
        arch_data = architectures[arch_type]
        architecture = Architecture(
            project_id=project.id,
            name=arch_data.get("name", f"{arch_type.capitalize()} Architecture"),
            description=arch_data.get("description", ""),
            architecture_type=arch_type,
            mermaid_code=arch_data.get("mermaid_code", ""),
            cost_analysis=analysis.get("cost_analysis"),
            tools_recommended=analysis.get("recommended_tools"),
            pros=arch_data.get("pros", []),
            cons=arch_data.get("cons", []),
            estimated_cost=arch_data.get("estimated_cost", ""),
            complexity=arch_data.get("complexity", "medium"),
            time_to_implement=arch_data.get("time_to_implement", ""),
        )
        db.add(architecture)
        arch_rows.append(architecture)

    db.commit()
    for a in arch_rows:
        db.refresh(a)

    return {
        "analysis": prd_analysis.to_dict(),
        "architectures": [a.to_dict() for a in arch_rows],
    }


@router.post("/analyze-file")
async def analyze_prd_file(
    project_id: int = Form(...),
    additional_context: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("project.ai.write")),
):
    """
    Upload and analyze a PRD file (PDF or Word) (requires `project.ai.write`).
    Returns: PRD analysis and generated architectures.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    file_content = await file.read()
    if len(file_content) > MAX_PRD_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {MAX_PRD_FILE_BYTES // (1024 * 1024)} MB.",
        )

    try:
        prd_data = prd_processor.process_prd(file_content, file.filename)
    except ValueError as e:
        # Unsupported format / corrupted file — surface the extractor's message.
        raise HTTPException(status_code=400, detail=str(e)) from e

    return await _run_prd_analysis_pipeline(
        db=db,
        project=project,
        prd_content=prd_data["cleaned_text"],
        additional_context=additional_context,
        filename=file.filename,
        current_user=current_user,
    )


@router.post("/analyze-text")
async def analyze_prd_text(
    request: TextAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("project.ai.write")),
):
    """
    Analyze PRD from text input (requires `project.ai.write`).
    Returns: PRD analysis and generated architectures.
    """
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return await _run_prd_analysis_pipeline(
        db=db,
        project=project,
        prd_content=request.prd_content,
        additional_context=request.additional_context or "",
        filename=None,
        current_user=current_user,
    )


@router.get("/projects/{project_id}/architectures")
def get_project_architectures(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get all architectures for a project (requires auth)"""
    architectures = (
        db.query(Architecture)
        .filter(Architecture.project_id == project_id)
        .order_by(Architecture.created_at.desc())
        .all()
    )

    return [arch.to_dict() for arch in architectures]


@router.get("/projects/{project_id}/analysis")
def get_project_analysis(
    project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get the latest PRD analysis for a project (requires auth)"""
    analysis = (
        db.query(PRDAnalysis)
        .filter(PRDAnalysis.project_id == project_id)
        .order_by(PRDAnalysis.created_at.desc())
        .first()
    )

    if not analysis:
        return None

    return analysis.to_dict()


@router.get("/architectures/{architecture_id}")
def get_architecture(
    architecture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific architecture (requires auth)"""
    architecture = db.query(Architecture).filter(Architecture.id == architecture_id).first()
    if not architecture:
        raise HTTPException(status_code=404, detail="Architecture not found")

    return architecture.to_dict()


@router.put("/architectures/{architecture_id}")
def update_architecture(
    architecture_id: int,
    update: ArchitectureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an architecture (e.g., edit mermaid code) (requires auth)"""
    architecture = db.query(Architecture).filter(Architecture.id == architecture_id).first()
    if not architecture:
        raise HTTPException(status_code=404, detail="Architecture not found")

    if update.mermaid_code is not None:
        architecture.mermaid_code = update.mermaid_code
    if update.name is not None:
        architecture.name = update.name
    if update.description is not None:
        architecture.description = update.description

    architecture.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(architecture)

    return architecture.to_dict()


@router.post("/architectures/{architecture_id}/ai-refine")
async def ai_refine_architecture(
    architecture_id: int,
    request: AIRefineRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Use AI to refine an architecture based on user's plain English instructions.
    Takes the current mermaid code and change description, returns updated architecture.

    Example instructions:
    - "Add a Redis cache layer between the API and database"
    - "Replace the monolithic backend with microservices"
    - "Add authentication service with OAuth2 support"
    """
    # Get the architecture
    architecture = db.query(Architecture).filter(Architecture.id == architecture_id).first()
    if not architecture:
        raise HTTPException(status_code=404, detail="Architecture not found")

    # Get project for context
    project = db.query(Project).filter(Project.id == architecture.project_id).first()
    project_name = project.name if project else "Unknown Project"

    # Call AI to refine the architecture
    refined = await architecture_generator.refine_architecture(
        current_mermaid_code=request.current_mermaid_code,
        change_instructions=request.change_instructions,
        architecture_name=architecture.name,
        project_name=project_name,
    )

    # Update the architecture in database
    architecture.mermaid_code = refined.get("mermaid_code", request.current_mermaid_code)
    architecture.description = refined.get("description", architecture.description)
    architecture.updated_at = datetime.utcnow()

    # Update pros/cons if AI provided them
    if refined.get("pros"):
        architecture.pros = refined.get("pros")
    if refined.get("cons"):
        architecture.cons = refined.get("cons")

    db.commit()
    db.refresh(architecture)

    return {
        "architecture": architecture.to_dict(),
        "changes_applied": refined.get("changes_applied", []),
        "ai_notes": refined.get("ai_notes", ""),
    }


@router.post("/architectures/{architecture_id}/select")
def select_architecture(
    architecture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Select an architecture for the project (requires auth)"""
    print(
        f"[SELECT] Request received for architecture_id={architecture_id}, user={current_user.id}"
    )
    try:
        print("[SELECT] Querying architecture...")
        architecture = db.query(Architecture).filter(Architecture.id == architecture_id).first()
        if not architecture:
            raise HTTPException(status_code=404, detail="Architecture not found")

        print(
            f"[SELECT] Found architecture project_id={architecture.project_id}, deselecting others..."
        )
        # Deselect other architectures for this project
        db.query(Architecture).filter(Architecture.project_id == architecture.project_id).update(
            {"is_selected": False, "selected_at": None}
        )

        print(f"[SELECT] Selecting architecture {architecture_id}...")
        architecture.is_selected = True
        architecture.selected_at = datetime.utcnow()
        db.commit()
        db.refresh(architecture)

        print("[SELECT] Success! Returning response...")
        return architecture.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] select_architecture failed: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=500, detail=f"Failed to select architecture: {str(e)}"
        ) from e


@router.post("/projects/{project_id}/commit-architecture")
async def commit_architecture(
    project_id: int,
    request: CommitArchitectureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Commit selected architecture and generate Jira tickets (requires auth)
    Assigns tickets to developers based on their specialization
    Divides project into sprints if timeline is provided
    """
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get architecture
    architecture = (
        db.query(Architecture)
        .filter(Architecture.id == request.architecture_id, Architecture.project_id == project_id)
        .first()
    )
    if not architecture:
        raise HTTPException(status_code=404, detail="Architecture not found")

    # Get PRD analysis for the project (to enrich ticket generation)
    prd_analysis = (
        db.query(PRDAnalysis)
        .filter(PRDAnalysis.project_id == project_id)
        .order_by(PRDAnalysis.created_at.desc())
        .first()
    )
    prd_data = prd_analysis.to_dict() if prd_analysis else None

    # Get project developers with their roles
    developers = []
    result = db.execute(
        select(
            Developer.id,
            Developer.name,
            Developer.email,
            project_developers.c.role,
            project_developers.c.responsibilities,
        )
        .join(project_developers, Developer.id == project_developers.c.developer_id)
        .where(project_developers.c.project_id == project_id)
    ).all()

    for row in result:
        developers.append(
            {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "role": row.role,
                "responsibilities": row.responsibilities,
            }
        )

    # Parse timeline dates
    start_date = None
    end_date = None
    import contextlib

    if request.start_date:
        with contextlib.suppress(ValueError):
            start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
    if request.end_date:
        with contextlib.suppress(ValueError):
            end_date = datetime.strptime(request.end_date, "%Y-%m-%d")

    # Generate tickets using AI with sprint planning FIRST
    # This way we don't delete existing tickets if generation fails
    ticket_result = await architecture_generator.generate_tickets_from_architecture(
        architecture=architecture.to_dict(),
        prd_analysis=prd_data,
        developers=developers,
        project_name=project.name,
        start_date=start_date,
        end_date=end_date,
    )

    # Check if we got tickets - if not, return error without deleting anything
    tickets = ticket_result.get("tickets", [])
    if not tickets:
        return {
            "success": False,
            "error": "AI failed to generate tickets. Existing tickets preserved.",
            "tickets_created": 0,
            "sprints_created": 0,
        }

    # NOW delete existing work items and sprints for this project
    # We have new tickets ready, so safe to delete old ones
    db.query(WorkItem).filter(WorkItem.project_id == project_id).delete(synchronize_session=False)
    db.query(Sprint).filter(Sprint.project_id == project_id).delete(synchronize_session=False)
    db.commit()

    # Create sprints if timeline is provided
    sprints_created = []
    sprint_map = {}  # sprint_number -> Sprint object

    if start_date and end_date:
        sprints_data = ticket_result.get("sprints", [])
        for sprint_data in sprints_data:
            sprint = Sprint(
                project_id=project_id,
                name=sprint_data.get("name", f"Sprint {sprint_data.get('number', 1)}"),
                goal=sprint_data.get("goal", ""),
                status=SprintStatus.PLANNING.value,
                start_date=datetime.strptime(sprint_data["start_date"], "%Y-%m-%d")
                if sprint_data.get("start_date")
                else None,
                end_date=datetime.strptime(sprint_data["end_date"], "%Y-%m-%d")
                if sprint_data.get("end_date")
                else None,
                capacity_hours=sprint_data.get("capacity_hours"),
            )
            db.add(sprint)
            db.commit()
            db.refresh(sprint)
            sprints_created.append(sprint)
            sprint_map[sprint_data.get("number", 1)] = sprint

    # Create work items in database
    created_tickets = []
    # Get the key prefix from project, or generate from project name
    key_prefix = getattr(project, "key_prefix", None) or (
        project.name[:4].upper() if project.name else "PROJ"
    )
    # Find max existing number for this prefix across ALL projects
    existing_keys = db.query(WorkItem.key).filter(WorkItem.key.like(f"{key_prefix}-%")).all()
    max_number = 0
    for (k,) in existing_keys:
        try:
            num = int(k.split("-")[-1])
            if num > max_number:
                max_number = num
        except (ValueError, IndexError):
            pass

    for idx, ticket_data in enumerate(ticket_result.get("tickets", [])):
        # Get next item number
        item_number = max_number + idx + 1
        key = f"{key_prefix}-{item_number}"

        # Determine sprint_id
        sprint_id = None
        sprint_number = ticket_data.get("sprint_number")
        if sprint_number and sprint_number in sprint_map:
            sprint_id = sprint_map[sprint_number].id

        work_item = WorkItem(
            project_id=project_id,
            key=key,
            type=ticket_data.get("type", "task"),
            title=ticket_data.get("title", "Generated Task"),
            description=ticket_data.get("description", ""),
            status="backlog" if not sprint_id else "todo",
            estimated_hours=ticket_data.get("estimated_hours", 8),
            remaining_hours=ticket_data.get("estimated_hours", 8),
            story_points=ticket_data.get("story_points", 3),
            priority=ticket_data.get("priority", "medium"),
            assignee_id=ticket_data.get("assignee_id"),
            sprint_id=sprint_id,
            tags=ticket_data.get("tags", []),
            acceptance_criteria=[],
        )

        db.add(work_item)
        db.commit()
        db.refresh(work_item)

        # Get assignee name
        assignee_name = "Unassigned"
        if work_item.assignee_id:
            assignee = db.query(Developer).filter(Developer.id == work_item.assignee_id).first()
            if assignee:
                assignee_name = assignee.name

        # Get sprint name
        sprint_name = "Backlog"
        if work_item.sprint_id:
            sprint = db.query(Sprint).filter(Sprint.id == work_item.sprint_id).first()
            if sprint:
                sprint_name = sprint.name

        created_tickets.append(
            {
                "id": work_item.id,
                "key": work_item.key,
                "type": work_item.type,
                "title": work_item.title,
                "description": work_item.description,
                "status": work_item.status,
                "story_points": work_item.story_points,
                "priority": work_item.priority,
                "assignee_id": work_item.assignee_id,
                "assignee_name": assignee_name,
                "assignee_reasoning": ticket_data.get("assignee_reasoning", ""),
                "sprint_id": work_item.sprint_id,
                "sprint_name": sprint_name,
                "sprint_number": sprint_number,
            }
        )

    # Update epic hours for all epics in this project
    # This calculates total hours from all child stories
    epics = (
        db.query(WorkItem).filter(WorkItem.project_id == project_id, WorkItem.type == "epic").all()
    )

    for epic in epics:
        # Sum all work items' estimated_hours that belong to this epic (stories, tasks, bugs)
        total_hours = (
            db.query(func.coalesce(func.sum(WorkItem.estimated_hours), 0))
            .filter(WorkItem.epic_id == epic.id, WorkItem.type.in_(["user_story", "task", "bug"]))
            .scalar()
        )

        epic.estimated_hours = total_hours
        epic.updated_at = datetime.utcnow()

    # Mark architecture as selected
    architecture.is_selected = True
    architecture.selected_at = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "architecture_id": architecture.id,
        "tickets_created": len(created_tickets),
        "tickets": created_tickets,
        "sprints": [
            {
                "id": s.id,
                "name": s.name,
                "start_date": s.start_date.isoformat() if s.start_date else None,
                "end_date": s.end_date.isoformat() if s.end_date else None,
            }
            for s in sprints_created
        ],
        "total_story_points": ticket_result.get("total_story_points", 0),
        "total_estimated_hours": ticket_result.get("total_estimated_hours", 0),
        "sprint_recommendation": ticket_result.get("sprint_recommendation", ""),
    }


@router.post("/projects/{project_id}/generate-tickets-preview")
async def preview_generated_tickets(
    project_id: int,
    request: CommitArchitectureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Preview tickets that would be generated without committing (requires auth)
    """
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get architecture
    architecture = (
        db.query(Architecture)
        .filter(Architecture.id == request.architecture_id, Architecture.project_id == project_id)
        .first()
    )
    if not architecture:
        raise HTTPException(status_code=404, detail="Architecture not found")

    # Get PRD analysis for the project (to enrich ticket generation)
    prd_analysis = (
        db.query(PRDAnalysis)
        .filter(PRDAnalysis.project_id == project_id)
        .order_by(PRDAnalysis.created_at.desc())
        .first()
    )
    prd_data = prd_analysis.to_dict() if prd_analysis else None

    # Get project developers
    developers = []
    result = db.execute(
        select(
            Developer.id,
            Developer.name,
            Developer.email,
            project_developers.c.role,
            project_developers.c.responsibilities,
        )
        .join(project_developers, Developer.id == project_developers.c.developer_id)
        .where(project_developers.c.project_id == project_id)
    ).all()

    for row in result:
        developers.append(
            {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "role": row.role,
                "responsibilities": row.responsibilities,
            }
        )

    # Generate tickets preview
    ticket_result = await architecture_generator.generate_tickets_from_architecture(
        architecture=architecture.to_dict(),
        prd_analysis=prd_data,
        developers=developers,
        project_name=project.name,
    )

    return {
        "preview": True,
        "tickets": ticket_result.get("tickets", []),
        "total_story_points": ticket_result.get("total_story_points", 0),
        "total_estimated_hours": ticket_result.get("total_estimated_hours", 0),
        "sprint_recommendation": ticket_result.get("sprint_recommendation", ""),
        "developers": developers,
    }


def _slugify_filename(name: str) -> str:
    """Conservative slug for use inside Content-Disposition filename."""
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "project").strip("_")
    return slug or "project"


def _empty_starter_suggestions(week_dates: list[date]) -> dict:
    """Pre-filled scaffold for the no-PRD path.

    Includes one MILESTONE (parser.py rejects files without any milestone
    week dates), two EPICs, and two TASKs under each — every column populated
    so the user can see the expected shape and replace cells as they go.

    All effort/week-hours math clamps to the available week range so the
    file passes parser.py's effort_mismatch check on re-upload regardless
    of how short the user's date window is.
    """
    weeks = [w.isoformat() for w in week_dates]
    n = len(weeks)

    def task_weeks(start: int, span: int, per_week: int) -> tuple[float, dict[str, float]]:
        """Distribute `per_week` hours across `span` consecutive weeks
        starting at index `start`. Clamps to the available range so the
        sum always equals effort_hrs even with very short windows."""
        end = min(start + span, n)
        # If start is past the end of the range, clamp to the last week.
        if end <= start:
            return float(per_week), {weeks[-1]: float(per_week)}
        wh = {weeks[i]: float(per_week) for i in range(start, end)}
        return sum(wh.values()), wh

    t1_total, t1_wh = task_weeks(0, 1, 8)
    t2_total, t2_wh = task_weeks(0, 2, 8)
    t3_total, t3_wh = task_weeks(1, 2, 12)
    t4_total, t4_wh = task_weeks(2, 2, 12)

    return {
        "milestones": [{"name": "Phase 1", "start_week": weeks[0], "end_week": weeks[-1]}],
        "epics": [
            {
                "name": "Foundation & Setup",
                "milestone": "Phase 1",
                "description": "Initial scaffolding, environment, and developer tooling.",
            },
            {
                "name": "Core Features",
                "milestone": "Phase 1",
                "description": "Primary user-facing functionality.",
            },
        ],
        "tasks": [
            {
                "name": "Project scaffolding",
                "description": "Set up repo structure, base frameworks, and folder conventions.",
                "milestone": "Phase 1",
                "epic": "Foundation & Setup",
                "priority": "High",
                "effort_hrs": t1_total,
                "week_hours": t1_wh,
                "assignee": "Jane Doe",
            },
            {
                "name": "CI/CD pipeline",
                "description": "Lint, test, and deploy pipelines for the main branches.",
                "milestone": "Phase 1",
                "epic": "Foundation & Setup",
                "priority": "Medium",
                "effort_hrs": t2_total,
                "week_hours": t2_wh,
                "assignee": "John Smith",
            },
            {
                "name": "User authentication",
                "description": "Login, signup, and session management.",
                "milestone": "Phase 1",
                "epic": "Core Features",
                "priority": "High",
                "effort_hrs": t3_total,
                "week_hours": t3_wh,
                "assignee": "Jane Doe",
            },
            {
                "name": "Dashboard UI",
                "description": "Primary landing dashboard with key metrics.",
                "milestone": "Phase 1",
                "epic": "Core Features",
                "priority": "Medium",
                "effort_hrs": t4_total,
                "week_hours": t4_wh,
                "assignee": "John Smith",
            },
        ],
    }


@router.post("/projects/{project_id}/generate-roadmap-template")
async def generate_roadmap_template(
    project_id: int,
    request: GenerateRoadmapTemplateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_capability("project.ai.write")),
):
    """
    Generate a roadmap .xlsx template (requires `project.ai.write`).

    If the project has a PRD analysis, the LLM seeds the file with suggested
    milestones / epics / tasks. Otherwise the user gets a blank scaffold with
    the correct columns and one placeholder milestone — they fill it in and
    re-upload via POST /api/roadmap/parse-file.
    """
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        start_date = date.fromisoformat(request.start_date)
        end_date = date.fromisoformat(request.end_date)
    except ValueError as e:
        raise HTTPException(
            status_code=400, detail="start_date and end_date must be YYYY-MM-DD"
        ) from e

    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date")

    week_dates = build_week_dates(start_date, end_date)
    if not week_dates:
        raise HTTPException(status_code=400, detail="Date range produced zero weeks")

    prd_analysis = (
        db.query(PRDAnalysis)
        .filter(PRDAnalysis.project_id == project_id)
        .order_by(PRDAnalysis.created_at.desc())
        .first()
    )

    # Two paths: AI-seeded (PRD exists) vs blank scaffold (no PRD).
    # The blank scaffold path skips the LLM entirely and skips persistence —
    # there's nothing AI-derived to save.
    if prd_analysis is None:
        suggestions = _empty_starter_suggestions(week_dates)
        persist = False
    else:
        prd_data = prd_analysis.to_dict()
        # to_dict() omits prd_content for size reasons; load it from the row so
        # the LLM gets the full text.
        prd_data["prd_content"] = prd_analysis.prd_content

        try:
            suggestions = await roadmap_generator.generate_suggestions(
                prd_analysis=prd_data,
                project_name=project.name,
                week_dates=week_dates,
                sprint_weeks=request.sprint_weeks,
            )
        except ValueError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to generate roadmap suggestions: {str(e)}"
            ) from e
        persist = True

    # Persist (upsert latest) before rendering, so a transient render error
    # doesn't lose the AI output. Only applies to the AI-seeded path.
    if persist:
        existing = (
            db.query(RoadmapTemplate).filter(RoadmapTemplate.project_id == project_id).first()
        )
        if existing:
            existing.start_date = start_date
            existing.end_date = end_date
            existing.sprint_weeks = request.sprint_weeks
            existing.suggestions = suggestions
            existing.updated_at = datetime.utcnow()
        else:
            existing = RoadmapTemplate(
                project_id=project_id,
                start_date=start_date,
                end_date=end_date,
                sprint_weeks=request.sprint_weeks,
                suggestions=suggestions,
            )
            db.add(existing)
        db.commit()

    xlsx_bytes = roadmap_generator.build_xlsx(suggestions, week_dates)

    filename = f"{_slugify_filename(project.name)}_roadmap_template.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/projects/{project_id}/roadmap-template")
def get_roadmap_template(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return metadata for the saved roadmap template, or 404 if none exists."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    template = db.query(RoadmapTemplate).filter(RoadmapTemplate.project_id == project_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="No roadmap template saved for this project")

    return template.to_dict()


@router.get("/projects/{project_id}/roadmap-template/download")
def download_roadmap_template(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-render the saved roadmap template and stream the .xlsx."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    template = db.query(RoadmapTemplate).filter(RoadmapTemplate.project_id == project_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="No roadmap template saved for this project")

    week_dates = build_week_dates(template.start_date, template.end_date)
    xlsx_bytes = roadmap_generator.build_xlsx(template.suggestions, week_dates)

    filename = f"{_slugify_filename(project.name)}_roadmap_template.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
