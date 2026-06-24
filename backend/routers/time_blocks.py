"""Calendar time-blocks API.

Backs the week-calendar UI where a developer logs work by drawing/dragging
positioned time blocks. Each block is a ``TimeEntry`` with ``start_time`` /
``end_time`` set; ``hours`` is derived from the interval. One work item can have
many blocks (the existing ``work_item.time_entries`` one-to-many), including
several on the same day.

Lives in its own router (prefix ``/api/time-blocks``) rather than under
``/api/workitems`` so the collection routes don't collide with the typed
``/api/workitems/{item_id}`` path (``"time-blocks"`` would 422 against the int
converter). Hours rollups reuse the workitems helpers so the self-healing
``logged_hours = SUM(TimeEntry.hours)`` invariant stays in one place.

Intentional v1 scope decisions:
  - Overlapping blocks are allowed (a calendar lays concurrent blocks side by
    side); there is no per-day total cap — only the per-block 24h sanity cap.
  - Block create/move/delete do NOT emit a "Logged Nh" ticket comment the way
    POST /log-hours does. Positioned blocks are a planning surface, not discrete
    log events, so they'd flood the comment feed; the hours still roll up.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.developer import Developer
from models.time_entry import TimeEntry
from models.user import User
from models.work_item import WorkItem, WorkItemStatus, WorkItemType
from routers.auth import get_current_user
from routers.workitems import propagate_from_subtask, update_epic_hours

router = APIRouter(prefix="/api/time-blocks", tags=["Time Blocks"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TimeBlockResponse(BaseModel):
    """One positioned calendar block, denormalized with its ticket's display
    fields so the calendar can render without a second round-trip."""

    id: int
    work_item_id: int
    work_item_key: str
    work_item_title: str
    work_item_type: str
    work_item_status: str
    developer_id: int | None = None
    hours: float
    description: str | None = None
    start_time: str | None = None
    end_time: str | None = None


class WeekBlocksResponse(BaseModel):
    week_start: str
    week_end: str
    blocks: list[TimeBlockResponse]


class CreateTimeBlockRequest(BaseModel):
    work_item_id: int
    start_time: datetime
    end_time: datetime
    description: str | None = None


class UpdateTimeBlockRequest(BaseModel):
    """Move / resize / reassign. All fields optional — send only what changed.

    ``start_time``/``end_time`` move or resize the block (hours re-derived);
    ``work_item_id`` reassigns the block to a different ticket (rolls up hours
    on both the old and new ticket)."""

    start_time: datetime | None = None
    end_time: datetime | None = None
    work_item_id: int | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
MAX_BLOCK_HOURS = 24


def _hours_between(start: datetime, end: datetime) -> float:
    """Block duration in hours, rounded to 2dp (quarter-hours are exact)."""
    return round((end - start).total_seconds() / 3600.0, 2)


def _naive_utc(dt: datetime) -> datetime:
    """Normalize an inbound datetime to naive-UTC.

    The frontend sends tz-aware UTC ISO timestamps (e.g. ``2026-06-22T09:00:00Z``)
    but the ``time_entries`` columns are naive ``TIMESTAMP`` (consistent with
    ``logged_at``). Storing/comparing aware values against naive columns is a
    Postgres footgun (session-TZ-dependent implicit casts), so we strip tzinfo
    at the boundary after converting to UTC. Naive inputs pass through unchanged.
    """
    if dt.tzinfo is not None:
        return dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def _require_caller_developer(current_user: User, db: Session) -> Developer:
    dev = db.query(Developer).filter(Developer.email == current_user.email).first()
    if not dev:
        raise HTTPException(
            status_code=403,
            detail="No developer profile is linked to your account.",
        )
    return dev


def _authorize_block_on_item(item: WorkItem, caller_dev: Developer) -> None:
    """Mirror the log-hours rules: assignee-only, done tickets frozen."""
    if item.status == WorkItemStatus.DONE.value:
        raise HTTPException(
            status_code=403,
            detail="This ticket is marked done. Re-open it before logging time.",
        )
    if not item.assignee_id:
        raise HTTPException(
            status_code=403,
            detail="This ticket has no assignee — time can only be logged on assigned tickets.",
        )
    if caller_dev.id != item.assignee_id:
        raise HTTPException(
            status_code=403,
            detail="Only the ticket's assignee can log time on it.",
        )


def _validate_interval(start: datetime, end: datetime) -> float:
    if end <= start:
        raise HTTPException(status_code=400, detail="end_time must be after start_time")
    hours = _hours_between(start, end)
    if hours <= 0:
        raise HTTPException(status_code=400, detail="Block must be longer than 0 minutes")
    if hours > MAX_BLOCK_HOURS:
        raise HTTPException(
            status_code=400,
            detail=f"Block of {hours}h exceeds the {MAX_BLOCK_HOURS}h cap. Split it up.",
        )
    return hours


def _recompute_item_hours(item_id: int, db: Session) -> WorkItem | None:
    """Self-heal logged/remaining hours from the live TimeEntry sum, then roll
    up to parent/epic. Mirrors the log-hours rollup so the column stays exactly
    the sum of its entries."""
    item = db.query(WorkItem).filter(WorkItem.id == item_id).first()
    if not item:
        return None
    item.logged_hours = (
        db.query(func.coalesce(func.sum(TimeEntry.hours), 0))
        .filter(TimeEntry.work_item_id == item_id)
        .scalar()
    ) or 0
    item.remaining_hours = max(0, (item.estimated_hours or 0) - (item.logged_hours or 0))
    item.updated_at = datetime.utcnow()
    db.flush()
    if item.type == WorkItemType.SUBTASK.value and item.parent_id:
        propagate_from_subtask(item, db)
    elif item.epic_id:
        update_epic_hours(item.epic_id, db)
    return item


def _to_response(entry: TimeEntry, item: WorkItem) -> TimeBlockResponse:
    return TimeBlockResponse(
        id=entry.id,
        work_item_id=item.id,
        work_item_key=item.key,
        work_item_title=item.title,
        work_item_type=item.type,
        work_item_status=item.status,
        developer_id=entry.developer_id,
        hours=entry.hours,
        description=entry.description,
        start_time=entry.start_time.isoformat() if entry.start_time else None,
        end_time=entry.end_time.isoformat() if entry.end_time else None,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("", response_model=WeekBlocksResponse)
def list_week_blocks(
    week_start: datetime = Query(..., description="UTC start of the week (inclusive)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """All of the current developer's positioned blocks that START within the
    5-day (Mon–Fri) window beginning at ``week_start`` — matching the columns the
    UI renders. Legacy entries without a ``start_time`` are excluded; the UI
    surfaces those via the per-ticket time-entries endpoint."""
    caller_dev = _require_caller_developer(current_user, db)
    # The UI renders Mon–Fri only; return exactly that window (5 days) so no
    # block is fetched into a column the client can't show. week_start is the
    # client's local Monday-midnight as UTC ISO.
    week_start = _naive_utc(week_start)
    week_end = week_start + timedelta(days=5)

    entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.developer_id == caller_dev.id,
            TimeEntry.start_time.isnot(None),
            TimeEntry.start_time >= week_start,
            TimeEntry.start_time < week_end,
        )
        .all()
    )
    item_ids = {e.work_item_id for e in entries}
    items_by_id = (
        {i.id: i for i in db.query(WorkItem).filter(WorkItem.id.in_(item_ids)).all()}
        if item_ids
        else {}
    )
    blocks = [
        _to_response(e, items_by_id[e.work_item_id])
        for e in entries
        if e.work_item_id in items_by_id
    ]
    return WeekBlocksResponse(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        blocks=blocks,
    )


@router.post("", response_model=TimeBlockResponse, status_code=201)
def create_time_block(
    request: CreateTimeBlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a positioned block on a ticket the caller is assigned to."""
    caller_dev = _require_caller_developer(current_user, db)
    item = db.query(WorkItem).filter(WorkItem.id == request.work_item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Work item not found")
    _authorize_block_on_item(item, caller_dev)
    start = _naive_utc(request.start_time)
    end = _naive_utc(request.end_time)
    hours = _validate_interval(start, end)

    entry = TimeEntry(
        work_item_id=item.id,
        developer_id=caller_dev.id,
        hours=hours,
        description=request.description,
        start_time=start,
        end_time=end,
    )
    db.add(entry)
    db.flush()
    _recompute_item_hours(item.id, db)
    db.commit()
    db.refresh(entry)
    db.refresh(item)
    return _to_response(entry, item)


@router.patch("/{entry_id}", response_model=TimeBlockResponse)
def update_time_block(
    entry_id: int,
    request: UpdateTimeBlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move, resize, or reassign a block. Reassignment rolls up hours on both
    the previous and the new ticket."""
    caller_dev = _require_caller_developer(current_user, db)
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Time block not found")
    if entry.developer_id != caller_dev.id:
        raise HTTPException(status_code=403, detail="You can only edit your own time blocks.")

    original_item = db.query(WorkItem).filter(WorkItem.id == entry.work_item_id).first()
    if not original_item:
        raise HTTPException(status_code=404, detail="Work item not found")

    # Reassign to a different ticket (must also be assigned to the caller).
    target_item = original_item
    if request.work_item_id is not None and request.work_item_id != entry.work_item_id:
        target_item = db.query(WorkItem).filter(WorkItem.id == request.work_item_id).first()
        if not target_item:
            raise HTTPException(status_code=404, detail="Target work item not found")
        _authorize_block_on_item(target_item, caller_dev)
        entry.work_item_id = target_item.id
    else:
        _authorize_block_on_item(original_item, caller_dev)

    # Move / resize. Explicit None checks (not `or`) so a falsy-but-valid value
    # is never mistaken for "omitted"; inbound aware datetimes are normalized.
    new_start = (
        _naive_utc(request.start_time) if request.start_time is not None else entry.start_time
    )
    new_end = _naive_utc(request.end_time) if request.end_time is not None else entry.end_time
    if new_start is None or new_end is None:
        raise HTTPException(
            status_code=400,
            detail="This block has no position; provide both start_time and end_time.",
        )
    entry.hours = _validate_interval(new_start, new_end)
    entry.start_time = new_start
    entry.end_time = new_end
    db.flush()

    # Roll up both tickets when reassigned, otherwise just the one.
    _recompute_item_hours(target_item.id, db)
    if target_item.id != original_item.id:
        _recompute_item_hours(original_item.id, db)
    db.commit()
    db.refresh(entry)
    db.refresh(target_item)
    return _to_response(entry, target_item)


@router.delete("/{entry_id}", status_code=204)
def delete_time_block(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a block and re-roll the ticket's hours."""
    caller_dev = _require_caller_developer(current_user, db)
    entry = db.query(TimeEntry).filter(TimeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Time block not found")
    if entry.developer_id != caller_dev.id:
        raise HTTPException(status_code=403, detail="You can only delete your own time blocks.")

    item_id = entry.work_item_id
    db.delete(entry)
    db.flush()
    _recompute_item_hours(item_id, db)
    db.commit()
