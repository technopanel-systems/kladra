import { addDays, todayRiyadh, type Day } from "@/lib/dates";
import { isWeekend } from "@/lib/workdays";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * The daily report (SPEC D55-D58, WORKFLOW §4, Jerom's phase 9B).
 *
 * What is worth holding here is not that the screen renders. It is the four
 * sentences the design rests on, each of which was wrong in some earlier tool:
 *
 *  - nobody retypes the day. Every figure on the screen is asserted against the
 *    same records the app read it from, so a figure that quietly becomes a typed
 *    field fails here.
 *  - the day the screen opens on can always be written. That is not a
 *    coincidence of the calendar, it is the whole of D58 after the weekend bug,
 *    and it is asserted rather than assumed.
 *  - a missed day is one blank in a list, with no colour and no badge on it.
 *  - a day nobody worked is not a day anybody missed.
 *
 * Both locale projects run against one seeded database (playwright.config.ts),
 * so nothing here writes a figure another spec reads, and the one test that
 * needs an unwritten day clears it first rather than assuming the seed's.
 */

const COLD = { timeout: 30_000 };

/** The people who owe a report — the same three roles as `writesReports`. */
const REPORTERS = "u.active = true and u.role in ('rep', 'marketing', 'coordinator')";

/** The day the screen opens on: the newest one the seed wrote about. */
async function latestSeededDay(): Promise<Day> {
  const { day } = await one<{ day: Day }>(
    "select to_char(max(day), 'YYYY-MM-DD') as day from daily_reports",
  );
  return day;
}

/** The one before it — a day that is finished, and has a report missing from it. */
async function previousSeededDay(latest: Day): Promise<Day> {
  const { day } = await one<{ day: Day }>(
    "select to_char(max(day), 'YYYY-MM-DD') as day from daily_reports where day < $1::date",
    [latest],
  );
  return day;
}

test("a rep's day is assembled for him, and he adds the one line it cannot know", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const today = todayRiyadh();
  const day = await latestSeededDay();
  const faisal = await userId("faisal@technopanel.com.sa");

  // Both locale projects share one database and the English run writes this
  // report, so the Arabic run would otherwise start from a day already closed.
  // The transition from nothing-written to written is the thing under test.
  await query("delete from daily_reports where user_id = $1::uuid and day = $2::date", [
    faisal,
    day,
  ]);

  await login(page, locale, "faisal");

  await test.step("1 · the rail carries it, and his own day says it is not written", async () => {
    const nav = page.getByRole("navigation", { name: t("shell.mainNav") }).first();
    await expect(nav.getByRole("link", { name: t("reports.title") })).toHaveCount(1, COLD);

    await page.goto(`/${locale}/day`);
    const nudge = page.getByRole("link", { name: t("reports.closeTheDay") });
    // A day he is not working is not a day he owes (D57): on a Friday or a
    // Saturday there is nothing to nudge him about, and a reminder that is lit
    // every day is one people learn to look past.
    await expect(nudge).toHaveCount(isWeekend(today) ? 0 : 1, COLD);
  });

  await test.step("2 · his own day opens ready to write, whatever day of the week it is", async () => {
    await page.goto(`/${locale}/reports`);
    await expect(page.getByRole("heading", { name: t("reports.title") })).toBeVisible(COLD);

    // The screen opens on the last working day and the last working day is
    // always writable (D58). On a Saturday, with "yesterday" as the rule, it
    // was not — and nobody on the floor could write anything at all.
    const own = page.locator('[data-slot="report-own"]');
    await expect(own).toBeVisible();
    await expect(own.getByRole("button", { name: t("common.save") })).toBeVisible();
  });

  await test.step("3 · every figure on it is read back out of his own records", async () => {
    const own = page.locator('[data-slot="report-own"]');

    const counted = await one<{ logged: string; companies: string; quotationRequests: string }>(
      `select
         (select count(*)::text from activities
           where user_id = $1::uuid and happened_on = $2::date) as logged,
         (select count(distinct company_id)::text from activities
           where user_id = $1::uuid and happened_on = $2::date) as companies,
         (select count(*)::text from quotations
           where rep_id = $1::uuid
             and (created_at at time zone 'Asia/Riyadh')::date = $2::date) as "quotationRequests"`,
      [faisal, day],
    );

    for (const [figure, value] of Object.entries(counted)) {
      await expect(own.locator(`[data-figure="${figure}"] dd`), `${figure} disagrees`).toHaveText(
        value,
      );
    }
  });

  const note =
    locale === "ar"
      ? "زرت العميل اليوم ولم يصلني رد على السعر المعدّل."
      : "Visited the customer today; still no answer on the revised price.";

  await test.step("4 · one box, one press, and the day is closed", async () => {
    const own = page.locator('[data-slot="report-own"]');
    await own.getByLabel(t("reports.yourDay")).fill(note);
    await own.getByRole("button", { name: t("common.save") }).click();

    await expect
      .poll(
        async () =>
          (
            await query("select 1 from daily_reports where user_id = $1::uuid and day = $2::date", [
              faisal,
              day,
            ])
          ).length,
        { timeout: 15_000 },
      )
      .toBe(1);

    const saved = await one<{ note: string }>(
      "select note from daily_reports where user_id = $1::uuid and day = $2::date",
      [faisal, day],
    );
    expect(saved.note).toBe(note);

    // Written down like every other transition, and against the report's own id
    // rather than a key made up for the occasion (D54). `record_id` is TEXT —
    // the audit log points at rows in a dozen tables and does not pretend they
    // share a key type — so it is compared as text (rules/data.md).
    const audit = await query(
      `select 1 from audit_log
        where audit_log.record_type = 'daily_report'
          and audit_log.action = 'report.write'
          and audit_log.user_id = $1::uuid
          and audit_log.details->>'day' = $2::text
          and audit_log.record_id = (
            select r.id::text from daily_reports r
             where r.user_id = $1::uuid and r.day = $2::date
          )`,
      [faisal, day],
    );
    expect(audit.length, "the report was not audited").toBeGreaterThan(0);
  });

  await test.step("5 · pressing Save again on the same day replaces, never adds", async () => {
    const own = page.locator('[data-slot="report-own"]');
    await own.getByLabel(t("reports.yourDay")).fill(`${note} ${note}`);
    await own.getByRole("button", { name: t("common.save") }).click();

    await expect
      .poll(
        async () =>
          (
            await query(
              "select 1 from daily_reports where user_id = $1::uuid and day = $2::date",
              [faisal, day],
            )
          ).length,
        { timeout: 15_000 },
      )
      .toBe(1);
  });

  await test.step("6 · and the nudge is gone, because there is nothing left to do", async () => {
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("link", { name: t("reports.closeTheDay") })).toHaveCount(0, COLD);
  });
});

