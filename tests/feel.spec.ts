import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * P11G — the three things that made the app feel like a web page rather than a
 * tool: a rail that snapped open on every load, a browser bar the colour of the
 * phone's setting rather than Kladra's, and a pressed row that did nothing on
 * screen until the drawer arrived (§5 #40, #41; DESIGN §2 loading states).
 */

const COLD = { timeout: 30_000 };

test("a collapsed rail is collapsed from the first byte of the next page", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  const rail = page.locator("aside[data-collapsed]");
  await expect(rail).toHaveAttribute("data-collapsed", "false", COLD);

  await page.getByRole("button", { name: t("common.collapse") }).click();
  await expect(rail).toHaveAttribute("data-collapsed", "true");
  try {
    // The HTML itself, before any script has run: the server already knows,
    // so there is nothing for hydration to snap into place.
    const html = await (await page.request.get(page.url())).text();
    expect(html).toContain('data-collapsed="true"');
    await page.reload();
    await expect(rail).toHaveAttribute("data-collapsed", "true", COLD);
    // `reload` is not `goto`: the fixture's hydration wait does not cover it,
    // and a toggle pressed before React is live does nothing at all.
    await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
  } finally {
    // By keyboard: in development Next's own badge floats over the bottom of a
    // collapsed rail, exactly where the toggle sits, and swallows the pointer.
    await page.getByRole("button", { name: t("common.expand") }).focus();
    await page.keyboard.press("Enter");
    await expect(rail).toHaveAttribute("data-collapsed", "false");
  }
});

test("the browser's own chrome follows Kladra's theme, not the phone's", async ({
  page,
  context,
  locale,
}) => {
  await login(page, locale, "faisal");
  const chrome = page.locator('meta[name="theme-color"]');
  await expect(chrome).toHaveAttribute("content", "#15110e");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  try {
    // The same cookie the user menu writes (src/actions/prefs.ts).
    await context.addCookies([{ name: "theme", value: "light", url: new URL(page.url()).origin }]);
    await page.reload();
    await expect(chrome).toHaveAttribute("content", "#f5f0e9", COLD);
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  } finally {
    await context.clearCookies({ name: "theme" });
  }
});

/**
 * P13-G6 — the glass S1 took off every card had come back under every dialog:
 * the kit laid a 10% black and a 4px frost over the page, so the ground a
 * dialog, a drawer, a bottom sheet and the search palette stood on was whatever
 * the page behind happened to show (DESIGN §1: a floating surface is solid and
 * never blurred). What is read here is the property, not a picture: no backdrop
 * filter, and a background that is the theme's own `--scrim`, asked of the page
 * in that theme — so a token left undefined in one theme fails in that one.
 */
test("a dialog, a drawer and a bottom sheet lay a flat shade over the page, never a blur", async ({
  page,
  context,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  const origin = new URL(page.url()).origin;

  /** The overlay's two properties, and the colour `--scrim` resolves to on this page. */
  async function shade(slot: string) {
    const overlay = page.locator(`[data-slot="${slot}"]`);
    await expect(overlay, `no ${slot}`).toBeVisible(COLD);
    return overlay.evaluate((el) => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--scrim)";
      document.body.append(probe);
      const scrim = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const style = getComputedStyle(el);
      return { blur: style.backdropFilter, background: style.backgroundColor, scrim };
    });
  }

  function expectFlat(found: { blur: string; background: string; scrim: string }, where: string) {
    expect(found.blur, `${where} blurs the page behind it`).toBe("none");
    expect(found.scrim, `${where}: --scrim is not defined in this theme`).not.toBe("rgba(0, 0, 0, 0)");
    expect(found.background, `${where} is not the scrim`).toBe(found.scrim);
  }

  try {
    for (const theme of ["dark", "light"] as const) {
      await context.addCookies([{ name: "theme", value: theme, url: origin }]);
      await page.goto(`/${locale}/companies`);

      await page.getByRole("button", { name: t("forms.addCompany") }).click();
      expectFlat(await shade("dialog-overlay"), `the dialog in ${theme}`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);

      await page.locator('main a[href*="open="]').first().click();
      expectFlat(await shade("sheet-overlay"), `the drawer in ${theme}`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0, COLD);
    }

    // The phone's form is vaul's sheet, which draws the kit's overlay too.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${locale}/companies`);
    await page.getByRole("button", { name: t("forms.addCompany") }).click();
    expectFlat(await shade("drawer-overlay"), "the bottom sheet");
    await page.keyboard.press("Escape");
  } finally {
    await context.clearCookies({ name: "theme" });
  }
});

test("a pressed row says it is working until the drawer answers", async ({ page, locale }) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  const row = page.locator('main a[href*="open="]').first();
  await expect(row).toBeVisible(COLD);

  // Hold the answer back, as a slow connection would: the drawer's payload is
  // the request that carries `?open=` and asks for the RSC tree. Nothing is in
  // the router cache before the click: the suite runs on `next dev`, where a
  // Link prefetches nothing, and a production Link prefetches no dynamic page.
  await page.route(
    (url) => url.searchParams.has("open"),
    async (route) => {
      if (route.request().headers()["rsc"] === "1") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    },
  );

  await row.click();
  const mark = page.locator('[data-slot="link-pending"]');
  await expect(mark, "nothing on the row said the press had been taken").toBeVisible({
    timeout: 1200,
  });
  // And it goes when the answer lands — the drawer, or its skeleton.
  await expect(mark).toHaveCount(0, COLD);
  await expect(page.getByRole("dialog")).toBeVisible(COLD);
});
