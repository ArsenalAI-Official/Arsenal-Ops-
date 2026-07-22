"""
Developers Router - CRUD operations for developers
"""

import sys
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from time_utils import utcnow

sys.path.append("..")
from database import get_db
from models.developer import Developer
from models.user import User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/developers", tags=["Developers"])


def _get_internal_developer_or_404(current_user: User, db: Session) -> Developer:
    """Resolve the current user's Developer row, gated to internal employees.

    The `Developer.is_external` flag is the canonical signal for "company
    employee" — kept in sync by `reconcile_internal_developers()` on
    startup (see `database.py`) which reads `ALLOWED_EMAIL_DOMAINS` and
    flips developers whose email matches the configured domains to
    `is_external = False`.

    Returns 404 — not 403 — for both "no developer profile" and
    "external developer". A 404 is what MyCapacityCard's silent-hide
    UX already keys off (`MyCapacityCard/index.tsx:27`), so external
    contractors see the same "no card" state as users with no Developer
    row at all. No frontend changes needed.
    """
    dev = db.query(Developer).filter(Developer.email == current_user.email).first()
    if not dev or dev.is_external:
        raise HTTPException(status_code=404, detail="No internal developer profile for this user")
    return dev


class DeveloperCreate(BaseModel):
    name: str
    email: str
    github_username: str | None = None
    avatar_url: str | None = None


class DeveloperUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    github_username: str | None = None
    avatar_url: str | None = None


class DeveloperResponse(BaseModel):
    id: int
    name: str
    email: str
    github_username: str | None
    avatar_url: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.post("/", response_model=DeveloperResponse)
