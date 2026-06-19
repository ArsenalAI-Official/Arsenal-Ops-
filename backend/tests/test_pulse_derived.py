"""Tests for the Pulse derivation endpoint.

Covers:

* Summary counts roll up correctly from work_items (delivery, bugs, criticals,
  overdue, points).
* Health-score formula at the four bucket boundaries (Healthy / At Risk /
  Critical / heavy-issue).
* Each section fails independently (monkeypatch one helper to raise; the
  response still has the other sections populated and the failed section
  defaults to its empty value).
* 403 when the caller doesn't have project access.

Calls the route handler as a plain function, passing dependencies
explicitly (same trick the rest of the test suite uses — FastAPI's
``Depends(...)`` only runs during request dispatch).
"""

import os
import sys
from datetime import datetime, timedelta
from typing import ClassVar

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import Base
from models import (  # noqa: F401
    activity_log,
    architecture,
    developer,
    market_insight,
    persona,
    personal_task,
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
)
from models.developer import Developer
from models.project import Project
from models.project_milestone import ProjectMilestone
from models.time_entry import TimeEntry
from models.user import User
from models.work_item import WorkItem
from routers import pulse as pulse_module
from routers.pulse import get_pulse_derived


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def admin_user(db):
    """A system-admin user — bypasses per-project membership checks."""
    u = User(
        id=1,
        email="admin@x.com",
        name="Admin",
        role="admin",
        is_active=True,
        is_first_login=False,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def outsider_user(db):
    """A developer user with no project membership — used for 403 tests."""
    u = User(
        id=2,
        email="outsider@x.com",
        name="Outsider",
        role="developer",
        is_active=True,
        is_first_login=False,
    )
    db.add(u)
    db.commit()
    return u


def _freeze_pulse_utcnow(monkeypatch, fake_now: datetime) -> None:
    """Pin the "now" used by every derivation helper to ``fake_now``.

    ``pulse.py`` centralizes "now" in ``_utc_now()`` (a tiny module-level
    helper introduced when we migrated off ``datetime.utcnow()``). Patching
    that single symbol is more robust than swapping the ``datetime`` class
    — it doesn't depend on subclass-method dispatch and covers every
    deriver in one shot.
    """
    monkeypatch.setattr(pulse_module, "_utc_now", lambda: fake_now)


def _make_project(db, *, created_at: datetime, end_date: datetime | None = None) -> Project:
    p = Project(
        id=1,
        name="Pulse Project",
        key_prefix="PP",
        description="d",
        status="development",
        github_repo_urls=[],
        created_at=created_at,
        end_date=end_date,
    )
    db.add(p)
    db.commit()
    return p


def _seed_mixed_items(db, project_id: int) -> dict:
    """Seed a known mix of work items and return the expected counts.

    Mix:
      * 5 stories: 2 done, 3 todo
      * 3 bugs: 1 done, 2 open
      * 2 tasks: 1 critical-open, 1 todo (one with due_date in the past)
    """
    now = datetime.utcnow()
    past = now - timedelta(days=5)
    items = [
        # stories
        WorkItem(
            id=11,
            project_id=project_id,
            type="user_story",
            title="s1",
            status="done",
            priority="medium",
            key="PP-1",
            story_points=3,
        ),
        WorkItem(
            id=12,
            project_id=project_id,
            type="user_story",
            title="s2",
            status="done",
            priority="medium",
            key="PP-2",
            story_points=5,
        ),
        WorkItem(
            id=13,
            project_id=project_id,
            type="user_story",
            title="s3",
            status="todo",
            priority="medium",
            key="PP-3",
            story_points=2,
        ),
        WorkItem(
            id=14,
            project_id=project_id,
            type="user_story",
            title="s4",
            status="todo",
            priority="medium",
            key="PP-4",
            story_points=1,
        ),
        WorkItem(
            id=15,
            project_id=project_id,
            type="user_story",
            title="s5",
            status="todo",
            priority="medium",
            key="PP-5",
            story_points=0,
            due_date=past,  # overdue
        ),
        # bugs
        WorkItem(
            id=20,
            project_id=project_id,
            type="bug",
            title="b1",
            status="done",
            priority="medium",
            key="PP-6",
        ),
        WorkItem(
            id=21,
            project_id=project_id,
            type="bug",
            title="b2",
            status="in_progress",
            priority="medium",
            key="PP-7",
        ),
        WorkItem(
            id=22,
            project_id=project_id,
            type="bug",
            title="b3",
            status="todo",
            priority="medium",
            key="PP-8",
        ),
        # tasks
        WorkItem(
            id=30,
            project_id=project_id,
            type="task",
            title="t1",
            status="in_progress",
            priority="critical",
            key="PP-9",
        ),
        WorkItem(
            id=31,
            project_id=project_id,
            type="task",
            title="t2",
            status="todo",
            priority="medium",
            key="PP-10",
        ),
    ]
    db.add_all(items)
    db.commit()

    return {
        "delivery_total": 10,
        "delivery_completed": 3,  # 2 stories + 1 bug
        "open_bugs": 2,
        "critical_open": 1,
        "overdue_count": 1,
        "points_total": 11,
        "points_completed": 8,
    }


# ---------------------------------------------------------------------------
# Summary counts / sums
# ---------------------------------------------------------------------------


class TestSummary:
    def test_counts_match_seed(self, db, admin_user):
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=60), end_date=now + timedelta(days=60)
        )
        expected = _seed_mixed_items(db, proj.id)

        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        s = result["summary"]

        assert s["deliveryTotal"] == expected["delivery_total"]
        assert s["deliveryCompleted"] == expected["delivery_completed"]
        assert s["openBugs"] == expected["open_bugs"]
        assert s["criticalOpen"] == expected["critical_open"]
        assert s["overdueCount"] == expected["overdue_count"]
        assert s["workItems"] == expected["delivery_total"]
        assert s["pointsTotal"] == expected["points_total"]
        assert s["pointsCompleted"] == expected["points_completed"]

    def test_delivery_pct_zero_when_no_items(self, db, admin_user):
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=30), end_date=now + timedelta(days=30)
        )
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        assert result["summary"]["deliveryTotal"] == 0
        assert result["summary"]["deliveryPct"] == 0

    def test_no_end_date_means_empty_months(self, db, admin_user):
        now = datetime.utcnow()
        proj = _make_project(db, created_at=now - timedelta(days=30), end_date=None)
        _seed_mixed_items(db, proj.id)
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        assert result["months"] == []
        assert result["lastActualIdx"] == 0


