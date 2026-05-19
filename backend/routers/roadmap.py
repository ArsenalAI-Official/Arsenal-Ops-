"""
Roadmap Router - Endpoints for roadmap file upload and parsing
Handles Excel roadmap files for bulk task creation
"""

import sys
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

sys.path.append("..")
from sqlalchemy import func

from database import get_db
from logging_config import setup_logger
from models.developer import Developer
from models.project import Project
from models.sprint import Sprint
from models.user import User
from models.work_item import WorkItem, WorkItemType
from parser import parse as parse_roadmap
from routers.auth import get_current_user
from services.roadmap_ai_parser import excel_to_readable_text, get_roadmap_ai_parser

logger = setup_logger("roadmap")

# NOTE: Roadmap bulk creation does NOT send email notifications to assignees
# For bulk ticket creation from roadmaps, email notifications are disabled
# to avoid notification spam. This can be re-enabled in future if needed.

router = APIRouter(prefix="/api/roadmap", tags=["Roadmap"])


class RoadmapSummary(BaseModel):
    total_epics: int
    total_tasks: int
    total_assignees: int
    total_sprints: int = 0
    assignees: list[str]
    timeline: dict[str, Any]
    conflicts: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    schedule: dict[str, Any]


class RoadmapParseResponse(BaseModel):
    status: str
    summary: RoadmapSummary
    parsed_data: dict[str, Any]  # Full parse output for later commit


class RoadmapCommitRequest(BaseModel):
    project_id: int
    parsed_data: dict[str, Any]


def get_next_work_item_number(db: Session, key_prefix: str) -> int:
    """Get the next work item number for a key prefix. Delegates to the shared
    routers.workitems helper so the Postgres-vs-SQLite split stays in one place.
    """
    from routers.workitems import get_next_item_number

    return get_next_item_number(db, key_prefix)


def create_work_item(
    db: Session,
    project: Project,
    title: str,
    description: str,
    item_type: str,
    priority: str,
    effort_hrs: float | None,
    assignee_id: int | None,
    epic_id: int | None = None,
    acceptance_criteria: list[str] | None = None,
) -> WorkItem:
    """Helper to create a work item with auto-generated key"""

    # Generate key
    next_num = get_next_work_item_number(db, project.key_prefix)
    key = f"{project.key_prefix}-{next_num}"

    # Create work item
    # Handle effort_hrs: convert to int, handle None and 0 properly
    hours = int(effort_hrs) if effort_hrs is not None else 0
    work_item = WorkItem(
        project_id=project.id,
        key=key,
        type=item_type,
        title=title,
        description=description,
        priority=priority,
        status="todo",
        estimated_hours=hours,
        remaining_hours=hours,
        assignee_id=assignee_id,
        epic_id=epic_id,
        acceptance_criteria=acceptance_criteria or [],
    )

    db.add(work_item)
    db.flush()  # Get the ID without committing
    return work_item


