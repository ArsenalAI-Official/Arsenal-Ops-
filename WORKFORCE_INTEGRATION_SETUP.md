# QuickBooks / Workforce Hours Sync

End-to-end documentation for the Arsenal Ops → QuickBooks Online time-sync
integration. Covers the design, the local-development walkthrough (so a single
developer can stand it up against the Intuit sandbox with no help), and the
production rollout (split into Arsenal-developer steps and QuickBooks-admin
steps so the handoff is unambiguous).

The sync logic lives in `backend/services/workforce_sync.py`. Syncs are
triggered **manually** by an admin clicking **Sync Now** in the Integrations
tab — there is no scheduled/cron trigger. (An admin must run Sync Now at least
once every ~100 days to keep the OAuth refresh token alive; see the token-TTL
note under "Rate limits & costs".)

---

## Useful URLs (jump table)

Bookmark these once — every step below links into one of them.

### Intuit Developer portal (Arsenal developer's account — sandbox + production OAuth app live here)

| Purpose | Link |
|---|---|
| Sign in / sign up | https://developer.intuit.com |
| **My Apps** (all apps you own) | https://developer.intuit.com/app/developer/myapps |
| **Dashboard** (recent activity) | https://developer.intuit.com/app/developer/dashboard |
| **Sandbox companies** (create / launch) | https://developer.intuit.com/app/developer/sandbox |
| Account settings | https://developer.intuit.com/app/developer/account-settings |
| OAuth 2.0 Playground (debug tokens) | https://developer.intuit.com/app/developer/playground |
| Production-keys approval guidance | https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/intuit-app-launch |
| Production app submission checklist | https://developer.intuit.com/app/developer/qbo/docs/get-started/go-live-launch-checklist |

### QuickBooks Online (QB admin's account — real accounting data)

| Purpose | Link |
|---|---|
| Sign in | https://qbo.intuit.com |
| Products and services (Service Items) | https://app.qbo.intuit.com/app/items |
| Customers | https://app.qbo.intuit.com/app/customers |
| Employees (Payroll → Employees) | https://app.qbo.intuit.com/app/employees |
| Time (TimeActivity records) | https://app.qbo.intuit.com/app/time |

> The Sandbox QB UI lives at the **same** `https://app.qbo.intuit.com/...` URLs, but inside a browser tab launched via the sandbox launcher (see step 1.5). Sandbox sessions are scoped to that tab.

### Render (hosting)

| Purpose | Link |
|---|---|
| Dashboard | https://dashboard.render.com |
| Create a new service | https://dashboard.render.com/select-repo |
| Environment groups | https://dashboard.render.com/env-groups |

### Intuit API reference (for debugging only — not needed for routine setup)

| Purpose | Link |
|---|---|
| QBO API overview | https://developer.intuit.com/app/developer/qbo/docs/get-started |
| **TimeActivity** endpoint (what we POST) | https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/timeactivity |
| **Employee** endpoint (lookup) | https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/employee |
| **Customer** endpoint (cached list) | https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/customer |
| **Item** endpoint (Service Item resolution) | https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/item |
| **CompanyInfo** endpoint (display name) | https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/companyinfo |
| OAuth 2.0 details | https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0 |
| Rate limits & throttles | https://developer.intuit.com/app/developer/qbo/docs/learn/rest-api-features#limits-and-throttles |
| Webhook + general dev FAQ | https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/overview |

---

## What the sync does on each run

1. Resolves the Mon–Fri of the calendar week the trigger fires in.
2. Pulls TimeEntries logged in that window whose project is tagged to a QB Customer and that aren't already in QuickBooks.
3. Looks up each developer's QB Employee by email (case-insensitive); skips with a logged reason if no match.
4. Posts each entry to QuickBooks `/timeactivity` under Service Item "Hours" (HR-mandated).
5. Stores the QB TimeActivity Id back on the row so re-runs are idempotent.

**Trigger — manual only.** An admin clicks **Sync Now** in the Integrations
tab; this calls `POST /api/admin/workforce/sync`, which invokes the sync
function inline. On completion it sends an HTML summary email to the admin who
clicked (template: `services/workforce_sync_notify.py` — status pill, count
cards, error/notes block). Email failures are logged and swallowed; a
misconfigured Gmail never fails a successful sync.

> There is no scheduled trigger. The CLI (`python -m scripts.run_workforce_sync`)
> still exists for on-demand/manual runs, but nothing invokes it on a schedule.

---

## Architecture

```
┌─────────────────┐    OAuth 2.0     ┌──────────────────┐
│ Arsenal Backend │ ───────────────▶ │  Intuit Auth     │
│                 │ ◀─── tokens ──── │  Server          │
└────────┬────────┘                  └──────────────────┘
         │ stores: realm_id, refresh_token (encrypted),
         │         service_item_id ("Hours")
         ▼
┌─────────────────┐
│ workforce_      │  singleton — one connection per Arsenal install
│ integration row │
└────────┬────────┘
         │  Triggered by:
         │   manual "Sync Now" — admin button (no scheduled trigger)
         ▼
┌──────────────────────────────────────────────┐
│ Sync worker                                  │
│ For each TimeEntry where:                    │
│   project.workforce_client_id IS NOT NULL    │
│   AND workforce_entry_id IS NULL             │
│                                              │
│ 1. Look up QB Employee by Arsenal email      │
│ 2. POST /v3/.../timeactivity with:           │
│      EmployeeRef + CustomerRef +             │
│      ItemRef("Hours") + Hours + TxnDate +    │
│      Description                             │
│ 3. Store returned TimeActivity Id            │
└──────────────────────────────────────────────┘
```

Three key design choices:

