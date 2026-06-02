"""
End-to-end integration tests for the three capacity endpoints that surface
across the app:

  • Admin Employees tab → /api/admin/developers/capacity
        (routers/admin.py :: get_developers_capacity)
  • PM tab               → /api/workitems/projects/{id}/hours-analytics
        (routers/workitems.py :: get_hours_analytics)
  • Home page card       → /api/developers/me/capacity
        (routers/developers.py :: get_my_capacity)

Goal: assert these three views never drift from each other. They all use the
same `compute_capacity_breakdown` under the hood, but each wraps the result
differently (admin = cross-project, PM = project-scoped, /me = single dev),
and each has historically had subtle attribution bugs.

The math itself is covered by `test_capacity_transfers.py` (32 tests on
`compute_capacity_breakdown`). This file is the integration layer: it calls
the endpoint functions directly with a real SQLite session and a mocked
`current_user`, so any drift in wrappers/joins/filters is caught.

Run:
    cd backend && /opt/anaconda3/bin/python -m pytest test_capacity_endpoints.py -v
"""

import os
import sys
from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(__file__))

# Side-effect import: models/__init__.py registers every model class with
# Base.metadata so create_all() works. Using a package-level import keeps the
# module names out of this file's scope so helper params like `project`,
# `developer`, `work_item` don't shadow them.
import models  # noqa: F401, E402
from database import Base  # noqa: E402

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
    from services.capacity_service import week_boundaries

    return week_boundaries()


def _last_week_dt():
    ws, _ = _wb()
    return ws - timedelta(days=3)


def make_project(db, name="Test Project", key_prefix="P"):
    from models.project import Project

    p = Project(name=name, description="t", status="active", key_prefix=key_prefix)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def make_developer(db, name, email):
    from models.developer import Developer

    d = Developer(name=name, email=email)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d


def make_user(db, name, email, role="developer"):
    """Mocked current_user — bypasses capability/role checks for endpoint tests.

    The endpoint functions don't query the User table; they only read
    `current_user.email` and call `has_capability(...)`. So a SimpleNamespace
    is enough and avoids dragging in the role/capability tables.
    """
    return SimpleNamespace(
        email=email,
        name=name,
        has_capability=lambda _key: True,
    )


def assign_to_project(db, project, developer, role="developer"):
    from models.developer import project_developers

    db.execute(
        project_developers.insert().values(
            project_id=project.id, developer_id=developer.id, role=role
        )
    )
    db.commit()
    db.refresh(project)
    db.refresh(developer)


_wi_counter = {"n": 0}


def make_work_item(db, project_id, assignee_id, **kwargs):
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


def add_time_entry(db, work_item, developer_id, hours, logged_at):
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


# --------------- Endpoint callers ---------------
def call_admin_capacity(db):
    from routers.admin import get_developers_capacity

    return get_developers_capacity(db=db)


def call_pm_hours(db, project_id, current_user):
    from routers.workitems import get_hours_analytics

    return get_hours_analytics(project_id=project_id, db=db, current_user=current_user)


def call_me_capacity(db, current_user):
    from routers.developers import get_my_capacity

    return get_my_capacity(db=db, current_user=current_user)


def _dev_row(admin_resp, dev_id):
    rows = [r for r in admin_resp if r["developer_id"] == dev_id]
    assert rows, f"developer_id {dev_id} not in admin response"
    return rows[0]


def _pm_dev_row(pm_resp, dev_id):
    rows = [r for r in pm_resp["developer_hours"] if r["developer_id"] == dev_id]
    assert rows, f"developer_id {dev_id} not in PM response"
    return rows[0]


# ============================================================
# Section 1 — Cross-endpoint CONSISTENCY for solo dev / one project
# All three endpoints should return identical capacity numbers.
# ============================================================


def test_section1_fresh_in_progress_consistent_across_endpoints(db):
    """Fresh in-progress ticket, single dev, single project — Admin/PM/Me agree."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    wi = make_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=0,
        started_at=ws + timedelta(hours=1),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws + timedelta(hours=1))

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me = call_me_capacity(db, user_a)

    admin_row = _dev_row(admin, dev.id)
    pm_row = _pm_dev_row(pm, dev.id)

    for view_label, row in [("admin", admin_row), ("pm", pm_row), ("me", me)]:
        assert row["this_week_in_progress_hours"] == 10, view_label
        assert row["this_week_capacity_used"] == 10, view_label
        assert row["this_week_remaining_capacity"] == 30, view_label


def test_section1_partial_log_consistent(db):
    """Partial log this week, current holder — same numbers in all 3 views."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    wi = make_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=4,
        started_at=ws + timedelta(hours=1),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws + timedelta(hours=1))
    add_time_entry(db, wi, dev.id, 4, logged_at=ws + timedelta(days=1))

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me = call_me_capacity(db, user_a)

    for label, row in [
        ("admin", _dev_row(admin, dev.id)),
        ("pm", _pm_dev_row(pm, dev.id)),
        ("me", me),
    ]:
        # logged_this_week (4) + remaining (6) = 10
        assert row["this_week_in_progress_hours"] == 10, label
        assert row["this_week_capacity_used"] == 10, label


