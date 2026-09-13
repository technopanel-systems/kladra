import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { outcomeName, reportDialog, writeReport } from "./helpers/report";

const COLD = { timeout: 20_000 };

/**
 * A report can be corrected (SPEC D70, 9A item 3; §3 P13).
 *
 * There was one action on the log and it was `log`. A visit typed against the
 * wrong customer was wrong for ever, and the only correction available — a
 * second entry saying so — is one every count afterwards believes: two calls
 * where one happened, two companies touched where one was.
 *
 * The assertion that matters is not that the row disappears. It is that every
 * figure derived from the reports moves with it, which is the reason this test
 * counts rather than looks. And since P13 a correction is more than the words:
 * what kind of thing it was and what came of it are answers a rep gets wrong
 * too, and they are filters a manager reads by.
 */
test("a report written against the wrong customer stops counting", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<{ id: string; name: string }>(
    `select companies.id, companies.name
       from companies
      where companies.rep_id = $1::uuid and companies.archived_at is null
      order by companies.name
      limit 1`,
    [faisal],
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible(COLD);

  const written = `Correction test ${Date.now()}`;

  await test.step("1 · he reports a visit against this customer", async () => {
    await drawer.getByRole("button", { name: t("common.addReport"), exact: true }).first().click();
    await writeReport(reportDialog(page, t), t, locale, { kind: "visit", text: written });
    await expect(drawer.getByText(written)).toBeVisible(COLD);
  });

  const after = await counts(company.id, faisal);
  expect(after.entries, "the report was not written").toBeGreaterThan(0);

  await test.step("2 · he corrects the words and what came of it, and the day does not move", async () => {
    const row = page.locator('[data-slot="report-entry"]').filter({ hasText: written }).first();
    await row.getByRole("button", { name: t("drawer.correct") }).click();

    const dialog = page.getByRole("dialog", { name: t("reports.dialog.correctTitle") });
    await expect(dialog).toBeVisible(COLD);
    // The day and the follow-up are not on offer: the day is the report's
    // identity and the follow-up is a figure two other screens read (D70).
    await expect(dialog.getByText(t("reports.dialog.happenedOn"), { exact: true })).toBeHidden();
    // What it opened with is what he wrote.
    await expect(dialog.getByRole("radio", { name: t("common.visit"), exact: true })).toBeChecked();

    const noAnswer = await outcomeName(locale, "No answer");
    await dialog.getByText(noAnswer, { exact: true }).click();
    await dialog.getByLabel(t("reports.dialog.text")).fill(`${written} — corrected`);
    await dialog.getByRole("button", { name: t("common.save") }).click();
    await expect(dialog).toBeHidden(COLD);
    await expect(drawer.getByText(`${written} — corrected`)).toBeVisible(COLD);

    const stored = await one<{ outcome: string }>(
      `select outcomes.name_en as outcome
         from activities
         join outcomes on outcomes.id = activities.outcome_id
        where activities.text = $1::text`,
      [`${written} — corrected`],
    );
    expect(stored.outcome, "the outcome was not corrected").toBe("No answer");

    const now = await counts(company.id, faisal);
    expect(now.entries, "correcting a report changed how many there are").toBe(after.entries);
    expect(now.lastActivity, "correcting a report moved the day").toBe(after.lastActivity);
  });

  await test.step("3 · he unfiles it, and every count that included it moves", async () => {
    const row = page.locator('[data-slot="report-entry"]').filter({ hasText: written }).first();
    await row.getByRole("button", { name: t("drawer.unfile") }).click();

    const confirm = page.getByRole("dialog", { name: t("drawer.unfileTitle") });
    await expect(confirm).toBeVisible(COLD);
    await confirm.getByRole("button", { name: t("drawer.unfile") }).click();

    await expect(confirm).toBeHidden(COLD);
    await expect(drawer.getByText(`${written} — corrected`)).toBeHidden(COLD);

    const now = await counts(company.id, faisal);
    expect(now.entries, "the unfiled report is still counted").toBe(after.entries - 1);
    // The row is still there. Nothing is deleted (S16) — it is off the floor.
    const kept = await query(`select 1 from activities where text like $1::text`, [`${written}%`]);
    expect(kept.length, "the row was deleted rather than unfiled").toBe(1);
  });
});

/**
 * A report is corrected where it is read (S24-S27, D70, P13).
 *
 * The rep who notices that a report went against the wrong words is the one
 * reading his own Reports at six o'clock. The correction there is the same one
 * the customer's drawer offers, on the same report, filed against the customer
 * the REPORT names rather than the one the screen happens to be about.
 */