# ---------------------------------------------------------------------------
# Health-score buckets
# ---------------------------------------------------------------------------


class TestHealthScore:
    def test_perfect_project_is_healthy(self, db, admin_user):
        """All work done, no bugs, no overdue, on schedule → score 100."""
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=30), end_date=now + timedelta(days=30)
        )
        db.add_all(
            [
                WorkItem(
                    id=1,
                    project_id=proj.id,
                    type="task",
                    title="t",
                    status="done",
                    priority="medium",
                    key="PP-1",
                ),
            ]
        )
        db.commit()
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        assert result["summary"]["healthScore"] == 100
        assert result["summary"]["healthStatus"] == "Healthy"

    def test_small_issues_stay_healthy(self, db, admin_user):
        """A couple of open bugs, no criticals/overdue → still ≥ 80."""
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=30), end_date=now + timedelta(days=30)
        )
        # 2 bugs open, 5 stories done. delivery_pct = 5/7 ~= 71.
        db.add_all(
            [
                WorkItem(
                    id=i,
                    project_id=proj.id,
                    type="user_story",
                    title=f"s{i}",
                    status="done",
                    priority="medium",
                    key=f"PP-{i}",
                )
                for i in range(1, 6)
            ]
            + [
                WorkItem(
                    id=10,
                    project_id=proj.id,
                    type="bug",
                    title="b1",
                    status="todo",
                    priority="medium",
                    key="PP-10",
                ),
                WorkItem(
                    id=11,
                    project_id=proj.id,
                    type="bug",
                    title="b2",
                    status="todo",
                    priority="medium",
                    key="PP-11",
                ),
            ]
        )
        db.commit()
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        score = result["summary"]["healthScore"]
        assert 80 <= score <= 99, f"expected small-issue project in 80-99, got {score}"
        assert result["summary"]["healthStatus"] == "Healthy"

    def test_mid_issues_is_at_risk(self, db, admin_user, monkeypatch):
        """Multiple overdue, a few bugs, one critical → exactly 64 (At Risk).

        Uses fixed dates + a frozen ``utcnow`` so the schedule bonus is
        deterministic. With created_at=2026-04-15, end_date=2026-06-15,
        and "now" = 2026-05-21 the contract window enumerates to
        [April, May, June] (3 months) with month_index=2 → expected_time_pct
        = 66.67. delivery_pct=0 → schedule_bonus = clamp(-33.3, -15, 15) = -15.
        deductions: 3 overdue (-9), 2 bugs (-4), 1 critical (-8) → -21.
        score = 100 - 21 - 15 = 64.
        """
        frozen_now = datetime(2026, 5, 21, 12, 0, 0)
        _freeze_pulse_utcnow(monkeypatch, frozen_now)

        proj = _make_project(
            db,
            created_at=datetime(2026, 4, 15),
            end_date=datetime(2026, 6, 15),
        )
        past = datetime(2026, 5, 11)  # 10 days before frozen_now
        items = [
            # 3 overdue tasks → subtract 3*3 = 9
            WorkItem(
                id=i,
                project_id=proj.id,
                type="task",
                title=f"t{i}",
                status="todo",
                priority="medium",
                key=f"PP-{i}",
                due_date=past,
            )
            for i in range(1, 4)
        ]
        # 2 open bugs → subtract 2*2 = 4
        items.extend(
            [
                WorkItem(
                    id=10,
                    project_id=proj.id,
                    type="bug",
                    title="b1",
                    status="todo",
                    priority="medium",
                    key="PP-10",
                ),
                WorkItem(
                    id=11,
                    project_id=proj.id,
                    type="bug",
                    title="b2",
                    status="todo",
                    priority="medium",
                    key="PP-11",
                ),
            ]
        )
        # 1 critical open → subtract 8.
        items.append(
            WorkItem(
                id=20,
                project_id=proj.id,
                type="task",
                title="crit",
                status="todo",
                priority="critical",
                key="PP-20",
            )
        )
        db.add_all(items)
        db.commit()
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        score = result["summary"]["healthScore"]
        assert score == 64, f"expected exactly 64, got {score}"
        assert result["summary"]["healthStatus"] == "At Risk"

    def test_heavy_issues_is_critical(self, db, admin_user):
        """Lots of criticals + overdue → < 60."""
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=30), end_date=now + timedelta(days=30)
        )
        past = now - timedelta(days=10)
        items = []
        # 5 criticals open (subtract 40)
        for i in range(1, 6):
            items.append(
                WorkItem(
                    id=i,
                    project_id=proj.id,
                    type="task",
                    title=f"c{i}",
                    status="todo",
                    priority="critical",
                    key=f"PP-C{i}",
                )
            )
        # 5 overdue (subtract 15)
        for i in range(10, 15):
            items.append(
                WorkItem(
                    id=i,
                    project_id=proj.id,
                    type="task",
                    title=f"o{i}",
                    status="todo",
                    priority="medium",
                    key=f"PP-O{i}",
                    due_date=past,
                )
            )
        db.add_all(items)
        db.commit()
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        score = result["summary"]["healthScore"]
        assert score < 60, f"expected critical (<60), got {score}"
        assert result["summary"]["healthStatus"] == "Critical"


