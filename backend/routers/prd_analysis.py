"""
PRD Analysis Router - Endpoints for PRD upload, analysis, and architecture generation
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select

import sys
sys.path.append('..')
from database import get_db
from models.project import Project
from models.architecture import Architecture, PRDAnalysis
from models.developer import Developer, project_developers
from models.work_item import WorkItem
from models.sprint import Sprint, SprintStatus
from models.user import User
from services.prd_processor import prd_processor
from sqlalchemy import func
from services.architecture_generator import architecture_generator
from routers.auth import get_current_user

router = APIRouter(prefix="/api/prd", tags=["PRD Analysis"])


class TextAnalysisRequest(BaseModel):
    project_id: int
    prd_content: str
    additional_context: Optional[str] = ""
    start_date: Optional[str] = None  # ISO format: YYYY-MM-DD
    end_date: Optional[str] = None    # ISO format: YYYY-MM-DD


class ArchitectureUpdate(BaseModel):
    mermaid_code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class CommitArchitectureRequest(BaseModel):
    architecture_id: int
    start_date: Optional[str] = None  # ISO format: YYYY-MM-DD
    end_date: Optional[str] = None    # ISO format: YYYY-MM-DD


class AIRefineRequest(BaseModel):
    current_mermaid_code: str
    change_instructions: str  # Plain English description of changes needed


@router.post("/analyze-file")
async def analyze_prd_file(
    project_id: int = Form(...),
    additional_context: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload and analyze a PRD file (PDF or Word) (requires auth)
    Returns: PRD analysis and generated architectures
    """
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Read and process file
    try:
        file_content = await file.read()
        prd_data = prd_processor.process_prd(file_content, file.filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")
    
    # Analyze PRD with AI
    analysis = await architecture_generator.analyze_prd(
        prd_content=prd_data["cleaned_text"],
        project_name=project.name,
        additional_context=additional_context
    )
    
    # Store PRD analysis
    prd_analysis = PRDAnalysis(
        project_id=project_id,
        filename=file.filename,
        prd_content=prd_data["cleaned_text"],
        additional_context=additional_context,
        summary=analysis.get("summary"),
        key_features=analysis.get("key_features"),
        technical_requirements=analysis.get("technical_requirements"),
        cost_analysis=analysis.get("cost_analysis"),
        recommended_tools=analysis.get("recommended_tools"),
        risks=analysis.get("risks"),
        timeline=analysis.get("timeline")
    )
    db.add(prd_analysis)
    db.commit()
    db.refresh(prd_analysis)
    
    # Generate architectures
    architectures = await architecture_generator.generate_architectures(
        prd_content=prd_data["cleaned_text"],
        project_name=project.name,
        analysis=analysis
    )
    
    # Store architectures
    stored_architectures = []
    for arch_type in ["recommended", "alternative"]:
        if arch_type in architectures:
            arch_data = architectures[arch_type]
            architecture = Architecture(
                project_id=project_id,
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
                time_to_implement=arch_data.get("time_to_implement", "")
            )
            db.add(architecture)
            db.commit()
            db.refresh(architecture)
            stored_architectures.append(architecture.to_dict())
    
    return {
        "analysis": prd_analysis.to_dict(),
        "architectures": stored_architectures
    }


@router.post("/analyze-text")
async def analyze_prd_text(
    request: TextAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Analyze PRD from text input (requires auth)
    Returns: PRD analysis and generated architectures
    """
    # Verify project exists
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Analyze PRD with AI
    analysis = await architecture_generator.analyze_prd(
        prd_content=request.prd_content,
        project_name=project.name,
        additional_context=request.additional_context
    )
    
    # Store PRD analysis
    prd_analysis = PRDAnalysis(
        project_id=request.project_id,
        filename=None,
        prd_content=request.prd_content,
        additional_context=request.additional_context,
        summary=analysis.get("summary"),
        key_features=analysis.get("key_features"),
        technical_requirements=analysis.get("technical_requirements"),
        cost_analysis=analysis.get("cost_analysis"),
        recommended_tools=analysis.get("recommended_tools"),
        risks=analysis.get("risks"),
        timeline=analysis.get("timeline")
    )
    db.add(prd_analysis)
    db.commit()
    db.refresh(prd_analysis)
    
    # Generate architectures
    architectures = await architecture_generator.generate_architectures(
        prd_content=request.prd_content,
        project_name=project.name,
        analysis=analysis
    )
    
    # Store architectures
    stored_architectures = []
    for arch_type in ["recommended", "alternative"]:
        if arch_type in architectures:
            arch_data = architectures[arch_type]
            architecture = Architecture(
                project_id=request.project_id,
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
                time_to_implement=arch_data.get("time_to_implement", "")
            )
            db.add(architecture)
            db.commit()
            db.refresh(architecture)
            stored_architectures.append(architecture.to_dict())
    
    return {
        "analysis": prd_analysis.to_dict(),
        "architectures": stored_architectures
    }


@router.get("/projects/{project_id}/architectures")
def get_project_architectures(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all architectures for a project (requires auth)"""
    architectures = db.query(Architecture).filter(
        Architecture.project_id == project_id
    ).order_by(Architecture.created_at.desc()).all()
    
    return [arch.to_dict() for arch in architectures]


@router.get("/projects/{project_id}/analysis")
def get_project_analysis(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get the latest PRD analysis for a project (requires auth)"""
    analysis = db.query(PRDAnalysis).filter(
        PRDAnalysis.project_id == project_id
    ).order_by(PRDAnalysis.created_at.desc()).first()
    
    if not analysis:
        raise HTTPException(status_code=404, detail="No analysis found for this project")
    
    return analysis.to_dict()


@router.get("/architectures/{architecture_id}")
def get_architecture(
    architecture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
    current_user: User = Depends(get_current_user)
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
        project_name=project_name
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
        "ai_notes": refined.get("ai_notes", "")
    }


@router.post("/architectures/{architecture_id}/select")
def select_architecture(
    architecture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Select an architecture for the project (requires auth)"""
    print(f"[SELECT] Request received for architecture_id={architecture_id}, user={current_user.id}")
    try:
        print(f"[SELECT] Querying architecture...")
        architecture = db.query(Architecture).filter(Architecture.id == architecture_id).first()
        if not architecture:
            raise HTTPException(status_code=404, detail="Architecture not found")
        
        print(f"[SELECT] Found architecture project_id={architecture.project_id}, deselecting others...")
        # Deselect other architectures for this project
        db.query(Architecture).filter(
            Architecture.project_id == architecture.project_id
        ).update({"is_selected": False, "selected_at": None})
        
        print(f"[SELECT] Selecting architecture {architecture_id}...")
        architecture.is_selected = True
        architecture.selected_at = datetime.utcnow()
        db.commit()
        db.refresh(architecture)
        
        print(f"[SELECT] Success! Returning response...")
        return architecture.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] select_architecture failed: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to select architecture: {str(e)}")


@router.post("/projects/{project_id}/commit-architecture")
async def commit_architecture(
    project_id: int,
    request: CommitArchitectureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
    architecture = db.query(Architecture).filter(
        Architecture.id == request.architecture_id,
        Architecture.project_id == project_id
    ).first()
    if not architecture:
        raise HTTPException(status_code=404, detail="Architecture not found")
    
    # Get PRD analysis for the project (to enrich ticket generation)
    prd_analysis = db.query(PRDAnalysis).filter(
        PRDAnalysis.project_id == project_id
    ).order_by(PRDAnalysis.created_at.desc()).first()
    prd_data = prd_analysis.to_dict() if prd_analysis else None
    
    # Get project developers with their roles
    developers = []
    result = db.execute(
        select(
            Developer.id,
            Developer.name,
            Developer.email,
            project_developers.c.role,
            project_developers.c.responsibilities
        )
        .join(project_developers, Developer.id == project_developers.c.developer_id)
        .where(project_developers.c.project_id == project_id)
    ).all()
    
    for row in result:
        developers.append({
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "role": row.role,
            "responsibilities": row.responsibilities
        })
    
    # Parse timeline dates
    start_date = None
    end_date = None
    if request.start_date:
        try:
            start_date = datetime.strptime(request.start_date, "%Y-%m-%d")
        except ValueError:
            pass
    if request.end_date:
        try:
            end_date = datetime.strptime(request.end_date, "%Y-%m-%d")
        except ValueError:
            pass
    
    # Generate tickets using AI with sprint planning FIRST
    # This way we don't delete existing tickets if generation fails
    ticket_result = await architecture_generator.generate_tickets_from_architecture(
        architecture=architecture.to_dict(),
        prd_analysis=prd_data,
        developers=developers,
        project_name=project.name,
        start_date=start_date,
        end_date=end_date
    )
    
    # Check if we got tickets - if not, return error without deleting anything
    tickets = ticket_result.get("tickets", [])
    if not tickets:
        return {
            "success": False,
            "error": "AI failed to generate tickets. Existing tickets preserved.",
            "tickets_created": 0,
            "sprints_created": 0
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
                start_date=datetime.strptime(sprint_data["start_date"], "%Y-%m-%d") if sprint_data.get("start_date") else None,
                end_date=datetime.strptime(sprint_data["end_date"], "%Y-%m-%d") if sprint_data.get("end_date") else None,
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
    key_prefix = getattr(project, 'key_prefix', None) or (project.name[:4].upper() if project.name else "PROJ")
    # Find max existing number for this prefix across ALL projects
    existing_keys = db.query(WorkItem.key).filter(WorkItem.key.like(f"{key_prefix}-%")).all()
    max_number = 0
    for (k,) in existing_keys:
        try:
            num = int(k.split("-")[-1])
            if num > max_number:
                max_number = num
        except:
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
            acceptance_criteria=[]
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
        
        created_tickets.append({
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
            "sprint_number": sprint_number
        })
    
    # Update epic hours for all epics in this project
    # This calculates total hours from all child stories
    epics = db.query(WorkItem).filter(
        WorkItem.project_id == project_id,
        WorkItem.type == 'epic'
    ).all()
    
    for epic in epics:
        # Sum all work items' estimated_hours that belong to this epic (stories, tasks, bugs)
        total_hours = db.query(func.coalesce(func.sum(WorkItem.estimated_hours), 0)).filter(
            WorkItem.epic_id == epic.id,
            WorkItem.type.in_(['user_story', 'task', 'bug'])
        ).scalar()
        
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
        "sprints": [{"id": s.id, "name": s.name, "start_date": s.start_date.isoformat() if s.start_date else None, "end_date": s.end_date.isoformat() if s.end_date else None} for s in sprints_created],
        "total_story_points": ticket_result.get("total_story_points", 0),
        "total_estimated_hours": ticket_result.get("total_estimated_hours", 0),
        "sprint_recommendation": ticket_result.get("sprint_recommendation", "")
    }


@router.post("/projects/{project_id}/generate-tickets-preview")
async def preview_generated_tickets(
    project_id: int,
    request: CommitArchitectureRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Preview tickets that would be generated without committing (requires auth)
    """
    # Get project
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get architecture
    architecture = db.query(Architecture).filter(
        Architecture.id == request.architecture_id,
        Architecture.project_id == project_id
    ).first()
    if not architecture:
        raise HTTPException(status_code=404, detail="Architecture not found")
    
    # Get PRD analysis for the project (to enrich ticket generation)
    prd_analysis = db.query(PRDAnalysis).filter(
        PRDAnalysis.project_id == project_id
    ).order_by(PRDAnalysis.created_at.desc()).first()
    prd_data = prd_analysis.to_dict() if prd_analysis else None
    
    # Get project developers
    developers = []
    result = db.execute(
        select(
            Developer.id,
            Developer.name,
            Developer.email,
            project_developers.c.role,
            project_developers.c.responsibilities
        )
        .join(project_developers, Developer.id == project_developers.c.developer_id)
        .where(project_developers.c.project_id == project_id)
    ).all()
    
    for row in result:
        developers.append({
            "id": row.id,
            "name": row.name,
            "email": row.email,
            "role": row.role,
            "responsibilities": row.responsibilities
        })
    
    # Generate tickets preview
    ticket_result = await architecture_generator.generate_tickets_from_architecture(
        architecture=architecture.to_dict(),
        prd_analysis=prd_data,
        developers=developers,
        project_name=project.name
    )
    
    return {
        "preview": True,
        "tickets": ticket_result.get("tickets", []),
        "total_story_points": ticket_result.get("total_story_points", 0),
        "total_estimated_hours": ticket_result.get("total_estimated_hours", 0),
        "sprint_recommendation": ticket_result.get("sprint_recommendation", ""),
        "developers": developers
    }
