"""Helpers for maintaining the work_item_assignment_history audit trail.

Call ``record_assignment_change`` whenever a work item's assignee changes (including
initial assignment on creation, transfers between developers, and clearing the
assignee). The caller still owns commit/rollback — these helpers only stage changes.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from models.work_item_assignment_history import WorkItemAssignmentHistory
from time_utils import utcnow


def _close_open_span(db: Session, work_item_id: int, at: datetime) -> None:
    open_span = (
        db.query(WorkItemAssignmentHistory)
        .filter(
            WorkItemAssignmentHistory.work_item_id == work_item_id,
            WorkItemAssignmentHistory.unassigned_at.is_(None),
        )
        .order_by(WorkItemAssignmentHistory.assigned_at.desc())
        .first()
    )
    if open_span is not None:
        open_span.unassigned_at = at


def record_assignment_change(
    db: Session,
    work_item_id: int,
    new_assignee_id: int | None,
    at: datetime | None = None,
) -> None:
    """Close the currently-open span (if any) and open a new one for `new_assignee_id`.

    If `new_assignee_id` is None, only the close happens (ticket becomes unassigned).
    """
    at = at or utcnow()
    _close_open_span(db, work_item_id, at)
    if new_assignee_id is not None:
        db.add(
            WorkItemAssignmentHistory(
                work_item_id=work_item_id,
                developer_id=new_assignee_id,
                assigned_at=at,
            )
        )
