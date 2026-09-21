import { test, expect } from "@playwright/test";
import { addDays, type Day } from "@/lib/dates";
import { monthPace, stepWorkingDay, type NonWorking } from "@/lib/workdays";

/**
 * The working-day arithmetic the month card's pace line rests on (SPEC D44,
 * rules/data.md "a window measured in calendar days is wrong in a Fri–Sat week").
 *
 * Written because mutation testing found it untested (P14.5): `monthPace` had
 * no spec at all, so Stryker could turn its division into a multiplication, or
 * count the month's first working day as nought, and every test in the suite
 * still passed. It is the figure that decides whether a rep's own month reads
 * on track or behind, and it changes with the day it is read on — which is the
 * rules/data.md case for a pure function with a spec that picks its own days,
 * rather than a walk that asserts whatever today happens to be.
 *
 * The month is September 2026, worked out by hand and not by the functions
 * under test: it opens on a Tuesday; its Fridays are the 4th, 11th, 18th and
 * 25th and its Saturdays the 5th, 12th, 19th and 26th; so thirty days hold
 * twenty-two working ones.
 */

const COMPANY = (day: Day): NonWorking => ({ day, userId: null });
const LEAVE = (day: Day, userId: string): NonWorking => ({ day, userId });

test("the pace is working days gone over working days in the month", () => {
  // Thursday the 10th: the 1st–3rd and the 6th–10th, eight of twenty-two.
  expect(monthPace("2026-09-10")).toEqual({ elapsed: 8, total: 22, ratio: 8 / 22 });
});

test("the month's first working day is one day gone, not none", () => {
  // Read on the morning of the 1st, the rep has a day of the month behind him
  // and a pace to be judged against; a nought here reads "not started" on the
  // one day the card is most looked at.
  expect(monthPace("2026-09-01")).toEqual({ elapsed: 1, total: 22, ratio: 1 / 22 });
});

test("a weekend day adds nothing to the days gone", () => {
  // Saturday the 5th: still the three working days of that first week.
  expect(monthPace("2026-09-05").elapsed).toBe(3);
});

test("a company holiday comes off the month for everybody", () => {
  // National Day, the 23rd, a Wednesday.
  const pace = monthPace("2026-09-30", [COMPANY("2026-09-23")]);
  expect(pace).toEqual({ elapsed: 21, total: 21, ratio: 1 });
});

test("a rep's own leave comes off his month and nobody else's", () => {
  const rows = [LEAVE("2026-09-02", "faisal")];
  // His: the 2nd is gone from both the days behind him and the month.
  expect(monthPace("2026-09-10", rows, "faisal")).toEqual({ elapsed: 7, total: 21, ratio: 7 / 21 });
  // Saad's month is the whole month.
  expect(monthPace("2026-09-10", rows, "saad")).toEqual({ elapsed: 8, total: 22, ratio: 8 / 22 });
});

test("a month with no working day in it has a pace of nought, not a division by it", () => {
  // Contrived on purpose — no real month is shut throughout — but it is the one
  // input where the arithmetic has nothing to divide by, and NaN in a bar's
  // width draws nothing and says nothing about why.
  const everyDay: NonWorking[] = [];
  for (let d: Day = "2026-09-01"; d <= "2026-09-30"; d = addDays(d, 1)) everyDay.push(COMPANY(d));
  expect(monthPace("2026-09-15", everyDay)).toEqual({ elapsed: 0, total: 0, ratio: 0 });
});

/**
 * The walker's three-week cap, which its own comment says is there so that "a
 * bad row in the table" cannot turn a page into a hang. Nothing exercised it,
 * so removing it — or stepping backwards through it for ever — passed. A run of
 * thirty holidays is that bad row: the walk gives up twenty-two days on, still
 * inside the run, rather than walking to the far end of it.
 */
test("a run of holidays longer than three weeks stops the walk, it does not hang it", () => {
  const start: Day = "2026-09-06"; // a Sunday, a working day
  const rows: NonWorking[] = [];
  for (let i = 1; i <= 30; i += 1) rows.push(COMPANY(addDays(start, i)));

  const stopped = stepWorkingDay(start, 1, rows);
  expect(stopped).toBe(addDays(start, 22));
  // And it did stop early: the first day off the end of the run is later still.
  expect(stopped < addDays(start, 31)).toBe(true);
});
