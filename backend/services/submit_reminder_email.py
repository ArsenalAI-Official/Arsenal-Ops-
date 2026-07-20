"""Friday "review & submit your hours" reminder email.

Sends a templated email to every internal employee (Developer rows with
`is_external = False`) reminding them to open the Review & Submit modal
in Arsenal Ops and push their week's hours to QuickBooks before Sunday.

Status: **NOT YET SCHEDULED.** The template + sender function live here
so a CLI script (and, later, a cron job) can call it, but no scheduler
entry has been added to the deploy. Per product call, this stays
opt-in until the CEO signs off on the cadence and copy.

Test invocation (dry-run, no mail sent):
    python -m scripts.send_submit_reminder --dry-run

Live invocation (after CEO approval — DON'T run from a dev box):
    python -m scripts.send_submit_reminder --send

Recipients: `Developer.is_external == False AND email IS NOT NULL`.
The list is driven by `ALLOWED_EMAIL_DOMAINS` via the existing
`reconcile_internal_developers()` startup hook, so the same env var
that gates the My Capacity card also controls who gets this email.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy.orm import Session

from models.developer import Developer
from services.email_service import email_service

logger = logging.getLogger(__name__)


@dataclass
class ReminderResult:
    """Outcome of one reminder send pass — written to logs by the CLI."""

    recipients_total: int  # internal devs the filter considered
    sent: int
    skipped_no_email: int
    skipped_nothing_to_submit: int  # devs with no eligible unsubmitted hours
    failed: list[str]  # list of "<email>: <reason>" strings
    dry_run: bool


def _current_week_window(today: date | None = None) -> tuple[date, date]:
    """Mon-Fri of the calendar week containing `today`.

    Local copy of the same shape as `services.workforce_sync.current_work_week_window`
    — duplicated only because importing the sync module pulls in QB
    client deps that this reminder doesn't need.
    """
    if today is None:
        today = date.today()
    monday = today - timedelta(days=today.weekday())
    friday = monday + timedelta(days=4)
    return monday, friday


def _format_date(d: date) -> str:
    """`Friday, June 26` — short, human, no year (the email is timely)."""
    return d.strftime("%A, %B %-d") if hasattr(d, "strftime") else str(d)


def _build_subject(monday: date, friday: date) -> str:
    """Subject line. Carries the week range so threaded clients distinguish
    consecutive weeks' reminders without opening the body."""
    return (
        f"Action needed: review & submit your hours "
        f"({monday.strftime('%b %-d')}–{friday.strftime('%b %-d')})"
    )


def build_reminder_email_html(to_name: str, monday: date, friday: date, app_url: str) -> str:
    """Mailbox-safe HTML body — inline styles only, no external CSS, no
    web fonts, single-column layout. Matches the visual language of the
    existing `send_task_assignment_notification` template so the brand
    reads as one voice."""
    name = (to_name or "there").split()[0]  # first name only — feels less formal
    week_range = f"{monday.strftime('%a, %b %-d')} – {friday.strftime('%a, %b %-d')}"
    return f"""
    <html>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 600px; margin: 20px auto; background: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
          <div style="border-left: 4px solid #E0B954; padding-left: 20px; margin-bottom: 28px;">
            <h2 style="color: #1f2937; margin: 0 0 8px 0; font-size: 22px;">
              Time to review &amp; submit your hours
            </h2>
            <p style="color: #6b7280; margin: 0; font-size: 14px;">
              Week of {week_range}
            </p>
          </div>

          <p style="color: #1f2937; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
            Hi {name},
          </p>

          <p style="color: #1f2937; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
            The work week is wrapping up. Please take a few minutes to review the hours you've
            logged this week and submit them to QuickBooks so the team can keep client billing
            and payroll on schedule.
          </p>

          <div style="background: #fff8e1; padding: 14px 18px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #E0B954;">
            <p style="margin: 0; color: #78350f; font-size: 14px; font-weight: 600;">
              Deadline: end of Sunday, {(friday + timedelta(days=2)).strftime("%b %-d")}.
            </p>
            <p style="margin: 6px 0 0 0; color: #92400e; font-size: 13px;">
              Anything submitted after that may slip into next week's invoicing cycle.
            </p>
          </div>

          <h3 style="color: #1f2937; font-size: 15px; margin: 28px 0 10px 0;">
            How to submit
          </h3>
          <ol style="color: #374151; font-size: 14px; line-height: 1.7; padding-left: 22px; margin: 0 0 24px 0;">
            <li>Open Arsenal Ops and look at the <strong>My Capacity</strong> card on the home page.</li>
            <li>Click <strong>Review &amp; Submit Hours</strong>.</li>
            <li>Skim each day's entries. Edit, delete, or add anything that's wrong or missing.</li>
            <li>Hit <strong>Submit &amp; Sync to QuickBooks</strong>. You'll see a confirmation when each entry lands.</li>
          </ol>

          <div style="margin: 32px 0; text-align: center;">
            <a href="{app_url}" style="display: inline-block; background-color: #E0B954; color: #0d0d0d; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Open Arsenal Ops
            </a>
          </div>

          <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 24px 0 0 0;">
            Already submitted? You can ignore this email — entries marked <em>Synced</em> in
            the modal are already in QuickBooks.
          </p>

          <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
              This is an automated reminder from <strong>Arsenal Ops</strong>.
              Questions? Reply to this email and the team will get back to you.
            </p>
          </div>
        </div>
      </body>
    </html>
    """


