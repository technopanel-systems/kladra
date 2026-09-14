import { CHANNELS } from "@/db/schema";
import { addDays, firstOfMonth, formatMonth, todayRiyadh, type Day } from "@/lib/dates";
import { quotationLabel } from "@/lib/labels";
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

    await test.step("sent with nothing chosen, the caret lands on a chip of the question refused", async () => {
      // The refused thing is a row of chips, and the row itself is focusable by
      // script and outlined by nothing: the caret goes to a chip, where it shows
      // and where the arrow keys answer the question (P13 review).
      await dialog.getByRole("button", { name: t("common.save") }).click();
      const kinds = dialog.getByRole("radiogroup", { name: t("reports.dialog.kind") });
      await expect(kinds).toHaveAttribute("aria-invalid", "true");
      await expect(kinds.getByRole("radio").first()).toBeFocused();

      await pressChip(dialog, t("common.siteVisit"));
      await dialog.getByRole("button", { name: t("common.save") }).click();
      const outcomes = dialog.getByRole("radiogroup", { name: t("reports.dialog.outcome") });
      await expect(outcomes).toHaveAttribute("aria-invalid", "true");
      await expect(outcomes.getByRole("radio").first()).toBeFocused();
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

/**
 * The two lists are capped (D80): a person's month draws the newest 80 entries
 * (REPORT_LIST_CAP, src/lib/reports.ts) and the team's day the newest 200
 * (reports/page.tsx). Written out here rather than imported, because that module
 * reads the database and the request.
 */
const PERSON_CAP = 80;
const TEAM_CAP = 200;

/**
 * A figure counted after the cap is a figure about the cap (rules/data.md, P13
 * review). The team's day grouped the 200 rows it drew, so on a busy day
 * somebody who wrote in the morning read as having written nothing; and a day's
 * heading counted the 80 rows the month drew while the calendar beside it
 * counted the day. Both are SQL counts over the whole window now, and where the
 * cap cut a day or a person short the screen says how many more.
 *
 * A busy day is written straight into the table — two hundred and ten entries of
 * Faisal's, the newest there are, and one of Saad's from earlier — and deleted
 * again after.
 */
test("counts are the day's, not the rows drawn: past the cap a person and a day say how many more", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const today = todayRiyadh();
  const marker = `cap ${locale} ${Date.now()}`;
  const faisal = await userId(FAISAL);
  const saad = await userId(SAAD);
  const outcome = await one<{ id: number }>("select id from outcomes where name_en = 'Reached'");
  const companyOf = (rep: string) =>
    one<{ id: string }>(
      `select companies.id from companies
        where companies.rep_id = $1::uuid and companies.archived_at is null
        order by companies.name limit 1`,
      [rep],
    );
  const countOn = async (person: string) =>
    Number(
      (
        await one<{ n: string }>(
          `select count(*)::text as n from activities
            where activities.user_id = $1::uuid and activities.happened_on = $2::date
              and activities.archived_at is null`,
          [person, today],
        )
      ).n,
    );

  try {
    await query(
      `insert into activities (company_id, user_id, text, channel, happened_on, outcome_id)
       select $1::uuid, $2::uuid, $3::text || ' ' || n, 'call', $4::date, $5::int
         from generate_series(1, 210) as n`,
      [(await companyOf(faisal)).id, faisal, marker, today, outcome.id],
    );
    await query(
      `insert into activities (company_id, user_id, text, channel, happened_on, outcome_id, created_at, updated_at)
       values ($1::uuid, $2::uuid, $3::text, 'visit', $4::date, $5::int,
               now() - interval '2 hours', now() - interval '2 hours')`,
      [(await companyOf(saad)).id, saad, `${marker} saad`, today, outcome.id],
    );
    const faisalCount = await countOn(faisal);
    const saadCount = await countOn(saad);

    await test.step("the manager's day: Saad wrote, and is not read as silent", async () => {
      await login(page, locale, "abdulrahman");
      // The day asked for by name: a week remembered for him would draw a table.
      await page.goto(`/${locale}/reports?period=day&day=${today}`);
      await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);
      const section = async (email: string) =>
        page
          .locator('[data-slot="team-person"]')
          .filter({ has: page.getByText(await personName(email, locale), { exact: true }) });

      // His two hundred and ten are the newest, so every row the day drew is his.
      const his = await section(FAISAL);
      await expect(his.locator('[data-slot="person-count"]')).toHaveText(
        t("reports.reportsCount", { count: faisalCount }),
        COLD,
      );
      await expect(his.locator('[data-slot="person-more"]')).toHaveText(
        t("reports.moreOnDay", { count: faisalCount - TEAM_CAP }),
      );

      // Saad's are all past the cap: counted, a door to them, and never "nothing".
      const theirs = await section(SAAD);
      await expect(theirs.locator('[data-slot="person-count"]')).toHaveText(
        t("reports.reportsCount", { count: saadCount }),
      );
      await expect(theirs.locator('[data-slot="person-more"]')).toHaveText(
        t("reports.moreOnDay", { count: saadCount }),
      );
      await expect(theirs.locator('[data-slot="person-more"]')).toHaveAttribute(
        "href",
        new RegExp(`person=${saad}`),
      );
      await expect(theirs.locator('[data-slot="person-state"]')).toHaveCount(0);
    });

    await test.step("his own month: today's heading is the day's figure, and the rest is a door", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/reports`);
      const day = page.locator(`[data-slot="report-day"][data-day="${today}"]`);
      await expect(day.locator('[data-slot="day-count"]')).toHaveText(
        t("reports.reportsCount", { count: faisalCount }),
        COLD,
      );
      // Today is his newest day, so all eighty drawn are today's.
      await expect(day.locator('[data-slot="report-entry"]')).toHaveCount(PERSON_CAP);
      const more = day.locator('[data-slot="day-more"]');
      await expect(more).toHaveText(t("reports.moreOnDay", { count: faisalCount - PERSON_CAP }));
      await expect(more).toHaveAttribute("href", new RegExp(`day=${today}`));
    });
  } finally {
    await query("delete from activities where text like $1::text || '%'", [marker]);
  }
});

/**
 * A drawer can open the popup on any paper of the customer's — a superseded
 * revision too — and the popup's quotation list leaves those out and stops at
 * the newest thirty. The field read blank while the report was filed against the
 * paper (P13 review). The paper the popup was opened on is always a choice, first.
 */
test("opened from a superseded quotation, the report's quotation field names that paper", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId(FAISAL);
  const paper = await one<{ id: string; number: number; revision: number }>(
    `select quotations.id, quotations.number, quotations.revision
       from quotations
       join companies on companies.id = quotations.company_id
       join projects on projects.id = quotations.project_id
      where companies.rep_id = $1::uuid and companies.archived_at is null
        and projects.archived_at is null and projects.lost_at is null
        and exists (select 1 from quotations later
                     where later.number = quotations.number and later.revision > quotations.revision)
      order by quotations.number, quotations.revision
      limit 1`,
    [faisal],
  );
  const label = quotationLabel(paper.number, paper.revision);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations?open=${paper.id}`);
  const sheet = page.getByRole("dialog", { name: label });
  await expect(sheet).toBeVisible(COLD);
  await sheet.getByRole("button", { name: t("common.addReport") }).first().click();

  const dialog = reportDialog(page, t);
  const field = dialog.getByRole("combobox", { name: t("common.quotation") });
  // Its own number, exactly — Q-3 and not the revision that replaced it, Q-3/2.
  await expect(field.locator('[data-slot="select-value"] [dir="ltr"]')).toHaveText(label, COLD);
});

/**
 * The manager's week at 1366 was 59px wider than its card in Arabic, so the
 * total column was cut off at the inline end while English fitted (P13 review;
 * DESIGN §5: a width that fits in English is a coincidence). The days are as wide
 * as the widest date either script prints; below that the table scrolls inside
 * its own card, and the page does not.
 *
 * Opening the week remembers it for him (D164), and every other walk of his
 * Reports expects his day, so what he had is put back.
 */
test("the manager's week fits its card at 1366 in either language, and scrolls inside it at 375", async ({
  page,
  locale,
  t,
}) => {
  const manager = await userId("abdulrahman@technopanel.com.sa");
  const choice = `select choice from screen_choices
                   where user_id = $1::uuid and kind = 'view' and screen = 'reports'`;
  const before = (await query<{ choice: string }>(choice, [manager]))[0]?.choice ?? null;
  let opened = false;

  try {
    await page.setViewportSize({ width: 1366, height: 900 });
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/reports?period=week`);
    opened = true;
    const table = page.locator('[data-slot="team-week"]');
    await expect(table).toBeVisible(COLD);
    await expect(table.getByRole("columnheader", { name: t("reports.total") })).toBeVisible();

    const fit = () =>
      table.evaluate((node) => ({
        table: node.scrollWidth,
        room: (node.parentElement as HTMLElement).clientWidth,
      }));
    const wide = await fit();
    expect(wide.table, "the week is wider than its card").toBeLessThanOrEqual(wide.room);
    const cut = await table
      .locator("thead th")
      .evaluateAll((nodes) =>
        nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent ?? ""),
      );
    expect(cut, "a column name is cut").toEqual([]);

    await page.setViewportSize({ width: 375, height: 812 });
    await expect.poll(async () => (await fit()).room).toBeLessThan(wide.room);
    const narrow = await fit();
    expect(narrow.table, "at 375 the week should scroll inside its card").toBeGreaterThan(narrow.room);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    if (opened) {
      // The write is an effect after hydration; wait for it before undoing it.
      await expect
        .poll(async () => (await query<{ choice: string }>(choice, [manager]))[0]?.choice, COLD)
        .toBe("week");
    }
    if (before === null) {
      await query(
        "delete from screen_choices where user_id = $1::uuid and kind = 'view' and screen = 'reports'",
        [manager],
      );
    } else {
      await query(
        "update screen_choices set choice = $2::text where user_id = $1::uuid and kind = 'view' and screen = 'reports'",
        [manager, before],
      );
    }
  }
});

/**
 * A figure Kladra recorded is a door (S12.8, D117): "1 quotation request" named a
 * paper and was plain text. It opens the list that holds it, narrowed as far as
 * that list's address can go, and says how far before it is pressed — that
 * day's list where the list can name the day, the whole list where it cannot.
 */
test("every figure in the recorded lane is a door to its list, and says how far that list narrows", async ({
  page,
  locale,
  t,
}) => {
  const raised = await one<{ user_id: string; day: Day }>(
    `select quotations.rep_id as user_id,
            to_char(max((quotations.created_at at time zone 'Asia/Riyadh')::date), 'YYYY-MM-DD') as day
       from quotations
       join users on users.id = quotations.rep_id
      where users.email = $1::text
      group by quotations.rep_id`,
    [FAISAL],
  );
  const loaded = await one<{ day: Day }>(
    `select to_char(max((dispatches.created_at at time zone 'Asia/Riyadh')::date), 'YYYY-MM-DD') as day
       from dispatches
       join users on users.id = dispatches.rep_id
      where users.email = $1::text`,
    [FAISAL],
  );
  const laneOn = (day: Day) =>
    page
      .locator(`[data-slot="report-day"][data-day="${day}"]`)
      .getByRole("complementary", { name: t("reports.recorded") });

  await login(page, locale, "faisal");

  await test.step("a dispatch request opens the whole dispatches list, and says so", async () => {
    await page.goto(`/${locale}/reports?day=${loaded.day}`);
    const door = laneOn(loaded.day).locator('[data-figure="dispatchRequests"]').getByRole("link");
    await expect(door).toHaveAttribute("href", new RegExp(`/${locale}/dispatches$`), COLD);
    await expect(door).toContainText(t("reports.opensWholeList"));
  });

  await test.step("a quotation request opens that day's quotations, counted for him, and the list says so", async () => {
    await page.goto(`/${locale}/reports?day=${raised.day}`);
    const door = laneOn(raised.day).locator('[data-figure="quotationRequests"]').getByRole("link");
    await expect(door).toHaveAttribute(
      "href",
      new RegExp(`/quotations\\?from=${raised.day}&to=${raised.day}&credited=${raised.user_id}$`),
      COLD,
    );
    await expect(door).toContainText(t("reports.opensThatDay"));
    await door.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/quotations\\?from=${raised.day}`), COLD);
    await expect(page.locator('[data-slot="narrowing"]')).toBeVisible(COLD);
  });
});

