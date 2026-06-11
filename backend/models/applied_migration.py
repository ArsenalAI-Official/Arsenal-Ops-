"""AppliedMigration model — tracks which one-shot data migrations have run.

Used by data-shaped migrations in `database.py` (e.g. cap backfills after a
read/write split) so they run exactly once per database, then never again.

Why not Alembic?  This codebase already ships a hand-rolled migration story
in `database.py:run_migrations()` and idempotent seeders in `seed_rbac()`.
Schema migrations (ALTER TABLE) live there. This table is purely for
**data-shaped** one-shots that need to keep their hands off the row set
after the first successful run — typically because they'd otherwise
override deliberate admin customizations.

Pattern:
    db = SessionLocal()
    try:
        if not mark_migration_applied("backfill_X_v1", db):
            return            # already applied; nothing to do
        # ... do the one-shot work ...
        # marker is committed inside the helper before any failure points;
        # the migration body itself MUST be idempotent so that a crash
        # after the marker is set is safe to recover from on next boot.
    finally:
        db.close()

Naming: include a `_vN` suffix so a future revision of the same migration
can bump the version and re-run. Keep `_v1` markers in place forever.
"""

import sys
from datetime import datetime

from sqlalchemy import Column, DateTime, String

sys.path.append("..")
from database import Base


class AppliedMigration(Base):
    __tablename__ = "applied_migrations"

    # Migration name is the natural primary key. One row per migration ever
    # run against this database. No deletes — the row IS the "applied" flag.
    name = Column(String(255), primary_key=True)
    # When the migration was first applied. Not used by the gate logic but
    # invaluable for forensic "when did this DB get backfilled?" questions.
    applied_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<AppliedMigration name={self.name!r} applied_at={self.applied_at}>"
