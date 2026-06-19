"""
Migration script to add last_assigned_at column to work_items table.

Used by the transfer-aware capacity calculation: the column is set on create
and on every assignee_id change, so the new assignee's capacity counts only
remaining hours (not the original full estimate).

Run this once against the target database (SQLite or Postgres).
"""
import os
import sys
sys.path.append('.')

from sqlalchemy import create_engine, text
from database import DATABASE_URL


def migrate():
    print("Connecting to database...")
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL not set")
    engine = create_engine(DATABASE_URL)
    is_sqlite = DATABASE_URL.startswith("sqlite")

    with engine.connect() as conn:
        if is_sqlite:
            # SQLite: pragma_table_info to check for column
            cols = conn.execute(text("PRAGMA table_info(work_items)")).fetchall()
            if any(c[1] == "last_assigned_at" for c in cols):
                print("Column 'last_assigned_at' already exists. Skipping.")
                return
        else:
            # Postgres
            result = conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'work_items' AND column_name = 'last_assigned_at'"
            ))
            if result.fetchone():
                print("Column 'last_assigned_at' already exists. Skipping.")
                return

        print("Adding 'last_assigned_at' column to work_items...")
        conn.execute(text("ALTER TABLE work_items ADD COLUMN last_assigned_at TIMESTAMP"))

        # Backfill: for rows that already have an assignee, seed last_assigned_at
        # from started_at (if set) or created_at — so existing tickets are not
        # treated as "freshly transferred this week".
        print("Backfilling last_assigned_at for existing rows...")
        conn.execute(text(
            "UPDATE work_items "
            "SET last_assigned_at = COALESCE(started_at, created_at) "
            "WHERE assignee_id IS NOT NULL AND last_assigned_at IS NULL"
        ))
        conn.commit()
        print("Migration completed successfully.")


if __name__ == "__main__":
    migrate()
