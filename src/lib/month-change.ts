import type { MonthFigure } from "@/lib/months";

/**
 * The sentence a row of bars is for: how this month compares with the last one
 * that finished.
 *
 * Not an average and not a trend line. Fourteen people on cladding cycles have
 * lumpy months — one tower approved on the 28th is half a target — so a
 * smoothed line would say something the business does not do, and S46 already
 * forbids one number that mixes target with activity. Last month against the
 * one before it is the comparison a manager makes out loud.
 *
 * Pure, with no query in it, so tests/months-change.spec.ts can hand it figures.
 */
export type MonthChange = {
  /** The last FINISHED month, and the one before it. */
  last: MonthFigure;
  previous: MonthFigure;
  /** Per cent, signed, or null when the earlier month was empty. */
  percent: number | null;
  /**
   * What the sentence is about when there is no per cent (D90). `first`: no
   * finished month before `last` had anything — the only case the card used to
   * name, and it named it whenever `previous` alone was empty, under a row of
   * bars that showed earlier metres. `afterEmpty`: `previous` was empty but an
   * earlier month was not. `nothing`: `last` is empty too.
   */
  kind: "percent" | "first" | "afterEmpty" | "nothing";
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
  const anyEarlier = finished.slice(0, -2).some((month) => Number(month.achieved) > 0);

  if (before > 0) {
    return { last, previous, percent: Math.round(((now - before) / before) * 100), kind: "percent" };
  }
  if (now > 0) return { last, previous, percent: null, kind: anyEarlier ? "afterEmpty" : "first" };
  return { last, previous, percent: null, kind: "nothing" };
}