# ---------------------------------------------------------------------------
# Independent section failure
# ---------------------------------------------------------------------------


class TestSafeSectionFailure:
    def test_forecast_failure_does_not_break_summary(self, db, admin_user, monkeypatch):
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=30), end_date=now + timedelta(days=30)
        )
        _seed_mixed_items(db, proj.id)

        def boom(*args, **kwargs):
            raise RuntimeError("synthetic failure")

        monkeypatch.setattr(pulse_module, "_derive_forecast_vs_actuals", boom)

        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        # Summary still populated
        assert result["summary"]["deliveryTotal"] == 10
        # Forecast falls back to the empty default shape
        assert result["forecastVsActuals"] == {"current": [], "last": [], "project": []}


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------


class TestAccessControl:
    def test_403_when_outsider(self, db, outsider_user):
        """A user with no project membership and no admin role gets 403.

        Mirrors how ``require_project_access`` is exercised in the rest of
        the suite — assert the HTTPException, not a network response, since
        we're calling the handler directly.
        """
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=30), end_date=now + timedelta(days=30)
        )
        with pytest.raises(HTTPException) as exc:
            get_pulse_derived(project_id=proj.id, db=db, current_user=outsider_user)
        assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# Months / forecast smoke
# ---------------------------------------------------------------------------


