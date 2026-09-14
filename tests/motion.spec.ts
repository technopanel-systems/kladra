import type { Locator } from "@playwright/test";
import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * P11G — motion where it explains (DESIGN §2), and P13-G6 — the numbers it
 * explains in (DESIGN §1b, §8): a dialog, a drawer and a sheet arrive in 200 ms
 * and leave in 150, because the person has already decided; and for a person
 * who asked the operating system for less motion, what travels stops travelling
 * while the fade and its duration stay. The arrived flash is information rather
 * than decoration and keeps its two seconds either way (globals.css).
 *
 * Chromium serialises computed times in seconds ("0.15s", "1e-05s"), so the
 * numbers are parsed rather than matched as strings.
 */

const COLD = { timeout: 30_000 };

const seconds = (value: string) => Number.parseFloat(value);

/**
 * The duration a surface LEAVES in, read at the moment it starts leaving.
 *
 * Radix keeps a closing surface mounted with `data-state="closed"` until its
 * exit animation ends, and hears Escape on the document. So the observer is
 * set first and the key sent after it, from inside the page, which is the only
 * way to be looking when the attribute changes rather than a frame later.
 */
async function exitDuration(surface: Locator): Promise<string> {
  return surface.evaluate(
    (el) =>
      new Promise<string>((resolve) => {
        const observer = new MutationObserver(() => {
          if (el.getAttribute("data-state") !== "closed") return;
          observer.disconnect();
          resolve(getComputedStyle(el).animationDuration);
        });
        observer.observe(el, { attributes: true, attributeFilter: ["data-state"] });
        setTimeout(() => {
          observer.disconnect();
          resolve("never closed");
        }, 5_000);
        el.ownerDocument.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }),
  );
}

/** What the kit's keyframes travel by, as the surface resolves it. */
async function travel(surface: Locator) {
  return surface.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      scale: style.getPropertyValue("--tw-enter-scale").trim(),
      x: style.getPropertyValue("--tw-enter-translate-x").trim(),
      y: style.getPropertyValue("--tw-enter-translate-y").trim(),
    };
  });
}

// The title is the one scripts/spec3-registry.ts holds the founder's
// "Transitions" to; the band it names is 200 in and 150 out since P13-G6.
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
  expect(seconds(zoom), `dialog in ${zoom}`).toBe(0.2);
  const overlay = page.locator('[data-slot="dialog-overlay"]');
  expect(seconds(await overlay.evaluate((el) => getComputedStyle(el).animationDuration))).toBe(0.2);
  // The zoom is there for everybody who has not asked for less of it.
  expect((await travel(dialog)).scale).toBe(".95");
  const out = await exitDuration(dialog);
  expect(seconds(out), `dialog out ${out}`).toBe(0.15);
  await expect(dialog).toHaveCount(0);

  await page.locator('main a[href*="open="]').first().click();
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible(COLD);
  // The slide is the animation; the kit's transition over every property is gone.
  const slide = await sheet.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(seconds(slide), `drawer in ${slide}`).toBe(0.2);
  const away = await exitDuration(sheet);
  expect(seconds(away), `drawer out ${away}`).toBe(0.15);
  await expect(sheet).toBeHidden();

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

    // A dialog fades in over its 200 ms and does not zoom: the scale it would
    // grow from is the scale it already has.
    await page.getByRole("button", { name: t("forms.addCompany") }).click();
    const dialog = page.locator('[data-slot="dialog-content"]');
    await expect(dialog).toBeVisible(COLD);
    const fade = await dialog.evaluate((el) => getComputedStyle(el).animationDuration);
    expect(seconds(fade), `dialog ${fade}`).toBe(0.2);
    expect((await travel(dialog)).scale, "the dialog still zooms").toBe("1");
    const out = await exitDuration(dialog);
    expect(seconds(out), `dialog out ${out}`).toBe(0.15);
    await expect(dialog).toHaveCount(0);

    // A drawer fades in where it will stand, and does not slide.
    await page.locator('main a[href*="open="]').first().click();
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible(COLD);
    expect(seconds(await sheet.evaluate((el) => getComputedStyle(el).animationDuration))).toBe(0.2);
    expect(await travel(sheet), "the drawer still slides").toEqual({ scale: "1", x: "0", y: "0" });
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

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

test("a bottom sheet arrives and leaves inside the band too", async ({ page, locale, t }) => {
  // vaul's own figure is 500 ms; globals.css holds it to a dialog's numbers,
  // and from P11H every form on a phone is one of these (D129).
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await page.getByRole("button", { name: t("forms.addCompany") }).click();
  const sheet = page.locator('[data-slot="drawer-content"]');
  await expect(sheet).toBeVisible(COLD);
  const slide = await sheet.evaluate((el) => getComputedStyle(el).animationDuration);
  expect(seconds(slide), `sheet in ${slide}`).toBe(0.2);
  const out = await exitDuration(sheet);
  expect(seconds(out), `sheet out ${out}`).toBe(0.15);
  await expect(sheet).toBeHidden();
});

test.describe("a bottom sheet, for a person who asked the operating system for less motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("fades in place of the slide, over the same 200 ms", async ({ page, locale, t }) => {
    // vaul's keyframes are a slide and nothing else, so the reduced-motion
    // block gives its sheet a fade of its own (globals.css).
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies`);
    await page.getByRole("button", { name: t("forms.addCompany") }).click();
    const sheet = page.locator('[data-slot="drawer-content"]');
    await expect(sheet).toBeVisible(COLD);
    const motion = await sheet.evaluate((el) => {
      const style = getComputedStyle(el);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(motion.name, "the sheet still slides").toBe("overlay-fade-in");
    expect(seconds(motion.duration), `sheet ${motion.duration}`).toBe(0.2);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});
