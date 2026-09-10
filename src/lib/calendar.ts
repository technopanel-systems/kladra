/**
 * The non-working days the working-day math needs (SPEC S47, S48).
 *
 * `src/lib/workdays.ts` owns the arithmetic and is pure — it takes the days as
 * an argument so it can be reasoned about and tested without a database. This
 * is the one place that loads them.
 *
 * Company holidays have no user; a person's leave has one. Both are skipped by
 * pace and by reminders, because a rep back from two weeks off must not be told
 * he is behind (S48).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { cache } from "react";
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { nonWorkingDays } from "@/db/schema";
import { addDays, todayRiyadh, type Day } from "@/lib/dates";
import { stepWorkingDay, type NonWorking } from "@/lib/workdays";

/**
 * Every holiday and every person's leave between two Riyadh days, inclusive.
 *
 * Once per request per window: the day's bands and the team's figures each
 * asked for the same weeks again, six reads of one small table on one screen
 * (§5 #71, D131). `cache` keys on the two day strings, so the same window is
 * one read and a different window is its own; outside a server request it is
 * a plain call.
 */
export const listNonWorkingDays = cache(async function listNonWorkingDays(
  from: Day,
  to: Day,
): Promise<NonWorking[]> {
  const rows = await db
    .select({ day: nonWorkingDays.day, userId: nonWorkingDays.userId })
    .from(nonWorkingDays)
    .where(and(gte(nonWorkingDays.day, from), lte(nonWorkingDays.day, to)));
  return rows.map((row) => ({ day: row.day, userId: row.userId ?? null }));
});

/**
 * The last WORKING day before today (D58, D70).
 *
 * The report's write window reaches back to it, and the log's correction
 * controls ask it once for a whole list rather than per row. It read the
 * `non_working_days` table with a query of its own until P12-13 — a seventh
 * read of the small table this module was written to read once (#71, D131) —
 * and the walk it did was a second copy of `nextWorkingDay`. Both are the one
 * thing now: this module loads the days, `workdays.ts` walks them.
 *
 * Three weeks back is the window loaded, which is the same distance the walker
 * is capped at: a run of holidays longer than that has never happened here, and
 * if it ever does the answer is a holiday table nobody filled in rather than a
 * page that hangs.
 */
export async function lastWorkingDay(today: Day = todayRiyadh()): Promise<Day> {
  return stepWorkingDay(today, -1, await listNonWorkingDays(addDays(today, -21), today));
}
