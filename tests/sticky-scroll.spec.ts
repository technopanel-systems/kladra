import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * Every board's and every wide table's horizontal scrollbar is visible without
 * scrolling down (SPEC §3 P13, DESIGN §1b).
 *
 * The bar is a proxy (`StickyScroll`): a thin scroller pinned to the top of the
 * surface and synced with it both ways. Headless Chromium draws no scrollbar in
 * a screenshot, so nothing here looks at pixels — it reads the proxy's box
 * against the viewport, and the surface's `scrollLeft` against the proxy's.
 *
 * Direction is part of the claim and has no arithmetic in it: both scrollers
 * inherit the page's `dir`, so in Arabic both count from the inline start with
 * the same sign, and the number copied from one is right for the other.
 */

const COLD = { timeout: 30_000 };
const DESK = { width: 1366, height: 900 };

/** The proxy bar and the surface it stands for, around the region named `label`. */
function wide(page: Page, label: string): { bar: Locator; surface: Locator } {
  const surface = page.getByRole("region", { name: label, exact: true });
  const outer = page.locator('[data-slot="sticky-scroll"]').filter({ has: surface });
  return { bar: outer.locator('[data-slot="sticky-scroll-bar"]'), surface };
}

/** Scrolls the PROXY by a third of what it can, towards the inline end. */
async function scrollProxy(bar: Locator, rtl: boolean): Promise<number> {
  return bar.evaluate((node, rtl) => {
    const distance = Math.round((node.scrollWidth - node.clientWidth) / 3);
    node.scrollLeft = rtl ? -distance : distance;
    return node.scrollLeft;
  }, rtl);
}

async function onScreen(bar: Locator, page: Page) {
  const box = await bar.boundingBox();
  expect(box, "the proxy bar is not drawn").not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.y, "the proxy bar is above the viewport").toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, "the proxy bar is below the fold").toBeLessThanOrEqual(viewport.height);
  return box!;
}

test("a board's scrollbar is on screen before any vertical scroll, and scrolling it moves the board", async ({
  page,
  locale,
  t,
}) => {
  await page.setViewportSize(DESK);
  const rtl = locale === "ar";

  for (const { who, path } of [
    { who: "abdulrahman" as const, path: "/projects?view=board" },
    { who: "rawan" as const, path: "/quotations?view=board" },
  ]) {
    await login(page, locale, who);
    await page.goto(`/${locale}${path}`);
    const { bar, surface } = wide(page, t("common.viewBoard"));
    await expect(bar, `${path}: five columns and more fit at 1366 — nothing to prove`).toBeVisible(COLD);
    expect(await page.evaluate(() => window.scrollY), "the page had scrolled on its own").toBe(0);

    await onScreen(bar, page);

    const moved = await scrollProxy(bar, rtl);
    expect(Math.abs(moved), `${path}: the proxy did not scroll`).toBeGreaterThan(0);
    await expect
      .poll(() => surface.evaluate((node) => node.scrollLeft), { message: `${path}: the board did not follow` })
      .toBe(moved);

    // And the other way: the board scrolled back to the start takes the proxy with it.
    await surface.evaluate((node) => {
      node.scrollLeft = 0;
    });
    await expect.poll(() => bar.evaluate((node) => node.scrollLeft)).toBe(0);

    // The first column at the inline start: the leftmost in English, the
    // rightmost in Arabic, and at the surface's own starting edge.
    const edges = await surface.evaluate((node) => {
      const own = node.getBoundingClientRect();
      const columns = [...node.querySelectorAll("[data-slot='board'] > section")].map((one) =>
        one.getBoundingClientRect(),
      );
      return { left: own.left, right: own.right, first: columns[0], second: columns[1] };
    });
    if (rtl) {
      expect(edges.first.right).toBeGreaterThan(edges.second.right);
      expect(Math.abs(edges.right - edges.first.right)).toBeLessThan(16);
    } else {
      expect(edges.first.left).toBeLessThan(edges.second.left);
      expect(Math.abs(edges.first.left - edges.left)).toBeLessThan(16);
    }
  }
});