def test_section1_carryover_remaining_only(db):
    """Carry-over from last week, no log this week — all 3 views show remaining only."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    lw = _last_week_dt()
    wi = make_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=3,
        started_at=lw,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw)
    add_time_entry(db, wi, dev.id, 3, logged_at=lw + timedelta(hours=2))

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me = call_me_capacity(db, user_a)

    for label, row in [
        ("admin", _dev_row(admin, dev.id)),
        ("pm", _pm_dev_row(pm, dev.id)),
        ("me", me),
    ]:
        # remaining only: 10 - 3 = 7
        assert row["this_week_in_progress_hours"] == 7, label


# ============================================================
# Section 2 — Transfer scenarios stay consistent across endpoints
# ============================================================


def test_section2_transfer_logged_hours_persist_for_previous_owner(db):
    """A logs 1h, transfers to B. Across all endpoints A shows 1h, B shows 4h."""
    p = make_project(db)
    A = make_developer(db, "A", "a@t.com")
    B = make_developer(db, "B", "b@t.com")
    make_user(db, "A", "a@t.com")
    make_user(db, "B", "b@t.com")
    assign_to_project(db, p, A)
    assign_to_project(db, p, B)
    ws, _ = _wb()
    transfer_at = ws + timedelta(days=2)
    wi = make_work_item(
        db,
        p.id,
        B.id,  # B is currently assigned
        status="in_progress",
        estimated_hours=5,
        logged_hours=1,
        started_at=ws,
        last_assigned_at=transfer_at,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=transfer_at)
    add_assignment_span(db, wi.id, B.id, assigned_at=transfer_at)
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(days=1))

    user_a = make_user(db, "A", "a@t.com")
    user_b = make_user(db, "B", "b@t.com")

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me_a = call_me_capacity(db, user_a)
    me_b = call_me_capacity(db, user_b)

    # A — 1h logged before transfer, no remaining
    assert _dev_row(admin, A.id)["this_week_in_progress_hours"] == 1
    assert _pm_dev_row(pm, A.id)["this_week_in_progress_hours"] == 1
    assert me_a["this_week_in_progress_hours"] == 1

    # B — current holder, gets remaining (4h)
    assert _dev_row(admin, B.id)["this_week_in_progress_hours"] == 4
    assert _pm_dev_row(pm, B.id)["this_week_in_progress_hours"] == 4
    assert me_b["this_week_in_progress_hours"] == 4


def test_section2_bouncing_a_b_a(db):
    """A → B → A in one week. All 3 views must agree on attribution."""
    p = make_project(db)
    A = make_developer(db, "A", "a@t.com")
    B = make_developer(db, "B", "b@t.com")
    make_user(db, "A", "a@t.com")
    assign_to_project(db, p, A)
    assign_to_project(db, p, B)
    ws, _ = _wb()
    t1 = ws + timedelta(days=1, hours=12)
    t2 = ws + timedelta(days=3)
    wi = make_work_item(
        db,
        p.id,
        A.id,  # A holds it now
        status="in_progress",
        estimated_hours=5,
        logged_hours=4,
        started_at=ws,
        last_assigned_at=t2,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=t1)
    add_assignment_span(db, wi.id, B.id, assigned_at=t1, unassigned_at=t2)
    add_assignment_span(db, wi.id, A.id, assigned_at=t2)
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(hours=2))
    add_time_entry(db, wi, B.id, 2, logged_at=ws + timedelta(days=2))
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(days=3, hours=2))

    user_a = make_user(db, "A", "a@t.com")
    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me_a = call_me_capacity(db, user_a)

    # A: 2 logged this week + remaining (1) = 3
    assert _dev_row(admin, A.id)["this_week_in_progress_hours"] == 3
    assert _pm_dev_row(pm, A.id)["this_week_in_progress_hours"] == 3
    assert me_a["this_week_in_progress_hours"] == 3

    # B: 2 logged, not current
    assert _dev_row(admin, B.id)["this_week_in_progress_hours"] == 2
    assert _pm_dev_row(pm, B.id)["this_week_in_progress_hours"] == 2


def test_section2_done_carryover_only_this_weeks_logs(db):
    """Ticket carried over from last week and completed this week: only this
    week's logs count, in ALL three views."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    lw = _last_week_dt()
    wi = make_work_item(
        db,
        p.id,
        dev.id,
        status="done",
        estimated_hours=8,
        logged_hours=8,
        started_at=lw,
        completed_at=ws + timedelta(days=2),
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw)
    add_time_entry(db, wi, dev.id, 3, logged_at=lw + timedelta(hours=4))
    add_time_entry(db, wi, dev.id, 5, logged_at=ws + timedelta(days=1))

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me = call_me_capacity(db, user_a)

    for label, row in [
        ("admin", _dev_row(admin, dev.id)),
        ("pm", _pm_dev_row(pm, dev.id)),
        ("me", me),
    ]:
        assert row["this_week_done_hours"] == 5, label
        assert row["this_week_capacity_used"] == 5, label


