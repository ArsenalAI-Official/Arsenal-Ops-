"""Seed demo data for manually testing the week-calendar hour-logging UI.

Creates two demo projects (SendBuild, Symphony — mirroring the billable-class
examples) with a spread of work items: varying estimated hours, multiple
assignees, mixed statuses, a ticket set up for the reassignment scenario, and a
few already-placed calendar blocks for the dev-login user so the grid isn't
empty on first load.

Run from the backend/ directory:

    python scripts/seed_calendar_demo.py            # create (skip if present)
    python scripts/seed_calendar_demo.py --reset    # wipe demo projects + recreate

Idempotent: keyed on the demo project prefixes (SB, SYM). A second plain run is
a no-op; --reset deletes the demo projects (cascading to their work items and
time entries) and rebuilds from scratch. Only ever touches the demo projects and
the seeded demo developers — never your real data.

The logged-in dev-login user (dev@local) is the primary assignee so its tickets
populate the calendar palette. Re-run after `DEV_AUTH_BYPASS=1` has created the
dev@local user (log in once), or let this script create it.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import DATABASE_URL, SessionLocal  # noqa: E402
from models.developer import Developer  # noqa: E402
from models.project import Project  # noqa: E402
from models.time_entry import TimeEntry  # noqa: E402
from models.user import User  # noqa: E402
from models.work_item import WorkItem  # noqa: E402
from routers.auth import get_password_hash  # noqa: E402
from services.assignment_history_service import record_assignment_change  # noqa: E402

DEMO_PREFIXES = ["SB", "SYM"]

# (name, email) for the demo developers. dev@local is the dev-login user so its
# assigned tickets show up in the calendar palette when you log in via Dev login.
DEMO_PEOPLE = [
    ("Dev Local", "dev@local"),
    ("Dana Lopez", "dana@arsenalai.com"),
    ("Sam Rivera", "sam@arsenalai.com"),
]


def _ensure_people(db) -> dict[str, Developer]:
    """Create a User + Developer for each demo person if absent. Returns
    {email: Developer}."""
    devs: dict[str, Developer] = {}
    for name, email in DEMO_PEOPLE:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            db.add(
                User(
                    email=email,
                    name=name,
                    hashed_password=get_password_hash("demo-password"),
                    role="admin" if email == "dev@local" else "developer",
                )
            )
        dev = db.query(Developer).filter(Developer.email == email).first()
        if not dev:
            dev = Developer(name=name, email=email)
            db.add(dev)
        devs[email] = dev
    db.flush()
    return devs


def _grant_admin_role(db, user: User) -> None:
    """Give dev@local the canonical admin Role + capabilities so the demo can
    exercise capability-gated actions (status flip, create ticket, admin
    employee picker). Production seed_rbac() backfills this from the legacy
    `role` column, but it's Postgres-only and dev@local is created lazily on
    dev-login, so a local SQLite dev never gets it. Engine-agnostic + idempotent;
    mirrors tests/conftest.assign_system_role."""
    from database import SYSTEM_ROLES
    from models.role import Role, RoleCapability

    spec = next((s for s in SYSTEM_ROLES if s[0] == user.role), None)
    if spec is None:
        return
    name, desc, caps = spec
    role = db.query(Role).filter(Role.name == name).first()
    if role is None:
        role = Role(name=name, description=desc, is_system=True)
        db.add(role)
        db.flush()
        for cap in caps:
            db.add(RoleCapability(role_id=role.id, capability_key=cap))
        db.flush()
    if role not in user.roles:
        user.roles.append(role)


def _delete_demo_projects(db) -> int:
    """Delete demo projects; cascades remove their work items + time entries."""
    projects = db.query(Project).filter(Project.key_prefix.in_(DEMO_PREFIXES)).all()
    for p in projects:
        db.delete(p)
    db.flush()
    return len(projects)


def seed(reset: bool = False) -> None:
    # Safety guard: this writes demo projects AND grants dev@local a full-admin
    # account (well-known password). Refuse to run against a non-SQLite DB unless
    # explicitly opted in, so it can never pollute a shared/staging/prod database.
    if not (DATABASE_URL or "").startswith("sqlite") and os.getenv("SEED_DEMO") != "1":
        raise SystemExit(
            "[seed] Refusing to run against a non-SQLite database. This script seeds "
            "demo data and a full-admin dev@local user. Set SEED_DEMO=1 to override."
        )

    db = SessionLocal()
    try:
        if reset:
            n = _delete_demo_projects(db)
            print(f"[seed] --reset: removed {n} existing demo project(s).")
        elif db.query(Project).filter(Project.key_prefix.in_(DEMO_PREFIXES)).first():
            print("[seed] Demo projects already present. Use --reset to rebuild.")
            return

        devs = _ensure_people(db)
        dev_local = devs["dev@local"]
        # Make dev@local a full admin so the demo can exercise capability-gated
        # actions (status flip, create ticket, admin employee picker).
        dev_local_user = db.query(User).filter(User.email == "dev@local").first()
        if dev_local_user:
            _grant_admin_role(db, dev_local_user)
        dana = devs["dana@arsenalai.com"]
        sam = devs["sam@arsenalai.com"]

        # Single week anchor for the whole fixture: local Monday (the server runs
        # in the dev's tz, the grid is local), converted to the naive-UTC the
        # columns store. Used for both the placed blocks and the reassignment
        # entry so the demo story can't split across two weeks near a boundary.
        local_monday = (
            datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)
        )
        local_monday -= timedelta(days=local_monday.weekday())

        def _utc(hours_from_monday: float) -> datetime:
            return (
                (local_monday + timedelta(hours=hours_from_monday))
                .astimezone(UTC)
                .replace(tzinfo=None)
            )

        # (prefix, name): the two demo projects.
        projects = {}
        for prefix, name in [("SB", "SendBuild"), ("SYM", "Symphony")]:
            p = Project(name=name, key_prefix=prefix, description=f"{name} demo project")
            db.add(p)
            db.flush()
            projects[prefix] = p

        # Spread of work items: (prefix, type, title, status, est, assignee).
        rows = [
            ("SB", "task", "Streaming token middleware perf", "in_progress", 16, dev_local),
            ("SB", "bug", "Fix UTC date parse on due dates", "in_progress", 5, dev_local),
            ("SB", "user_story", "Calendar drag-drop snapping", "todo", 14, dev_local),
            ("SB", "task", "Generated API types drift CI job", "in_review", 10, dana),
            ("SB", "user_story", "Weekly report category filter", "done", 8, sam),
            ("SB", "task", "Backfill developer rows", "backlog", 4, None),
            ("SYM", "user_story", "Kanban keyboard a11y pass", "todo", 12, dev_local),
            ("SYM", "bug", "Optimistic mutation rollback bug", "in_review", 6, dev_local),
            ("SYM", "task", "Sprint burndown caching", "in_progress", 9, sam),
            ("SYM", "task", "Role matrix export", "todo", 7, dana),
        ]
        created: list[WorkItem] = []
        counters = {"SB": 0, "SYM": 0}
        for prefix, wtype, title, status, est, assignee in rows:
            counters[prefix] += 1
            wi = WorkItem(
                project_id=projects[prefix].id,
                type=wtype,
                key=f"{prefix}-{counters[prefix]}",
                title=title,
                status=status,
                priority="medium",
                estimated_hours=est,
                remaining_hours=est,
                logged_hours=0,
                assignee_id=assignee.id if assignee else None,
                last_assigned_at=datetime.utcnow() if assignee else None,
            )
            db.add(wi)
            created.append(wi)
        db.flush()

        # Reassignment fixture: 15h ticket originally Dana's, who logged 5h, then
        # transferred to dev@local. Dana keeps her 5h; dev@local sees 10h
        # remaining. Exercises the transfer-aware capacity path in the UI.
        counters["SYM"] += 1
        xfer = WorkItem(
            project_id=projects["SYM"].id,
            type="task",
            key=f"SYM-{counters['SYM']}",
            title="Migrate auth to RBAC (reassigned mid-flight)",
            status="in_progress",
            priority="high",
            estimated_hours=15,
            remaining_hours=10,
            logged_hours=5,
            assignee_id=dev_local.id,
            last_assigned_at=datetime.utcnow(),
        )
        db.add(xfer)
        db.flush()
        # Dana's 5h logged before the transfer (this week so it shows in capacity).
        db.add(
            TimeEntry(
                work_item_id=xfer.id,
                developer_id=dana.id,
                hours=5,
                description="Initial RBAC spike",
                logged_at=_utc(24 + 10),  # Tue 10:00 local, this week
            )
        )
        # Assignment history: Dana held it (from before this week), then dev@local.
        record_assignment_change(db, xfer.id, dana.id, at=_utc(-48))
        record_assignment_change(db, xfer.id, dev_local.id, at=_utc(24 + 14))

        # A few already-placed calendar blocks for dev@local this week so the grid
        # isn't empty (same local week anchor as above). Non-overlapping.
        sb1 = created[0]  # SB-1, dev_local
        sym_story = created[6]  # SYM-1, dev_local
        placed = [
            (sb1, _utc(9), _utc(11)),  # Mon 9-11 local
            (sym_story, _utc(24 + 13), _utc(24 + 15)),  # Tue 13-15 local
            (sb1, _utc(48 + 10), _utc(48 + 12)),  # Wed 10-12 local
        ]
        for wi, start, end in placed:
            hours = round((end - start).total_seconds() / 3600.0, 2)
            db.add(
                TimeEntry(
                    work_item_id=wi.id,
                    developer_id=dev_local.id,
                    hours=hours,
                    description="Demo block",
                    start_time=start,
                    end_time=end,
                    logged_at=start,
                )
            )

        # An unplaced entry (ticket-logged, not yet on the grid) so the "to place"
        # tray is populated for the two-way-sync demo.
        db.add(
            TimeEntry(
                work_item_id=created[1].id,  # SB-2, dev_local
                developer_id=dev_local.id,
                hours=2,
                description="Logged from ticket, awaiting placement",
                logged_at=datetime.utcnow(),
            )
        )
        db.flush()

        # Recompute logged/remaining for every touched ticket from the live sum.
        from sqlalchemy import func

        for wi in [*created, xfer]:
            total = (
                db.query(func.coalesce(func.sum(TimeEntry.hours), 0))
                .filter(TimeEntry.work_item_id == wi.id)
                .scalar()
            ) or 0
            wi.logged_hours = total
            wi.remaining_hours = max(0, (wi.estimated_hours or 0) - total)

        db.commit()
        print(
            f"[seed] Created 2 projects, {len(created) + 1} work items, "
            f"placed 3 calendar blocks + 1 unplaced entry, and 1 reassignment fixture."
        )
        print("[seed] Log in via Dev login (dev@local) to see them in the calendar palette.")
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed week-calendar demo data.")
    parser.add_argument("--reset", action="store_true", help="Wipe demo projects and recreate.")
    args = parser.parse_args()
    seed(reset=args.reset)
