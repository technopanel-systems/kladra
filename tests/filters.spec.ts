import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";
import { PHONE_MAX_PX } from "@/lib/breakpoint";
import { LOOKUP_KINDS } from "@/lib/lookup-kinds";

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
 * forms change on (D128), never a second one. P13-G6 added two more, each beside
 * the rule it sharpens: a chip's states differ by more than a colour, and a row
 * of chips is one line that scrolls rather than a wall.
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

/**
 * P13-G6 — a chip nobody has chosen was the kit's ghost button: no edge and no
 * surface, a word on the page until the pointer found it. Three states now, and
 * none of them is a colour alone (DESIGN §8): idle has an edge and a surface,
 * chosen is filled and heavier and says `aria-current`.
 */
test("an idle chip stands on the page, and the chosen one differs by more than a colour", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "jerom");
  await page.goto(`/${locale}/admin/lookups`);

  // The screen opens on the first kind; the second is the first one not chosen.
  const [first, second] = LOOKUP_KINDS;
  const chosen = page.getByRole("link", { name: t(`admin.lookup.${first}`), exact: true });
  const idle = page.getByRole("link", { name: t(`admin.lookup.${second}`), exact: true });
  await expect(chosen).toHaveAttribute("aria-current", "true", COLD);
  await expect(idle).not.toHaveAttribute("aria-current", "true");

  const look = (chip: Locator) =>
    chip.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        edge: style.borderTopWidth,
        edgeColour: style.borderTopColor,
        fill: style.backgroundColor,
        weight: Number(style.fontWeight),
      };
    });
  const [rest, on] = await Promise.all([look(idle), look(chosen)]);

  expect(rest.edge, "an idle chip has no edge").toBe("1px");
  expect(rest.edgeColour, "an idle chip's edge is transparent").not.toBe("rgba(0, 0, 0, 0)");
  expect(rest.fill, "an idle chip has no surface").not.toBe("rgba(0, 0, 0, 0)");
  expect(on.fill, "the chosen chip is not filled differently from an idle one").not.toBe(rest.fill);
  expect(on.weight, "the chosen chip differs only by colour").toBeGreaterThan(rest.weight);
});

/**
 * P13-G6 — a row of chips is one line, at every width (D145).
 *
 * The group wrapped, so the admin's eleven lookups stood in two lines at 1366
 * and four at 375: a wall that pushed the list off a phone's first screen. The
 * lookups are the widest row in the app, so they are the row this asks: one
 * line, which scrolls rather than widening the page, fades at the edge that has
 * more and only there (and nowhere when it all fits, as it does at a desk in
 * Arabic since the restyle), and brings the chosen chip into view when it is
 * the last one.
 */
test("a row of chips is one line that scrolls sideways, never a wall", async ({ page, locale, t }) => {
  test.slow();
  const last = LOOKUP_KINDS[LOOKUP_KINDS.length - 1];
  await login(page, locale, "jerom");

  for (const viewport of [{ width: 1366, height: 900 }, PHONE]) {
    await test.step(`at ${viewport.width}`, async () => {
      await page.setViewportSize(viewport);
      await page.goto(`/${locale}/admin/lookups`);
      const chips = chipsOn(page);
      await expect(chips.first()).toBeVisible(COLD);
      const line = page.locator('[data-slot="scroll-line"]').filter({ has: chips.first() });

      const tops = await chips.evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
      );
      expect(tops.length, "a lookup lost its chip").toBe(LOOKUP_KINDS.length);
      expect(new Set(tops).size, `the chips wrapped onto ${new Set(tops).size} lines`).toBe(1);

      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(sideways, "the chips widened the page").toBeLessThanOrEqual(0);

      // Whether the line overflows at a desk depends on the type: since the
      // restyle's tighter scale the eleven Arabic lookups fit in one line at
      // 1366, and a fade over nothing would be the bug. The scrolling is asked
      // where the row cannot fit, and the desk asks what it can: one line,
      // the page no wider.
      const fits = await line.evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
      if (viewport.width !== PHONE.width) {
        if (fits) {
          await expect(line).not.toHaveAttribute("data-more-end");
          await expect(line).not.toHaveAttribute("data-more-start");
          return;
        }
      } else {
        expect(fits, "every lookup fits on a phone — nothing to prove").toBe(false);
      }

      // At its start the line fades where there is more, which is its end.
      await expect(line).toHaveAttribute("data-more-end", "true");
      await expect(line).not.toHaveAttribute("data-more-start");

      // Scrolled to its end, the hint turns round: more behind the start, none ahead.
      await line.evaluate((node, rtl) => {
        node.scrollLeft = rtl ? -node.scrollWidth : node.scrollWidth;
      }, locale === "ar");
      await expect(line).toHaveAttribute("data-more-start", "true");
      await expect(line).not.toHaveAttribute("data-more-end");
      await expect(page.getByRole("link", { name: t(`admin.lookup.${last}`), exact: true })).toBeInViewport();
    });
  }

  await test.step("the chosen chip is on screen even when it is the last", async () => {
    await page.setViewportSize(PHONE);
    await page.goto(`/${locale}/admin/lookups?list=${last}`);
    const chip = page.getByRole("link", { name: t(`admin.lookup.${last}`), exact: true });
    await expect(chip).toHaveAttribute("aria-current", "true", COLD);
    await expect(chip).toBeInViewport({ ratio: 1 });
  });
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

  // At the desk, where the switch and the chips share one row. Where the chips
  // do not fit beside it they scroll along their own line rather than wrapping
  // under it (P13-G6), so the row stays one row at every desk width.
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
