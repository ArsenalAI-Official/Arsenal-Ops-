"""Pulse derivation router.

Exposes ``GET /api/projects/{project_id}/pulse-derived`` — a read-only
endpoint that computes every Pulse-view field we can derive from the DB
(work items, sprints, time entries, milestones, activity logs, projects).
The frontend merges this on top of the legacy localStorage ``PulseData``
so editorial fields (narrative, ledger, risks, manual forecasts) stay
manual while everything else stays in sync with real project state.

Each top-level section in the response is wrapped in ``_safe()`` so one
broken computation doesn't 500 the whole call — same pattern used by
``routers/overview.py``.

Response shape (camelCase to match ``app/src/components/ProjectHub/pulseData.ts``):

    {
      "project":   { "name", "keyPrefix", "contractStart", "contractEnd", "launchTarget" },
      "summary":   { "healthScore", "healthStatus", "deliveryPct", ... },
      "months":    [ { "m", "devAct", "actual", "partial" } ],
      "lastActualIdx": int,
      "currentMonthTrackedPct": int,
      "includedServices": [ { "month", "usedHours" } ],
      "milestones": [ { "id", "phase", "date", "status" } ],
      "updates":    [ { "when", "author", "type", "text" } ],
      "forecastVsActuals": {
        "current": [ { "feature", "employee", "fc", "act" } ],
        "last":    [ ... ],
        "project": [ ... ],
      },
      "_meta": { "degraded_sections": [ ... ] },
    }
"""

import json
import logging
import re
import sys
from calendar import monthrange
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import case, func
from sqlalchemy.orm import Session, selectinload

sys.path.append("..")
from database import get_db
from models.activity_log import ActivityLog
from models.project import Project
from models.project_milestone import ProjectMilestone
from models.project_pulse_override import ProjectPulseOverride
from models.sprint import Sprint, SprintStatus
from models.time_entry import TimeEntry
from models.user import User
from models.work_item import WorkItem, WorkItemPriority, WorkItemStatus, WorkItemType
from routers.auth import get_current_user
from routers.projects import is_project_admin, require_project_access

router = APIRouter(prefix="/api/projects", tags=["Pulse"])
logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    """Return a naive UTC datetime.

    Most ORM datetimes in this codebase are timezone-naive (stored as UTC
    by convention). We centralize ``datetime.utcnow()`` here so we can
    swap to ``datetime.now(timezone.utc).replace(tzinfo=None)`` without
    breaking comparisons against naive ORM rows. Using a single helper
    also makes the deprecation easier to track if/when we go fully
    tz-aware end-to-end.
    """
    return datetime.now(UTC).replace(tzinfo=None)


def _safe(label: str, fn, fallback, degraded: list[str] | None = None):
    """Run ``fn`` and return its result; on any error, log and return ``fallback``.

    Mirrors the pattern in ``routers/overview.py`` so one broken section
    (e.g. a missing column on a stale DB schema) doesn't break the whole
    Pulse view. If ``degraded`` is provided, the ``label`` is appended to
    it on failure so callers can surface partial-failure state.
    """
    try:
        return fn()
    except Exception:
        logger.error("[pulse] %s sub-fetch failed", label, exc_info=True)
        if degraded is not None:
            degraded.append(label)
        return fallback


# ---------------------------------------------------------------------------
# Helpers (month math)
# ---------------------------------------------------------------------------


def _month_label(dt: datetime) -> str:
    """Format a datetime as ``"April 2026"`` — matches the existing
    ``IncludedServicesRow.month`` convention used by the frontend."""
    return dt.strftime("%B %Y")


def _add_month(dt: datetime) -> datetime:
    """Return the first day of the month after ``dt`` (UTC, midnight)."""
    if dt.month == 12:
        return datetime(dt.year + 1, 1, 1)
    return datetime(dt.year, dt.month + 1, 1)


def _start_of_month(dt: datetime) -> datetime:
    return datetime(dt.year, dt.month, 1)