# ============================================================
# Section 3 — PM tab is PROJECT-SCOPED, Admin is cross-project
# ============================================================


def test_section3_pm_excludes_other_project_hours(db):
    """Dev logged on two projects this week. PM for project A only counts A's hours;
    PM for project B only counts B's hours. Admin sums both into capacity."""
    pA = make_project(db, name="Alpha", key_prefix="A")
    pB = make_project(db, name="Beta", key_prefix="B")
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    assign_to_project(db, pA, dev)
    assign_to_project(db, pB, dev)
    ws, _ = _wb()

    wiA = make_work_item(
        db,
        pA.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=4,
        started_at=ws,
    )
    add_assignment_span(db, wiA.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiA, dev.id, 4, logged_at=ws + timedelta(days=1))

    wiB = make_work_item(
        db,
        pB.id,
        dev.id,
        status="in_progress",
        estimated_hours=8,
        logged_hours=2,
        started_at=ws,
    )
    add_assignment_span(db, wiB.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiB, dev.id, 2, logged_at=ws + timedelta(days=1))

    pm_A = call_pm_hours(db, pA.id, user_d)
    pm_B = call_pm_hours(db, pB.id, user_d)

    # PM for A: current_week_logged should be 4 (only A's hours)
    assert _pm_dev_row(pm_A, dev.id)["current_week_logged"] == 4
    # PM for B: current_week_logged should be 2
    assert _pm_dev_row(pm_B, dev.id)["current_week_logged"] == 2

    # Admin: capacity sums both projects: 10h (A) + 8h (B) = 18h
    admin = call_admin_capacity(db)
    assert _dev_row(admin, dev.id)["this_week_capacity_used"] == 18

    # /me sees the cross-project total
    me = call_me_capacity(db, user_d)
    assert me["this_week_capacity_used"] == 18


def test_section3_pm_capacity_does_not_leak_from_other_projects(db):
    """The PM tab capacity must not double-count hours logged on other projects
    (this was the cross-project leakage bug in compute_capacity_breakdown)."""
    pA = make_project(db, name="Alpha", key_prefix="A")
    pB = make_project(db, name="Beta", key_prefix="B")
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    assign_to_project(db, pA, dev)
    assign_to_project(db, pB, dev)
    ws, _ = _wb()

    wiA = make_work_item(
        db,
        pA.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=4,
        started_at=ws,
    )
    add_assignment_span(db, wiA.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiA, dev.id, 4, logged_at=ws + timedelta(days=1))

    wiB = make_work_item(
        db,
        pB.id,
        dev.id,
        status="in_progress",
        estimated_hours=8,
        logged_hours=2,
        started_at=ws,
    )
    add_assignment_span(db, wiB.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiB, dev.id, 2, logged_at=ws + timedelta(days=1))

    pm_A = call_pm_hours(db, pA.id, user_d)
    pm_B = call_pm_hours(db, pB.id, user_d)

    # PM tab for A — capacity is only A's portion (10h, includes remaining)
    row_A = _pm_dev_row(pm_A, dev.id)
    assert row_A["this_week_capacity_used"] == 10
    # Tickets listed should be ONLY from project A
    ticket_pids = {t["project_id"] for t in (row_A.get("this_week_tickets") or [])}
    assert ticket_pids.issubset({pA.id}), f"PM A leaked tickets from other projects: {ticket_pids}"

    # PM tab for B — capacity is only B's portion (8h)
    row_B = _pm_dev_row(pm_B, dev.id)
    assert row_B["this_week_capacity_used"] == 8
    ticket_pids_b = {t["project_id"] for t in (row_B.get("this_week_tickets") or [])}
    assert ticket_pids_b.issubset({pB.id})


# ============================================================
# Section 4 — Weekly logged history shape per endpoint
# ============================================================


def test_section4_admin_weekly_history_includes_project_split(db):
    """Admin's weekly_logged_history must be sorted desc with per-project split,
    aggregated across ALL projects."""
    pA = make_project(db, name="Alpha", key_prefix="A")
    pB = make_project(db, name="Beta", key_prefix="B")
    dev = make_developer(db, "D", "d@t.com")
    assign_to_project(db, pA, dev)
    assign_to_project(db, pB, dev)
    ws, _ = _wb()
    lw = _last_week_dt()

    wiA = make_work_item(
        db, pA.id, dev.id, status="in_progress", estimated_hours=20, logged_hours=8
    )
    add_assignment_span(db, wiA.id, dev.id, assigned_at=lw)
    add_time_entry(db, wiA, dev.id, 3, logged_at=lw + timedelta(hours=4))  # last wk
    add_time_entry(db, wiA, dev.id, 5, logged_at=ws + timedelta(days=1))  # this wk

    wiB = make_work_item(
        db, pB.id, dev.id, status="in_progress", estimated_hours=10, logged_hours=2
    )
    add_assignment_span(db, wiB.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiB, dev.id, 2, logged_at=ws + timedelta(days=2))

    admin = call_admin_capacity(db)
    row = _dev_row(admin, dev.id)
    history = row["weekly_logged_history"]

    assert isinstance(history, list)
    assert len(history) == 2, "expected one entry per week with logged hours"

    # newest week first
    assert history[0]["week_start"] > history[1]["week_start"]

    # this-week entry: 5 (A) + 2 (B) = 7
    this_week = history[0]
    assert this_week["hours"] == 7
    proj_breakdown = {p["project_name"]: p["hours"] for p in this_week["projects"]}
    assert proj_breakdown == {"Alpha": 5, "Beta": 2}

    # last-week entry: 3 (A only)
    last_week = history[1]
    assert last_week["hours"] == 3
    assert {p["project_name"]: p["hours"] for p in last_week["projects"]} == {"Alpha": 3}


