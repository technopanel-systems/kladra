import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addDays, todayRiyadh, weekday, type Day } from "@/lib/dates";
import { REPORTING_ROLES } from "@/lib/floor";

/**
 * The working week around a day, and how much of it each one is written
 * (SPEC §3, P12: a layout that makes a week readable in one pass).
 *
 * The reports screen had one day and two arrows. A manager checking whether his
 * floor is writing things down had to step through the week a tap at a time and
 * hold six answers in his head, which is the same complaint the founder made
 * about every other screen on this phase: the thing he actually wants to know
 * takes more than one look.
 *
 * A week here is the five working days Sunday to Thursday around the day being
 * read — Friday and Saturday are the weekend (rules/data.md) and a day nobody
 * worked is not a day anybody owes (D57), so they are not columns. Days after
 * today are columns too, drawn empty: a week with Wednesday missing from it
 * reads as a week where nobody worked Wednesday.
 */
export type WeekDay = {
  day: Day;
  /** How many people who owed a report that day have written one. */
  written: number;
  /** How many owed one at all. Zero on a day the whole floor was off. */
  owed: number;
  /** Later than today: nothing has happened yet, and the column says so. */
  ahead: boolean;
};

/**
 * The week starts on Sunday here. Walk back to the Sunday on or before the day
 * and take the five that follow it, which is Sunday to Thursday: the two the
 * country does not work are never columns rather than columns drawn empty.
 */
function weekDays(day: Day): Day[] {
  const sunday = addDays(day, -weekday(day)); // weekday(): 0 is Sunday
  return [0, 1, 2, 3, 4].map((n) => addDays(sunday, n));
}

export async function reportWeek(day: Day, today: Day = todayRiyadh()): Promise<WeekDay[]> {
  const days = weekDays(day);
  const first = days[0];
  const last = days[days.length - 1];

  // One statement for the whole strip. Asking per column is six round trips for
  // a control that sits above the fold on every load (D71).
  const rows = await db.execute<{ day: Day; written: number; owed: number }>(sql`
    with people as (
      select u.id
        from users u
       where u.active = true
         -- The one list, not a copy of it: who writes a report is a sentence
         -- in src/lib/floor.ts and a second hand-written one beside it is the
         -- drift D42 and D64 were both written about.
         and u.role in (${sql.raw(REPORTING_ROLES.map((r) => `'${r}'`).join(", "))})
    ),
    days as (
      select generate_series(${first}::date, ${last}::date, interval '1 day')::date as day
    ),
    owed as (
      select d.day, p.id as user_id
        from days d
        cross join people p
       where not exists (
         select 1 from non_working_days n
          where n.day = d.day
            and (n.user_id is null or n.user_id = p.id)
       )
    )
    select to_char(o.day, 'YYYY-MM-DD') as day,
           count(*) filter (
             where exists (
               select 1 from daily_reports r
                where r.user_id = o.user_id and r.day = o.day
             )
           )::int as written,
           count(*)::int as owed
      from owed o
     group by o.day
     order by o.day
  `);

  const byDay = new Map(rows.rows.map((row) => [row.day, row]));
  return days.map((d) => {
    const row = byDay.get(d);
    return {
      day: d,
      written: Number(row?.written ?? 0),
      owed: Number(row?.owed ?? 0),
      ahead: d > today,
    };
  });
}
