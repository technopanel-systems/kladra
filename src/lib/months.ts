/**
 * The months before this one (SPEC D61, WORKFLOW §4 item 11).
 *
 * Kladra had no month but the current one, anywhere. A rep's card said he had
 * moved 1,180 m² against a target of 1,500 and that is a fact with nothing to
 * be measured against: the question everybody actually asks in the second week
 * is not "how am I doing" but "am I doing better or worse than last month", and
 * no screen could answer it. The Google Sheet could, because a sheet has rows
 * above the one you are on.
 *
 * Six months, because that is two quarters and it fits across a phone as six
 * bars. Long enough to see a direction, short enough that a bad month a year ago
 * is not still on the screen.
 *
 * Every figure here is `achievedSqm`'s own definition and `targets`' own rows —
 * this reads them per month rather than defining anything (S43, S44,
 * rules/data.md). A second arithmetic for "achieved, but historically" is how a
 * figure ends up with two answers, and it nearly did: when credit replaced the
 * raiser (D148) every reader moved except this one, which would have drawn six
 * bars that do not add up to the figure printed above them.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addMonths, firstOfMonth, todayRiyadh, type Day } from "@/lib/dates";
import { CREDITED_METRES } from "@/lib/sqm";

/** How many months a card shows, this one included. */
export const MONTHS_SHOWN = 6;

export type MonthFigure = {
  /** The first of the month, as a Riyadh day. */
  month: Day;
  /** Approved m² that month — the same definition as the card above it (S43). */
  achieved: string;
  /** What was aimed at, or null: a month before somebody had a target has none. */
  target: string | null;
};

/**
 * The last `MONTHS_SHOWN` months for one rep, or for the whole company when
 * `userId` is null, oldest first.
 *
 * A month with nothing in it is a row with a zero, not a missing row. A chart
 * that silently drops an empty month draws a line straight over the hole and
 * says the opposite of what happened, and the empty months are the ones worth
 * seeing.
 *
 * Both tables are named outright in the correlated subqueries, because a bare
 * column resolves inside the inner table and matches nothing (rules/data.md).
 */
export async function monthsBack(
  userId: string | null,
  today: Day = todayRiyadh(),
): Promise<MonthFigure[]> {
  const from = firstOfMonth(addMonths(today, -(MONTHS_SHOWN - 1)));

  // `mine` narrows both halves: the metres by whose floor the customer is on
  // (S8), and the target by whose row it is. For the company both are the
  // whole of it, and the target comes from its own table (S44).
  const rows = await db.execute<{ month: Day; achieved: string; target: string | null }>(sql`
    with months as (
      select generate_series(${from}::date, ${firstOfMonth(today)}::date, interval '1 month')::date as m
    ),
    credited as (${sql.raw(CREDITED_METRES)}),
    moved as (
      select date_trunc('month', (credited.approved_at at time zone 'Asia/Riyadh')::date)::date as m,
             round(sum(credited.sqm), 2) as sqm
        from credited
       where (credited.approved_at at time zone 'Asia/Riyadh')::date >= ${from}::date
         -- Whoever the dispatch was CREDITED to (D148), which is what the month
         -- card above these bars says and what the manager's table says. Read
         -- by the raiser instead, a rep who shares a job would see six bars
         -- that do not add up to the figure printed over them.
         and (${userId}::uuid is null or credited.user_id = ${userId}::uuid)
       group by 1
    )
    select to_char(months.m, 'YYYY-MM-DD') as month,
           coalesce(moved.sqm, 0)::text as achieved,
           case
             when ${userId}::uuid is null then
               (select company_targets.sqm::text from company_targets
                 where company_targets.month = months.m)
             else
               (select targets.sqm::text from targets
                 where targets.month = months.m and targets.user_id = ${userId}::uuid)
           end as target
      from months
      left join moved on moved.m = months.m
     order by months.m
  `);

  return rows.rows.map((row) => ({
    month: row.month,
    achieved: String(row.achieved ?? "0"),
    target: row.target === null ? null : String(row.target),
  }));
}

/**
 * The sentence a row of bars is for, in src/lib/month-change.ts — pure, so the
 * spec that holds it to its own bars imports no query (D90).
 */
export { lastFinishedChange, type MonthChange } from "@/lib/month-change";

/**
 * Which sentence the months card says about the last finished month against the
 * one before it. Two equal months read "0% up" for a phase (P11A-15, D102): a
 * sign test has three answers, not two, and the third is its own sentence.
 */
export function monthSentenceKey(percent: number): "team.monthUp" | "team.monthDown" | "team.monthSame" {
  if (percent === 0) return "team.monthSame";
  return percent > 0 ? "team.monthUp" : "team.monthDown";
}
