import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { test, expect, type Translate } from "./helpers/i18n";

/**
 * "All" is the first and the default view (SPEC §3 P13): "Nobody should be able
 * to forget a company because the default hid it."
 *
 * Two halves. The chip: All is the first choice in its row, where the eye starts
 * in either direction, and it is the one pressed when the address names no
 * filter. And the memory: a status or a follow-up band chosen yesterday is not
 * what the list opens on today — the filter lives in the address and nowhere
 * else, so a bare visit is everything. (What IS remembered is list or board,
 * D164, and a board of states shows every state; tests/board.spec.ts has that.)
 *
 * The rows are counted rather than trusted: a list that marks All pressed over a
 * narrowed set would pass the chip half and fail the founder's sentence.
 */

const COLD = { timeout: 30_000 };

/** The chips a screen narrows its list by, in the order they are drawn. */
function chipsOf(page: Page, screen: "companies" | "quotations" | "dispatches", t: Translate): Locator {
  // The companies list is narrowed by its follow-up strip, a named group of
  // links; the other two by the chip row over the list.
  return screen === "companies"
    ? page.getByRole("group", { name: t("common.followUps") }).getByRole("link")
    : page.locator('[data-slot="filter-chip"]');
}

async function rowsOnScreen(page: Page): Promise<number> {
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible(COLD);
  return (await table.getByRole("row").count()) - 1;
}

const SCREENS = [
  { screen: "companies", path: "/companies" },
  { screen: "quotations", path: "/quotations" },
  { screen: "dispatches", path: "/dispatches" },
] as const;

test("companies, quotations and dispatches each open on All, with All the first chip", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");

  for (const { screen, path } of SCREENS) {
    await page.goto(`/${locale}${path}`);
    const chips = chipsOf(page, screen, t);
    await expect(chips.first(), `${screen}: All is not the first chip`).toHaveText(t("common.all"), COLD);
    await expect(chips.first(), `${screen}: All is not what the list opened on`).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Nothing else is pressed: the list is not narrowed under a lit All.
    await expect(chips.and(page.locator('[aria-current="true"]'))).toHaveCount(1);

    // First at the inline start: left of the rest in English, right of it in Arabic.
    const boxes = await chips.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect()));
    expect(boxes.length, `${screen} has nothing to choose between`).toBeGreaterThan(1);
    const [all, next] = [boxes[0], boxes[1]];
    if (locale === "ar") expect(all.right, `${screen}: All is not at the inline start`).toBeGreaterThan(next.right);
    else expect(all.left, `${screen}: All is not at the inline start`).toBeLessThan(next.left);
  }
});

test("a fresh visit after choosing a status still opens on All", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  for (const { screen, path } of SCREENS) {
    await page.goto(`/${locale}${path}`);
    const everything = await rowsOnScreen(page);

    // Choose a narrower view the way he would, by pressing the first one after
    // All: waiting on quotations and dispatches, the overdue band on companies
    // (a band with nothing in it is not a link, so this is always one with rows).
    const chosen = chipsOf(page, screen, t).nth(1);
    const label = (await chosen.textContent())?.trim() ?? "";
    await chosen.click();
    await expect(page).toHaveURL(/[?&](status|filter)=/, COLD);
    await expect(chipsOf(page, screen, t).nth(1)).toHaveAttribute("aria-current", "true", COLD);
    const narrowed = await rowsOnScreen(page);
    expect(narrowed, `${screen}: "${label}" narrowed nothing`).toBeLessThan(everything);

    // Tomorrow: the rail's link, which names no filter. Everything again.
    await page.goto(`/${locale}${path}`);
    const chips = chipsOf(page, screen, t);
    await expect(chips.first()).toHaveAttribute("aria-current", "true", COLD);
    await expect(chips.first()).toHaveText(t("common.all"));
    expect(await rowsOnScreen(page), `${screen}: the fresh visit kept the narrowing`).toBe(everything);
  }
});