/**
 * The calendar's figure has its word, and a filter that hides a whole month says
 * how many it hides (S12.8; DESIGN §8: filtered out says how many are hidden and
 * how to show them). The month and the filter are read from the records: the
 * month of his newest report, and a kind and an outcome he wrote nothing under
 * in it.
 */
test("the calendar says what its figures count, and a filter that empties the month says how many it hides", async ({
  page,
  locale,
  t,
}) => {
  const his = await newestEntry(FAISAL);
  const month = firstOfMonth(his.day);
  const unmatched = await one<{ channel: string; outcome: number; total: string }>(
    `select kinds.channel, outcomes.id as outcome,
            (select count(*) from activities
              where activities.user_id = $1::uuid and activities.archived_at is null
                and activities.happened_on between $2::date
                    and ($2::date + interval '1 month' - interval '1 day')::date
            )::text as total
       from unnest($3::text[]) as kinds(channel)
       cross join outcomes
      where outcomes.active
        and not exists (
          select 1 from activities
           where activities.user_id = $1::uuid and activities.archived_at is null
             and activities.channel::text = kinds.channel and activities.outcome_id = outcomes.id
             and activities.happened_on between $2::date
                 and ($2::date + interval '1 month' - interval '1 day')::date
        )
      order by kinds.channel, outcomes.id
      limit 1`,
    [his.user_id, month, `{${CHANNELS.join(",")}}`],
  );

  await login(page, locale, "faisal");

  await test.step("unfiltered, the line under the calendar says the figure is the day's reports", async () => {
    await page.goto(`/${locale}/reports?month=${month.slice(0, 7)}`);
    await expect(page.locator('[data-slot="calendar-legend"]')).toHaveText(t("reports.calendarLegend"), COLD);
  });

  await test.step("filtered to nothing, the list says how many the filters hide and offers them back", async () => {
    await page.goto(
      `/${locale}/reports?month=${month.slice(0, 7)}&kind=${unmatched.channel}&outcome=${unmatched.outcome}`,
    );
    await expect(page.locator('[data-slot="calendar-legend"]')).toHaveText(
      t("reports.calendarLegendFiltered"),
      COLD,
    );
    const empty = page.locator('[data-slot="empty"]');
    await expect(empty).toContainText(
      t("reports.hiddenInMonth", { count: Number(unmatched.total), month: formatMonth(month, locale) }),
    );
    // Each row of chips is named by the question it answers.
    await expect(page.getByRole("group", { name: t("reports.dialog.kind") })).toBeVisible();
    await expect(page.getByRole("group", { name: t("reports.dialog.outcome") })).toBeVisible();

    await empty.getByRole("link", { name: t("reports.clearFilters") }).click();
    await expect(page).not.toHaveURL(/[?&]kind=/, COLD);
  });
});
