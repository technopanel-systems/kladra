/**
 * An id as an address may carry one.
 *
 * Every id in Kladra is a `uuid` column, and a value out of a query string
 * reaches one as a bound `text` parameter that Postgres casts — so a garbled id
 * is not an empty list, it is `22P02 invalid input syntax for type uuid`, an
 * unhandled throw, and the error boundary where a list should have been. The
 * house rule for a mangled filter is the opposite and is written down in
 * `parseNarrowing`: drop it and show the whole list, because a link somebody
 * forwarded with a mangled id must open the screen, never an error page.
 *
 * The rule was kept in five files with five copies of one regular expression,
 * and the two places that forgot it were the customers file and the contacts
 * file, where `?rep=` went from the address to a uuid comparison untouched
 * (P14.5). One copy, here.
 *
 * Pure — no database, no `server-only` — because the parsers that ask it run on
 * both sides: `src/components/leads/lead-view.ts` is read by a client row.
 */

/**
 * Not `z.uuid()`. Zod validates the RFC's version and variant nibbles, and
 * these ids are whatever `gen_random_uuid()` and the seed wrote; the question
 * here is only whether Postgres will accept the cast, which is the shape.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Is this the shape of an id — safe to compare against a `uuid` column? */
export function isId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
