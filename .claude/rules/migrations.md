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
  `npm run db:clear` is always available. **This clause dies when the pilot
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

- **No RLS** — hook-enforced (H8). One authorization layer, in code.

- **Never `db:push` against a real database** — local scratch only.
