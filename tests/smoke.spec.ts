import { login } from "./helpers/auth";
import { test, expect } from "./helpers/i18n";

/**
 * The scaffold smoke test: two roles land on their own home, the health route
 * is up, and a signed-out visit bounces to login. One test, one `test.step()`
 * per line of the check — WORKFLOW.md §3. Every visible string comes from the
 * `t` fixture, so this same file is what runs for `--project=ar`.
 */
test("scaffold smoke: sign-in, role homes, health, and the auth redirect", async ({
  page,
  request,
  locale,
  t,
}) => {
  await test.step(`Faisal signs in and lands on Companies, in ${locale}`, async () => {
    await login(page, locale, "faisal");
    await expect(page).toHaveURL(new RegExp(`/${locale}/companies(?:$|[/?#])`));
    await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible();
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", locale);
    await expect(html).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
  });

  await test.step("Rawan signs in and lands on the Queue", async () => {
    await login(page, locale, "rawan");
    await expect(page).toHaveURL(new RegExp(`/${locale}/queue(?:$|[/?#])`));
    await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible();
  });

  await test.step("the health route reports ok:true", async () => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ok?: boolean; db?: string };
    expect(body.ok).toBe(true);
  });

  await test.step("signed out, Companies redirects to login", async () => {
    await page.context().clearCookies();
    await page.goto(`/${locale}/companies`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/login(?:$|[/?#])`));
  });
});
