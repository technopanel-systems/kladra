import { expect, test } from "@playwright/test";
import {
  differenceFrom,
  type LoadLine,
  type LoadService,
  type QuotedLine,
  type QuotedService,
} from "@/lib/dispatch-difference";

/**
 * P13-S3 — what counts as a load differing from its quotation (SPEC §3, P13).
 *
 * "Any difference from the quotation is flagged on the dispatch for Rawan and
 * recorded for later analysis." The rule is a business rule, so it is asked here
 * directly, on hand-built papers, rather than walked: a line added, a width or a
 * price changed, a service added or its m² changed are differences; a partial
 * quantity and a line or a service left off the load are not, because cladding
 * goes out in stages and a flag on every partial load is a flag on every load.
 *
 * The values are handed over the way the action hands them over — the words a
 * reader sees for a lookup, a service by its id, figures as the database holds
 * them — and one case checks that "1.5" and "1.50" are one width.
 */

const PAPER: { lines: QuotedLine[]; services: QuotedService[]; warehouses: number[] } = {
  // Priced out of one store, which is what almost every paper says (P14).
  warehouses: [3],
  lines: [
    {
      id: "q-line-1",
      position: 1,
      colourCode: "RAL 7016",
      supplier: "N",
      fireRating: "B1",
      class: "A",
      thickness: "4.0",
      width: "1.24",
      length: "5.80",
      pricePerSqm: "118.00",
    },
    {
      id: "q-line-2",
      position: 2,
      colourCode: "RAL 9006",
      supplier: "N",
      fireRating: "B1",
      class: "A",
      thickness: "4.0",
      width: "1.50",
      length: "5.80",
      pricePerSqm: "124.00",
    },
  ],
  services: [
    { id: "q-service-1", position: 1, service: "1", sqm: "120.00", pricePerSqm: "20.00" },
    { id: "q-service-2", position: 2, service: "3", sqm: "30.00", pricePerSqm: "60.00" },
  ],
};

/** The paper's own line, carried unchanged. */
function carried(index: number): LoadLine {
  const { id, ...sheet } = PAPER.lines[index];
  return { ...sheet, quotationItemId: id };
}

/** The paper's own service, carried unchanged. */
function carriedService(index: number): LoadService {
  const { id, ...rest } = PAPER.services[index];
  return { ...rest, quotationServiceId: id };
}

/** The whole paper as a load: every line, every service, the same store, nothing touched. */
function wholeLoad(): { lines: LoadLine[]; services: LoadService[]; warehouses: number[] } {
  return {
    lines: PAPER.lines.map((_, index) => carried(index)),
    services: PAPER.services.map((_, index) => carriedService(index)),
    warehouses: [...PAPER.warehouses],
  };
}

test("the whole paper, unchanged, differs in nothing", () => {
  expect(differenceFrom(PAPER, wholeLoad())).toEqual([]);
});

test("a line the quotation does not have is added", () => {
  const load = wholeLoad();
  load.lines.push({ ...carried(0), quotationItemId: null, position: 3, colourCode: "RAL 9010" });
  expect(differenceFrom(PAPER, load)).toEqual([{ kind: "line", position: 3, change: "added" }]);
});

test("a carried line's width changed is a change, from and to", () => {
  const load = wholeLoad();
  load.lines[1] = { ...carried(1), width: "2.0" };
  expect(differenceFrom(PAPER, load)).toEqual([
    { kind: "line", position: 2, change: "changed", field: "width", from: "1.50", to: "2.00" },
  ]);
});

test("a carried line's price changed is a change", () => {
  const load = wholeLoad();
  load.lines[0] = { ...carried(0), pricePerSqm: "112" };
  expect(differenceFrom(PAPER, load)).toEqual([
    {
      kind: "line",
      position: 1,
      change: "changed",
      field: "pricePerSqm",
      from: "118.00",
      to: "112.00",
    },
  ]);
});

test("a service the quotation does not have is added", () => {
  const load = wholeLoad();
  load.services.push({
    quotationServiceId: null,
    position: 3,
    service: "2",
    sqm: "40",
    pricePerSqm: "18",
  });
  expect(differenceFrom(PAPER, load)).toEqual([{ kind: "service", position: 3, change: "added" }]);
});

test("a carried service's m² changed is a change", () => {
  const load = wholeLoad();
  load.services[0] = { ...carriedService(0), sqm: "60" };
  expect(differenceFrom(PAPER, load)).toEqual([
    { kind: "service", position: 1, change: "changed", field: "sqm", from: "120.00", to: "60.00" },
  ]);
});

test("a partial quantity is nothing: the quantity is not one of the things compared", () => {
  // The load's lines carry no quantity for the comparison at all — sending 40 of
  // 160 is the business, and more than is left never reaches this function,
  // because the action refuses it first (D12).
  const load = wholeLoad();
  expect(Object.keys(load.lines[0])).not.toContain("qty");
  expect(differenceFrom(PAPER, load)).toEqual([]);
});

test("an omitted line is nothing, and an omitted service is nothing", () => {
  expect(
    differenceFrom(PAPER, {
      lines: [carried(1)],
      services: [carriedService(1)],
      warehouses: PAPER.warehouses,
    }),
  ).toEqual([]);
});

test("a figure is compared as the database holds it: 1.5 and 1.50 are one width", () => {
  const load = wholeLoad();
  load.lines[1] = { ...carried(1), width: "1.5", length: "5.8" };
  expect(differenceFrom(PAPER, load)).toEqual([]);
});

test("everything at once comes back lines first, each in the load's own order", () => {
  const load = {
    lines: [
      { ...carried(1), class: "B", pricePerSqm: "130" },
      { ...carried(0), quotationItemId: null, position: 3 },
    ],
    services: [{ ...carriedService(0), service: "2" }],
    warehouses: [3, 7],
  };
  expect(differenceFrom(PAPER, load)).toEqual([
    { kind: "line", position: 2, change: "changed", field: "class", from: "A", to: "B" },
    {
      kind: "line",
      position: 2,
      change: "changed",
      field: "pricePerSqm",
      from: "124.00",
      to: "130.00",
    },
    { kind: "line", position: 3, change: "added" },
    { kind: "service", position: 1, change: "changed", field: "service", from: "1", to: "2" },
    // And the load itself, last, with no line number on it.
    { kind: "load", change: "changed", field: "warehouses", from: "3", to: "3,7" },
  ]);
});

/**
 * P14 — "the dispatch difference flag compares the warehouses as it compares
 * the panels and the services" (SPEC §3, P14).
 *
 * One fact about the whole load, because the stores are named on the whole load
 * and never per line; and a SET, because two names typed in the other order are
 * the same two stores and a flag on the typing order is one nobody could act on.
 */
test("a load out of a second store differs from the paper that named one", () => {
  const load = { ...wholeLoad(), warehouses: [3, 7] };
  expect(differenceFrom(PAPER, load)).toEqual([
    { kind: "load", change: "changed", field: "warehouses", from: "3", to: "3,7" },
  ]);
});

test("a load out of another store altogether says both, the paper's and its own", () => {
  const load = { ...wholeLoad(), warehouses: [7] };
  expect(differenceFrom(PAPER, load)).toEqual([
    { kind: "load", change: "changed", field: "warehouses", from: "3", to: "7" },
  ]);
});

test("the same two stores in the other order are the same two stores", () => {
  const paper = { ...PAPER, warehouses: [3, 7] };
  const load = { ...wholeLoad(), warehouses: [7, 3] };
  expect(differenceFrom(paper, load)).toEqual([]);
});
