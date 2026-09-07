import { numberInTerm } from "@/lib/labels";
import { login } from "./helpers/auth";
import { userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P11G — the states a screen has when it is not showing its rows: an address
 * that names no screen, a picker whose search missed, a board with nothing on
 * it, a queue searched empty, and a manager's floor that a search or a row used
 * to drop. Each says why, in the reader's language, and offers the way back
 * (DESIGN §2: never a blank; §5 #20).
 *
 * The screen that threw shares its card with the missing screen (`Trouble`),
 * and no screen throws on purpose; the first test below reads that card in the
 * browser, and the failed face differs from it by three strings and a Try
 * again, which `check:messages` holds in both locales. (Rendering the component
 * inside this runner is not an option: Playwright compiles the JSX of imported
 * components for its own component tests, and React refuses the result.)
 */

const COLD = { timeout: 30_000 };
const MISS = "zzzzqq";

test("the number in a search term is the first one, in either script, or none", () => {
  // What the lists bind as an integer (#99): decided here, never by a cast.
  expect(numberInTerm("Q-12/3")).toBe(12);
  expect(numberInTerm("12")).toBe(12);
  expect(numberInTerm("D-7")).toBe(7);
  // Typed on an Arabic keyboard.
  expect(numberInTerm("٤٥")).toBe(45);
  expect(numberInTerm("Q-۱۲")).toBe(12);
  expect(numberInTerm("Delta Rock")).toBeNull();
  expect(numberInTerm("")).toBeNull();
  // Wider than an int: not a quotation number, and never sent to Postgres.
  expect(numberInTerm("99999999999")).toBeNull();
});

test("an address that names no screen is answered inside the shell", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  // The shell streams, so the status line has gone out before the page says
  // "nothing here" — what a person gets is the card, and that is what is read.
  await page.goto(`/${locale}/nowhere-at-all`);

  const card = page.locator('[data-slot="trouble"]');
  await expect(card.getByRole("heading", { name: t("shell.missingTitle") })).toBeVisible(COLD);
  await expect(card.getByText(t("shell.missingBody"))).toBeVisible();
  // The rail is still there: lost on a page, not out of the app.
  await expect(page.getByRole("navigation", { name: t("shell.mainNav") })).toBeVisible();
  // No status code, no digest, no id on the card (DESIGN §2).
  await expect(card).not.toContainText(/\b404\b|digest|[0-9a-f]{8}-[0-9a-f]{4}-/i);

  const home = card.getByRole("link", { name: t("shell.goHome") });
  await expect(home).toHaveAttribute("href", `/${locale}`);
  await home.click();
  await page.waitForURL((url) => !url.pathname.includes("nowhere"));
  await expect(page.getByRole("heading").first()).toBeVisible(COLD);
});

test("a search that misses inside a picker says so, not that the list is empty", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);
  await page.getByRole("button", { name: t("quotations.request") }).first().click();
  const form = page.getByRole("dialog").last();
  await expect(form).toBeVisible(COLD);

  const projects = form.getByRole("combobox").first();
  await projects.click();
  await expect(projects).toHaveAttribute("aria-expanded", "true");
  await page.getByPlaceholder(t("forms.searchList")).fill(MISS);

  // His projects are all still there, one typo away — the sentence says the
  // search missed, never that there is nothing to quote on.
  await expect(page.getByText(t("forms.noMatch"))).toBeVisible();
  await expect(page.getByText(t("quotations.noProjects"))).toHaveCount(0);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
});

test("a board with nothing on it is a sentence, not six empty columns", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?view=board&q=${MISS}`);
  await expect(page.getByText(t("quotations.emptySearch", { q: MISS }))).toBeVisible(COLD);
  await expect(page.locator("[data-slot='board']")).toHaveCount(0);
  await expect(page.getByRole("button", { name: t("common.clear") }).first()).toBeVisible();
});

test("the queue searched empty keeps the search and never calls the desk clear", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue?q=${MISS}`);
  // One sentence per half, each with its Clear — and the page's own "desk is
  // clear" stays away, because it is not true.
  await expect(
    page.getByText(t("quotations.emptySearch", { q: MISS })).first(),
  ).toBeVisible(COLD);
  await expect(page.getByText(t("dispatches.emptySearch", { q: MISS })).first()).toBeVisible();
  await expect(page.getByText(t("queue.clear"))).toHaveCount(0);
  // The status is the page's, not a filter: no "All" door back to the same screen.
  await expect(page.getByRole("link", { name: t("common.all") })).toHaveCount(0);
});

test("a manager reading a rep's floor stays on it through a search, a row and a clear", async ({
  page,
  locale,
  t,
}) => {
  const rep = await userId("faisal@technopanel.com.sa");
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/companies?rep=${rep}`);

  await test.step("typing a search keeps the floor", async () => {
    await page.getByRole("searchbox", { name: t("companies.searchLabel") }).fill("a");
    await expect(page).toHaveURL(/[?&]q=a/, COLD);
    await expect(page).toHaveURL(new RegExp(`[?&]rep=${rep}`));
  });

  await test.step("opening a row keeps the floor", async () => {
    await page.locator('main a[href*="open="]').first().click();
    await expect(page).toHaveURL(/[?&]open=/, COLD);
    await expect(page).toHaveURL(new RegExp(`[?&]rep=${rep}`));
    await expect(page.getByRole("dialog")).toBeVisible(COLD);
  });

  await test.step("the way back from an empty search keeps the floor", async () => {
    await page.goto(`/${locale}/companies?rep=${rep}&q=${MISS}`);
    const back = page.getByRole("link", { name: t("companies.clearSearch") });
    await expect(back).toBeVisible(COLD);
    await expect(back).toHaveAttribute("href", `/${locale}/companies?rep=${rep}`);
  });
});
