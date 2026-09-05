import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";
import { DEFAULT_VIEW, parseView, viewFor } from "@/lib/view";

/**
 * The second view, on the two screens that earn one (DESIGN §6).
 *
 * A board is worth building only if it answers "what is stuck", so what is
 * checked here is the two things that make it answer that: a column carries the
 * count of what is in it, and every card in a column really is in that state. A
 * board that shows the right cards in the wrong columns looks perfect and is
 * worse than the list it replaced.
 *
 * And the part that has no appearance in English: in Arabic the first column is
 * the RIGHTMOST one. That is measured, not looked at — three reviews in a row
 * have read an RTL line left to right and called it a defect.
 */

const COLD = { timeout: 30_000 };

/** The columns on screen, as the accessible name reports them: "Issued (3)". */
async function columns(page: import("@playwright/test").Page) {
  const labels = await page
    .locator("[data-slot='board']")
    .getByRole("region")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));

  return labels.map((label) => {
    const open = label.lastIndexOf("(");
    const close = label.lastIndexOf(")");
    return {
      label,
      name: open > 0 ? label.slice(0, open).trim() : label,
      count: open > 0 && close > open ? Number(label.slice(open + 1, close)) : Number.NaN,
    };
  });
}

test("the URL wins, the cookie remembers, and the list is the default", () => {
  expect(parseView("board")).toBe("board");
  expect(parseView("list")).toBe("list");
  expect(parseView("kanban")).toBeNull();
  expect(parseView(undefined)).toBeNull();

  expect(viewFor("board", "list")).toBe("board");
  expect(viewFor(undefined, "board")).toBe("board");
  expect(viewFor(undefined, undefined)).toBe(DEFAULT_VIEW);
  expect(viewFor("nonsense", "board")).toBe("board");
});

test("every card is in the column its status names, and the counts agree", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "rawan");

  const screens = [
    {
      name: "quotations",
      keys: [
        "quotations.statusRequested",
        "quotations.statusReturned",
        "quotations.statusIssued",
        "quotations.statusAccepted",
        "quotations.statusRejected",
        // Withdrawn. Not a filter chip — nobody is waiting on a withdrawn
        // request — but a column, because a state with no column is a record
        // that vanishes when a rep presses Board.
        "quotations.statusCancelled",
      ],
    },
    {
      name: "dispatches",
      keys: [
        "dispatches.statusSubmitted",
        "dispatches.statusApproved",
        "dispatches.statusRefused",
      ],
    },
  ];

  for (const screen of screens) {
    await page.goto(`/${locale}/${screen.name}?view=board`);
    await expect(page.getByRole("heading").first()).toBeVisible(COLD);

    const seen = await columns(page);
    expect(seen.length, `${screen.name} drew ${seen.length} columns`).toBe(screen.keys.length);

    let onBoard = 0;
    for (const key of screen.keys) {
      const label = t(key);
      const column = seen.find((one) => one.name === label);
      expect(column, `${screen.name} has no "${label}" column`).toBeTruthy();
      if (!column) continue;

      // The heading's own count against what the column actually drew: a board
      // whose number and cards disagree is worse than no number.
      const cards = await page
        .locator("[data-slot='board']")
        .getByRole("region", { name: column.label })
        .getByRole("listitem")
        .count();
      expect(cards, `"${label}" counted ${column.count} and drew ${cards}`).toBe(column.count);
      onBoard += cards;
    }

    // The same rows as the list, split up rather than filtered down: a board
    // that quietly drops a state is the defect this catches.
    await page.goto(`/${locale}/${screen.name}?view=list`);
    await expect(page.getByRole("heading").first()).toBeVisible(COLD);
    const rows = await page.getByRole("row").count();
    expect(onBoard, `${screen.name}: ${onBoard} on the board, ${rows - 1} in the list`).toBe(
      Math.max(rows - 1, 0),
    );
  }
});

test("the view a person chose is the view they get back", async ({ page, locale, t }) => {
  await login(page, locale, "rawan");

  await page.goto(`/${locale}/quotations?view=board`);
  await expect(page.getByRole("heading").first()).toBeVisible(COLD);

  // No query at all: the cookie written in the browser decides.
  await page.goto(`/${locale}/quotations`);
  await expect(page.getByRole("link", { name: t("common.viewBoard") })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );

  // And choosing the list puts it back.
  await page.getByRole("link", { name: t("common.viewList") }).click();
  await expect(page.getByRole("link", { name: t("common.viewList") })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );
  await page.goto(`/${locale}/quotations`);
  await expect(page.getByRole("link", { name: t("common.viewList") })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );
});

test("in Arabic the first column is the one on the right", async ({ page, locale }) => {
  test.skip(locale !== "ar", "the question only exists right-to-left");
  await login(page, locale, "rawan");

  await page.goto(`/${locale}/quotations?view=board`);
  await expect(page.getByRole("heading").first()).toBeVisible(COLD);

  const lefts = await page
    .locator("[data-slot='board']")
    .getByRole("region")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));

  expect(lefts.length, "no columns on the board").toBeGreaterThan(1);
  // Requested is first in the work's own order, so on an RTL screen it is the
  // furthest right and every column after it is further left.
  for (let i = 1; i < lefts.length; i += 1) {
    expect(lefts[i], `column ${i} is not to the left of column ${i - 1}`).toBeLessThan(lefts[i - 1]);
  }
});
