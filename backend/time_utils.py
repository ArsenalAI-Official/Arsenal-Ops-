"""Small time helpers for the backend.

Every ``DateTime`` column in the models is timezone-*naive* and historically
defaulted to ``datetime.utcnow`` (naive UTC). ``datetime.datetime.utcnow()`` is
deprecated as of Python 3.12, but its aware replacement
``datetime.now(timezone.utc)`` returns a tz-*aware* value that raises
``TypeError`` the moment it is compared with the naive datetimes we load from
those columns.

``utcnow`` is the drop-in replacement that preserves the existing contract: the
current UTC time as a *naive* datetime, so it stays comparable with, and
storable in, the naive columns — while no longer calling the deprecated API.
"""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Return the current UTC time as a naive ``datetime`` (no ``tzinfo``)."""
    return datetime.now(UTC).replace(tzinfo=None)
