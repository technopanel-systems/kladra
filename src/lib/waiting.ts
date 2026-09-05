/**
 * How long something has been waiting, and whether that is too long
 * (SPEC D14, D59).
 *
 * The rule already existed, inside `stuckList`: a quotation request that has sat
 * for more than two WORKING days is stuck, and the manager's screen counts them.
 * What did not exist was any way for the person who could actually clear it to
 * see the same fact — Rawan's queue said what was on her desk and never how long
 * it had been there, so the manager knew a request was late and the coordinator
 * did not. This is that one rule, in one place, for both of them.
 *
 * Working days, not calendar days, for the reason the pace line and the stuck
 * list already use them: a request raised at five on Thursday has not waited two
 * days by Saturday, and a screen that says so tells a rep back from Eid he is
 * late (S48, rules/data.md).
 *
 * Pure — no database, no `server-only` — so `tests/waiting.spec.ts` asks it
 * directly, the way `tests/floor.spec.ts` asks the floor rule. The caller reads
 * the holiday table once for the page and passes it in.
 */
import type { Day } from "@/lib/dates";
import { workingDaysBetween, type NonWorking } from "@/lib/workdays";

/**
 * More than this many working days on the desk and it is late.
 *
 * Two, which is the founder's own answer for the stuck list (S53) and therefore
 * this one: one figure, one definition. It lives here now and `src/lib/team.ts`
 * imports it, because a second copy would be the drift trap — the manager's
 * screen and the coordinator's calling different things late.
 */
export const LATE_AFTER_WORKING_DAYS = 2;

export type Waited = {
  /** Working days since it arrived. Today is 0, not 1. */
  days: number;
  /** Past the line, and therefore something somebody should say out loud. */
  late: boolean;
};

export function waitedSince(
  since: Day,
  today: Day,
  nonWorking: NonWorking[] = [],
): Waited {
  const days = workingDaysBetween(since, today, nonWorking);
  return { days, late: days > LATE_AFTER_WORKING_DAYS };
}

/** How many of a list of arrival days are past the line — the caption's figure. */
export function countLate(
  days: readonly Day[],
  today: Day,
  nonWorking: NonWorking[] = [],
): number {
  return days.filter((day) => waitedSince(day, today, nonWorking).late).length;
}

/**
 * The longest wait in a list, in working days, or null when nothing is waiting.
 *
 * The queue used to show the oldest arrival as a DATE, which is the same fact
 * asked the wrong way round: "03/Sep" makes the reader do the arithmetic, and
 * over a weekend the arithmetic they do in their head is wrong. The question is
 * how long, so the answer is a length.
 */
export function longestWait(
  days: readonly Day[],
  today: Day,
  nonWorking: NonWorking[] = [],
): Waited | null {
  let worst: Waited | null = null;
  for (const day of days) {
    const waited = waitedSince(day, today, nonWorking);
    if (!worst || waited.days > worst.days) worst = waited;
  }
  return worst;
}
