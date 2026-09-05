import { test, expect } from "@playwright/test";
import type { Day } from "@/lib/dates";
import { awayFrom, type NonWorking } from "@/lib/workdays";

/**
 * Who is away, and when they are back (SPEC D75, 9A item 9).
 *
 * The fifth spec in this suite that is not a walk through a screen, and it earns
 * the exception for a reason the others do not have: the screens it feeds can
 * only be walked on a working day. Riyadh's weekend is Friday and Saturday, and
 * on both of those the right answer is that nobody is away — so a suite that
 * only asked the manager's screen would prove nothing at all two days in seven,
 * and would prove it silently.
 *
 * Days are picked from a known week rather than from today, for the reason
 * tests/waiting.spec.ts gives: a spec whose answer changes with the day it runs
 * is a spec nobody trusts on a Monday.
 */

// Sun 30/Aug/2026 … Sat 05/Sep/2026. Friday is the 4th, Saturday the 5th.
const SUN: Day = "2026-08-30";
const MON: Day = "2026-08-31";
const TUE: Day = "2026-09-01";
const WED: Day = "2026-09-02";
const THU: Day = "2026-09-03";
const FRI: Day = "2026-09-04";
const SAT: Day = "2026-09-05";
const NEXT_SUN: Day = "2026-09-06";
const NEXT_MON: Day = "2026-09-07";

const SAAD = "saad-id";
const TURKI = "turki-id";

const leave = (day: Day, userId: string): NonWorking => ({ day, userId });
const holiday = (day: Day): NonWorking => ({ day, userId: null });

test("away is his own leave, and it names the day he is back", () => {
  const away = awayFrom(MON, [leave(MON, SAAD)]);
  expect(away.get(SAAD)?.backOn).toBe(TUE);
});

test("a weekend is not leave, and nobody is away on one", () => {
  // Nobody is at work on a Friday, so nobody is missing from it and there is no
  // floor for anybody to cover. A row on a weekend day says nothing.
  expect(awayFrom(FRI, [leave(FRI, SAAD)]).size).toBe(0);
  expect(awayFrom(SAT, [leave(SAT, SAAD)]).size).toBe(0);
});

test("nor is a company holiday: the office is shut, not short-handed", () => {
  expect(awayFrom(MON, [holiday(MON), leave(MON, SAAD)]).size).toBe(0);
});

test("back on the next day he works, not the day after his last one off", () => {
  // Off Wednesday and Thursday: the day after is a Friday, and the two days
  // after that are the weekend. He is back on Sunday, which is the only answer
  // a manager can do anything with.
  const away = awayFrom(WED, [leave(WED, SAAD), leave(THU, SAAD)]);
  expect(away.get(SAAD)?.backOn).toBe(NEXT_SUN);
});

test("a holiday in the way pushes the day he is back", () => {
  const away = awayFrom(WED, [leave(WED, SAAD), leave(THU, SAAD), holiday(NEXT_SUN)]);
  expect(away.get(SAAD)?.backOn).toBe(NEXT_MON);
});

test("somebody else's leave is not his", () => {
  const away = awayFrom(MON, [leave(MON, SAAD), leave(TUE, TURKI)]);
  expect(away.has(SAAD)).toBe(true);
  expect(away.has(TURKI)).toBe(false);
  // And Turki's own day off does not shorten Saad's stretch or lengthen it.
  expect(away.get(SAAD)?.backOn).toBe(TUE);
});

test("two people away on one day are two answers", () => {
  const away = awayFrom(SUN, [leave(SUN, SAAD), leave(SUN, TURKI), leave(MON, TURKI)]);
  expect(away.get(SAAD)?.backOn).toBe(MON);
  expect(away.get(TURKI)?.backOn).toBe(TUE);
});

test("nobody away is an empty answer, not an empty screen", () => {
  expect(awayFrom(MON, []).size).toBe(0);
  expect(awayFrom(MON, [holiday(NEXT_SUN)]).size).toBe(0);
});
