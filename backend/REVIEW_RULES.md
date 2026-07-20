# Review Rules — Workforce / QuickBooks Sync

Domain-specific invariants for the workforce integration. A general-purpose
reviewer can't infer these from reading the code in isolation. **Read this
before reviewing any PR that touches files under `services/workforce_*`,
`models/workforce_*`, `routers/workforce.py`, `scripts/run_workforce_sync.py`,
or `scripts/dedupe_time_entries.py`.**

Companion docs:
- `WORKFORCE_INTEGRATION_SETUP.md` — end-to-end setup + production cutover.
- The PR that introduced the integration: branch `workforce-integration`.

---

## I1 — Idempotency contract

**The eligibility filter for a sync push is, and must always be,
exactly:**

```sql
project.workforce_client_id IS NOT NULL
  AND time_entries.workforce_entry_id IS NULL
  AND logged_at BETWEEN <window_start> AND <window_end>
```

On a successful push, `time_entries.workforce_entry_id` is set to the QB
TimeActivity Id returned by Intuit. That column is the **only** thing
that prevents re-pushing the same hours twice — QBO's `/timeactivity`
endpoint has no natural deduplication key.

### What this means for new code

- **Never delete a TimeEntry whose `workforce_entry_id IS NOT NULL`** —
  the QB record is orphaned, the audit trail is broken, and if an
  unsynced duplicate survives the deletion the next sync re-pushes it
  → duplicate billable hours in QuickBooks.
- **Never modify `workforce_entry_id` outside of the sync worker.** It's
  written exactly once per row (by `workforce_sync.py`); any other
  writer breaks the contract.
- **Maintenance scripts that touch `time_entries`** (delete, dedupe,
  bulk-update) MUST honour the contract. The canonical example is
  `scripts/dedupe_time_entries.py` — see its docstring for the
  synced-aware keeper-selection pattern.
- **TimeEntry edit-after-sync does NOT propagate to QuickBooks.** The
  QB record is frozen at first push. If we ever build edit propagation,
  it needs a new `workforce_dirty` flag and `PUT /timeactivity/{id}` —
  out of scope today.

### Invariants enforced by tests

| Behavior | Test |
|---|---|
| Synced row is never deleted by the dedupe script | `tests/test_dedupe_time_entries.py::test_synced_row_never_deleted_even_if_later` |
| Cluster with multiple synced rows is skipped (manual reconciliation) | `tests/test_dedupe_time_entries.py::test_multiple_synced_rows_in_cluster_skipped` |
| Sync filter writes `workforce_entry_id` back per row | `tests/test_workforce_sync.py::test_successful_push_writes_back_workforce_entry_id` |

If a future change weakens any of these, the PR description must call
it out explicitly and explain the migration path for already-synced
rows.

---

## I2 — Work-week semantics

**The sync window is the Mon–Fri of the calendar week containing the
trigger** (see `services/workforce_sync.py::current_work_week_window`).
Same rule for the Saturday cron and any manual click:

```
Sat 2024-01-13 → Mon 2024-01-08 .. Fri 2024-01-12  (cron sweeps just-completed work week)
Mon 2024-01-15 → Mon 2024-01-15 .. Fri 2024-01-19  (mid-week click sweeps the in-progress week)
Wed 2024-01-17 → Mon 2024-01-15 .. Fri 2024-01-19  (later in same week — partial set, rest gets caught by next click / next Sat)
```

### Operational constraint: TZ=UTC

`current_work_week_window` reads `date.today()` (host-local timezone).
`TimeEntry.logged_at` is stored as naive UTC. The two coincide only if
the backend host runs `TZ=UTC` — Render's default, and what production
runs. **A non-UTC host shifts week boundaries on the midnight boundary
and can land entries in the wrong window.**

If we ever support deploying outside Render, this becomes load-bearing:
either pin `TZ=UTC` on the deploy or rewrite `current_work_week_window`
to use an explicit business timezone.

### Delayed cron

A Saturday cron that slips into Sunday/Monday is **an ops problem, not
a worker concern** (per Sahil 2026-06-19). The worker correctly targets
the new week's Mon–Fri once Monday arrives; the previous week's Thu/Fri
entries remain eligible (`workforce_entry_id IS NULL`) and can be
re-synced manually if needed.

If product changes its mind and wants automatic recovery, the fix is
`current_work_week_window` returning "most-recently-completed Mon–Fri"
instead of "current week". One-line change; trips no other invariants.

---

## I3 — Security: secrets and tokens

- **`SECRET_KEY` is a required env var, no exceptions.**
  `backend/routers/auth.py::_load_secret_key` raises at module import
  if `SECRET_KEY` is absent OR equal to the committed placeholder.
  There is no escape hatch — production, local dev, and CI all set the
  env var. Tests set it in `backend/tests/conftest.py` to a fixed
  test-only value (NOT the placeholder; the placeholder is rejected
  unconditionally). This key signs both session JWTs and the workforce
  OAuth `state` token; a leak breaks both authentication and the OAuth
  CSRF defense.
- **Session JWTs carry `purpose: "auth"`.** `get_current_user` rejects
  any token whose purpose isn't `"auth"`. New token types must use a
  distinct purpose claim and MUST NOT be reusable as bearer credentials.
- **OAuth state tokens are single-use.** A `jti` nonce is checked
  against an in-process TTL cache (`_CONSUMED_STATE_JTI`); a second
  validation in the same 10-min window is rejected.
