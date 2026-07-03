"""Project key-prefix helpers.

A project's ``key_prefix`` is the short token that leads every work-item key
(``ASSE-42``). It must be unique per project so keys are globally distinct
across projects (see the #25 audit ticket — previously every project shared the
``PROJ`` default because the create endpoint wrote the prefix into the wrong
column).

These are pure string helpers with no DB or ORM dependency, so both the request
handlers (``routers/projects.py``) and the startup backfill migration
(``database.py``) can import them without a circular import. The DB-aware
"generate a prefix that isn't already taken" logic lives in ``routers/projects.py``
where a ``Session`` is available.
"""

import re

# key_prefix column is VARCHAR(10); keep derived bases short enough to leave
# room for a numeric dedup suffix.
MAX_PREFIX_LEN = 10
DEFAULT_BASE_LEN = 4
FALLBACK_PREFIX = "PROJ"


def normalize_prefix(raw: str | None, max_len: int = MAX_PREFIX_LEN) -> str:
    """Strip a user-supplied prefix down to ``[A-Z0-9]`` uppercase, capped length.

    Returns "" when nothing usable remains — callers decide whether that's a
    validation error (explicit input) or a signal to auto-derive (omitted input).
    """
    return re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()[:max_len]


def derive_prefix_base(name: str | None, max_len: int = DEFAULT_BASE_LEN) -> str:
    """Derive a prefix base from a project name.

    ``"AssemBuild — Pre-proj"`` → ``"ASSE"``. Mirrors the long-standing
    ``seed_project_board`` behaviour (``name[:4].upper()``) but strips
    non-alphanumerics first so punctuation/spaces don't leak into the key.
    Falls back to ``PROJ`` for empty/symbol-only names.
    """
    return normalize_prefix(name, max_len) or FALLBACK_PREFIX
