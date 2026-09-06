import { test, expect } from "@playwright/test";
import { lastFinishedChange } from "@/lib/month-change";
import type { MonthFigure } from "@/lib/months";

/**
 * The one sentence over the six-month bars says what the bars say (SPEC D90).
 *
 * It used to say "the first month with anything in it" whenever the month
 * before the last finished one was empty — over four bars that plainly had
 * metres in them. Pure, like tests/waiting.spec.ts: the figures are given.
 */

function figures(achieved: number[]): MonthFigure[] {
  return achieved.map((sqm, index) => ({
    month: `2026-0${index + 1}`,
    achieved: String(sqm),
    target: null,
  })) as MonthFigure[];
}

test("a per cent when the month before had metres", () => {
  const change = lastFinishedChange(figures([0, 100, 150, 999]));
  expect(change?.kind).toBe("percent");
  expect(change?.percent).toBe(50);
});

test("first, only when nothing came before", () => {
  const change = lastFinishedChange(figures([0, 0, 120, 999]));
  expect(change?.kind).toBe("first");
  expect(change?.percent).toBeNull();
});

test("after an empty month, when earlier ones were not empty", () => {
  const change = lastFinishedChange(figures([80, 0, 120, 999]));
  expect(change?.kind).toBe("afterEmpty");
  expect(change?.percent).toBeNull();
});

test("nothing, when the last two finished months are both empty", () => {
  const change = lastFinishedChange(figures([80, 0, 0, 999]));
  expect(change?.kind).toBe("nothing");
});

test("down one hundred per cent is a per cent, not a first", () => {
  const change = lastFinishedChange(figures([0, 80, 0, 999]));
  expect(change?.kind).toBe("percent");
  expect(change?.percent).toBe(-100);
});

test("the current month never takes part", () => {
  expect(lastFinishedChange(figures([50, 999]))).toBeNull();
});