def _end_of_month(dt: datetime) -> datetime:
    """Return the last second of ``dt``'s month.

    Prefer ``< _start_of_month(_add_month(dt))`` at call sites where an
    exclusive upper bound is cleaner; this helper is kept for places that
    want a representable "end" datetime.
    """
    last_day = monthrange(dt.year, dt.month)[1]
    return datetime(dt.year, dt.month, last_day, 23, 59, 59)


def _enumerate_months(start: datetime, end: datetime) -> list[datetime]:
    """Return a list of first-of-month datetimes from ``start`` to ``end``
    inclusive. Both bounds are normalized to the first of the month."""
    if not start or not end or start > end:
        return []
    cursor = _start_of_month(start)
    end_first = _start_of_month(end)
    out: list[datetime] = []
    while cursor <= end_first:
        out.append(cursor)
        cursor = _add_month(cursor)
    return out


def _time_entries_by_month(db: Session, project_id: int) -> dict[tuple[int, int], float]:
    """Return ``{(year, month): total_hours}`` for all time entries on
    work items in ``project_id``.

    Uses ``func.extract`` so the query is portable across Postgres (prod
    per ``render.yaml``) and SQLite (tests). Reused by both the per-month
    bars and the cumulative "included services" view.
    """
    year_col = func.extract("year", TimeEntry.logged_at)
    month_col = func.extract("month", TimeEntry.logged_at)
    rows = (
        db.query(
            year_col.label("y"),
            month_col.label("m"),
            func.coalesce(func.sum(TimeEntry.hours), 0).label("hours"),
        )
        .join(WorkItem, WorkItem.id == TimeEntry.work_item_id)
        .filter(WorkItem.project_id == project_id)
        .group_by(year_col, month_col)
        .all()
    )
    out: dict[tuple[int, int], float] = {}
    for r in rows:
        if r.y is None or r.m is None:
            continue
        out[(int(r.y), int(r.m))] = float(r.hours or 0)
    return out


# ---------------------------------------------------------------------------
# Per-section derivations
# ---------------------------------------------------------------------------


def _derive_project_meta(project: Project, db: Session) -> dict:
    """Project meta — ``contractStart`` uses ``created_at`` as a proxy
    (no real contract date column today; see plan caveat). ``launchTarget``
    picks the nearest milestone titled like /launch|go.?live|release/i,
    falling back to ``end_date``."""
    contract_start = project.created_at.isoformat() if project.created_at else ""
    contract_end = project.end_date.isoformat() if project.end_date else ""

    # Heuristic: find a launch-y milestone if one exists.
    launch_target = contract_end
    launch_re = re.compile(r"launch|go.?live|release", re.IGNORECASE)
    candidates = (
        db.query(ProjectMilestone)
        .filter(ProjectMilestone.project_id == project.id)
        .filter(ProjectMilestone.due_date.isnot(None))
        .order_by(ProjectMilestone.due_date)
        .all()
    )
    for m in candidates:
        if m.title and launch_re.search(m.title):
            launch_target = m.due_date.isoformat() if m.due_date else launch_target
            break

    return {
        "name": project.name or "",
        "keyPrefix": project.key_prefix or "",
        "contractStart": contract_start,
        "contractEnd": contract_end,
        "launchTarget": launch_target,
    }


def _people_trend_note(project_id: int, db: Session) -> str:
    """``"{n} active contributor(s)"`` where n = distinct developer_ids
    with a TimeEntry on this project's work items in the last 30 days."""
    since = _utc_now() - timedelta(days=30)
    n = (
        db.query(func.count(func.distinct(TimeEntry.developer_id)))
        .join(WorkItem, WorkItem.id == TimeEntry.work_item_id)
        .filter(WorkItem.project_id == project_id)
        .filter(TimeEntry.logged_at >= since)
        .filter(TimeEntry.developer_id.isnot(None))
        .scalar()
        or 0
    )
    return f"{n} active contributor{'s' if n != 1 else ''}"


