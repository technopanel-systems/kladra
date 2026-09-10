import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";
import { DEFAULT_VIEW, parseView, viewFor, type ListView } from "@/lib/view";

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

/**
 * Waits until the SERVER has stored the remembered view, by asking it: the
 * quotations screen with no `?view=` on it answers with whatever the memory
 * says (SPEC §3, D164).
 *
 * There is nothing in the browser to look at any more. The choice used to be a
 * cookie, which a spec could read out of the jar; it is a row of
 * `screen_choices` now, written by an effect after hydration and read back only
 * by the server. Two things make polling the screen safe rather than
 * deadlocked: the `page` fixture's `goto` already waits for `html[data-hydrated]`,
 * so the write has been SENT before this is called, and a visit with no view on
 * it writes nothing itself — it agrees with what it was given — so this cannot
 * overwrite the answer it is waiting for.
 */
async function remembered(
  page: import("@playwright/test").Page,
  locale: string,
  name: string,
  view: ListView,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.goto(`/${locale}/quotations`);
        return await page
          .getByRole("link", { name })
          .getAttribute("aria-current", { timeout: 10_000 });
      },
      { timeout: COLD.timeout, message: `"${view}" was never remembered for this person` },
    )
    .toBe("true");
}

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

test("the URL wins, the person remembers, and the list is the default", () => {
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

/**
 * The founder's sentence, which the cookie could not keep: "remembered per
 * person and carried in the URL" (SPEC §3, D164).
 *
 * The signing-in between the steps is the point. `login` clears every cookie
 * first, so each of these is a different browser as far as this app can tell —
 * her desk in the morning and her phone in the car. A memory that survives that
 * is hers; a memory that does not was the machine's all along.
 */
test("the view a person chose comes back on another browser, and is only theirs", async ({
  page,
  locale,
  t,
}) => {
  const board = t("common.viewBoard");
  const list = t("common.viewList");
  await login(page, locale, "rawan");

  await page.goto(`/${locale}/quotations?view=board`);
  await expect(page.getByRole("heading").first()).toBeVisible(COLD);
  await remembered(page, locale, board, "board");

  // Her choice, on this screen. The dispatches list is a different question and
  // has not been asked, so it opens on the list it always did.
  await page.goto(`/${locale}/dispatches`);
  await expect(page.getByRole("link", { name: list })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );

  // A clean session — no cookie of hers survives it — and the board is still
  // what quotations opens on.
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations`);
  await expect(page.getByRole("link", { name: board })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );

  // And it is hers alone: the next man to sign in at this machine gets the list
  // he never left.
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);
  await expect(page.getByRole("link", { name: list })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );

  // Choosing the list puts it back — the row is overwritten, not only written.
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?view=board`);
  await page.getByRole("link", { name: list }).click();
  await expect(page.getByRole("link", { name: list })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );
  await remembered(page, locale, list, "list");
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

test("the open card is a wash on the board, never a ring", async ({ page, locale }) => {
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?view=board`);
  const card = page.locator("[data-slot='board'] a[href*='open=']").first();
  await expect(card).toBeVisible(COLD);
  await card.click();

  // The same wash the list gives its open row. A ring was the alert red DESIGN
  // §1 had already retired from every surface (P11G, §5 #34).
  const current = page.locator("[data-slot='board'] a[aria-current='true']");
  await expect(current).toHaveCount(1, COLD);
  await expect(current).toHaveClass(/\bbg-surface-2\b/);
  await expect(current).not.toHaveClass(/\bring-/);
});
