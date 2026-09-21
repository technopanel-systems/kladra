import type { Locator, Page } from "@playwright/test";
import { addDays, todayRiyadh } from "@/lib/dates";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { pressChip } from "./helpers/pick";
import { outcomeName, reportDialog } from "./helpers/report";

/**
 * A logged call clears the reminder (SPEC S52, S50, D9, D94).
 *
 * The rep's whole day turns on one loop: /day says who is owed a call, he rings
 * them, he writes what happened, and the card goes. It did not go. A report
 * moved the follow-up date only when the rep also picked a NEW date, so the
 * ordinary report — the call that reached nobody, the visit that went fine —
 * left yesterday's date where it was and the card red after the work was done.
 * S52 is the rule it broke: a reminder is cleared by doing the work, never by
 * dismissing it, and "doing the work" here is writing the report.
 *
 * So the question moved above the words and became required wherever something
 * is owed: a day, or "No next step". The three quick answers beside the picker
 * are working days (S47, S48) — the chip carries its word and the picker then
 * carries the date.
 *
 * And the second half of the same defect: the date on a card can belong to a
 * PROJECT rather than to the customer (D9), so the card names the job and its
 * report opens on the job — otherwise the report clears the company's date and
 * the card, coloured by the job's, stays exactly as red as it was (D94).
 *
 * House style follows tests/calls.spec.ts: both locale projects run against ONE
 * seeded database (playwright.config.ts: `workers: 1`, one `globalSetup`
 * reseed), so every date this file moves is put back in a `finally` and every
 * report it writes is deleted again.
 */

const COLD = { timeout: 30_000 };
const FAISAL = "faisal@technopanel.com.sa";

/** One band card on /day, by the filter it carries (call-band.tsx). */
function band(page: Page, filter: string): Locator {
  return page.locator(`[data-band="${filter}"]`);
}

/**
 * The figure beside a band's name. It is the whole band and not the cards drawn
 * under it (D80), which is the number that has to fall when a card goes.
 */
async function bandCount(section: Locator): Promise<number> {
  const figure = section.getByRole("heading").locator('span[dir="ltr"]').first();
  return Number((await figure.innerText()).trim());
}

type LateCompany = { id: string; name: string; next_follow_up: string | null };

/**
 * Two of Faisal's customers to make late.
 *
 * Two conditions that are not about being late. **No open job with a date of
 * its own on or before today**, so the only thing that can put these cards on
 * the band is the company's own date and clearing that date is the whole of
 * what the walk changes; a job's date is the other test's subject. And **not a
 * lead he has yet to acknowledge**, because such a company waits in the band
 * above his list and is in none of these (D185).
 */
async function twoToMakeLate(repId: string, today: string): Promise<LateCompany[]> {
  return query<LateCompany>(
    `select c.id, c.name, c.next_follow_up::text as next_follow_up
       from companies c
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and not (c.lead_from_id is not null and c.lead_acknowledged_at is null)
        and not exists (
          select 1 from projects p
           where p.company_id = c.id
             and p.archived_at is null
             and p.lost_at is null
             and p.next_follow_up is not null
             and p.next_follow_up <= $2::date
        )
      order by c.name
      limit 2`,
    [repId, today],
  );
}

