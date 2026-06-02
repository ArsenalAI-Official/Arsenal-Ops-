"""Weekly capacity calculation for developers — transfer-aware.

Used by:
  • /api/admin/developers/capacity   (across all projects, per developer)
  • /api/projects/{id}/workload      (within one project, per assignee)
  • /api/workitems/projects/{id}/hours-analytics   (per developer, scoped to project)

Week boundary: Saturday 00:00 → Friday 23:59 (UTC).

Attribution rules (per (developer, ticket) pair this week):
  • logged_this_week → sum of TimeEntry.hours where developer is this dev,
    ticket is this ticket, and logged_at falls in the week.
  • remaining_commitment → if this dev is the current holder at week end AND
    the ticket is not yet done/cancelled, add max(0, estimated - total_logged_to_date).

Bucket assignment (based on ticket's status at calculation time):
  • status == 'done' and completed_at within this week  → DONE bucket  (logged_this_week ONLY;
    earlier weeks' logged hours don't carry into this week's capacity)
  • status == 'in_review'                                → IN_REVIEW   (logged_this_week + remaining if current holder)
  • status == 'in_progress'                              → IN_PROGRESS (logged_this_week + remaining if current holder)
  • everything else                                      → not counted

A developer "had this ticket this week" iff they have at least one assignment span
in work_item_assignment_history that overlaps the week (or they logged hours on it
this week — same outcome).
"""

from collections.abc import Iterable
from datetime import datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from models.time_entry import TimeEntry
from models.work_item_assignment_history import WorkItemAssignmentHistory


