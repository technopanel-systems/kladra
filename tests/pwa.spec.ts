import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * P7 — the app is installable on a phone, and says so when the phone has no
 * signal (SPEC §3: "PWA manifest, icons, offline splash only — no offline
 * data").
 *
 * The manifest was linked from the root layout for five phases and answered
 * 404 the whole time: a promise in a `<head>` that nothing checked. Every part
 * of it is fetched here, because every part of it is a separate file that can
 * go missing on its own.
 *
 * The "no offline data" half matters more than the splash. A rep who opens
 * Kladra in a basement and reads a follow-up date cached last week, acts on it
 * and finds out afterwards is worse off than a rep who is simply told he is
 * offline. So the cache is listed, by name, and it holds two files.
 */

/** Everything the worker is allowed to keep. */
const SHELL = ["/offline.html", "/icons/icon-192.png"];

type ManifestIcon = { src: string; sizes: string; type: string; purpose?: string };
type Manifest = {
  id: string;
  name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
};

test("a phone is given everything it needs to install Kladra", async ({ page, locale }) => {
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.status(), "the manifest the layout links to is not served").toBe(200);

  const manifest = (await response.json()) as Manifest;
  expect(manifest.name).toBe("Kladra");
  // Standalone is the point: an icon that opens a browser tab is a bookmark.
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.scope).toBe("/");
  // Dark is the default theme (D16), so the splash matches the first screen.
  expect(manifest.background_color).toBe("#0f0d0c");

  // Android needs one of each: an icon used as drawn, and one it may crop.
  const purposes = new Set(manifest.icons.map((icon) => icon.purpose));
  expect(purposes.has("any")).toBe(true);
  expect(purposes.has("maskable")).toBe(true);
  expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);

  for (const icon of [...manifest.icons.map((i) => i.src), "/icons/apple-touch-icon.png"]) {
    const file = await page.request.get(icon);
    expect(file.status(), `${icon} is in the manifest and not on disk`).toBe(200);
    expect(file.headers()["content-type"], `${icon} is not a PNG`).toContain("image/png");
    // A PNG's first eight bytes. A 404 page served with the wrong type would
    // pass every check above and install as a blank square.
    const head = (await file.body()).subarray(0, 8);
    expect([...head], `${icon} is not really a PNG`).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  }

  // The splash is a plain file, so it is there with no server rendering it.
  const splash = await page.request.get("/offline.html");
  expect(splash.status()).toBe(200);
  const html = await splash.text();
  // Both languages on one page: there is no server to ask which one to use.
  expect(html).toContain("No connection");
  expect(html).toContain("لا يوجد اتصال");

  // And the linked icon is really in the document, in both locales.
  await page.goto(`/${locale}/login`);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
});

test("with no signal the splash appears, and nothing about a customer was kept", async ({
  page,
  context,
  locale,
}) => {
  await login(page, locale, "faisal");
  await expect(page.getByRole("heading").first()).toBeVisible();

  await test.step("the worker registers and keeps two files", async () => {
    const cached = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const names = await caches.keys();
      const entries: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) entries.push(new URL(request.url).pathname);
      }
      return entries.sort();
    });

    // Exactly the splash and the mark on it. A future change that starts
    // caching a screen, a query or an icon of a company fails right here —
    // which is the whole of "no offline data".
    expect(cached, "the worker cached something other than the splash").toEqual([...SHELL].sort());
  });

  await test.step("cutting the network shows the splash rather than a browser error", async () => {
    await context.setOffline(true);
    // `page.reload`, not `page.goto`: the helper's goto waits for React to
    // hydrate, and the splash is a plain file that never will.
    await page.reload().catch(() => {});

    await expect(page.getByText("No connection")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("لا يوجد اتصال")).toBeVisible();
    // It says what happened, not what went wrong technically (DESIGN §5).
    await expect(page.getByText("Nothing you typed has been lost.")).toBeVisible();
  });

  await test.step("and the app comes back on its own", async () => {
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 15_000 });
  });
});