def create_developer(
    developer: DeveloperCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new developer (requires auth)"""
    # Check if email already exists
    existing = db.query(Developer).filter(Developer.email == developer.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Developer with this email already exists")

    new_developer = Developer(
        name=developer.name,
        email=developer.email,
        github_username=developer.github_username,
        avatar_url=developer.avatar_url,
    )
    db.add(new_developer)
    db.commit()
    db.refresh(new_developer)
    return new_developer


@router.get("/", response_model=list[DeveloperResponse])
def list_developers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all developers (requires auth)"""
    developers = db.query(Developer).all()
    return developers


@router.get("/me/capacity")
def get_my_capacity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Weekly capacity for the currently-logged-in developer (cross-project,
    Saturday → Friday UTC). Same shape as a single row from
    /api/admin/developers/capacity. Returns 404 if the caller isn't an
    internal employee (no Developer row, or `is_external == True` — see
    `_get_internal_developer_or_404`). The home card silently hides on
    404 so external contractors never see it."""
    from services.capacity_service import compute_capacity_breakdown, week_boundaries

    dev = _get_internal_developer_or_404(current_user, db)

    week_start, week_end = week_boundaries()
    breakdown = compute_capacity_breakdown(
        dev.assigned_work_items or [],
        week_start,
        db=db,
        developer_id=dev.id,
    )
    return {
        "developer_id": dev.id,
        "developer_name": dev.name,
        "developer_email": dev.email,
        "avatar_url": dev.avatar_url,
        "project_count": len(dev.projects) if dev.projects else 0,
        "specialization": getattr(dev, "specialization", None),
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        **breakdown,
    }


class TimesheetEntryResponse(BaseModel):
    id: int
    logged_at: str | None
    hours: int
    description: str | None
    work_item_title: str | None
    submitted_at: str | None
    synced: bool
    billable: bool


class TimesheetProjectResponse(BaseModel):
    project_id: int
    project_name: str
    # The project's admin-assigned category, surfaced as "Class" in the
    # Review modal (QuickBooks calls this dimension a Class). NULL when the
    # project has no category.
    category_name: str | None
    subtotal_hours: int
    entries: list[TimesheetEntryResponse]


class TimesheetClientResponse(BaseModel):
    qb_customer_id: str
    client_name: str
    subtotal_hours: int
    projects: list[TimesheetProjectResponse]


class MyTimesheetResponse(BaseModel):
    week_start: str
    week_end: str
    total_hours: int
    syncable_unsubmitted_count: int
    clients: list[TimesheetClientResponse]
    unlinked_projects: list[TimesheetProjectResponse]


class SubmitTimesheetFailure(BaseModel):
    entry_id: int
    error: str


class SubmitTimesheetResponse(BaseModel):
    """Outcome of POST /me/timesheet/submit.

    `status` mirrors the admin sync vocabulary so logs are coherent:
      - "ok"      → every picked entry landed in QB
      - "partial" → some entries failed (see `failed[]`); successes
                    are already committed
    """

    status: str
    submitted_count: int
    synced_count: int
    failed: list[SubmitTimesheetFailure]
    week_start: str
    week_end: str
    reason: str | None = None


@router.get("/me/timesheet", response_model=MyTimesheetResponse)
def get_my_timesheet(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Current Mon–Fri timesheet for the logged-in developer.

    Read-only data shape for the Review-and-Submit modal: hours grouped
    by QB Customer → Project, plus a separate `unlinked_projects`
    bucket for hours on projects without a QuickBooks customer link.
    Returns 404 if the user has no Developer record (admin-only user).
    """
    from services.timesheet_service import get_my_timesheet as _get_my_timesheet

    dev = _get_internal_developer_or_404(current_user, db)

    # Coerce explicitly so callers (including tests that invoke the
    # function directly without going through FastAPI's response-model
    # serializer) get a typed object back, not a raw dict.
    return MyTimesheetResponse(**_get_my_timesheet(db, dev))


@router.post("/me/timesheet/submit", response_model=SubmitTimesheetResponse)
def submit_my_timesheet(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Submit this week's hours and sync them to QuickBooks inline.

    No request body — the server picks the eligible entries
    (developer, Mon–Fri current week, QB-linked project, not yet synced)
    and POSTs each one to QuickBooks. Per-entry failures are returned
    in the `failed` list rather than as a 5xx; the dev clicks Submit
    again to retry just the failures.

    HTTP status codes:
      200 → "ok" or "partial" result (see `failed[]`)
      404 → no Developer profile for this user
      409 → another sync is in flight (admin force-sync or a different
            dev's concurrent submit). Retry shortly.
      503 → QuickBooks isn't connected yet
      500 → integration-level error (OAuth expired, service item
            missing). Reason includes humanized next step.
    """
    from services.timesheet_service import (
        SUBMIT_LOCKED,
        SUBMIT_NOT_CONNECTED,
    )
    from services.timesheet_service import (
        submit_my_timesheet as _submit_my_timesheet,
    )

    dev = _get_internal_developer_or_404(current_user, db)

    result = _submit_my_timesheet(db, dev)
    status = result.get("status")

    # Operational outcomes get distinct HTTP codes so the frontend can
    # render the right banner color without parsing the status string.
    if status == SUBMIT_NOT_CONNECTED:
        raise HTTPException(
            status_code=503, detail=result.get("reason") or "QuickBooks not connected"
        )
    if status == SUBMIT_LOCKED:
        raise HTTPException(
            status_code=409, detail=result.get("reason") or "Another sync is running"
        )
    if status == "error":
        raise HTTPException(
            status_code=500, detail=result.get("reason") or "QuickBooks submit failed"
        )

    # ok / partial: shape the response. Strip the `reason` field on
    # "ok" so the UI doesn't accidentally render an empty banner.
    return SubmitTimesheetResponse(
        status=status or "ok",
        submitted_count=int(result.get("submitted_count") or 0),
        synced_count=int(result.get("synced_count") or 0),
        failed=[SubmitTimesheetFailure(**f) for f in (result.get("failed") or [])],
        week_start=str(result.get("week_start") or ""),
        week_end=str(result.get("week_end") or ""),
        reason=result.get("reason") if status == "partial" else None,
    )


class TimesheetEntryEditRequest(BaseModel):
    """Patch body for editing a draft time entry.

    All fields optional; client sends only what's changing. `hours` is
    bounded the same way as `log-hours` (>0, ≤24) so dev typo'd 220h
    entries can't slip through here either.
    """

    hours: int | None = None
    description: str | None = None


class TimesheetBillableRequest(BaseModel):
    """Set the billable flag for a (client, day) group.

    The Review & Submit modal exposes one "Billable" checkbox per client
    per day; toggling it sends this body. The backend flips `billable`
    on every one of the caller's *draft* entries logged on `logged_at`
    whose project bills to `qb_customer_id`. Synced/submitted entries are
    left untouched (they're already in QuickBooks).
    """

    qb_customer_id: str
    logged_at: str  # ISO date (YYYY-MM-DD)
    billable: bool


def _recompute_work_item_hours(work_item, db: Session) -> None:
    """Recompute `work_items.logged_hours` from the live sum of TimeEntry
    rows and propagate the change to subtask parents / epics.

    Mirrors the recompute block in :func:`routers.workitems.log_hours`
    (lines 1718-1742 at the time of writing). Factored here only as an
    inline helper — same logic, called from the edit/delete paths so the
    rollup always runs after a TimeEntry mutation. If a third call site
    appears, lift this into `services/`.
    """
    from sqlalchemy import func as _func

    from models.time_entry import TimeEntry
    from models.work_item import WorkItemType
    from routers.workitems import propagate_from_subtask, update_epic_hours

    work_item.logged_hours = (
        db.query(_func.coalesce(_func.sum(TimeEntry.hours), 0))
        .filter(TimeEntry.work_item_id == work_item.id)
        .scalar()
    ) or 0
    work_item.remaining_hours = max(
        0, (work_item.estimated_hours or 0) - (work_item.logged_hours or 0)
    )
    work_item.updated_at = datetime.utcnow()
    db.commit()

    # Roll up:
    # - Subtasks bubble through to parent and (transitively) the epic
    #   via the subtask propagator.
    # - 2nd-level items (story/task/bug) bubble straight to their epic.
    # - Top-level epics are themselves the rollup target, no parent.
    if work_item.type == WorkItemType.SUBTASK.value and work_item.parent_id:
        propagate_from_subtask(work_item, db)
        db.commit()
    elif work_item.epic_id:
        # Hours change on a 2nd-level item still affects its epic's
        # rollup of "direct" hours.
        update_epic_hours(work_item.epic_id, db)
        db.commit()


def _resolve_editable_entry(entry_id: int, current_user: User, db: Session):
    """Common gate for PATCH/DELETE on a developer's own time entry.

    Returns the TimeEntry on success. Raises 404/403 on the failure
    paths the two routes share so the policy is in one place:

      - 404: entry doesn't exist, OR the user has no Developer profile.
      - 403: entry doesn't belong to this developer.
      - 403 (locked): entry is submitted_at SET or workforce_entry_id SET
        — the dev has already committed it to the QB pipeline. Editing
        post-submit would diverge from QuickBooks; editing post-sync
        would orphan a TimeActivity in QB.
    """
    from models.time_entry import TimeEntry

    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")

    # External devs (`is_external == True`) and users with no Developer
    # profile both get 404 here, matching the Review modal's gating
    # elsewhere — these endpoints don't exist for them.
    dev = _get_internal_developer_or_404(current_user, db)
    if entry.developer_id != dev.id:
        raise HTTPException(status_code=403, detail="You can only edit your own time entries.")

    if entry.workforce_entry_id is not None:
        raise HTTPException(
            status_code=403,
            detail=(
                "This entry is already synced to QuickBooks and can't be edited "
                "here. Ask an admin to adjust it in QB if it's wrong."
            ),
        )
    if entry.submitted_at is not None:
        raise HTTPException(
            status_code=403,
            detail=(
                "This entry was already submitted for sync and is locked. "
                "Wait for it to finish syncing, then ask an admin to fix it in QuickBooks."
            ),
        )
    return entry


@router.patch("/me/timesheet/entries/{entry_id}")
def edit_my_timesheet_entry(
    entry_id: int,
    body: TimesheetEntryEditRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit hours and/or description on the caller's own draft TimeEntry.

    Locked when ``submitted_at IS NOT NULL`` or ``workforce_entry_id IS
    NOT NULL`` (see :func:`_resolve_editable_entry`). After applying the
    change, the work item's ``logged_hours``/``remaining_hours`` are
    recomputed and the rollup propagates to the parent (subtasks) and
    epic, keeping every view that reads these columns in sync.
    """
    entry = _resolve_editable_entry(entry_id, current_user, db)

    if body.hours is not None:
        if body.hours <= 0:
            raise HTTPException(status_code=400, detail="Hours must be greater than 0")
        if body.hours > 24:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Hours per entry ({body.hours}) exceeds the 24h sanity cap. "
                    "Split into multiple entries if you genuinely worked more."
                ),
            )
        entry.hours = body.hours
        # No linked comment to sync — logged hours are surfaced via the ticket's
        # Time Entries table, not the comment thread.

    if body.description is not None:
        # Allow clearing the description by passing an empty string —
        # backend stores it as NULL to match log-hours' convention.
        entry.description = body.description.strip() or None

    db.flush()

    # Recompute rollup on the parent work item. If the entry got
    # detached from its work item somehow (shouldn't happen — FK is
    # NOT NULL), skip the rollup gracefully.
    if entry.work_item is not None:
        _recompute_work_item_hours(entry.work_item, db)
    else:
        db.commit()

    db.refresh(entry)
    return entry.to_dict()


@router.delete("/me/timesheet/entries/{entry_id}", status_code=204)
def delete_my_timesheet_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a draft TimeEntry the caller logged.

    Same lock rules as the PATCH route — only entries that haven't
    been submitted to QuickBooks (and haven't synced) can be deleted.
    The work item's hours are recomputed after the delete so the
    board/capacity card/work-item detail panel all reflect the new
    total immediately.
    """
    entry = _resolve_editable_entry(entry_id, current_user, db)
    work_item = entry.work_item  # capture before delete

    db.delete(entry)
    db.flush()

    if work_item is not None:
        _recompute_work_item_hours(work_item, db)
    else:
        db.commit()
    return None


@router.patch("/me/timesheet/billable", status_code=204)
def set_my_timesheet_billable(
    body: TimesheetBillableRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set the billable flag for one (client, day) group of the caller's
    own time entries — the Review modal's per-client "Billable" checkbox.

    Only DRAFT entries (``submitted_at IS NULL AND workforce_entry_id IS
    NULL``) logged on ``logged_at`` whose project bills to
    ``qb_customer_id`` are flipped; submitted/synced entries are already in
    the QB pipeline and left untouched. Scoped to the current Mon-Fri
    window the modal operates on. No work-item rollup needed — billable
    doesn't affect ``logged_hours``.
    """
    from datetime import date as _date
    from datetime import datetime as _dt
    from datetime import time as _time
    from datetime import timedelta as _td

    from models.project import Project
    from models.time_entry import TimeEntry
    from models.work_item import WorkItem
    from services.workforce_sync import current_work_week_window

    dev = _get_internal_developer_or_404(current_user, db)

    try:
        target_date = _date.fromisoformat(body.logged_at)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid logged_at {body.logged_at!r}. Expected an ISO date (YYYY-MM-DD).",
        ) from None

    window_start, window_end = current_work_week_window()
    if not (window_start <= target_date <= window_end):
        raise HTTPException(
            status_code=400,
            detail="Billable can only be changed for the current week's entries.",
        )

    day_start = _dt.combine(target_date, _time.min)
    day_end = day_start + _td(days=1)

    entries = (
        db.query(TimeEntry)
        .join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
        .join(Project, WorkItem.project_id == Project.id)
        .filter(
            TimeEntry.developer_id == dev.id,
            TimeEntry.logged_at >= day_start,
            TimeEntry.logged_at < day_end,
            TimeEntry.workforce_entry_id.is_(None),
            TimeEntry.submitted_at.is_(None),
            Project.workforce_client_id == body.qb_customer_id,
        )
        .all()
    )
    for entry in entries:
        entry.billable = body.billable
    db.commit()
    return None


@router.get("/{developer_id}", response_model=DeveloperResponse)
def get_developer(
    developer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Get a developer by ID (requires auth)"""
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")
    return developer


@router.put("/{developer_id}", response_model=DeveloperResponse)
def update_developer(
    developer_id: int,
    update: DeveloperUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a developer (requires auth)"""
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")

    # Check email uniqueness if updating email
    if update.email and update.email != developer.email:
        existing = db.query(Developer).filter(Developer.email == update.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Developer with this email already exists")
        developer.email = update.email

    if update.name is not None:
        developer.name = update.name
    if update.github_username is not None:
        developer.github_username = update.github_username
    if update.avatar_url is not None:
        developer.avatar_url = update.avatar_url

    developer.updated_at = utcnow()
    db.commit()
    db.refresh(developer)
    return developer


@router.delete("/{developer_id}")
def delete_developer(
    developer_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Delete a developer (requires auth)"""
    developer = db.query(Developer).filter(Developer.id == developer_id).first()
    if not developer:
        raise HTTPException(status_code=404, detail="Developer not found")

    db.delete(developer)
    db.commit()
    return {"status": "deleted", "id": developer_id}