def _compute_health_score(
    delivery_pct: float,
    overdue_count: int,
    open_bugs: int,
    critical_open: int,
    month_index: int,
    total_months: int,
) -> tuple[int, str]:
    """v1 health-score formula (documented in the plan):

        score = 100
              - 3 * overdueCount
              - 8 * criticalOpen
              - 2 * openBugs
              + clamp((deliveryPct - expectedTimePct) / 2, -15, +15)
        clamp to [0, 100]
        status: >=80 Healthy, >=60 At Risk, else Critical

    where ``expectedTimePct = monthIndex / totalMonths * 100``.

    When ``total_months`` is 0 (project has no end_date) the schedule
    bonus is forced to 0 — otherwise the formula would always reward the
    project, regardless of delivery progress.
    """
    if total_months > 0:
        expected_time_pct = month_index / total_months * 100
        schedule_bonus = max(-15, min(15, (delivery_pct - expected_time_pct) / 2))
    else:
        schedule_bonus = 0
    raw = 100 - 3 * overdue_count - 8 * critical_open - 2 * open_bugs + schedule_bonus
    score = int(max(0, min(100, round(raw))))
    if score >= 80:
        status_label = "Healthy"
    elif score >= 60:
        status_label = "At Risk"
    else:
        status_label = "Critical"
    return score, status_label


def _derive_summary(project: Project, db: Session) -> dict:
    """Counts/sums over work items + sprints + a health-score roll-up."""
    now = _utc_now()
    done_value = WorkItemStatus.DONE.value
    bug_value = WorkItemType.BUG.value
    critical_value = WorkItemPriority.CRITICAL.value

    # Single aggregate query — avoids loading every WorkItem just to count.
    one_if_done = case((WorkItem.status == done_value, 1), else_=0)
    one_if_overdue = case(
        (
            (WorkItem.due_date.isnot(None))
            & (WorkItem.due_date < now)
            & (WorkItem.status != done_value),
            1,
        ),
        else_=0,
    )
    one_if_open_bug = case(
        ((WorkItem.type == bug_value) & (WorkItem.status != done_value), 1),
        else_=0,
    )
    one_if_critical_open = case(
        ((WorkItem.priority == critical_value) & (WorkItem.status != done_value), 1),
        else_=0,
    )
    points = func.coalesce(WorkItem.story_points, 0)
    points_done = case((WorkItem.status == done_value, points), else_=0)
    estimated = func.coalesce(WorkItem.estimated_hours, 0)
    logged = func.coalesce(WorkItem.logged_hours, 0)

    agg = (
        db.query(
            func.count(WorkItem.id).label("total"),
            func.coalesce(func.sum(one_if_done), 0).label("done"),
            func.coalesce(func.sum(one_if_overdue), 0).label("overdue"),
            func.coalesce(func.sum(one_if_open_bug), 0).label("open_bugs"),
            func.coalesce(func.sum(one_if_critical_open), 0).label("critical_open"),
            func.coalesce(func.sum(points), 0).label("points_total"),
            func.coalesce(func.sum(points_done), 0).label("points_done"),
            func.coalesce(func.sum(estimated), 0).label("estimated"),
            func.coalesce(func.sum(logged), 0).label("logged"),
        )
        .filter(WorkItem.project_id == project.id)
        .one()
    )

    delivery_total = int(agg.total or 0)
    delivery_completed = int(agg.done or 0)
    delivery_pct = round(delivery_completed / delivery_total * 100) if delivery_total > 0 else 0
    overdue_count = int(agg.overdue or 0)
    open_bugs = int(agg.open_bugs or 0)
    critical_open = int(agg.critical_open or 0)
    points_total = int(agg.points_total or 0)
    points_completed = int(agg.points_done or 0)
    total_estimated = float(agg.estimated or 0)
    total_logged = float(agg.logged or 0)

    active_sprints = (
        db.query(func.count(Sprint.id))
        .filter(Sprint.project_id == project.id)
        .filter(Sprint.status == SprintStatus.ACTIVE.value)
        .scalar()
        or 0
    )

    # Clamp at 100 — over-logged work items shouldn't surface as ">100%".
    overall_completion = (
        min(100, round(total_logged / total_estimated * 100)) if total_estimated > 0 else 0
    )

    months = _enumerate_months(project.created_at, project.end_date) if project.end_date else []
    total_months = len(months)
    month_label = ""
    month_index = 0
    if months:
        # 1-indexed position of "now" within the contract window.
        now_first = _start_of_month(now)
        for idx, m in enumerate(months):
            if m <= now_first:
                month_index = idx + 1
                month_label = _month_label(m)
        # If "now" precedes the contract start, still surface the first month.
        if month_index == 0:
            month_index = 1
            month_label = _month_label(months[0])

    health_score, health_status = _compute_health_score(
        delivery_pct=delivery_pct,
        overdue_count=overdue_count,
        open_bugs=open_bugs,
        critical_open=critical_open,
        month_index=month_index,
        total_months=total_months,
    )

    return {
        "healthScore": health_score,
        "healthStatus": health_status,
        "deliveryPct": delivery_pct,
        "deliveryCompleted": delivery_completed,
        "deliveryTotal": delivery_total,
        "overdueCount": overdue_count,
        "openBugs": open_bugs,
        "criticalOpen": critical_open,
        "overallCompletion": overall_completion,
        "workItems": delivery_total,
        "pointsCompleted": points_completed,
        "pointsTotal": points_total,
        "activeSprints": int(active_sprints),
        "monthLabel": month_label,
        "monthIndex": month_index,
        "totalMonths": total_months,
        "peopleTrendNote": _people_trend_note(project.id, db),
    }