def test_section4_pm_weekly_history_is_project_scoped(db):
    """PM tab's weekly_logged_history must only contain hours from THIS project."""
    pA = make_project(db, name="Alpha", key_prefix="A")
    pB = make_project(db, name="Beta", key_prefix="B")
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    assign_to_project(db, pA, dev)
    assign_to_project(db, pB, dev)
    ws, _ = _wb()

    wiA = make_work_item(db, pA.id, dev.id, status="in_progress", estimated_hours=10)
    add_assignment_span(db, wiA.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiA, dev.id, 4, logged_at=ws + timedelta(days=1))

    wiB = make_work_item(db, pB.id, dev.id, status="in_progress", estimated_hours=10)
    add_assignment_span(db, wiB.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiB, dev.id, 6, logged_at=ws + timedelta(days=1))

    pm_A = call_pm_hours(db, pA.id, user_d)
    row_A = _pm_dev_row(pm_A, dev.id)
    hist = row_A["weekly_logged_history"]
    assert len(hist) == 1
    # PM for A should report only the 4h from project A, not the 6h from B
    assert hist[0]["hours"] == 4

    pm_B = call_pm_hours(db, pB.id, user_d)
    row_B = _pm_dev_row(pm_B, dev.id)
    assert row_B["weekly_logged_history"][0]["hours"] == 6


def test_section4_weekly_history_empty_when_no_logs(db):
    """Dev with no time entries: weekly_logged_history is an empty list, capacity zero."""
    p = make_project(db)
    dev = make_developer(db, "Z", "z@t.com")
    user_z = make_user(db, "Z", "z@t.com")
    assign_to_project(db, p, dev)

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_z)
    me = call_me_capacity(db, user_z)

    assert _dev_row(admin, dev.id)["weekly_logged_history"] == []
    assert _pm_dev_row(pm, dev.id)["weekly_logged_history"] == []
    assert me["this_week_capacity_used"] == 0


# ============================================================
# Section 5 — Edge cases
# ============================================================


def test_section5_null_developer_id_time_entry_is_ignored(db):
    """Post Option A fix: TimeEntry rows with developer_id IS NULL must be
    ignored by all three endpoints (not silently attributed to the current
    assignee). This was the source of the PM-vs-Admin mismatch."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    wi = make_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=10,
        logged_hours=3,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=ws)
    # Legacy entry with NULL developer_id
    add_time_entry(db, wi, None, 3, logged_at=ws + timedelta(days=1))

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me = call_me_capacity(db, user_a)

    for label, row in [
        ("admin", _dev_row(admin, dev.id)),
        ("pm", _pm_dev_row(pm, dev.id)),
        ("me", me),
    ]:
        # logged_this_week should be 0 (NULL entry ignored), counted = remaining = 7
        assert row["this_week_in_progress_hours"] == 7, label


def test_section5_cancelled_tickets_excluded_everywhere(db):
    """Cancelled tickets should not appear in any capacity view, even with logged hours."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    wi = make_work_item(
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

    admin = call_admin_capacity(db)
    pm = call_pm_hours(db, p.id, user_a)
    me = call_me_capacity(db, user_a)

    for label, row in [
        ("admin", _dev_row(admin, dev.id)),
        ("pm", _pm_dev_row(pm, dev.id)),
        ("me", me),
    ]:
        assert row["this_week_capacity_used"] == 0, label


def test_section5_me_endpoint_404_for_non_developer_user(db):
    """No Developer record matches the email → /me returns 404."""
    from fastapi import HTTPException

    admin_user = make_user(db, "Admin", "admin-no-dev@t.com", role="admin")
    with pytest.raises(HTTPException) as exc:
        call_me_capacity(db, admin_user)
    assert exc.value.status_code == 404


def test_section5_pm_includes_dev_with_logs_but_no_assignments(db):
    """A dev who has time entries on a project but no current assignment must
    still appear in the PM tab (transferred-away contributor case)."""
    p = make_project(db)
    A = make_developer(db, "A", "a@t.com")
    B = make_developer(db, "B", "b@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, B)
    # A is intentionally NOT assigned to the project — only has historical logs
    ws, _ = _wb()
    wi = make_work_item(
        db,
        p.id,
        B.id,
        status="in_progress",
        estimated_hours=5,
        logged_hours=1,
        started_at=ws,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=ws, unassigned_at=ws + timedelta(days=1))
    add_assignment_span(db, wi.id, B.id, assigned_at=ws + timedelta(days=1))
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(hours=4))

    pm = call_pm_hours(db, p.id, user_a)
    # A should appear with 1h logged, B with remaining 4h
    a_row = _pm_dev_row(pm, A.id)
    assert a_row["this_week_in_progress_hours"] == 1


