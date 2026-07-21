"""
Tests for transfer-aware weekly capacity calculation
(services/capacity_service.compute_capacity_breakdown).

Each scenario seeds:
  • work_items     — the ticket(s) under test
  • time_entries   — per-developer logged hours, time-stamped
  • work_item_assignment_history — assignment spans (open + closed)

Then calls compute_capacity_breakdown(items, week_start, db=db, developer_id=dev.id)
and asserts on the result.

Run with:
    cd backend && python -m pytest test_capacity_transfers.py -v
"""

import os
import sys
from datetime import timedelta

import pytest

# Make `backend/` importable when run from anywhere.
sys.path.insert(0, os.path.dirname(__file__))

# Import every model so SQLAlchemy can resolve relationships when create_all runs.
import contextlib

from models import (  # noqa: F401
    activity_log,
    architecture,
    developer,
    market_insight,
    persona,
    project,
    project_file,
    project_goal,
    project_milestone,
    sprint,
    task,
    task_dependency,
    time_entry,
    user,
    user_story,
    work_item,
    work_item_assignment_history,
)

with contextlib.suppress(ImportError):
    from models import personal_task  # noqa: F401

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from services.capacity_service import compute_capacity_breakdown, week_boundaries

# --------------- In-memory SQLite test DB ---------------
TEST_DB_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


# --------------- Helpers ---------------
def _wb():
    week_start, week_end = week_boundaries()
    return week_start, week_end


def _last_week():
    ws, _ = _wb()
    return ws - timedelta(days=3)


def _mid_week():
    ws, we = _wb()
    return ws + (we - ws) / 2


