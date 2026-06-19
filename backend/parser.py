"""
parse_roadmap.py
----------------
Parses the AAI Ops roadmap Excel file and outputs:
  - tickets        : list of all TASK rows as structured dicts
  - schedule       : per-assignee, per-week hours breakdown
  - conflicts      : same assignee working >40 hrs in a week
  - parallel_tasks : tasks running in same week (different assignees) — fine
  - availability   : first free week per assignee after their last task
  - warnings       : unassigned tasks, effort mismatches

Usage:
    python parse_roadmap.py                          # prints JSON to stdout
    python parse_roadmap.py --file my_roadmap.xlsx   # custom file path
"""

import argparse
import datetime
import itertools
import json
from typing import Any

import openpyxl

from logging_config import setup_logger

logger = setup_logger("parser")

# ── Constants ─────────────────────────────────────────────────────────────────
HOURS_PER_WEEK = 40  # threshold for "fully booked"


# ── Helpers ───────────────────────────────────────────────────────────────────


def col_index_to_letter(idx):
    """1-based column index → Excel letter (e.g. 9 → 'I')."""
    return openpyxl.utils.get_column_letter(idx)


def parse_effort(raw):
    """Convert effort cell value to float, or None if blank/invalid."""
    if raw is None:
        return None
    try:
        return float(raw)
    except (ValueError, TypeError):
        return None


def date_key(dt):
    """datetime → 'YYYY-MM-DD' string used as dict key."""
    if isinstance(dt, datetime.datetime):
        return dt.date().isoformat()
    if isinstance(dt, datetime.date):
        return dt.isoformat()
    return str(dt)


def _compute_missing_weeks(union_weeks: list) -> list:
    """Return Mondays inside `[min, max]` of `union_weeks` that aren't covered.

    A "covered" week is one that appears in some milestone's date columns;
    a "missing" week is a calendar Monday that falls between covered weeks
    but isn't covered by any milestone. The parser uses this to:
        1. Surface "no sprint will be created for week X" warnings.
        2. Keep sprints calendar-continuous — `calculate_sprints` splits the
           union at every gap so a sprint never spans an uncovered week.

    Returns [] when `union_weeks` has fewer than 2 entries (a single-week
    project cannot have a gap).
    """
    if len(union_weeks) < 2:
        return []
    start = datetime.date.fromisoformat(union_weeks[0])
    end = datetime.date.fromisoformat(union_weeks[-1])
    covered = set(union_weeks)
    missing = []
    cur = start
    while cur <= end:
        iso = cur.isoformat()
        if iso not in covered:
            missing.append(iso)
        cur += datetime.timedelta(days=7)
    return missing