def build_reminder_email_text(to_name: str, monday: date, friday: date, app_url: str) -> str:
    """Plain-text fallback. Same content as the HTML, minus chrome."""
    name = (to_name or "there").split()[0]
    sunday = friday + timedelta(days=2)
    return (
        f"Hi {name},\n\n"
        f"The work week ({monday.strftime('%a, %b %-d')} – {friday.strftime('%a, %b %-d')}) "
        "is wrapping up. Please review and submit your logged hours to QuickBooks before "
        f"the end of Sunday, {sunday.strftime('%b %-d')}. Anything submitted after that may "
        "slip into next week's invoicing cycle.\n\n"
        "How to submit:\n"
        "  1. Open Arsenal Ops and click the My Capacity card on the home page.\n"
        "  2. Click Review & Submit Hours.\n"
        "  3. Skim each day's entries. Edit, delete, or add anything that's wrong or missing.\n"
        "  4. Click Submit & Sync to QuickBooks.\n\n"
        f"Open Arsenal Ops: {app_url}\n\n"
        "Already submitted? Ignore this email — entries marked 'Synced' in the modal are "
        "already in QuickBooks.\n\n"
        "— The Arsenal Ops Team"
    )


def send_one_preview(
    db: Session,
    to_email: str,
    *,
    to_name: str | None = None,
    today: date | None = None,
    app_url: str | None = None,
) -> str | None:
    """Send the templated reminder to a SINGLE address for visual review.

    Bypasses the recipient filter entirely — used to preview the email
    in your own inbox before turning on the broadcast. If `to_name` is
    None, falls back to looking up the matching Developer row (so the
    greeting reads naturally for self-sends) and finally to "there".

    Returns None on success, or the error string on failure. Always
    sends live — there's no dry-run path because the whole point is
    to land an email in your inbox.
    """
    if app_url is None:
        app_url = os.getenv("FRONTEND_URL", "https://arsenal-ops.vercel.app")
    monday, friday = _current_week_window(today)
    subject = _build_subject(monday, friday)

    if not email_service.is_configured():
        return "email_service not configured — set BOT_EMAIL / MAIL_REFRESH_TOKEN before previewing"

    resolved_name = to_name
    if not resolved_name:
        dev = db.query(Developer).filter(Developer.email == to_email).first()
        if dev and dev.name:
            resolved_name = dev.name
    resolved_name = resolved_name or "there"

    html = build_reminder_email_html(resolved_name, monday, friday, app_url)
    text = build_reminder_email_text(resolved_name, monday, friday, app_url)

    try:
        # No "[PREVIEW]" prefix — the whole point of the preview send is
        # to see exactly what recipients will see. The CLI's log line is
        # the only place that distinguishes preview from broadcast.
        ok = email_service.send_email(
            to_email=to_email,
            subject=subject,
            html_body=html,
            text_body=text,
        )
        return None if ok else "send_email returned False"
    except Exception as e:
        return str(e)