class TestMonthsAndForecast:
    def test_months_walk_contract_window(self, db, admin_user):
        # 3-month window: created today, ends ~75 days out.
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=datetime(now.year, now.month, 1), end_date=now + timedelta(days=75)
        )
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        # At least 3 months (start month + ~2 future months).
        assert len(result["months"]) >= 2
        assert isinstance(result["months"][0]["m"], str)
        assert "actual" in result["months"][0]
        assert "partial" in result["months"][0]

    def test_forecast_sums_descendant_hours(self, db, admin_user):
        now = datetime.utcnow()
        proj = _make_project(
            db, created_at=now - timedelta(days=30), end_date=now + timedelta(days=30)
        )
        dev = Developer(id=1, name="Eng", email="eng@x.com")
        db.add(dev)
        db.commit()

        epic = WorkItem(
            id=100,
            project_id=proj.id,
            type="epic",
            title="Big Feature",
            status="in_progress",
            priority="medium",
            key="PP-E1",
            assignee_id=dev.id,
        )
        story = WorkItem(
            id=101,
            project_id=proj.id,
            type="user_story",
            title="s1",
            status="todo",
            priority="medium",
            key="PP-101",
            epic_id=100,
            estimated_hours=10,
            logged_hours=4,
        )
        subtask = WorkItem(
            id=102,
            project_id=proj.id,
            type="task",
            title="sub1",
            status="todo",
            priority="medium",
            key="PP-102",
            parent_id=101,
            estimated_hours=5,
            logged_hours=2,
        )
        db.add_all([epic, story, subtask])
        db.commit()

        # Add a time_entry for this month so `current` is non-zero.
        db.add(
            TimeEntry(
                id=1,
                work_item_id=story.id,
                developer_id=dev.id,
                hours=3,
                logged_at=now,
            )
        )
        db.commit()

        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        fva = result["forecastVsActuals"]
        assert len(fva["project"]) == 1
        row = fva["project"][0]
        assert row["feature"] == "Big Feature"
        assert row["employee"] == "Eng"
        assert row["fc"] == 15  # 10 + 5
        assert row["act"] == 6  # 4 + 2 (cumulative logged_hours on descendants)
        # Current month MTD should at least include the 3-hour entry we logged.
        assert fva["current"][0]["act"] >= 3


# ---------------------------------------------------------------------------
# Response shape contracts (T1, T2)
# ---------------------------------------------------------------------------


class TestResponseShape:
    """Pins the top-level keys and project-section keys verbatim. A refactor
    that drops or renames a key fails this test loudly, which protects the
    frontend merge layer from silent contract drift."""

    EXPECTED_TOP_KEYS: ClassVar[set[str]] = {
        "project",
        "summary",
        "months",
        "lastActualIdx",
        "currentMonthTrackedPct",
        "includedServices",
        "milestones",
        "updates",
        "forecastVsActuals",
        "_meta",
    }

    EXPECTED_PROJECT_KEYS: ClassVar[set[str]] = {
        "name",
        "keyPrefix",
        "contractStart",
        "contractEnd",
        "launchTarget",
    }

    def test_top_level_shape(self, db, admin_user):
        proj = _make_project(
            db,
            created_at=datetime(2026, 4, 1),
            end_date=datetime(2026, 7, 1),
        )
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        assert set(result.keys()) == self.EXPECTED_TOP_KEYS
        assert isinstance(result["_meta"]["degraded_sections"], list)

    def test_project_section_keys_and_values(self, db, admin_user):
        proj = _make_project(
            db,
            created_at=datetime(2026, 4, 1),
            end_date=datetime(2026, 7, 1),
        )
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        project_section = result["project"]
        assert set(project_section.keys()) == self.EXPECTED_PROJECT_KEYS
        assert project_section["name"] == "Pulse Project"
        assert project_section["keyPrefix"] == "PP"
        assert project_section["contractStart"] == proj.created_at.isoformat()
        assert proj.end_date is not None
        assert project_section["contractEnd"] == proj.end_date.isoformat()
        # Without a matching milestone, launchTarget falls back to contractEnd.
        assert project_section["launchTarget"] == proj.end_date.isoformat()

    def test_launch_target_resolves_matching_milestone(self, db, admin_user):
        """A milestone whose title matches /launch|go.?live|release/i should
        win over the contract-end fallback."""
        proj = _make_project(
            db,
            created_at=datetime(2026, 4, 1),
            end_date=datetime(2026, 7, 1),
        )
        launch_date = datetime(2026, 6, 1)
        db.add(
            ProjectMilestone(
                id=1,
                project_id=proj.id,
                title="Launch v1",
                due_date=launch_date,
            )
        )
        db.commit()
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        assert result["project"]["launchTarget"] == launch_date.isoformat()


# ---------------------------------------------------------------------------
# 404 for nonexistent project (T5)
# ---------------------------------------------------------------------------