def create_project(db, name="Test Project"):
    from models.project import Project

    p = Project(name=name, description="t", status="active")
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def create_developer(db, name, email):
    from models.developer import Developer

    d = Developer(name=name, email=email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


_wi_counter = {"n": 0}


def create_work_item(db, project_id, assignee_id, **kwargs):
    """Create a work item. `logged_hours` is treated as the cumulative total on the
    ticket — callers should match it to the sum of time entries they later add."""
    from models.work_item import WorkItem

    _wi_counter["n"] += 1
    defaults = {
        "key": f"T-{_wi_counter['n']}",
        "title": "Test ticket",
        "type": "task",
        "status": "todo",
        "estimated_hours": 10,
        "logged_hours": 0,
        "project_id": project_id,
        "assignee_id": assignee_id,
    }
    defaults.update(kwargs)
    defaults["remaining_hours"] = max(
        0, (defaults.get("estimated_hours") or 0) - (defaults.get("logged_hours") or 0)
    )
    wi = WorkItem(**defaults)
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi


def add_time_entry(db, work_item, developer_id, hours, logged_at):  # noqa: F811 — `work_item` param shadows the side-effect-only module import above
    """Insert a TimeEntry. Does NOT touch work_item.logged_hours — caller controls
    the cumulative total when constructing the scenario, so tests can model
    'X hours were logged previously'."""
    from models.time_entry import TimeEntry

    e = TimeEntry(
        work_item_id=work_item.id,
        developer_id=developer_id,
        hours=hours,
        logged_at=logged_at,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def add_assignment_span(db, work_item_id, developer_id, assigned_at, unassigned_at=None):
    from models.work_item_assignment_history import WorkItemAssignmentHistory

    s = WorkItemAssignmentHistory(
        work_item_id=work_item_id,
        developer_id=developer_id,
        assigned_at=assigned_at,
        unassigned_at=unassigned_at,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def get_capacity(db, dev):
    """Run compute_capacity_breakdown for `dev` using all their currently-assigned items."""
    from models.work_item import WorkItem

    items = db.query(WorkItem).filter(WorkItem.assignee_id == dev.id).all()
    week_start, _ = _wb()
    return compute_capacity_breakdown(items, week_start, db=db, developer_id=dev.id)


# =====================================================================
# Scenario 1: In-progress, started this week, no logs, current holder
#   Expected: counted = estimated (logged 0 + remaining = estimated)
# =====================================================================
def test_in_progress_started_this_week_no_logs(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=0,
        started_at=ws + timedelta(hours=1),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws + timedelta(hours=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_in_progress_hours"] == 10
    assert cap["this_week_capacity_used"] == 10
    assert len(cap["tickets"]) == 1
    t = cap["tickets"][0]
    assert t["counted_hours"] == 10
    assert t["counted_basis"] == "remaining (current holder)"
    assert t["your_logged_this_week"] == 0


# =====================================================================
# Scenario 2: In-progress, started this week, 4h logged this week, current holder
#   Expected: counted = 4 logged + 6 remaining = 10
# =====================================================================
def test_in_progress_partial_log_current_holder(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=4,  # 4h already accounted for on ticket
        started_at=ws + timedelta(hours=1),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws + timedelta(hours=1))
    add_time_entry(db, wi, dev.id, 4, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_in_progress_hours"] == 10
    t = cap["tickets"][0]
    assert t["counted_hours"] == 10
    assert t["counted_basis"] == "logged this week + remaining"
    assert t["your_logged_this_week"] == 4


# =====================================================================
# Scenario 3: In-progress carry-over from last week, no log this week, current holder
#   Expected: counted = remaining (= 7h)
# =====================================================================
def test_in_progress_carryover_no_log_this_week(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    lw = _last_week()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=3,  # logged last week
        started_at=lw,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw)
    add_time_entry(db, wi, dev.id, 3, logged_at=lw + timedelta(hours=2))

    cap = get_capacity(db, dev)
    assert cap["this_week_in_progress_hours"] == 7
    t = cap["tickets"][0]
    assert t["counted_hours"] == 7
    assert t["counted_basis"] == "remaining (current holder)"
    assert t["your_logged_this_week"] == 0


# =====================================================================
# Scenario 4: Transfer A → B mid-week, A logged 1h before transfer
#   Expected: A gets 1h (logged this week), B gets 4h (remaining as current holder)
# =====================================================================
def test_transfer_logged_hours_stay_with_previous_owner(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    transfer_at = ws + timedelta(days=2)
    wi = create_work_item(
        db,
        p.id,
        B.id,  # B is the CURRENT assignee post-transfer
        status="in_progress",
        estimated_hours=5,
        logged_hours=1,
        started_at=ws,
        last_assigned_at=transfer_at,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(days=1))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)

    assert cap_A["this_week_in_progress_hours"] == 1
    assert cap_A["tickets"][0]["counted_basis"] == "logged this week"
    assert cap_A["tickets"][0]["your_logged_this_week"] == 1

    assert cap_B["this_week_in_progress_hours"] == 4
    assert cap_B["tickets"][0]["counted_basis"] == "remaining (current holder)"
    assert cap_B["tickets"][0]["your_logged_this_week"] == 0


# =====================================================================
# Scenario 5: Bouncing A → B → A in one week
#   A logs 1h, transfer to B, B logs 2h, transfer to A, A logs 1h more.
#   Ticket: est=5, total_logged=4, current holder = A.
#   Expected: A gets 3h (2 logged + 1 remaining), B gets 2h.
# =====================================================================
def test_bouncing_assignment(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    t1 = ws + timedelta(days=1, hours=12)
    t2 = ws + timedelta(days=3)
    wi = create_work_item(
        db,
        p.id,
        A.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=4,
        started_at=ws,
        last_assigned_at=t2,
    )
    # Three spans
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=t1)
    add_assignment_span(db, wi.id, B.id, assigned_at=t1, unassigned_at=t2)
    add_assignment_span(db, wi.id, A.id, assigned_at=t2)
    # Logs
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(hours=2))
    add_time_entry(db, wi, B.id, 2, logged_at=ws + timedelta(days=2))
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(days=3, hours=2))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)

    assert cap_A["this_week_in_progress_hours"] == 3
    assert cap_A["tickets"][0]["counted_basis"] == "logged this week + remaining"
    assert cap_A["tickets"][0]["your_logged_this_week"] == 2

    assert cap_B["this_week_in_progress_hours"] == 2
    assert cap_B["tickets"][0]["counted_basis"] == "logged this week"
    assert cap_B["tickets"][0]["your_logged_this_week"] == 2


# =====================================================================
# Scenario 6: Carry-over done this week, dev held throughout
#   3h logged last week + 5h logged this week, ticket completed this week.
#   Expected: only this week's 5h count.
# =====================================================================
def test_done_carryover_only_this_weeks_logs(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    lw = _last_week()
    completed = ws + timedelta(days=2)
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="done",
        estimated_hours=8,
        logged_hours=8,
        started_at=lw,
        completed_at=completed,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw)
    add_time_entry(db, wi, dev.id, 3, logged_at=lw + timedelta(hours=4))
    add_time_entry(db, wi, dev.id, 5, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_done_hours"] == 5
    assert cap["this_week_capacity_used"] == 5
    t = cap["tickets"][0]
    assert t["counted_hours"] == 5
    assert t["counted_basis"] == "logged this week"
    assert t["your_logged_this_week"] == 5


# =====================================================================
# Scenario 7: Done this week, split A → B (B finished it)
#   A logs 2h this week, B logs 4h this week, B marks it done.
#   Expected: A: 2h done, B: 4h done. Sum = 6h.
# =====================================================================
def test_done_split_between_two_devs(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    transfer_at = ws + timedelta(days=2)
    completed = ws + timedelta(days=4)
    wi = create_work_item(
        db,
        p.id,
        B.id,
        status="done",
        estimated_hours=6,
        logged_hours=6,
        started_at=ws,
        last_assigned_at=transfer_at,
        completed_at=completed,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)
    add_time_entry(db, wi, A.id, 2, logged_at=ws + timedelta(days=1))
    add_time_entry(db, wi, B.id, 4, logged_at=ws + timedelta(days=3))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)

    assert cap_A["this_week_done_hours"] == 2
    assert cap_A["this_week_in_progress_hours"] == 0
    assert cap_A["tickets"][0]["counted_basis"] == "logged this week"

    assert cap_B["this_week_done_hours"] == 4
    # done bucket should not add remaining even if B is the current holder
    assert cap_B["this_week_in_progress_hours"] == 0


# =====================================================================
# Scenario 8: Done this week but ALL logged hours were last week
#   Expected: ticket not counted (logged_this_week=0 for done = 0).
# =====================================================================
def test_done_no_log_this_week(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    lw = _last_week()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="done",
        estimated_hours=4,
        logged_hours=4,
        started_at=lw,
        completed_at=ws + timedelta(days=1),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw)
    add_time_entry(db, wi, dev.id, 4, logged_at=lw + timedelta(hours=2))

    cap = get_capacity(db, dev)
    assert cap["this_week_done_hours"] == 0
    assert cap["this_week_capacity_used"] == 0
    assert len(cap["tickets"]) == 0


# =====================================================================
# Scenario 9: Logged hours from previous week don't leak into this week
#   In-progress carry-over, current holder, 5h logged last week only.
#   Expected: counted = remaining (5h), basis = remaining only.
# =====================================================================
def test_previous_week_logs_excluded(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    lw = _last_week()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=5,
        started_at=lw,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw)
    add_time_entry(db, wi, dev.id, 5, logged_at=lw + timedelta(hours=2))

    cap = get_capacity(db, dev)
    assert cap["this_week_in_progress_hours"] == 5
    t = cap["tickets"][0]
    assert t["counted_basis"] == "remaining (current holder)"
    assert t["your_logged_this_week"] == 0


# =====================================================================
# Scenario 10: In-review, current holder, partial log this week
#   Expected: counted = logged_this_week + remaining
# =====================================================================
def test_in_review_current_holder_partial_log(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_review",
        estimated_hours=8,
        logged_hours=3,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    add_time_entry(db, wi, dev.id, 3, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_in_review_hours"] == 8  # 3 logged + 5 remaining
    t = cap["tickets"][0]
    assert t["counted_basis"] == "logged this week + remaining"
    assert t["your_logged_this_week"] == 3


# =====================================================================
# Scenario 11: Transferred away mid-week with NO logs by previous owner
#   Expected: previous owner shows nothing in capacity for this ticket.
# =====================================================================
def test_transferred_away_no_logs_no_credit(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    transfer_at = ws + timedelta(days=1)
    wi = create_work_item(
        db,
        p.id,
        B.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=0,
        started_at=ws,
        last_assigned_at=transfer_at,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)

    # A had it briefly, logged nothing → ticket should not show in A's capacity.
    assert cap_A["this_week_capacity_used"] == 0
    assert len(cap_A["tickets"]) == 0
    # B is the current holder of an open 10h ticket.
    assert cap_B["this_week_in_progress_hours"] == 10


# =====================================================================
# Scenario 12: Aggregate across multiple tickets for one developer
# =====================================================================
def test_aggregate_multiple_tickets(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    lw = _last_week()

    # T1: in_progress, started this week, no logs, current holder. → 10h
    t1 = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=0,
        started_at=ws + timedelta(hours=2),
    )
    add_assignment_span(db, t1.id, dev.id, assigned_at=ws + timedelta(hours=2))

    # T2: in_review, current holder, 4h logged this week. → 4 + remaining(2) = 6h
    t2 = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_review",
        estimated_hours=6,
        logged_hours=4,
        started_at=ws,
    )
    add_assignment_span(db, t2.id, dev.id, assigned_at=ws)
    add_time_entry(db, t2, dev.id, 4, logged_at=ws + timedelta(days=1))

    # T3: done this week, 2h logged last week + 3h logged this week. → 3h
    t3 = create_work_item(
        db,
        p.id,
        dev.id,
        status="done",
        estimated_hours=5,
        logged_hours=5,
        started_at=lw,
        completed_at=ws + timedelta(days=2),
    )
    add_assignment_span(db, t3.id, dev.id, assigned_at=lw)
    add_time_entry(db, t3, dev.id, 2, logged_at=lw + timedelta(hours=4))
    add_time_entry(db, t3, dev.id, 3, logged_at=ws + timedelta(days=1, hours=2))

    cap = get_capacity(db, dev)
    assert cap["this_week_in_progress_hours"] == 10
    assert cap["this_week_in_review_hours"] == 6
    assert cap["this_week_done_hours"] == 3
    assert cap["this_week_capacity_used"] == 19
    assert cap["this_week_remaining_capacity"] == 40 - 19
    assert len(cap["tickets"]) == 3


# =====================================================================
# Scenario 13: Status filter — todo / backlog tickets don't contribute
# =====================================================================
def test_todo_and_backlog_not_counted(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    for status in ("todo", "backlog"):
        wi = create_work_item(
            db,
            p.id,
            dev.id,
            status=status,
            estimated_hours=10,
            logged_hours=0,
        )
        add_assignment_span(db, wi.id, dev.id, assigned_at=ws)

    cap = get_capacity(db, dev)
    assert cap["this_week_capacity_used"] == 0
    assert len(cap["tickets"]) == 0


# =====================================================================
# Scenario 14: Done from a previous week (not this week) doesn't count
# =====================================================================
def test_done_completed_last_week_excluded(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    lw = _last_week()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="done",
        estimated_hours=5,
        logged_hours=5,
        started_at=lw - timedelta(days=2),
        completed_at=lw,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw - timedelta(days=2))
    add_time_entry(db, wi, dev.id, 5, logged_at=lw - timedelta(days=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_done_hours"] == 0
    assert len(cap["tickets"]) == 0


# =====================================================================
# Additional scenarios — boundary conditions, edge cases, and variants
# =====================================================================


# Scenario 15: Done this week — started AND completed in the same week
def test_done_started_and_completed_this_week(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="done",
        estimated_hours=5,
        logged_hours=5,
        started_at=ws + timedelta(hours=2),
        completed_at=ws + timedelta(days=2),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws + timedelta(hours=2))
    add_time_entry(db, wi, dev.id, 5, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_done_hours"] == 5
    assert cap["tickets"][0]["counted_basis"] == "logged this week"


# Scenario 16: In-progress started this week then transferred away mid-week
def test_in_progress_started_this_week_then_transferred(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    started = ws + timedelta(hours=2)
    transfer = ws + timedelta(days=2)
    wi = create_work_item(
        db,
        p.id,
        B.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=3,
        started_at=started,
        last_assigned_at=transfer,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=started, unassigned_at=transfer)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer)
    add_time_entry(db, wi, A.id, 3, logged_at=ws + timedelta(days=1))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)
    # A: 3 logged this week, no longer current → just 3h
    assert cap_A["this_week_in_progress_hours"] == 3
    # B: nothing logged yet, current holder → remaining = 7h
    assert cap_B["this_week_in_progress_hours"] == 7


# Scenario 17: Multiple time entries by same dev on same ticket — sums correctly
def test_multiple_entries_same_dev_same_ticket(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=6,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    add_time_entry(db, wi, dev.id, 2, logged_at=ws + timedelta(days=1, hours=9))
    add_time_entry(db, wi, dev.id, 2, logged_at=ws + timedelta(days=1, hours=14))
    add_time_entry(db, wi, dev.id, 2, logged_at=ws + timedelta(days=2, hours=10))

    cap = get_capacity(db, dev)
    # 6 logged this week + 4 remaining = 10
    assert cap["this_week_in_progress_hours"] == 10
    assert cap["tickets"][0]["your_logged_this_week"] == 6
    assert cap["tickets"][0]["counted_basis"] == "logged this week + remaining"


# Scenario 18: Log at exactly week_start (00:00 Sat UTC) — INCLUDED
def test_log_at_week_start_boundary_included(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=2,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    add_time_entry(db, wi, dev.id, 2, logged_at=ws)  # exactly at boundary

    cap = get_capacity(db, dev)
    assert cap["tickets"][0]["your_logged_this_week"] == 2
    assert cap["this_week_in_progress_hours"] == 5  # 2 logged + 3 remaining


# Scenario 19: Log at exactly week_end (23:59:59 Fri UTC) — INCLUDED
def test_log_at_week_end_boundary_included(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, we = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=1,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    add_time_entry(db, wi, dev.id, 1, logged_at=we)

    cap = get_capacity(db, dev)
    assert cap["tickets"][0]["your_logged_this_week"] == 1


# Scenario 20: Log just before week_start — EXCLUDED
def test_log_just_before_week_start_excluded(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=2,
        started_at=ws - timedelta(days=1),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws - timedelta(days=1))
    add_time_entry(db, wi, dev.id, 2, logged_at=ws - timedelta(seconds=1))

    cap = get_capacity(db, dev)
    assert cap["tickets"][0]["your_logged_this_week"] == 0
    # current holder, only remaining counts
    assert cap["this_week_in_progress_hours"] == 3
    assert cap["tickets"][0]["counted_basis"] == "remaining (current holder)"


# Scenario 21: Overrun — logged > estimated — remaining clamps to 0
def test_overrun_logged_exceeds_estimated(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=8,  # overrun by 3
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    add_time_entry(db, wi, dev.id, 8, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    # 8 logged this week + 0 remaining (clamped) = 8h
    assert cap["this_week_in_progress_hours"] == 8
    assert cap["tickets"][0]["your_logged_this_week"] == 8
    assert cap["tickets"][0]["counted_basis"] == "logged this week"
    assert cap["tickets"][0]["remaining_hours"] == 0


# Scenario 22: Capacity used > 40 — remaining_capacity clamps to 0
def test_capacity_exceeds_weekly_cap_clamps_to_zero(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    # Two tickets totaling 50h
    t1 = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=30,
        logged_hours=0,
        started_at=ws + timedelta(hours=1),
    )
    add_assignment_span(db, t1.id, dev.id, assigned_at=ws + timedelta(hours=1))
    t2 = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=20,
        logged_hours=0,
        started_at=ws + timedelta(hours=1),
    )
    add_assignment_span(db, t2.id, dev.id, assigned_at=ws + timedelta(hours=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_capacity_used"] == 50
    assert cap["this_week_remaining_capacity"] == 0  # clamped, not -10


# Scenario 23: TimeEntry with NULL developer_id is ignored
def test_time_entry_null_developer_id_is_ignored(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=2,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    # 2h entry with NULL developer (e.g., stale data)
    add_time_entry(db, wi, None, 2, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    # The NULL-dev entry should not count toward dev's logged_this_week
    assert cap["tickets"][0]["your_logged_this_week"] == 0
    # Only remaining counts
    assert cap["this_week_in_progress_hours"] == 3
    assert cap["tickets"][0]["counted_basis"] == "remaining (current holder)"


# Scenario 24: Three-way transfer A → B → C in one week, all log hours
def test_three_way_transfer(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    C = create_developer(db, "C", "c@t.com")
    ws, _ = _wb()
    t1 = ws + timedelta(days=1)
    t2 = ws + timedelta(days=3)
    wi = create_work_item(
        db,
        p.id,
        C.id,  # C is the current holder
        status="in_progress",
        estimated_hours=12,
        logged_hours=6,
        started_at=ws,
        last_assigned_at=t2,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=t1)
    add_assignment_span(db, wi.id, B.id, assigned_at=t1, unassigned_at=t2)
    add_assignment_span(db, wi.id, C.id, assigned_at=t2)
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(hours=4))
    add_time_entry(db, wi, B.id, 3, logged_at=ws + timedelta(days=2))
    add_time_entry(db, wi, C.id, 2, logged_at=ws + timedelta(days=4))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)
    cap_C = get_capacity(db, C)

    assert cap_A["this_week_in_progress_hours"] == 1
    assert cap_B["this_week_in_progress_hours"] == 3
    # C: 2 logged + remaining(12-6=6) = 8
    assert cap_C["this_week_in_progress_hours"] == 8
    # Total across all three: 1 + 3 + 8 = 12 = total estimated
    assert (
        cap_A["this_week_in_progress_hours"]
        + cap_B["this_week_in_progress_hours"]
        + cap_C["this_week_in_progress_hours"]
    ) == 12


# Scenario 25: estimated=0 ticket with logged hours this week — counts logged only
def test_zero_estimate_with_logs(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=0,
        logged_hours=3,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    add_time_entry(db, wi, dev.id, 3, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    # remaining = max(0, 0-3) = 0. counted = 3 logged + 0 = 3.
    assert cap["this_week_in_progress_hours"] == 3
    assert cap["tickets"][0]["counted_basis"] == "logged this week"


# Scenario 26: Cancelled status is not counted
def test_cancelled_status_not_counted(db):
    p = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    wi = create_work_item(
        db,
        p.id,
        dev.id,
        status="cancelled",
        estimated_hours=10,
        logged_hours=4,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    add_time_entry(db, wi, dev.id, 4, logged_at=ws + timedelta(days=1))

    cap = get_capacity(db, dev)
    assert cap["this_week_capacity_used"] == 0
    assert len(cap["tickets"]) == 0


# Scenario 27: Bouncing applies to in_review too
def test_bouncing_in_review(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    t1 = ws + timedelta(days=1, hours=12)
    t2 = ws + timedelta(days=3)
    wi = create_work_item(
        db,
        p.id,
        A.id,
        status="in_review",
        estimated_hours=8,
        logged_hours=5,
        started_at=ws,
        last_assigned_at=t2,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=t1)
    add_assignment_span(db, wi.id, B.id, assigned_at=t1, unassigned_at=t2)
    add_assignment_span(db, wi.id, A.id, assigned_at=t2)
    add_time_entry(db, wi, A.id, 2, logged_at=ws + timedelta(hours=2))
    add_time_entry(db, wi, B.id, 2, logged_at=ws + timedelta(days=2))
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(days=3, hours=2))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)
    # A: 3 logged + remaining(8-5=3) = 6h
    assert cap_A["this_week_in_review_hours"] == 6
    assert cap_B["this_week_in_review_hours"] == 2


# Scenario 28: Dev has no current assignment, but logged hours on a transferred-away ticket
#   The input items list is empty for them, but the logic expands via TimeEntry.
def test_expansion_via_logged_ids_with_empty_input(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    transfer_at = ws + timedelta(days=1)
    wi = create_work_item(
        db,
        p.id,
        B.id,  # B currently holds it
        status="in_progress",
        estimated_hours=5,
        logged_hours=2,
        started_at=ws,
        last_assigned_at=transfer_at,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)
    add_time_entry(db, wi, A.id, 2, logged_at=ws + timedelta(hours=4))

    # A has no currently-assigned items — pass empty list to verify expansion works.
    week_start, _ = _wb()
    cap_A = compute_capacity_breakdown([], week_start, db=db, developer_id=A.id)
    assert cap_A["this_week_in_progress_hours"] == 2
    assert cap_A["tickets"][0]["your_logged_this_week"] == 2


# Scenario 29: Dev had a brief assignment span this week, transferred away, but never logged
#   Expansion via history pulls in the ticket, but with 0 logged hours + not current holder
#   it's filtered out (no contribution).
def test_held_briefly_no_logs_filtered_out(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    transfer_at = ws + timedelta(hours=2)
    wi = create_work_item(
        db,
        p.id,
        B.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=0,
        started_at=ws,
        last_assigned_at=transfer_at,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)

    cap_A = get_capacity(db, A)
    assert cap_A["this_week_capacity_used"] == 0
    assert len(cap_A["tickets"]) == 0


# Scenario 30: Two devs, same ticket, both have remaining-attributed capacity?
#   Sanity: only ONE dev (the current holder) can claim remaining_hours.
def test_only_current_holder_claims_remaining(db):
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    transfer_at = ws + timedelta(days=2)
    wi = create_work_item(
        db,
        p.id,
        B.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=2,
        started_at=ws,
        last_assigned_at=transfer_at,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)
    add_time_entry(db, wi, A.id, 2, logged_at=ws + timedelta(days=1))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)
    # A: 2 logged, no remaining (not current). B: 0 logged + 8 remaining.
    assert cap_A["this_week_in_progress_hours"] == 2
    assert "remaining" not in cap_A["tickets"][0]["counted_basis"]
    assert cap_B["this_week_in_progress_hours"] == 8
    assert "remaining" in cap_B["tickets"][0]["counted_basis"]


# Scenario 31: Week summary keys are always present and correct types
def test_response_shape_keys_present(db):
    _ = create_project(db)
    dev = create_developer(db, "A", "a@t.com")
    cap = get_capacity(db, dev)  # no tickets at all
    expected_keys = {
        "this_week_in_progress_hours",
        "this_week_in_review_hours",
        "this_week_done_hours",
        "this_week_capacity_used",
        "this_week_remaining_capacity",
        "tickets",
    }
    assert expected_keys.issubset(cap.keys())
    assert cap["this_week_capacity_used"] == 0
    assert cap["this_week_remaining_capacity"] == 40
    assert cap["tickets"] == []


# =====================================================================
# Scenario 32: Carry-over ticket, transferred multiple times THIS week
#   Ticket: 10h estimated, 6h logged LAST week (cumulative across various
#   owners). At start of this week, held by C with 4h remaining.
#   This week: C logs 1h, transfers to D. D logs 2h, transfers to E.
#   E currently holds it with 1h remaining and no logs yet this week.
#
#   Invariant: across this week's contributors, attributed hours sum to the
#   start-of-week remaining (4h), regardless of how many transfers happened.
# =====================================================================
def test_carryover_multi_transfer_this_week(db):
    p = create_project(db)
    C = create_developer(db, "C", "c@t.com")
    D = create_developer(db, "D", "d@t.com")
    E = create_developer(db, "E", "e@t.com")

    lw = _last_week()
    ws, _ = _wb()
    c_to_d = ws + timedelta(days=1)
    d_to_e = ws + timedelta(days=3)

    # Final state at calc time: 10h estimated, 9h cumulative logged, currently with E.
    wi = create_work_item(
        db,
        p.id,
        E.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=9,
        started_at=lw,
        last_assigned_at=d_to_e,
    )

    # Assignment history (only this-week part of C's span matters for the math).
    add_assignment_span(db, wi.id, C.id, assigned_at=lw, unassigned_at=c_to_d)
    add_assignment_span(db, wi.id, D.id, assigned_at=c_to_d, unassigned_at=d_to_e)
    add_assignment_span(db, wi.id, E.id, assigned_at=d_to_e)

    # Last week: 6h total logged across various owners (doesn't affect this week's math).
    add_time_entry(db, wi, C.id, 6, logged_at=lw + timedelta(hours=4))

    # This week's logs:
    add_time_entry(db, wi, C.id, 1, logged_at=ws + timedelta(hours=5))
    add_time_entry(db, wi, D.id, 2, logged_at=ws + timedelta(days=2))

    cap_C = get_capacity(db, C)
    cap_D = get_capacity(db, D)
    cap_E = get_capacity(db, E)

    # C: 1h logged this week, no longer current.
    assert cap_C["this_week_in_progress_hours"] == 1
    assert cap_C["tickets"][0]["counted_basis"] == "logged this week"
    assert cap_C["tickets"][0]["your_logged_this_week"] == 1

    # D: 2h logged this week, no longer current.
    assert cap_D["this_week_in_progress_hours"] == 2
    assert cap_D["tickets"][0]["counted_basis"] == "logged this week"
    assert cap_D["tickets"][0]["your_logged_this_week"] == 2

    # E: 0h logged, current holder → remaining = 10 - 9 = 1.
    assert cap_E["this_week_in_progress_hours"] == 1
    assert cap_E["tickets"][0]["counted_basis"] == "remaining (current holder)"
    assert cap_E["tickets"][0]["your_logged_this_week"] == 0

    # Invariant: total attributed = start-of-week remaining (10 estimated − 6 last-week logged = 4h).
    total = (
        cap_C["this_week_in_progress_hours"]
        + cap_D["this_week_in_progress_hours"]
        + cap_E["this_week_in_progress_hours"]
    )
    assert total == 4


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])


# =====================================================================
# GAP COVERAGE (calendar-logging branch): scenarios the original suite
# left implicit — new logs by the NEW assignee after transfer, un-assignment
# after logging, and a multi-transfer with no logs at the intermediate holder.
# =====================================================================
def test_new_assignee_logs_after_transfer_are_attributed_to_them(db):
    """A logs 3h, transfers to B, then B logs 5h this week. A keeps 3h (logged,
    no remaining); B gets their 5h logged + the remaining commitment."""
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    ws, _ = _wb()
    transfer_at = ws + timedelta(days=2)
    wi = create_work_item(
        db,
        p.id,
        B.id,  # current holder
        status="in_progress",
        estimated_hours=15,
        logged_hours=8,  # 3 (A) + 5 (B)
        started_at=ws,
        last_assigned_at=transfer_at,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)
    add_time_entry(db, wi, A.id, 3, logged_at=ws + timedelta(days=1))
    add_time_entry(db, wi, B.id, 5, logged_at=transfer_at + timedelta(hours=2))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)

    assert cap_A["this_week_in_progress_hours"] == 3  # logged only
    assert cap_B["this_week_in_progress_hours"] == 12  # 5 logged + 7 remaining


def test_unassigned_after_logging_keeps_logged_hours(db):
    """A logs 4h then the ticket is unassigned (assignee_id NULL). A still sees
    their 4h this week; no one claims the remaining (no current holder)."""
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    ws, _ = _wb()
    unassign_at = ws + timedelta(days=2)
    wi = create_work_item(
        db,
        p.id,
        None,  # unassigned now
        status="in_progress",
        estimated_hours=10,
        logged_hours=4,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=unassign_at)
    add_time_entry(db, wi, A.id, 4, logged_at=ws + timedelta(days=1))

    cap_A = get_capacity(db, A)
    assert cap_A["this_week_in_progress_hours"] == 4  # logged retained, no remaining


def test_three_way_transfer_no_logs_at_intermediate_holder(db):
    """A (0h) -> B (0h) -> C, C logs 2h. Only C (current holder) is credited
    (its 2h + remaining); A and B held briefly with no logs and are filtered out."""
    p = create_project(db)
    A = create_developer(db, "A", "a@t.com")
    B = create_developer(db, "B", "b@t.com")
    C = create_developer(db, "C", "c@t.com")
    ws, _ = _wb()
    t1 = ws + timedelta(days=1)
    t2 = ws + timedelta(days=2)
    wi = create_work_item(
        db,
        p.id,
        C.id,  # current holder
        status="in_progress",
        estimated_hours=10,
        logged_hours=2,
        started_at=ws,
        last_assigned_at=t2,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=t1)
    add_assignment_span(db, wi.id, B.id, assigned_at=t1, unassigned_at=t2)
    add_assignment_span(db, wi.id, C.id, assigned_at=t2)
    add_time_entry(db, wi, C.id, 2, logged_at=t2 + timedelta(hours=1))

    cap_A = get_capacity(db, A)
    cap_B = get_capacity(db, B)
    cap_C = get_capacity(db, C)

    assert cap_A["this_week_capacity_used"] == 0  # held briefly, no logs -> filtered
    assert cap_B["this_week_capacity_used"] == 0
    assert cap_C["this_week_in_progress_hours"] == 10  # 2 logged + 8 remaining
