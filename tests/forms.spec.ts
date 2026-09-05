import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";

/**
 * One rejected input, one sentence — the app's (DESIGN §5).
 *
 * Every form here has `required` inputs, and the browser acts on that before
 * anything else does: it refuses the submit, scrolls to the field and shows its
 * own bubble, in the BROWSER's language and direction, worded by the browser.
 * An Arabic screen in an English Chrome answered "Please fill out this field."
 * The action never ran, so the sentence the app has for exactly that case never
 * appeared.
 *
 * So the forms carry `noValidate` and the action answers. That is what these
 * check, and the check is honest either way round: if the browser were still
 * refusing, the submit would not happen and none of this text would be on
 * screen.
 */

/** Presses Save on an empty form and reads back what the app says about it. */
async function saveEmpty(page: Page, form: Locator, t: Translate): Promise<Locator> {
  await form.getByRole("button", { name: t("common.save") }).click();
  return form.getByRole("alert").first();
}

test("an empty required field is refused in the app's own words, not the browser's", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");

  await test.step("Add company", async () => {
    await page.goto(`/${locale}/companies`);
    await page.getByRole("button", { name: t("forms.addCompany") }).first().click();

    const form = page.getByRole("dialog", { name: t("forms.addCompany") });
    await expect(form.getByLabel(t("common.company"))).toBeVisible();

    const said = await saveEmpty(page, form, t);
    await expect(said).toHaveText(t("common.required"));
    await expect(form.getByLabel(t("common.company"))).toHaveAttribute("aria-invalid", "true");

    await form.getByRole("button", { name: t("common.cancel") }).click();
  });

  await test.step("Add contact, from inside the drawer", async () => {
    await page.goto(`/${locale}/companies`);
    await page.getByRole("table").first().getByRole("link").first().click();

    const drawer = page.getByRole("dialog").first();
    const tab = drawer.getByRole("tab", { name: t("common.contacts") });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await drawer.getByRole("button", { name: t("drawer.addContact") }).first().click();

    const form = page.getByRole("dialog", { name: t("forms.addContact") });
    await expect(form.getByLabel(t("common.name"), { exact: true })).toBeVisible();

    const said = await saveEmpty(page, form, t);
    await expect(said).toHaveText(t("common.required"));
  });
});

/**
 * The same rule on the forms that do not belong to a rep.
 *
 * These three were written against `useSubmitAction`, which returned the
 * action's whole-form sentence and threw its `fieldErrors` away — so an admin
 * who left one box of a lookup row empty was told "Required" at the bottom of
 * the dialog, with nothing saying which box, and a rep who forgot the
 * destination on a dispatch got the same. The sentence is at the field now, and
 * the field is marked (D43).
 */
test("a refused field is marked, on the forms a rep does not own either", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  await test.step("Add user — the admin's", async () => {
    await login(page, locale, "jerom");
    await page.goto(`/${locale}/admin/users`);
    await page.getByRole("button", { name: t("admin.addUser") }).click();

    const form = page.getByRole("dialog", { name: t("admin.addUser") });
    await expect(form.getByLabel(t("common.name"), { exact: true })).toBeVisible();

    const said = await saveEmpty(page, form, t);
    await expect(said).toHaveText(t("common.required"));
    await expect(form.getByLabel(t("common.name"), { exact: true })).toHaveAttribute("aria-invalid", "true");

    await form.getByRole("button", { name: t("common.cancel") }).click();
  });

  await test.step("Add a lookup row — one box of several", async () => {
    await page.goto(`/${locale}/admin/lookups`);
    await page.getByRole("button", { name: t("admin.addRow") }).click();

    const form = page.getByRole("dialog", { name: t("admin.addRow") });
    await expect(form.getByLabel(t("admin.inEnglish"))).toBeVisible();

    // English filled, Arabic left empty: the marked box has to be the empty
    // one, which is the whole point of answering at the field.
    await form.getByLabel(t("admin.inEnglish")).fill("Facade");
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(form.getByLabel(t("admin.inArabic"))).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel(t("admin.inEnglish"))).not.toHaveAttribute("aria-invalid", "true");

    await form.getByRole("button", { name: t("common.cancel") }).click();
  });

  await test.step("Request a dispatch — the rep's, with three boxes under the lines", async () => {
    // The one issued, still-latest quotation on Faisal's floor: named rather
    // than hoped for, so this step cannot quietly skip itself.
    const faisal = await userId("faisal@technopanel.com.sa");
    const quotation = await one<{ id: string }>(
      `select q.id from quotations q
         join companies c on c.id = q.company_id
        where c.rep_id = $1::uuid and q.status = 'issued'
          and not exists (
            select 1 from quotations later
             where later.number = q.number and later.revision > q.revision
          )
        order by q.created_at limit 1`,
      [faisal],
    );

    await login(page, locale, "faisal");
    await page.goto(`/${locale}/quotations?open=${quotation.id}`);

    const request = page.getByRole("button", { name: t("dispatches.request") });
    await expect(request.first()).toBeVisible({ timeout: 30_000 });
    await request.first().click();

    const form = page.getByRole("dialog", { name: t("dispatches.request") });
    await expect(form.getByLabel(t("common.destination"))).toBeVisible();

    // Quantities, shipment and terms all empty: the boxes carry the answer.
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(form.getByLabel(t("common.destination"))).toHaveAttribute(
      "aria-invalid",
      "true",
      { timeout: 15_000 },
    );
  });
});

test("the sign-in screen answers an empty form itself", async ({ page, locale, t }) => {
  await page.context().clearCookies();
  await page.goto(`/${locale}/login`);

  // Nothing typed at all: the browser would have stopped here.
  await page.getByRole("button", { name: t("auth.signIn") }).click();

  // The same sentence every refusal gets — naming which half was wrong would
  // turn the screen into a list of who works here (SPEC S7).
  // Scoped to the form: the toaster's live region answers to `alert` too.
  const said = page.locator("form").getByRole("alert");
  await expect(said).toHaveText(t("auth.wrongCredentials"));
  await expect(page).toHaveURL(new RegExp(`/${locale}/login`));
});
