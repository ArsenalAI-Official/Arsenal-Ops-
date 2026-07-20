"""Email notifications for QuickBooks sync runs.

One HTML template shared by both triggers:

- **Manual sync** — sent to the admin who clicked "Sync Now" so they
  get an immediate confirmation (or a clear error breakdown) in their
  inbox without having to keep the Integrations tab open.
- **Saturday cron** — sent to `WEEKLY_REPORT_RECIPIENTS` (the same env
  var that powers `WEEKLY_EMAIL_REPORT_SETUP.md`) so the ops/finance
  watchers know the weekly push went through.

Inline styles + table layout match `services/weekly_report_service.py`
so the two emails read as a coherent series rather than ad-hoc
notifications. No external assets (CSS, images) so Outlook + Gmail
render the same.

Status → color rules:
  ok            → green   (Healthy)
  partial       → amber   (some entries failed or rate-limited)
  error         → red     (hard failure, see reason)
  no_eligible   → gray    (nothing to sync — typical on quiet weeks)
  not_connected → gray    (integration disconnected)
  locked        → blue    (another sync running)
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date, datetime
from html import escape
from typing import Any

from services.email_service import email_service

logger = logging.getLogger(__name__)


# ── Formatting helpers ───────────────────────────────────────────────────


def _fmt_date_short(iso_date: str) -> str:
    """`2026-06-08` → `Jun 8`. Falls back to the raw string on parse failure."""
    try:
        d = date.fromisoformat(iso_date)
    except (ValueError, TypeError):
        return iso_date
    # Use platform-portable formatting (no %-d, which fails on Windows).
    return f"{d.strftime('%b')} {d.day}"


def _fmt_window(result: dict[str, Any]) -> str:
    start = _fmt_date_short(result.get("window_start", ""))
    end = _fmt_date_short(result.get("window_end", ""))
    if not start and not end:
        return "—"
    if not end:
        return start
    return f"{start} – {end}"


def _status_style(status: str) -> dict[str, str]:
    """Return badge color + human label for a status string."""
    table = {
        "ok": {"label": "Healthy", "bg": "#dcfce7", "fg": "#166534"},
        "partial": {"label": "Partial", "bg": "#fef3c7", "fg": "#92400e"},
        "error": {"label": "Error", "bg": "#fee2e2", "fg": "#991b1b"},
        "no_eligible": {"label": "No eligible entries", "bg": "#f3f4f6", "fg": "#374151"},
        "not_connected": {"label": "Not connected", "bg": "#f3f4f6", "fg": "#374151"},
        "locked": {"label": "Already running", "bg": "#dbeafe", "fg": "#1e3a8a"},
    }
    return table.get(
        status,
        {"label": status, "bg": "#f3f4f6", "fg": "#374151"},
    )


# ── Subject + body builders ──────────────────────────────────────────────


def build_sync_email_subject(result: dict[str, Any]) -> str:
    """One-line summary subject suitable for an inbox list view."""
    status = result.get("status", "unknown")
    window = _fmt_window(result)
    synced = int(result.get("synced", 0))
    failed = int(result.get("failed", 0))
    skipped = int(result.get("skipped", 0))

    if status == "ok":
        verb = "entry" if synced == 1 else "entries"
        return f"QuickBooks Sync — {window} — {synced} {verb} synced"
    if status == "partial":
        return f"QuickBooks Sync — {window} — {synced} synced, {failed} failed, {skipped} skipped"
    if status == "error":
        return f"QuickBooks Sync FAILED — {window}"
    if status == "no_eligible":
        return f"QuickBooks Sync — {window} — nothing to sync"
    if status == "not_connected":
        return "QuickBooks Sync — integration not connected"
    if status == "locked":
        return "QuickBooks Sync — already running"
    return f"QuickBooks Sync — {window} — {status}"


def build_sync_email_html(
    result: dict[str, Any],
    *,
    triggered_by_label: str,
    triggered_by_email: str | None = None,
    run_at: datetime | None = None,
) -> str:
    """Render the sync-result email as a self-contained HTML string.

    `triggered_by_label` is rendered as-is in the body — e.g.
    "Sahil Fayaz" for manual clicks, "Saturday cron (scheduled)" for
    the cron. `triggered_by_email` adds the email under the label when
    the trigger is a real user.
    """
    run_at = run_at or datetime.utcnow()
    status = result.get("status", "unknown")
    style = _status_style(status)
    window = _fmt_window(result)
    synced = int(result.get("synced", 0))
    failed = int(result.get("failed", 0))
    skipped = int(result.get("skipped", 0))
    reason = result.get("reason")

    trigger_block = f"""
        <div style="font-size:14px;color:#111827;font-weight:500;">
          {escape(triggered_by_label)}
        </div>
        {
        f'<div style="font-size:12px;color:#6b7280;margin-top:2px;">{escape(triggered_by_email)}</div>'
        if triggered_by_email
        else ""
    }
        """

    # Reason block — only render when present. Pre-wrap so multi-line
    # error tails (e.g. several skipped emails) stay readable.
    reason_block = ""
    if reason:
        reason_block = f"""
        <tr>
          <td style="padding:16px 28px;background:#fafafa;border-top:1px solid #e5e7eb;">
            <div style="font-size:11px;font-weight:600;color:#6b7280;
                        text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">
              Notes
            </div>
            <div style="font-size:13px;color:#374151;line-height:1.5;
                        white-space:pre-wrap;word-break:break-word;
                        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
              {escape(str(reason))}
            </div>
          </td>
        </tr>
        """

    # Counts row — three small inline cells so a wider client like Gmail
    # web shows them side-by-side and a narrow client (mobile Outlook)
    # stacks cleanly.
    counts_html = f"""
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="border-collapse:separate;border-spacing:8px 0;margin-top:12px;">
      <tr>
        {_count_cell("Synced", synced, "#16a34a")}
        {_count_cell("Failed", failed, "#dc2626" if failed else "#9ca3af")}
        {_count_cell("Skipped", skipped, "#d97706" if skipped else "#9ca3af")}
      </tr>
    </table>
    """

    run_at_label = run_at.strftime("%b %d, %Y %I:%M %p UTC")

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>QuickBooks Sync Report</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
           style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;
                  border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <!-- Header -->
      <tr>
        <td style="padding:24px 28px 16px;border-bottom:1px solid #e5e7eb;">
          <div style="display:inline-block;font-size:18px;font-weight:600;color:#111827;letter-spacing:-0.01em;">
            QuickBooks Sync Report
          </div>
          <span style="display:inline-block;margin-left:10px;padding:3px 10px;
                       font-size:11px;font-weight:600;border-radius:999px;
                       background:{style["bg"]};color:{style["fg"]};
                       text-transform:uppercase;letter-spacing:0.04em;
                       vertical-align:middle;">
            {escape(style["label"])}
          </span>
          <div style="font-size:13px;color:#6b7280;margin-top:6px;">
            {escape(window)}
          </div>
        </td>
      </tr>

      <!-- Trigger + counts -->
      <tr>
        <td style="padding:18px 28px 4px;">
          <div style="font-size:11px;font-weight:600;color:#6b7280;
                      text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">
            Triggered by
          </div>
          {trigger_block}
          {counts_html}
        </td>
      </tr>

      {reason_block}

      <!-- Footer -->
      <tr>
        <td style="padding:20px 28px 24px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;line-height:1.5;">
            Run completed {escape(run_at_label)}.
            Synced hours flow into QuickBooks Online under each project's tagged Customer
            and the "Hours" Service Item. Manage the integration from Admin → Integrations.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    return html


def _count_cell(label: str, value: int, color: str) -> str:
    return f"""
    <td style="padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;
               border-radius:8px;width:33%;vertical-align:top;">
      <div style="font-size:11px;font-weight:600;color:#6b7280;
                  text-transform:uppercase;letter-spacing:0.05em;">
        {escape(label)}
      </div>
      <div style="font-size:22px;font-weight:700;color:{color};
                  margin-top:4px;font-variant-numeric:tabular-nums;">
        {value}
      </div>
    </td>
    """


# ── Send helper ──────────────────────────────────────────────────────────


def send_sync_notification(
    recipients: Iterable[str],
    result: dict[str, Any],
    *,
    triggered_by_label: str,
    triggered_by_email: str | None = None,
) -> dict[str, bool]:
    """Build the email and send to each recipient. Returns `{recipient: ok}`.

    Recipients with empty / whitespace-only addresses are dropped. If the
    list resolves to nothing, the function logs and returns `{}` — same
    no-op semantics as the weekly report so missing env config doesn't
    fail the sync.

    Failures from `email_service.send_email` (Gmail OAuth2 not
    configured, transient errors) are logged per-recipient and
    surfaced in the return value, but never raise — the sync already
    succeeded by the time we get here.
    """
    cleaned = [r.strip() for r in recipients if r and r.strip()]
    if not cleaned:
        logger.info("[workforce_sync_notify] no recipients, skipping send.")
        return {}

    subject = build_sync_email_subject(result)
    html = build_sync_email_html(
        result,
        triggered_by_label=triggered_by_label,
        triggered_by_email=triggered_by_email,
    )

    results: dict[str, bool] = {}
    for to in cleaned:
        try:
            ok = email_service.send_email(to_email=to, subject=subject, html_body=html)
        except Exception as e:
            logger.warning("[workforce_sync_notify] send to %s raised: %s", to, e)
            ok = False
        results[to] = ok
        logger.info("[workforce_sync_notify] %s → %s", to, "ok" if ok else "FAILED")
    return results
