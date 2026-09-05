import { test, expect } from "@playwright/test";
import type { Day } from "@/lib/dates";
import { countLate, LATE_AFTER_WORKING_DAYS, longestWait, waitedSince } from "@/lib/waiting";
import type { NonWorking } from "@/lib/workdays";

/**
 * How long something has waited (SPEC D59).
 *
 * The fourth spec in this suite that is not a walk through a screen, and it
 * earns the exception the same way the floor rule does: when this is wrong it
 * looks right. "2 working days" beside a request raised on Thursday and read on
 * Sunday is a plausible-looking number, and the only way to know it is a lie is
 * to count the weekend yourself.
 *
 * Riyadh's week ends on Thursday, so every case below crosses a Friday or a
 * Saturday on purpose. Days are picked from a known week rather than from
 * today, because a spec whose answer changes with the day it runs is a spec
 * nobody trusts on a Monday.
 */

// Sun 30/Aug/2026 … Sat 05/Sep/2026. Friday is the 4th, Saturday the 5th.
const SUN: Day = "2026-08-30";
const MON: Day = "2026-08-31";
const WED: Day = "2026-09-02";
const THU: Day = "2026-09-03";
const FRI: Day = "2026-09-04";
const SAT: Day = "2026-09-05";
const NEXT_SUN: Day = "2026-09-06";
const NEXT_MON: Day = "2026-09-07";

test("today is nought, not one", () => {
  // The first thing a coordinator sees when she opens the queue in the morning
  // is what arrived overnight, and a screen that calls that "1 working day"
  // has spent the day before she has.
  expect(waitedSince(THU, THU).days).toBe(0);
  expect(waitedSince(THU, THU).late).toBe(false);
});

test("a weekend is not a wait", () => {
  // Raised Thursday, read on Sunday. Two calendar days have passed and no
  // working ones — the arithmetic a reader does in their head from a date.
  expect(waitedSince(THU, FRI).days).toBe(0);
  expect(waitedSince(THU, SAT).days).toBe(0);
  expect(waitedSince(THU, NEXT_SUN).days).toBe(1);
  expect(waitedSince(THU, NEXT_MON).days).toBe(2);
});

test("nor is a company holiday, nor that person's own leave", () => {
  const holiday: NonWorking[] = [{ day: WED, userId: null }];
  expect(waitedSince(SUN, THU).days).toBe(4);
  expect(waitedSince(SUN, THU, holiday).days).toBe(3);
});

test("late is past the line, not on it", () => {
  // Two working days is the founder's answer for the stuck list (S53), and the
  // queue now calls the same thing late. On the line is not over it.
  const onTheLine = waitedSince(SUN, "2026-09-01");
  expect(onTheLine.days).toBe(LATE_AFTER_WORKING_DAYS);
  expect(onTheLine.late).toBe(false);
  expect(waitedSince(SUN, WED).late).toBe(true);
});

test("the longest wait is the worst one, and null when nothing is waiting", () => {
  expect(longestWait([], THU)).toBeNull();
  expect(longestWait([THU, SUN, WED], THU)?.days).toBe(4);
  expect(longestWait([THU], THU)?.late).toBe(false);
});

test("the count of late ones is the caption's own figure", () => {
  // The strip says "3" and under it "1 past 2 working days". Both come from
  // this one rule, so the caption cannot disagree with the list beneath it.
  // Read on Thursday: Sunday has waited four working days and Monday three, so
  // two are past the line. Wednesday has waited one and today has waited none.
  expect(countLate([THU, WED, SUN, MON], THU)).toBe(2);
  expect(countLate([THU, WED], THU)).toBe(0);
});
