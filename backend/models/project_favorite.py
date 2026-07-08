"""Project favorites - per-user starred projects.

A user↔project many-to-many so each user's favorites are private. Created by
``Base.metadata.create_all`` on startup (no ALTER needed — it's a brand-new
table).

The FKs declare ON DELETE CASCADE, but note it only fires where the database
enforces foreign keys: Postgres (prod) does; SQLite (local/dev) does NOT unless
``PRAGMA foreign_keys=ON`` is set per-connection, which this app does not set.
So on local SQLite, deleting a user or project can leave orphaned favorite
rows — harmless (they're filtered by the join on read) but not auto-cleaned.
"""

import sys
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Table

sys.path.append("..")
from database import Base

# Association table for the User-Project "favorite" many-to-many relationship.
project_favorites = Table(
    "project_favorites",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow),
)
