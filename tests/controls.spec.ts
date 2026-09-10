import type { Page } from "@playwright/test";
import { ADMIN_PATHS } from "@/components/shell/nav";
import { login } from "./helpers/auth";
import { test, expect, type Locale } from "./helpers/i18n";

/**
 * No dead controls, anywhere (DESIGN §5).
 *
 * Kladra shipped ten screens whose primary action was a disabled button wearing
 * the brand gradient — the one signal reserved for "this is the thing to press".
 * A rep pressed it, nothing happened, and the screen read as broken rather than
 * as unfinished. FACET died of screens that looked finished and were not.
 *
 * So: a control that cannot be used is not rendered as a control. Where a
 * feature is coming, a sentence says so. This walks every screen each role can
 * reach, at rest, and fails on any disabled control it finds.
 *
 * "At rest" is the whole scope. A button that disables itself while a save is in
 * flight is right and is not reachable from here — nothing is submitted.
 */

const REP_SCREENS = ["", "companies", "projects", "quotations", "dispatches", "notifications"];
const COORDINATOR_SCREENS = ["", "queue", "quotations", "dispatches", "notifications"];
// The admin half read from the rail (D99): typed here it had missed /admin/use.
const ADMIN_SCREENS = [
  "",
  "companies",
  "projects",
  "quotations",
  "dispatches",
  "team",
  "notifications",
  ...ADMIN_PATHS.map((path) => path.slice(1)),
];

/**
 * Everything on screen that says "you cannot press me". `aria-disabled` counts:
 * Radix marks some controls that way rather than with the attribute, and a
 * screen reader treats the two the same.
 */
async function deadControls(page: Page): Promise<string[]> {
  return page
    .locator("button[disabled], [aria-disabled='true'], a[aria-disabled='true']")
    .filter({ visible: true })
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim() || "(no label)"),
    );
}

/**
 * Everything wearing the brand gradient — the one signal DESIGN §2 keeps for
 * "this is the thing to press". It is a class rather than a role because that
 * is exactly what the rule is about: the gradient, and only `variant="brand"`
 * may draw it (`scripts/one-look.mts`).
 */
async function primaryActions(page: Page): Promise<string[]> {
  return page
    .locator('[class*="brand-grad"]')
    .filter({ visible: true })
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim() || "(no label)"),
    );
}

async function walk(page: Page, locale: Locale, screens: readonly string[]): Promise<void> {
  for (const screen of screens) {
    await page.goto(`/${locale}/${screen}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
    expect(await deadControls(page), `disabled control on /${locale}/${screen}`).toEqual([]);

    /*
     * And never two of them (DESIGN §2, P12-14).
     *
     * §3 asks an empty list for "one sentence and its primary action", and two
     * screens answered by drawing the action a SECOND time inside the empty
     * panel, under the one already in the heading row: two brand gradients on
     * one screen, which is one more than the number of things to press. It is
     * checked on every screen rather than on those two, because the next copy
     * will be somebody being helpful on a third.
     *
     * The screens are the three lists above. A review queue, where every card
     * carries the one decision it is there for, is a different shape and is not
     * among them — /duplicates is the only one, and adding it here would be
     * asking this rule a question it was not written to answer.
     */
    const primaries = await primaryActions(page);
    expect(primaries.length, `${primaries.join(" / ")} on /${locale}/${screen}`).toBeLessThanOrEqual(
      1,
    );
  }
}

test("no screen offers a control that cannot be used", async ({ page, locale }) => {
  // Twenty-four screens across three roles, each compiled on first sight by the
  // dev server. The default timeout is for one screen's worth of work.
  test.slow();

  await test.step("the rep floor", async () => {
    await login(page, locale, "faisal");
    await walk(page, locale, REP_SCREENS);
  });

  await test.step("the coordinator's screens", async () => {
    await login(page, locale, "rawan");
    await walk(page, locale, COORDINATOR_SCREENS);
  });

  await test.step("the admin's screens, which are the most of them", async () => {
    await login(page, locale, "jerom");
    await walk(page, locale, ADMIN_SCREENS);
  });
});

test("no drawer offers a control that cannot be used", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  await test.step("the company drawer, where two of them used to live", async () => {
    await page.goto(`/${locale}/companies`);
    await page.getByRole("table").first().getByRole("link").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    expect(await deadControls(page)).toEqual([]);

    // Every tab, not only the one it opens on.
    for (const tab of ["common.contacts", "common.projects", "common.quotations"] as const) {
      await page.getByRole("dialog").first().getByRole("tab", { name: t(tab) }).click();
      expect(await deadControls(page), `disabled control under ${tab}`).toEqual([]);
    }
  });

  await test.step("the project drawer", async () => {
    await page.goto(`/${locale}/projects`);
    await page.getByRole("table").first().getByRole("link").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    expect(await deadControls(page)).toEqual([]);

    await page
      .getByRole("dialog")
      .first()
      .getByRole("tab", { name: t("common.quotations") })
      .click();
    expect(await deadControls(page)).toEqual([]);
  });
});
