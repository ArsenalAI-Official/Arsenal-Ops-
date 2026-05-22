# Confirm production database type and remediate data-loss risk

**Type:** Task / Spike
**Priority:** High (potentially P0 if outcome C is confirmed)
**Size:** S — 1–2 days (1–4 hrs investigation, remediation scope determined by findings)

---

## Summary

Confirm what database the production Render deployment is actually running against, whether data persists across deploys, and remediate any data-loss risk. Update `render.yaml`, the bug tracker, and the Postgres+Alembic follow-up plan to match reality.

## Description

The repository's production database configuration has unresolved inconsistencies that may be silently losing data on every Render redeploy. We need to confirm what's actually running before the planned Postgres+Alembic migration (see `.plans/postgres-and-alembic-20260522.md`), because that plan was written on the assumption prod was already on Postgres — if it's actually SQLite-on-ephemeral, the migration loses all production data on cutover unless we plan for it.

**What the repo says (today, on this branch):**

- `render.yaml` declares two services:
  - A web service whose `DATABASE_URL` is populated from `fromDatabase: name: productmind-db` (line 23).
  - A Postgres service with `name: arsenal-ops-db` (line 47).
  - These two names do not match. If the web service is actually getting its connection string from this YAML, it's pointing at a database name that isn't declared in the same file.
- `backend/database.py:11-15` falls back to `sqlite:///./productmind.db` when `DATABASE_URL` is unset. If Render isn't injecting a real `DATABASE_URL`, the app silently runs on a SQLite file on the container's filesystem.
- `render.yaml` declares no `disk:` mount on the `arsenal-ops-api` web service. If prod is on SQLite, that file lives on Render's ephemeral filesystem — wiped on every redeploy.
- `backend/migrate_*.py` startup scripts are a dialect mix: `migrate_add_last_assigned_at.py` uses `PRAGMA table_info` (SQLite-only), `migrate_widen_activity_log_title.py` uses `ALTER COLUMN ... TYPE TEXT` (Postgres-only), `migrate_add_perf_indexes.py` is dialect-neutral. If the running DB is one dialect, half these scripts have been quietly raising or no-opping at every deploy.
- `.github/workflows/keep-alive.yml` pings the service every 10 min — confirms free-tier idle pattern is in use.

**Why this matters now:** the Postgres+Alembic follow-up PR (`.plans/postgres-and-alembic-20260522.md`) needs to be re-scoped depending on what we find. If prod is on Postgres already, that plan is mostly right. If prod is on SQLite-with-persistent-disk, we need a SQLite-to-Postgres data export. If prod is on SQLite-on-ephemeral-disk, we have a quiet ongoing data-loss bug that's higher priority than the Alembic adoption itself.

**Related bug-tracker entries:** P0-9 (no migration system), P1-9 (FK not enforced in SQLite dev), P1-10 (Render service-name mismatch). All three will need updates based on findings.

## Acceptance Criteria

