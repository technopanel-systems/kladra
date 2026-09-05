---
paths:
  - "src/lib/**"
  - "src/db/**"
  - "src/actions/**"
---

# Data-layer rules — SQL, Drizzle, and the derivations

**For:** the failure modes of `src/lib`, `src/actions` and the schema.
**Prevents:** the silent-wrong-numbers class — every item below shipped
broken at least once in FACET, Kladra's predecessor.

- **Derived conditions are resolved in SQL, before pagination.** Filtering a
  fetched page returns silently empty or wrong screens. Follow-up counts,
  "stuck" flags, achieved m² — all in the query, never in the screen.

- **A Drizzle column in a `sql` template keeps its table qualifier only when
  the outer query joins something.** In a correlated subquery with no join,
  both sides render bare and resolve inside the inner table — `where
  "quotation_id" = "id"` is never true, returns zero, raises nothing. Bitten
  three times in FACET. **Name both tables outright in any correlated
  subquery** (`quotations.id`, not `${quotations.id}` alone), and assert a
  derived figure at every reader.

- **The untyped `sql` parameter, three variants, all silent differently:**
  a value interpolated into `sql` becomes a bound parameter typed `text` —
  cast it (`::int`, `::date`) at every site, or the query dies with `42883`;
  **`sql<T>` is a type ASSERTION, not a decoder** — borrow the column's own
  mapper with `.mapWith(table.column)`, or a `sql<Date>` arrives as a string
  and 500s at the first `.getTime()`; **an untyped join column drops rows
  rather than failing** — a text id INNER-JOINed against a uuid silently
  returns nothing forever.

- **The app's "today" is Riyadh's, computed in SQL with the timezone.** The
  two shapes that lose it are hook-blocked (H6/H7): `current_date` is the
  server's UTC day, one behind Riyadh until 03:00; `AT TIME ZONE` on a bare
  `date` lifts to midnight-UTC then STRIPS the zone. The safe shapes:
  `(col at time zone 'Asia/Riyadh')::date` to get a Riyadh day from a
  `timestamptz`, and `${day}::date::timestamp at time zone 'Asia/Riyadh'`
  to get the instant a Riyadh day begins. On the TypeScript side, one module
  (`src/lib/workdays.ts`) owns Riyadh today, the Fri–Sat weekend and the
  non-working-day table; nothing else does date math.

- **A window measured in calendar days is wrong in a Fri–Sat week.** "Today and
  yesterday" for writing a daily report meant that on a Saturday the last working
  day was two days back and nobody could write anything — the screen shipped,
  seeded, and had no box on it. Any rule of the form "the last N days" is a rule
  about **working** days here: ask `isWorkingDay` and walk, cap the walk, and test
  the rule on a Saturday before believing it.

- **A figure the browser shows while somebody types is computed by the
  function the database uses.** Round once, at the end, on both sides:
  `round(width * length * qty, 2)`, never `round(width * length, 2) * qty`.
  Thirty sheets of 1.24 × 5.8 are 215.76 m² one way and 215.70 the other, and
  nobody reports a six-halala gap — they stop trusting the screen. Every such
  pair has a test that compares them on real rows (tests/dispatches.spec.ts,
  tests/quotations.spec.ts).

- **One definition per figure.** Achieved m² (approved dispatch items, month
  of approval), pace, overdue follow-ups — each has exactly one query
  function that every screen calls. A second derivation beside it is the
  drift trap that produced two answers on two screens.

- **One authorization layer, in application code** — `src/lib/authz.ts`.
  Data-integrity invariants (what a row may contain) belong in the database;
  who-may-act never does. Reps see only their own companies; the check lives
  in the query helper, not in the page.

- **"May he see it" and "may he change it" are two questions, and every
  write asks the second one.** They were one function called `mayTouch`, and
  the name was the whole bug: a manager sees every rep's companies, so every
  write action that asked it let him edit, log against and archive any rep's
  records, and the drawer rendered the buttons to do it with. They are
  `mayOpen` and `mayWrite` in `src/lib/floor.ts` now — no database, no
  `server-only`, so `tests/floor.spec.ts` asks them directly for every role.
  A read gate (`assertCompanyOpen`, `assertProjectVisible`) never stands in
  for a write gate (`assertCompanyMine`, `assertProjectMine`), and a screen
  never offers work the action behind it would refuse.

- **A `--` comment inside a sql`` template is still template-literal
  source.** A backtick in it — quoting a function name the way a code comment
  would — closes the template early and the whole FILE stops parsing. Next
  dev then answers 500 on every route, not just the one that imports it, and
  the overlay points at the comment rather than at the backtick. Write names
  in those comments bare, and run `npx tsc --noEmit` after touching one.

- **A constraint is only worth what it actually refuses — try it.**
  `length(btrim(note)) > 0` was written to refuse an empty daily report and
  refused a run of spaces only: **`btrim` with no second argument trims SPACES,
  not tabs or newlines**, so a note of `\n\t` satisfied it while the app's own
  Zod `.trim()` rejected the same string. A column looser than the form is the
  wrong way round — the column is the guard for the ways in that are not the
  app. It is `note ~ '[^[:space:]]'` now. Every CHECK gets a row in
  `tests/schema.spec.ts` that it must refuse.

- **A figure the demo always shows as zero is a figure nobody has ever seen
  work.** The manager's "requests waiting" counted quotations stuck more than
  two working days, and the seed's oldest request was one working day old — so
  that figure had read 0 in every screenshot since P8, and so had the
  coordinator's own late count the day it was added. The seed is the only place
  anybody looks at these screens before the pilot. **Every band, every count and
  every threshold gets a row in `scripts/seed/demo-data.ts` that lands on the
  wrong side of it.**

- **Never land a column, flag or table without its writer in the same
  slice.** An unused column is a lie about what the system does.

## Database rules (founder, Addendum 2)

- Money and m² are `numeric(12,2)`. `quotation_items.sqm` is a GENERATED
  column (`width * length * qty`), never written by the app.
- All timestamps are `timestamptz`. Days that are "a Riyadh day" are `date`.
- An index on every column a list sorts or filters by: `companies.rep_id`,
  `companies.updated_at`, `activities (company_id, happened_on)`,
  `quotations.status`, `dispatches.status`, `notifications (user_id, read_at)`.
- Phone numbers are stored normalized (E.164, `+966…`) in
  `contacts.phone_normalized`; UNIQUE per company `(company_id,
  phone_normalized)`. Display is local (`05x xxx xxxx`).
- Archive, never delete: `companies`, `contacts`, `projects` carry
  `archived_at`; archived rows hide from lists and stay in history; admin
  restores.
- Live updates: every write that others must see calls `pg_notify('kladra',
  json)` inside its transaction; the SSE route holds one dedicated client on
  `LISTEN kladra` and fans out to the affected users. No polling.

## A value crosses to the browser; a type does not
A client component may `import type` anything. Importing a VALUE from a module in
`src/lib` that touches `@/db`, `@/auth` or `server-only` drags the whole graph into
the browser bundle and the build fails naming the Pages Router. Put the shared pure
helper and its type in their own file (`src/lib/picker-option.ts` is the pattern).

