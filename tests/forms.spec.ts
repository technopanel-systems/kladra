import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
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
    await expect(form.getByLabel(t("common.name"))).toBeVisible();

    const said = await saveEmpty(page, form, t);
    await expect(said).toHaveText(t("common.required"));
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
