# Review rules — project-specific invariants

Domain rules a generic reviewer can't infer. Cite the rule number in findings.

## Hours & time tracking

1. **Hours are fractional.** `TimeEntry.hours` and `WorkItem.{logged,estimated,remaining}_hours`
   are `Numeric` (stored) / `float` (Python). Never truncate with `int(...)`,
   `parseInt(...)`, integer division, or an `int`-typed Pydantic/response field —
   that silently drops the 15/30-minute (`0.25`/`0.5`) part of calendar blocks.
   When adding a response model or a hours sum, type it `float`.

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

6. **The contract-golden harness runs on SQLite**, where `Numeric(asdecimal=False)`
   returns `int` for whole numbers — so it is blind to the int→float wire change.
   When changing hours-bearing response shapes, regenerate goldens and prefer a
   fractional fixture value so the harness actually exercises the contract.
