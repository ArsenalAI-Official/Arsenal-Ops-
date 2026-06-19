#!/usr/bin/env python3
"""
Seed script: populates a realistic project board with placeholder data.
Usage:
    python seed_project_board.py --email you@example.com          # SSO/Google accounts (no password needed)
    python seed_project_board.py --email you@example.com --items 120
    python seed_project_board.py --email you@example.com --project-id 5  # add to existing project
"""

import argparse
import base64
import hashlib
import hmac
import json
import random
import subprocess
import sys
from datetime import UTC, datetime, timedelta
from typing import Any

import requests

BASE_URL = "http://localhost:8000"
_SECRET = b"your-secret-key-change-in-production"
DOCKER_CONTAINER = "arsenal-ops-db"
DOCKER_DB = "arsenalops"
DOCKER_USER = "arsenalops"

# ── Realistic fake data ────────────────────────────────────────────────────────

EPIC_TITLES = [
    "User Authentication & SSO",
    "Dashboard & Analytics",
    "Notification System",
    "API Rate Limiting",
    "Mobile Responsive Design",
    "Search & Filtering",
    "Billing & Subscriptions",
    "Developer Integrations",
]

STORY_TEMPLATES = [
    "As a {role}, I want to {action} so that {benefit}",
]

ROLES = ["PM", "developer", "admin", "end user", "stakeholder", "reviewer"]

ACTIONS_BENEFITS = [
    ("view all active sprints on one screen", "I can track team progress at a glance"),
    ("filter work items by assignee", "I can see my personal workload"),
    ("set due dates on tasks", "deadlines are visible to the whole team"),
    ("bulk-update task statuses", "sprint ceremonies take less time"),
    ("attach files to tickets", "context stays with the work item"),
    ("link work items to epics", "rollup reporting is accurate"),
    ("search across all projects", "I can find any ticket quickly"),
    ("export the board to CSV", "stakeholders can review progress offline"),
    ("receive email digests", "I stay updated without checking the app constantly"),
    ("add comments with mentions", "the right people are looped in automatically"),
    ("define acceptance criteria inline", "devs know exactly when a story is done"),
    ("create sub-tasks under stories", "complex work is broken into trackable pieces"),
    ("set story points via drag", "estimation meetings are faster"),
    ("archive completed sprints", "the board stays focused on current work"),
    ("view a burndown chart", "the team can self-correct mid-sprint"),
    ("configure custom statuses", "our workflow matches the board"),
    ("assign multiple tags to tickets", "cross-cutting concerns are discoverable"),
    ("log time directly on tasks", "I can see remaining capacity in real time"),
    ("duplicate an existing ticket", "repeat tasks don't need to be recreated from scratch"),
    ("mark a task as blocked", "impediments are surfaced to the PM immediately"),
]

BUG_TITLES = [
    "Sprint filter resets on page refresh",
    "Assignee dropdown shows deleted users",
    "Story points don't save when Epic is selected",
    "Date picker ignores timezone offset",
    "Drag-and-drop fails on Firefox 125",
    "Search returns stale cached results",
    "Bulk status update only applies to first 10 items",
    "Notification badge shows wrong count after mark-all-read",
    "CSV export truncates descriptions over 200 chars",
    "Board column scroll breaks on Safari iOS",
    "Task creation modal freezes if title exceeds 255 chars",
    "Tag autocomplete shows duplicates",
    "Logged hours round to nearest hour instead of minute",
    "Comment mentions don't trigger email when @all is used",
    "Burndown chart Y-axis starts at wrong baseline",
]

TASK_TITLES = [
    "Write unit tests for sprint service",
    "Refactor auth middleware to use dependency injection",
    "Add pagination to work items list endpoint",
    "Set up Sentry error tracking",
    "Create Dockerfile for production image",
    "Document REST API with OpenAPI spec",
    "Implement Redis caching for dashboard queries",
    "Add database indices for work_item status+sprint_id",
    "Configure GitHub Actions CI pipeline",
    "Migrate remaining raw SQL to SQLAlchemy ORM",
    "Add request logging middleware",
    "Write Cypress E2E tests for board drag-and-drop",
    "Profile slow sprint load query",
    "Upgrade FastAPI to latest version",
    "Implement soft-delete for work items",
    "Add rate limiting to AI generation endpoint",
    "Set up pre-commit hooks",
    "Create dev seed script (this one!)",
    "Audit and remove unused frontend dependencies",
    "Add dark mode support to ProjectBoard",
]

PRIORITIES = ["low", "medium", "high", "critical"]
PRIORITY_WEIGHTS = [0.15, 0.45, 0.30, 0.10]

STATUSES = ["todo", "in_progress", "in_review", "done"]
STATUS_WEIGHTS = [0.35, 0.25, 0.15, 0.25]

TAGS_POOL = [
    "frontend",
    "backend",
    "api",
    "database",
    "auth",
    "ui",
    "performance",
    "security",
    "testing",
    "docs",
    "infra",
    "mobile",
]

