# Postgres-Everywhere + Alembic Adoption

**Status:** Planned — execute after `testing-infrastructure` branch merges
**Branch:** TBD (suggested: `postgres-and-alembic`)
**Date:** 2026-05-22
**Estimated LOE:** 3–5 focused days (~20–34 hrs)
**Bug-tracker entries resolved:** P0-9, P1-9 (directly); P1-12, P1-16 (clarified/unblocked)

---

## 1. Goal

Unify on PostgreSQL for **dev + test + prod**, and replace the ad-hoc startup migration scripts with **Alembic**. Eliminate the SQLite-in-dev / Postgres-in-prod dialect divergence that produces silent bugs and blocks safe schema evolution.

This is **one coordinated PR**, not two — Postgres-everywhere and Alembic-adoption are philosophically a single change. Doing them separately means doubling the test-shakeout pain.

---

## 2. Why now / why together

### Why now
- The `testing-infrastructure` branch lands 323 tests. We have a safety net for the first time. Any latent dialect-dependent bug surfaced by the switch will be caught by the existing suite, not by a user.
- The bug tracker has ~6 P0/P1 items blocked on "schema changes require an ad-hoc migration script." Those fixes can't proceed safely until Alembic is in place.
- We're about to start E2E work (Week 5). E2E should run against Postgres for production parity. Doing the migration *before* E2E avoids a second cutover.

### Why together
- The startup `migrate_*.py` scripts use SQLite-flavored DDL ("does column exist" checks via PRAGMA). Some won't run on Postgres without modification.
- If we switch to Postgres without Alembic, we must rewrite the migration scripts in Postgres SQL — wasted work.
- If we adopt Alembic without switching to Postgres, dev still runs on SQLite, and Alembic migrations have to be tested against both dialects. Twice the surface area.
- Both changes touch the same files (`database.py`, `conftest.py`, `main.py`, CI workflow). Splitting them creates merge-conflict-prone PRs.

---

## 3. Scope

### In scope
- Drop SQLite fallback in `backend/database.py`. Require `DATABASE_URL` to be a Postgres URL; fail startup with a clear error otherwise.
- Switch `backend/tests/conftest.py` `db` fixture to a session-scoped `testcontainers.PostgresContainer` with per-test transaction-rollback isolation.
- Wire `services: postgres:16-alpine` into all four CI jobs in `.github/workflows/test.yml`.
- Update `Justfile` install recipe to include `docker compose up -d db`.
- Update README (or create one if absent) to document Postgres as a dev prerequisite.
- Adopt Alembic:
  - `alembic init`
  - Write a baseline migration matching the **current production Postgres schema** (verified via `pg_dump --schema-only` from prod).
  - On prod: `alembic stamp head` (no DDL runs — Alembic just records the baseline as applied).
  - Delete `backend/migrate_*.py` scripts.
  - Remove the migration-runner call from `backend/main.py` startup.
- Delete `backend/productmind.db` (the gitignored SQLite file).
- Fix any tests that surface dialect-dependent bugs in the shakeout.

### Out of scope (deferred)
- Future Alembic migrations for unrelated bug-tracker entries (P1-4, P1-6, P2-9 etc.) — those land in their own PRs once Alembic is in place.
- E2E backend running against Postgres — that's a Week 5 follow-up, trivial after this lands.
- Removing the `sqlite` extra from `requirements.txt` if any (already minimal).

---

## 4. Step-by-step execution

