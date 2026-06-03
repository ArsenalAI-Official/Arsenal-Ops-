"""Weekly logged-hours report.

Pure HTML builder + sender for the weekly team report. The body is a
two-column table — Developer / Hours Logged This Week — summed across all
projects. Designed to render cleanly in email clients (inline styles,
neutral palette, table layout, no external assets).

Used by:
  • scripts/send_weekly_report.py (CLI / cron entry point)
  • test_weekly_report.py          (unit test of the builder)
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import datetime, timedelta
from html import escape

from sqlalchemy.orm import Session

from models.developer import Developer
from models.project import Project
from models.time_entry import TimeEntry
from models.work_item import WorkItem
from services.capacity_service import week_boundaries
from services.email_service import email_service

logger = logging.getLogger(__name__)


def _fmt_date(d: datetime) -> str:
    return d.strftime("%b %d, %Y")


def _hours_per_developer(db: Session, week_start: datetime, week_end: datetime) -> dict[int, dict]:
    """Return per-developer logged-hours breakdown for the week:

    {dev_id: {
        "total":    int,                              # total hours across all projects
        "projects": [{"name": str, "hours": int}],    # sorted by hours desc
    }}
    """
    rows = (
        db.query(TimeEntry.developer_id, TimeEntry.hours, Project.id, Project.name)
        .join(WorkItem, TimeEntry.work_item_id == WorkItem.id)
        .join(Project, WorkItem.project_id == Project.id)
        .filter(
            TimeEntry.developer_id.isnot(None),
            TimeEntry.logged_at >= week_start,
            TimeEntry.logged_at <= week_end,
        )
        .all()
    )
    # Aggregate: (dev_id, project_id) → hours, plus dev_id → total
    by_dev_proj: dict[tuple[int, int], dict] = {}
    totals: dict[int, int] = {}
    for dev_id, hours, project_id, project_name in rows:
        h = hours or 0
        totals[dev_id] = totals.get(dev_id, 0) + h
        key = (dev_id, project_id)
        if key not in by_dev_proj:
            by_dev_proj[key] = {"name": project_name or f"Project {project_id}", "hours": 0}
        by_dev_proj[key]["hours"] += h

    out: dict[int, dict] = {}
    for dev_id, total in totals.items():
        projects = sorted(
            (entry for (d, _), entry in by_dev_proj.items() if d == dev_id),
            key=lambda p: (-p["hours"], p["name"].lower()),
        )
        out[dev_id] = {"total": total, "projects": projects}
    return out


def build_weekly_report_html(db: Session, generated_at: datetime | None = None) -> str:
    """Render the team weekly logged-hours report as a self-contained HTML string."""
    generated_at = generated_at or datetime.utcnow()
    week_start, week_end = week_boundaries(generated_at)

    developers = db.query(Developer).order_by(Developer.name).all()
    hours_map = _hours_per_developer(db, week_start, week_end)

    # Display Mon → Fri for the email (backend buckets Sat → Fri).
    display_start = week_start + timedelta(days=2)
    display_end = week_end
    week_label = f"{_fmt_date(display_start)} – {_fmt_date(display_end)}"

    # Sort: most hours first, ties broken alphabetically; 0-hour devs at the bottom.
    rows = sorted(
        (
            {
                "name": d.name,
                "email": d.email,
                "hours": hours_map.get(d.id, {}).get("total", 0),
                "projects": hours_map.get(d.id, {}).get("projects", []),
            }
            for d in developers
        ),
        key=lambda r: (r["hours"] == 0, -r["hours"], r["name"].lower()),
    )
    team_total = sum(r["hours"] for r in rows)

    def _project_list_html(projects: list[dict]) -> str:
        if not projects:
            return ""
        # Use a small inline table so project name (left) and hours (right) align
        # cleanly inside the Hours column across mail clients (including Outlook).
        items = "".join(
            f"""
            <tr>
              <td style="padding:2px 0;font-size:12px;color:#4b5563;text-align:left;">
                {escape(p["name"])}
              </td>
              <td style="padding:2px 0 2px 16px;font-size:12px;color:#6b7280;
                         text-align:right;font-variant-numeric:tabular-nums;">
                {p["hours"]}h
              </td>
            </tr>
            """
            for p in projects
        )
        return f"""
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="border-collapse:collapse;margin:10px 0 0 auto;min-width:180px;">
          {items}
        </table>
        """

    body_rows_html = (
        "".join(
            f"""
            <tr>
              <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;vertical-align:top;">
                <div style="font-weight:500;">{escape(r["name"])}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:2px;">{escape(r["email"])}</div>
              </td>
              <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;vertical-align:top;">
                <div style="font-variant-numeric:tabular-nums;font-weight:{("600" if r["hours"] > 0 else "400")};">
                  {r["hours"]}h
                </div>
                {_project_list_html(r["projects"])}
              </td>
            </tr>
            """
            for r in rows
        )
        if rows
        else """
        <tr><td colspan="2" style="padding:24px;text-align:center;color:#6b7280;font-size:14px;">
          No developers on record.
        </td></tr>
        """
    )

    html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Weekly Hours Report</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"
           style="max-width:600px;width:100%;margin:0 auto;background:#ffffff;
                  border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <!-- Header -->
      <tr>
        <td style="padding:24px 28px 16px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:18px;font-weight:600;color:#111827;letter-spacing:-0.01em;">
            Weekly Hours Report
          </div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px;">
            {week_label}
          </div>
        </td>
      </tr>

      <!-- Table -->
      <tr>
        <td style="padding:0 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                 style="border-collapse:collapse;margin-top:16px;">
            <thead>
              <tr>
                <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;
                           color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;
                           border-bottom:1px solid #e5e7eb;background:#f9fafb;">
                  Name
                </th>
                <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;
                           color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;
                           border-bottom:1px solid #e5e7eb;background:#f9fafb;">
                  Hours Logged
                </th>
              </tr>
            </thead>
            <tbody>
              {body_rows_html}
            </tbody>
            <tfoot>
              <tr>
                <td style="padding:14px 16px;font-size:13px;color:#111827;font-weight:600;">
                  Team total
                </td>
                <td style="padding:14px 16px;font-size:14px;color:#111827;font-weight:700;
                           text-align:right;font-variant-numeric:tabular-nums;">
                  {team_total}h
                </td>
              </tr>
            </tfoot>
          </table>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 28px 24px;border-top:1px solid #e5e7eb;">
          <div style="font-size:12px;color:#9ca3af;line-height:1.5;">
            Hours are summed across all projects from time entries logged within the week above.
            This report is sent automatically every Friday evening.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    return html


def send_weekly_report(db: Session, recipients: Iterable[str]) -> dict[str, bool]:
    """Build the report and send to each recipient. Returns {recipient: ok}."""
    recipients = [r.strip() for r in recipients if r and r.strip()]
    if not recipients:
        logger.info("send_weekly_report: no recipients configured, skipping send.")
        return {}

    html = build_weekly_report_html(db)
    week_start, week_end = week_boundaries()
    display_start = week_start + timedelta(days=2)
    display_end = week_end
    subject = f"Weekly Hours Report — {_fmt_date(display_start)} – {_fmt_date(display_end)}"

    results: dict[str, bool] = {}
    for to in recipients:
        ok = email_service.send_email(to_email=to, subject=subject, html_body=html)
        results[to] = ok
        logger.info("send_weekly_report: %s → %s", to, "ok" if ok else "FAILED")
    return results
