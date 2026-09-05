---
paths:
  - "drizzle/**"
  - "drizzle.config.ts"
---

# Migration rules

**For:** writing and applying migrations. **Prevents:** silent no-ops and
destroyed invariants.

- **There is no production data — a migration never preserves, backfills or
  merges.** Every row is seed or test residue; a migration clears, and
  `npm run db:clear` is always available. **The test suite clears before it
  migrates** (tests/global-setup.ts) for the same reason: the old order handed
  each migration the previous run's rows, and a unique index added in 0002 met
  two quotations that two acceptance runs had issued with the same SMAC number. **This clause dies when the pilot
  begins** — delete it then, and migrations become preserving.

- **A database tool that reports success may have changed nothing.** Three
  sightings in FACET, one class: `drizzle-kit migrate` exits 1 with no
  message on a connection error; a trailing carriage return in an inline
  `DATABASE_URL` connects to a database that does not exist; and a
  hand-written journal entry whose `when` predates the last applied
  migration is **skipped in silence while "migrations applied
  successfully!" still prints**. **Confirm from `information_schema` or
  `drizzle.__drizzle_migrations`, never from the success line.** To see a
  real error, pipe the migration's SQL through psql inside the db container.

- **Removing an enum value a CHECK mentions needs two extra statements**
  drizzle-kit does not generate: drop the constraint before the swap, add it
  back after, or the rebuild fails with `operator does not exist`.

- **A hand-written migration leaves drizzle-kit's snapshot behind, and the next
  `generate` then rewrites history.** `drizzle/meta/<n>_snapshot.json` is the
  baseline every diff is taken against; writing the SQL and the journal entry by
  hand does not write one, so `drizzle-kit generate` diffs the schema against
  `0000` and emits every change since — enum values and constraints that are
  already in the database. **After a hand-written migration, run
  `drizzle-kit generate` once, delete the SQL it produces, rename the snapshot it
  wrote to the number of your migration, and drop its journal entry.** Then run
  it again: "No schema changes, nothing to migrate" is the proof that the file,
  the snapshot and the database agree.

- **No RLS** — hook-enforced (H8). One authorization layer, in code.

- **Never `db:push` against a real database** — local scratch only.
