/**
 * The window the Use screen reads people against, and the one predicate for
 * "quiet" — the headline's count and each row's amber (SPEC D95). Apart from
 * adoption.ts because that file reads the database and this rule is pure, the
 * way month-change.ts stands apart from months.ts.
 */

/**
 * The window, in days. A week, because that is the sentence the founder said —
 * "who has not opened it this week" — and because a rep on four days of leave
 * must not read as somebody who has stopped.
 */
export const USE_WINDOW_DAYS = 7;

export type Quietable = {
  /** Days since he last opened it, or null if never. Nought is today. */
  daysSince: number | null;
  /** Not at work today (D75). */
  away: boolean;
};

/**
 * Not opened inside the window — never opened counts as quiet, the loudest
 * version of the figure — and not excused by being away today. Away is today's
 * excuse only: tomorrow he is counted again. The headline used to count people
 * the rows under it excused, so the number at the top and the amber halfway
 * down disagreed about the same person.
 */
export function isQuiet(person: Quietable): boolean {
  const late = person.daysSince === null || person.daysSince >= USE_WINDOW_DAYS;
  return late && !person.away;
}
