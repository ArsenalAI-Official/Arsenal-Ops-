"""
Migration script to add performance indexes on work_items.

Adds three indexes used by hot-path queries:
  * idx_workitem_reporter      (reporter_id)
  * idx_workitem_proj_sprint   (project_id, sprint_id)
  * idx_workitem_updated       (updated_at)

Idempotent — uses CREATE INDEX IF NOT EXISTS so it can be run safely on every
deploy. Both SQLite and Postgres support IF NOT EXISTS for CREATE INDEX.

Run once against the target database (SQLite or Postgres).
"""
import sys

sys.path.append(".")

from sqlalchemy import create_engine, text

from database import DATABASE_URL

INDEXES = [
    ("idx_workitem_reporter", "work_items (reporter_id)"),
    ("idx_workitem_proj_sprint", "work_items (project_id, sprint_id)"),
    ("idx_workitem_updated", "work_items (updated_at)"),
]


def migrate():
    print("Connecting to database...")
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL not set")
    engine = create_engine(DATABASE_URL)

    with engine.connect() as conn:
        for index_name, target in INDEXES:
            print(f"Creating index {index_name} on {target} if not exists...")
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {target}")
            )
        conn.commit()
        print("Perf indexes migration completed successfully.")


if __name__ == "__main__":
    migrate()
