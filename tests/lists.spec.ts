import { test, expect } from "@playwright/test";
import { BAND_LIMIT, LIST_LIMIT, STUCK_SHOWN, topOf } from "@/lib/list-size";

/**
 * What a list is not showing (SPEC D80, the carried item from P9.6).
 *
 * The seventh spec here that is not a walk through a screen, and it earns it
 * the way the others do: the seeded floor is twelve companies, and a cap that
 * bites at two hundred cannot be reached by walking anything. What CAN be
 * reached is the arithmetic underneath it, and the arithmetic is where the
 * defect would be — a total counted from the rows that survived the cap is a
 * screen that says "20" above twenty rows and means forty.
 */

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test("a list shorter than the cap is the whole list, and says so", () => {
  const group = topOf(rows(3), 20);
  expect(group.rows).toEqual([1, 2, 3]);
  expect(group.total).toBe(3);
});

test("a list at exactly the cap is not truncated", () => {
  // The boundary the screens ask about: the tail line renders only when the
  // total is greater than what is shown, so an exact fit must not claim there
  // is more.
  const group = topOf(rows(20), 20);
  expect(group.rows).toHaveLength(20);
  expect(group.total).toBe(20);
  expect(group.total > group.rows.length).toBe(false);
});

test("a longer list keeps its own length, never the length of what is drawn", () => {
  const group = topOf(rows(47), 20);
  expect(group.rows).toHaveLength(20);
  expect(group.rows[0]).toBe(1);
  expect(group.rows.at(-1)).toBe(20);
  expect(group.total, "the total was counted from the rows that survived").toBe(47);
  expect(group.total - group.rows.length).toBe(27);
});

test("nothing is an empty group, not a missing one", () => {
  expect(topOf([], 20)).toEqual({ rows: [], total: 0 });
});

test("no summary shows more than the list it points at", () => {
  // A band of the day links to the list narrowed to that same band, and a
  // stuck group is a summary of the same floor; if either cap ever passed the
  // list's, a person would follow "and 30 more" to a screen showing fewer
  // than where he came from. The band and the group are NOT ordered against
  // each other — they summarise different screens for different people, and a
  // first draft of this test claimed an order between them that nothing needs.
  expect(BAND_LIMIT).toBeLessThan(LIST_LIMIT);
  expect(STUCK_SHOWN).toBeLessThan(LIST_LIMIT);
});
