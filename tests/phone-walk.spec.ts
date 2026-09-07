import type { Locator } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect, type Locale } from "./helpers/i18n";
import { pickFirst } from "./helpers/pick";

/**
 * A phone is read in its company's country (SPEC D89).
 *
 * `normalizePhone` used to treat every number as Saudi, so a rep filling in a
 * Dubai customer's card the way it reads — "050 123 4567" — got a number
 * nobody could ring (+966 50…) and a WhatsApp link to match. The country is
 * now passed everywhere the number is read: the add-company form reads the
 * picked country before it normalises the first contact's phone
 * (src/actions/companies.ts), and the pure rule itself is
 * tests/phone.spec.ts's whole job. This is the walk through the form that
 * proves the wiring, not the arithmetic — one company, added as Faisal, whose
 * country is the Emirates and whose contact's number is typed exactly like a
 * Saudi one.
 *
 * House style follows tests/rep.spec.ts (the same Add company dialog, the same
 * combobox and drawer locators) and tests/attribution.spec.ts (a DB read
 * against the app's own definition, a try/finally that leaves the seed as it
 * found it so the other locale project runs against it unchanged).
 */

/** A dialog or drawer by its title (tests/rep.spec.ts). */
function dialogNamed(page: { getByRole: (role: "dialog", opts: { name: string }) => Locator }, name: string): Locator {
  return page.getByRole("dialog", { name });
}

/**
 * The country combobox lists the countries table's own name_en / name_ar
 * (scripts/seed/lookups.ts COUNTRIES_FACET), not a message key — there is no
 * `t()` for "United Arab Emirates". The Gulf six are pinned above the rest
 * (SPEC D7), so the option is on screen without typing a search first.
 */
function uaeName(locale: Locale): string {
  return locale === "ar" ? "الإمارات" : "United Arab Emirates";
}

test("a Dubai customer's local number is a UAE number", async ({ page, locale, t }) => {
  const company = `Dubai Facades — phone-walk ${locale}`;
  const contactName = `Rashid ${locale.toUpperCase()}`;
  const typedPhone = "050 123 4567"; // typed exactly like a Saudi number
  const city = "Dubai";

  let companyId = "";
  let contactId = "";

  try {
    await test.step("1 · Faisal adds a company in the Emirates with a contact typed like a Saudi number", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/companies`);
      await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible();

      await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
      const form = dialogNamed(page, t("forms.addCompany"));
      await expect(form.getByLabel(t("common.company"))).toBeVisible();
      await form.getByLabel(t("common.company")).fill(company);

      await pickFirst(form.getByRole("combobox", { name: t("common.category") }));
      await pickFirst(form.getByRole("combobox", { name: t("common.leadSource") }));

      // The country just picked is what the phone is read in (D89); the city
      // switches from the seeded Saudi list to free text the moment it is not
      // Saudi Arabia any more (src/components/companies/company-fields.tsx).
      const country = form.getByRole("combobox", { name: t("common.country") });
      await country.click();
      await page.getByRole("option", { name: uaeName(locale), exact: true }).click();
      await form.getByLabel(t("common.city")).fill(city);

      await form.getByLabel(t("common.name"), { exact: true }).fill(contactName);
      await form.getByLabel(t("common.phone")).fill(typedPhone);

      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("forms.added", { name: company }))).toBeVisible();

      await expect(page).toHaveURL(/[?&]open=/);
      companyId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(companyId).not.toBe("");
      await expect(dialogNamed(page, company)).toBeVisible();
    });

    await test.step("2 · the stored number is read as a UAE one, not a Saudi one", async () => {
      const row = await one<{ phone_normalized: string }>(
        `select ct.phone_normalized
           from contacts ct
           join companies c on c.id = ct.company_id
          where c.name = $1::text`,
        [company],
      );
      contactId = (
        await one<{ id: string }>(
          `select id from contacts where company_id = $1::uuid`,
          [companyId],
        )
      ).id;
      expect(row.phone_normalized, "the number was read as Saudi (+966…) instead of the company's own country").toBe(
        "+971501234567",
      );
    });

    await test.step("3 · the contact's WhatsApp link points at the UAE number", async () => {
      await page.goto(`/${locale}/companies`);
      await page
        .getByRole("link", { name: t("companies.openCompany", { name: company }) })
        .click();
      const drawer = dialogNamed(page, company);
      await expect(drawer).toBeVisible();
      await drawer.getByRole("tab", { name: t("common.contacts") }).click();

      const whatsapp = drawer.locator('a[href^="https://wa.me/"]').first();
      await expect(whatsapp).toHaveAttribute("href", "https://wa.me/971501234567");
    });

    await test.step("4 · the number reads grouped, as an international number", async () => {
      const drawer = dialogNamed(page, company);
      const whatsapp = drawer.locator('a[href^="https://wa.me/"]').first();
      // Western digits either way (D6); the grouping itself is what D89 fixes —
      // "+966 50 123 4567" would be the old, wrong reading of the same digits.
      await expect(whatsapp).toContainText("+971 50 123 4567");
    });
  } finally {
    // The floor as the seed left it (rules/data.md), for whichever locale
    // project runs next. `contacts`, `projects` and `activities` cascade off
    // `companies` (src/db/schema.ts), but audit_log and notifications carry no
    // foreign key to it — those are deleted by hand.
    if (companyId) {
      const ids = [companyId, contactId].filter(Boolean);
      await query(
        `delete from audit_log where record_type in ('company', 'contact') and record_id = any($1::text[])`,
        [ids],
      );
      await query(
        `delete from notifications where subject_type in ('company', 'contact') and subject_id = any($1::uuid[])`,
        [ids],
      );
      await query(`delete from activities where company_id = $1::uuid`, [companyId]);
      await query(`delete from contacts where company_id = $1::uuid`, [companyId]);
      await query(`delete from companies where id = $1::uuid`, [companyId]);
    }
  }
});
