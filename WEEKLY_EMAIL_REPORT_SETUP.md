# Weekly Email Hours Report — Deployment Guide

## Render deployment

Render has native **Cron Job** services — use that instead of the
docker-compose `scheduler` container.

### 1. Create the Cron Job

Dashboard → **New +** → **Cron Job**

| Field | Value |
|---|---|
| Name | `arsenal-ops-weekly-report` |
| Region | same as the backend web service |
| Branch | `main` (or your prod branch) |
| Runtime | `Docker` |
| Dockerfile Path | `backend/Dockerfile`   *(reuses the backend image)* |
| Docker Build Context Directory | `backend` |
| Schedule | `0 1 * * 6`   *(Friday 8 PM EST = Saturday 01:00 UTC — see DST note)* |
| Command | `python -m scripts.send_weekly_report` |
| Instance type | `Starter` is plenty |

### 2. Add env vars to the Cron Job

Render cron jobs run in their **own container** and do **not** inherit env
from the web service. Either set these directly on the cron job, or — cleaner
— create a shared **Environment Group** and link it to both the web service
and the cron job.

```
DATABASE_URL                = (same Render Postgres as the web service)
MAIL_REFRESH_TOKEN          = (same as web service)
BOT_EMAIL                   = DoNotReply@arsenalai.com
SMTP_FROM_NAME              = Arsenal Ops
GOOGLE_CLIENT_ID            = (same as web service)
GOOGLE_CLIENT_SECRET        = (same as web service)
WEEKLY_REPORT_RECIPIENTS    = ops@arsenalai.com,cto@arsenalai.com
```

### 3. Verify

After the cron job deploys:

1. In the cron job's dashboard, click **Trigger Run** to test on-demand.
2. Open the **Logs** tab — you should see
   `Sent weekly report to N recipient(s).` and the email arrives.
3. The next scheduled run timestamp is shown on the overview page.

If `WEEKLY_REPORT_RECIPIENTS` is empty or unset, the script logs
`WEEKLY_REPORT_RECIPIENTS is empty — nothing to send. Exiting cleanly.`
and exits 0 — safe to enable the cron job before recipients are decided.

## DST gotcha (Render is UTC-only)

Render cron expressions are **UTC**; there is no timezone field. `0 1 * * 6`
(Sat 01:00 UTC) corresponds to:

- **EST (winter):** Fri 20:00 ET — exactly 8 PM
- **EDT (summer):** Fri 21:00 ET — drifts to 9 PM

Two acceptable choices:

- **Pick `0 1 * * 6` and accept the 1-hour seasonal drift.** Simplest, what
  we use today.
- **Use `0 0 * * 6` if you'd rather it arrive a bit early in EST** (Fri 19:00 ET
  in winter, exactly 20:00 in summer).

## Optional: `render.yaml` (Infrastructure as Code)

Committing a blueprint makes the cron job reproducible:

```yaml
services:
  - type: web
    name: arsenal-ops-api
    runtime: docker
    dockerfilePath: backend/Dockerfile
    envVars:
      - fromGroup: arsenal-ops-shared

  - type: cron
    name: arsenal-ops-weekly-report
    runtime: docker
    dockerfilePath: backend/Dockerfile
    schedule: "0 1 * * 6"          # 8 PM EST Fri / 9 PM EDT Fri
    buildCommand: ""
    startCommand: python -m scripts.send_weekly_report
    envVars:
      - fromGroup: arsenal-ops-shared

envVarGroups:
  - name: arsenal-ops-shared
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: MAIL_REFRESH_TOKEN
        sync: false
      - key: BOT_EMAIL
        sync: false
      - key: SMTP_FROM_NAME
        value: Arsenal Ops
      - key: GOOGLE_CLIENT_ID
        sync: false
      - key: GOOGLE_CLIENT_SECRET
        sync: false
      - key: WEEKLY_REPORT_RECIPIENTS
        sync: false
```

`sync: false` means "set the value in the Render dashboard, don't sync from
this file" — keeps secrets out of git.

## Local development (Docker Compose)

For local testing the repo includes a `scheduler` service running supercronic.
You don't need this on Render.

```bash
# Trigger the report ad-hoc (uses the backend container)
docker compose up -d backend
docker compose exec backend python -m scripts.send_weekly_report

# Or run it as a one-off without keeping backend up
docker compose run --rm backend python -m scripts.send_weekly_report

# Check the scheduler container is registering the cron entry
docker compose up -d --build scheduler
docker logs arsenal-ops-scheduler | head
```

Local schedule lives in `backend/crontab` (default: Fridays 20:00 local time).
The scheduler container's TZ is set by `WEEKLY_REPORT_TIMEZONE` in `.env`
(default `America/New_York`).

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `WEEKLY_REPORT_RECIPIENTS` | *empty* | Comma-separated recipients. Empty = no-op. |
| `WEEKLY_REPORT_TIMEZONE` | `America/New_York` | TZ for the docker-compose `scheduler` container only (Render uses UTC). |
| `MAIL_REFRESH_TOKEN`, `BOT_EMAIL`, `SMTP_FROM_NAME`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | Gmail OAuth2 send config, shared with the rest of the app. See `EMAIL_SETUP.md`. |
| `DATABASE_URL` | — | Postgres connection string — must point at the same DB the API uses. |

## Schedule changes

- **Render:** edit the cron job's `Schedule` field in the dashboard (or update
  `render.yaml` and redeploy).
- **Local Compose:** edit `backend/crontab`, then `docker compose restart scheduler`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Logs show `nothing to send` | `WEEKLY_REPORT_RECIPIENTS` not set on the cron job | Add it in the Render env vars (separate from the web service) and redeploy the cron job |
| Logs show "Email (Gmail OAuth2) not configured" | One of `MAIL_REFRESH_TOKEN`, `BOT_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` is missing on the cron job | Copy from the web service env vars |
| Recipients receive email, numbers look wrong | Cron job's `DATABASE_URL` points at the wrong DB | Confirm it's the same Postgres the web service uses |
| Report runs at 9 PM ET instead of 8 PM | Daylight Saving Time | Expected; see "DST gotcha" above |
| Cron job never fires | Schedule field is in UTC, not local time | Convert local time to UTC for the cron expression |

## Tests

Unit tests for the report builder live in `backend/test_weekly_report.py`. They
verify the format, the per-project split, the cross-project sum, sorting, the
"no developers" case, and that out-of-week TimeEntries are excluded.

```bash
cd backend
/opt/anaconda3/bin/python -m pytest test_weekly_report.py -v
```

No emails are actually sent during tests — `email_service` is never invoked
because the recipient list is empty in the test fixtures.
