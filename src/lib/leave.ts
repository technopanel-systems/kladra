/**
 * Who is not at work today, and when they are back (SPEC D75, 9A item 9).
 *
 * Leave has been in this system since the schema: a row in `non_working_days`
 * with a person's id on it, entered by the admin, and read by exactly two
 * things — the pace arithmetic, so a rep back from two weeks off does not read
 * as behind (S48), and the daily report, which marks his day off instead of
 * missing. Nowhere else. So the floor of a rep on leave simply stopped: his
 * follow-ups came due, nobody saw them, and the five-day walk wrote it in four
 * words — nobody covers a floor.
 *
 * This is the one definition of away, and it is deliberately about a PERSON. A
 * company holiday closes the office for everybody; there is nobody to cover a
 * floor on a day the whole company is shut, and marking fourteen people away at
 * once would say nothing. It is his own leave that leaves work with no owner.
 *
 * `backOn` and not "until": a manager deciding whether to cover a customer today
 * is asking when the rep is next at his desk, not which day his holiday ends —
 * and the two are different whenever the leave runs into a weekend or a holiday.
 * `nextWorkingDay` already answers it, for this person, from the same table.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { listNonWorkingDays } from "@/lib/calendar";
import { addDays, type Day } from "@/lib/dates";
import { awayFrom, type Away } from "@/lib/workdays";

export type { Away };

/**
 * How far ahead the walk for "back on" looks. Long enough for the longest leave
 * anybody takes here in one stretch, and bounded so a wrong row in the table
 * cannot turn into an unbounded scan.
 */
const LOOK_AHEAD_DAYS = 45;

/**
 * Everybody whose own leave falls on this Riyadh day, by user id.
 *
 * Empty on most days, and empty on every weekend and company holiday by the
 * rule in `awayFrom` — one small query over six weeks of a tiny table.
 */
export async function awayOn(day: Day): Promise<Map<string, Away>> {
  return awayFrom(day, await listNonWorkingDays(day, addDays(day, LOOK_AHEAD_DAYS)));
}
