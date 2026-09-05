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
 * figure ends up with two answers.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addMonths, firstOfMonth, todayRiyadh, type Day } from "@/lib/dates";

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
    moved as (
      select date_trunc('month', (d.approved_at at time zone 'Asia/Riyadh')::date)::date as m,
             round(sum(round(qi.width * qi.length * di.qty, 2)), 2) as sqm
        from dispatches d
        join dispatch_items di on di.dispatch_id = d.id
        join quotation_items qi on qi.id = di.quotation_item_id
        join quotations q on q.id = d.quotation_id
        join companies c on c.id = q.company_id
       where d.status = 'approved'
         and (d.approved_at at time zone 'Asia/Riyadh')::date >= ${from}::date
         and (${userId}::uuid is null or c.rep_id = ${userId}::uuid)
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
 * The sentence a row of bars is for: how this month compares with the last one
 * that finished.
 *
 * Not an average and not a trend line. Fourteen people on cladding cycles have
 * lumpy months — one tower approved on the 28th is half a target — so a
 * smoothed line would say something the business does not do, and S46 already
 * forbids one number that mixes target with activity. Last month against the
 * one before it is the comparison a manager makes out loud.
 */
export type MonthChange = {
  /** The last FINISHED month, and the one before it. */
  last: MonthFigure;
  previous: MonthFigure;
  /** Per cent, signed, or null when the earlier month was empty. */
  percent: number | null;
};

export function lastFinishedChange(months: MonthFigure[]): MonthChange | null {
  // The current month is still being worked, so comparing it with a whole month
  // says "down 60%" on the third of every month. Drop it.
  const finished = months.slice(0, -1);
  if (finished.length < 2) return null;

  const last = finished[finished.length - 1];
  const previous = finished[finished.length - 2];
  const before = Number(previous.achieved);
  const now = Number(last.achieved);

  return {
    last,
    previous,
    percent: before > 0 ? Math.round(((now - before) / before) * 100) : null,
  };
}
