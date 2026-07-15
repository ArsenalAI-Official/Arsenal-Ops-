# Review rules — project-specific invariants

Domain rules a generic reviewer can't infer. Cite the rule number in findings.

## Hours & time tracking

1. **Hours are whole numbers (v1).** `TimeEntry.hours` and
   `WorkItem.{logged,estimated,remaining}_hours` are `int` (DB + Python), and
   response/request models type them `int`. Calendar blocks snap to the hour and
   the API **rejects** sub-hour durations (`time_blocks._validate_interval`) rather
   than rounding them — so `int`/`parseInt` at the boundaries is correct, not a bug.
   Fractional (15/30-min) hours are a planned follow-up on `feat/week-calendar-minutes`,
   which will widen these columns to `Numeric`/`float` and relax the snap; until that
   lands, do **not** introduce `float`/`parseFloat`/`step="0.25"` on hours fields —
   they'd send fractional values the `int` backend 422s.

2. **`logged_hours` is a derived rollup, never written directly.** It must always
   equal `SUM(TimeEntry.hours)` for the item. Any code that creates/edits/deletes
   a `TimeEntry` must recompute `logged_hours` from that SUM (self-healing) and
   propagate to parent/epic — see `log_hours` and `time_blocks._recompute_item_hours`.
   `PUT /workitems/{id}` strips `logged_hours`/`remaining_hours` from the body by design.

3. **Time-block authorization.** Logging time on a ticket is assignee-only and
   blocked when the ticket is `done`. Editing/deleting a positioned block is
   own-block-only (`TimeEntry.developer_id == caller`). New mutators on these
   tables must replicate both checks.

4. **Datetimes are stored naive-UTC.** `TimeEntry.start_time`/`end_time`/`logged_at`
   are naive `TIMESTAMP` columns holding UTC. Coerce tz-aware inbound datetimes to
   naive-UTC at the API boundary (`_naive_utc`); the frontend stores UTC and renders
   local. Don't compare aware vs naive datetimes against these columns.

## Schema migrations

5. **No Alembic.** Schema changes go in `database.run_migrations()` as idempotent
   `information_schema`-guarded blocks (Postgres) AND in the model (`create_all`
   builds fresh/SQLite). A standalone `migrate_*.py` is documentation/manual-run
   only — it does not auto-run. `ALTER COLUMN ... TYPE` rewrites the table under
   ACCESS EXCLUSIVE; note it for large tables.

## Contract tests

6. **The contract-golden harness runs on SQLite.** When changing hours-bearing
   response shapes, regenerate the goldens (`backend/tests/contract/`) and commit
   `backend/openapi.json` + `app/src/client` so the drift check stays green. Hours
   are whole `int` in v1, so goldens use representative whole-hour values. (When
   `feat/week-calendar-minutes` widens hours to `Numeric`/`float`, revisit this:
   SQLite `Numeric(asdecimal=False)` returns `int` for whole numbers and is blind
   to an int→float wire change, so a fractional fixture value will be needed to
   actually exercise the contract.)