def _derive_months(project: Project, db: Session) -> dict:
    """Per-month dev hours actual + flags + ``lastActualIdx``/``currentMonthTrackedPct``.

    Returns a dict with keys ``months``, ``lastActualIdx``, ``currentMonthTrackedPct``
    so the top-level handler can splat them onto the response.
    """
    if not project.end_date:
        return {"months": [], "lastActualIdx": 0, "currentMonthTrackedPct": 0}

    months = _enumerate_months(project.created_at, project.end_date)
    if not months:
        return {"months": [], "lastActualIdx": 0, "currentMonthTrackedPct": 0}

    # Single GROUP BY against time_entries joined to this project's work_items.
    # Aggregation uses ``func.extract`` so it runs on both Postgres (prod) and
    # SQLite (tests).
    hours_by_ym = _time_entries_by_month(db, project.id)

    now = _utc_now()
    now_key = (now.year, now.month)
    last_actual_idx = 0
    out: list[dict] = []
    for idx, m in enumerate(months):
        key = (m.year, m.month)
        dev_act = int(round(hours_by_ym.get(key, 0)))
        is_actual = key < now_key
        is_partial = key == now_key
        if is_actual or is_partial:
            last_actual_idx = idx
        out.append(
            {
                "m": _month_label(m),
                "devAct": dev_act,
                "actual": is_actual,
                "partial": is_partial,
            }
        )

    # Percent of current month elapsed (for the "X% of month tracked" pill).
    # Exclusive upper bound avoids the 23:59:59 microsecond slop.
    som = _start_of_month(now)
    next_som = _add_month(som)
    total_seconds = (next_som - som).total_seconds()
    elapsed = (now - som).total_seconds()
    current_month_tracked_pct = (
        int(round(elapsed / total_seconds * 100)) if total_seconds > 0 else 0
    )

    return {
        "months": out,
        "lastActualIdx": last_actual_idx,
        "currentMonthTrackedPct": current_month_tracked_pct,
    }


def _derive_included_services(project: Project, db: Session) -> list[dict]:
    """Cumulative hours used through each month in the contract window."""
    if not project.end_date:
        return []
    months = _enumerate_months(project.created_at, project.end_date)
    if not months:
        return []

    hours_by_ym = _time_entries_by_month(db, project.id)

    out: list[dict] = []
    cumulative = 0
    for m in months:
        cumulative += int(round(hours_by_ym.get((m.year, m.month), 0)))
        out.append({"month": _month_label(m), "usedHours": cumulative})
    return out


def _milestone_status(m: ProjectMilestone, now: datetime) -> str:
    """``done`` if completed_at set; ``in-progress`` if due_date is within
    14 days; else ``upcoming``. Matches the buckets the frontend renders."""
    if m.completed_at:
        return "done"
    if m.due_date and (m.due_date - now) <= timedelta(days=14):
        return "in-progress"
    return "upcoming"


