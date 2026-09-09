import type { Locator } from "@playwright/test";
import { login } from "./helpers/auth";
import { one } from "./helpers/db";
import { test, expect, type Locale } from "./helpers/i18n";
import { pickFirst } from "./helpers/pick";

/**
 * P12 slice 1 — picking the value a control already holds is not a change
 * (D146, src/components/ui-ext/searchable-select.tsx).
 *
 * `SearchableSelect.choose()` used to report a change no matter what was
 * pressed. A rep opened the new-dispatch dialog, picked a quotation, opened
 * the picker again and pressed the SAME quotation — its handler cleared the
 * items it had loaded for that quotation and then set the identical value
 * back. React bails on a `setState` to an equal value, so the effect that
 * reloads the items never re-ran: its dependencies compared equal to what
 * they already were. The dialog was left on `DialogFormSkeleton` for good,
 * because nothing was left to make it try again. The company form carried
 * the same trap: re-picking the already-chosen country reset the city under
 * it (`pickCountry`, src/components/companies/company-fields.tsx).
 *
 * `choose()` now returns before calling `onChange` when the picked value
 * equals the value already held, so neither handler above ever runs a second
 * time on a no-op pick. These two walks are the regression test for that:
 * one dialog that used to freeze, and one field that used to reset its
 * neighbour.
 */

/** Toasts and first navigations, with room for a cold Turbopack route. */
const COLD = { timeout: 30_000 };

/**
 * A frozen picker has to fail LOUD, not slow: this is not COLD's 30s. Under
 * the defect the effect never re-runs, so the destination field never comes
 * back — a bare `expect` without its own timeout would sit on the suite's
 * default and read as an ordinary flake rather than the freeze it is.
 */
const NO_FREEZE = { timeout: 5_000 };

/**
 * Choose a specific option out of an open combobox, by its exact text — the
 * same race guard as tests/helpers/pick.ts's `pickFirst`, scoped to the
 * newest listbox rather than the page's first, but naming the option instead
 * of always taking the top one.
 */
async function pickNamed(combobox: Locator, name: string): Promise<void> {
  const page = combobox.page();
  await combobox.click();
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("listbox").last().getByRole("option", { name, exact: true }).click();
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
}

/**
 * Saudi Arabia's own name, in whichever script this run reads. Not a message
 * key — country and city names are seeded rows (`countries`, `cities`), the
 * same reasoning as `uaeName` in tests/phone-walk.spec.ts — so it is read
 * from the database rather than guessed at.
 */
async function saudiArabiaName(locale: Locale): Promise<string> {
  const row = await one<{ name: string }>(
    `select case when $1::text = 'ar' then name_ar else name_en end as name
       from countries
      where code = 'SA'`,
    [locale],
  );
  return row.name;
}

/**
 * The pinned Saudi city at this rank, in whichever script this run reads:
 * 0 is Riyadh, the founder's own default (`defaultCity`, src/actions/forms.ts);
 * 1 is Jeddah, the next one down the pinned order (src/lib/lookups.ts).
 */
async function pinnedSaudiCity(locale: Locale, rank: number): Promise<string> {
  const row = await one<{ name: string }>(
    `select case when $1::text = 'ar' then c.name_ar else c.name_en end as name
       from cities c
       join countries co on co.id = c.country_id
      where co.code = 'SA' and c.pinned is not null
      order by c.pinned
      offset $2::int limit 1`,
    [locale, rank],
  );
  return row.name;
}

test("the same quotation picked twice is not a change, and the form does not freeze", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/dispatches`);

  await page.getByRole("button", { name: t("dispatches.request") }).first().click();
  const form = page.getByRole("dialog", { name: t("dispatches.request") });
  await expect(form).toBeVisible(COLD);

  // The two fields the dialog asks for when it opens with no quotation of its
  // own — the Dispatches screen's primary action (SPEC §3, P8), asked as the
  // chain it is since P12-10: the customer, then that customer's papers.
  const customer = form.getByRole("combobox", { name: t("common.company") });
  const picker = form.getByRole("combobox", { name: t("common.quotation") });
  const destination = form.getByLabel(t("common.destination"));

  await test.step("picking a quotation loads the real form, not the skeleton", async () => {
    await pickFirst(customer);
    await pickFirst(picker);
    await expect(destination).toBeVisible(COLD);
  });

  await test.step("pressing the SAME quotation again is not a change — the form stays put", async () => {
    // pickFirst always takes the newest listbox's first option, and the
    // options themselves never reorder between opens — this is provably the
    // same quotation as the one already held, not merely a likely one.
    await pickFirst(picker);
    await expect(destination).toBeVisible(NO_FREEZE);
    await expect(form.locator('[data-slot="skeleton"]')).toHaveCount(0);
  });
});

test("the same country picked twice leaves the city alone", async ({ page, locale, t }) => {
  const saudiArabia = await saudiArabiaName(locale);
  const riyadh = await pinnedSaudiCity(locale, 0);
  const jeddah = await pinnedSaudiCity(locale, 1);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);

  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
  const form = page.getByRole("dialog", { name: t("forms.addCompany") });

  const country = form.getByRole("combobox", { name: t("common.country") });
  const city = form.getByRole("combobox", { name: t("common.city") });

  await test.step("it opens on Saudi Arabia and Riyadh, the answer nine times in ten", async () => {
    await expect(country).toBeVisible(COLD);
    await expect(country).toContainText(saudiArabia);
    await expect(city).toContainText(riyadh);
  });

  await test.step("a different Saudi city is chosen", async () => {
    await pickNamed(city, jeddah);
    await expect(city).toContainText(jeddah);
  });

  await test.step("picking Saudi Arabia again — the country it already held — leaves the city untouched", async () => {
    await pickNamed(country, saudiArabia);
    await expect(city).toContainText(jeddah);
  });

  await page.keyboard.press("Escape");
});
