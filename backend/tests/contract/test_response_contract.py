"""Response-contract regression tests.

For each high-traffic GET endpoint, hit it through the real FastAPI/HTTP
response pipeline (TestClient → main.app) and assert the JSON body is
byte-for-byte identical to a committed golden file.

This exists to gate adding `response_model=` to these routes: that change can
silently filter fields, and the filtering only happens in the HTTP response
path. Capturing the goldens through TestClient (not direct handler calls) is
therefore mandatory.

Regen mode:
    REGEN_CONTRACT=1 .venv/bin/python -m pytest tests/contract
captures/overwrites every golden instead of asserting.

Verify mode (plain run) asserts each response equals its golden:
    .venv/bin/python -m pytest tests/contract -q
"""

import json
import os
from pathlib import Path

import pytest
from conftest import PROJECT_WITH_DEVS

GOLDEN_DIR = Path(__file__).parent / "golden"
REGEN = os.getenv("REGEN_CONTRACT") == "1"


def _golden_path(slug: str) -> Path:
    return GOLDEN_DIR / f"{slug}.json"


def _check_or_regen(slug: str, payload):
    """In regen mode, write the golden. Otherwise assert payload == golden."""
    path = _golden_path(slug)
    if REGEN:
        GOLDEN_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return
    assert path.exists(), f"Golden file missing: {path}. Run with REGEN_CONTRACT=1 to capture it."
    expected = json.loads(path.read_text(encoding="utf-8"))
    # Compare via canonical JSON so dict key order never matters, mirroring the
    # sort_keys=True serialization used to write the golden.
    assert json.dumps(payload, indent=2, sort_keys=True) == json.dumps(
        expected, indent=2, sort_keys=True
    ), f"Response for '{slug}' changed vs golden {path}"


# (slug, path, query_params)
ENDPOINTS = [
    ("projects_list", "/api/projects/", {}),
    ("projects_detail", f"/api/projects/{PROJECT_WITH_DEVS}", {}),
    ("workitems_list", "/api/workitems/", {"project_id": PROJECT_WITH_DEVS}),
    ("workitems_my_tasks", "/api/workitems/my-tasks", {}),
    ("workitems_detail", "/api/workitems/210", {}),
    ("personal_tasks_list", "/api/personal-tasks/", {}),
]


@pytest.mark.parametrize(("slug", "path", "params"), ENDPOINTS, ids=[e[0] for e in ENDPOINTS])
def test_response_contract(client, slug, path, params):
    resp = client.get(path, params=params)
    assert resp.status_code == 200, f"{path} returned {resp.status_code}: {resp.text[:500]}"
    _check_or_regen(slug, resp.json())