SPRINT_NAMES = ["Sprint 1 — Foundation", "Sprint 2 — Core Features", "Sprint 3 — Polish & Launch"]

# ── Helpers ────────────────────────────────────────────────────────────────────


def _mint_token(user_id: int) -> str:
    """Mint a HS256 JWT using stdlib only — no jose dependency."""

    def b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    exp = int((datetime.now(UTC) + timedelta(hours=24)).timestamp())
    payload = b64url(json.dumps({"sub": str(user_id), "exp": exp}).encode())
    signing_input = f"{header}.{payload}".encode()
    sig = b64url(hmac.new(_SECRET, signing_input, hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def login(email: str) -> str:
    sql = f"SELECT id FROM users WHERE email='{email}' LIMIT 1;"
    result = subprocess.run(
        [
            "docker",
            "exec",
            DOCKER_CONTAINER,
            "psql",
            "-U",
            DOCKER_USER,
            "-d",
            DOCKER_DB,
            "-t",
            "-c",
            sql,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        sys.exit(
            f"[auth] docker exec failed: {result.stderr.strip()}\nIs the stack running? Try: docker compose up -d"
        )
    user_id_str = result.stdout.strip()
    if not user_id_str:
        sys.exit(f"[auth] no user found with email {email!r} in the database")
    user_id = int(user_id_str)
    token = _mint_token(user_id)
    print(f"[auth] minted token for {email} (user id={user_id})")
    return token


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_project(token: str, name: str) -> dict:
    payload = {
        "name": name,
        "description": "Auto-generated seed project for load testing the project board UI at scale.",
        "key_prefix": name[:4].upper().replace(" ", ""),
    }
    resp = requests.post(f"{BASE_URL}/api/projects/", json=payload, headers=headers(token))
    resp.raise_for_status()
    project = resp.json()
    print(f"[project] created '{project['name']}' id={project['id']}")
    return project


def get_project(token: str, project_id: int) -> dict:
    resp = requests.get(f"{BASE_URL}/api/projects/{project_id}", headers=headers(token))
    resp.raise_for_status()
    return resp.json()


def create_sprint(token: str, project_id: int, name: str, offset_weeks: int) -> dict:
    start = datetime.now() + timedelta(weeks=offset_weeks)
    end = start + timedelta(weeks=2)
    payload: dict[str, Any] = {
        "name": name,
        "project_id": project_id,
        "goal": f"Deliver the key deliverables for {name}.",
        "start_date": start.strftime("%Y-%m-%d"),
        "end_date": end.strftime("%Y-%m-%d"),
    }
    resp = requests.post(f"{BASE_URL}/api/workitems/sprints", json=payload, headers=headers(token))
    resp.raise_for_status()
    sprint = resp.json()
    print(f"  [sprint] '{sprint['name']}' id={sprint['id']}")
    return sprint


def create_work_item(token: str, payload: dict) -> dict:
    resp = requests.post(f"{BASE_URL}/api/workitems/", json=payload, headers=headers(token))
    resp.raise_for_status()
    return resp.json()


def pick(lst, weights=None):
    return random.choices(lst, weights=weights, k=1)[0]


def random_tags():
    return random.sample(TAGS_POOL, k=random.randint(0, 3))


def random_dates():
    start = datetime.now() - timedelta(days=random.randint(0, 14))
    due = start + timedelta(days=random.randint(3, 21))
    return start.strftime("%Y-%m-%d"), due.strftime("%Y-%m-%d")


# ── Main seeding logic ─────────────────────────────────────────────────────────


def seed(token: str, project_id: int, sprint_ids: list[int], target_items: int):
    created = 0

    # 1. Epics (no sprint, no parent)
    epic_count = min(len(EPIC_TITLES), max(4, target_items // 15))
    epic_ids = []
    epic_titles_used = random.sample(EPIC_TITLES, k=epic_count)
    for title in epic_titles_used:
        item = create_work_item(
            token,
            {
                "type": "epic",
                "title": title,
                "description": f"Epic covering all work related to: {title.lower()}.",
                "status": pick(["todo", "in_progress", "done"], [0.3, 0.5, 0.2]),
                "priority": pick(PRIORITIES, PRIORITY_WEIGHTS),
                "project_id": project_id,
                "story_points": random.choice([0, 13, 21, 34]),
                "tags": random_tags(),
            },
        )
        epic_ids.append(item["id"])
        created += 1
        print(f"    epic  [{created:>3}/{target_items}] {item['key']} – {title}")

    # 2. Stories
    story_count = max(8, target_items * 40 // 100)
    story_pool = list(ACTIONS_BENEFITS) * ((story_count // len(ACTIONS_BENEFITS)) + 1)
    random.shuffle(story_pool)
    story_ids = []
    for i in range(story_count):
        if created >= target_items:
            break
        action, benefit = story_pool[i]
        role = pick(ROLES)
        title = f"As a {role}, I want to {action} so that {benefit}"
        start_date, due_date = random_dates()
        item = create_work_item(
            token,
            {
                "type": "user_story",
                "title": title[:255],
                "description": "Acceptance criteria will be defined during sprint planning.",
                "status": pick(STATUSES, STATUS_WEIGHTS),
                "priority": pick(PRIORITIES, PRIORITY_WEIGHTS),
                "project_id": project_id,
                "sprint_id": pick([*sprint_ids, None], [0.3, 0.3, 0.3, 0.1]),
                "epic_id": pick([*epic_ids, None], [0.7] * len(epic_ids) + [0.3 * len(epic_ids)]),
                "story_points": random.choice([1, 2, 3, 5, 8, 13]),
                "estimated_hours": random.randint(2, 16),
                "remaining_hours": random.randint(0, 12),
                "tags": random_tags(),
                "start_date": start_date,
                "due_date": due_date,
            },
        )
        story_ids.append(item["id"])
        created += 1
        if created % 10 == 0:
            print(f"    story [{created:>3}/{target_items}] {item['key']}")

    # 3. Tasks
    task_count = max(8, target_items * 35 // 100)
    task_pool = list(TASK_TITLES) * ((task_count // len(TASK_TITLES)) + 1)
    random.shuffle(task_pool)
    for i in range(task_count):
        if created >= target_items:
            break
        title = task_pool[i]
        if i > len(TASK_TITLES) - 1:
            title = f"{title} (variant {i // len(TASK_TITLES) + 1})"
        start_date, due_date = random_dates()
        parent_id = (
            pick([*story_ids, None], [0.6] * len(story_ids) + [0.4 * len(story_ids)])
            if story_ids
            else None
        )
        item = create_work_item(
            token,
            {
                "type": "task",
                "title": title[:255],
                "description": "Technical implementation task.",
                "status": pick(STATUSES, STATUS_WEIGHTS),
                "priority": pick(PRIORITIES, PRIORITY_WEIGHTS),
                "project_id": project_id,
                "sprint_id": pick([*sprint_ids, None], [0.35, 0.35, 0.25, 0.05]),
                "parent_id": parent_id,
                "story_points": random.choice([0, 1, 2, 3]),
                "estimated_hours": random.randint(1, 8),
                "remaining_hours": random.randint(0, 6),
                "tags": random_tags(),
                "start_date": start_date,
                "due_date": due_date,
            },
        )
        created += 1
        if created % 10 == 0:
            print(f"    task  [{created:>3}/{target_items}] {item['key']}")

    # 4. Bugs
    bug_count = target_items - created
    bug_pool = list(BUG_TITLES) * ((bug_count // len(BUG_TITLES)) + 1)
    random.shuffle(bug_pool)
    for i in range(bug_count):
        if created >= target_items:
            break
        title = bug_pool[i]
        if i >= len(BUG_TITLES):
            title = f"{title} (repro {i // len(BUG_TITLES) + 1})"
        item = create_work_item(
            token,
            {
                "type": "bug",
                "title": title[:255],
                "description": "Reported by QA. Needs triage.",
                "status": pick(
                    ["todo", "in_progress", "in_review", "done"], [0.4, 0.25, 0.15, 0.2]
                ),
                "priority": pick(PRIORITIES, [0.1, 0.3, 0.4, 0.2]),
                "project_id": project_id,
                "sprint_id": pick([*sprint_ids, None], [0.3, 0.3, 0.2, 0.2]),
                "story_points": random.choice([0, 1, 2]),
                "estimated_hours": random.randint(1, 4),
                "tags": [*random_tags(), "bug"],
            },
        )
        created += 1
        if created % 10 == 0:
            print(f"    bug   [{created:>3}/{target_items}] {item['key']}")

    return created


def main():
    parser = argparse.ArgumentParser(description="Seed project board with placeholder data")
    parser.add_argument(
        "--email", required=True, help="Your login email (Google SSO — no password needed)"
    )
    parser.add_argument(
        "--items", type=int, default=60, help="Total work items to create (default: 60)"
    )
    parser.add_argument(
        "--project-id",
        type=int,
        default=None,
        help="Add to existing project instead of creating one",
    )
    parser.add_argument(
        "--project-name", default="Seed Project — Board Scale Test", help="Name for new project"
    )
    args = parser.parse_args()

    token = login(args.email)

    if args.project_id:
        project = get_project(token, args.project_id)
        project_id = project["id"]
        print(f"[project] using existing project '{project['name']}' id={project_id}")
        sprint_ids = []
    else:
        project = create_project(token, args.project_name)
        project_id = project["id"]
        print("[sprints] creating 3 sprints...")
        sprint_ids = [
            create_sprint(token, project_id, name, offset)["id"]
            for offset, name in enumerate(SPRINT_NAMES)
        ]

    print(f"[seed] creating {args.items} work items...")
    total = seed(token, project_id, sprint_ids, args.items)
    print(f"\n[done] created {total} work items in project id={project_id}")
    print(f"       open: http://localhost:5173/projects/{project_id}/board")


if __name__ == "__main__":
    main()
