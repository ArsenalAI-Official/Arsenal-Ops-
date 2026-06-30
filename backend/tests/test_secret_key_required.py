"""The app must refuse to start without a real SECRET_KEY.

`routers/auth.py` reads SECRET_KEY at import time and raises if it is unset or
left at the legacy hardcoded default — closing the JWT-forgery hole where the
publicly-known default key let anyone mint a token for any user.

These run in a clean subprocess: a raw `python -c "import routers.auth"` does
NOT load conftest / .env.test, so the import-time guard is exercised directly.
The normal pytest suite is unaffected because conftest loads .env.test (which
sets a real SECRET_KEY) before importing the app.
"""

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
LEGACY_DEFAULT_SECRET = "your-secret-key-change-in-production"


def _import_auth_with_env(env_overrides: dict[str, str]) -> subprocess.CompletedProcess:
    """Import routers.auth in a subprocess with a controlled environment."""
    env = {"PATH": os.environ.get("PATH", "")}
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "-c", "import routers.auth"],
        cwd=str(BACKEND_DIR),
        env=env,
        capture_output=True,
        text=True,
    )


def test_refuses_to_start_without_secret():
    result = _import_auth_with_env({})  # SECRET_KEY unset
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_refuses_legacy_default_secret():
    result = _import_auth_with_env({"SECRET_KEY": LEGACY_DEFAULT_SECRET})
    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_starts_with_real_secret():
    result = _import_auth_with_env({"SECRET_KEY": "a-real-non-default-secret"})
    assert result.returncode == 0, result.stderr