test("a finished day carries one blank where a report is missing", async ({ page, locale, t }) => {
  test.slow();

  const day = await previousSeededDay(await latestSeededDay());

  const counts = await one<{ owed: string; written: string; off: string }>(
    `select
       (select count(*)::text from users u where ${REPORTERS}) as owed,
       (select count(*)::text from daily_reports r
          join users u on u.id = r.user_id
         where r.day = $1::date and ${REPORTERS}) as written,
       (select count(*)::text from non_working_days where day = $1::date) as off`,
    [day],
  );
  // Nobody was on leave that day, so everybody who works owed one — which is
  // what makes the arithmetic below the plain subtraction it looks like.
  expect(counts.off, "a day off would change who owed a report").toBe("0");
  const missing = Number(counts.owed) - Number(counts.written);
  expect(missing, "the seed has nobody silent on that day").toBeGreaterThan(0);

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/reports?day=${day}`);
  await expect(page.getByRole("heading", { name: t("reports.title") })).toBeVisible(COLD);

  await test.step("1 · the manager has no box of his own — he reads, he does not file", async () => {
    await expect(page.locator('[data-slot="report-own"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: t("common.save") })).toHaveCount(0);
  });

  await test.step("2 · one line says how many wrote, and the names are underneath", async () => {
    await expect(
      page.getByRole("heading", {
        name: t("reports.written", { written: Number(counts.written), owed: Number(counts.owed) }),
      }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="report-card"]')).toHaveCount(Number(counts.owed));
  });

  await test.step("3 · the missing one is a blank, not a mark against anybody", async () => {
    const blanks = page.locator('[data-slot="report-missing"]');
    await expect(blanks).toHaveCount(missing);
    await expect(blanks.first()).toHaveText(t("reports.stateSilent"));
    // Outlined, so the eye catches the gap in one scroll.
    await expect(blanks.first()).toHaveCSS("border-top-style", "dashed");

    // And nothing else: no badge, no colour, no icon. Every tinted thing in
    // Kladra carries `data-tone` (src/lib/state-tone.ts), so counting those
    // inside a silent card is the whole assertion.
    const silent = page.locator('[data-slot="report-card"][data-state="silent"]');
    await expect(silent.first().locator("[data-tone]")).toHaveCount(0);
  });

  await test.step("4 · each sentence runs in the direction of whoever typed it", async () => {
    // Both languages are on this screen on both locales: Saad writes English,
    // Rawan writes Arabic, and each reads the other's. `<Prose>` is a
    // `p dir="auto"`, so the base direction comes from the text and not from the
    // page — an English paragraph flush against the right margin of an Arabic
    // card is the defect this holds shut (rules/words.md).
    const notes = page.locator('[data-slot="report-note"]');
    const directions = await notes.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).direction),
    );
    expect(directions.length, "no reports to read").toBeGreaterThan(1);
    expect(new Set(directions), "every sentence took the page's direction").toEqual(
      new Set(["ltr", "rtl"]),
    );
  });

  await test.step("5 · the day is still shown for the person who did not write it", async () => {
    // The system saw the work and says so. What is missing is the half only he
    // could have written, and that is the only thing the screen withholds.
    const written = page.locator('[data-slot="report-card"][data-state="written"]');
    await expect(written.first().locator('[data-slot="report-note"]')).toBeVisible();
  });
});

test("a day nobody worked is not a day anybody missed", async ({ page, locale, t }) => {
  test.slow();

  // The most recent weekend day behind us. The arrows never land on one — they
  // skip it — so this is reached by typing the day, which is the only way a
  // person gets here and therefore the way it has to read.
  let weekendDay: Day = addDays(todayRiyadh(), -1);
  for (let i = 0; i < 8 && !isWeekend(weekendDay); i += 1) weekendDay = addDays(weekendDay, -1);
  expect(isWeekend(weekendDay), "no weekend day in the last eight").toBe(true);

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/reports?day=${weekendDay}`);

  await expect(page.getByRole("heading", { name: t("reports.notWorking") })).toBeVisible(COLD);
  // Nobody owed one, so nobody is short of one (D57).
  await expect(page.locator('[data-slot="report-missing"]')).toHaveCount(0);
  await expect(
    page.locator('[data-slot="report-card"]').first().getByText(t("reports.stateWeekend")),
  ).toBeVisible();
  // And nothing tells anybody that nothing was recorded at the weekend. That
  // line belongs to one kind of day only — a finished working one — and
  // everywhere else it stutters against the line underneath it.
  await expect(page.getByText(t("reports.quietDay"))).toHaveCount(0);
});

