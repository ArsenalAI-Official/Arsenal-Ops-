"""Sprint overlog analytics: get_hours_analytics reports per-sprint overboard
hours and lists the tickets that blew past their estimate (PM tab)."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.sprint import Sprint
from models.work_item import WorkItem
from routers.workitems import get_hours_analytics
from tests.conftest import seed_project


def _work_item(db, project, key, *, estimated, logged, sprint_id, status="in_progress"):
    wi = WorkItem(
        project_id=project.id,
        type="task",
        key=key,
        title=f"Ticket {key}",
        status=status,
        priority="medium",
        estimated_hours=estimated,
        logged_hours=logged,
        remaining_hours=max(0, estimated - logged),
        sprint_id=sprint_id,
    )
    db.add(wi)
    return wi


def _sprint_row(analytics, sprint_id):
    return next(s for s in analytics["sprint_hours"] if s["sprint_id"] == sprint_id)


def test_overlog_totals_and_ticket_list(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    sprint = Sprint(project_id=project.id, name="Sprint 1", status="active")
    db.add(sprint)
    db.flush()

    # Overlogged: logged 7 on a 4h estimate → +3 over.
    _work_item(db, project, "OVL-1", estimated=4, logged=7, sprint_id=sprint.id)
    # Within budget: 2 of 5 → not overlogged.
    _work_item(db, project, "OVL-2", estimated=5, logged=2, sprint_id=sprint.id)
    # Unestimated (0h) with logged time → NOT counted (no baseline to exceed).
    _work_item(db, project, "OVL-3", estimated=0, logged=5, sprint_id=sprint.id)
    db.commit()

    analytics = get_hours_analytics(project.id, db=db, current_user=user)
    row = _sprint_row(analytics, sprint.id)

    assert row["overlogged_hours"] == 3
    assert len(row["overlogged_items"]) == 1
    over = row["overlogged_items"][0]
    assert over["key"] == "OVL-1"
    assert over["estimated_hours"] == 4
    assert over["logged_hours"] == 7
    assert over["over_hours"] == 3


def test_no_overlog_reports_zero(db, admin_user):
    user, _ = admin_user
    project = seed_project(db)
    sprint = Sprint(project_id=project.id, name="Sprint 1", status="active")
    db.add(sprint)
    db.flush()
    _work_item(db, project, "OK-1", estimated=8, logged=3, sprint_id=sprint.id)
    _work_item(db, project, "OK-2", estimated=4, logged=4, sprint_id=sprint.id)  # exactly on budget
    db.commit()

    analytics = get_hours_analytics(project.id, db=db, current_user=user)
    row = _sprint_row(analytics, sprint.id)

    assert row["overlogged_hours"] == 0
    assert row["overlogged_items"] == []
