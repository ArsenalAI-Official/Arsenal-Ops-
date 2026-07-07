"""Per-developer Review-and-Submit timesheet service.

Two responsibilities, both scoped to *one* developer's Mon–Fri window:

  1. :func:`get_my_timesheet` — read the current week's entries grouped
     by QB Customer → Project, plus a separate "unlinked projects"
     bucket for hours on projects without a `workforce_client_id`. The
     dev's Review modal renders this verbatim.

  2. :func:`submit_my_timesheet` — push the dev's eligible entries to
     QuickBooks inline, returning per-entry success/failure. The dev
     clicks Submit; we set ``submitted_at`` on the picked entries, then
     POST each one through :func:`services.workforce_qb_client.post_time_activity`
     (the same call admin force-sync uses). Per-entry failures keep
     ``submitted_at`` set but ``workforce_entry_id`` NULL — the next
     click is a natural retry.

Why this lives next to :mod:`services.workforce_sync` rather than
inside it: the admin force-sync is a *batch* job over all developers,
with a result shape designed for email digests (totals + skip
summary). The dev submit is an *interactive* job for one developer,
with a result shape designed for the modal (per-entry rows + retry
hints). Keeping the two paths separate avoids shoehorning either UX
into the wrong shape, while both paths still share the same QB POST
helper, the same week-window function, and the same advisory lock —
so a dev submit and an admin force-sync can never push the same
TimeEntry concurrently.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy.orm import Session, selectinload

from models.developer import Developer
from models.project import Project
from models.time_entry import TimeEntry
from models.work_item import WorkItem
from models.workforce_integration import WorkforceIntegration
from services.workforce_oauth import WorkforceOAuthError
from services.workforce_qb_client import (
    QBApiError,
    QBRateLimitError,
    fetch_qb_classes,
    fetch_qb_employees,
    post_time_activity,
    resolve_service_item,
)
from services.workforce_sync import (
    _release_advisory_lock,
    _try_advisory_lock,
    build_description,
    current_work_week_window,
    is_sync_in_progress,
)

logger = logging.getLogger(__name__)


# ── GET timesheet ────────────────────────────────────────────────────────


def get_my_timesheet(
    db: Session, developer: Developer, today: date | None = None
) -> dict[str, Any]:
    """Return the developer's Mon–Fri grouped by QB Customer → Project.

    Shape:

        {
          "week_start": "YYYY-MM-DD",
          "week_end":   "YYYY-MM-DD",
          "total_hours": int,                    # sum across both buckets
          "syncable_unsubmitted_count": int,     # how many entries Submit would push
          "clients": [
            {
              "qb_customer_id": str,
              "client_name":    str,
              "subtotal_hours": int,
              "projects": [
                {"project_id", "project_name", "subtotal_hours", "entries": [...]}
              ]
            }, ...
          ],
          "unlinked_projects": [
            {"project_id", "project_name", "subtotal_hours", "entries": [...]}
          ]
        }

    Each entry row: ``{id, logged_at, hours, description, submitted_at, synced}``.

    `synced` is the boolean form of ``workforce_entry_id IS NOT NULL`` —
    the modal uses it to render the "Synced" badge and skip the row in
    the Submit action's UI affordance.

    Empty weeks return ``clients=[]`` and ``unlinked_projects=[]`` with
    counts of zero — the modal renders a "Nothing to submit" empty state.
    """
    window_start, window_end = current_work_week_window(today)
    window_start_dt = datetime.combine(window_start, time.min)
    window_end_dt = datetime.combine(window_end + timedelta(days=1), time.min)

    entries: list[TimeEntry] = (
        db.query(TimeEntry)
        .join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
        .join(Project, WorkItem.project_id == Project.id)
        .filter(
            TimeEntry.developer_id == developer.id,
            TimeEntry.logged_at >= window_start_dt,
            TimeEntry.logged_at < window_end_dt,
        )
        .options(
            selectinload(TimeEntry.work_item)
            .selectinload(WorkItem.project)
            .selectinload(Project.category),
        )
        .order_by(TimeEntry.logged_at.asc(), TimeEntry.id.asc())
        .all()
    )

    # Two grouping passes: one by QB customer for the linked section,
    # one by project for the unlinked section. Building both up at
    # once keeps the response shape easy to validate against the spec.
    clients: dict[str, dict[str, Any]] = {}
    unlinked: dict[int, dict[str, Any]] = {}
    syncable_unsubmitted = 0
    total_hours = 0

    for entry in entries:
        wi = entry.work_item
        project = wi.project if wi else None
        if project is None:
            # Defensive: a deleted project would orphan a work item, but
            # the FK is ON DELETE CASCADE so this should be unreachable.
            # Skip silently rather than crash the page render.
            continue

        hours = int(entry.hours or 0)
        total_hours += hours
        synced = entry.workforce_entry_id is not None
        is_submitted = entry.submitted_at is not None

        # Surface the work-item title alongside the dev-typed description
        # so the modal can fall back to the ticket name when the dev
        # didn't add a free-text note.
        entry_row = {
            "id": entry.id,
            "logged_at": entry.logged_at.date().isoformat() if entry.logged_at else None,
            "hours": hours,
            "description": entry.description,
            "work_item_title": getattr(wi, "title", None) if wi else None,
            "submitted_at": entry.submitted_at.isoformat() if entry.submitted_at else None,
            "synced": synced,
            "billable": bool(entry.billable),
        }

        customer_id = project.workforce_client_id
        if customer_id:
            # Eligible for Submit iff: not submitted, not synced, and on
            # a QB-linked project. Tracked separately so the modal can
            # disable the Submit button when the count is zero.
            if not is_submitted and not synced:
                syncable_unsubmitted += 1

            bucket = clients.get(customer_id)
            if bucket is None:
                bucket = {
                    "qb_customer_id": customer_id,
                    "client_name": project.workforce_client_name or "(unnamed client)",
                    "subtotal_hours": 0,
                    "_projects": {},
                }
                clients[customer_id] = bucket
            bucket["subtotal_hours"] += hours

            proj_bucket = bucket["_projects"].get(project.id)
            if proj_bucket is None:
                proj_bucket = {
                    "project_id": project.id,
                    "project_name": project.name,
                    "category_name": project.category.name if project.category else None,
                    "subtotal_hours": 0,
                    "entries": [],
                }
                bucket["_projects"][project.id] = proj_bucket
            proj_bucket["subtotal_hours"] += hours
            proj_bucket["entries"].append(entry_row)
        else:
            proj_bucket = unlinked.get(project.id)
            if proj_bucket is None:
                proj_bucket = {
                    "project_id": project.id,
                    "project_name": project.name,
                    "category_name": project.category.name if project.category else None,
                    "subtotal_hours": 0,
                    "entries": [],
                }
                unlinked[project.id] = proj_bucket
            proj_bucket["subtotal_hours"] += hours
            proj_bucket["entries"].append(entry_row)

    # Flatten the inner project dicts to ordered lists for the response.
    # Sort clients by display name and projects by name for a stable,
    # readable render — no surprise ordering changes between reloads.
    clients_out: list[dict[str, Any]] = []
    for client in sorted(clients.values(), key=lambda c: c["client_name"].lower()):
        projects_out = sorted(
            client.pop("_projects").values(),
            key=lambda p: (p["project_name"] or "").lower(),
        )
        client["projects"] = projects_out
        clients_out.append(client)

    unlinked_out = sorted(
        unlinked.values(),
        key=lambda p: (p["project_name"] or "").lower(),
    )

    return {
        "week_start": window_start.isoformat(),
        "week_end": window_end.isoformat(),
        "total_hours": total_hours,
        "syncable_unsubmitted_count": syncable_unsubmitted,
        "clients": clients_out,
        "unlinked_projects": unlinked_out,
    }


# ── POST submit ──────────────────────────────────────────────────────────


# Sentinel return codes for the router. Mirrors the admin sync's
# ``status`` field where it overlaps so callers see a coherent set of
# error codes across both paths.
SUBMIT_NOT_CONNECTED = "not_connected"
SUBMIT_LOCKED = "locked"


def submit_my_timesheet(
    db: Session,
    developer: Developer,
    today: date | None = None,
) -> dict[str, Any]:
    """Push the developer's eligible Mon–Fri entries to QuickBooks inline.

    Returns one of:

      Success / partial:
        {
          "status": "ok" | "partial",
          "submitted_count": int,       # how many entries Submit picked up
          "synced_count":    int,       # how many landed in QB
          "failed": [{"entry_id": int, "error": str}, ...],
          "week_start": "YYYY-MM-DD",
          "week_end":   "YYYY-MM-DD",
        }

      Operational outcomes (no entries touched):
        {"status": "not_connected", "reason": str, ...empty counts}
        {"status": "locked",        "reason": str, ...empty counts}

    The router maps statuses to HTTP codes:
      - ``ok`` / ``partial`` → 200 (per-entry failures are NOT a 5xx)
      - ``not_connected``    → 503
      - ``locked``           → 409 (another sync is running — admin
                                    force-sync or a different dev's
                                    concurrent submit. Retry shortly.)

    Why ok/partial both 200: the UI distinguishes by ``failed[]`` being
    empty vs non-empty. Returning 5xx for a per-entry QB rejection
    would obscure the fact that *some* entries succeeded — the
    successes are committed to the DB regardless.
    """
    window_start, window_end = current_work_week_window(today)
    base = {
        "submitted_count": 0,
        "synced_count": 0,
        "failed": [],
        "week_start": window_start.isoformat(),
        "week_end": window_end.isoformat(),
    }

    integration = db.query(WorkforceIntegration).first()
    if not integration:
        return {
            **base,
            "status": SUBMIT_NOT_CONNECTED,
            "reason": (
                "QuickBooks isn't connected yet. "
                "Ask an admin to connect it under Admin → Integrations."
            ),
        }

    # Best-effort preflight — same pattern the admin endpoint uses to
    # short-circuit a duplicate click without queueing real work. A
    # sub-second race between this peek and the lock acquire below is
    # caught by the lock itself.
    if is_sync_in_progress(db):
        return {
            **base,
            "status": SUBMIT_LOCKED,
            "reason": (
                "A QuickBooks sync is already running. Wait a few seconds and click Submit again."
            ),
        }

    lock_conn = _try_advisory_lock(db)
    if lock_conn is False:
        return {
            **base,
            "status": SUBMIT_LOCKED,
            "reason": (
                "A QuickBooks sync is already running. Wait a few seconds and click Submit again."
            ),
        }

    try:
        return _submit_inside_lock(
            db,
            integration,
            developer,
            window_start=window_start,
            window_end=window_end,
            base=base,
        )
    finally:
        _release_advisory_lock(lock_conn)


def _submit_inside_lock(
    db: Session,
    integration: WorkforceIntegration,
    developer: Developer,
    *,
    window_start: date,
    window_end: date,
    base: dict[str, Any],
) -> dict[str, Any]:
    """Body of submit_my_timesheet after the advisory lock is held.

    The same shape as :func:`services.workforce_sync._run_inside_lock`
    but scoped to one developer and emitting per-entry results instead
    of aggregate counts.
    """
    # 1) Resolve the service item. Same logic as admin sync. If the
    #    integration row has a cached id we use it; otherwise resolve
    #    once and cache it for next time.
    service_item_id = integration.service_item_id
    if not service_item_id:
        try:
            item = resolve_service_item(db, integration)
        except QBApiError as e:
            return {
                **base,
                "status": "error",
                "reason": f"Couldn't look up the 'Hours' service item in QuickBooks: {e}",
            }
        if not item:
            return {
                **base,
                "status": "error",
                "reason": (
                    "Couldn't find a service item named 'Hours' in QuickBooks. "
                    "Ask an admin to create one (Products and services → New → "
                    "Service, name it exactly 'Hours') and try again."
                ),
            }
        integration.service_item_id = item["id"]
        integration.service_item_name = item["name"]
        db.commit()
        service_item_id = item["id"]

    # 2) Build the email → QB employee id map. Needed to attach the
    #    right QB employee to each TimeActivity.
    try:
        employee_map = fetch_qb_employees(db, integration)
    except (QBApiError, WorkforceOAuthError) as e:
        return {
            **base,
            "status": "error",
            "reason": f"Couldn't load the employee list from QuickBooks: {e}",
        }

    dev_email = (developer.email or "").lower().strip()
    if not dev_email or dev_email not in employee_map:
        return {
            **base,
            "status": "error",
            "reason": (
                f"No QuickBooks employee matches the email {dev_email!r}. "
                "Ask an admin to add you as an employee in QuickBooks."
            ),
        }
    employee_qb_id = employee_map[dev_email]

    # 2.5) Build the QB Class map (project category → QB Class id). Best-
    #      effort: if Class tracking is off or the lookup fails we push
    #      without a ClassRef rather than blocking the submit.
    try:
        class_map = fetch_qb_classes(db, integration)
    except (QBApiError, WorkforceOAuthError) as e:
        logger.warning("[timesheet_submit] couldn't load QB classes; omitting Class: %s", e)
        class_map = {}

    # 3) Pull eligible entries. Filter mirrors the admin sync's filter
    #    PLUS a developer scope. We pick up both (a) entries the dev has
    #    never submitted (`submitted_at IS NULL`) and (b) entries they
    #    previously submitted that didn't sync (`submitted_at SET,
    #    workforce_entry_id IS NULL`) — the second case is a natural
    #    retry. Both are recognizable by `workforce_entry_id IS NULL`.
    window_start_dt = datetime.combine(window_start, time.min)
    window_end_dt = datetime.combine(window_end + timedelta(days=1), time.min)
    entries: list[TimeEntry] = (
        db.query(TimeEntry)
        .join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
        .join(Project, WorkItem.project_id == Project.id)
        .filter(
            TimeEntry.developer_id == developer.id,
            Project.workforce_client_id.isnot(None),
            TimeEntry.workforce_entry_id.is_(None),
            TimeEntry.logged_at >= window_start_dt,
            TimeEntry.logged_at < window_end_dt,
        )
        .options(
            selectinload(TimeEntry.work_item)
            .selectinload(WorkItem.project)
            .selectinload(Project.category),
        )
        .order_by(TimeEntry.logged_at.asc(), TimeEntry.id.asc())
        .all()
    )

    if not entries:
        # Nothing to do — either the dev hasn't logged anything on QB-
        # linked projects this week, or everything they logged is
        # already synced. Either way the modal will refetch and show
        # the up-to-date view.
        return {
            **base,
            "status": "ok",
            "reason": (
                "No new hours to submit. Either you haven't logged any hours "
                "on QuickBooks-linked projects this week, or everything is "
                "already synced."
            ),
        }

    # 4) Mark submitted_at on every entry that doesn't have it yet, so
    #    the state machine is consistent before the first QB POST. If
    #    the request crashes between this commit and the next, the
    #    entries stay at "submitted, not synced" and the next click
    #    retries them.
    now = datetime.utcnow()
    submitted_now = 0
    for entry in entries:
        if entry.submitted_at is None:
            entry.submitted_at = now
            submitted_now += 1
    if submitted_now:
        db.commit()

    # 5) Loop QB POSTs. Per-entry commit so a mid-loop rate-limit or
    #    crash keeps prior successes durable.
    synced = 0
    failed: list[dict[str, Any]] = []
    rate_limited = False

    for entry in entries:
        if rate_limited:
            # Don't keep hammering Intuit. The remaining entries stay
            # at "submitted, not synced" and the dev's next click retries.
            failed.append(
                {
                    "entry_id": entry.id,
                    "error": (
                        "QuickBooks rate-limited mid-submit. Wait a minute and click Submit again."
                    ),
                }
            )
            continue

        project = entry.work_item.project if entry.work_item else None
        customer_qb_id = project.workforce_client_id if project else None
        category = project.category if project else None
        class_id = class_map.get((category.name or "").lower().strip()) if category else None
        if not customer_qb_id:
            # Project was unlinked between the eligibility query and
            # the POST. Surface it per-row so the dev knows that
            # entry's project needs to be re-linked.
            failed.append(
                {
                    "entry_id": entry.id,
                    "error": (
                        "This project was unlinked from a QuickBooks customer. "
                        "Ask an admin to re-link it, then click Submit again."
                    ),
                }
            )
            continue

        try:
            qb_id = post_time_activity(
                db,
                integration,
                employee_qb_id=employee_qb_id,
                customer_qb_id=customer_qb_id,
                service_item_id=service_item_id,
                hours=int(entry.hours or 0),
                txn_date=entry.logged_at.date(),
                description=build_description(entry),
                billable=bool(entry.billable),
                class_id=class_id,
            )
            entry.workforce_entry_id = qb_id
            synced += 1
            db.commit()
        except QBRateLimitError as e:
            logger.warning("[timesheet_submit] rate-limited on entry id=%s: %s", entry.id, e)
            failed.append(
                {
                    "entry_id": entry.id,
                    "error": (
                        "QuickBooks rate-limited this entry. Wait a minute and click Submit again."
                    ),
                }
            )
            rate_limited = True
        except QBApiError as e:
            logger.warning("[timesheet_submit] entry id=%s failed: %s", entry.id, e)
            failed.append({"entry_id": entry.id, "error": str(e)})
        except WorkforceOAuthError as e:
            # OAuth blew up mid-loop — bail out cleanly. The dev sees a
            # red banner; admin needs to re-connect QB.
            logger.error("[timesheet_submit] OAuth failure: %s", e)
            failed.append(
                {
                    "entry_id": entry.id,
                    "error": (
                        "QuickBooks authorization expired. "
                        "Ask an admin to disconnect and re-connect QuickBooks."
                    ),
                }
            )
            break

    status_str = "ok" if not failed else "partial"
    submitted_count = len(entries)

    return {
        "status": status_str,
        "submitted_count": submitted_count,
        "synced_count": synced,
        "failed": failed,
        "week_start": window_start.isoformat(),
        "week_end": window_end.isoformat(),
    }
