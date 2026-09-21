import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { formatDay, todayRiyadh, type Day } from "@/lib/dates";
import { quotationLabel } from "@/lib/labels";
import { login } from "./helpers/auth";
import { one } from "./helpers/db";
import { keyed, readCsv, type CsvFile } from "./helpers/file";
import { test, expect, type Translate } from "./helpers/i18n";

/**
 * The files (SPEC §3, P14 14.10): "each export carries the filters of the screen
 * it came from, comes in both languages, writes dates as 04/Aug/2026, and opens
 * in Excel with its numbers as numbers and its Arabic intact."
 *
 * The first of those is the one worth walking, because it is the one that can be
 * quietly false: a file holding rows the list did not show looks exactly like a
 * file that is right. So the walk presses Export on a screen and compares what
 * came back with what is on that screen — the names in the rows, not a count —
 * and then narrows the screen and does it again.
 */

const COLD = { timeout: 15_000 };

/** Press Export on whatever screen is open, and read what the browser saved. */
async function exported(page: Page, t: Translate): Promise<CsvFile> {
  const saved = page.waitForEvent("download");
  await page.getByRole("button", { name: t("common.export") }).click();
  const download = await saved;
  return readCsv(readFileSync(await download.path(), "utf8"));
}

/**
 * The customers the screen is showing, by the name on each row's door.
 *
 * The door's label is the one place the whole name is, unclipped, and the desk
 * table is the half of the list a 1280-wide browser draws (the phone's cards are
 * the other half, hidden by CSS and rendered all the same).
 */
async function onScreen(page: Page): Promise<string[]> {
  return page
    .locator("table [data-door]")
    .evaluateAll((doors) => doors.map((door) => door.getAttribute("aria-label") ?? ""));
}

/** The same list, built out of a file's own rows. */
function doorLabels(file: CsvFile, t: Translate): string[] {
  return keyed(file.rows, t).map((row) => t("companies.openCompany", { name: row.company }));
}

test("the customers file is the customers screen, narrowed the way the screen is narrowed", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // A sign-in and three files.

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await expect(page.locator("table [data-door]").first()).toBeVisible(COLD);

  const whole = await exported(page, t);
  const floor = await onScreen(page);
  expect(floor.length, "the seeded rep has no floor to export").toBeGreaterThan(1);
  expect(
    new Set(doorLabels(whole, t)),
    "the file holds rows the list did not show, or misses rows it did",
  ).toEqual(new Set(floor));

  await test.step("a search narrows the file exactly as it narrows the list", async () => {
    // One customer's own name: whatever else it matches, it cannot match the
    // whole floor, and the file must hold what the list holds and no more.
    const term = await one<{ name: string }>(
      `select companies.name
         from companies join users on users.id = companies.rep_id
        where users.email = 'faisal@technopanel.com.sa' and companies.archived_at is null
        order by companies.name limit 1`,
    );
    await page.goto(`/${locale}/companies?q=${encodeURIComponent(term.name)}`);
    await expect(page.locator("table [data-door]").first()).toBeVisible(COLD);

    const narrowed = await exported(page, t);
    const shown = await onScreen(page);
    expect(shown.length, "the search matched nothing, so it proves nothing").toBeGreaterThan(0);
    expect(narrowed.rows.length, "the search did not narrow the file").toBeLessThan(
      whole.rows.length,
    );
    expect(new Set(doorLabels(narrowed, t))).toEqual(new Set(shown));
  });

  await test.step("and another rep's file is another rep's floor", async () => {
    await login(page, locale, "saad");
    await page.goto(`/${locale}/companies`);
    await expect(page.locator("table [data-door]").first()).toBeVisible(COLD);

    const his = await exported(page, t);
    expect(new Set(doorLabels(his, t))).toEqual(new Set(await onScreen(page)));

    // A floor, and not the building. Counted rather than compared name by name:
    // two reps hold customers of the same name on purpose — that is what the
    // duplicates screen is for — so a name on both floors proves nothing.
    const everyone = await one<{ total: number }>(
      "select count(*)::int as total from companies where archived_at is null",
    );
    expect(his.rows.length, "a rep's file is the whole database").toBeLessThan(everyone.total);
    expect(doorLabels(his, t).sort()).not.toEqual(doorLabels(whole, t).sort());
  });
});