test("a day that has closed cannot be rewritten", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/reports`);
  await expect(page.getByRole("heading", { name: t("reports.title") })).toBeVisible(COLD);

  await test.step("1 · the arrows step over the weekend, one working day at a time", async () => {
    for (let step = 0; step < 2; step += 1) {
      const before = new URL(page.url()).searchParams.get("day");
      // A step that exists is a link and a step that does not is a disabled
      // button, so this asks for the label rather than for a role.
      await page.getByLabel(t("reports.previousDay")).click();
      await expect
        .poll(() => new URL(page.url()).searchParams.get("day"), { timeout: 15_000 })
        .not.toBe(before);
      // A weekend is never landed on by pressing back.
      await expect(page.getByRole("heading", { name: t("reports.notWorking") })).toHaveCount(0);
    }
  });

  await test.step("2 · two working days back, his own card offers no box", async () => {
    const own = page.locator('[data-slot="report-own"]');
    await expect(own).toBeVisible();
    await expect(own.getByRole("button", { name: t("common.save") })).toHaveCount(0);
    await expect(own).toContainText(t("reports.dayClosed"));
  });
});

test("the coordinator's day is the desk's, and it is the same screen", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/reports`);
  await expect(page.getByRole("heading", { name: t("reports.title") })).toBeVisible(COLD);

  const own = page.locator('[data-slot="report-own"]');
  await expect(own).toBeVisible(COLD);

  await test.step("1 · what she did, not what a rep did", async () => {
    for (const figure of ["quotationsIssued", "dispatchesApproved", "dispatchesRefused"]) {
      await expect(own.locator(`[data-figure="${figure}"]`), `${figure} missing`).toHaveCount(1);
    }
    // She owns no companies, so she logs no visits and moves no metres; a
    // nought under those labels would be a figure that is wrong every day.
    for (const figure of ["logged", "companies", "moved"]) {
      await expect(own.locator(`[data-figure="${figure}"]`), `${figure} offered`).toHaveCount(0);
    }
  });

  await test.step("2 · and she reads the floor's day, as the floor reads hers", async () => {
    await expect(page.locator('[data-slot="report-card"]').first()).toBeVisible();
  });
});

test("the day shown never runs ahead of today", async ({ page, locale, t }) => {
  const ahead = addDays(todayRiyadh(), 7);

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/reports?day=${ahead}`);

  // A day that has not happened is not an error page — the screen has an
  // obvious right answer for "which day" and shows that instead (S8).
  await expect(page.getByRole("heading", { name: t("reports.title") })).toBeVisible(COLD);
  await expect(page.getByLabel(t("reports.nextDay"))).toBeDisabled();
  // And a garbled one lands on the same day rather than throwing.
  await page.goto(`/${locale}/reports?day=not-a-day`);
  await expect(page.getByRole("heading", { name: t("reports.title") })).toBeVisible(COLD);
  await expect(page.locator('[data-slot="report-card"]').first()).toBeVisible();
});
