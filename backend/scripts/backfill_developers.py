"""
Backfill Developer rows for active Users.

This logic used to run on every GET /api/admin/stats request which made the
dashboard hot path write to the DB. It has been extracted here so it can be
run once at deploy time (or whenever a new Developer row needs to exist for
each active User).

Run from the backend/ directory:

    python scripts/backfill_developers.py

Idempotent: only creates a Developer row when none exists for a given email.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Make the parent backend/ package importable regardless of CWD
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("backfill_developers")


def backfill() -> int:
    """Create a Developer row for every active User without one.

    Returns:
        Number of Developer rows created.
    """
    # Import every model module so every SQLAlchemy mapper is registered
    # before the first query runs. Without this, lazy relationships (e.g.
    # Project.architectures -> Architecture) fail with InvalidRequestError
    # because the target class is unknown to the registry.
    import models  # noqa: F401
    from database import SessionLocal, run_migrations
    from models import architecture as _architecture  # noqa: F401
    from models import project as _project  # noqa: F401
    from models import user as _user  # noqa: F401
    from models.developer import Developer
    from models.user import User

    # Apply pending schema migrations BEFORE any model query runs. On Render
    # this script runs as a pre-deploy hook, ahead of app startup (which is
    # where run_migrations would normally fire via init_db). Without this,
    # newly-added columns (e.g. developers.is_external) cause every Developer
    # query in this script to blow up with UndefinedColumn until the next
    # deploy. Calling run_migrations here makes the pre-deploy self-healing.
    run_migrations()

    created = 0
    session = SessionLocal()
    try:
        users = session.query(User).filter(User.is_active.is_(True)).all()
        logger.info("Scanning %d active users for missing Developer rows", len(users))

        for user in users:
            if not user.email:
                logger.warning("Skipping user id=%s with no email", user.id)
                continue

            existing = session.query(Developer).filter(Developer.email == user.email).first()
            if existing:
                continue

            session.add(Developer(name=user.name, email=user.email))
            created += 1
            logger.info("Created Developer row for user %s <%s>", user.name, user.email)

        if created:
            session.commit()
            logger.info("Committed %d new Developer rows", created)
        else:
            logger.info("No Developer rows needed")
    except Exception:
        session.rollback()
        logger.exception("Backfill failed; rolled back")
        raise
    finally:
        session.close()

    return created


if __name__ == "__main__":
    try:
        n = backfill()
    except Exception:  # pragma: no cover - logged above
        sys.exit(1)

    logger.info("Backfill complete: %d new Developer row(s)", n)
    sys.exit(0)
