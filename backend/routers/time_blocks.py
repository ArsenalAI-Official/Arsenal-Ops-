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
  - Blocks for a single developer may NOT overlap (hard rule, 409 on attempt).
    Overlaps make total-time ambiguous and break billable-class attribution, so
    create/move/resize are all rejected when they'd collide with another of the
    caller's blocks. Different developers may have concurrent blocks.
  - Single source of truth: a calendar block IS a ``TimeEntry``. Hours logged on
    a ticket via POST /log-hours create an *unplaced* TimeEntry (no start/end);
    the calendar surfaces those in an "unplaced" tray and placing one PATCHes its
    start/end onto the SAME row (no new row, no double count).
  - Block create/move/delete do NOT emit a "Logged Nh" ticket comment the way
    POST /log-hours does. Positioned blocks are a planning surface, not discrete
    log events, so they'd flood the comment feed; the hours still roll up.
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text
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
    # Hours logged on a ticket (via /log-hours) that haven't been positioned on
    # the calendar yet — start_time/end_time are null. The UI shows these in a
    # "to place" tray; dropping one onto the grid PATCHes its start/end.
    unplaced: list[TimeBlockResponse] = []


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


# Arbitrary namespace so this advisory lock can't collide with another feature's.
_OVERLAP_LOCK_NS = 0x7B70C


def _lock_developer_for_overlap(db: Session, developer_id: int | None) -> None:
    """Serialize the overlap check+insert for ONE developer.

    No-overlap is a read-then-insert with no DB constraint, so two concurrent
    requests (double-click, two tabs, retry) could each pass `_assert_no_overlap`
    and both insert overlapping blocks. A per-developer transaction-scoped
    advisory lock makes the check+insert atomic across connections; it's released
    on commit/rollback. No-op on SQLite (tests are single-threaded, and SQLite
    has no advisory locks)."""
    if developer_id is None or db.get_bind().dialect.name != "postgresql":
        return
    db.execute(
        text("SELECT pg_advisory_xact_lock(:ns, :dev)"),
        {"ns": _OVERLAP_LOCK_NS, "dev": developer_id},
    )


def _assert_no_overlap(
    db: Session,
    developer_id: int | None,
    start: datetime,
    end: datetime,
    exclude_entry_id: int | None = None,
) -> None:
    """Reject a [start, end) interval that overlaps another POSITIONED block for
    the same developer. Half-open intervals: touching edges (a block ending at
    10:00 and another starting at 10:00) do NOT overlap. 409 names the conflict.

    No-overlap is a hard invariant — overlapping blocks make total-time
    attribution ambiguous (e.g. a SendBuild block over a Symphony block)."""
    if developer_id is None:
        return
    q = db.query(TimeEntry).filter(
        TimeEntry.developer_id == developer_id,
        TimeEntry.start_time.isnot(None),
        TimeEntry.end_time.isnot(None),
        TimeEntry.start_time < end,
        TimeEntry.end_time > start,
    )
    if exclude_entry_id is not None:
        q = q.filter(TimeEntry.id != exclude_entry_id)
    conflict = q.first()
    if conflict is not None and conflict.start_time and conflict.end_time:
        key = (
            db.query(WorkItem.key).filter(WorkItem.id == conflict.work_item_id).scalar()
            or "a block"
        )
        # Don't include the conflict's clock time: it's stored UTC and would
        # display in the wrong timezone for the viewer. Name the ticket instead.
        raise HTTPException(
            status_code=409,
            detail=(
                f"This overlaps an existing {key} block. "
                "Time blocks can't overlap — pick a free slot."
            ),
        )


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
        # Columns store naive-UTC; stamp the UTC marker so the client parses the
        # instant as UTC (not local) and renders it at the same wall-clock time
        # the user drew. Without the marker, `new Date("...T16:00:00")` is parsed
        # as LOCAL, shifting blocks by the viewer's offset and making overlap
        # checks (done in UTC) reject "open"-looking local slots.
        start_time=entry.start_time.replace(tzinfo=UTC).isoformat() if entry.start_time else None,
        end_time=entry.end_time.replace(tzinfo=UTC).isoformat() if entry.end_time else None,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
def _resolve_target_developer(
    employee_id: int | None, caller_dev: Developer, current_user: User, db: Session
) -> Developer:
    """Whose calendar to read. Non-admins are forced to their own; viewing
    another employee's calendar requires the ``admin.time_entries`` capability
    (the same one that gates the admin time-entries grid)."""
    if employee_id is None or employee_id == caller_dev.id:
        return caller_dev
    if not current_user.has_capability("admin.time_entries"):
        raise HTTPException(
            status_code=403,
            detail="Only admins can view another employee's calendar.",
        )
    target = db.query(Developer).filter(Developer.id == employee_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Employee not found")
    return target


@router.get("", response_model=WeekBlocksResponse)
def list_week_blocks(
    week_start: datetime = Query(..., description="UTC start of the week (inclusive)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    employee_id: Annotated[
        int | None, Query(description="Admin-only: view another developer's calendar.")
    ] = None,
):
    """Positioned blocks that START within the 5-day (Mon–Fri) window beginning
    at ``week_start``, plus an ``unplaced`` tray of hours logged on tickets that
    haven't been placed on the calendar yet (start_time null).

    Defaults to the caller's own calendar; admins may pass ``employee_id`` to
    view anyone's. External clients have no developer profile, so the
    ``_require_caller_developer`` gate already excludes them."""
    caller_dev = _require_caller_developer(current_user, db)
    target_dev = _resolve_target_developer(employee_id, caller_dev, current_user, db)
    # The UI renders Mon–Fri only; return exactly that window (5 days) so no
    # block is fetched into a column the client can't show. week_start is the
    # client's local Monday-midnight as UTC ISO.
    week_start = _naive_utc(week_start)
    week_end = week_start + timedelta(days=5)

    entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.developer_id == target_dev.id,
            TimeEntry.start_time.isnot(None),
            TimeEntry.start_time >= week_start,
            TimeEntry.start_time < week_end,
        )
        .all()
    )
    # Unplaced: ticket-logged hours awaiting placement on the grid. These have no
    # date, so they aren't week-scoped — surface all of the developer's pending
    # ones so the calendar always reflects ticket logs (single source of truth).
    unplaced_entries = (
        db.query(TimeEntry)
        .filter(
            TimeEntry.developer_id == target_dev.id,
            TimeEntry.start_time.is_(None),
        )
        .order_by(TimeEntry.logged_at.desc())
        .all()
    )

    item_ids = {e.work_item_id for e in entries} | {e.work_item_id for e in unplaced_entries}
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
    unplaced = [
        _to_response(e, items_by_id[e.work_item_id])
        for e in unplaced_entries
        if e.work_item_id in items_by_id
    ]
    return WeekBlocksResponse(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        blocks=blocks,
        unplaced=unplaced,
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
    _lock_developer_for_overlap(db, caller_dev.id)
    _assert_no_overlap(db, caller_dev.id, start, end)

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
    target_item: WorkItem = original_item
    if request.work_item_id is not None and request.work_item_id != entry.work_item_id:
        found = db.query(WorkItem).filter(WorkItem.id == request.work_item_id).first()
        if not found:
            raise HTTPException(status_code=404, detail="Target work item not found")
        _authorize_block_on_item(found, caller_dev)
        entry.work_item_id = found.id
        target_item = found
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
    _lock_developer_for_overlap(db, entry.developer_id)
    _assert_no_overlap(db, entry.developer_id, new_start, new_end, exclude_entry_id=entry.id)
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