def week_boundaries(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Saturday 00:00 → Friday 23:59 UTC for the week containing `now`."""
    today = now or datetime.utcnow()
    days_back = (today.weekday() + 2) % 7  # Mon=0, Sat=5; (0+2)%7=2 ... (5+2)%7=0
    week_start = (today - timedelta(days=days_back)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return week_start, week_end


def _bucket_for(item) -> str | None:
    if item.status == "done":
        return "done"
    if item.status == "in_review":
        return "in_review"
    if item.status == "in_progress":
        return "in_progress"
    return None


def _ticket_belongs_this_week(item, week_start: datetime, week_end: datetime) -> bool:
    """Is this ticket eligible to contribute to this week's capacity at all?

    Done is eligible only if completed_at is within the week.
    in_progress / in_review are always eligible (work in flight).
    """
    if item.status == "done":
        return bool(item.completed_at and week_start <= item.completed_at <= week_end)
    return item.status in ("in_progress", "in_review")


def _ticket_to_dict_for_dev(
    item,
    counted: int,
    basis: str,
    logged_this_week: int,
    total_logged: int,
) -> dict:
    estimated = item.estimated_hours or 0
    return {
        "id": item.id,
        "key": item.key,
        "title": item.title,
        "status": item.status,
        "priority": item.priority,
        "project_id": item.project_id,
        "project_name": item.project.name if getattr(item, "project", None) else None,
        "estimated_hours": estimated,
        "logged_hours": total_logged,
        "remaining_hours": max(0, estimated - total_logged),
        "started_at": item.started_at.isoformat() if item.started_at else None,
        "last_assigned_at": item.last_assigned_at.isoformat()
        if getattr(item, "last_assigned_at", None)
        else None,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "counted_hours": counted,
        "counted_basis": basis,
        "your_logged_this_week": logged_this_week,
    }


def compute_capacity_breakdown(
    items: Iterable,
    week_start: datetime,
    *,
    db: Session,
    developer_id: int,
    week_capacity: int = 40,
    restrict_to_project_ids: set[int] | None = None,
) -> dict:
    """Aggregate per-status hours and ticket detail for one developer's items.

    `items` is the developer's currently-assigned work items (e.g.,
    `developer.assigned_work_items`). We expand this set to include tickets the
    developer used to hold this week (via assignment history) and tickets where
    they logged hours this week — so transferred-away contributions don't
    disappear.

    If `restrict_to_project_ids` is provided, expansion is limited to tickets in
    those projects — used by per-project views (PM tab, project workload) so
    hours on other projects don't leak in. Admin (cross-project) callers omit it.
    """
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)

    item_by_id: dict[int, object] = {it.id: it for it in items}

    from models.work_item import WorkItem

    # Tickets they logged on this week (covers transferred-away cases).
    logged_q = db.query(TimeEntry.work_item_id).filter(
        TimeEntry.developer_id == developer_id,
        TimeEntry.logged_at >= week_start,
        TimeEntry.logged_at <= week_end,
    )
    if restrict_to_project_ids is not None:
        logged_q = logged_q.join(WorkItem, TimeEntry.work_item_id == WorkItem.id).filter(
            WorkItem.project_id.in_(restrict_to_project_ids)
        )
    logged_ids = {r[0] for r in logged_q.distinct().all()}

    # Tickets they were assigned to at any point this week (covers held-but-no-log).
    history_q = db.query(WorkItemAssignmentHistory.work_item_id).filter(
        WorkItemAssignmentHistory.developer_id == developer_id,
        WorkItemAssignmentHistory.assigned_at <= week_end,
        or_(
            WorkItemAssignmentHistory.unassigned_at.is_(None),
            WorkItemAssignmentHistory.unassigned_at >= week_start,
        ),
    )
    if restrict_to_project_ids is not None:
        history_q = history_q.join(
            WorkItem, WorkItemAssignmentHistory.work_item_id == WorkItem.id
        ).filter(WorkItem.project_id.in_(restrict_to_project_ids))
    history_ids = {r[0] for r in history_q.distinct().all()}

    extra_ids = (logged_ids | history_ids) - set(item_by_id.keys())
    if extra_ids:
        extras_q = db.query(WorkItem).filter(WorkItem.id.in_(extra_ids))
        if restrict_to_project_ids is not None:
            extras_q = extras_q.filter(WorkItem.project_id.in_(restrict_to_project_ids))
        for ex in extras_q.all():
            item_by_id[ex.id] = ex

    # Live sum of TimeEntry hours per work item — used as the source of truth for
    # "total_logged" instead of item.logged_hours, which can drift when the work
    # item is edited directly (see workitems update endpoint). Drift here caused
    # capacity to over-count remaining hours by the missing rollup delta.
    total_logged_by_item: dict[int, int] = {}
    if item_by_id:
        rows = (
            db.query(
                TimeEntry.work_item_id,
                func.coalesce(func.sum(TimeEntry.hours), 0).label("total"),
            )
            .filter(TimeEntry.work_item_id.in_(item_by_id.keys()))
            .group_by(TimeEntry.work_item_id)
            .all()
        )
        total_logged_by_item = {wid: int(total or 0) for wid, total in rows}

    # This-week logged hours per work item BY THIS DEVELOPER, batched into one
    # grouped query. Previously this was a per-ticket query issued inside the
    # loop below — an O(tickets) N+1 that dominated the admin capacity endpoint
    # (O(developers * tickets) round-trips). developer_id is fixed for this
    # call, so grouping by work_item_id alone yields the same per-ticket sum.
    # Missing keys default to 0 to preserve the bucket/basis logic below.
    this_week_logged_by_item: dict[int, int] = {}
    if item_by_id:
        week_rows = (
            db.query(
                TimeEntry.work_item_id,
                func.coalesce(func.sum(TimeEntry.hours), 0).label("total"),
            )
            .filter(
                TimeEntry.developer_id == developer_id,
                TimeEntry.logged_at >= week_start,
                TimeEntry.logged_at <= week_end,
                TimeEntry.work_item_id.in_(item_by_id.keys()),
            )
            .group_by(TimeEntry.work_item_id)
            .all()
        )
        this_week_logged_by_item = {wid: int(total or 0) for wid, total in week_rows}

    in_progress_hours = 0
    in_review_hours = 0
    done_hours = 0
    tickets_out: list = []

    for item in item_by_id.values():
        if not _ticket_belongs_this_week(item, week_start, week_end):
            continue
        bucket = _bucket_for(item)
        if bucket is None:
            continue

        # Logged hours this week by THIS developer on this ticket. Sourced from
        # the single grouped query precomputed above (was an O(tickets) per-item
        # query here). Missing keys → 0, preserving the bucket/basis logic below.
        logged_sum = this_week_logged_by_item.get(item.id, 0)

        is_current_holder = item.assignee_id == developer_id

        # Use live TimeEntry sum (source of truth) rather than item.logged_hours,
        # which can drift when the work item is edited directly.
        total_logged = total_logged_by_item.get(item.id, 0)

        if bucket == "done":
            # Carry-over rule: only THIS week's logged hours count, regardless of
            # how many earlier-week hours the ticket already had.
            counted = logged_sum
            basis = "logged this week"
        else:
            remaining = max(0, (item.estimated_hours or 0) - total_logged)
            remaining_added = remaining if is_current_holder else 0
            counted = logged_sum + remaining_added
            if logged_sum > 0 and remaining_added > 0:
                basis = "logged this week + remaining"
            elif logged_sum > 0:
                basis = "logged this week"
            elif remaining_added > 0:
                basis = "remaining (current holder)"
            else:
                # Neither logged this week nor current holder — skip.
                continue

        if counted == 0:
            continue

        if bucket == "in_progress":
            in_progress_hours += counted
        elif bucket == "in_review":
            in_review_hours += counted
        elif bucket == "done":
            done_hours += counted

        tickets_out.append(_ticket_to_dict_for_dev(item, counted, basis, logged_sum, total_logged))

    capacity_used = in_progress_hours + in_review_hours + done_hours
    return {
        "this_week_in_progress_hours": in_progress_hours,
        "this_week_in_review_hours": in_review_hours,
        "this_week_done_hours": done_hours,
        "this_week_capacity_used": capacity_used,
        "this_week_remaining_capacity": max(0, week_capacity - capacity_used),
        "tickets": tickets_out,
    }
