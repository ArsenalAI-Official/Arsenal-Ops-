"""Audit existing work_items rows against the canonical hierarchy rules.

Reports rows that would be rejected by ``services.hierarchy.validate_hierarchy``
if they were submitted today. Under the current consensus model (Story / Task /
Bug as siblings under Epic, no parent_id support), this will flag any legacy
row with parent_id set; the --fix mode clears it.

Modes:
    --dry-run   (default) Read-only. Prints violators.
    --fix       Clears the offending field (parent_id or epic_id) on each
                violator and commits, then re-audits and prints what remains.

Run from the backend dir:

    python -m scripts.audit_hierarchy
    python -m scripts.audit_hierarchy --fix
"""

import argparse
import os
import sys
from typing import cast

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import SessionLocal

# Eagerly import every model module so the WorkItem mapper (which validate_
# hierarchy queries) and its relationship() string references resolve.
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
from services.hierarchy import validate_hierarchy

# Only these fields are ever populated by a violation — never clear anything else.
FIXABLE_FIELDS = {"parent_id", "epic_id"}


def _scan(db: Session) -> tuple[int, list[tuple[dict, dict]]]:
    """Return (total scanned, list of (row dict, violation detail))."""
    rows = db.execute(
        text("SELECT id, key, type, project_id, parent_id, epic_id FROM work_items")
    ).all()

    violations: list[tuple[dict, dict]] = []
    for row in rows:
        item = {
            "id": row.id,
            "key": row.key,
            "type": row.type,
            "project_id": row.project_id,
            "parent_id": row.parent_id,
            "epic_id": row.epic_id,
        }
        try:
            validate_hierarchy(
                db,
                item_type=item["type"],
                project_id=item["project_id"],
                parent_id=item["parent_id"],
                epic_id=item["epic_id"],
                item_id=item["id"],
            )
        except HTTPException as exc:
            # _reject() always builds detail as a dict (field/code/message).
            violations.append((item, cast(dict, exc.detail)))

    return len(rows), violations


def _print_violations(violations: list[tuple[dict, dict]]) -> None:
    for item, detail in violations:
        print(
            f"  - {item['key']} (id={item['id']}, type={item['type']}, "
            f"project_id={item['project_id']}, parent_id={item['parent_id']}, "
            f"epic_id={item['epic_id']})"
        )
        print(f"      -> {detail['field']} / {detail['code']}: {detail['message']}")


def _fix(db: Session, violations: list[tuple[dict, dict]]) -> int:
    """Clear the offending field on each violator. Returns rows mutated."""
    mutated = 0
    for item, detail in violations:
        field = detail["field"]
        if field not in FIXABLE_FIELDS:
            print(
                f"  ! Skipping {item['key']}: violation on '{field}' is not "
                "auto-fixable. Resolve manually."
            )
            continue
        db.execute(
            text(f"UPDATE work_items SET {field} = NULL WHERE id = :id"),
            {"id": item["id"]},
        )
        print(f"  ~ Cleared {field} on {item['key']} (id={item['id']})")
        mutated += 1
    if mutated:
        db.commit()
    return mutated


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Clear the offending FK on each violator and re-audit.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        total, violations = _scan(db)

        if not violations:
            print(f"OK: scanned {total} work items, 0 hierarchy violations.")
            return 0

        print(f"FOUND {len(violations)} hierarchy violation(s) across {total} work items:\n")
        _print_violations(violations)

        if not args.fix:
            print("\nRun with --fix to clear the offending FKs.")
            return 1

        print(f"\nApplying --fix to {len(violations)} violator(s):")
        mutated = _fix(db, violations)
        print(f"Mutated {mutated} row(s). Re-auditing…\n")

        _, remaining = _scan(db)
        if not remaining:
            print(f"OK: scanned {total} work items, 0 hierarchy violations.")
            return 0

        print(f"WARNING: {len(remaining)} violation(s) remain after --fix:\n")
        _print_violations(remaining)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