### Day 1: Local Postgres rig + database.py
1. Verify `docker compose up -d db` brings up Postgres on the expected port.
2. Update `backend/database.py`:
   - Remove SQLite branch from engine construction.
   - Require `DATABASE_URL` starts with `postgresql://` (or `postgresql+psycopg2://`); raise on startup if not.
   - Tune `pool_pre_ping=True`, `pool_size=10`, `max_overflow=20` (sensible Postgres defaults; current SQLite values don't apply).
3. Verify the app boots locally against the docker Postgres.
4. Run the existing pytest suite once against Postgres — expect 222 tests to mostly pass; note any failures.

### Day 2: Test infrastructure
1. Add `testcontainers[postgres]>=4` to `backend/requirements.txt`.
2. Rewrite the `db` fixture in `backend/tests/conftest.py`:
   - **Session scope**: one `PostgresContainer("postgres:16-alpine")` for the whole pytest run.
   - **Per-test isolation**: open a connection, begin a SAVEPOINT-nested transaction, yield a session bound to it, rollback on teardown. Fast (no schema rebuild per test) and clean (no leaks).
   - Keep the `test_client` fixture wiring identical — only the underlying engine changes.
3. Verify all 222 tests still pass. Fix any that surfaced dialect issues:
   - Datetime precision (Postgres `TIMESTAMP` has microsecond precision; SQLite stored TEXT)
   - Boolean coercion (Postgres native `BOOLEAN` vs SQLite 0/1)
   - Case-sensitive LIKE (Postgres is case-sensitive by default; SQLite isn't)
   - JSON columns (Postgres native `JSON`/`JSONB` vs SQLite stored TEXT)
   - Integer overflow if any test inserts > 2^31

### Day 3: CI + Alembic init
1. Update `.github/workflows/test.yml`:
   - Add `services: postgres:` block to `typecheck-backend`, `unit-backend`, `integration-backend` jobs.
   - Set `DATABASE_URL` env var pointing at the service.
   - Use the official `postgres:16-alpine` image to match local + prod.
2. `cd backend && alembic init migrations/`
3. Configure `alembic.ini` and `migrations/env.py` to load `DATABASE_URL` from env and import the SQLAlchemy `Base` metadata.
4. **Critical**: snapshot current prod schema:
   ```bash
   pg_dump --schema-only $RENDER_DATABASE_URL > prod-schema.sql
   ```
5. Spin up a fresh local Postgres, restore that dump:
   ```bash
   docker exec -i db psql -U postgres < prod-schema.sql
   ```
6. Run `alembic revision --autogenerate -m "baseline"` against the restored DB.
7. **Review the autogenerated diff carefully.** Drift exists if the models and prod schema have diverged (likely — months of ad-hoc migrations). Hand-edit models or the migration until autogenerate produces an empty diff.
8. Write a "real" baseline migration matching the current schema (the autogenerated one is fine if drift is reconciled).

### Day 4: Production cutover
1. **Pre-flight**:
   - Confirm Render PITR is enabled on the Postgres instance. If not, enable it and wait for the first PITR snapshot.
   - Take a manual `pg_dump` of prod, store it somewhere durable (S3 or a local secure location).
   - Document the rollback procedure in this plan and rehearse it on a staging instance if available.
2. **Cutover** (low-traffic window):
   - Deploy a build that includes the Alembic migration but **does not** yet run `alembic upgrade head` on startup.
   - Run `alembic stamp head` manually against prod via a one-off shell. This records the baseline as applied — no DDL runs.
   - Verify: `alembic current` reports the baseline migration as current.
   - Deploy the next build that adds `alembic upgrade head` to a Render `preDeployCommand` (per-deploy, not per-worker — avoids the concurrent-migration race).
3. **Post-flight**:
   - Smoke test prod (login, list projects, log hours).
   - Monitor for 24 hrs for errors.

### Day 5: Cleanup
1. Delete `backend/migrate_*.py` scripts (4 files).
2. Remove the migration-runner call from `backend/main.py` startup.
3. Delete `backend/productmind.db`.
4. Update README with new dev setup instructions.
5. Update `docs/bug-tracker.md`: mark P0-9 fixed, P1-9 fixed, P1-12 unblocked, link this PR.

---

## 5. Risk and rollback

### Risk surface
| Step | Reversible? | Blast radius | Mitigation |
|---|---|---|---|
| Drop SQLite fallback in `database.py` | Local-only — `git revert` | None | Standard PR review |
| Switch conftest to Postgres | Tests run / don't run | None (test-only) | Verify all green before merge |
| CI workflow changes | `git revert` | None | YAML lint + dry-run on PR |
| Alembic baseline migration | `git revert` before stamping prod | None | Code review of the diff |
| `alembic stamp head` on prod | **Not data-destructive** (no DDL) | Recoverable | If wrong: `alembic stamp <previous>` |
| Future `alembic upgrade` migrations | Each migration must be reviewed | Per-migration | Migrations always reviewed; downgrade() always implemented |

### The actually-risky moment
The only step with non-trivial blast radius is the prod `alembic stamp head`. Even that is recoverable: `stamp` writes a single row to the `alembic_version` table. If wrong, `DELETE FROM alembic_version` restores the prior state.

The truly catastrophic failure mode — `alembic upgrade head` running unreviewed `DROP COLUMN` because of model drift — is prevented by the Day 3 step: reconciling drift *before* writing the baseline.

### Rollback procedure (if needed)
1. Disable any new Alembic migrations from running (revert the `preDeployCommand`).
2. `DELETE FROM alembic_version` to clear the stamp.
3. Restore the manual `pg_dump` from Day 4 pre-flight if schema or data corruption occurred.
4. Re-enable the old `migrate_*.py` startup runner (it was deleted but exists in git history).

---

## 6. What this unblocks

### Resolved directly
- **P0-9** (no migration system) — fixed. Alembic in place; future schema changes are tracked, versioned, reversible.
- **P1-9** (FK not enforced in SQLite dev) — disappears. Postgres always enforces.

### Clarified / unblocked
- **P1-12** (concurrent log_hours races) — Postgres `SERIALIZABLE` becomes usable for fixing this. SQLite can't express it.
- **P1-16** (Hypothesis-found epic rollup xfails) — running these against Postgres clarifies whether they're real bugs or SQLite-dialect artifacts. Either outcome is useful.

### Unblocked for follow-up PRs
- **P1-4** (specialization column missing) — needs a schema migration. Trivial in Alembic.
- **P1-6** (GitHub tokens stored plaintext) — encrypted column requires a migration + data backfill. Now landable as one Alembic revision.
- **P2-9** (no soft-delete columns) — add `is_deleted` / `deleted_at` everywhere. Alembic handles it cleanly.

### Reduces future plan complexity
- Week 7 of the testing plan (`.plans/testing-infrastructure-20260521.md`) had a "testcontainers Alembic migration suite" line item. Its main load-bearing part *is* this PR. Week 7 collapses to: visual regression + Lighthouse CI + a much smaller "verify new migrations don't break things" gate.

---

## 7. Decision points

### Should we keep a SQLite escape hatch for dev?
**Recommendation: No.** The whole point is parity. An escape hatch means devs use it, dialect bugs reappear, and we're back where we started. If a dev can't run docker, that's a dev-machine fix, not an architectural compromise.

### Session-scope vs function-scope containers?
**Recommendation: Session-scope with SAVEPOINT rollback per test.** Function-scope (one container per test) would be cleaner but adds ~5–10s × 222 tests = unacceptable. Session-scope with proper isolation gives ~14s → ~30s suite runtime, which is fine.

### Alembic via testcontainers in CI, or against the live `services: postgres:`?
**Recommendation: services: postgres:** for unit/integration tests. testcontainers for the migration-specific test suite that comes later. Two different concerns: most tests don't care about migrations; migration tests specifically want fresh containers.

### Should this PR include the P1-4 fix (specialization column) as a first real Alembic migration?
**Recommendation: No** — keep this PR focused. The first real migration is a good chance to validate the Alembic process, but it should be its own follow-up PR with its own review.

---

## 8. Definition of done

- [ ] All 323 tests pass against Postgres in CI.
- [ ] `docker compose up -d db && just test` works on a fresh clone.
- [ ] Alembic baseline matches current prod schema (empty `--autogenerate` diff).
- [ ] Prod is stamped at baseline; smoke tests pass.
- [ ] `migrate_*.py` scripts and `productmind.db` are deleted.
- [ ] README documents the new dev workflow.
- [ ] `docs/bug-tracker.md` updated: P0-9 and P1-9 marked `fixed` with commit references.
- [ ] At least 24 hrs of prod monitoring with no migration-related errors.