def test_section5_admin_returns_all_developers(db):
    """Admin endpoint must return one row per developer, including devs with no
    work items or time entries (so the team list is exhaustive)."""
    make_developer(db, "A", "a@t.com")
    make_developer(db, "B", "b@t.com")
    make_developer(db, "C", "c@t.com")

    admin = call_admin_capacity(db)
    emails = {r["developer_email"] for r in admin}
    assert emails == {"a@t.com", "b@t.com", "c@t.com"}


# ============================================================
# Section 6 — Response shape contracts
# ============================================================


def test_section6_admin_response_shape(db):
    """Admin response: each dev row carries the contract the frontend expects."""
    dev = make_developer(db, "A", "a@t.com")
    admin = call_admin_capacity(db)
    row = _dev_row(admin, dev.id)
    required = {
        "developer_id",
        "developer_name",
        "developer_email",
        "avatar_url",
        "project_count",
        "this_week_in_progress_hours",
        "this_week_in_review_hours",
        "this_week_done_hours",
        "this_week_capacity_used",
        "this_week_remaining_capacity",
        "tickets",
        "weekly_logged_history",
        "week_start",
        "week_end",
        "specialization",
    }
    missing = required - set(row.keys())
    assert not missing, f"admin row missing keys: {missing}"


def test_section6_pm_response_shape(db):
    """PM response: each dev row + the top-level shape carry the expected keys."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    pm = call_pm_hours(db, p.id, user_a)
    assert "developer_hours" in pm
    if pm["developer_hours"]:
        row = pm["developer_hours"][0]
        required = {
            "developer_id",
            "developer_name",
            "developer_email",
            "role",
            "allocated_hours",
            "logged_hours",
            "remaining_hours",
            "current_week_logged",
            "weekly_logged_history",
            "total_items",
            "completed_items",
            "this_week_capacity_used",
            "this_week_remaining_capacity",
        }
        missing = required - set(row.keys())
        assert not missing, f"PM row missing keys: {missing}"


def test_section6_me_response_shape(db):
    """/me response carries the keys the home-page MyCapacityCard reads."""
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    me = call_me_capacity(db, user_a)
    required = {
        "developer_id",
        "developer_name",
        "developer_email",
        "avatar_url",
        "project_count",
        "specialization",
        "week_start",
        "week_end",
        "this_week_in_progress_hours",
        "this_week_in_review_hours",
        "this_week_done_hours",
        "this_week_capacity_used",
        "this_week_remaining_capacity",
        "tickets",
    }
    missing = required - set(me.keys())
    assert not missing, f"/me missing keys: {missing}"
    assert me["developer_id"] == dev.id


def test_section6_admin_and_me_agree_on_capacity_for_solo_dev(db):
    """Sanity: for a solo dev with one ticket, Admin's row equals /me exactly on
    the numeric capacity fields."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    wi = make_work_item(
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

    admin_row = _dev_row(call_admin_capacity(db), dev.id)
    me = call_me_capacity(db, user_a)

    for key in (
        "this_week_in_progress_hours",
        "this_week_in_review_hours",
        "this_week_done_hours",
        "this_week_capacity_used",
        "this_week_remaining_capacity",
    ):
        assert admin_row[key] == me[key], f"mismatch on {key}: admin={admin_row[key]} me={me[key]}"


# ============================================================
# Section 7 — Aggregate invariant across endpoints
# ============================================================


def test_section7_total_attributed_equals_real_work_done(db):
    """Whatever the transfer pattern, the sum of attributed in-progress hours
    across all contributors should equal the start-of-week remaining for the
    ticket (no hours invented, none lost) — verified through the admin endpoint."""
    p = make_project(db)
    A = make_developer(db, "A", "a@t.com")
    B = make_developer(db, "B", "b@t.com")
    C = make_developer(db, "C", "c@t.com")
    assign_to_project(db, p, A)
    assign_to_project(db, p, B)
    assign_to_project(db, p, C)
    lw = _last_week_dt()
    ws, _ = _wb()
    t1 = ws + timedelta(days=1)
    t2 = ws + timedelta(days=3)
    # 10h estimated, 6h logged last week (across various owners), 4h start-of-week remaining
    wi = make_work_item(
        db,
        p.id,
        C.id,  # C holds it now
        status="in_progress",
        estimated_hours=10,
        logged_hours=9,
        started_at=lw,
        last_assigned_at=t2,
    )
    add_assignment_span(db, wi.id, A.id, assigned_at=lw, unassigned_at=t1)
    add_assignment_span(db, wi.id, B.id, assigned_at=t1, unassigned_at=t2)
    add_assignment_span(db, wi.id, C.id, assigned_at=t2)
    add_time_entry(db, wi, A.id, 6, logged_at=lw + timedelta(hours=4))  # last week
    add_time_entry(db, wi, A.id, 1, logged_at=ws + timedelta(hours=5))  # this week
    add_time_entry(db, wi, B.id, 2, logged_at=ws + timedelta(days=2))  # this week

    admin = call_admin_capacity(db)
    a_total = _dev_row(admin, A.id)["this_week_in_progress_hours"]
    b_total = _dev_row(admin, B.id)["this_week_in_progress_hours"]
    c_total = _dev_row(admin, C.id)["this_week_in_progress_hours"]

    # Invariant: A's logged this week (1) + B's logged this week (2) + C's go-forward
    # commitment (10 - 9 = 1) = 4 = start-of-week remaining.
    assert a_total + b_total + c_total == 4