test("a file is written in the reader's language, with its days as words and its figures bare", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "jerom");
  // The route has no locale prefix, so the screen sends its own (D6).
  const response = await page.request.get(`/api/export/quotations?locale=${locale}`);
  expect(response.status()).toBe(200);
  const file = readCsv((await response.body()).toString("utf8"));

  await test.step("every column says what it is in the reader's own words", async () => {
    // Not a key, not English in an Arabic file: each heading is the word this
    // locale gives that column (messages/<locale>/export.json).
    expect(file.head).toContain(t("export.quotation"));
    expect(file.head).toContain(t("export.sqm"));
    expect(file.head).toContain(t("export.price_per_sqm"));
    // And the rows say the kind of row they are in words too (P14 14.10).
    const rows = keyed(file.rows, t);
    expect(new Set(rows.map((row) => row.line))).toEqual(
      new Set([t("quotations.panel"), t("quotations.service")]),
    );
  });

  await test.step("a day reads 04/Aug/2026, in Western digits in both languages", async () => {
    const paper = await one<{ number: number; revision: number; requested: Day }>(
      `select q.number, q.revision,
              to_char((q.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as requested
         from quotations q order by q.number, q.revision limit 1`,
    );
    const rows = keyed(file.rows, t).filter(
      (row) => row.quotation === quotationLabel(paper.number, paper.revision),
    );
    expect(rows.length, "the first quotation is not in the file").toBeGreaterThan(0);
    expect(rows[0].requested).toBe(formatDay(paper.requested, locale));
    expect(rows[0].requested, "an Arabic-Indic digit reached a file").toMatch(
      /^\d{2}\/\S+\/\d{4}$/,
    );
  });

  await test.step("a figure is bare and a reference is text", async () => {
    // "Opens in Excel with its numbers as numbers": a quoted figure is a string
    // to some readers and a number to others, and the column an accountant sums
    // must not depend on which. A SMAC number is digits that stay text.
    const sqm = file.head.indexOf(t("export.sqm"));
    const smac = file.head.indexOf(t("export.smac_number"));
    const rows = keyed(file.rows, t);
    const panel = rows.findIndex((row) => row.sqm !== "");
    expect(panel, "no row in the file carries an area").toBeGreaterThanOrEqual(0);
    expect(file.written[panel][sqm], "the area was written as text").toMatch(/^\d+(\.\d+)?$/);
    expect(file.written[panel][smac], "a reference was written as a number").toMatch(/^".*"$/);
  });
});

/**
 * And the press says what happens to it (P13-G6, D197). A file that could not be
 * prepared is a toast that names it and carries its next step; the step is the
 * same press, and that press saves the file under the server's name.
 */
test("a file that cannot be prepared says so, and the next press saves it", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  const button = page.getByRole("button", { name: t("common.export") });
  await expect(button).toBeVisible(COLD);

  await page.route("**/api/export/companies*", (route) => route.fulfill({ status: 500, body: "" }));
  await button.click();
  const failed = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: t("common.exportFailed", { file: t("common.companies") }) });
  await expect(failed).toBeVisible(COLD);
  await expect(failed.getByRole("button", { name: t("common.close") })).toBeVisible();
  await page.unroute("**/api/export/companies*");

  const saved = page.waitForEvent("download");
  await failed.getByRole("button", { name: t("shell.tryAgain") }).click();
  const file = (await saved).suggestedFilename();
  // The day is in the name, so three downloads a month apart do not overwrite
  // each other in the Downloads folder.
  expect(file).toBe(`kladra-companies-${todayRiyadh()}.csv`);
  await expect(page.getByText(t("common.exportReady", { file }))).toBeVisible(COLD);
});