test("a report clears the reminder it was written for", async ({ page, locale, t }) => {
  test.slow();

  const faisal = await userId(FAISAL);
  const today = todayRiyadh();
  const pair = await twoToMakeLate(faisal, today);
  expect(pair.length, "two of Faisal's customers with no job date of their own").toBe(2);
  const [first, second] = pair;

  // Older than anything the seed writes, so these two are the first cards in a
  // band that is now ordered by what is owed rather than by what was touched
  // last — and the walk finds them however long Faisal's overdue band is (D80).
  await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
    first.id,
    addDays(today, -500),
  ]);
  await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
    second.id,
    addDays(today, -499),
  ]);

  const marker = `follow-up walk ${locale} ${Date.now()}`;

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

    const overdue = band(page, "overdue");
    await expect(overdue).toBeVisible();
    const before = await bandCount(overdue);

    await test.step("Send with nothing said about the next call is refused, on the question itself", async () => {
      const card = overdue.getByRole("listitem").filter({ hasText: first.name });
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: t("reports.addFor", { name: first.name }) }).click();

      const dialog = reportDialog(page, t);
      await expect(dialog).toBeVisible(COLD);

      // A card in a band of calls opens on Call: the kind is the one answer
      // this screen already has, and he may still change it.
      await expect(dialog.getByRole("radio", { name: t("common.call"), exact: true })).toBeChecked();
      await pressChip(dialog, await outcomeName(locale, "Reached"));

      // The group's own name is the question with nothing after it. Where the
      // follow-up is optional the word "Optional" is part of that name, so an
      // exact match here is the assertion that it is required.
      const followUp = dialog.getByRole("group", {
        name: t("common.nextFollowUp"),
        exact: true,
      });
      await expect(followUp).toBeVisible();

      await dialog.getByRole("button", { name: t("common.save") }).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(t("reports.refused.followUpOwed"))).toBeVisible();
      // The caret goes to the refused box, and the refused box is above the
      // words rather than under the key that sends them.
      await expect(followUp.locator('[data-picker="date"]')).toBeFocused();

      const noNextStep = followUp.getByRole("button", {
        name: t("reports.dialog.noNextStep"),
        exact: true,
      });
      await noNextStep.click();
      await expect(noNextStep).toHaveAttribute("aria-pressed", "true");

      await dialog.getByLabel(t("reports.dialog.text")).fill(`${marker} one`);
      await dialog.getByRole("button", { name: t("common.save") }).click();
      await expect(dialog).toBeHidden(COLD);
    });

    await test.step("the card is gone from Overdue and the band's count fell by one", async () => {
      await page.goto(`/${locale}/day`);
      await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

      const after = band(page, "overdue");
      await expect(after.getByRole("listitem").filter({ hasText: first.name })).toHaveCount(0);
      expect(await bandCount(after)).toBe(before - 1);

      const row = await one<{ next_follow_up: string | null }>(
        `select next_follow_up::text as next_follow_up from companies where id = $1::uuid`,
        [first.id],
      );
      expect(row.next_follow_up, "no next step leaves no date behind").toBeNull();

      // Nothing is left in the column to say the date went on purpose, so the
      // audit line is the only record that it was a decision (S52).
      const entry = await one<{ id: string }>(
        `select id from activities where text = $1::text`,
        [`${marker} one`],
      );
      const audit = await one<{ cleared: string | null }>(
        `select details->>'clearedFollowUp' as cleared
           from audit_log
          where record_id = $1::text and action = 'activity.create'`,
        [entry.id],
      );
      expect(audit.cleared).toBe("true");
    });

    await test.step("the other card: Tomorrow, and it leaves the band too", async () => {
      const overdueNow = band(page, "overdue");
      const card = overdueNow.getByRole("listitem").filter({ hasText: second.name });
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: t("reports.addFor", { name: second.name }) }).click();

      const dialog = reportDialog(page, t);
      await expect(dialog).toBeVisible(COLD);
      await pressChip(dialog, await outcomeName(locale, "Reached"));

      const followUp = dialog.getByRole("group", {
        name: t("common.nextFollowUp"),
        exact: true,
      });
      const tomorrow = followUp.getByRole("button", {
        name: t("reports.dialog.tomorrow"),
        exact: true,
      });
      await tomorrow.click();
      await expect(tomorrow).toHaveAttribute("aria-pressed", "true");
      // The chip carries the word and the picker beside it carries the day, so
      // the answer is on screen as a date before it is sent.
      await expect(followUp.locator('[data-picker="date"]')).not.toContainText(
        t("common.pickDate"),
      );

      await dialog.getByLabel(t("reports.dialog.text")).fill(`${marker} two`);
      await dialog.getByRole("button", { name: t("common.save") }).click();
      await expect(dialog).toBeHidden(COLD);

      await page.goto(`/${locale}/day`);
      await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);
      await expect(
        band(page, "overdue").getByRole("listitem").filter({ hasText: second.name }),
      ).toHaveCount(0);

      const row = await one<{ next_follow_up: string | null }>(
        `select next_follow_up::text as next_follow_up from companies where id = $1::uuid`,
        [second.id],
      );
      const moved = row.next_follow_up;
      expect(moved, "Tomorrow set a date").not.toBeNull();
      // A working day on or after tomorrow — which is at least tomorrow, and
      // more than that across a weekend, a holiday or his own leave (S47, S48).
      expect(moved !== null && moved > today).toBe(true);
    });
  } finally {
    for (const company of pair) {
      await query(`update companies set next_follow_up = $2 where id = $1::uuid`, [
        company.id,
        company.next_follow_up,
      ]);
    }
    await query(`delete from activities where text like $1::text || '%'`, [marker]);
  }
});