class TestNotFound:
    def test_nonexistent_project_raises_404(self, db, admin_user):
        with pytest.raises(HTTPException) as exc:
            get_pulse_derived(project_id=9999, db=db, current_user=admin_user)
        assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# _safe() fault tolerance per section (T8)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("section", "helper_name", "fallback_check"),
    [
        ("project", "_derive_project_meta", lambda v: v == {}),
        ("summary", "_derive_summary", lambda v: v == {}),
        ("includedServices", "_derive_included_services", lambda v: v == []),
        ("milestones", "_derive_milestones", lambda v: v == []),
        ("updates", "_derive_updates", lambda v: v == []),
        (
            "forecastVsActuals",
            "_derive_forecast_vs_actuals",
            lambda v: v == {"current": [], "last": [], "project": []},
        ),
    ],
)
def test_safe_isolates_each_section(
    db, admin_user, monkeypatch, section, helper_name, fallback_check
):
    """Monkeypatch each deriver in turn to raise. The handler should still
    return 200, the failed section's fallback should be served, and
    `_meta.degraded_sections` should name the section."""
    proj = _make_project(
        db,
        created_at=datetime(2026, 4, 1),
        end_date=datetime(2026, 7, 1),
    )

    def _raise(*_args, **_kwargs):
        raise RuntimeError(f"{helper_name} failed")

    monkeypatch.setattr(pulse_module, helper_name, _raise)

    result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
    assert section in result["_meta"]["degraded_sections"]
    assert fallback_check(result[section]), f"unexpected fallback for {section}: {result[section]}"


def test_safe_isolates_months_section(db, admin_user, monkeypatch):
    """`_derive_months` returns a dict block that drives multiple top-level
    fields (`months`, `lastActualIdx`, `currentMonthTrackedPct`). Verify that
    when it fails, all three fall back to their defaults and "months" is
    listed in degraded_sections."""
    proj = _make_project(
        db,
        created_at=datetime(2026, 4, 1),
        end_date=datetime(2026, 7, 1),
    )

    def _raise(*_args, **_kwargs):
        raise RuntimeError("months failed")

    monkeypatch.setattr(pulse_module, "_derive_months", _raise)
    result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
    assert "months" in result["_meta"]["degraded_sections"]
    assert result["months"] == []
    assert result["lastActualIdx"] == 0
    assert result["currentMonthTrackedPct"] == 0


# ---------------------------------------------------------------------------
# Bounded values (B2, B11)
# ---------------------------------------------------------------------------


class TestBoundedValues:
    def test_overall_completion_is_clamped_at_100(self, db, admin_user):
        """When logged_hours > estimated_hours, overallCompletion must not
        exceed 100% — frontend progress bars assume 0..100."""
        proj = _make_project(
            db,
            created_at=datetime(2026, 4, 1),
            end_date=datetime(2026, 7, 1),
        )
        # Two items where logged > estimated by a wide margin.
        db.add_all(
            [
                WorkItem(
                    id=901,
                    project_id=proj.id,
                    type="task",
                    title="overrun-1",
                    status="in_progress",
                    priority="medium",
                    key="PP-901",
                    estimated_hours=10,
                    logged_hours=50,
                ),
                WorkItem(
                    id=902,
                    project_id=proj.id,
                    type="task",
                    title="overrun-2",
                    status="in_progress",
                    priority="medium",
                    key="PP-902",
                    estimated_hours=5,
                    logged_hours=40,
                ),
            ]
        )
        db.commit()
        result = get_pulse_derived(project_id=proj.id, db=db, current_user=admin_user)
        assert result["summary"]["overallCompletion"] <= 100

    def test_health_score_neutral_when_no_end_date(self, db, admin_user, monkeypatch):
        """A project with no `end_date` has total_months=0, which would
        otherwise make schedule_bonus always positive (always-favorable bug).
        After B11, schedule_bonus is 0 in that case — the score reflects only
        the issue deductions."""
        # Freeze "now" so the no-end_date case is reproducible.
        _freeze_pulse_utcnow(monkeypatch, datetime(2026, 5, 21, 12, 0, 0))
        proj_no_end = _make_project(
            db,
            created_at=datetime(2026, 4, 15),
            end_date=None,
        )
        # Two open bugs → -4
        db.add_all(
            [
                WorkItem(
                    id=701,
                    project_id=proj_no_end.id,
                    type="bug",
                    title="bug-1",
                    status="todo",
                    priority="medium",
                    key="PP-701",
                ),
                WorkItem(
                    id=702,
                    project_id=proj_no_end.id,
                    type="bug",
                    title="bug-2",
                    status="todo",
                    priority="medium",
                    key="PP-702",
                ),
            ]
        )
        db.commit()
        result = get_pulse_derived(project_id=proj_no_end.id, db=db, current_user=admin_user)
        # totalMonths is 0 → schedule_bonus should be 0 → score = 100 - 4 = 96.
        assert result["summary"]["totalMonths"] == 0
        assert result["summary"]["healthScore"] == 96
