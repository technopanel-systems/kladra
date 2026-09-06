import { test, expect } from "@playwright/test";
import { isQuiet, USE_WINDOW_DAYS } from "@/lib/use-window";

/**
 * One predicate for "quiet" (SPEC D95). The Use screen's headline counted
 * people its own rows excused as away, so the number at the top and the amber
 * down the table disagreed about the same person. Pure, like the floor rule and
 * the waiting rule: when this is wrong it looks right.
 */
test("never opened is quiet, opened this week is not, and the window is the line", () => {
  expect(isQuiet({ daysSince: null, away: false })).toBe(true);
  expect(isQuiet({ daysSince: 0, away: false })).toBe(false);
  expect(isQuiet({ daysSince: USE_WINDOW_DAYS - 1, away: false })).toBe(false);
  expect(isQuiet({ daysSince: USE_WINDOW_DAYS, away: false })).toBe(true);
});

test("away today excuses today, whether he has been quiet a week or has never opened it", () => {
  expect(isQuiet({ daysSince: USE_WINDOW_DAYS + 3, away: true })).toBe(false);
  expect(isQuiet({ daysSince: null, away: true })).toBe(false);
  // And somebody who opened it yesterday is not quiet, away or not.
  expect(isQuiet({ daysSince: 1, away: true })).toBe(false);
});
