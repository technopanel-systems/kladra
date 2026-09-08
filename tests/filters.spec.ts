import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";
import { PHONE_MAX_PX } from "@/lib/breakpoint";

/**
 * P11J — the chips over a list, and the row they sit in (D145).
 *
 * The chip was written five times. Four of them agreed after P9 and the fifth,
 * private to the projects screen, was a different height with square corners and
 * no sign that it had been pressed. The row was written four times and all four
 * disagreed about one thing: what happens when it runs out of width. At 375 the
 * quotations list ran the list/board switch, four status chips and «All» into a
 * single wrapping row, so «All» came round underneath behind a divider and read
 * as a group of one.
 *
 * Two rules, one test each. Every chip in the app is the same object, which is
 * asked of the pixels rather than of the import. And what changes the SHAPE of a
 * list takes its own row below the phone line — the same line the shell and the
 * forms change on (D128), never a second one.
 */

const COLD = { timeout: 30_000 };
const PHONE = { width: 375, height: 812 };

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, "the control is not on the screen").not.toBeNull();
  return rect!;
}

/** The chips on a screen, wherever they are drawn from. */
function chipsOn(page: Page): Locator {
  return page.locator('[data-slot="filter-chip"]');
}

test("every chip over every list is the same object", async ({ page, locale }) => {
  test.slow();

  // Jerom sees all four: the three list screens and the admin's lookups, which
  // is the same row with nothing in front of it.
  await login(page, locale, "jerom");

  const heights: { where: string; height: number }[] = [];

  for (const path of ["/quotations", "/dispatches", "/projects", "/admin/lookups"]) {
    await page.goto(`/${locale}${path}`);
    const chips = chipsOn(page);
    await expect(chips.first(), `no chips on ${path}`).toBeVisible(COLD);

    const count = await chips.count();
    for (let i = 0; i < count; i += 1) {
      heights.push({ where: path, height: Math.round((await box(chips.nth(i))).height) });
    }
  }

  // One height, everywhere. The fifth copy was a default-size button: taller,
  // square, and it is the shape that gives a private copy away.
  const first = heights[0];
  for (const chip of heights) {
    expect(chip.height, `a chip on ${chip.where} is not the shape of the one on ${first.where}`).toBe(
      first.height,
    );
  }
});

test("what changes a list's shape is not on the chips' line, below the phone line", async ({
  page,
  locale,
}) => {
  test.slow();

  await login(page, locale, "rawan");
  await page.setViewportSize(PHONE);
  await page.goto(`/${locale}/quotations`);

  const lead = page.locator('[data-slot="filter-lead"]');
  const chips = chipsOn(page);
  await expect(lead, "the quotations list has no view switch").toBeVisible(COLD);
  await expect(chips.first()).toBeVisible();

  await test.step("at 375 the switch is above the chips, not among them", async () => {
    const switchBox = await box(lead);
    const chipBox = await box(chips.first());
    expect(
      switchBox.y + switchBox.height,
      "the switch and the chips share a line on a phone",
    ).toBeLessThanOrEqual(chipBox.y + 1);
  });

  await test.step(`still two rows at ${PHONE_MAX_PX}, which is the last phone pixel`, async () => {
    await page.setViewportSize({ width: PHONE_MAX_PX, height: 900 });
    const switchBox = await box(lead);
    const chipBox = await box(chips.first());
    expect(switchBox.y + switchBox.height).toBeLessThanOrEqual(chipBox.y + 1);
  });

  // At the desk, where there is width for one row. Just above the phone line
  // there is not: the rail takes its share and the chips group wraps whole,
  // which is the row doing its job rather than the rule changing.
  await test.step("one row at a desk width", async () => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const switchBox = await box(lead);
    const chipBox = await box(chips.first());
    const switchMiddle = switchBox.y + switchBox.height / 2;
    const chipMiddle = chipBox.y + chipBox.height / 2;
    expect(
      Math.abs(switchMiddle - chipMiddle),
      "the switch left the chips' line above the phone line",
    ).toBeLessThan(2);
  });
});
