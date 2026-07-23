"""Roadmap upload honors the user's chosen sprint length on every parse path.

The standard parser already builds sprints from `sprint_weeks`; the AI-fallback
parser doesn't, so `_ensure_sprints` derives them. Without it, AI-parsed uploads
ignored the "Weeks per Sprint" slider and created no sprints on commit.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from parser import calculate_sprints, rebalance_sprints
from routers.roadmap import (
    RebalanceSprintsRequest,
    RebalanceTicketIn,
    _ensure_sprints,
    rebalance_roadmap_sprints,
)

# Six consecutive Mondays.
WEEKS = [
    "2026-01-05",
    "2026-01-12",
    "2026-01-19",
    "2026-01-26",
    "2026-02-02",
    "2026-02-09",
]


def _ai_parsed_result():
    """Shape the AI fallback returns: tickets with week data, but no sprints."""
    return {
        "tickets": [
            {"name": "Build API", "active_weeks": WEEKS, "week_hours": dict.fromkeys(WEEKS, 5)},
        ]
    }


def test_two_week_sprints_over_six_weeks_gives_three():
    r = _ai_parsed_result()
    _ensure_sprints(r, 2)
    assert len(r["sprints"]) == 3
    assert all(s["duration_weeks"] == 2 for s in r["sprints"])


def test_three_week_sprints_over_six_weeks_gives_two():
    r = _ai_parsed_result()
    _ensure_sprints(r, 3)
    assert len(r["sprints"]) == 2


def test_six_week_sprint_gives_one():
    r = _ai_parsed_result()
    _ensure_sprints(r, 6)
    assert len(r["sprints"]) == 1
    assert r["sprints"][0]["start_week"] == "2026-01-05"


def test_existing_schedule_is_left_untouched():
    r = {"tickets": _ai_parsed_result()["tickets"], "sprints": [{"number": 99}]}
    _ensure_sprints(r, 2)
    assert r["sprints"] == [{"number": 99}]  # standard-parser output wins


def test_no_week_data_produces_no_sprints():
    r = {"tickets": [{"name": "X", "active_weeks": [], "week_hours": {}}]}
    _ensure_sprints(r, 2)
    assert not r.get("sprints")


# ── Single-sprint-per-task assignment (the corrected rollup) ─────────────────


def _spanning_ticket():
    """A task that works across the Sprint-1/Sprint-2 boundary (weeks 2 & 3 of a
    2-week cadence), 6h each week, full estimate 12h."""
    return {
        "name": "Spanning",
        "effort_hrs": 12,
        "week_hours": {WEEKS[1]: 6, WEEKS[2]: 6},
        "active_weeks": [WEEKS[1], WEEKS[2]],
    }


def test_spanning_task_lands_in_last_sprint_with_full_effort():
    # 2-week sprints → S1=[w0,w1], S2=[w2,w3], S3=[w4,w5]. The task spans w1 (S1)
    # and w2 (S2); commit gives it a single sprint_id (last-wins = S2) with its
    # full 12h. calculate_sprints must match: appears once, in S2, counted 12h.
    result = calculate_sprints(WEEKS, 2, [_spanning_ticket()])
    sprints = result["sprints"]
    assert [s["number"] for s in sprints] == [1, 2, 3]
    assert sprints[0]["tasks"] == []  # not double-listed in S1
    assert sprints[0]["total_hours"] == 0  # not over-counted
    assert sprints[1]["tasks"] == ["Spanning"]
    assert sprints[1]["total_hours"] == 12  # full effort, not the 6h in-sprint slice
    assert sprints[2]["tasks"] == []


def test_rebalance_variable_durations_and_single_assignment():
    # durations [4, 2] → S1 = first 4 weeks, S2 = last 2 weeks.
    sprints = rebalance_sprints(WEEKS, [4, 2], [_spanning_ticket()], default_weeks=2)
    assert [s["duration_weeks"] for s in sprints] == [4, 2]
    # Task spans w1+w2, both now inside S1 → assigned to S1 with full 12h.
    assert sprints[0]["tasks"] == ["Spanning"]
    assert sprints[0]["total_hours"] == 12
    assert sprints[1]["tasks"] == []


def test_rebalance_default_weeks_fills_when_durations_exhausted():
    # Only one duration given; the rest fall back to default_weeks=2.
    sprints = rebalance_sprints(WEEKS, [2], [], default_weeks=2)
    assert [s["duration_weeks"] for s in sprints] == [2, 2, 2]


def test_rebalance_respects_calendar_gap():
    # A >7-day gap between weeks[1] and weeks[2] must close a sprint early even
    # if the duration target isn't reached.
    gapped = [WEEKS[0], WEEKS[1], "2026-03-02", "2026-03-09"]  # gap before 03-02
    sprints = rebalance_sprints(gapped, [3, 3], [], default_weeks=3)
    assert [s["week_dates"] for s in sprints] == [
        [WEEKS[0], WEEKS[1]],
        ["2026-03-02", "2026-03-09"],
    ]


def test_rebalance_endpoint_returns_recomputed_sprints():
    req = RebalanceSprintsRequest(
        weeks=WEEKS,
        durations=[4, 2],
        tickets=[RebalanceTicketIn(**_spanning_ticket())],
        default_weeks=2,
    )
    # The endpoint ignores current_user (pure compute); None is fine here.
    res = rebalance_roadmap_sprints(req, current_user=None)  # type: ignore[arg-type]
    assert [s["duration_weeks"] for s in res["sprints"]] == [4, 2]
    assert res["sprints"][0]["tasks"] == ["Spanning"]
    assert res["sprints"][0]["total_hours"] == 12
