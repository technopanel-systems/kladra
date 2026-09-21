/**
 * Which revision of a number is the live one (S34, D36) — written once.
 *
 * A number quoted three times is one paper, and only its live revision is in
 * play: it is what the lists show, what a load may be raised against, what the
 * desk may approve against and what may be revised again. It was "no later
 * revision exists", written out in eight queries, and that sentence was wrong
 * in one case nobody had walked (Stage 3 audit): a revision that was asked for
 * and then WITHDRAWN still counted as later. So asking for a new price took the
 * issued paper out of play — which is right while the desk is working on it —
 * and withdrawing the ask (D32 exists for exactly that) left the customer with
 * no paper at all: the issued one stayed superseded for good, with no Revise,
 * no load and no way back, and SMAC's number held by a row nobody could use.
 *
 * A withdrawn revision supersedes nothing. Everything else about it stands: it
 * is still in the trail, and it is still the latest row of its own story.
 *
 * A string, with the alias passed in, because the readers name the table two
 * ways (`quotations` where Drizzle builds the query, `q` in raw SQL) and a
 * correlated subquery has to name its tables outright (rules/data.md). The
 * alias is a closed set, never a value from a request.
 */
export function liveRevision(alias: "quotations" | "q"): string {
  return `not exists (
    select 1 from quotations later
     where later.number = ${alias}.number
       and later.revision > ${alias}.revision
       and later.status <> 'cancelled'
  )`;
}

/** The same sentence over rows already read: `rows` are one number's revisions. */
export function isLiveAmong(
  revision: number,
  rows: readonly { revision: number; status: string }[],
): boolean {
  return !rows.some((row) => row.revision > revision && row.status !== "cancelled");
}
