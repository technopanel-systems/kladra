import { addDays, todayRiyadh, type Day } from "@/lib/dates";
import { nothingWritten } from "@/lib/report-view";
import { isWeekend, isWorkingDay, type NonWorking } from "@/lib/workdays";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { choose, pressChip } from "./helpers/pick";
import { outcomeName, reportDialog, writeReport } from "./helpers/report";

/**
 * Reports (SPEC §3 P13, 13.8; D167, D171).
 *
 * A report is what a person wrote — one per thing that happened, against its
 * customer, with what kind of thing it was and what came of it — and the
 * system's own events sit beside it in a lane of their own. What is worth
 * holding here is the five sentences the design rests on:
 *
 *  - it is written in one popup, from anywhere, in the presses a phone allows;
 *  - opened from a record, the popup already knows the record;
 *  - a rep reads his own and nobody else's, and the manager reads everyone's
 *    and narrows them;
 *  - "nothing written today" is who owes one, and leave is not silence (D57);
 *  - what Kladra recorded is beside what he wrote, never among it.
 *
 * Both locale projects run against one seeded database (playwright.config.ts),
 * so every report written here is deleted again in a `finally`, and every
 * figure is asserted against the records at the moment it is read.
 */

const COLD = { timeout: 30_000 };
const PHONE = { width: 375, height: 812 };
const FAISAL = "faisal@technopanel.com.sa";
const SAAD = "saad@technopanel.com.sa";

/** The people who owe a report — the same three roles as `writesReports`. */
const REPORTERS = "users.active = true and users.role in ('rep', 'marketing', 'coordinator')";

test("a rep adds a report from the top bar on a phone: the company, its main contact, a call that reached him, one line", async ({
  page,
  locale,
  t,
}) => {
  test.slow();
  await page.setViewportSize(PHONE);

  const faisal = await userId(FAISAL);
  // One of his own customers, with a main contact he keeps himself — the one a
  // call card would have dialled.
  const company = await one<{ id: string; name: string; contact_id: string; contact: string }>(
    `select companies.id, companies.name, contacts.id as contact_id, contacts.name as contact
       from companies
       join contacts on contacts.company_id = companies.id
                    and contacts.rep_id = companies.rep_id
                    and contacts.is_main and contacts.archived_at is null
      where companies.rep_id = $1::uuid and companies.archived_at is null
      order by companies.name
      limit 1`,
    [faisal],
  );
  const today = todayRiyadh();
  const written = locale === "ar" ? `كلّمته، وصلت الأسعار ${Date.now()}` : `Rang him, prices arrived ${Date.now()}`;

  try {
    await login(page, locale, "faisal");

    await test.step("1 · the top bar's Add report opens the popup, as a bottom sheet", async () => {
      const add = page.locator('[data-slot="add-report"]');
      await expect(add).toHaveAccessibleName(t("common.addReport"), COLD);
      await add.click();
      await expect(reportDialog(page, t)).toBeVisible(COLD);
      await expect(page.locator('[data-slot="drawer-content"]')).toHaveCount(1);
    });

    await test.step("2 · the company, and its main contact is already chosen", async () => {
      const dialog = reportDialog(page, t);
      await choose(page, dialog.getByRole("combobox", { name: t("common.company") }), company.name);
      const contact = dialog.getByRole("combobox", { name: t("common.contact") });
      await expect(contact.locator('[data-slot="select-value"]')).toHaveText(company.contact, COLD);
    });

    await test.step("3 · Call, Reached, one line, and Enter sends it", async () => {
      const dialog = reportDialog(page, t);
      await pressChip(dialog, t("common.call"));
      await pressChip(dialog, await outcomeName(locale, "Reached"));
      const box = dialog.getByLabel(t("reports.dialog.text"));
      await box.fill(written);
      await box.press("Enter");
      await expect(dialog).toBeHidden(COLD);
      await expect(page.getByText(t("reports.dialog.added"), { exact: true })).toBeVisible(COLD);
    });

    await test.step("4 · it is written as he said it, and audited in the same breath", async () => {
      const stored = await one<{
        id: string;
        channel: string;
        outcome: string;
        company_id: string;
        contact_id: string | null;
        day: Day;
      }>(
        `select activities.id, activities.channel::text as channel, outcomes.name_en as outcome,
                activities.company_id, activities.contact_id,
                to_char(activities.happened_on, 'YYYY-MM-DD') as day
           from activities
           join outcomes on outcomes.id = activities.outcome_id
          where activities.text = $1::text`,
        [written],
      );
      expect(stored).toMatchObject({
        channel: "call",
        outcome: "Reached",
        company_id: company.id,
        contact_id: company.contact_id,
        day: today,
      });
      const audit = await query(
        `select 1 from audit_log
          where audit_log.record_type = 'activity' and audit_log.action = 'activity.create'
            and audit_log.record_id = $1::text`,
        [stored.id],
      );
      expect(audit.length, "the report was not audited").toBe(1);
    });

    await test.step("5 · and it is on his Reports, under today", async () => {
      await page.goto(`/${locale}/reports`);
      await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);
      const day = page.locator(`[data-slot="report-day"][data-day="${today}"]`);
      const entry = day.locator('[data-slot="report-entry"]').filter({ hasText: written });
      await expect(entry).toHaveCount(1, COLD);
      await expect(entry.locator('[data-slot="trail-company"]')).toHaveText(company.name);
      await expect(entry.getByText(t("common.call"), { exact: true })).toBeVisible();
    });
  } finally {
    await query("delete from activities where text = $1::text", [written]);
  }
});

