"""
Shared weekly capacity calculation for developers.

Used by:
  • /api/admin/developers/capacity   (across all projects, per developer)
  • /api/projects/{id}/workload      (within one project, per assignee)
  • /api/workitems/projects/{id}/hours-analytics   (per developer, scoped to project)

Week boundary: Saturday 00:00 → Friday 23:59 (UTC).

Per-ticket contribution rules (in_progress only — others are simple lookups):
  • inherited_this_week  → remaining_hours
        (last_assigned_at is in this week AND > started_at — ticket was transferred
         to the current assignee mid-stream; they shouldn't be charged the original
         full estimate.)
  • started_this_week    → estimated_hours        (full booking — committed for the week)
  • older                → remaining_hours        (carry-forward across weeks)

  • in_review            → logged_hours           (work the assignee already did)
  • done completed_this_week → logged_hours       (older done drops off)
"""
from datetime import datetime, timedelta
from typing import Iterable, Optional, Tuple


def week_boundaries(now: Optional[datetime] = None) -> Tuple[datetime, datetime]:
    """Saturday 00:00 → Friday 23:59 UTC for the week containing `now`."""
    today = now or datetime.utcnow()
    days_back = (today.weekday() + 2) % 7  # Mon=0, Sat=5; (0+2)%7=2 ... (5+2)%7=0
    week_start = (today - timedelta(days=days_back)).replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return week_start, week_end


def classify_ticket(item, week_start: datetime) -> Tuple[Optional[str], int, Optional[str]]:
    """Return (bucket, counted_hours, basis) for a single work item.

    bucket ∈ {"in_progress", "in_review", "done", None}
    None means the ticket doesn't contribute to capacity this week.
    """
    estimated = item.estimated_hours or 0
    logged = item.logged_hours or 0
    remaining = max(0, estimated - logged)

    status = item.status

    if status == "in_progress":
        last_assigned_at = getattr(item, "last_assigned_at", None)
        inherited_this_week = (
            last_assigned_at is not None
            and last_assigned_at >= week_start
            and (item.started_at is None or last_assigned_at > item.started_at)
        )
        started_this_week = item.started_at is not None and item.started_at >= week_start

        if inherited_this_week:
            return ("in_progress", remaining, "remaining (transferred)")
        if started_this_week:
            return ("in_progress", estimated, "estimated")
        return ("in_progress", remaining, "remaining")

    if status == "in_review":
        return ("in_review", logged, "logged")

    if status == "done" and item.completed_at and item.completed_at >= week_start:
        return ("done", logged, "logged")

    return (None, 0, None)


def _ticket_to_dict(item, counted: int, basis: str, bucket: str) -> dict:
    estimated = item.estimated_hours or 0
    logged = item.logged_hours or 0
    return {
        "id": item.id,
        "key": item.key,
        "title": item.title,
        "status": item.status,
        "priority": item.priority,
        "project_id": item.project_id,
        "project_name": item.project.name if getattr(item, "project", None) else None,
        "estimated_hours": estimated,
        "logged_hours": logged,
        "remaining_hours": max(0, estimated - logged),
        "started_at": item.started_at.isoformat() if item.started_at else None,
        "last_assigned_at": item.last_assigned_at.isoformat() if getattr(item, "last_assigned_at", None) else None,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
        "counted_hours": counted,
        "counted_basis": basis,
    }


def compute_capacity_breakdown(items: Iterable, week_start: datetime, week_capacity: int = 40) -> dict:
    """Aggregate per-status hours and ticket detail for one developer's items.

    Pass items already filtered to the developer (and optionally to a project).
    """
    in_progress_hours = 0
    in_review_hours = 0
    done_hours = 0
    tickets = []

    for item in items:
        bucket, counted, basis = classify_ticket(item, week_start)
        if bucket is None:
            continue
        if bucket == "in_progress":
            in_progress_hours += counted
        elif bucket == "in_review":
            in_review_hours += counted
        elif bucket == "done":
            done_hours += counted
        tickets.append(_ticket_to_dict(item, counted, basis, bucket))

    capacity_used = in_progress_hours + in_review_hours + done_hours
    return {
        "this_week_in_progress_hours": in_progress_hours,
        "this_week_in_review_hours": in_review_hours,
        "this_week_done_hours": done_hours,
        "this_week_capacity_used": capacity_used,
        "this_week_remaining_capacity": max(0, week_capacity - capacity_used),
        "tickets": tickets,
    }
