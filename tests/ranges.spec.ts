import { test, expect } from "@playwright/test";
import {
  DEFAULT_RANGE,
  RANGES,
  RANGE_SCREEN,
  rangeFor,
  rangeStart,
  parseRange,
} from "@/lib/ranges";
import { TABS, DEFAULT_TAB, tabFor, parseTab, type Tab } from "@/lib/tabs";

/**
 * The two choices a home screen carries in its URL: which tab, and over what
 * window (D151, D152, D154).
 *
 * Both modules are pure — no database, no request — which is the whole reason
 * they are their own files: a rule about precedence should be askable in one
 * line rather than walked through a browser. The screens that use them are
 * walked in tests/metrics.spec.ts, and the memory behind them in
 * tests/board.spec.ts; what is here is the arithmetic and the order of
 * precedence underneath.
 *
 * The one that needs a test more than the others is the quarter across a New
 * Year: "the last three months including this one" read on 3 January is
 * November, and a `slice(0, 4)` on the year would make it November of the year
 * that has not happened yet.
 */

test("the URL wins, then what he chose last, then the default", () => {
  expect(rangeFor("month", "year")).toBe("month");
  expect(rangeFor(undefined, "year")).toBe("year");
  expect(rangeFor(undefined, undefined)).toBe(DEFAULT_RANGE);

  // One key for the window, not one per screen: the day and the team ask for
  // `chosen(remembered, "range", RANGE_SCREEN)` and cannot drift apart, because
  // a rep who set the year on his own figures means the year when he reads the
  // floor's (D152, D164).
  expect(RANGE_SCREEN).toBe("metrics");

  // The quarter, and the reason is in D152: a month is too short a window to
  // ask what converts, and it would print a collapse on the first of every one.
  expect(DEFAULT_RANGE).toBe("quarter");

  // Rubbish in the address is not an error page; it is the default.
  expect(rangeFor("fortnight", undefined)).toBe(DEFAULT_RANGE);
  expect(parseRange("fortnight")).toBeNull();
  expect(parseRange(undefined)).toBeNull();
  for (const range of RANGES) expect(parseRange(range)).toBe(range);
});

test("a window starts where the business would say it starts", () => {
  // Mid-month, mid-year: nothing crosses anything.
  expect(rangeStart("month", "2026-09-08")).toBe("2026-09-01");
  expect(rangeStart("quarter", "2026-09-08")).toBe("2026-07-01");
  expect(rangeStart("year", "2026-09-08")).toBe("2026-01-01");

  // The first of the month is inside its own month, not the end of the last.
  expect(rangeStart("month", "2026-09-01")).toBe("2026-09-01");

  // Across the New Year, which is the only arithmetic here that can be wrong
  // in a way nobody notices until January.
  expect(rangeStart("quarter", "2027-01-03")).toBe("2026-11-01");
  expect(rangeStart("quarter", "2027-02-28")).toBe("2026-12-01");
  expect(rangeStart("year", "2027-01-03")).toBe("2027-01-01");

  // A leap day is a day like any other: the window is whole months.
  expect(rangeStart("quarter", "2028-02-29")).toBe("2027-12-01");
});

test("a tab this screen does not have falls back rather than drawing nothing", () => {
  const all: Tab[] = [...TABS];
  const rep: Tab[] = ["work", "metrics"];

  expect(tabFor("metrics", "team", all)).toBe("metrics");
  expect(tabFor(undefined, "team", all)).toBe("team");
  expect(tabFor(undefined, undefined, all)).toBe(DEFAULT_TAB);

  // The manager was last on his team tab; the cookie is one per screen, but a
  // rep's day has no team tab and must not open on nothing.
  expect(tabFor(undefined, "team", rep)).toBe("work");
  expect(tabFor("team", undefined, rep)).toBe("work");
  expect(parseTab("team", rep)).toBeNull();

  // Work first, everywhere: it is what the screen is opened for.
  expect(TABS[0]).toBe("work");
  expect(DEFAULT_TAB).toBe("work");
});

