import { test, expect } from "@playwright/test";
import { boxOffered, figuresOf } from "@/lib/report-figures";
import type { FloorDay } from "@/lib/reports";
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

/**
 * The figures a card shows are the ones its person can move (SPEC D97, D50).
 * Marketing never raises a quotation or a dispatch, so its card carries two
 * figures and not eight — six noughts it cannot change read as a floor that
 * did nothing.
 */
const floor: FloorDay = {
  kind: "floor",
  sells: true,
  logged: 3,
  companies: 2,
  quotationsRaised: 0,
  quotationsSentBack: 0,
  answersRecorded: 0,
  dispatchesRaised: 0,
  dispatchesApproved: 0,
  sqmMoved: "0",
  callsDue: 1,
  callsMade: 1,
};

test("a rep's card carries the whole chain, marketing's the two it can move", () => {
  expect(figuresOf(floor).map((figure) => figure.key)).toEqual([
    "logged",
    "companies",
    "quotationRequests",
    "sentBack",
    "answers",
    "dispatchRequests",
    "dispatchesApproved",
    "moved",
  ]);
  expect(figuresOf({ ...floor, sells: false }).map((figure) => figure.key)).toEqual([
    "logged",
    "companies",
  ]);
});

/**
 * An off day is offered, not owed (SPEC S47, D57, D97): the box is there on a
 * Saturday that is still open, gone on a Saturday that has closed, and a note
 * already written is shown whatever the day was.
 */
test("the box on an off day: offered while open, gone when closed, kept when written", () => {
  expect(boxOffered("off", true, null)).toBe(true);
  expect(boxOffered("off", false, null)).toBe(false);
  expect(boxOffered("off", false, "worked the exhibition")).toBe(true);
  expect(boxOffered("open", true, null)).toBe(true);
  expect(boxOffered("silent", false, null)).toBe(true);
});