@router.post("/parse-file")
async def parse_roadmap_file(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    sprint_weeks: int = Form(default=2),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload and parse a roadmap Excel file
    Returns: Summary of epics, tasks, assignees, timeline, conflicts, warnings, and sprints
    """
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate sprint_weeks
    if sprint_weeks < 1 or sprint_weeks > 6:
        raise HTTPException(status_code=400, detail="Sprint weeks must be between 1 and 6")

    # Validate file type
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")

    # Read file into memory
    try:
        file_content = await file.read()

        # Write to temp file for parser
        import tempfile

        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
            tmp.write(file_content)
            tmp_path = tmp.name

        # Try the standard structured parser first
        parser_used = "standard"
        parsed_result = None
        parse_error = None

        try:
            parsed_result = parse_roadmap(tmp_path, sprint_weeks=sprint_weeks)
        except Exception as e:
            parse_error = str(e)
            logger.debug(f"Standard parser failed: {parse_error}")
            logger.debug("Attempting AI-powered parser as fallback...")

            # Fallback to AI parser
            try:
                ai_parser = get_roadmap_ai_parser()
                excel_text = excel_to_readable_text(tmp_path)
                parsed_result = await ai_parser.parse_excel_with_ai(excel_text, file.filename)
                parser_used = "ai"
                logger.debug(f"AI parser succeeded for {file.filename}")
            except Exception as ai_error:
                logger.debug(f"AI parser failed: {str(ai_error)}")
                raise ValueError(
                    f"Both structured and AI parsers failed. Standard: {parse_error}, AI: {str(ai_error)}"
                ) from ai_error

        # Add parser metadata for debugging
        if "meta" not in parsed_result:
            parsed_result["meta"] = {}
        parsed_result["meta"]["parser_used"] = parser_used

        # Clean up temp file
        import os

        os.unlink(tmp_path)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse roadmap: {str(e)}") from e

    # Extract summary information
    tickets = parsed_result.get("tickets", [])
    schedule = parsed_result.get("schedule", {})
    conflicts = parsed_result.get("conflicts", [])
    warnings = parsed_result.get("warnings", [])

    # Count unique epics
    epics = set()
    for ticket in tickets:
        if ticket.get("epic"):
            epics.add(ticket["epic"])

    # Count assignees
    assignees = set()
    for ticket in tickets:
        if ticket.get("assignee"):
            assignees.add(ticket["assignee"])

    # Get timeline
    meta = parsed_result.get("meta", {})
    week_range = meta.get("week_range", {})

    # Build summary
    summary = RoadmapSummary(
        total_epics=len(epics),
        total_tasks=len(tickets),
        total_assignees=len(assignees),
        total_sprints=meta.get("total_sprints", 0),
        assignees=sorted(list(assignees)),
        timeline={
            "start": week_range.get("start"),
            "end": week_range.get("end"),
            "duration_weeks": meta.get("total_weeks", 0),
        },
        conflicts=[
            {
                "assignee": c.get("assignee"),
                "week": c.get("week"),
                "total_hrs": c.get("total_hrs"),
                "tasks": c.get("tasks", []),
                "overbooked": c.get("overbooked"),
            }
            for c in conflicts
        ],
        warnings=[
            {
                "row": w.get("row"),
                "task": w.get("task"),
                "issue": w.get("issue"),
                "detail": w.get("detail"),
            }
            for w in warnings
        ],
        schedule=schedule,
    )

    return RoadmapParseResponse(status="success", summary=summary, parsed_data=parsed_result)


@router.post("/commit")
def commit_roadmap_tickets(
    request: RoadmapCommitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create work items from parsed roadmap data
    Creates epics first, then tasks linked to epics
    Handles assignee lookup with fallback to current user
    """
    # Verify project exists
    project = db.query(Project).filter(Project.id == request.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        # Get current user's developer profile
        current_dev = db.query(Developer).filter(Developer.email == current_user.email).first()

        if not current_dev:
            raise HTTPException(status_code=400, detail="Current user is not a team member")

        parsed_data = request.parsed_data
        tickets = parsed_data.get("tickets", [])

        # Debug: log the number of tickets received
        logger.info(f"Received {len(tickets)} tickets from parsed_data")
        logger.debug(f"Parsed data keys: {list(parsed_data.keys())}")
        if not tickets:
            logger.warning("No tickets found! parsed_data structure:")
            for key, value in parsed_data.items():
                if key != "schedule" and key != "meta":  # Skip large nested structures
                    logger.debug(f"  {key}: {type(value)} - {str(value)[:100]}")

        # Step 1: Create epics
        # Build a map of epic names to their work item IDs
        epic_map = {}  # epic_name -> WorkItem
        seen_epics = set()

        for ticket in tickets:
            epic_name = ticket.get("epic")
            if epic_name and epic_name not in seen_epics:
                seen_epics.add(epic_name)

                epic = create_work_item(
                    db=db,
                    project=project,
                    title=epic_name,
                    description=f"Epic: {epic_name}",
                    item_type=WorkItemType.EPIC.value,
                    priority="medium",  # Use "medium" by default, not hardcoded "high"
                    effort_hrs=None,
                    assignee_id=None,
                    epic_id=None,
                )
                epic_map[epic_name] = epic

        logger.info(f"Created {len(epic_map)} epics")

        # Step 2: Create tasks linked to epics
        created_tasks = 0
        assignee_not_found_count = 0

        for ticket in tickets:
            task_name = ticket.get("name")
            description = ticket.get("description", "")
            epic_name = ticket.get("epic")
            priority = ticket.get("priority", "medium")
            effort_hrs = ticket.get("effort_hrs")
            assignee_name = ticket.get("assignee")

            # Determine assignee - default to current_dev if no assignee in roadmap
            assignee_id = current_dev.id  # Always default to uploader

            if (
                assignee_name and assignee_name.strip()
            ):  # Only if assignee is specified and non-empty
                # Try to find developer by name
                assignee_dev = db.query(Developer).filter(Developer.name == assignee_name).first()

                if assignee_dev:
                    assignee_id = assignee_dev.id
                else:
                    # Developer not found - keep current_dev and count as not found
                    assignee_not_found_count += 1

            # Get epic_id
            epic_id = None
            if epic_name and epic_name in epic_map:
                epic_id = epic_map[epic_name].id

            # Create task
            task = create_work_item(
                db=db,
                project=project,
                title=task_name,
                description=description,
                item_type="user_story",
                priority=priority,
                effort_hrs=effort_hrs,
                assignee_id=assignee_id,
                epic_id=epic_id,
                acceptance_criteria=[],
            )

            created_tasks += 1
            logger.info(f"Created task #{created_tasks}: {task_name} (ID:{task.id})")

        logger.info(
            f"Created {created_tasks} tasks. Assignees not found: {assignee_not_found_count}"
        )

        # Step 3: Create sprints from parsed sprint data
        sprints_created = 0
        sprint_map = {}  # sprint_number -> Sprint object

        parsed_sprints = parsed_data.get("sprints", [])
        for sprint_data in parsed_sprints:
            sprint_num = sprint_data.get("number")
            start_week = sprint_data.get("start_week")
            end_week = sprint_data.get("end_week")

            # Convert week dates to datetime
            if start_week and end_week:
                try:
                    start_date = datetime.fromisoformat(start_week)
                    end_date = datetime.fromisoformat(end_week)

                    # Create sprint
                    sprint = Sprint(
                        project_id=request.project_id,
                        name=f"Sprint {sprint_num}",
                        goal=f"Sprint {sprint_num} ({start_week} to {end_week})",
                        start_date=start_date,
                        end_date=end_date,
                        status="planned",
                    )
                    db.add(sprint)
                    db.flush()  # Get the sprint ID
                    sprint_map[sprint_num] = sprint
                    sprints_created += 1
                    logger.info(f"Created Sprint {sprint_num}: {start_week} to {end_week}")
                except Exception as e:
                    logger.warning(f"Failed to create sprint {sprint_num}: {str(e)}")
                    continue

        # Step 4: Assign tasks to sprints
        # Build a map of task names to their work items for quick lookup
        task_map = {}  # task_name -> WorkItem
        for ticket in tickets:
            task_name = ticket.get("name")
            task = (
                db.query(WorkItem)
                .filter(
                    WorkItem.project_id == request.project_id,
                    WorkItem.title == task_name,
                    WorkItem.type == "user_story",
                )
                .first()
            )
            if task:
                task_map[task_name] = task

        # Assign tasks to sprints based on which sprints they span
        tasks_assigned_to_sprint = 0
        for sprint_data in parsed_sprints:
            sprint_num = sprint_data.get("number")
            sprint_tasks = sprint_data.get("tasks", [])

            if sprint_num not in sprint_map:
                continue

            sprint = sprint_map[sprint_num]
            for task_name in sprint_tasks:
                if task_name in task_map:
                    task = task_map[task_name]
                    task.sprint_id = sprint.id
                    # Set due date to sprint end date (Friday)
                    task.due_date = sprint.end_date
                    tasks_assigned_to_sprint += 1

        logger.info(f"Assigned {tasks_assigned_to_sprint} tasks to sprints")

        # Commit all changes
        db.commit()

        # Update epic hours for all epics in this project
        # This calculates total hours from all child stories
        epics = (
            db.query(WorkItem)
            .filter(
                WorkItem.project_id == request.project_id, WorkItem.type == WorkItemType.EPIC.value
            )
            .all()
        )

        for epic in epics:
            # Sum all work items' estimated_hours that belong to this epic (stories, tasks, bugs)
            total_hours = (
                db.query(func.coalesce(func.sum(WorkItem.estimated_hours), 0))
                .filter(
                    WorkItem.epic_id == epic.id,
                    WorkItem.type.in_(
                        [
                            WorkItemType.USER_STORY.value,
                            WorkItemType.TASK.value,
                            WorkItemType.BUG.value,
                        ]
                    ),
                )
                .scalar()
            )

            epic.estimated_hours = total_hours
            epic.updated_at = datetime.utcnow()

        # Final commit for epic hours
        db.commit()

        response_data = {
            "status": "success",
            "tickets_created": created_tasks,
            "epics_created": len(epic_map),
            "sprints_created": sprints_created,
            "tasks_assigned_to_sprints": tasks_assigned_to_sprint,
            "assignees_not_found": assignee_not_found_count,
            "message": f"Created {len(epic_map)} epics, {created_tasks} tasks, and {sprints_created} sprints from roadmap",
        }

        logger.debug(f"Returning response: {response_data}")
        return response_data

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to commit roadmap: {str(e)}") from e