type JobCard = {
  company_id: string;
  company_name: string;
  company_day: string | null;
  project_id: string;
  project_name: string;
  project_day: string | null;
};

/**
 * One customer of Faisal's with exactly one open job, and that job his to work.
 *
 * Exactly one, because the card names the job the effective date belongs to and
 * a second job with a date of its own would be a second candidate for it — a
 * fixture that cannot say which answer is right proves nothing about the one
 * the screen gives.
 */
async function oneWithOneJob(repId: string): Promise<JobCard> {
  return one<JobCard>(
    `select c.id as company_id, c.name as company_name,
            c.next_follow_up::text as company_day,
            p.id as project_id, p.name as project_name,
            p.next_follow_up::text as project_day
       from companies c
       join projects p on p.company_id = c.id and p.archived_at is null and p.lost_at is null
      where c.rep_id = $1::uuid
        and p.rep_id = $1::uuid
        and c.archived_at is null
        and not (c.lead_from_id is not null and c.lead_acknowledged_at is null)
        and (
          select count(*) from projects x
           where x.company_id = c.id and x.archived_at is null and x.lost_at is null
        ) = 1
      order by c.name
      limit 1`,
    [repId],
  );
}

test("a card late on a job's date names the job, and its report opens on the job", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId(FAISAL);
  const today = todayRiyadh();
  const found = await oneWithOneJob(faisal);

  // The customer's own date well ahead and the job's long past: the card is on
  // Overdue because of the job, which is exactly the case that used to show a
  // red date with no way of telling whose it was (D9, D94).
  await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
    found.company_id,
    addDays(today, 30),
  ]);
  await query(`update projects set next_follow_up = $2::date where id = $1::uuid`, [
    found.project_id,
    addDays(today, -501),
  ]);

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);

    const card = band(page, "overdue")
      .getByRole("listitem")
      .filter({ hasText: found.company_name });
    await expect(card).toBeVisible();
    // The sentence a screen reader gets where a sighted reader gets the name
    // beside the date; `toHaveCount` rather than `toBeVisible`, because the
    // element carrying it is read and not drawn.
    await expect(card.getByText(t("reports.dueFor", { name: found.project_name }))).toHaveCount(1);

    await card
      .getByRole("button", { name: t("reports.addFor", { name: found.company_name }) })
      .click();

    const dialog = reportDialog(page, t);
    await expect(dialog).toBeVisible(COLD);
    const project = dialog.getByRole("combobox", { name: t("common.project") });
    await expect(project.locator('[data-slot="select-value"]')).toHaveText(found.project_name);

    // Cancel — nothing is typed, so there is nothing to undo.
    await dialog.getByRole("button", { name: t("common.cancel") }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await query(`update companies set next_follow_up = $2 where id = $1::uuid`, [
      found.company_id,
      found.company_day,
    ]);
    await query(`update projects set next_follow_up = $2 where id = $1::uuid`, [
      found.project_id,
      found.project_day,
    ]);
  }
});