- **One-time admin OAuth, not per-user.** Backend stores a long-lived refresh token (~100-day TTL, auto-renewed on each use). Subsequent syncs run server-side with no further user interaction. The backend writes on behalf of employees by setting `EmployeeRef`. (Because there's no scheduled sync, that "each use" renewal only happens when an admin actually clicks Sync Now — see the token-TTL note under "Rate limits & costs".)
- **Email-based employee mapping at sync time.** If an Arsenal email doesn't match any QB Employee, that entry is skipped + a reason is recorded. The sync never fails wholesale on a single missing employee.
- **Idempotent via `TimeEntry.workforce_entry_id`.** Once a TimeEntry has a QB id stored, the worker skips it. Re-running the sync (or two admins clicking **Sync Now** at once) never double-pushes.

---

## Data model

### New table — `workforce_integration` (singleton row)

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | always `1` — single connection per Arsenal install |
| `realm_id` | VARCHAR | QB company id from OAuth callback |
| `company_name` | VARCHAR NULL | display label — fetched via QB `CompanyInfo` at connect time |
| `refresh_token_ciphertext` | TEXT | Fernet-encrypted; key in `WORKFORCE_TOKEN_ENCRYPTION_KEY` |
| `access_token_ciphertext` | TEXT NULL | short-lived (~1h), re-minted from refresh on demand |
| `access_token_expires_at` | TIMESTAMP NULL | when to refresh |
| `service_item_id` | VARCHAR NULL | QB id of "Hours" Service Item, resolved + cached |
| `service_item_name` | VARCHAR NULL | display only (`"Hours"`) |
| `connected_at` | TIMESTAMP | audit |
| `connected_by_user_id` | INTEGER FK → users | audit |
| `last_sync_at` | TIMESTAMP NULL | observability |
| `last_sync_status` | VARCHAR | `ok` \| `partial` \| `error` \| `no_eligible` \| `not_connected` \| `locked` |
| `last_sync_error` | TEXT NULL | top-level reason if `last_sync_status` ≠ `ok` |
| `last_synced_count` / `last_failed_count` | INTEGER | run-level counters |

### New table — `workforce_clients` (cached QB Customer list)

Read by the per-project picker so opening the dropdown is free of Intuit round-trips. Refreshed by the OAuth callback (eager seed), each sync run (preflight), and a manual "Refresh clients" button. Soft-delete pattern (`active=False`) so projects already tagged to a deactivated customer keep rendering the cached name.

### Additions to existing tables

`projects`:

| Column | Type | Notes |
|---|---|---|
| `workforce_client_id` | VARCHAR(64) NULL | QB Customer id (null = not linked, won't be synced) |
| `workforce_client_name` | VARCHAR(255) NULL | cached display label for picker / list UX |

`time_entries`:

| Column | Type | Notes |
|---|---|---|
| `workforce_entry_id` | VARCHAR(64) NULL | QB TimeActivity id once synced; sync worker filters on `IS NULL` |

A TimeEntry is **eligible for sync** when:

```sql
project.workforce_client_id IS NOT NULL
  AND time_entries.workforce_entry_id IS NULL
```

Migrations run on backend boot via `database.py::run_migrations()` — idempotent `ALTER TABLE` guarded by column-existence checks. Re-running them on an up-to-date DB is a no-op.

---

## API surfaces & capabilities

| Method | Path | Capability | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/workforce/status` | `admin.workforce_connect` | connection state + last-sync info |
| `POST` | `/api/admin/workforce/connect` | `admin.workforce_connect` | returns the Intuit OAuth URL (signed `state` token) |
| `GET` | `/api/auth/workforce/callback` | state-token verified | OAuth callback; persists tokens |
| `POST` | `/api/admin/workforce/disconnect` | `admin.workforce_connect` | revokes tokens at Intuit + drops the row |
| `GET` | `/api/admin/workforce/clients` | `admin.workforce_connect` | cached QB Customer list for the picker |
| `POST` | `/api/admin/workforce/clients/refresh` | `admin.workforce_connect` | force-refresh the cached customer list |
| `PUT` | `/api/admin/workforce/projects/{id}/client` | `admin.projects_write` | links/unlinks a project to a QB Customer |
| `POST` | `/api/admin/workforce/sync` | `admin.workforce_connect` | manual sync trigger |

**`admin.workforce_connect`** is a dedicated capability (registered in `backend/capabilities.py`). It is **not** inherited from `admin.projects_write` — those are two separate concerns. Default seed: granted only to the system `admin` role.

---

# Part 1 — Local Development

**Audience:** an Arsenal developer setting up the integration on their laptop and exercising it end-to-end against the **Intuit sandbox**. No real QuickBooks admin is involved — you are the admin of your own sandbox company.

**Time:** 30–45 minutes from a clean machine.

**Prerequisites:**

- Arsenal Ops backend + frontend running locally (typically via `docker compose up`).
- An Intuit account (free; create one in step 1.1 if you don't have one).
- Python 3.11+ available locally (only used to generate the Fernet key in step 1.6).

---

### Step 1.1 — Sign in to the Intuit Developer portal

1. Open https://developer.intuit.com.
2. Click **Sign in** (top right). If you don't have an Intuit account, click **Sign up** at https://developer.intuit.com/signup — any email works; it does not need to be tied to a QuickBooks company.
3. After sign-in you land on the **My Apps** page at https://developer.intuit.com/app/developer/myapps.

### Step 1.2 — Create the Intuit Developer app

1. Open the My Apps page: https://developer.intuit.com/app/developer/myapps. Click **Create an app** (top right). If the button isn't visible directly, use https://developer.intuit.com/app/developer/myapps?createApp=1 which jumps straight to the creation modal.
2. Choose **QuickBooks Online and Payments**. (Not "QuickBooks Desktop" or "Sign in with Intuit only".)
3. Name it something like `Arsenal Ops Workforce Sync — Dev`.
4. On the scope picker, select **`com.intuit.quickbooks.accounting`** only. (We don't use payments or payroll APIs.)
5. Click **Create app**.
6. You land on the new app's home page; the URL pattern is `https://developer.intuit.com/app/developer/qbo/keys/development/<app-uuid>`. Bookmark it.

### Step 1.3 — Grab the development credentials

1. From the app's home page (bookmarked in 1.2), the URL above already opens **Keys and credentials → Development**. If you navigate away, the breadcrumb is:
   - https://developer.intuit.com/app/developer/myapps → click your app → **Keys and credentials** (left sidebar) → make sure the top toggle says **Development**.
2. Copy these two values somewhere safe — you'll paste them into `.env` in step 1.7:
   - **Client ID**
   - **Client Secret**

### Step 1.4 — Register the local redirect URI

On the same Keys and credentials page (Development section), scroll to **Redirect URIs** and add exactly:

```
http://localhost:8000/api/auth/workforce/callback
```

Click **Save**.

> The URI registered here must **exactly match** the `INTUIT_REDIRECT_URI` env var (step 1.7). Protocol, host, port, path — all must match. A trailing slash difference will reject the callback.

> Reference: how Intuit enforces redirect URI matching → https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#redirect-uri

### Step 1.5 — Create a sandbox QuickBooks company

Sandboxes are **account-level**, not per-app (the UI moved this in 2024 — there's no "Sandbox" item in the per-app sidebar anymore).

1. Open the sandbox manager directly: https://developer.intuit.com/app/developer/sandbox.
2. If the table is empty (`QuickBooks Online (0)`), click the blue **Add** button (top right).
3. Pick:
   - **Product:** QuickBooks Online
   - **Region:** United States (most features supported)
4. Click **Create**. Takes ~10 seconds.
5. The table now shows one row. In the **Actions** column click the launch icon — this opens https://app.sandbox.qbo.intuit.com in a new tab with a fully-functional QuickBooks Online session. You're the admin of this sandbox by default.

> **Keep this sandbox tab open** — you'll use it in step 1.9 and again in step 1.14. The sandbox URL format is `https://app.sandbox.qbo.intuit.com/app/...` (note the `sandbox` subdomain — that's how you can tell a sandbox tab from a real-QB tab at a glance).
>
> Reference: sandbox docs → https://developer.intuit.com/app/developer/qbo/docs/develop/sandboxes

### Step 1.6 — Generate the local Fernet encryption key

Run this once on your laptop:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

You'll get a 44-char base64 string like `EAB9...xK4=`. Copy it for the next step.

### Step 1.7 — Add the workforce env vars to your local `.env`

Open the repo-root `.env` (or `backend/.env` — whichever your local setup uses) and append the **five** variables below. Keep any existing entries.

```
INTUIT_CLIENT_ID=<from step 1.3>
INTUIT_CLIENT_SECRET=<from step 1.3>
INTUIT_REDIRECT_URI=http://localhost:8000/api/auth/workforce/callback
INTUIT_API_BASE_URL=https://sandbox-quickbooks.api.intuit.com
WORKFORCE_TOKEN_ENCRYPTION_KEY=<from step 1.6>
```

> The OAuth / token / revoke URLs default to Intuit's production endpoints, which is correct — those endpoints are **the same** for sandbox and production. **Only the API base URL** differs between sandbox and production.

> Also make sure `FRONTEND_URL=http://localhost:5173` is set in the same `.env`. The OAuth callback uses it to build the post-handshake redirect; without it the browser lands on the backend host and renders `{"detail":"Not Found"}`.

### Step 1.8 — Recreate the backend container so it picks up the new env

The five workforce vars are already wired into `docker-compose.yml` under `services.backend.environment`, so the file itself needs no edits. A plain `docker compose restart backend` is **not enough** — env changes only reach the container on recreate.

```bash
docker compose up -d --force-recreate backend
docker compose logs -f backend
```

On first boot watch for these migration log lines:

```
[MIGRATION] Adding projects.workforce_client_id...
[MIGRATION] Adding projects.workforce_client_name...
[MIGRATION] Adding time_entries.workforce_entry_id...
```

If you see them, the schema is ready. They run once per fresh column; subsequent restarts skip them silently.

### Step 1.9 — Set up the sandbox QuickBooks company

Switch to the sandbox QB tab from step 1.5 (URL starts with `https://app.sandbox.qbo.intuit.com/...`) and do all three of:

**1.9.a — Create the "Hours" Service Item**

1. Direct link: https://app.sandbox.qbo.intuit.com/app/items (or via UI: gear icon top right → **Products and services**).
2. Click the green **New** button → **Service**.
3. **Name:** `Hours` — exact spelling, **case-sensitive**. The sync queries for this exact name; `hours` or `HOURS` will not match.
4. **Income account:** pick any service-revenue account from the dropdown (defaults are fine for sandbox).
5. Click **Save and close**.

**1.9.b — Set an employee email matching your Arsenal login**

1. Direct link: https://app.sandbox.qbo.intuit.com/app/employees (or via UI: left nav → **Payroll** / **Workers** → **Employees**).
2. Click any pre-seeded employee → **Edit** at the top of their profile.
3. Set **Email** to whatever your Arsenal user's email is (e.g. `sahil.fayaz@arsenalai.com`).
4. **Save**.

> The sync matches Arsenal `developer.email` against QB `Employee.PrimaryEmailAddr` case-insensitively. An exact match (ignoring case) is required. Reference: https://developer.intuit.com/app/developer/qbo/docs/api/accounting/all-entities/employee

**1.9.c — Create a test customer**

1. Direct link: https://app.sandbox.qbo.intuit.com/app/customers (or via UI: left nav → **Sales** → **Customers**).
2. Click the green **New customer** button.
3. **Customer display name:** `Test Client` (or anything memorable).
4. Click **Save**.

This customer is what you'll tag to an Arsenal project in step 1.11.

### Step 1.10 — Connect Arsenal to the sandbox

1. Browser → `http://localhost:5173` (or wherever your frontend runs).
2. Sign in with an Arsenal account that has the `admin.workforce_connect` capability. The default `admin` system role has it.
3. **Admin → Integrations** tab.
4. Click **Connect QuickBooks**.
5. You're redirected to Intuit's consent page. Sign in with your developer account if prompted.
6. On the company picker, choose your **sandbox** company.
7. Click **Connect**.
8. You bounce back to Arsenal at `/admin?tab=integrations&workforce=connected`.

**Expected outcome on the Integrations card:**
- Green **Connected** pill
- **QuickBooks Company:** sandbox company name (fetched from `CompanyInfo`)
- **Service Item:** Hours
- **Connected:** today's timestamp
- **Last Sync:** Never
- Status badge: "Not yet run"

**If you instead see `?workforce=connected&warn=service_item_missing`:** you didn't create the Hours item (step 1.9.a). Create it, then click **Disconnect** → **Connect** again. (Or just click **Sync Now** once — the worker resolves the service item lazily.)

### Step 1.11 — Tag a project to the sandbox customer

1. **Admin → Projects** tab.
2. Pick any project. Below the title you'll see two chips — a **category chip** (Tag icon) and a **QB client chip** (Building icon).
3. The QB client chip says **No QB client** by default. Click it.
4. Select **Test Client** from the dropdown. The chip turns green and shows "Test Client".

### Step 1.12 — Log a test time entry inside the current Mon–Fri window

The sync targets the calendar week containing the trigger. Today is **2026-06-17 (Wednesday)**, so the window is **2026-06-15 → 2026-06-19**.

**Easiest path — log through Arsenal UI, then backdate:**

1. Find a work item in the tagged project.
2. Use the normal Arsenal "Log hours" flow against today's date.
3. Backdate the row directly in the DB so it lands in the window:

```sql
UPDATE time_entries
SET logged_at = '2026-06-16 10:00:00'
WHERE id = <the entry id you just created>;
```

(Substitute today's window if you're following along on a different date.)

### Step 1.13 — Run the manual sync

1. Back to **Admin → Integrations**.
2. Click **Sync Now**.

**Expected toast:** `Synced 1 entry for Jun 15 - Jun 19.`

**Expected card refresh:**
- **Last Sync:** updated to now
- Status badge: green **Healthy**
- "1 synced" footer

### Step 1.14 — Verify the TimeActivity in QuickBooks

1. Switch to your sandbox QB tab.
2. Direct link: https://app.sandbox.qbo.intuit.com/app/time (or via UI: left nav → **Time** / **Workers → Time**).
3. You should see a new entry with:
   - **Employee:** the one whose email you set in 1.9.b
   - **Customer:** Test Client
   - **Service:** Hours
   - **Date:** the date you backdated to
   - **Hours:** whatever you logged
   - **Description:** `[<work-item-key>] <work-item-title> — <your description>`

If it's there, the integration works end-to-end.

> Want to see what the JSON looks like from Intuit's side? Use the OAuth 2.0 Playground at https://developer.intuit.com/app/developer/playground — sign in with your dev account, pick the sandbox company, and run `SELECT * FROM TimeActivity` to dump the raw record. Useful for debugging description / employeeref / hours formatting.

### Step 1.15 — Verify idempotency

1. Without making any changes, click **Sync Now** again in Arsenal.
2. **Expected toast:** `Nothing to sync in Jun 15 - Jun 19.`
3. Switch to QB sandbox → confirm **no new TimeActivity** was created. Only the one from step 1.14 exists.

This proves the worker isn't double-pushing on repeated triggers.

### Step 1.16 — (Optional) Negative-path smoke tests

Pick at least one to confirm the failure modes surface cleanly.

**1.16.a — Unmatched email**
1. In sandbox QB, change the employee's email to something Arsenal doesn't know (e.g. `nobody@nowhere.test`).
2. In Arsenal, log a NEW time entry, backdate it into the window (same SQL as 1.12).
3. Click **Sync Now**.
4. **Expected:** Integration card "Last sync notes" shows `skipped: <your-arsenal-email>: not in QuickBooks`. No new QB TimeActivity.
5. Restore the email afterwards.

**1.16.b — Project not tagged**
1. Unlink the project (chip → **No QB client**).
2. Log a new time entry on that project, backdate into window.
3. Click **Sync Now**.
4. **Expected:** `Nothing to sync in <window>.` The entry is simply ineligible.

**1.16.c — Hours item missing**
1. In sandbox QB, mark the "Hours" service item as inactive (or delete it).
2. Click **Disconnect** then **Connect** in Arsenal.
3. **Expected:** OAuth completes but you land with `?workforce=connected&warn=service_item_missing`. A subsequent Sync Now returns `Sync failed: 'Hours' service item not found in QuickBooks. Create it in QB then retry.`
4. Recreate the item afterwards.

---

# Part 2 — Production Deployment

Two roles split the work cleanly. Do them in order — section 2A before 2B before 2C.

| Section | Done by | What |
|---|---|---|
| **2A** — Developer pre-work | Arsenal developer / devops | Provisions production credentials and env vars. Prepares everything **except** the OAuth click. |
| **2B** — QB admin handoff | Real QuickBooks admin | The **only** person who can sign Arsenal into the real QB company. Sets up the QB-side prerequisites and clicks Connect. Designed to be sent verbatim to the QB admin. |
| **2C** — Developer wrap-up | Arsenal developer / devops | Tags projects, confirms first sync. |

**Why the split:** Intuit's OAuth flow inherits the connecting user's QB permissions. If a non-admin clicks Connect, Intuit either refuses or returns a read-only token that cannot write TimeActivity. So the actual Connect click in 2B **must** be done by the QB admin in person.

---

## Part 2A — Developer pre-work

> **Two Intuit accounts, do not confuse them:**
>
> | Site | Logged in by | What's there |
> |---|---|---|
> | **developer.intuit.com** | The Arsenal developer (the same person doing 2A — free signup, no QB subscription required) | The OAuth app, Client ID / Secret, redirect URIs, sandboxes |
> | **qbo.intuit.com** | The QB admin (a paid QuickBooks Online subscriber) | The actual accounting data — employees, customers, time activities |
>
> Everything in **Part 2A** happens on **developer.intuit.com** under the Arsenal developer's Intuit Developer account. The QB admin is **not** involved at all in 2A — they never sign into the developer portal.

### Step 2.1 — Confirm sandbox testing succeeded

Do **not** start this section until Part 1 has been completed end-to-end on a sandbox. If sandbox sync, idempotency, and at least one negative path haven't been validated, fix those first.

### Step 2.2 — Generate the production Fernet encryption key

Run **once**, on a trusted machine:

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

This is a **different** key from the local-dev one. Treat it like a production database password:

- **Never** commit it to git.
- **Never** put it in the local `.env`.
- Paste it into Render's secret store in step 2.5.

> The key is set once, on the Render web service. If it's ever changed while an
> integration is connected, the stored tokens can no longer be decrypted and
> every sync fails with a "reconnection required" error until an admin
> Disconnects + Connects again.

### Step 2.3 — Get the production Intuit credentials

*Done by the Arsenal developer, on **developer.intuit.com**. Same Intuit Developer account that owns the dev app from step 1.2. The QB admin is not involved here.*

1. Sign in: https://developer.intuit.com.
2. Open the **My Apps** page: https://developer.intuit.com/app/developer/myapps. Click the app you created in step 1.2 (named something like `Arsenal Ops Workforce Sync — Dev`).
3. In the app, left sidebar → **Keys and credentials**. The URL pattern for the Production section is `https://developer.intuit.com/app/developer/qbo/keys/production/<app-uuid>` — bookmark it once you're there.
4. At the top of the page, toggle from **Development** to **Production**.
5. If the Production section says **"No keys yet"** or shows a **"Get production keys"** button:
   - Click **Get production keys**.
   - Intuit walks you through the **App Assessment Questionnaire** (https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/intuit-app-launch). For an internal accounting-only integration the form is short:
     - **App name + support email** — your real values.
     - **Privacy policy / Terms of Service / EULA URLs** — required even for internal apps. Host them anywhere reachable (e.g. a doc on your company site or a public GitHub gist).
     - **Host domain** — your `FRONTEND_URL` host (e.g. `app.arsenalai.com`).
     - **Scopes** — confirm `com.intuit.quickbooks.accounting` only.
   - Submit. Accounting-only integrations are usually approved within minutes (occasionally up to one business day). The dashboard shows a **Pending review** badge if held.
6. Once approved, the Production section shows the live credentials. Copy:
   - **Production Client ID**
   - **Production Client Secret**

> **These are DIFFERENT from the sandbox / development values.** Don't reuse the development keys.

> Full go-live checklist (worth a one-time read): https://developer.intuit.com/app/developer/qbo/docs/get-started/go-live-launch-checklist

### Step 2.4 — Register the production redirect URI

Same Keys and credentials page from step 2.3, but make sure you're still in the **Production** section (top toggle). Scroll to **Redirect URIs** → add the production callback (substitute your real API host):

```
https://<your-api-host>/api/auth/workforce/callback
```

Click **Save**. Match it **exactly** to the `INTUIT_REDIRECT_URI` you set in step 2.5 — protocol, host, port, path. Trailing slashes count.

> The same URI-matching rules apply as in the sandbox. Reference: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0#redirect-uri

### Step 2.5 — Set env vars on the Render web service (the API)

1. Open the Render dashboard: https://dashboard.render.com.
2. Click the Arsenal Ops backend web service (the API). Its URL will look like `https://dashboard.render.com/web/srv-<id>`.
3. Left sidebar of the service → **Environment**.
4. Add (or update) these five variables:

```
INTUIT_CLIENT_ID=<from step 2.3>
INTUIT_CLIENT_SECRET=<from step 2.3>
INTUIT_REDIRECT_URI=https://<your-api-host>/api/auth/workforce/callback
INTUIT_API_BASE_URL=https://quickbooks.api.intuit.com
WORKFORCE_TOKEN_ENCRYPTION_KEY=<from step 2.2>
```

5. Also confirm `FRONTEND_URL=https://<your-spa-host>` is set on the web service (usually already there from earlier setup — but the OAuth post-redirect breaks without it).
6. Click **Save Changes**. Render will trigger a redeploy on save.

> Render env var docs (for syntax of secrets, env groups, etc.): https://render.com/docs/environment-variables

### Step 2.6 — Deploy the backend with the new env

Trigger a redeploy of the web service so the env vars take effect. Wait until the deploy is healthy and the `/api/admin/workforce/status` endpoint returns:

```json
{ "connected": false, ... }
```

If it returns 500 or "encryption key not configured", re-check step 2.5.

### Step 2.7 — Hand off to the QB admin

Send the QB admin **Part 2B verbatim** (it's self-contained — they don't need to read anything else in this doc). Suggested message:

> Hey [QB admin], we're enabling QuickBooks time-sync from Arsenal Ops. There's a one-time setup on your end — about 15 minutes total. The steps are in this doc under "Part 2B — QuickBooks admin steps." Once you finish the "Connect QuickBooks" step and the card shows **Connected**, ping me back and I'll finish the rest.

Wait until you get the "done" ping before continuing to Part 2C.

---

## Part 2B — QuickBooks admin steps

**Audience:** the person who is the **administrator of the real Arsenal QuickBooks Online company**. (Not a sandbox; the real production QB company.)

**Time:** ~15 minutes.

**What you need:**

- Admin access to the real Arsenal QuickBooks Online company. Sign-in URL: https://qbo.intuit.com.
- An Arsenal Ops login that has the `admin.workforce_connect` capability (your devops contact will have granted this).
- The Arsenal Ops admin URL — something like `https://<your-arsenal-host>/admin?tab=integrations`. Devops will give you the actual hostname.

**Quick links you'll use in this section:**

| Step | Link |
|---|---|
| 2.8 — Create Hours Service Item | https://app.qbo.intuit.com/app/items |
| 2.9 — Verify employee emails | https://app.qbo.intuit.com/app/employees |
| 2.10 — Pre-create customers (optional) | https://app.qbo.intuit.com/app/customers |
| 2.11–2.12 — Connect in Arsenal Ops | `https://<your-arsenal-host>/admin?tab=integrations` |

---

### Step 2.8 — Create the "Hours" Service Item in QuickBooks

Even if your QuickBooks company already has time tracking enabled, the sync requires a specific Service Item named exactly `Hours`.

1. Sign in to QuickBooks Online: https://qbo.intuit.com.
2. Open the Products and services page directly: https://app.qbo.intuit.com/app/items (alternatively: gear icon top right → **Products and services**).
3. Click the green **New** button → **Service**.
4. **Name:** `Hours` — exact spelling, case-sensitive. (Not "hours" or "HOURS" or "Time" or "Billable Hours".)
5. **Income account:** pick the service-revenue account your accounting team normally uses for billable time. If unsure, ask them.
6. Leave the SKU, price, and sales-information fields blank — Arsenal Ops fills in the hours per entry.
7. Click **Save and close**.

> Why this exact name: HR mandated a single Service Item for all Arsenal billable hours so finance reports are consistent. The sync looks up this item by name on every connect.

### Step 2.9 — Verify employee emails match Arsenal

The sync matches each Arsenal user's email against a QB Employee's primary email. **Case-insensitive, but otherwise exact.**

1. Open the Employees page directly: https://app.qbo.intuit.com/app/employees (alternatively: left nav → **Payroll** / **Workers** → **Employees**).
2. For each employee whose hours should sync into QB, click their name → **Edit**.
3. Confirm the **Email** field matches the email they use to sign in to Arsenal Ops. Examples:
   - ✅ `firstname.lastname@arsenalai.com` in both systems → matches.
   - ✅ `FirstName.LastName@arsenalai.com` in QB vs `firstname.lastname@arsenalai.com` in Arsenal → matches (case-insensitive).
   - ❌ `flastname@arsenalai.com` in QB vs `firstname.lastname@arsenalai.com` in Arsenal → does **not** match. Update one side.
4. Click **Save** if you edit any record.

If an employee has no email in QB, add one. Time entries for employees with no QB match will be **skipped** (not failed) with a logged reason; you can fix them later without re-running anything.

### Step 2.10 — (Optional) Pre-create QB Customers

If you already maintain QB Customers for each client Arsenal bills against, skip this step.

If not, create them now:

1. Open the Customers page directly: https://app.qbo.intuit.com/app/customers (alternatively: left nav → **Sales** → **Customers**).
2. Click the green **New customer** button.
3. For each client: enter the **Customer display name** matching what the Arsenal team calls them internally (e.g. `Acme Corp`).
4. Other fields are optional; leave them blank.
5. Click **Save**.

> You can also create customers later — projects without a QB Customer tagged are simply ignored by the sync. Pre-creating them lets the developer tag projects in 2C without going back and forth.

### Step 2.11 — Sign in to Arsenal Ops

1. Open the Arsenal Ops URL your devops contact gave you (e.g. `https://app.arsenalai.com`).
2. Direct link to the Integrations tab: `https://app.arsenalai.com/admin?tab=integrations` (substitute the actual hostname).
3. Sign in. You should land on the dashboard or the Integrations tab.

If you don't see an **Admin** option in the navigation, your account is missing the required capability — ping the devops contact and ask them to grant `admin.workforce_connect`.

### Step 2.12 — Connect QuickBooks

1. Navigate to **Admin → Integrations** (direct: `https://<your-arsenal-host>/admin?tab=integrations`).
2. You should see a card titled "QuickBooks Time Sync" with status **Not connected**.
3. Click **Connect QuickBooks**.
4. Your browser opens Intuit's consent page in a new tab/redirect (URL starts with `https://appcenter.intuit.com/connect/oauth2`).
5. If asked to sign in to Intuit, **sign in with your QuickBooks admin account** (not a personal Intuit account — must be the admin of the company being connected). Sign-in URL is the standard https://qbo.intuit.com login.
6. On the company picker, select the **real Arsenal QuickBooks company** (not a sandbox).
7. Click **Connect** to authorize Arsenal Ops to read employees, customers, and write time activities.
8. The browser bounces back to Arsenal at `https://<your-arsenal-host>/admin?tab=integrations&workforce=connected`.

**You should land on the Integrations tab showing:**

- Green **Connected** pill
- **QuickBooks Company:** the real Arsenal company name
- **Service Item:** Hours
- **Connected:** today's timestamp
- **Last Sync:** Never (this is correct — the first sync hasn't run yet)

### Step 2.13 — Verify the connection

Quick visual check that the Integrations card shows everything in step 2.12's expected list. If anything is wrong:

| What you see | What it means | Fix |
|---|---|---|
| `?workforce=connected&warn=service_item_missing` in the URL | The Hours Service Item doesn't exist in QB | Go back to step 2.8, then click **Disconnect** → **Connect** again. |
| `?workforce=error&reason=token_exchange_failed` | Intuit rejected the handshake — usually wrong redirect URI | Ping the devops contact — this is on the Arsenal side. |
| Red badge "Encryption not configured" | Server is missing `WORKFORCE_TOKEN_ENCRYPTION_KEY` | Ping the devops contact. |
| Anything else unexpected | n/a | Screenshot it and ping the devops contact. |

### Step 2.14 — Notify the developer that you're done

Send a quick "connected — over to you" message. The developer will tag billable projects to QB Customers and verify the first sync (Part 2C).

You do **not** need to do anything else after this point. From now on an Arsenal admin pushes hours to QuickBooks by clicking **Sync Now** on the Integrations card (there's no automatic/scheduled sync). If you ever want to disconnect, the **Disconnect** button on the same card revokes Arsenal's access at Intuit immediately.

---

## Part 2C — Developer wrap-up

### Step 2.15 — Tag projects to QB Customers

Once the QB admin completes 2B, the per-project picker is fully populated with the real QB customer list.

1. Direct link: `https://<your-arsenal-host>/admin?tab=projects` (alternatively: **Admin → Projects** in the Arsenal nav).
2. For each project that should be billed to QB: click its **QB client chip** → pick the QB customer from the dropdown.
3. Repeat for every billable project.

Projects without a QB client tag are **ignored** by the sync — there is no error, they're simply not eligible. You can leave non-billable / internal projects untagged.

### Step 2.16 — Trigger a first manual sync

1. Direct link: `https://<your-arsenal-host>/admin?tab=integrations` (alternatively: **Admin → Integrations**).
2. Click **Sync Now**.
3. The toast shows the run result — `Synced N entries for <window>` or `Nothing to sync in <window>` if no eligible entries exist in the current Mon–Fri window.
4. If you triggered the click as an authenticated admin, you also receive an HTML summary email (provided Gmail OAuth2 is configured per the existing weekly-report setup — see `EMAIL_SETUP.md`).
5. **Verify in QuickBooks:** open https://app.qbo.intuit.com/app/time in the real (non-sandbox) QB tab → confirm the new TimeActivity records appear with the right Employee + Customer + Hours.

### Step 2.17 — Confirm the integration is healthy

On the Integrations card, confirm **Last Sync** now shows a timestamp and the status badge is green. That's the whole rollout — there is no cron job to verify.

> **Keep the connection alive.** Because sync is manual-only, the OAuth refresh
> token is only renewed when an admin clicks **Sync Now** (or **Refresh
> clients**). Intuit expires an unused refresh token after ~100 days — so if
> nobody syncs for that long, the next attempt fails with a "reconnection
> required" error and an admin must **Disconnect → Connect** again. Running
> Sync Now on any regular cadence (e.g. weekly at payroll time) keeps it alive
> indefinitely.

Production rollout is complete.

---

## Local development (alternative trigger methods)

The default local-dev setup uses the **Sync Now** button from the UI (covered in Part 1). For automation experiments:

```bash
# A. Run the sync on demand against the dev DB.
docker compose exec backend python -m scripts.run_workforce_sync

# B. Run via the manual API endpoint (must be signed in as an admin
#    with admin.workforce_connect; token from a normal login).
curl -X POST http://localhost:8000/api/admin/workforce/sync \
  -H "Authorization: Bearer $TOKEN"
```

Both run the exact same sync the **Sync Now** button does. There is no scheduled trigger in any environment — sync is always initiated by an admin (the button) or on demand (the commands above).

---

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `INTUIT_CLIENT_ID` | — | Intuit developer app client id (different between Development and Production keys) |
| `INTUIT_CLIENT_SECRET` | — | Intuit developer app client secret |
| `INTUIT_REDIRECT_URI` | — | OAuth redirect URI — must match the URI registered in the Intuit app exactly. |
| `INTUIT_OAUTH_BASE_URL` | `https://appcenter.intuit.com` | Override for tests; same for sandbox + production |
| `INTUIT_TOKEN_URL` | `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` | Override for tests; same for sandbox + production |
| `INTUIT_REVOKE_URL` | `https://developer.api.intuit.com/v2/oauth2/tokens/revoke` | Override for tests; same for sandbox + production |
| `INTUIT_API_BASE_URL` | `https://quickbooks.api.intuit.com` | **THIS is the sandbox/prod toggle.** Set to `https://sandbox-quickbooks.api.intuit.com` for sandbox. |
| `WORKFORCE_TOKEN_ENCRYPTION_KEY` | — | Fernet key. Generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`. Set on the web service; changing it while connected breaks decryption until reconnect. |
| `FRONTEND_URL` | `http://localhost:5173` | Origin of the SPA. The OAuth callback builds `${FRONTEND_URL}/admin?tab=integrations` to bounce the admin's browser back to the Integrations tab after Connect completes. Already used by other Arsenal flows. |
| `DATABASE_URL` | — | Postgres connection string — must point at the same DB the API uses |
| `WEEKLY_REPORT_RECIPIENTS` | *empty* | Comma-separated emails for the existing weekly hours report. The manual QuickBooks sync additionally emails its summary to the admin who clicked **Sync Now**. |
| Gmail OAuth2 env (`MAIL_REFRESH_TOKEN`, `BOT_EMAIL`, `SMTP_FROM_NAME`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) | — | Required to actually deliver the sync notification email. Same setup as the existing weekly report (see `EMAIL_SETUP.md`). If not configured, the sync still runs — the email send logs a warning and is skipped. |

---

## Rate limits & costs

### Cost

The integration itself is **free**. Intuit doesn't charge per API call, per OAuth handshake, or for sandbox usage. You pay for your existing QuickBooks Online subscription (any QBO tier — Simple Start, Essentials, Plus, Advanced — supports the TimeActivity endpoint we use); the integration doesn't push you to a higher tier.

There is **no incremental hosting cost**: the sync runs inline in the existing backend web service when an admin clicks **Sync Now** — there's no separate scheduler/cron service to pay for.

### Intuit QBO API rate limits

Intuit publishes the following limits per QB Online realm (your QB company). These are **soft** — bursts above them get throttled but don't permanently penalize the account.

| Limit | Value | Notes |
|---|---|---|
| Throttle limit per realm | **500 requests / minute** | Sustained. Bursting above briefly is OK. |
| Per-second cap | **40 requests / second** | Effectively the same as above, just smaller window. |
| Concurrent connection limit | 10 connections per realm | We never come close — sync is sequential. |
| Daily soft cap | Not officially published; reports suggest >100k/day | Far above any plausible Arsenal workload. |

> Always cross-check against Intuit's current docs at
> https://developer.intuit.com/app/developer/qbo/docs/learn/rest-api-features#limits-and-throttles
> — they revise these periodically.

### Arsenal's expected volume

A typical **Sync Now** run at Arsenal makes:

| Operation | Calls / run |
|---|---|
| `fetch_qb_employees` (one query at sync start) | 1 |
| `resolve_service_item` (only if `service_item_id` is null) | 0–1 |
| `post_time_activity` (one per eligible TimeEntry) | ~50–200 |
| **Total per sync run** | **~50–202** |

Spread across ~30 seconds (all over one reused keep-alive connection). **About 7 requests/second peak — roughly 1.4% of the 500/min limit.** You will never hit the limit in normal operation.

### What happens if we do hit a limit

Intuit returns HTTP 429. The sync worker catches this and:

1. **Stops the run gracefully** — no further `post_time_activity` calls in the same run. The remaining entries are *not* counted as failed; they're just untried.
2. **Returns `status=partial`** with reason `rate_limited; resumes next run` — surfaced to the admin in the Integrations card.
3. **Commits whatever was already pushed** — per-entry commits inside the loop mean nothing is lost; the next run picks up where we left off.

Worst case from hitting a rate limit: a one-week delay in fully draining the queue. No double-posts, no lost work, no manual intervention required.

### Other rate-limit-adjacent things to know

- **OAuth handshake** is unmetered. The Connect button doesn't consume API quota.
- **Refresh token** rolls every time we mint an access token (about once an hour during a sync). Intuit doesn't rate-limit refreshes separately from API calls.
- **The ~100-day refresh-token TTL** is the only timer that can quietly kill the integration, and with **no scheduled sync it is no longer auto-kept-alive** — the token only rolls when an admin runs **Sync Now** (or **Refresh clients**). If nobody syncs for >100 days, the next run fails with `status=error, reason=oauth_failed` and needs a Disconnect → Connect (see Troubleshooting). Running Sync Now on any regular cadence (e.g. weekly at payroll time) keeps it rolling indefinitely.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `status=not_connected` in logs / UI | No admin has finished the QB OAuth flow yet | Admin → Integrations → **Connect QuickBooks** |
| `status=error, reason=could_not_resolve_service_item` | "Hours" Service Item doesn't exist in the QB realm | Create a Service Item named exactly `Hours` in QuickBooks, then re-run the sync |
| `status=partial, reason=rate_limited; resumes next run` | Hit Intuit's per-realm rate limit (rare at our volume) | None — next run picks up the remainder |
| Many `skipped` entries with `not in QuickBooks` | Developer emails don't match QB employee emails | Check each developer's Arsenal email matches their QB Employee primary email exactly (case-insensitive) |
| `status=error, reason=oauth_failed` | Refresh token revoked or aged out (~100-day TTL with no refresh) | Admin → Integrations → **Disconnect** then **Connect** again |
| Sync Now runs but no entries push | No projects have been tagged with a QB Customer | Admin → Projects → click the QB client chip on each billable project |
| `status=error, reason=...reconnection required...the stored credentials could not be decrypted` | `WORKFORCE_TOKEN_ENCRYPTION_KEY` changed since the integration was connected | Restore the original key if you have it, otherwise Disconnect + Connect again to re-encrypt with the current key |
| `INTUIT_REDIRECT_URI is not set` on Connect | Env var missing on web service | Set it, redeploy. URI must match the one registered in the Intuit app. |
| OAuth completes but lands on `workforce=error&reason=bad_state` | State token expired (10-min TTL) — admin took too long to click through Intuit | Click Connect again and complete within 10 minutes |
| OAuth lands on `workforce=connected&warn=service_item_missing` | "Hours" item didn't exist at connect time | Create the item in QB, then click Sync Now — the worker resolves it lazily |
| After Connect, browser shows `{"detail":"Not Found"}` at `:8000/admin?...` | `FRONTEND_URL` is unset, so the post-OAuth redirect falls back to a host the backend doesn't serve | Set `FRONTEND_URL=http://localhost:5173` (or your SPA origin) in `.env`, recreate the backend container |
| Refresh-clients button returns 401 / "reconnection required" | Stored refresh token rejected by Intuit (revoked at QB side, or aged past TTL) | Disconnect + Connect again — the cached client list is rebuilt on reconnect |

---

## Tests

Unit tests for the integration live in `backend/tests/`:

| File | Coverage |
|---|---|
| `test_workforce_sync.py` | Window resolution, eligibility filtering, idempotency, skip paths, error paths, OAuth failures mid-run, lazy service-item resolution, observability writes. |
| `test_workforce_clients.py` | Cached customer refresh, add/update/deactivate deltas, soft-delete semantics, cross-realm hygiene. |
| `test_workforce_sync_notify.py` | HTML email template — status pill colors, count cards, window formatting, recipient handling. |

Network-dependent code (QB API, OAuth refresh, Gmail send) is mocked at the import site — no real Intuit calls happen during tests.

```bash
cd backend
python -m pytest tests/test_workforce_sync.py tests/test_workforce_clients.py tests/test_workforce_sync_notify.py -v
```

---

## Security & architecture notes

| Concern | Mitigation |
|---|---|
| **OAuth client secret exposure** | `INTUIT_CLIENT_ID` / `INTUIT_CLIENT_SECRET` in env only. Never committed. Loaded once at startup; never returned in API responses. |
| **Refresh token at rest** | Encrypted with Fernet symmetric crypto. Key in `WORKFORCE_TOKEN_ENCRYPTION_KEY`. Independent of the OAuth client secret so they can be rotated separately. |
| **OAuth state forgery (CSRF on the handshake)** | Cryptographically random `state` value, signed with the app's session secret, bound to the initiating user's id + a 10-minute TTL. Validated on `/callback`. |
| **Callback URL spoofing** | Intuit Developer console pins the redirect URI; only our exact callback URL is allowed by Intuit. |
| **Privilege escalation** | `admin.workforce_connect` is its own new capability — not inherited from `admin.projects_write` or any wildcard. Default seed: only the system `admin` role holds it. |
| **Audit trail** | Every connect / disconnect / sync logs an `ActivityLog` row with `action ∈ { workforce_connect, workforce_disconnect, workforce_sync }`. Includes user id + timestamp + counts. |
| **Rate-limit accidental DoS** | Per-realm batch cap. Respects `429`. Stops batching at rate limit + defers to next run. |
| **Email-mismatch handling** | Soft fail (skip + record reason). Never throws, never sends hours to the wrong person, never auto-creates QB employees. |
| **HTTPS only** | Both the Intuit callback URL and the Intuit API calls require HTTPS. Enforced by Intuit; double-checked by the backend in production. |
| **Token logging** | Tokens NEVER appear in logs, error messages, or API responses. The integration row's `to_safe_dict()` redacts them by default. |

Other implementation notes:

- **Refresh token rotation:** Intuit rotates refresh tokens on every refresh call. The sync worker handles persistence via `ensure_fresh_access_token` → `persist_tokens`. Don't try to use an env var instead of the DB row — refresh tokens are mutable per refresh.
- **Singleton integration row:** the `workforce_integration` table holds at most one row (`id=1`). One Arsenal install = one QB realm.
- **Per-project tagging:** a project is "eligible for sync" when `projects.workforce_client_id IS NOT NULL`. Removing the tag stops new entries from being eligible but doesn't undo entries already pushed.
- **Idempotency:** `time_entries.workforce_entry_id IS NULL` is the eligibility filter. A successful push sets it to the QB TimeActivity Id, which is why re-running the sync never duplicates work.
- **Concurrency:** a Postgres advisory lock prevents two concurrent **Sync Now** clicks from overlapping. On SQLite (tests) the lock is a no-op; idempotency from `workforce_entry_id IS NULL` is sufficient there.

---

## Out of scope (deferred)

- Two-way sync (QB → Arsenal).
- Deletion sync (deleting an Arsenal TimeEntry doesn't delete from QB).
- Edit-after-sync propagation. If a TimeEntry is edited in Arsenal after `workforce_entry_id` is set, the change does **not** propagate to QB — the QB record is frozen at first sync. Arsenal-side log-hours is typically write-once, so this is acceptable for MVP.
- Per-developer or per-role Service Items.
- Multi-realm support (one QB company per Arsenal install).
- Auto-creating QB Employees from Arsenal users.
