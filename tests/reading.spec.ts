import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * Two rules about reading a screen, both of which shipped broken first
 * (DESIGN §5).
 */

/** Any character from the Arabic script, wherever it sits in a run. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** The screens a rep actually reads, plus a drawer, which is where dates live. */
const SCREENS = ["", "companies", "projects", "notifications"];

/**
 * Direction follows the first strong character, never a forced `ltr`.
 *
 * `dir="ltr"` around `04/سبتمبر/2026` puts the month name in its own
 * right-to-left run and reclassifies the year after it as an Arabic number.
 * The two join, swap, and the button reads `04/2026/سبتمبر` while the label
 * beside it is correct. It was in two places and would have been in every
 * quotation date.
 *
 * The rule is what this checks, not the symptom: `dir="ltr"` is for runs with
 * no letters in them at all — a phone number, a quantity, a keycap. Anything
 * with an Arabic letter in it either has no `dir` or has `dir="auto"`.
 */
async function forcedLtrWithArabic(page: Page): Promise<string[]> {
  const texts = await page.locator("[dir='ltr']").evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
  return texts.filter((text) => ARABIC.test(text));
}

test("nothing with an Arabic letter in it is forced left-to-right", async ({
  page,
  locale,
  t,
}) => {
  test.skip(locale !== "ar", "The rule only bites where the strong characters are Arabic.");
  await login(page, locale, "faisal");

  for (const screen of SCREENS) {
    await page.goto(`/${locale}/${screen}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
    expect(await forcedLtrWithArabic(page), `forced ltr on /${locale}/${screen}`).toEqual([]);
  }

  await test.step("and inside a drawer, where the dates are", async () => {
    await page.goto(`/${locale}/companies`);
    await page.getByRole("table").first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    for (const tab of ["common.contacts", "common.projects", "drawer.activity"]) {
      const tabButton = drawer.getByRole("tab", { name: t(tab) });
      await tabButton.click();
      await expect(tabButton).toHaveAttribute("aria-selected", "true");
      expect(await forcedLtrWithArabic(page), `forced ltr under ${tab}`).toEqual([]);
    }
  });
});

/**
 * A dialog's footer never lands on its last field.
 *
 * The scrolling body needs `min-h-0 flex-1`; without them it sizes to its
 * content instead of to the space left over, and the sticky footer sits on top
 * of the last field — which on Add company is Notes, and on a phone is most of
 * the form. Reported as "the Save bar covers Email".
 *
 * Measured on a short window, scrolled to the bottom: the dialog is capped at a
 * fraction of the viewport height, so a short window is what makes the body
 * scroll and puts the footer over the end of the form.
 */
test("a dialog's footer never covers its last field", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  // Both shapes the same dialog takes: the desktop dialog on a window too short
  // to hold the form, and the bottom sheet a phone gets, which has a layout of
  // its own (ResponsiveDialog).
  const sizes = [
    { width: 1366, height: 600, what: "a short desktop window" },
    { width: 375, height: 667, what: "a phone" },
  ];

  for (const size of sizes) {
    await test.step(size.what, async () => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(`/${locale}/companies`);
      await page.getByRole("button", { name: t("forms.addCompany") }).first().click();

      const form = page.getByRole("dialog", { name: t("forms.addCompany") });
      await expect(form.getByLabel(t("common.company"))).toBeVisible();

      // The last field a person can actually reach — the form also carries
      // hidden inputs holding the ids behind the dropdowns.
      const last = form.locator("input, textarea").filter({ visible: true }).last();
      await last.scrollIntoViewIfNeeded();

      // `data-slot` is the kit's own name for the part, not a styling class — a
      // form's action bar has no role of its own to ask for.
      const footer = form.locator("[data-slot='form-footer']");
      await expect(footer).toBeVisible();

      const fieldBox = await last.boundingBox();
      const footerBox = await footer.boundingBox();
      const formBox = await form.boundingBox();
      expect(fieldBox, "the form has no fields").not.toBeNull();
      expect(footerBox, "the dialog has no footer").not.toBeNull();
      expect(formBox, "the dialog has no box").not.toBeNull();
      if (!fieldBox || !footerBox || !formBox) return;

      const overlap = Math.round(fieldBox.y + fieldBox.height - footerBox.y);
      expect(overlap, `the footer covers ${overlap}px of the last field`).toBeLessThanOrEqual(0);

      // And the footer is inside the dialog, not pushed past its end: that is
      // the other way the same broken layout showed up, with Save off screen.
      const below = Math.round(footerBox.y + footerBox.height - (formBox.y + formBox.height));
      expect(below, `the footer hangs ${below}px past the end of the dialog`).toBeLessThanOrEqual(1);

      await page.keyboard.press("Escape");
    });
  }
});
