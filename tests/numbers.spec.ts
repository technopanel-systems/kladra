import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * Numbers that answer a question, and say what they mean beside it
 * (SPEC D59, Jerom's phase 9C).
 *
 * His rule was one sentence: every number must answer a question somebody asks
 * daily, and the screen must say what the number means in words next to it. Two
 * things follow that a spec can hold, and both of them are the failure this app
 * has had before rather than a style preference:
 *
 *  - a figure and the list under it come from ONE definition. The strip that
 *    says "3 waiting" and the three rows beneath it cannot be counted twice
 *    (rules/data.md), and the caption that says how many are late cannot
 *    disagree with which rows are marked late.
 *  - a figure carries its caption. A number with nothing to be measured against
 *    is the thing Jerom was looking at when he wrote the note.
 */

const COLD = { timeout: 30_000 };

test("the coordinator's four figures each say what they mean", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "rawan");
  await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);
  await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);

  const strip = page.locator('[data-slot="standing"]').first();

  await test.step("1 · every one of them carries a line of words", async () => {
    // Four figures, four captions. A figure without one is a number Jerom is
    // being asked to interpret, which is the whole of the note.
    await expect(strip.locator("> div")).toHaveCount(4);
    await expect(strip.locator('[data-slot="figure-caption"]')).toHaveCount(4);
  });

  await test.step("2 · the longest wait is a length, and it is the worst row's", async () => {
    // It used to be a date, which makes the reader do working-day arithmetic in
    // their head and get it wrong over a weekend (D59).
    // `:visible` because every row is rendered twice — a card layout for the
    // phone and a table for the desk, one of them hidden by CSS at any width.
    // Counting DOM nodes here would count each row twice and quietly pass.
    const shown = await page.locator('[data-slot="waited"]:visible').allInnerTexts();
    expect(shown.length, "nothing is waiting on the seeded queue").toBeGreaterThan(0);

    // The number inside each "N working days" — the words differ by locale, the
    // digits do not (D6).
    const days = shown.map((text) => Number(text.replace(/[^\d]/g, "") || 0));
    const worst = Math.max(...days);

    const longest = strip.locator("> div").filter({ hasText: t("queue.longestWait") });
    await expect(longest).toContainText(String(worst));
  });

  await test.step("3 · the caption's count of late ones is the rows that are marked late", async () => {
    const lateRows = await page.locator('[data-slot="waited"][data-late="true"]:visible').count();
    expect(lateRows, "nothing on the seeded queue is late").toBeGreaterThan(0);

    // Read from the element, not from the sentence. The sentence has two
    // numbers in it — how many are late, and what late means — which is right
    // for a person and useless for a test; `data-tone` is already how a spec
    // reads a colour without reading a hex (DESIGN §6).
    const counted = (await page.locator("[data-late-count]").all()).reduce(
      async (running, node) => (await running) + Number(await node.getAttribute("data-late-count")),
      Promise.resolve(0),
    );
    expect(await counted, "the strip and the rows disagree about what is late").toBe(lateRows);
  });
});
