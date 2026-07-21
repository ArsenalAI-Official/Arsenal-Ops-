"""Roadmap upload honors the user's chosen sprint length on every parse path.

The standard parser already builds sprints from `sprint_weeks`; the AI-fallback
parser doesn't, so `_ensure_sprints` derives them. Without it, AI-parsed uploads
ignored the "Weeks per Sprint" slider and created no sprints on commit.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers.roadmap import _ensure_sprints

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