def _derive_milestones(project: Project, db: Session) -> list[dict]:
    milestones = (
        db.query(ProjectMilestone)
        .filter(ProjectMilestone.project_id == project.id)
        .order_by(ProjectMilestone.due_date)
        .all()
    )
    now = _utc_now()
    return [
        {
            "id": str(m.id),
            "phase": m.title or "",
            "date": m.due_date.isoformat() if m.due_date else "",
            "status": _milestone_status(m, now),
        }
        for m in milestones
    ]


# Word-boundary so we don't match "deprisk", "asterisk", etc.
_RISK_RE = re.compile(r"\brisk\b", re.IGNORECASE)


def _update_type_for(action: str | None, entity_type: str | None) -> str:
    """Map ``ActivityLog.action``/``entity_type`` to the frontend's
    ``"milestone" | "note" | "risk"`` tag. Defaults to ``note``."""
    if entity_type == "milestone":
        return "milestone"
    if entity_type == "risk" or (action and _RISK_RE.search(action)):
        return "risk"
    return "note"


def _derive_updates(project: Project, db: Session, limit: int = 25) -> list[dict]:
    activities = (
        db.query(ActivityLog)
        .options(selectinload(ActivityLog.user))
        .filter(ActivityLog.project_id == project.id)
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "when": a.created_at.isoformat() if a.created_at else "",
            "author": (a.user.name if a.user else "System") or "System",
            "type": _update_type_for(a.action, a.entity_type),
            "text": a.title or "",
        }
        for a in activities
    ]


def _derive_forecast_vs_actuals(project: Project, db: Session) -> dict:
    """For every epic, sum logged_hours (act) and estimated_hours (fc)
    over its descendant stories+subtasks, scoped by:

    * ``current``: time_entries with logged_at this month (MTD)
    * ``last``:    time_entries with logged_at in the previous calendar month
    * ``project``: cumulative logged_hours / estimated_hours on descendants
    """
    epics = (
        db.query(WorkItem)
        .options(selectinload(WorkItem.assignee))
        .filter(WorkItem.project_id == project.id)
        .filter(WorkItem.type == WorkItemType.EPIC.value)
        .all()
    )
    if not epics:
        return {"current": [], "last": [], "project": []}

    # Build descendants set per epic. Stories have epic_id pointing at the
    # epic; tasks/subtasks are descendants via parent_id chains. We do a
    # single project-wide fetch and walk the parent chain in Python.
    all_items = (
        db.query(WorkItem.id, WorkItem.parent_id, WorkItem.epic_id)
        .filter(WorkItem.project_id == project.id)
        .all()
    )
    parent_of: dict[int, int | None] = {row.id: row.parent_id for row in all_items}
    direct_epic_of: dict[int, int | None] = {row.id: row.epic_id for row in all_items}

    def epic_for(item_id: int) -> int | None:
        """Walk parent chain via ``parent_id``; first epic ancestor wins.
        Cycle-safe via a ``seen`` set."""
        seen: set[int] = set()
        cur: int | None = item_id
        while cur is not None and cur not in seen:
            seen.add(cur)
            ep = direct_epic_of.get(cur)
            if ep is not None:
                return ep
            cur = parent_of.get(cur)
        return None

    # Map descendant id → epic id.
    item_to_epic: dict[int, int] = {}
    for row in all_items:
        ep = epic_for(row.id)
        if ep is not None and ep != row.id:
            item_to_epic[row.id] = ep

    # Cumulative project totals from work_items themselves.
    proj_fc: dict[int, int] = dict.fromkeys((e.id for e in epics), 0)
    proj_act: dict[int, int] = dict.fromkeys((e.id for e in epics), 0)
    if item_to_epic:
        items = (
            db.query(WorkItem.id, WorkItem.estimated_hours, WorkItem.logged_hours)
            .filter(WorkItem.id.in_(item_to_epic.keys()))
            .all()
        )
        for it in items:
            ep_id = item_to_epic.get(it.id)
            if ep_id is None:
                continue
            proj_fc[ep_id] = proj_fc.get(ep_id, 0) + int(it.estimated_hours or 0)
            proj_act[ep_id] = proj_act.get(ep_id, 0) + int(it.logged_hours or 0)

    # Month-scoped actuals from time_entries. Use exclusive upper bounds
    # (start-of-next-month) instead of 23:59:59 to avoid microsecond slop.
    now = _utc_now()
    cur_start = _start_of_month(now)
    next_start = _add_month(cur_start)
    last_start = _start_of_month(cur_start - timedelta(days=1))

    def _scoped_hours(start: datetime, end_exclusive: datetime) -> dict[int, int]:
        if not item_to_epic:
            return {}
        rows = (
            db.query(
                TimeEntry.work_item_id,
                func.coalesce(func.sum(TimeEntry.hours), 0).label("hours"),
            )
            .filter(TimeEntry.work_item_id.in_(item_to_epic.keys()))
            .filter(TimeEntry.logged_at >= start)
            .filter(TimeEntry.logged_at < end_exclusive)
            .group_by(TimeEntry.work_item_id)
            .all()
        )
        out: dict[int, int] = {}
        for r in rows:
            ep_id = item_to_epic.get(r.work_item_id)
            if ep_id is None:
                continue
            out[ep_id] = out.get(ep_id, 0) + int(r.hours or 0)
        return out

    cur_act = _scoped_hours(cur_start, next_start)
    last_act = _scoped_hours(last_start, cur_start)

    def _row(epic: WorkItem, act: int, fc: int) -> dict:
        return {
            "feature": epic.title or "",
            "employee": epic.assignee.name if epic.assignee else "Unassigned",
            "fc": int(fc or 0),
            "act": int(act or 0),
        }

    # For ``current``/``last`` we surface fc = proj_fc (estimates don't
    # change month-to-month; the plan says "FC = sum of estimates").
    current = [_row(e, cur_act.get(e.id, 0), proj_fc.get(e.id, 0)) for e in epics]
    last = [_row(e, last_act.get(e.id, 0), proj_fc.get(e.id, 0)) for e in epics]
    project_rows = [_row(e, proj_act.get(e.id, 0), proj_fc.get(e.id, 0)) for e in epics]

    return {"current": current, "last": last, "project": project_rows}


