"""Widen activity_logs.title from VARCHAR(255) to TEXT.

Several callers build the activity title as
    f"Completed PROJ-X: {item.title}"
and work_item titles can carry long-form acceptance criteria. On PROJ-345 the
generated string exceeded 255 chars and Postgres rejected the INSERT with
`value too long for type character varying(255)`. That broke every "mark done"
status change on long-titled tickets (returned 500 from PUT /api/workitems/{id}).

TEXT in Postgres has no length cap and the same on-disk format as VARCHAR
beyond the toast threshold — no perf cost. On SQLite, VARCHAR length isn't
enforced anyway, so this is a no-op there.

Idempotent — safe to run repeatedly. Re-running after a successful migration
finds the column already TEXT and exits.

Usage:
    cd backend
    python migrate_widen_activity_log_title.py
"""
import sys

sys.path.append(".")

from sqlalchemy import create_engine, text

from database import DATABASE_URL


def migrate() -> bool:
    """Returns True if a change was applied, False if already TEXT / SQLite."""
    print("Connecting to database...")
    engine = create_engine(DATABASE_URL)
    is_sqlite = DATABASE_URL.startswith("sqlite")

    if is_sqlite:
        # SQLite doesn't enforce VARCHAR length, so this migration is a no-op there.
        print("SQLite detected — VARCHAR length is not enforced; nothing to do.")
        return False

    with engine.begin() as conn:
        row = conn.execute(
            text(
                "SELECT data_type, character_maximum_length "
                "FROM information_schema.columns "
                "WHERE table_name = 'activity_logs' AND column_name = 'title'"
            )
        ).fetchone()

        if row is None:
            print("activity_logs.title column not found — nothing to migrate.")
            return False

        data_type, max_len = row
        print(f"Current type: {data_type}({max_len})")

        if data_type == "text":
            print("activity_logs.title is already TEXT. Skipping.")
            return False

        print("Altering activity_logs.title -> TEXT...")
        # ALTER COLUMN TYPE TEXT from VARCHAR(N) is a metadata-only change in
        # Postgres when the existing data fits, so it's near-instant even on
        # large tables. No data loss; existing rows keep their values.
        conn.execute(text("ALTER TABLE activity_logs ALTER COLUMN title TYPE TEXT"))
        print("Done.")
        return True


if __name__ == "__main__":
    changed = migrate()
    print("Migration applied." if changed else "No changes needed.")
