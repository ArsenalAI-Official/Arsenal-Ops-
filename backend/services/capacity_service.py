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

from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

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

    Epics are never eligible: their `logged_hours` / `remaining_hours` are
    rollups from child tickets (see the epic recompute in
    `routers/workitems.py`), so including an assigned-and-in-flight epic
    would double-count its children's hours. Excluding by type here keeps
    the rule one place — all three callers (admin Employees, home capacity,
    project PM tab) go through this function.
    """
    if getattr(item, "type", None) == "epic":
        return False
    if item.status == "done":
        return bool(item.completed_at and week_start <= item.completed_at <= week_end)
    return item.status in ("in_progress", "in_review")


def _ticket_to_dict_for_dev(
    item,
    counted: float,
    basis: str,
    logged_this_week: float,
    total_logged: float,
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


def _aggregate_capacity(
    item_by_id: dict,
    *,
    developer_id: int,
    week_start: datetime,
    week_end: datetime,
    week_capacity: int,
    total_logged_by_item: dict[int, float],
    this_week_logged_by_item: dict[int, float],
) -> dict:
    """Per-developer bucket/basis aggregation over an already-resolved item set.

    Both the single-developer path (``compute_capacity_breakdown``) and the
    batched path (``compute_capacity_breakdowns_batch``) funnel through here so
    the bucket assignment and "counted" basis rules can't drift between them.

    Inputs are precomputed lookups keyed by ``item.id``:
      • ``total_logged_by_item`` — all-time TimeEntry sum per item (dev-independent).
      • ``this_week_logged_by_item`` — this-week TimeEntry sum on each item by
        THIS developer.
    """
    in_progress_hours = 0.0
    in_review_hours = 0.0
    done_hours = 0.0
    tickets_out: list = []

    for item in item_by_id.values():
        if not _ticket_belongs_this_week(item, week_start, week_end):
            continue
        bucket = _bucket_for(item)
        if bucket is None:
            continue

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
        # Eager-load .project — _ticket_to_dict_for_dev reads item.project.name,
        # which would otherwise lazy-load one SELECT per extra ticket.
        extras_q = (
            db.query(WorkItem)
            .options(joinedload(WorkItem.project))
            .filter(WorkItem.id.in_(extra_ids))
        )
        if restrict_to_project_ids is not None:
            extras_q = extras_q.filter(WorkItem.project_id.in_(restrict_to_project_ids))
        for ex in extras_q.all():
            item_by_id[ex.id] = ex

    # Live sum of TimeEntry hours per work item — used as the source of truth for
    # "total_logged" instead of item.logged_hours, which can drift when the work
    # item is edited directly (see workitems update endpoint). Drift here caused
    # capacity to over-count remaining hours by the missing rollup delta.
    total_logged_by_item: dict[int, float] = {}
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
        total_logged_by_item = {wid: float(total or 0) for wid, total in rows}

    # This-week logged hours per work item BY THIS DEVELOPER, batched into one
    # grouped query. Previously this was a per-ticket query issued inside the
    # loop below — an O(tickets) N+1 that dominated the admin capacity endpoint
    # (O(developers * tickets) round-trips). developer_id is fixed for this
    # call, so grouping by work_item_id alone yields the same per-ticket sum.
    # Missing keys default to 0 to preserve the bucket/basis logic below.
    this_week_logged_by_item: dict[int, float] = {}
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
        this_week_logged_by_item = {wid: float(total or 0) for wid, total in week_rows}

    # Logged hours this week by THIS developer per ticket came from the single
    # grouped query above (was an O(tickets) per-item query here). The shared
    # aggregator applies the bucket/basis rules.
    return _aggregate_capacity(
        item_by_id,
        developer_id=developer_id,
        week_start=week_start,
        week_end=week_end,
        week_capacity=week_capacity,
        total_logged_by_item=total_logged_by_item,
        this_week_logged_by_item=this_week_logged_by_item,
    )


def compute_capacity_breakdowns_batch(
    developers: list,
    week_start: datetime,
    *,
    db: Session,
    week_capacity: int = 40,
) -> dict[int, dict]:
    """Cross-project capacity breakdown for MANY developers in a fixed number
    of queries.

    Calling ``compute_capacity_breakdown`` once per developer (as the admin
    capacity endpoint used to) issues ~5 queries per developer — an
    O(developers) N+1 that dominated that endpoint. This batched variant
    precomputes the same lookups across all developers in 4 queries total
    (logged-this-week ids, assignment-history ids, all-time per-item sums,
    this-week per-(dev,item) sums) plus one fetch for "extra" tickets, then
    runs the shared in-memory aggregator per developer.

    Each developer's ``assigned_work_items`` must already be loaded (the caller
    eager-loads them). Returns ``{developer_id: breakdown}`` where each value
    matches ``compute_capacity_breakdown(...)`` with no ``restrict_to_project_ids``.
    This is the cross-project (admin) path only; per-project callers keep using
    ``compute_capacity_breakdown`` with their restriction set.
    """
    from models.work_item import WorkItem

    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    dev_ids = [d.id for d in developers]
    if not dev_ids:
        return {}

    # Currently-assigned items per developer — eager-loaded by the caller.
    items_by_dev: dict[int, dict[int, object]] = {
        d.id: {it.id: it for it in (d.assigned_work_items or [])} for d in developers
    }

    # (1) Tickets each dev logged on this week — covers transferred-away cases.
    logged_ids_by_dev: dict[int, set] = defaultdict(set)
    for dev_id, wi_id in (
        db.query(TimeEntry.developer_id, TimeEntry.work_item_id)
        .filter(
            TimeEntry.developer_id.in_(dev_ids),
            TimeEntry.logged_at >= week_start,
            TimeEntry.logged_at <= week_end,
        )
        .distinct()
        .all()
    ):
        logged_ids_by_dev[dev_id].add(wi_id)

    # (2) Tickets each dev was assigned to at any point this week.
    history_ids_by_dev: dict[int, set] = defaultdict(set)
    for dev_id, wi_id in (
        db.query(
            WorkItemAssignmentHistory.developer_id,
            WorkItemAssignmentHistory.work_item_id,
        )
        .filter(
            WorkItemAssignmentHistory.developer_id.in_(dev_ids),
            WorkItemAssignmentHistory.assigned_at <= week_end,
            or_(
                WorkItemAssignmentHistory.unassigned_at.is_(None),
                WorkItemAssignmentHistory.unassigned_at >= week_start,
            ),
        )
        .distinct()
        .all()
    ):
        history_ids_by_dev[dev_id].add(wi_id)

    # (3) Resolve "extra" tickets (logged/held this week but not currently
    # assigned) for every dev in one query.
    extra_ids_by_dev: dict[int, set] = {}
    all_extra_ids: set = set()
    for dev_id in dev_ids:
        own = set(items_by_dev[dev_id].keys())
        extras = (logged_ids_by_dev[dev_id] | history_ids_by_dev[dev_id]) - own
        extra_ids_by_dev[dev_id] = extras
        all_extra_ids |= extras
    extra_items_by_id: dict[int, object] = {}
    if all_extra_ids:
        # Eager-load .project to keep this O(1)-in-developer-count fetch from
        # lazy-loading one SELECT per extra ticket in _ticket_to_dict_for_dev.
        extras_rows = (
            db.query(WorkItem)
            .options(joinedload(WorkItem.project))
            .filter(WorkItem.id.in_(all_extra_ids))
            .all()
        )
        for ex in extras_rows:
            extra_items_by_id[ex.id] = ex

    # Union of every item we'll score — drives the two grouped TimeEntry sums.
    all_item_ids: set = set(all_extra_ids)
    for dev_id in dev_ids:
        all_item_ids |= set(items_by_dev[dev_id].keys())

    # (4) All-time logged hours per item (dev-independent) — one grouped query.
    total_logged_by_item: dict[int, float] = {}
    if all_item_ids:
        for wid, total in (
            db.query(
                TimeEntry.work_item_id,
                func.coalesce(func.sum(TimeEntry.hours), 0),
            )
            .filter(TimeEntry.work_item_id.in_(all_item_ids))
            .group_by(TimeEntry.work_item_id)
            .all()
        ):
            total_logged_by_item[wid] = float(total or 0)

    # (5) This-week logged hours per (dev, item) — one grouped query.
    week_logged_by_dev_item: dict[tuple, float] = {}
    if all_item_ids:
        for dev_id, wid, total in (
            db.query(
                TimeEntry.developer_id,
                TimeEntry.work_item_id,
                func.coalesce(func.sum(TimeEntry.hours), 0),
            )
            .filter(
                TimeEntry.developer_id.in_(dev_ids),
                TimeEntry.logged_at >= week_start,
                TimeEntry.logged_at <= week_end,
                TimeEntry.work_item_id.in_(all_item_ids),
            )
            .group_by(TimeEntry.developer_id, TimeEntry.work_item_id)
            .all()
        ):
            week_logged_by_dev_item[(dev_id, wid)] = float(total or 0)

    result: dict[int, dict] = {}
    for dev_id in dev_ids:
        item_by_id = dict(items_by_dev[dev_id])
        for ex_id in extra_ids_by_dev[dev_id]:
            extra_item = extra_items_by_id.get(ex_id)
            if extra_item is not None:
                item_by_id[ex_id] = extra_item

        # Per-dev view of this-week sums keyed by item.id, matching the shape
        # the shared aggregator expects.
        this_week_for_dev = {
            item_id: week_logged_by_dev_item.get((dev_id, item_id), 0) for item_id in item_by_id
        }

        result[dev_id] = _aggregate_capacity(
            item_by_id,
            developer_id=dev_id,
            week_start=week_start,
            week_end=week_end,
            week_capacity=week_capacity,
            total_logged_by_item=total_logged_by_item,
            this_week_logged_by_item=this_week_for_dev,
        )
    return result
