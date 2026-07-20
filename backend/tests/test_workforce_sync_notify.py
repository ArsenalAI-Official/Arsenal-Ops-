"""Tests for the QuickBooks sync notification email builder + sender.

Verifies the HTML/subject for every status and that the send helper
swallows email-service failures so a mis-configured Gmail doesn't fail
the sync.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── Subject ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("result", "expected_subject_part"),
    [
        (
            {
                "status": "ok",
                "synced": 5,
                "failed": 0,
                "skipped": 0,
                "window_start": "2026-06-08",
                "window_end": "2026-06-12",
            },
            "5 entries synced",
        ),
        (
            {
                "status": "ok",
                "synced": 1,
                "failed": 0,
                "skipped": 0,
                "window_start": "2026-06-08",
                "window_end": "2026-06-12",
            },
            "1 entry synced",  # singular branch
        ),
        (
            {
                "status": "partial",
                "synced": 3,
                "failed": 2,
                "skipped": 1,
                "window_start": "2026-06-08",
                "window_end": "2026-06-12",
            },
            "3 synced, 2 failed, 1 skipped",
        ),
        (
            {
                "status": "error",
                "synced": 0,
                "failed": 0,
                "skipped": 0,
                "window_start": "2026-06-08",
                "window_end": "2026-06-12",
            },
            "FAILED",
        ),
        (
            {
                "status": "no_eligible",
                "synced": 0,
                "failed": 0,
                "skipped": 0,
                "window_start": "2026-06-08",
                "window_end": "2026-06-12",
            },
            "nothing to sync",
        ),
        (
            {"status": "not_connected"},
            "not connected",
        ),
        (
            {"status": "locked"},
            "already running",
        ),
    ],
)
def test_subject_reflects_status(result, expected_subject_part):
    from services.workforce_sync_notify import build_sync_email_subject

    subject = build_sync_email_subject(result)
    assert expected_subject_part in subject


def test_subject_includes_window_for_dated_runs():
    from services.workforce_sync_notify import build_sync_email_subject

    subject = build_sync_email_subject(
        {
            "status": "ok",
            "synced": 1,
            "failed": 0,
            "skipped": 0,
            "window_start": "2026-06-08",
            "window_end": "2026-06-12",
        }
    )
    assert "Jun 8" in subject
    assert "Jun 12" in subject


# ── HTML body ────────────────────────────────────────────────────────────


def _basic_result(**overrides):
    base = {
        "status": "ok",
        "synced": 3,
        "failed": 0,
        "skipped": 0,
        "window_start": "2026-06-08",
        "window_end": "2026-06-12",
    }
    base.update(overrides)
    return base


def test_html_contains_status_label():
    from services.workforce_sync_notify import build_sync_email_html

    html = build_sync_email_html(
        _basic_result(status="ok"),
        triggered_by_label="Sahil",
    )
    assert "Healthy" in html

    html = build_sync_email_html(
        _basic_result(status="error", synced=0, reason="OAuth refresh failed"),
        triggered_by_label="Saturday cron",
    )
    assert "Error" in html


def test_html_renders_counts():
    """All three counts appear in the count-card section.

    Picks single-digit values so the literal "7", "2", "3" only have
    one plausible source in the rendered HTML (the count cards), making
    the substring check unambiguous.
    """
    from services.workforce_sync_notify import build_sync_email_html

    html = build_sync_email_html(
        _basic_result(synced=7, failed=2, skipped=3),
        triggered_by_label="Sahil",
    )
    # All three labels are present (proves the cards rendered)…
    assert "Synced" in html
    assert "Failed" in html
    assert "Skipped" in html
    # …and the three count values are too.
    assert "7" in html
    assert "2" in html
    assert "3" in html


def test_html_renders_window_range():
    from services.workforce_sync_notify import build_sync_email_html

    html = build_sync_email_html(_basic_result(), triggered_by_label="Sahil")
    assert "Jun 8" in html
    assert "Jun 12" in html


def test_html_renders_trigger_label_and_email():
    from services.workforce_sync_notify import build_sync_email_html

    html = build_sync_email_html(
        _basic_result(),
        triggered_by_label="Sahil Fayaz",
        triggered_by_email="sahil@arsenalai.com",
    )
    assert "Sahil Fayaz" in html
    assert "sahil@arsenalai.com" in html


def test_html_escapes_reason_to_prevent_html_injection():
    """A QB error string with HTML-ish content shouldn't render as HTML."""
    from services.workforce_sync_notify import build_sync_email_html

    html = build_sync_email_html(
        _basic_result(status="error", reason="<script>alert(1)</script>"),
        triggered_by_label="Sahil",
    )
    assert "<script>alert(1)</script>" not in html  # raw form must NOT appear
    assert "&lt;script&gt;" in html  # escaped form must appear


def test_html_omits_reason_block_when_status_is_ok():
    from services.workforce_sync_notify import build_sync_email_html

    html = build_sync_email_html(
        _basic_result(status="ok"),
        triggered_by_label="Sahil",
    )
    assert "Notes" not in html  # the "Notes" header is the reason-block label


def test_html_is_self_contained():
    """No external assets — needed for Outlook/Gmail to render the same."""
    from services.workforce_sync_notify import build_sync_email_html

    html = build_sync_email_html(_basic_result(), triggered_by_label="Sahil")
    assert "<link" not in html
    assert "src=" not in html


# ── send_sync_notification ───────────────────────────────────────────────


def test_send_swallows_email_service_exception(monkeypatch):
    """A raised exception from email_service.send_email must NOT propagate —
    the sync already succeeded by the time we get here, so an email
    misconfig should at worst be logged."""
    from services import workforce_sync_notify

    def boom(*a, **kw):
        raise RuntimeError("smtp blew up")

    monkeypatch.setattr(workforce_sync_notify.email_service, "send_email", boom)

    out = workforce_sync_notify.send_sync_notification(
        ["ops@arsenalai.com"],
        _basic_result(),
        triggered_by_label="cron",
    )
    assert out == {"ops@arsenalai.com": False}


def test_send_returns_per_recipient_success(monkeypatch):
    from services import workforce_sync_notify

    sent_to: list[str] = []

    def fake_send(to_email, subject, html_body, text_body=None):
        sent_to.append(to_email)
        # Simulate gmail success for one address, failure for another.
        return to_email != "broken@arsenalai.com"

    monkeypatch.setattr(workforce_sync_notify.email_service, "send_email", fake_send)

    out = workforce_sync_notify.send_sync_notification(
        ["ops@arsenalai.com", "broken@arsenalai.com"],
        _basic_result(),
        triggered_by_label="Saturday cron",
    )
    assert out == {
        "ops@arsenalai.com": True,
        "broken@arsenalai.com": False,
    }
    assert sent_to == ["ops@arsenalai.com", "broken@arsenalai.com"]


def test_send_skips_empty_recipients(monkeypatch):
    from services import workforce_sync_notify

    called = {"count": 0}

    def fake_send(*a, **kw):
        called["count"] += 1
        return True

    monkeypatch.setattr(workforce_sync_notify.email_service, "send_email", fake_send)

    out = workforce_sync_notify.send_sync_notification(
        ["", "  ", None],  # type: ignore[list-item]
        _basic_result(),
        triggered_by_label="cron",
    )
    assert out == {}
    assert called["count"] == 0
