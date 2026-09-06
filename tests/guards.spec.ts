import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P11A-9 — two guards against a slip that costs somebody real work (SPEC D96,
 * with D84).
 *
 * A. The phone's back gesture is a route change, not a tap beside the sheet —
 *    D84's "a stray tap does not throw away what was typed" guard never saw
 *    it. A dirty Log sheet now holds one extra history entry, so back lands
 *    on it rather than unmounting the drawer; Cancel, Escape and Save still
 *    close the sheet and take the entry with them
 *    (src/components/ui-ext/use-back-guard.ts).
 * B. A company named like a spreadsheet formula is exported as text, not run
 *    on the admin's own machine when he opens the file in Excel
 *    (src/lib/csv.ts's `csvCell` — tests/csv.spec.ts is the pure unit test;
 *    this is the wiring through the real export route).
 *
 * House style: tests/rep.spec.ts (`dialogNamed`, the Log sheet's own
 * locators inside the drawer's `companyActions` group) and tests/admin.spec.ts
 * step 9 (the export fetched with `page.request` and read as UTF-8).
 *
 * This file owns no other write than what it makes and undoes itself: test A
 * never reaches Save, so there is nothing in the database to unwind; test B's
 * one inserted row is deleted in a `finally`.
 */

/** A cold screen behind a fresh query; the suite's default 5s is for a click. */
const COLD = { timeout: 30_000 };

/** A dialog or drawer by its title (tests/rep.spec.ts). */
function dialogNamed(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name });
}

test("the back gesture does not take the words with it", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  // A bottom sheet at this width (DESIGN §2) — the phone's own back gesture is
  // exactly what this guards against.
  await page.setViewportSize({ width: 375, height: 812 });

  const company = await one<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa' and c.archived_at is null
      order by c.created_at desc
      limit 1`,
  );

  await test.step("a history entry before the drawer, then the drawer itself", async () => {
    await page.goto(`/${locale}/companies`);
    await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);

    await page.goto(`/${locale}/companies?open=${company.id}`);
    await expect(dialogNamed(page, company.name)).toBeVisible(COLD);
  });

  await test.step("typing into Log, then swiping back, leaves the sheet exactly as it was", async () => {
    const drawer = dialogNamed(page, company.name);
    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("common.log"), exact: true })
      .click();

    const dialog = dialogNamed(page, t("drawer.logTitle"));
    const whatHappened = dialog.getByLabel(t("drawer.whatHappened"));
    await whatHappened.fill("typed before swiping back");

    await page.goBack();

    await expect(page, "the back gesture left the drawer's own screen").toHaveURL(
      new RegExp(`open=${company.id}`),
    );
    await expect(dialog, "the back gesture closed the sheet").toBeVisible();
    await expect(whatHappened, "the back gesture took the typed words with it").toHaveValue(
      "typed before swiping back",
    );
  });

  await test.step("Cancel closes it for good, and a second back leaves the company", async () => {
    const dialog = dialogNamed(page, t("drawer.logTitle"));
    await dialog.getByRole("button", { name: t("common.cancel") }).click();
    await expect(dialog).toBeHidden();

    await page.goBack();

    await expect(page, "a deliberate close should not leave a phantom entry behind it").not.toHaveURL(
      /open=/,
    );
    await expect(dialogNamed(page, t("drawer.logTitle"))).toHaveCount(0);
  });
});

test("a company named like a formula is exported as text", async ({ page, locale }) => {
  const formulaName = '=HYPERLINK("http://x")';
  let companyId = "";

  try {
    const repId = await userId("faisal@technopanel.com.sa");
    const inserted = await one<{ id: string }>(
      `insert into companies (name, rep_id, country_id, city_id, city_text, category_id, lead_source_id)
       select $1::text, rep_id, country_id, city_id, city_text, category_id, lead_source_id
         from companies
        where rep_id = $2::uuid and archived_at is null
        limit 1
       returning id`,
      [formulaName, repId],
    );
    companyId = inserted.id;

    await login(page, locale, "jerom");
    const response = await page.request.get("/api/export/companies");
    expect(response.status(), "the export did not download").toBe(200);
    const body = (await response.body()).toString("utf8");

    expect(
      body,
      "the formula name reached the file unarmed, ready for Excel to run it",
    ).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(body, "a naked formula cell reached the file").not.toContain(`"=HYPERLINK`);
    expect(body, "a phone number lost its country prefix in the export").toMatch(/"\+966\d+"/);
  } finally {
    if (companyId) await query("delete from companies where id = $1::uuid", [companyId]);
  }
});
