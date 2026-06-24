"""Add positioned calendar blocks + fractional hours to time tracking.

The week-calendar feature logs work by drawing/dragging time blocks. Two schema
changes back it:

1. ``time_entries`` gains nullable ``start_time`` / ``end_time`` (UTC). A row with
   these set is a positioned block that renders at an exact day + time-of-day;
   rows without them are legacy/quick-log entries shown in an "unscheduled" tray.
2. Hours become fractional (15/30-min blocks → 0.25 / 0.5 hours). We widen
   ``time_entries.hours`` and ``work_items.{logged,estimated,remaining}_hours``
   from INTEGER to NUMERIC so sums of fractional entries stay exact.

On Postgres: ``ALTER COLUMN ... TYPE NUMERIC`` converts losslessly (existing
integer values become e.g. 4 → 4.00), but it is NOT a metadata-only change like
VARCHAR→TEXT — it rewrites the whole table under an ACCESS EXCLUSIVE lock. That's
fine at current scale (seconds) but blocks reads/writes for the duration, so be
deliberate running it against a large table. ``ADD COLUMN`` for nullable columns
is non-blocking. On SQLite column types aren't enforced (it already stores floats
fine), so only the ADD COLUMN steps run there.

Idempotent — safe to run repeatedly. NOTE: ``database.run_migrations()`` now
applies the same changes on startup for existing databases; this standalone
script remains for manual/out-of-band runs and as the documented record.

Usage:
    cd backend
    python migrate_add_calendar_time_blocks.py
"""

import sys

sys.path.append(".")

from sqlalchemy import create_engine, inspect, text

from database import DATABASE_URL

# (table, column) → target Postgres type for the int→fractional widening.
NUMERIC_COLUMNS = [
    ("time_entries", "hours", "NUMERIC(6,2)"),
    ("work_items", "logged_hours", "NUMERIC(7,2)"),
    ("work_items", "estimated_hours", "NUMERIC(7,2)"),
    ("work_items", "remaining_hours", "NUMERIC(7,2)"),
]

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
    is_sqlite = DATABASE_URL.startswith("sqlite")
    changed = False

    with engine.begin() as conn:
        existing_tables = set(inspect(conn).get_table_names())

        # 1. Add the positioned-block columns (both engines).
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

        # 2. Widen hours columns to NUMERIC (Postgres only; SQLite is typeless).
        if is_sqlite:
            print(
                "SQLite detected — column types aren't enforced; hours are already fractional-safe."
            )
            return changed

        for table, column, target_type in NUMERIC_COLUMNS:
            if table not in existing_tables:
                continue
            row = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_name = :t AND column_name = :c"
                ),
                {"t": table, "c": column},
            ).fetchone()
            if row is None:
                print(f"  {table}.{column} not found — skipping widen.")
                continue
            if row[0] == "numeric":
                print(f"  {table}.{column} is already NUMERIC. Skipping.")
                continue
            print(f"  Widening {table}.{column}: {row[0]} -> {target_type}...")
            conn.execute(
                text(
                    f"ALTER TABLE {table} ALTER COLUMN {column} "
                    f"TYPE {target_type} USING {column}::numeric"
                )
            )
            changed = True

    return changed


if __name__ == "__main__":
    changed = migrate()
    print("Migration applied." if changed else "No changes needed.")