def calculate_sprints(week_dates: list, sprint_weeks: int, tickets: list) -> dict:
    """
    Calculate sprint boundaries and assign tasks to sprints.

    `week_dates` is the sorted UNION of every milestone's week dates
    (built by ``parse()`` as ``sorted({wk for ws in milestone_weeks.values()
    for wk in ws})``). To keep sprints calendar-continuous when milestones
    cover disjoint ranges, the function splits the union into contiguous
    runs at every gap larger than 7 days, chunks each run independently
    by ``sprint_weeks``, and numbers sprints globally (Sprint 1, 2, 3 …
    across runs). Sprints never bridge an uncovered week — use
    ``_compute_missing_weeks`` upstream to warn the user about gaps.

    Args:
        week_dates: list of 'YYYY-MM-DD' Monday strings, pre-sorted; may
            contain calendar gaps (detected internally).
        sprint_weeks: number of weeks per sprint (e.g., 2, 3, 4).
        tickets: list of task dicts with 'active_weeks' field.

    Returns:
        {
            'sprints': [{number, start_week, end_week, duration_weeks,
                         week_dates, tasks, total_hours, task_count}, ...],
            'unscheduled_tasks': [{name, reason}, ...],
            'total_sprints': int,
        }
    """
    if not week_dates or sprint_weeks < 1:
        return {"sprints": [], "unscheduled_tasks": [], "total_sprints": 0}

    # Split the union into contiguous runs. Each run is a maximal sublist
    # whose consecutive Mondays differ by exactly 7 days. Anything else is
    # a calendar gap — a run boundary — and produces a fresh starting
    # sprint instead of letting a chunk span the gap.
    runs: list = []
    current_run: list = [week_dates[0]]
    for prev, nxt in itertools.pairwise(week_dates):
        prev_date = datetime.date.fromisoformat(prev)
        next_date = datetime.date.fromisoformat(nxt)
        if (next_date - prev_date).days == 7:
            current_run.append(nxt)
        else:
            runs.append(current_run)
            current_run = [nxt]
    runs.append(current_run)

    # Chunk each run independently; number sprints globally across runs so
    # the user sees "Sprint 1, 2, 3" rather than per-run resets.
    sprints = []
    sprint_num = 1
    for run in runs:
        for sprint_idx in range(0, len(run), sprint_weeks):
            sprint_week_range = run[sprint_idx : sprint_idx + sprint_weeks]

            # week_dates entries are Mondays; the sprint ends on the Friday
            # of the last covered week (Monday + 4 days).
            last_monday = sprint_week_range[-1]
            last_friday = (
                datetime.date.fromisoformat(last_monday) + datetime.timedelta(days=4)
            ).isoformat()

            sprints.append(
                {
                    "number": sprint_num,
                    "start_week": sprint_week_range[0],
                    "end_week": last_friday,
                    "duration_weeks": len(sprint_week_range),
                    "week_dates": sprint_week_range,
                    "tasks": [],
                    "total_hours": 0.0,
                }
            )
            sprint_num += 1

    # Assign tasks to sprints
    unscheduled = []
    for task in tickets:
        if not task.get("active_weeks") or len(task["active_weeks"]) == 0:
            unscheduled.append({"name": task["name"], "reason": "no weeks scheduled"})
            continue

        # Find which sprints this task touches
        task_assigned = False
        for sprint in sprints:
            sprint_weeks_set = set(sprint["week_dates"])
            task_weeks_set = set(task["active_weeks"])

            # If task has hours in any week of this sprint, add it to sprint
            if sprint_weeks_set & task_weeks_set:
                hours_in_sprint = sum(
                    task.get("week_hours", {}).get(w, 0) for w in sprint["week_dates"]
                )
                if hours_in_sprint > 0:
                    sprint["tasks"].append(task["name"])
                    sprint["total_hours"] += hours_in_sprint
                    task_assigned = True

        if not task_assigned and task.get("week_hours"):
            # Task has week_hours but they didn't match any sprint (shouldn't happen with correct logic)
            unscheduled.append({"name": task["name"], "reason": "hours outside sprint boundaries"})

    # Remove duplicate task names in each sprint
    for sprint in sprints:
        sprint["tasks"] = list(set(sprint["tasks"]))
        sprint["task_count"] = len(sprint["tasks"])

    return {"sprints": sprints, "unscheduled_tasks": unscheduled, "total_sprints": len(sprints)}


# ── Core parser ───────────────────────────────────────────────────────────────


