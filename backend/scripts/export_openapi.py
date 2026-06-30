"""Dump the FastAPI app's OpenAPI schema to backend/openapi.json.

This is the single source of truth the frontend generates TypeScript types from
(via @hey-api/openapi-ts). It runs STATICALLY — importing `main.app` does not
open a DB connection or start the server (the SQLAlchemy engine is created
lazily and startup hooks only fire under uvicorn), so this works in CI with just
`pip install -r requirements.txt` and no database.

Output is sorted + 2-space indented so the committed snapshot diffs cleanly.

Usage:
    python scripts/export_openapi.py            # writes backend/openapi.json
    python scripts/export_openapi.py --check     # exit 1 if the file is stale
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Ensure `import main` resolves when run from anywhere (e.g. CI, or app/).
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# routers.auth now refuses to import without a real SECRET_KEY (fail-closed
# against the hardcoded-default JWT-forgery vuln). This export only introspects
# routes to build the schema — it never serves traffic or signs tokens — so a
# harmless build-only placeholder is fine here. setdefault preserves any real
# value the environment already provides.
os.environ.setdefault("SECRET_KEY", "openapi-export-build-only-not-a-real-secret")

OUTPUT = BACKEND_DIR / "openapi.json"


def render() -> str:
    from main import app

    schema = app.openapi()
    return json.dumps(schema, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit non-zero if openapi.json is out of date instead of writing it.",
    )
    args = parser.parse_args()

    rendered = render()

    if args.check:
        current = OUTPUT.read_text() if OUTPUT.exists() else ""
        if current != rendered:
            print(
                "openapi.json is stale — run `python scripts/export_openapi.py` "
                "and commit the result.",
                file=sys.stderr,
            )
            return 1
        print("openapi.json is up to date.")
        return 0

    OUTPUT.write_text(rendered)
    print(f"Wrote {OUTPUT.relative_to(BACKEND_DIR.parent)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
