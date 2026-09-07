import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * P11G — motion where it explains, inside 150–250 ms (DESIGN §2), and none of
 * it for a person who asked the operating system for less; the one exception
 * being the arrived flash, which is information rather than decoration and
 * keeps its two seconds either way (globals.css).
 *
 * Chromium serialises computed times in seconds ("0.15s", "1e-05s"), so the
 * numbers are parsed rather than matched as strings.
 */

const COLD = { timeout: 30_000 };

const seconds = (value: string) => Number.parseFloat(value);

test("dialogs zoom and drawers slide inside the band, and a row's flash is two seconds", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);

  await page.getByRole("button", { name: t("forms.addCompany") }).click();
  const dialog = page.locator('[data-slot="dialog-content"]');
  await expect(dialog).toBeVisible(COLD);
  const zoom = await dialog.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(seconds(zoom), `dialog ${zoom}`).toBeGreaterThanOrEqual(0.15);
  expect(seconds(zoom), `dialog ${zoom}`).toBeLessThanOrEqual(0.25);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.locator('main a[href*="open="]').first().click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible(COLD);
  const slide = await sheet.evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(seconds(slide), `drawer ${slide}`).toBeGreaterThanOrEqual(0.15);
  expect(seconds(slide), `drawer ${slide}`).toBeLessThanOrEqual(0.25);
  await page.keyboard.press("Escape");

  const flash = await page.locator("main tr").first().evaluate((el) => {
    el.classList.add("row-arrived");
    const duration = getComputedStyle(el).animationDuration;
    el.classList.remove("row-arrived");
    return duration;
  });
  expect(seconds(flash), `flash ${flash}`).toBe(2);
});

test.describe("a person who asked the operating system for less motion", () => {
  // A context option, not a test option: `reducedMotion` at the top level is
  // silently ignored, and the first cut of this test measured a full 200 ms.
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("gets none of the travel and all of the information", async ({ page, locale, t }) => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies`);

    // The rail's width has no time to travel in.
    const rail = page.locator("aside[data-collapsed]");
    const asked = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(asked, "the browser was not asked for less motion").toBe(true);
    const width = await rail.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(seconds(width), `rail ${width}`).toBeLessThan(0.001);

    // A dialog appears; it does not zoom.
    await page.getByRole("button", { name: t("forms.addCompany") }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible(COLD);
    const zoom = await dialog.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(seconds(zoom), `dialog ${zoom}`).toBeLessThan(0.001);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // The arrived flash is a colour with no movement in it, and the only thing
    // telling a rep that somebody else changed the row: it keeps its length.
    const flash = await page.locator("main tr").first().evaluate((el) => {
      el.classList.add("row-arrived");
      const duration = getComputedStyle(el).animationDuration;
      el.classList.remove("row-arrived");
      return duration;
    });
    expect(seconds(flash), `flash ${flash}`).toBe(2);
  });
});

test("a bottom sheet slides inside the band too", async ({ page, locale, t }) => {
  // vaul's own figure is 500 ms; globals.css holds it to the top of the band,
  // and from P11H every form on a phone is one of these (D129).
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await page.getByRole("button", { name: t("forms.addCompany") }).click();
  const sheet = page.locator('[data-slot="drawer-content"]');
  await expect(sheet).toBeVisible(COLD);
  const slide = await sheet.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(seconds(slide), `sheet ${slide}`).toBeGreaterThanOrEqual(0.15);
  expect(seconds(slide), `sheet ${slide}`).toBeLessThanOrEqual(0.25);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test.describe("a bottom sheet, for a person who asked the operating system for less motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("appears without the slide", async ({ page, locale, t }) => {
    // The 250 ms rule is an attribute selector and outranks the `*` that
    // zeroes everything else; the reduced-motion block names the sheet too.
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies`);
    await page.getByRole("button", { name: t("forms.addCompany") }).click();
    const sheet = page.locator('[data-slot="drawer-content"]');
    await expect(sheet).toBeVisible(COLD);
    const slide = await sheet.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(seconds(slide), `sheet ${slide}`).toBeLessThan(0.001);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});