def send_submit_reminders(
    db: Session,
    *,
    dry_run: bool = True,
    today: date | None = None,
    app_url: str | None = None,
) -> ReminderResult:
    """Send the Friday reminder to every internal employee with an email.

    Defaults to `dry_run=True` so accidental imports / test invocations
    never spam the team. The CLI entrypoint MUST pass `dry_run=False` to
    actually send — see `scripts/send_submit_reminder.py`.

    Args:
        db: SQLAlchemy session.
        dry_run: If True (default), log what would be sent but don't call
            the mailer. Use this for previews / staging.
        today: Override the "today" used to compute the week window —
            mostly for tests; production passes None.
        app_url: Override the link in the email body. Defaults to the
            FRONTEND_URL env var with a sensible fallback so the CLI
            works without env wiring in dev environments.

    Returns:
        ReminderResult summarizing the run. Failures don't raise — one
        bad email shouldn't drop the rest of the batch.
    """
    from datetime import datetime, time
    from datetime import timedelta as _td

    from models.project import Project
    from models.time_entry import TimeEntry
    from models.work_item import WorkItem

    if app_url is None:
        app_url = os.getenv("FRONTEND_URL", "https://arsenal-ops.vercel.app")
    monday, friday = _current_week_window(today)
    subject = _build_subject(monday, friday)

    # Pull internal devs first; we'll filter by "has eligible unsubmitted
    # hours" with a per-dev EXISTS query below. The is_external column is
    # the canonical "internal employee" signal, kept in sync with
    # ALLOWED_EMAIL_DOMAINS by `reconcile_internal_developers()` on startup.
    devs = db.query(Developer).filter(Developer.is_external.is_(False)).all()

    # Pre-compute the set of developer_ids that have at least one
    # eligible-but-unsubmitted entry this week. "Eligible" = same rule
    # the Review modal applies for syncable_unsubmitted_count:
    #   - logged_at in current Mon-Fri
    #   - submitted_at IS NULL
    #   - workforce_entry_id IS NULL
    #   - project.workforce_client_id IS NOT NULL  (so it CAN be submitted)
    # One bulk query so we don't N+1 per dev.
    window_start_dt = datetime.combine(monday, time.min)
    window_end_dt = datetime.combine(friday + _td(days=1), time.min)
    dev_ids_with_unsubmitted = {
        dev_id
        for (dev_id,) in (
            db.query(TimeEntry.developer_id)
            .join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
            .join(Project, WorkItem.project_id == Project.id)
            .filter(
                Project.workforce_client_id.isnot(None),
                TimeEntry.workforce_entry_id.is_(None),
                TimeEntry.submitted_at.is_(None),
                TimeEntry.logged_at >= window_start_dt,
                TimeEntry.logged_at < window_end_dt,
                TimeEntry.developer_id.isnot(None),
            )
            .distinct()
            .all()
        )
    }

    sent = 0
    skipped_no_email = 0
    skipped_nothing_to_submit = 0
    failed: list[str] = []

    if not dry_run and not email_service.is_configured():
        # Hard-stop in live mode if the mailer isn't wired — better than
        # silently no-op'ing for the whole list.
        failed.append("(setup): email_service not configured — set BOT_EMAIL / MAIL_REFRESH_TOKEN")
        return ReminderResult(
            recipients_total=len(devs),
            sent=0,
            skipped_no_email=0,
            skipped_nothing_to_submit=0,
            failed=failed,
            dry_run=dry_run,
        )

    for dev in devs:
        if dev.id not in dev_ids_with_unsubmitted:
            # Nothing to remind about — either the dev logged nothing
            # this week, already submitted everything they logged, or
            # their hours are all on unlinked projects (the admin needs
            # to link those; emailing the dev doesn't help). Counted
            # separately so the CLI run log shows how many people the
            # filter skipped.
            skipped_nothing_to_submit += 1
            continue
        if not dev.email or "@" not in dev.email:
            skipped_no_email += 1
            continue
        html = build_reminder_email_html(dev.name or "", monday, friday, app_url)
        text = build_reminder_email_text(dev.name or "", monday, friday, app_url)

        if dry_run:
            logger.info(
                "[submit_reminder] DRY RUN — would email %s (subject: %s)", dev.email, subject
            )
            sent += 1
            continue
        try:
            ok = email_service.send_email(
                to_email=dev.email,
                subject=subject,
                html_body=html,
                text_body=text,
            )
            if ok:
                sent += 1
            else:
                failed.append(f"{dev.email}: send_email returned False")
        except Exception as e:
            failed.append(f"{dev.email}: {e}")

    return ReminderResult(
        recipients_total=len(devs),
        sent=sent,
        skipped_no_email=skipped_no_email,
        skipped_nothing_to_submit=skipped_nothing_to_submit,
        failed=failed,
        dry_run=dry_run,
    )