def parse(filepath: str, sprint_weeks: int = 2) -> dict:
    wb = openpyxl.load_workbook(filepath, data_only=True)

    # ── Find the sheet with roadmap data (support multiple sheets) ─────────────
    # Try all sheets to find one with the required structure
    ws = None
    sheet_names = wb.sheetnames

    if not sheet_names:
        raise ValueError("Excel file has no sheets")

    # First, try to find a sheet with "roadmap" in the name
    for sheet_name in sheet_names:
        if "roadmap" in sheet_name.lower():
            ws = wb[sheet_name]
            break

    # If not found, try all sheets and use the first one with valid structure
    if ws is None:
        for sheet_name in sheet_names:
            candidate_ws = wb[sheet_name]
            candidate_rows = list(candidate_ws.iter_rows(min_row=1, values_only=True))

            if candidate_rows:
                header_row = candidate_rows[0]
                # Check if this sheet has the required columns (type and name)
                header_lower_list = [str(h).strip().lower() if h else "" for h in header_row]
                has_type = any("type" in h for h in header_lower_list)
                has_name = any("name" in h or "title" in h for h in header_lower_list)

                if has_type and has_name:
                    ws = candidate_ws
                    break

    # Fallback: use first sheet if no valid structure found
    if ws is None:
        ws = wb.active
        logger.warning(f"Could not identify roadmap sheet, using default: {ws.title}")

    logger.info(f"Using sheet: {ws.title}")

    all_rows = list(ws.iter_rows(min_row=1, values_only=True))

    # ── Step 0: Build column mapping from header row ────────────────────────────
    # Find columns by name instead of hard-coded positions for flexibility
    header_row = all_rows[0] if all_rows else []

    # Define what column names we're looking for (case-insensitive)
    column_names_to_find = {
        "type": ["type", "row type", "item type", "task type"],
        "name": ["name", "title", "task name", "task title"],
        "description": ["description", "details", "desc"],
        "milestone": ["milestone", "phase", "release"],
        "epic": ["epic", "feature", "epic name"],
        "priority": ["priority", "p", "prio"],
        "effort_hrs": ["effort", "effort_hrs", "effort hours", "hours", "hrs", "estimate"],
        "assignee": ["assignee", "assigned to", "owner", "developer", "dev"],
    }

    # Build column index mapping
    col_mapping = {}
    for field_name, possible_names in column_names_to_find.items():
        for col_idx, header_cell in enumerate(header_row):
            if header_cell is None:
                continue
            header_lower = str(header_cell).strip().lower()
            # For priority, be VERY specific - must contain "priority" or be exactly "p" or "prio"
            if field_name == "priority":
                # Priority: be more strict, only match if "priority" is a standalone word
                if "priority" in header_lower or header_lower in ["p", "prio"]:
                    col_mapping[field_name] = col_idx
                    break
            else:
                if any(name.lower() in header_lower for name in possible_names):
                    col_mapping[field_name] = col_idx
                    break

    # Debug: Show header row
    logger.debug("═══ HEADER ROW ANALYSIS ═══")
    logger.debug(f"Total columns: {len(header_row)}")
    logger.debug("All Column Headers:")
    for idx, h in enumerate(header_row):
        col_letter = col_index_to_letter(idx + 1)
        logger.debug(f"  [{col_letter}] (idx {idx}): '{h}'")

    # Verify we found all critical columns
    required_cols = ["type", "name"]
    missing = [c for c in required_cols if c not in col_mapping]
    if missing:
        raise ValueError(
            f"Could not find required columns: {missing}. "
            f"Available columns: {[str(h) for h in header_row if h]}"
        )

    # Use default indices if columns not found (fallback to old behavior)
    # BUT: Only for columns that make sense to have defaults
    # For optional columns like priority, don't use fallback indices - use None instead
    if "description" not in col_mapping:
        col_mapping["description"] = 2
    if "milestone" not in col_mapping:
        col_mapping["milestone"] = 3
    if "epic" not in col_mapping:
        col_mapping["epic"] = 4
    # NOTE: priority, effort_hrs, assignee - if not found, leave out of col_mapping
    # Don't use fallback indices for these as they might point to wrong columns
    if "effort_hrs" not in col_mapping:
        col_mapping["effort_hrs"] = 6
    if "assignee" not in col_mapping:
        col_mapping["assignee"] = 7

    # Debug: log the column mapping
    logger.debug("═══ IDENTIFIED COLUMNS ═══")
    for field, col_idx in sorted(col_mapping.items(), key=lambda x: x[1]):
        col_letter = col_index_to_letter(col_idx + 1)  # Convert to 1-based for display
        header_val = header_row[col_idx] if col_idx < len(header_row) else "?"
        status = "✓ Found" if header_row[col_idx] else "⚠ Default"
        logger.debug(f"  {field:15} → [{col_letter}] idx {col_idx:2d} = '{header_val}' {status}")

    # Find the first week column by looking at the MILESTONE row (which has actual dates)
    # This is more reliable than looking at headers since week columns might not have headers
    week_col_start = max(col_mapping.values()) + 1

    # Scan MILESTONE rows to find where the week dates start
    for row in all_rows[1:]:  # Skip header row
        row_type = row[col_mapping["type"]]
        row_type = str(row_type).strip().upper() if row_type else ""

        if row_type == "MILESTONE":
            # Found a MILESTONE row - scan its columns to find where dates start
            for col_idx in range(week_col_start, len(row)):
                cell = row[col_idx]
                if isinstance(cell, (datetime.datetime, datetime.date)):
                    # Found the first date column - this is where weeks start
                    week_col_start = col_idx
                    break
            break  # Use the first MILESTONE row we find

    # ── Step 1: build per-milestone week date map ─────────────────────────────
    # Each MILESTONE row has its own week sequence starting from week_col_start.
    # We walk all rows once, and every time we hit a MILESTONE we record its
    # week dates. TASK rows then use the week dates of their current milestone.
    #
    # milestone_weeks: { milestone_name: ['YYYY-MM-DD', ...] }
    milestone_weeks = {}

    for row in all_rows[1:]:  # Skip header row
        row_type = row[col_mapping["type"]]
        # Normalize row type
        row_type = str(row_type).strip().upper() if row_type else ""

        if row_type == "MILESTONE":
            name = row[col_mapping["name"]]
            dates = []
            for v in row[week_col_start:]:
                if isinstance(v, (datetime.datetime, datetime.date)):
                    dates.append(date_key(v))
            if dates:
                milestone_weeks[name] = dates

    if not milestone_weeks:
        raise ValueError(
            "No MILESTONE row with week dates found. "
            f"Check that columns starting from column {col_index_to_letter(week_col_start + 1)} contain dates."
        )

    # ── Step 1b: union of all milestone weeks ─────────────────────────────────
    # The project's sprint generation and `week_range` derive from this
    # union, not from any single milestone's date sequence. When milestones
    # cover disjoint date ranges, the union exposes the full timeline and
    # `missing_weeks` catches calendar gaps in the middle so we can:
    #   - warn the user (sprints won't be created for uncovered weeks), and
    #   - keep sprints calendar-continuous (calculate_sprints splits the
    #     union into contiguous runs at each gap).
    # When every milestone shares the same date sequence (the common case),
    # the union equals that sequence and there are no missing weeks — so
    # behaviour matches the single-milestone era exactly.
    union_weeks = sorted({wk for weeks in milestone_weeks.values() for wk in weeks})
    missing_weeks = _compute_missing_weeks(union_weeks)

    # Hoisted up so the gap warnings appear before the row-level warnings
    # emitted in step 2 — structural concerns first, per-row second.
    warnings: list[dict[str, str | int | None]] = []
    for wk in missing_weeks:
        warnings.append(
            {
                "row": None,
                "task": None,
                "issue": "uncovered_week",
                "detail": (
                    f"Week of {wk} is not covered by any milestone. "
                    "No sprint will be created for that week."
                ),
            }
        )

    # ── Step 2: walk every row ────────────────────────────────────────────────
    tickets = []
    epics = {}  # name → milestone
    milestones = []
    current_milestone_weeks = []  # week dates of the milestone currently in scope

    for row_num, row in enumerate(all_rows[1:], start=2):  # Start from row 2 (skip header)
        row_type = row[col_mapping["type"]]

        # Normalize row type to uppercase for case-insensitive matching
        row_type = str(row_type).strip().upper() if row_type else ""

        if row_type == "MILESTONE":
            m_name = row[col_mapping["name"]]
            milestones.append(m_name)
            # Switch active week dates to this milestone's sequence
            current_milestone_weeks = milestone_weeks.get(m_name, [])
            continue

        if row_type == "EPIC":
            epics[row[col_mapping["name"]]] = row[col_mapping["milestone"]]
            continue

        if row_type != "TASK":
            continue  # skip header row, totals row, blank rows

        # ── Extract left-column fields ────────────────────────────────────────
        name = row[col_mapping["name"]]
        description = (
            row[col_mapping["description"]] if col_mapping["description"] < len(row) else None
        )
        milestone = row[col_mapping["milestone"]] if col_mapping["milestone"] < len(row) else None
        epic = row[col_mapping["epic"]] if col_mapping["epic"] < len(row) else None
        # Priority: only extract if column exists, otherwise default to "medium"
        priority = None
        if "priority" in col_mapping and col_mapping["priority"] < len(row):
            priority = row[col_mapping["priority"]]
        if not priority:
            priority = "Medium"  # Default priority if not specified
        effort_raw = (
            row[col_mapping["effort_hrs"]] if col_mapping["effort_hrs"] < len(row) else None
        )
        assignee = row[col_mapping["assignee"]] if col_mapping["assignee"] < len(row) else None

        effort_hrs = parse_effort(effort_raw)
        assignee = assignee.strip() if assignee else None

        # `current_milestone_weeks` is the week sequence of the milestone
        # this task lives under (updated on every MILESTONE row above).
        # Used here to limit how many columns of hours we read and to map
        # each column index back to its calendar date.
        week_col_count = len(current_milestone_weeks)

        # ── Extract week hours (cols from week_col_start onward) ────────────────
        week_hours = {}  # { 'YYYY-MM-DD': hours_float }
        week_vals = row[week_col_start:]  # 0-based

        planned_total = 0.0
        for i, val in enumerate(week_vals[:week_col_count]):
            if val is not None:
                try:
                    hrs = float(val)
                    if hrs > 0:
                        week_hours[current_milestone_weeks[i]] = hrs
                        planned_total += hrs
                except (ValueError, TypeError):
                    pass

        # ── Warnings ──────────────────────────────────────────────────────────
        if not assignee:
            warnings.append(
                {
                    "row": row_num,
                    "task": name,
                    "issue": "unassigned",
                    "detail": "Assignee is blank. Task cannot be scheduled or conflicted.",
                }
            )

        if effort_hrs is not None and planned_total > 0:
            diff = abs(planned_total - effort_hrs)
            if diff > 0.5:  # tolerance: 0.5 hrs
                warnings.append(
                    {
                        "row": row_num,
                        "task": name,
                        "issue": "effort_mismatch",
                        "detail": (
                            f"Effort (hrs) col says {effort_hrs}h "
                            f"but week columns sum to {planned_total}h "
                            f"(diff: {diff}h)."
                        ),
                    }
                )

        if effort_hrs is not None and planned_total == 0:
            warnings.append(
                {
                    "row": row_num,
                    "task": name,
                    "issue": "no_weeks_planned",
                    "detail": f"Effort is {effort_hrs}h but no week columns filled in.",
                }
            )

        ticket = {
            "row": row_num,
            "name": name,
            "description": description,
            "milestone": milestone,
            "epic": epic,
            "priority": priority,
            "effort_hrs": effort_hrs,
            "assignee": assignee,
            "week_hours": week_hours,  # { week_date: hrs }
            "planned_total": planned_total,  # sum of week cols
            "active_weeks": sorted(week_hours.keys()),
        }

        # Debug: log first few tickets to verify priority extraction
        if row_num <= 5:
            logger.debug(f"ROW {row_num} '{name}':")
            logger.debug(
                f"  Row type (col {col_mapping.get('type', '?')}): {row[col_mapping['type']] if col_mapping['type'] < len(row) else 'N/A'}"
            )
            if "priority" in col_mapping:
                priority_col_idx = col_mapping["priority"]
                priority_col_letter = col_index_to_letter(priority_col_idx + 1)
                logger.debug(
                    f"  Priority (col {priority_col_letter} idx {priority_col_idx}): '{row[priority_col_idx] if priority_col_idx < len(row) else 'N/A'}' → Extracted as '{priority}'"
                )
            else:
                logger.debug("  Priority: NOT FOUND IN COLUMNS → Using default 'medium'")

        tickets.append(ticket)

    # ── Step 3: per-assignee schedule ─────────────────────────────────────────
    # schedule[assignee][week_date] = { total_hrs, tasks: [name, ...] }
    schedule: dict[str, dict[str, dict[str, Any]]] = {}

    for t in tickets:
        if not t["assignee"]:
            continue
        dev = t["assignee"]
        if dev not in schedule:
            schedule[dev] = {}
        for wk, hrs in t["week_hours"].items():
            if wk not in schedule[dev]:
                schedule[dev][wk] = {"total_hrs": 0.0, "tasks": []}
            schedule[dev][wk]["total_hrs"] += hrs
            schedule[dev][wk]["tasks"].append(t["name"])

    # Sort each dev's weeks
    schedule = {dev: dict(sorted(weeks.items())) for dev, weeks in sorted(schedule.items())}

    # ── Step 4: conflicts — same assignee, same week, total hrs > threshold ───
    conflicts = []
    for dev, weeks in schedule.items():
        for wk, info in weeks.items():
            if len(info["tasks"]) > 1:
                conflicts.append(
                    {
                        "assignee": dev,
                        "week": wk,
                        "total_hrs": info["total_hrs"],
                        "tasks": info["tasks"],
                        "overbooked": info["total_hrs"] > HOURS_PER_WEEK,
                    }
                )

    # ── Step 5: parallel tasks — different assignees, same week ──────────────
    # Build week → list of (task_name, assignee) for tasks with hours that week
    week_task_map: dict[str, list[tuple[str, str]]] = {}
    for t in tickets:
        if not t["assignee"]:
            continue
        for wk in t["active_weeks"]:
            if wk not in week_task_map:
                week_task_map[wk] = []
            week_task_map[wk].append((t["name"], t["assignee"]))

    parallel_tasks = []
    for wk in sorted(week_task_map.keys()):
        entries = week_task_map[wk]
        if len(entries) < 2:
            continue
        # Find pairs with different assignees
        seen = set()
        for i in range(len(entries)):
            for j in range(i + 1, len(entries)):
                n1, a1 = entries[i]
                n2, a2 = entries[j]
                if a1 != a2:
                    pair_key = tuple(sorted([n1, n2]))
                    if pair_key not in seen:
                        seen.add(pair_key)
                        parallel_tasks.append(
                            {
                                "week": wk,
                                "task_a": n1,
                                "assignee_a": a1,
                                "task_b": n2,
                                "assignee_b": a2,
                            }
                        )

    # ── Step 6: availability — first free week after last task ────────────────
    availability: dict[str, dict[str, Any]] = {}
    for dev, weeks in schedule.items():
        busy_weeks = sorted(weeks.keys())
        if not busy_weeks:
            availability[dev] = {"last_busy_week": None, "first_free_week": None}
            continue

        last_busy = busy_weeks[-1]
        # Next week after last busy
        last_dt = datetime.date.fromisoformat(last_busy)
        first_free = (last_dt + datetime.timedelta(weeks=1)).isoformat()

        availability[dev] = {
            "last_busy_week": last_busy,
            "first_free_week": first_free,
            "total_tasks": len([t for t in tickets if t["assignee"] == dev]),
            "total_hrs_planned": sum(info["total_hrs"] for info in weeks.values()),
        }

    # ── Step 7: calculate sprints ────────────────────────────────────────────
    # Pass the union of every milestone's weeks (not the leaked per-task
    # `week_dates` variable that used to bleed out of the loop). When
    # milestones share dates the union equals their shared sequence; when
    # they diverge, calculate_sprints handles the runs internally.
    sprint_data = calculate_sprints(union_weeks, sprint_weeks, tickets)

    # ── Step 8: assemble output ───────────────────────────────────────────────
    # `week_range` and `total_weeks` derive from the union, so they reflect
    # the full project timeline across all milestones — not just the last
    # milestone seen during row iteration (which was the pre-union bug).
    return {
        "meta": {
            "file": filepath,
            "parsed_at": datetime.datetime.now().isoformat(),
            "week_range": (
                {"start": union_weeks[0], "end": union_weeks[-1]} if union_weeks else None
            ),
            "total_weeks": len(union_weeks),
            "missing_weeks": missing_weeks,
            "total_tasks": len(tickets),
            "total_assignees": len(schedule),
            "sprint_weeks": sprint_weeks,
            "total_sprints": sprint_data["total_sprints"],
        },
        "tickets": tickets,
        "schedule": schedule,
        "conflicts": conflicts,
        "parallel_tasks": parallel_tasks,
        "availability": availability,
        "warnings": warnings,
        "sprints": sprint_data["sprints"],
        "unscheduled_tasks": sprint_data["unscheduled_tasks"],
    }


# ── CLI entry point ────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Parse AAI Ops roadmap Excel file.")
    parser.add_argument(
        "--file",
        "-f",
        default="roadmap_template_AAI_Ops.xlsx",
        help="Path to the roadmap .xlsx file",
    )
    parser.add_argument(
        "--sprint-weeks", "-sw", type=int, default=2, help="Number of weeks per sprint (default: 2)"
    )
    parser.add_argument(
        "--section",
        "-s",
        choices=[
            "meta",
            "tickets",
            "schedule",
            "conflicts",
            "parallel_tasks",
            "availability",
            "warnings",
            "sprints",
            "unscheduled_tasks",
        ],
        default=None,
        help="Print only one section of the output",
    )
    args = parser.parse_args()

    result = parse(args.file, sprint_weeks=args.sprint_weeks)

    if args.section:
        print(json.dumps(result[args.section], indent=2, default=str))
    else:
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