# ---------------------------------------------------------------------------
# Top-level handler
# ---------------------------------------------------------------------------


@router.get("/{project_id}/pulse-derived")
def get_pulse_derived(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return DB-derived values aligned 1:1 with the frontend ``PulseData``
    shape. Each sub-section falls back to a sensible empty value on error
    so the page still renders even if one computation breaks. The
    ``_meta.degraded_sections`` list surfaces which (if any) sections fell
    back so the frontend / ops can flag partial responses.
    """
    project = require_project_access(project_id, current_user, db)
    degraded: list[str] = []

    months_block = _safe(
        "months",
        lambda: _derive_months(project, db),
        {"months": [], "lastActualIdx": 0, "currentMonthTrackedPct": 0},
        degraded,
    )

    return {
        "project": _safe("project", lambda: _derive_project_meta(project, db), {}, degraded),
        "summary": _safe("summary", lambda: _derive_summary(project, db), {}, degraded),
        "months": months_block.get("months", []),
        "lastActualIdx": months_block.get("lastActualIdx", 0),
        "currentMonthTrackedPct": months_block.get("currentMonthTrackedPct", 0),
        "includedServices": _safe(
            "includedServices",
            lambda: _derive_included_services(project, db),
            [],
            degraded,
        ),
        "milestones": _safe("milestones", lambda: _derive_milestones(project, db), [], degraded),
        "updates": _safe("updates", lambda: _derive_updates(project, db), [], degraded),
        "forecastVsActuals": _safe(
            "forecastVsActuals",
            lambda: _derive_forecast_vs_actuals(project, db),
            {"current": [], "last": [], "project": []},
            degraded,
        ),
        # Consistent shape — always present, even when empty, so the
        # frontend doesn't need to guard for missing ``_meta``.
        "_meta": {"degraded_sections": degraded},
    }


# ---------------------------------------------------------------------------
# Pulse overrides — editorial blob (narrative, ledger, risks, manual cost
# categories, billing inputs, milestone budgets) stored as JSON. The frontend
# ``PulseData`` types are the schema; the server stores the blob as-is.
# ---------------------------------------------------------------------------

# Max serialized payload size for the PUT override endpoint. The blob is
# editorial text/JSON; 1 MB is well above anything we'd legitimately
# expect, and well below anything that would OOM the API process.
_MAX_OVERRIDE_BYTES = 1_000_000


class PulseOverridePayload(BaseModel):
    """Request body for ``PUT /pulse-overrides``. Treated as opaque."""

    data: dict


def _serialize_override(override: ProjectPulseOverride | None) -> dict:
    """Standard GET/PUT response shape — empty defaults when no row exists."""
    if override is None:
        return {"data": {}, "updated_at": None, "updated_by": None}
    return {
        "data": override.data or {},
        "updated_at": override.updated_at.isoformat() if override.updated_at else None,
        "updated_by": (
            {
                "id": override.updated_by.id,
                "name": override.updated_by.name,
                "email": override.updated_by.email,
            }
            if override.updated_by
            else None
        ),
    }


@router.get("/{project_id}/pulse-overrides")
def get_pulse_overrides(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the editorial Pulse blob for a project.

    If no row exists, returns ``{"data": {}, "updated_at": null,
    "updated_by": null}`` — the frontend uses that as the "first-time"
    signal to do a one-shot localStorage migration.
    """
    require_project_access(project_id, current_user, db)
    override = (
        db.query(ProjectPulseOverride)
        .options(selectinload(ProjectPulseOverride.updated_by))
        .filter(ProjectPulseOverride.project_id == project_id)
        .first()
    )
    return _serialize_override(override)


@router.put("/{project_id}/pulse-overrides")
def put_pulse_overrides(
    project_id: int,
    payload: PulseOverridePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert the editorial Pulse blob for a project.

    The blob is opaque on the server — the frontend types are the
    contract and they evolve faster than the backend should. The PUT
    handler captures the calling user into ``updated_by_user_id`` so
    the UI can show "last edited by X".

    Access control mirrors the frontend ``project.pulse.settings``
    capability: only project admins (or system admins) can edit. Any
    project member can still read via the GET handler above.

    Note: last-write-wins; multi-PM editing is rare for editorial blobs
    so we deliberately don't add optimistic locking here.
    """
    # Reject oversized payloads early so we don't write 50 MB blobs to
    # the DB by accident. ``json.dumps`` is the most accurate proxy for
    # what we'll end up persisting.
    try:
        size = len(json.dumps(payload.data))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid pulse override payload") from exc
    if size > _MAX_OVERRIDE_BYTES:
        raise HTTPException(status_code=413, detail="Pulse override payload too large")

    require_project_access(project_id, current_user, db)
    if not is_project_admin(project_id, current_user, db):
        raise HTTPException(
            status_code=403,
            detail="Only project admins can edit pulse settings",
        )

    override = (
        db.query(ProjectPulseOverride)
        .options(selectinload(ProjectPulseOverride.updated_by))
        .filter(ProjectPulseOverride.project_id == project_id)
        .first()
    )
    if override is None:
        override = ProjectPulseOverride(
            project_id=project_id,
            data=payload.data,
            updated_by_user_id=current_user.id,
        )
        db.add(override)
    else:
        override.data = payload.data
        override.updated_by_user_id = current_user.id
        # ``onupdate=datetime.utcnow`` doesn't fire when only JSON contents
        # change (SQLAlchemy can't tell the dict was mutated in-place),
        # so set updated_at explicitly to be safe across drivers.
        override.updated_at = _utc_now()

    db.commit()
    # ``selectinload`` on the initial fetch (or after add() + flush) populates
    # ``updated_by`` — refresh that relationship explicitly so the response
    # reflects the just-committed updated_by_user_id without a re-query.
    db.refresh(override, ["updated_at", "updated_by"])
    return _serialize_override(override)