test("opened from a project drawer, the report arrives with the company and the job already chosen", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId(FAISAL);
  const project = await one<{ id: string; name: string; company_id: string; company: string }>(
    `select projects.id, projects.name, companies.id as company_id, companies.name as company
       from projects
       join companies on companies.id = projects.company_id
      where companies.rep_id = $1::uuid and companies.archived_at is null
        and projects.archived_at is null and projects.lost_at is null
      order by projects.name
      limit 1`,
    [faisal],
  );
  const written = `From the job ${Date.now()}`;

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/projects?open=${project.id}`);
    const sheet = page.getByRole("dialog", { name: project.name });
    await expect(sheet).toBeVisible(COLD);

    await sheet.getByRole("button", { name: t("common.addReport"), exact: true }).first().click();
    const dialog = reportDialog(page, t);
    await expect(dialog).toBeVisible(COLD);

    await test.step("the customer is not a question, and the job is already the job", async () => {
      await expect(dialog.getByRole("combobox", { name: t("common.company") })).toHaveCount(0);
      await expect(dialog.getByText(project.company, { exact: true }).first()).toBeVisible();
      const job = dialog.getByRole("combobox", { name: t("common.project") });
      await expect(job.locator('[data-slot="select-value"]')).toContainText(project.name, COLD);
    });

    await test.step("and what he sends is filed against both", async () => {
      await writeReport(dialog, t, locale, { kind: "siteVisit", outcome: "Meeting set", text: written });
      const stored = await one<{ company_id: string; project_id: string | null; channel: string }>(
        `select company_id, project_id, channel::text as channel from activities where text = $1::text`,
        [written],
      );
      expect(stored).toEqual({
        company_id: project.company_id,
        project_id: project.id,
        channel: "siteVisit",
      });
    });
  } finally {
    await query("delete from activities where text = $1::text", [written]);
  }
});

type Entry = { user_id: string; day: Day; text: string; outcome: string };

/**
 * The newest report this person wrote before today, with what came of it.
 * Before today, because today is the day every other spec writes on — and
 * deletes again — so a row read from it can be gone by the time it is looked for.
 */
async function newestEntry(email: string): Promise<Entry> {
  return one<Entry>(
    `select activities.user_id, to_char(activities.happened_on, 'YYYY-MM-DD') as day,
            activities.text, outcomes.name_en as outcome
       from activities
       join users on users.id = activities.user_id
       join outcomes on outcomes.id = activities.outcome_id
      where users.email = $1::text and activities.archived_at is null
        and activities.happened_on < $2::date
      order by activities.happened_on desc, activities.created_at desc
      limit 1`,
    [email, todayRiyadh()],
  );
}

/** Every report this person wrote on a day, optionally only one outcome's. */
async function textsOn(userIdValue: string, day: Day, outcome?: string): Promise<string[]> {
  const rows = await query<{ text: string }>(
    `select activities.text
       from activities
       join outcomes on outcomes.id = activities.outcome_id
      where activities.user_id = $1::uuid and activities.happened_on = $2::date
        and activities.archived_at is null
        and ($3::text is null or outcomes.name_en = $3::text)`,
    [userIdValue, day, outcome ?? null],
  );
  return rows.map((row) => row.text);
}

test("a rep reads only his own reports; the manager reads everyone's and narrows them by person and outcome", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const his = await newestEntry(FAISAL);
  const theirs = await newestEntry(SAAD);
  const entries = page.locator('[data-slot="report-entry"]');

  await test.step("Faisal on Saad's day, with Saad's id in the address: none of Saad's", async () => {
    await login(page, locale, "faisal");
    // The person in the address is the manager's to choose. A rep who edits it
    // reads his own day, not a colleague's.
    await page.goto(`/${locale}/reports?day=${theirs.day}&person=${theirs.user_id}`);
    await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);
    await expect(page.getByText(theirs.text)).toHaveCount(0);
    await expect(entries).toHaveCount((await textsOn(his.user_id, theirs.day)).length, COLD);
    await expect(page.getByRole("combobox", { name: t("reports.person") })).toHaveCount(0);
  });

  await test.step("and his own day reads as he wrote it", async () => {
    await page.goto(`/${locale}/reports?day=${his.day}`);
    await expect(entries.filter({ hasText: his.text })).toHaveCount(1, COLD);
  });

  const people = await one<{ n: string }>(
    `select count(*)::text as n from users where ${REPORTERS}`,
  );

  await test.step("the manager's day is everybody's, a person to a section", async () => {
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/reports?day=${theirs.day}`);
    await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);
    await expect(page.locator('[data-slot="team-person"]')).toHaveCount(Number(people.n), COLD);
    await expect(entries.filter({ hasText: theirs.text })).toHaveCount(1);
  });

  const saadName = await personName(SAAD, locale);

  await test.step("he narrows it to Saad, and the address says so", async () => {
    await choose(page, page.getByRole("combobox", { name: t("reports.person") }), saadName);
    await expect(page).toHaveURL(new RegExp(`person=${theirs.user_id}`), COLD);
    await expect(page.locator('[data-slot="report-person"]')).toHaveText(saadName, COLD);

    await page.goto(`/${locale}/reports?person=${theirs.user_id}&day=${theirs.day}`);
    const saads = await textsOn(theirs.user_id, theirs.day);
    await expect(entries).toHaveCount(saads.length, COLD);
    await expect(entries.filter({ hasText: theirs.text })).toHaveCount(1);
  });

  await test.step("and to one outcome, and every report left says it", async () => {
    const outcome = await outcomeName(locale, theirs.outcome);
    await page
      .getByRole("group", { name: t("reports.dialog.outcome") })
      .getByRole("link", { name: outcome })
      .click();
    await expect(page).toHaveURL(/[?&]outcome=\d+/, COLD);
    const matching = await textsOn(theirs.user_id, theirs.day, theirs.outcome);
    await expect(entries).toHaveCount(matching.length, COLD);
    for (const badge of await page.locator('[data-slot="report-outcome"]').all()) {
      await expect(badge).toContainText(outcome);
    }
  });
});