- [ ] **Question 1 — DATABASE_URL.** Captured the value of the `DATABASE_URL` env var as it appears on the running `arsenal-ops-api` service in the Render dashboard. Documented in this ticket as a comment.
- [ ] **Question 2 — Database service.** Confirmed in the Render dashboard whether a database named `productmind-db` exists, and/or whether `arsenal-ops-db` exists. Captured the actual connection string format (Postgres URI vs. anything else) and whether it's a Render-managed Postgres, Supabase, Neon, or other.
- [ ] **Question 3 — Persistent disk.** Confirmed whether a persistent disk is mounted on `arsenal-ops-api`. If yes, the mount path and size.
- [ ] **Question 4 — Data persistence.** Confirmed whether user-visible production data (e.g., a known existing project, work item, or user record) survives a redeploy. The cheapest test: note a recent project's id and timestamp, trigger a redeploy via Render dashboard, verify it's still there.
- [ ] **Findings documented.** A new section in `docs/bug-tracker.md` (or this ticket's comments) captures the four answers and a one-paragraph summary of the actual prod stack.
- [ ] **One of the three remediation paths chosen** (see Technical Notes below) and the appropriate follow-up ticket created.
- [ ] **`render.yaml` updated to match reality.** Either the name mismatch fixed (if Postgres is actually wired up), or the orphan `type: psql` declaration removed (if SQLite is the actual prod DB), or a `disk:` mount added (if SQLite is staying for now).
- [ ] **`P1-10` in `docs/bug-tracker.md` updated** with accurate location info — the current entry says "render.yaml uses `arsenal-ops-db`" but both names appear in that file; fix the description.
- [ ] **`.plans/postgres-and-alembic-20260522.md` updated** with the correct starting-state assumption and, if needed, an added data-export step.
- [ ] **If outcome C is confirmed (ephemeral SQLite losing data),** spawn an urgent sub-ticket for immediate remediation (see "Outcome C" below). This ticket can close once that sub-ticket exists; the sub-ticket carries the urgent fix.

## Technical Notes

### How to answer each question

**Question 1 — DATABASE_URL:**
- Render dashboard → `arsenal-ops-api` service → "Environment" tab → look for `DATABASE_URL`.
- If it's `postgres://...` or `postgresql://...`, prod is on Postgres.
- If it's missing or empty, the app is falling through to the SQLite branch in `backend/database.py:15`.

**Question 2 — Database service:**
- Render dashboard → "Databases" sidebar entry (separate from services).
- Cross-check both names: `productmind-db` and `arsenal-ops-db`. One or both may exist.

**Question 3 — Persistent disk:**
- Render dashboard → `arsenal-ops-api` → "Disks" tab.
- If a disk exists and is mounted at `/app/backend` (or wherever `./productmind.db` resolves), SQLite would persist. Render free tier disks max out at 1 GB.

**Question 4 — Data persistence test:**
- Quickest signal: pick a project that was created at least a week ago via the UI, verify its id, then click "Manual Deploy" in Render. Check that the project still appears after redeploy.
- Alternative: check the `users` table created_at timestamps via a temporary debug endpoint or by SSH-ing into the running service if possible.

### Three remediation paths

**Outcome A — Postgres is already wired up correctly.**
- The mismatched name in `render.yaml` is cosmetic only (Render auto-resolved it via dashboard-level config) or there's a hand-provisioned `productmind-db` separate from the YAML.
- Action: fix the name mismatch in `render.yaml` so future redeploys don't break; close P1-10; proceed with `.plans/postgres-and-alembic-20260522.md` as written.
- Estimated remediation: ~1 hr.

**Outcome B — SQLite on a persistent disk.**
- App falls through to SQLite, but a Render disk is mounted at the backend path so the file persists across deploys.
- Action: remove the orphan `type: psql` declaration from `render.yaml` (it's misleading); update bug tracker P1-10; update the Postgres+Alembic plan to include a SQLite → Postgres export step (`sqlite3 productmind.db .dump | psql ...` with type coercion); P0-9 (Alembic) gains a one-time data-migration sub-task.
- Estimated remediation: ~2–3 hrs (mostly plan update; actual export happens during the Postgres+Alembic PR).

**Outcome C — SQLite on ephemeral disk (silent data loss).**
- App falls through to SQLite AND no persistent disk is mounted. Every redeploy wipes all user data.
- **This is a hidden P0 — urgent.**
- Action: **spawn an urgent sub-ticket immediately.** Two possible quick fixes:
  1. **Provision a persistent disk** on `arsenal-ops-api` (~1 hr, fast, preserves what's left).
  2. **Provision a real Render Postgres** and update `DATABASE_URL` in the dashboard (~2–3 hrs, durable, but requires careful handling — if there's existing SQLite data on disk pre-redeploy, capture it before flipping).
- Either way, **before any further redeploys** to the affected service, snapshot the current SQLite file off the container (`render ssh` or equivalent) so we don't lose what's currently there.
- Then proceed with Postgres+Alembic, with the captured snapshot as the migration source.

### Files that will likely need updates

- `render.yaml` — fix the service-name mismatch, OR remove the orphan psql declaration, OR add a `disk:` mount, depending on outcome.
- `backend/database.py:11-15` — once we know what prod actually uses, decide whether the SQLite fallback should stay (dev convenience) or be removed (prod safety). Defer to the Postgres+Alembic PR.
- `docs/bug-tracker.md` — update P1-10 (accurate location of name mismatch), update P0-9 (add the data-preservation note if outcome B or C), and add a new entry for any urgent sub-ticket if outcome C.
- `.plans/postgres-and-alembic-20260522.md` — update Section 4 (Day 4 cutover) to add a data-export step if needed.

## Out of Scope

- **Actually executing the Postgres+Alembic migration.** That's a separate PR with its own plan; this ticket only updates the plan's assumptions and creates the prerequisite data-preservation step if needed.
- **Fixing other Render config issues** (e.g., free-tier resource limits, CORS origins, keep-alive workflow). Stay focused on the database question.
- **Any backend code changes** beyond updating `render.yaml`, `bug-tracker.md`, and the plan doc. If the investigation reveals more bugs, log them in the bug tracker; don't fix here.
- **Setting up the long-term Postgres+Alembic story.** Already planned; this just confirms the starting state.
