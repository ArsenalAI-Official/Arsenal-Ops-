"""Add positioned calendar blocks to time tracking.

The week-calendar feature logs work by drawing/dragging time blocks. The schema
change backing it: ``time_entries`` gains nullable ``start_time`` / ``end_time``
(UTC). A row with these set is a positioned block that renders at an exact day +
time-of-day; rows without them are legacy/quick-log entries shown in an
"unscheduled" tray. ``ADD COLUMN`` for nullable columns is non-blocking on both
Postgres and SQLite.

NOTE: hours stay INTEGER (whole-hour blocks). Widening the hours columns to
NUMERIC for fractional 15/30-min blocks is a stacked follow-up
(feat/week-calendar-minutes) pending app-wide review.

Idempotent — safe to run repeatedly. NOTE: ``database.run_migrations()`` now
applies the same change on startup for existing databases; this standalone
script remains for manual/out-of-band runs and as the documented record.

Usage:
    cd backend
    python migrate_add_calendar_time_blocks.py
"""

import sys

sys.path.append(".")

from sqlalchemy import create_engine, inspect, text

from database import DATABASE_URL

# (table, column, SQL type) → nullable columns to add on both engines.
NEW_COLUMNS = [
    ("time_entries", "start_time", "TIMESTAMP"),
    ("time_entries", "end_time", "TIMESTAMP"),
]


def _existing_columns(conn, table: str) -> set[str]:
    return {col["name"] for col in inspect(conn).get_columns(table)}


def migrate() -> bool:
    print("Connecting to database...")
    engine = create_engine(DATABASE_URL)
    changed = False

    with engine.begin() as conn:
        existing_tables = set(inspect(conn).get_table_names())

        # Add the positioned-block columns (both engines).
        for table, column, sql_type in NEW_COLUMNS:
            if table not in existing_tables:
                print(f"  {table} does not exist yet — skipping {column}.")
                continue
            if column in _existing_columns(conn, table):
                print(f"  {table}.{column} already exists. Skipping.")
                continue
            print(f"  Adding {table}.{column} ({sql_type})...")
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}"))
            changed = True

        # Index start_time for the "blocks in this week" query.
        if "time_entries" in existing_tables:
            idx_names = {ix["name"] for ix in inspect(conn).get_indexes("time_entries")}
            if "idx_time_entry_start_time" not in idx_names:
                print("  Creating index idx_time_entry_start_time...")
                conn.execute(
                    text("CREATE INDEX idx_time_entry_start_time ON time_entries(start_time)")
                )
                changed = True

    return changed


if __name__ == "__main__":
    changed = migrate()
    print("Migration applied." if changed else "No changes needed.")