/**
 * Who owes a report, on days chosen for what they are (D57). Pure: the screen
 * and this ask the same function, and a Sunday, a Friday, a holiday and a
 * person's leave are four answers a calendar cannot be relied on to give on the
 * day the suite runs.
 */
test("nothing written names who owes a report: not who wrote, not who is on leave, nobody on a day off", () => {
  const sunday = "2026-09-13";
  const friday = "2026-09-11";
  expect(isWeekend(sunday)).toBe(false);
  expect(isWeekend(friday)).toBe(true);

  const people = [{ id: "faisal" }, { id: "saad" }, { id: "turki" }, { id: "rawan" }];
  const wrote = new Set(["faisal"]);
  const leave: NonWorking[] = [{ day: sunday, userId: "saad" }];

  expect(nothingWritten(people, wrote, leave, sunday).map((p) => p.id)).toEqual(["turki", "rawan"]);
  // Leave on another day is no excuse today.
  expect(
    nothingWritten(people, wrote, [{ day: addDays(sunday, 1), userId: "saad" }], sunday).map(
      (p) => p.id,
    ),
  ).toEqual(["saad", "turki", "rawan"]);
  // A weekend and a company holiday are nobody's.
  expect(nothingWritten(people, new Set(), [], friday)).toEqual([]);
  expect(nothingWritten(people, new Set(), [{ day: sunday, userId: null }], sunday)).toEqual([]);
});

