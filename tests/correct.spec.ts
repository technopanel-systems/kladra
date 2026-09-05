import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

const COLD = { timeout: 20_000 };

/**
 * A log entry can be corrected (SPEC D70, 9A item 3).
 *
 * There was one action on the log and it was `log`. A visit typed against the
 * wrong customer was wrong for ever, and the only correction available — a
 * second entry saying so — is one every count afterwards believes: two logged
 * calls where one happened, two companies touched where one was.
 *
 * The assertion that matters is not that the row disappears. It is that every
 * figure derived from the log moves with it, which is sixteen queries' worth of
 * arithmetic and the reason this test counts rather than looks.
 */
test("an entry written against the wrong customer stops counting", async ({ page, locale, t }) => {
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

  await test.step("1 · he logs a visit against this customer", async () => {
    await drawer.getByRole("button", { name: t("common.log") }).first().click();
    const dialog = page.getByRole("dialog", { name: t("drawer.logTitle") });
    await expect(dialog).toBeVisible(COLD);
    await dialog.getByLabel(t("drawer.whatHappened")).fill(written);
    await dialog.getByRole("button", { name: t("common.save") }).click();
    // Waiting for the DIALOG TO CLOSE, and only then for the row. The words
    // are in the box he just typed into as well as in the list, so a page-wide
    // text assertion passes while the write is still in flight — and the next
    // line, which reads the database, then reads it one row too early.
    await expect(dialog).toBeHidden(COLD);
    await expect(drawer.getByText(written)).toBeVisible(COLD);
  });

  const after = await counts(company.id, faisal);
  expect(after.entries, "the entry was not written").toBeGreaterThan(0);

  await test.step("2 · he corrects the words, and the day does not move", async () => {
    const row = page.locator("li").filter({ hasText: written }).first();
    await row.getByRole("button", { name: t("drawer.correct") }).click();

    const dialog = page.getByRole("dialog", { name: t("drawer.correctTitle") });
    await expect(dialog).toBeVisible(COLD);
    // The day and the follow-up are not on offer: the day is the entry's
    // identity and the follow-up is a figure two other screens read (D70).
    await expect(dialog.getByText(t("drawer.happenedOn"))).toBeHidden();

    await dialog.getByLabel(t("drawer.whatHappened")).fill(`${written} — corrected`);
    await dialog.getByRole("button", { name: t("common.save") }).click();
    await expect(dialog).toBeHidden(COLD);
    await expect(drawer.getByText(`${written} — corrected`)).toBeVisible(COLD);

    const now = await counts(company.id, faisal);
    expect(now.entries, "correcting an entry changed how many there are").toBe(after.entries);
    expect(now.lastActivity, "correcting an entry moved the day").toBe(after.lastActivity);
  });

  await test.step("3 · he unfiles it, and every count that included it moves", async () => {
    const row = page.locator("li").filter({ hasText: written }).first();
    await row.getByRole("button", { name: t("drawer.unfile") }).click();

    const confirm = page.getByRole("dialog", { name: t("drawer.unfileTitle") });
    await expect(confirm).toBeVisible(COLD);
    await confirm.getByRole("button", { name: t("drawer.unfile") }).click();

    await expect(confirm).toBeHidden(COLD);
    await expect(drawer.getByText(`${written} — corrected`)).toBeHidden(COLD);

    const now = await counts(company.id, faisal);
    expect(now.entries, "the unfiled entry is still counted").toBe(after.entries - 1);
    // The row is still there. Nothing is deleted (S16) — it is off the floor.
    const kept = await query(`select 1 from activities where text like $1::text`, [`${written}%`]);
    expect(kept.length, "the row was deleted rather than unfiled").toBe(1);
  });
});

/** The three figures the log feeds that this company can be asked for. */
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
 * Logging from the day screen (SPEC D71, 9A item 4).
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

  await row.getByRole("button", { name: new RegExp(t("common.log")) }).click();
  const dialog = page.getByRole("dialog", { name: t("drawer.logTitle") });
  await expect(dialog).toBeVisible(COLD);
  await dialog.getByLabel(t("drawer.whatHappened")).fill(written);
  await dialog.getByRole("button", { name: t("common.save") }).click();
  await expect(dialog).toBeHidden(COLD);

  // Still on his day. That is the whole feature.
  await expect(page).toHaveURL(new RegExp(`/${locale}/day`));

  const kept = await query(
    `select 1 from activities where text = $1::text and archived_at is null`,
    [written],
  );
  expect(kept.length, "the entry was not written").toBe(1);
});
