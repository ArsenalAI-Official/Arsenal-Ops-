"""Migration script to add the ``project_pulse_overrides`` table.

Stores the editorial subset of Pulse-view data (narrative, ledger,
risks, monthly cost categories, billing inputs, milestone budgets) so
it lives as a property of the project rather than per-browser
localStorage. One row per project — ``project_id`` is the primary key.

Idempotent — uses ``CREATE TABLE IF NOT EXISTS`` so this is safe to
run on every deploy. Works on both SQLite (productmind.db) and
Postgres.

Run once against the target database:

    python backend/migrate_add_pulse_overrides.py
"""

import sys

sys.path.append(".")

from sqlalchemy import create_engine, text

from database import DATABASE_URL


def migrate():
    print("Connecting to database...")
    engine = create_engine(DATABASE_URL)

    # engine.begin() opens a transaction that auto-commits on success and
    # rolls back on exception. This gives consistent cross-dialect behavior:
    # on Postgres the whole DDL block is atomic, and on SQLite we avoid the
    # partial-progress footgun where CREATE TABLE persists but a later
    # statement fails.
    with engine.begin() as conn:
        print("Creating project_pulse_overrides table if not exists...")
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS project_pulse_overrides (
                    project_id INTEGER PRIMARY KEY,
                    data JSON NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_by_user_id INTEGER,
                    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
                    FOREIGN KEY (updated_by_user_id) REFERENCES users (id) ON DELETE SET NULL
                )
                """
            )
        )
        print("Pulse overrides migration completed successfully.")


if __name__ == "__main__":
    migrate()