test("the manager's 'nothing written today' names a person with no report and not a person on leave", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const today = todayRiyadh();
  const off = await query<{ day: Day; user_id: string | null }>(
    `select to_char(non_working_days.day, 'YYYY-MM-DD') as day, non_working_days.user_id
       from non_working_days
      where non_working_days.day = $1::date`,
    [today],
  );
  const nonWorking: NonWorking[] = off.map((row) => ({ day: row.day, userId: row.user_id }));
  const people = await query<{ id: string; email: string }>(
    `select users.id, users.email from users where ${REPORTERS} order by users.email`,
  );
  const wroteRows = await query<{ user_id: string }>(
    `select distinct activities.user_id from activities
      where activities.happened_on = $1::date and activities.archived_at is null`,
    [today],
  );
  const silent = nothingWritten(people, new Set(wroteRows.map((row) => row.user_id)), nonWorking, today);
  const onLeave = people.filter((person) =>
    nonWorking.some((row) => row.userId === person.id),
  );

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/reports`);
  const section = page.getByRole("region", { name: t("reports.nothingYetTitle") });
  await expect(section).toBeVisible(COLD);
  const named = section.locator('[data-slot="silent-person"]');

  if (!isWorkingDay(today, nonWorking)) {
    await test.step("a day nobody works owes nothing from anybody", async () => {
      await expect(section.getByText(t("reports.notWorkingToday"))).toBeVisible();
      await expect(named).toHaveCount(0);
    });
    return;
  }

  await test.step("everyone who owes one and has not written is named, and a door to their day", async () => {
    // The day is not over: the sentence says "yet", not "missed" (D57).
    await expect(section.getByText(t("reports.nothingYetMeans"))).toBeVisible();
    expect(silent.length, "the seed has nobody who has not written today").toBeGreaterThan(0);
    await expect(named).toHaveCount(silent.length);
    for (const person of silent) {
      const name = await personName(person.email, locale);
      const link = named.filter({ hasText: name });
      await expect(link).toHaveCount(1);
      await expect(link).toHaveAttribute("href", new RegExp(`person=${person.id}`));
    }
  });

  await test.step("and a person on leave is not somebody who wrote nothing", async () => {
    expect(onLeave.length, "the seed has nobody on leave today (D75)").toBeGreaterThan(0);
    for (const person of onLeave) {
      const name = await personName(person.email, locale);
      await expect(named.filter({ hasText: name })).toHaveCount(0);
    }
  });
});

test("what Kladra recorded is its own region beside the written reports, never among them", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const his = await newestEntry(FAISAL);
  const raised = await one<{ n: string }>(
    `select count(*)::text as n
       from quotations
      where quotations.rep_id = $1::uuid
        and (quotations.created_at at time zone 'Asia/Riyadh')::date = $2::date`,
    [his.user_id, his.day],
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/reports?day=${his.day}`);
  await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);

  const day = page.locator(`[data-slot="report-day"][data-day="${his.day}"]`);
  const written = day.getByRole("region", { name: t("reports.written") });
  const lane = day.getByRole("complementary", { name: t("reports.recorded") });

  await test.step("two landmarks, each with its own name", async () => {
    await expect(written).toHaveCount(1, COLD);
    await expect(lane).toHaveCount(1);
    await expect(written.getByText(his.text)).toBeVisible();
  });

  await test.step("and neither holds the other", async () => {
    await expect(written.getByRole("complementary")).toHaveCount(0);
    await expect(lane.locator('[data-slot="report-entry"]')).toHaveCount(0);
    await expect(lane.getByText(his.text)).toHaveCount(0);
  });

  await test.step("the lane is read out of the records, not typed", async () => {
    const figure = lane.locator('[data-figure="quotationRequests"]');
    if (Number(raised.n) === 0) {
      await expect(figure).toHaveCount(0);
    } else {
      await expect(figure.locator(".num")).toHaveText(raised.n);
    }
  });
});