test("a table wider than its card has its scrollbar on screen, and it stops under the top bar as the list scrolls", async ({
  page,
  locale,
  t,
}) => {
  // Nothing on the coordinator's list is wider than a desk at 1366, so the
  // desk is made narrower rather than the table wider: at 900 the rail still
  // takes its share and the quotations table runs past its card.
  await page.setViewportSize({ width: 900, height: 700 });
  const rtl = locale === "ar";
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?view=list`);

  const { bar, surface } = wide(page, t("common.quotations"));
  await expect(bar, "the quotations table fits at 900 — nothing to prove").toBeVisible(COLD);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await onScreen(bar, page);

  const moved = await scrollProxy(bar, rtl);
  expect(Math.abs(moved)).toBeGreaterThan(0);
  await expect.poll(() => surface.evaluate((node) => node.scrollLeft)).toBe(moved);

  // Down the list: the bar does not go with the rows. It stops under the app's
  // sticky top bar — not behind it, where it would be painted and unseen.
  await page.evaluate(() => window.scrollBy(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
  const banner = await page.getByRole("banner").boundingBox();
  expect(banner, "no top bar").not.toBeNull();
  await expect
    .poll(async () => Math.round((await bar.boundingBox())!.y), { message: "the bar is not under the top bar" })
    .toBe(Math.round(banner!.y + banner!.height));
});

test("the bar takes no room: the surface under it starts where the bar does, so nothing moves when it appears", async ({
  page,
  locale,
  t,
}) => {
  // The bar is shown only once the browser has measured the surface, after the
  // first paint. When it was a block of its own, the whole board or table moved
  // down by its height the moment it arrived, on every visit. So the surface's
  // own top must be the top of the component, with the bar laid over it.
  await page.setViewportSize(DESK);
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/projects?view=board`);

  const { bar, surface } = wide(page, t("common.viewBoard"));
  const outer = page.locator('[data-slot="sticky-scroll"]').filter({ has: surface });
  await expect(bar, "five columns and more fit at 1366 — nothing to prove").toBeVisible(COLD);

  const [shell, region, proxy] = await Promise.all([
    outer.boundingBox(),
    surface.boundingBox(),
    bar.boundingBox(),
  ]);
  expect(Math.abs(region!.y - shell!.y), "the board starts below the bar, so the bar pushed it down").toBeLessThan(0.5);
  expect(Math.abs(proxy!.y - shell!.y), "the bar is not at the top of the board").toBeLessThan(0.5);
});

test("inside the kit's card, the leads table's bar still stops under the top bar as the page scrolls", async ({
  page,
  locale,
  t,
}) => {
  // The card clips and does not hide (`card-face`): a card that hid its
  // overflow was the thing `sticky` stuck to, so the bar rode the card up and
  // off the screen with the rows. The manager's leads table runs past its card
  // at 1024, and a short window gives the page somewhere to scroll.
  await page.setViewportSize({ width: 1024, height: 480 });
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/leads`);

  const { bar, surface } = wide(page, t("leads.title"));
  await expect(bar, "the leads table fits at 1024 — nothing to prove").toBeVisible(COLD);
  const card = surface.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' card-face ')][1]");
  await expect(card, "the leads table is no longer in a card").toHaveCount(1);
  expect(await card.evaluate((node) => getComputedStyle(node).overflowY)).toBe("clip");

  await page.evaluate(() => window.scrollBy(0, 900));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  const banner = await page.getByRole("banner").boundingBox();
  expect(banner, "no top bar").not.toBeNull();
  await expect
    .poll(async () => Math.round((await bar.boundingBox())!.y), { message: "the bar is not under the top bar" })
    .toBe(Math.round(banner!.y + banner!.height));
});

test("a table that fits its card draws no scrollbar of its own", async ({ page, locale, t }) => {
  await page.setViewportSize(DESK);
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);

  const { bar, surface } = wide(page, t("companies.listLabel"));
  await expect(surface).toBeVisible(COLD);
  const fits = await surface.evaluate((node) => node.scrollWidth <= node.clientWidth + 1);
  expect(fits, "the companies table no longer fits at 1366 — pick a narrower one").toBe(true);
  await expect(bar).toBeHidden();
});