- **OAuth tokens are encrypted at rest** with Fernet
  (`services/workforce_crypto.py`). The encryption key
  (`WORKFORCE_TOKEN_ENCRYPTION_KEY`) MUST be identical on the web
  service and the Render cron job — see `WORKFORCE_INTEGRATION_SETUP.md`
  step 2.5/2.6.
- **`WorkforceIntegration.to_safe_dict()` is the only serializer
  approved for API responses.** It redacts both ciphertext columns. Do
  not add another path that serializes the row.

---

## I4 — Realm scoping

`WorkforceClient.qb_customer_id` is unique only WITHIN a QuickBooks
realm — Intuit hands out small ints starting at 1, so two realms each
have a customer `5`. The model's PK is composite:
`(qb_customer_id, realm_id)`.

- **All reads must scope by `realm_id`.** `list_active_clients(db)`
  resolves the realm from the singleton `WorkforceIntegration` row by
  default; callers can pass `realm_id=` explicitly to be safe. The
  picker correctness depends on this — a stale row from a prior realm
  (left behind by a failed `clear_workforce_clients`) must never leak
  into the dropdown.
- **`clear_workforce_clients` is best-effort.** Both call sites
  (disconnect, reconnect-to-different-realm in the OAuth callback) wrap
  it in `try/except: log`. The realm-scoped read is what makes that
  safe — without it, a swallowed cleanup failure leaks customers.

---

## I5 — Concurrency: advisory lock

Postgres advisory locks are bound to the **physical connection** that
acquired them. The ORM Session in `run_workforce_sync` commits per-entry
to make a mid-run rate-limit safe — which can return its underlying
connection to the pool and check out a different one. An unlock issued
from the Session might land on a different connection than the one
holding the lock.

`_try_advisory_lock` returns a dedicated `Connection` (opened from the
engine pool, separate from the ORM Session). The lock lives on that
Connection for the whole run; `_release_advisory_lock` runs the unlock
on the same Connection and closes it.

- **Do not move the lock acquire/release back onto the ORM Session.**
  This is the H2 regression class.
- **Do not remove the per-entry commit** — losing a mid-run sync to a
  rate limit while N entries are already pushed-but-not-committed would
  duplicate work on the next run.
- **Postgres-backed test:** `tests/test_workforce_advisory_lock_pg.py`,
  gated by `WORKFORCE_PG_TESTS=1`. CI today is sqlite-only; run this
  locally before merging changes that touch the lock helpers.

---

## I6 — Rate limit (HTTP 429)

The sync worker catches `QBRateLimitError` mid-loop and `break`s out
without raising. The remaining unattempted entries are **not** counted
as failed — they're untried. `status="partial"` with reason
`rate_limited; resumes next run` is returned, the prior-commit work is
preserved, and the next Saturday cron sweeps the remainder.

- **Don't retry-with-backoff** inside the worker. The cadence is once a
  week; a long-sleeping process is a worse failure mode than a partial
  sync.
- **Don't count rate-limited entries as failures.** The skip/fail/sync
  triple is a contract the email template renders against — see
  `services/workforce_sync_notify.py::_status_style`.

---

## I7 — Email-mismatch handling

The QB Employee lookup matches Arsenal `developer.email` against
`Employee.PrimaryEmailAddr` **case-insensitively**. If there's no
match:

- The TimeEntry is **skipped** (not failed).
- The reason `"<email>: not in QuickBooks"` is appended to the run
  summary surfaced on `integration.last_sync_error`.
- The Arsenal admin sees this on the Integrations card and can fix it
  in QB without re-running anything (the row stays eligible).

**Don't auto-create QB Employees.** HR mandate.

---

## I8 — Capability gating

- All management endpoints under `/api/admin/workforce/*` gate on
  `admin.workforce_connect` — a dedicated capability, **not** inherited
  via wildcard from other admin caps. Default seed grants it only to
  the system `admin` role.
- The per-project link endpoint (`PUT /api/admin/workforce/projects/{id}/client`)
  gates on `admin.projects_write` — the same gate as the existing
  Category picker. Two distinct concerns: ORG-level connect vs.
  PER-PROJECT metadata edit.
- The OAuth callback (`/api/auth/workforce/callback`) is the ONLY
  ungated workforce endpoint — protected instead by the signed
  single-use state token (see I3).

If you add a new endpoint, the gate MUST be `admin.workforce_connect`
or stricter. If it's a per-project tag mutation, `admin.projects_write`
is acceptable.

---

## Quick checklist for a workforce PR

When reviewing or writing a PR that touches workforce code, confirm:

- [ ] Any new TimeEntry mutator honours **I1** (idempotency contract).
- [ ] The sync window math (if changed) preserves **I2** or
      explicitly updates this doc.
- [ ] No new code logs / serializes / returns the encrypted token
      columns (**I3**).
- [ ] Any read against `workforce_clients` is realm-scoped (**I4**).
- [ ] Any change to the advisory lock helpers is verified with the
      Postgres-backed test (**I5**).
- [ ] Rate-limit semantics preserved (**I6**); no retry-with-backoff
      added.
- [ ] Skip-vs-fail distinction maintained for the email-mismatch path
      (**I7**).
- [ ] New endpoints carry the right capability gate (**I8**).
- [ ] `pytest tests/test_workforce_*.py tests/test_dedupe_time_entries.py`
      green (67+ tests).
- [ ] If touching the lock: `WORKFORCE_PG_TESTS=1 pytest tests/test_workforce_advisory_lock_pg.py`.
