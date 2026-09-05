import { test, expect } from "@playwright/test";
import { compareLines, type ComparableLine } from "@/lib/quotation-diff";

/**
 * What a revision changed (SPEC D76, 9A item 10).
 *
 * The sixth spec here that is not a walk through a screen, and it earns it the
 * way the others do: the answers this gives are all plausible-looking. "Item 2
 * changed everything and item 3 was removed" is exactly what a position-by-
 * position comparison says when a rep deletes the second of four lines, and
 * nobody reading the screen could tell that from the truth.
 *
 * The demo dataset has one revision in it, with two lines repriced. Everything
 * below is what a rep will do in the first week and the seed does not contain.
 */

const LINE: ComparableLine = {
  position: 1,
  colourCode: "168",
  supplier: "N",
  fireRating: "B1",
  class: "A",
  qty: "90",
  thickness: "4.0",
  width: "1.24",
  length: "5.8",
  pricePerSqm: "112.00",
};

const line = (position: number, over: Partial<ComparableLine> = {}): ComparableLine => ({
  ...LINE,
  position,
  ...over,
});

test("a repriced line names the price and nothing else", () => {
  const before = [line(1), line(2, { colourCode: "1020" })];
  const after = [line(1, { pricePerSqm: "118.00" }), line(2, { colourCode: "1020" })];

  const changes = compareLines(before, after);
  expect(changes).toHaveLength(1);
  expect(changes[0].kind).toBe("changed");
  expect(changes[0].position).toBe(1);
  expect(changes[0].fields).toEqual([
    { field: "pricePerSqm", from: "112.00", to: "118.00" },
  ]);
});

test("the same lines are no news, and say so by being empty", () => {
  const lines = [line(1), line(2, { colourCode: "1020" })];
  expect(compareLines(lines, lines)).toEqual([]);
});

test("a line taken out of the middle is one removal, not three changes", () => {
  // The case the pairing exists for. Compared position by position, deleting
  // the second of three lines reads as "2 changed, 3 changed, 3 removed" — three
  // lies for one deletion, every one of them believable on screen.
  const before = [
    line(1),
    line(2, { colourCode: "1020" }),
    line(3, { colourCode: "RAL 9016" }),
  ];
  const after = [line(1), line(2, { colourCode: "RAL 9016" })];

  const changes = compareLines(before, after);
  expect(changes).toHaveLength(1);
  expect(changes[0].kind).toBe("removed");
  expect(changes[0].colourCode).toBe("1020");
});

test("a line added at the end is one addition", () => {
  const before = [line(1)];
  const after = [line(1), line(2, { colourCode: "9016" })];

  const changes = compareLines(before, after);
  expect(changes).toHaveLength(1);
  expect(changes[0].kind).toBe("added");
  expect(changes[0].position).toBe(2);
});

test("the same colour twice pairs one to one, never twice", () => {
  // 168 at 4 mm and 168 at 5 mm is an ordinary quotation. If the colour pass
  // matched greedily both new lines would pair with the same old one and the
  // second would be reported as added.
  const before = [line(1, { thickness: "4.0" }), line(2, { thickness: "5.0" })];
  const after = [
    line(1, { thickness: "4.0", pricePerSqm: "115.00" }),
    line(2, { thickness: "5.0" }),
  ];

  const changes = compareLines(before, after);
  expect(changes).toHaveLength(1);
  expect(changes[0].fields.map((f) => f.field)).toEqual(["pricePerSqm"]);
});

test("a line that changed colour as well as price is still that line", () => {
  const before = [line(1)];
  const after = [line(1, { colourCode: "1020", pricePerSqm: "118.00" })];

  const changes = compareLines(before, after);
  expect(changes).toHaveLength(1);
  expect(changes[0].kind).toBe("changed");
  expect(changes[0].fields.map((f) => f.field)).toEqual(["colourCode", "pricePerSqm"]);
});

test("the fields come out in the order the form asks for them", () => {
  const before = [line(1)];
  const after = [
    line(1, { pricePerSqm: "118.00", qty: "100", supplier: "C", colourCode: "1020" }),
  ];

  expect(compareLines(before, after)[0].fields.map((f) => f.field)).toEqual([
    "colourCode",
    "supplier",
    "qty",
    "pricePerSqm",
  ]);
});

test("everything replaced is an addition and a removal, in that order", () => {
  // Nothing pairs: no identical line, no shared colour, and one line each side,
  // so the last pass pairs them by order and calls it a change. That is the
  // right answer — the rep edited the line rather than replacing it — and it is
  // only when the counts differ that lines are left over.
  const before = [line(1), line(2, { colourCode: "1020" })];
  const after = [line(1, { colourCode: "7016", supplier: "K" })];

  const changes = compareLines(before, after);
  expect(changes.map((c) => c.kind)).toEqual(["changed", "removed"]);
  expect(changes[1].colourCode).toBe("1020");
});