def test_section7_admin_pm_agree_on_logged_hours_field(db):
    """Admin's TotalLogged-equivalent (logged_hours scoped to this project)
    must match PM's logged_hours for the same dev on the same project."""
    p = make_project(db)
    dev = make_developer(db, "A", "a@t.com")
    user_a = make_user(db, "A", "a@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    lw = _last_week_dt()
    wi = make_work_item(db, p.id, dev.id, status="in_progress", estimated_hours=10)
    add_assignment_span(db, wi.id, dev.id, assigned_at=lw)
    add_time_entry(db, wi, dev.id, 2, logged_at=lw + timedelta(hours=4))
    add_time_entry(db, wi, dev.id, 3, logged_at=ws + timedelta(days=1))

    pm = call_pm_hours(db, p.id, user_a)
    pm_row = _pm_dev_row(pm, dev.id)
    # PM "Total Logged" cell sums all entries for this dev on this project
    assert pm_row["logged_hours"] == 5

    # The full weekly_logged_history hours should also sum to 5
    history_total = sum(w["hours"] for w in pm_row["weekly_logged_history"])
    assert history_total == 5


# ============================================================
# Section 8 — Admin ↔ PM project-subset equivalence (multi-project)
#
# Stronger guarantee than section 4: for EACH project a dev is on, PM's
# weekly_logged_history must be exactly the project-P slice of Admin's
# weekly_logged_history, week-by-week, across many projects and many weeks.
# ============================================================


def test_section8_pm_weekly_history_equals_admin_project_subset(db):
    """3 projects × 3 weeks: PM[P].weekly_logged_history must equal the
    Admin row's `projects` slice for P, on every week with logged hours."""
    pA = make_project(db, name="Alpha", key_prefix="A")
    pB = make_project(db, name="Beta", key_prefix="B")
    pC = make_project(db, name="Gamma", key_prefix="C")
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    for p in (pA, pB, pC):
        assign_to_project(db, p, dev)

    ws, _ = _wb()
    lw = _last_week_dt()  # last week's Saturday + 0..6
    two_weeks_ago = lw - timedelta(days=7)

    # Alpha: hours across all 3 weeks
    wiA = make_work_item(db, pA.id, dev.id, status="in_progress", estimated_hours=30)
    add_assignment_span(db, wiA.id, dev.id, assigned_at=two_weeks_ago)
    add_time_entry(db, wiA, dev.id, 4, logged_at=two_weeks_ago + timedelta(hours=4))
    add_time_entry(db, wiA, dev.id, 3, logged_at=lw + timedelta(hours=4))
    add_time_entry(db, wiA, dev.id, 5, logged_at=ws + timedelta(days=1))

    # Beta: hours last week + this week only
    wiB = make_work_item(db, pB.id, dev.id, status="in_progress", estimated_hours=20)
    add_assignment_span(db, wiB.id, dev.id, assigned_at=lw)
    add_time_entry(db, wiB, dev.id, 2, logged_at=lw + timedelta(hours=2))
    add_time_entry(db, wiB, dev.id, 6, logged_at=ws + timedelta(days=2))

    # Gamma: hours this week only
    wiC = make_work_item(
        db,
        pC.id,
        dev.id,
        status="done",
        estimated_hours=10,
        logged_hours=1,
        completed_at=ws + timedelta(days=3),
    )
    add_assignment_span(db, wiC.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiC, dev.id, 1, logged_at=ws + timedelta(days=3))

    # Admin: extract per-project per-week hours from its weekly_logged_history.
    admin = call_admin_capacity(db)
    admin_hist = _dev_row(admin, dev.id)["weekly_logged_history"]
    # admin_per_project: {project_name: {week_start: hours}}
    admin_per_project: dict[str, dict[str, int]] = {}
    for week in admin_hist:
        for proj in week["projects"]:
            admin_per_project.setdefault(proj["project_name"], {})[week["week_start"]] = proj[
                "hours"
            ]

    # PM: for each project, the dev's weekly_logged_history must match Admin's
    # project subset week-for-week.
    for proj_name, p_obj in (("Alpha", pA), ("Beta", pB), ("Gamma", pC)):
        pm = call_pm_hours(db, p_obj.id, user_d)
        pm_hist = _pm_dev_row(pm, dev.id)["weekly_logged_history"]
        pm_by_week = {w["week_start"]: w["hours"] for w in pm_hist}
        admin_by_week = admin_per_project.get(proj_name, {})
        assert pm_by_week == admin_by_week, (
            f"PM[{proj_name}] weekly history != Admin subset for {proj_name}.\n"
            f"PM:    {pm_by_week}\n"
            f"Admin: {admin_by_week}"
        )

    # Sanity on the totals:
    #   Admin's overall total this week = 5 (Alpha) + 6 (Beta) + 1 (Gamma) = 12
    this_week_total = next(w["hours"] for w in admin_hist if w["week_start"] == ws.isoformat())
    assert this_week_total == 12


def test_section8_pm_capacity_sums_match_admin_total(db):
    """Capacity invariant across projects: for a dev on N projects, the sum of
    each project's PM-tab capacity = Admin's total capacity for that dev.

    Admin is cross-project; PM is project-scoped. Per-project values won't
    individually equal Admin's row, but they must sum to it (no hours invented,
    none lost between the two endpoints)."""
    pA = make_project(db, name="Alpha", key_prefix="A")
    pB = make_project(db, name="Beta", key_prefix="B")
    pC = make_project(db, name="Gamma", key_prefix="C")
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    for p in (pA, pB, pC):
        assign_to_project(db, p, dev)

    ws, _ = _wb()

    # Alpha: in_progress fresh, no logs → 10h capacity
    wiA = make_work_item(db, pA.id, dev.id, status="in_progress", estimated_hours=10, started_at=ws)
    add_assignment_span(db, wiA.id, dev.id, assigned_at=ws)

    # Beta: in_review, 3h logged this week + 5h remaining → 8h capacity
    wiB = make_work_item(
        db,
        pB.id,
        dev.id,
        status="in_review",
        estimated_hours=8,
        logged_hours=3,
        started_at=ws,
    )
    add_assignment_span(db, wiB.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiB, dev.id, 3, logged_at=ws + timedelta(days=1))

    # Gamma: done this week, 2h logged this week → 2h capacity (done bucket)
    wiC = make_work_item(
        db,
        pC.id,
        dev.id,
        status="done",
        estimated_hours=4,
        logged_hours=2,
        completed_at=ws + timedelta(days=2),
    )
    add_assignment_span(db, wiC.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiC, dev.id, 2, logged_at=ws + timedelta(days=2))

    admin = call_admin_capacity(db)
    admin_row = _dev_row(admin, dev.id)

    pm_caps = {}
    pm_in_progress = 0
    pm_in_review = 0
    pm_done = 0
    pm_logged_this_week = 0
    for p in (pA, pB, pC):
        pm = call_pm_hours(db, p.id, user_d)
        row = _pm_dev_row(pm, dev.id)
        pm_caps[p.name] = row["this_week_capacity_used"]
        pm_in_progress += row["this_week_in_progress_hours"]
        pm_in_review += row["this_week_in_review_hours"]
        pm_done += row["this_week_done_hours"]
        pm_logged_this_week += row["current_week_logged"]

    # Per-project capacity values
    assert pm_caps["Alpha"] == 10
    assert pm_caps["Beta"] == 8
    assert pm_caps["Gamma"] == 2

    # Sum of PM-per-project = Admin (capacity invariant)
    assert sum(pm_caps.values()) == admin_row["this_week_capacity_used"] == 20
    assert pm_in_progress == admin_row["this_week_in_progress_hours"] == 10
    assert pm_in_review == admin_row["this_week_in_review_hours"] == 8
    assert pm_done == admin_row["this_week_done_hours"] == 2

    # Logged hours invariant: sum of PM's project-scoped current_week_logged
    # = total logged this week across all projects. Admin doesn't expose the
    # current-week-only scalar directly, but its weekly_logged_history first
    # entry (this week) must match.
    this_week_admin = next(
        (
            w["hours"]
            for w in admin_row["weekly_logged_history"]
            if w["week_start"] == ws.isoformat()
        ),
        0,
    )
    assert pm_logged_this_week == this_week_admin == 5  # 0 + 3 + 2


def test_section8_pm_weekly_history_no_cross_project_leak(db):
    """Negative test: hours logged on project A this week must NOT appear in
    PM[B]'s weekly_logged_history."""
    pA = make_project(db, name="Alpha", key_prefix="A")
    pB = make_project(db, name="Beta", key_prefix="B")
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    assign_to_project(db, pA, dev)
    assign_to_project(db, pB, dev)
    ws, _ = _wb()

    # Only Alpha gets logged hours
    wiA = make_work_item(db, pA.id, dev.id, status="in_progress", estimated_hours=10)
    add_assignment_span(db, wiA.id, dev.id, assigned_at=ws)
    add_time_entry(db, wiA, dev.id, 4, logged_at=ws + timedelta(days=1))

    # Beta exists but no logs
    wiB = make_work_item(db, pB.id, dev.id, status="in_progress", estimated_hours=10)
    add_assignment_span(db, wiB.id, dev.id, assigned_at=ws)

    pm_B = call_pm_hours(db, pB.id, user_d)
    pm_B_hist = _pm_dev_row(pm_B, dev.id)["weekly_logged_history"]
    # Empty — Alpha's 4h must NOT leak into Beta's history
    assert pm_B_hist == []

    pm_A = call_pm_hours(db, pA.id, user_d)
    pm_A_hist = _pm_dev_row(pm_A, dev.id)["weekly_logged_history"]
    assert len(pm_A_hist) == 1
    assert pm_A_hist[0]["hours"] == 4


def test_section8_pm_and_admin_match_for_multi_week_logged_history(db):
    """Focused single-project, multi-week test:
    PM[P].weekly_logged_history MUST equal Admin's weekly_logged_history for
    that dev (since the dev only has hours on this one project).

    Covers 4 weeks: this week, last week, 2 weeks ago, 3 weeks ago.
    Same dev, same project, varying hours per week. Both endpoints must
    return identical week-by-week numbers and the same total."""
    p = make_project(db, name="Solo")
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    assign_to_project(db, p, dev)

    ws, _ = _wb()
    week_minus_1 = ws - timedelta(days=7)
    week_minus_2 = ws - timedelta(days=14)
    week_minus_3 = ws - timedelta(days=21)

    wi = make_work_item(
        db,
        p.id,
        dev.id,
        status="in_progress",
        estimated_hours=50,
        started_at=week_minus_3,
    )
    add_assignment_span(db, wi.id, dev.id, assigned_at=week_minus_3)

    # Distinct hour counts per week so any swap/dedupe bug shows up.
    add_time_entry(db, wi, dev.id, 2, logged_at=week_minus_3 + timedelta(days=1))
    add_time_entry(db, wi, dev.id, 7, logged_at=week_minus_2 + timedelta(days=2))
    add_time_entry(db, wi, dev.id, 3, logged_at=week_minus_1 + timedelta(days=3))
    add_time_entry(db, wi, dev.id, 5, logged_at=ws + timedelta(days=1))

    admin = call_admin_capacity(db)
    admin_row = _dev_row(admin, dev.id)
    admin_hist = admin_row["weekly_logged_history"]

    pm = call_pm_hours(db, p.id, user_d)
    pm_row = _pm_dev_row(pm, dev.id)
    pm_hist = pm_row["weekly_logged_history"]

    # Both must have 4 distinct weeks.
    assert len(admin_hist) == 4
    assert len(pm_hist) == 4

    # Compare week-for-week (week_start as the key).
    admin_by_week = {w["week_start"]: w["hours"] for w in admin_hist}
    pm_by_week = {w["week_start"]: w["hours"] for w in pm_hist}
    assert admin_by_week == pm_by_week, (
        f"Multi-week mismatch.\nAdmin: {admin_by_week}\nPM:    {pm_by_week}"
    )

    # Concrete expected values: 2, 7, 3, 5
    assert pm_by_week[week_minus_3.isoformat()] == 2
    assert pm_by_week[week_minus_2.isoformat()] == 7
    assert pm_by_week[week_minus_1.isoformat()] == 3
    assert pm_by_week[ws.isoformat()] == 5

    # Sort order: both should be newest first.
    for hist in (admin_hist, pm_hist):
        starts = [w["week_start"] for w in hist]
        assert starts == sorted(starts, reverse=True), f"history not sorted desc: {starts}"

    # PM "Total Logged" cell should equal the sum across all weeks.
    total = 2 + 7 + 3 + 5  # 17
    assert pm_row["logged_hours"] == total
    assert sum(w["hours"] for w in admin_hist) == total
    assert sum(w["hours"] for w in pm_hist) == total

    # PM's "Logged This Wk" cell = this week's logged hours = 5
    assert pm_row["current_week_logged"] == 5
    # Admin's this-week entry must match
    this_week_admin = next(w["hours"] for w in admin_hist if w["week_start"] == ws.isoformat())
    assert this_week_admin == 5


def test_section8_multi_week_with_zero_weeks_in_between(db):
    """Multi-week with gaps: log in week-3 and this-week only, skip 1 and 2.
    Both endpoints must return only 2 history entries (no zero-hour rows).
    """
    p = make_project(db)
    dev = make_developer(db, "D", "d@t.com")
    user_d = make_user(db, "D", "d@t.com")
    assign_to_project(db, p, dev)
    ws, _ = _wb()
    week_minus_3 = ws - timedelta(days=21)

    wi = make_work_item(db, p.id, dev.id, status="in_progress", estimated_hours=20)
    add_assignment_span(db, wi.id, dev.id, assigned_at=week_minus_3)
    add_time_entry(db, wi, dev.id, 6, logged_at=week_minus_3 + timedelta(days=1))
    add_time_entry(db, wi, dev.id, 4, logged_at=ws + timedelta(days=1))

    admin_hist = _dev_row(call_admin_capacity(db), dev.id)["weekly_logged_history"]
    pm_hist = _pm_dev_row(call_pm_hours(db, p.id, user_d), dev.id)["weekly_logged_history"]

    assert len(admin_hist) == 2
    assert len(pm_hist) == 2

    admin_by_week = {w["week_start"]: w["hours"] for w in admin_hist}
    pm_by_week = {w["week_start"]: w["hours"] for w in pm_hist}
    assert (
        admin_by_week
        == pm_by_week
        == {
            ws.isoformat(): 4,
            week_minus_3.isoformat(): 6,
        }
    )


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