test("he fixes the wrong word where he reads it, and the customer's history has it too", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<{ id: string; name: string }>(
    `select companies.id, companies.name
       from companies
      where companies.rep_id = $1::uuid and companies.archived_at is null
      order by companies.name
      limit 1`,
    [faisal],
  );

  const written = `Report correction ${Date.now()}`;
  let entryId: string | null = null;

  try {
    await login(page, locale, "faisal");

    await test.step("he reports it against a customer, from that customer", async () => {
      await page.goto(`/${locale}/companies?open=${company.id}`);
      const drawer = page.getByRole("dialog").first();
      await expect(drawer).toBeVisible(COLD);
      await drawer.getByRole("button", { name: t("common.addReport"), exact: true }).first().click();
      await writeReport(reportDialog(page, t), t, locale, { kind: "call", text: written });
      await expect(drawer.getByText(written)).toBeVisible(COLD);
    });

    const row = await one<{ id: string }>(
      `select id from activities where text = $1::text`,
      [written],
    );
    entryId = row.id;

    const entryOnReports = () =>
      page
        .getByRole("region", { name: t("reports.written") })
        .locator('[data-slot="report-entry"]')
        .filter({ hasText: written })
        .first();

    await test.step("it is on his own Reports, naming its customer", async () => {
      await page.goto(`/${locale}/reports`);
      await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);
      await expect(entryOnReports()).toBeVisible(COLD);
      await expect(entryOnReports().locator('[data-slot="trail-company"]')).toHaveText(company.name);
    });

    await test.step("he corrects the words without leaving the screen", async () => {
      await entryOnReports().getByRole("button", { name: t("drawer.correct") }).click();
      const dialog = page.getByRole("dialog", { name: t("reports.dialog.correctTitle") });
      await expect(dialog).toBeVisible(COLD);
      await dialog.getByLabel(t("reports.dialog.text")).fill(`${written} — fixed`);
      await dialog.getByRole("button", { name: t("common.save") }).click();
      await expect(dialog).toBeHidden(COLD);
      await expect(page.getByText(`${written} — fixed`)).toBeVisible(COLD);
      await expect(page).toHaveURL(new RegExp(`/${locale}/reports`));
    });

    await test.step("and the customer's own history says the same thing", async () => {
      // One record, two screens. The correction was filed against the customer
      // the REPORT names, which is the whole reason it carries its own id.
      const stored = await one<{ text: string; company_id: string }>(
        `select text, company_id from activities where id = $1::uuid`,
        [entryId!],
      );
      expect(stored.text).toBe(`${written} — fixed`);
      expect(stored.company_id).toBe(company.id);

      await page.goto(`/${locale}/companies?open=${company.id}`);
      const drawer = page.getByRole("dialog").first();
      await expect(drawer.getByText(`${written} — fixed`)).toBeVisible(COLD);
    });
  } finally {
    // Both locale projects read one seeded database, and every figure this
    // report touches is somebody else's assertion (playwright.config.ts).
    if (entryId) await query(`delete from activities where id = $1::uuid`, [entryId]);
    else await query(`delete from activities where text like $1::text`, [`${written}%`]);
  }
});

/** The figures the reports feed that this company can be asked for. */
async function counts(companyId: string, userId: string) {
  const row = await one<{ entries: number; last_activity: string | null; logged: number }>(
    `select (select count(*)::int from activities
              where company_id = $1::uuid and archived_at is null) as entries,
            (select max(happened_on)::text from activities
              where company_id = $1::uuid and archived_at is null) as last_activity,
            (select count(*)::int from activities
              where user_id = $2::uuid and archived_at is null
                and happened_on = (now() at time zone 'Asia/Riyadh')::date) as logged`,
    [companyId, userId],
  );
  return { entries: row.entries, lastActivity: row.last_activity, logged: row.logged };
}

/**
 * Reporting from the day screen (SPEC D71, 9A item 4; §3 P13).
 *
 * The day lists who to call and used to send him somewhere else to say what
 * happened: press the row, wait for the customer list, press Log, type. Two of
 * those steps were navigation, for one sentence about a call he has just
 * finished standing in a lobby. The assertion is the URL — he never left.
 */
test("a rep says what happened without leaving his day", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "faisal");
  await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);

  const band = page.getByRole("heading", { name: new RegExp(t("common.overdue")) });
  await expect(band, "nobody is overdue on the seeded floor").toBeVisible(COLD);

  // Inside the "who to call" section: the rail is a list of links too, and an
  // unscoped `li` locator finds a nav item first.
  const calls = page.locator("section").filter({ hasText: t("day.whoToCall") }).first();
  const row = calls.locator("li").first();
  const written = `From the day ${Date.now()}`;

  // The card's button is named for its customer ("Add a report on …") and says
  // Add report on its face — found by the words it shows.
  await row
    .locator('button[aria-haspopup="dialog"]')
    .filter({ hasText: t("common.addReport") })
    .click();
  const dialog = reportDialog(page, t);
  // Opened from the card, the customer is already chosen and not a question.
  await expect(dialog.getByRole("combobox", { name: t("common.company") })).toHaveCount(0);
  await writeReport(dialog, t, locale, { kind: "call", text: written });

  // Still on his day. That is the whole feature.
  await expect(page).toHaveURL(new RegExp(`/${locale}/day`));

  const kept = await query(
    `select 1 from activities where text = $1::text and archived_at is null`,
    [written],
  );
  expect(kept.length, "the report was not written").toBe(1);
});
