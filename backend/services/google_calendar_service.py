"""Google Calendar Service - read developer calendars via a service account.

Uses a Google Workspace **domain-wide-delegation** service account: one org
credential, authorized once by a Workspace super-admin, that can read every
employee's primary calendar by impersonating their email (subject=<dev email>).
This mirrors the single-org-credential pattern email_service.py uses for Gmail
— there is NO per-developer OAuth.

Configuration (one of):
  • GOOGLE_CALENDAR_SA_JSON  — the service-account credentials JSON, inline.
  • GOOGLE_CALENDAR_SA_FILE  — path to the credentials JSON on disk.

When neither is set, is_configured() is False and callers must no-op (the sync
logs a warning and exits cleanly, matching how email degrades).

Scope is read-only (calendar.readonly). All datetimes returned by parse_event()
are UTC-naive to match how the rest of the app stores/compares time
(week_boundaries() uses datetime.utcnow()).
"""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, date, datetime

logger = logging.getLogger(__name__)

CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"

# Generic title for private events — imported from the model so the two stay in
# sync. Kept as a module constant for parse_event().
from models.calendar_event import PRIVATE_EVENT_TITLE  # noqa: E402


def extract_project_from_title(title: str | None) -> str | None:
    """Parse the project name from a meeting title.

    Convention: titles are `project_name-purpose` (e.g. "Atlas-standup" or
    "Atlas - sprint review"). The project is the text before the FIRST "-",
    trimmed. Returns None when the title doesn't follow the convention — no "-"
    present, or an empty project segment (e.g. "-orphan"). Pure function.
    """
    if not title:
        return None
    head, sep, _purpose = title.partition("-")
    if not sep:
        return None
    return head.strip() or None


def _to_utc_naive(dt: datetime) -> datetime:
    """Normalize an aware (or naive) datetime to UTC and drop tzinfo.

    The Calendar API returns RFC3339 with offsets; the rest of the app stores
    naive-UTC, so we convert then strip tzinfo for consistent comparisons.
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def parse_event(raw: dict, dev_email: str) -> dict | None:
    """Map a raw Google Calendar event into CalendarEvent field values.

    Returns None for events that can't be stored (missing id/timing, or
    cancelled). Honors visibility: private events keep only timing metadata and
    get a generic title. Pure function — no network — so it's unit-testable.
    """
    if raw.get("status") == "cancelled":
        return None
    event_id = raw.get("id")
    if not event_id:
        return None

    start = raw.get("start") or {}
    end = raw.get("end") or {}

    is_all_day = "date" in start and "dateTime" not in start
    try:
        if is_all_day:
            # All-day: 'date' is YYYY-MM-DD; treat as midnight UTC.
            start_at = datetime.combine(date.fromisoformat(start["date"]), datetime.min.time())
            end_at = datetime.combine(date.fromisoformat(end["date"]), datetime.min.time())
        else:
            start_dt = start.get("dateTime")
            end_dt = end.get("dateTime")
            if not start_dt or not end_dt:
                return None
            start_at = _to_utc_naive(datetime.fromisoformat(start_dt))
            end_at = _to_utc_naive(datetime.fromisoformat(end_dt))
    except (ValueError, KeyError):
        return None

    visibility = raw.get("visibility") or "default"
    is_private = visibility in ("private", "confidential")
    title = PRIVATE_EVENT_TITLE if is_private else (raw.get("summary") or PRIVATE_EVENT_TITLE)

    # Parse the project from the REAL summary (never the masked title). Private
    # events have no parseable title, so their project stays None.
    project = None if is_private else extract_project_from_title(raw.get("summary"))

    organizer_email = (raw.get("organizer") or {}).get("email")

    # Response status: find this developer's attendee entry; fall back to the
    # organizer's self-flag, else needs_action.
    response_status = "needs_action"
    attendees = raw.get("attendees") or []
    me = next(
        (a for a in attendees if (a.get("email") or "").lower() == dev_email.lower()),
        None,
    )
    if me and me.get("responseStatus"):
        response_status = me["responseStatus"]
    elif (raw.get("organizer") or {}).get("self") and not attendees:
        # Organizer with no other attendees → effectively accepted.
        response_status = "accepted"

    return {
        "google_event_id": event_id,
        "organizer_email": organizer_email,
        "title": title,
        "project": project,
        "start_at": start_at,
        "end_at": end_at,
        "is_all_day": is_all_day,
        "response_status": response_status,
        "visibility": "private" if is_private else "default",
    }


class GoogleCalendarService:
    """Reads developer calendars via a domain-wide-delegation service account."""

    def __init__(self):
        self._sa_json = os.getenv("GOOGLE_CALENDAR_SA_JSON", "")
        self._sa_file = os.getenv("GOOGLE_CALENDAR_SA_FILE", "")

    def is_configured(self) -> bool:
        """True if service-account credentials are available (inline or file)."""
        return bool(self._sa_json or (self._sa_file and os.path.exists(self._sa_file)))

    def _load_sa_info(self) -> dict:
        if self._sa_json:
            return json.loads(self._sa_json)
        with open(self._sa_file) as f:
            return json.load(f)

    def _build_client(self, dev_email: str):
        """Build a Calendar API client impersonating dev_email.

        Google libs are imported lazily so the rest of the app imports cleanly
        even when the libraries or credentials are absent.
        """
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        creds = (
            service_account.Credentials.from_service_account_info(self._load_sa_info())
            .with_scopes([CALENDAR_READONLY_SCOPE])
            .with_subject(dev_email)
        )
        return build("calendar", "v3", credentials=creds, cache_discovery=False)

    def get_events(self, dev_email: str, time_min: datetime, time_max: datetime) -> list[dict]:
        """Return parsed events on dev_email's primary calendar in [time_min, time_max].

        time_min/time_max are UTC-naive datetimes. Returns a list of dicts shaped
        like CalendarEvent fields (see parse_event). Raises on API errors so the
        caller can decide per-developer error handling.
        """
        client = self._build_client(dev_email)

        def _rfc3339(dt: datetime) -> str:
            return dt.replace(tzinfo=UTC).isoformat()

        parsed: list[dict] = []
        page_token = None
        while True:
            resp = (
                client.events()
                .list(
                    calendarId="primary",
                    timeMin=_rfc3339(time_min),
                    timeMax=_rfc3339(time_max),
                    singleEvents=True,
                    orderBy="startTime",
                    pageToken=page_token,
                )
                .execute()
            )
            for raw in resp.get("items", []):
                ev = parse_event(raw, dev_email)
                if ev is not None:
                    parsed.append(ev)
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
        return parsed


# Singleton, matching google_oauth_service / email_service conventions.
google_calendar_service = GoogleCalendarService()
