import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { addDays, diffDays, todayRiyadh, type Day } from "@/lib/dates";
import { isWeekend, workingDaysBetween, type NonWorking } from "@/lib/workdays";

/**
 * P11J — one clock on the manager's screen (D141, D142).
 *
 * A waiting request has been counted in working days since P9, for the reason
 * written in `src/lib/team.ts`: a second copy of that arithmetic in a `case`
 * expression is how a rep back from Eid gets told he is late. The follow-up
 * beside it was counted in calendar days, in SQL, so a call promised for
 * Thursday read "3 days overdue" on Sunday morning — on the same list, under
 * the same heading, on the same screen.
 *
 * The holiday here is what makes the test prove the fix rather than restate it:
 * with the holiday counted off, the working-day answer and the calendar answer
 * are different numbers, and only one of them may appear on the screen.
 */

const COLD = { timeout: 30_000 };

/** Company holidays between two days, read rather than assumed (the seed has its own). */
async function companyHolidays(from: Day, to: Day): Promise<NonWorking[]> {
  const rows = await query<{ day: Day }>(
    `select to_char(day, 'YYYY-MM-DD') as day from non_working_days
      where user_id is null and day between $1::date and $2::date`,
    [from, to],
  );
  return rows.map((row) => ({ day: row.day, userId: null }));
}

test("a follow-up is late in working days, like every other wait on the screen", async ({
  page,
  locale,
  t,
}) => {
  const today = todayRiyadh();
  // Far enough back that it is stuck by either rule, so the test is about the
  // NUMBER on the row and never about whether the row is there.
  const promised = addDays(today, -12);

  const company = await one<{ id: string; name: string; before: string | null }>(
    `select c.id, c.name, to_char(c.next_follow_up, 'YYYY-MM-DD') as before
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and c.archived_at is null
      order by c.created_at
      limit 1`,
  );

  const existing = await companyHolidays(promised, today);
  const taken = new Set(existing.map((row) => row.day));
  // A working day inside the window that is not already off, so inserting it
  // changes the answer by exactly one.
  let holidayDay: Day | null = null;
  for (let d = addDays(promised, 1); diffDays(d, today) > 0; d = addDays(d, 1)) {
    if (!isWeekend(d) && !taken.has(d)) {
      holidayDay = d;
      break;
    }
  }
  expect(holidayDay, "no working day inside the window to make a holiday of").not.toBeNull();

  await query("update companies set next_follow_up = $1::date where id = $2::uuid", [
    promised,
    company.id,
  ]);
  const holiday = await one<{ id: number }>(
    `insert into non_working_days (day, kind, user_id, note)
     values ($1::date, 'holiday', null, 'one-clock.spec')
     returning id`,
    [holidayDay],
  );

  try {
    const nonWorking = await companyHolidays(promised, today);
    const expected = workingDaysBetween(promised, today, nonWorking);

    // The two answers this screen could give, and they are not the same one.
    expect(
      expected,
      "the inserted holiday was not counted off — the window did not reach it",
    ).toBeLessThan(workingDaysBetween(promised, today, []));
    expect(expected, "a working-day count that equals the calendar one proves nothing").toBeLessThan(
      diffDays(promised, today),
    );

    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/team`);
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);

    const row = page.getByRole("link", { name: company.name }).first();
    await expect(row, `no stuck row for ${company.name}`).toBeVisible(COLD);
    await expect(row).toContainText(t("team.overdueDays", { count: expected }));
    await expect(
      row,
      "the row is still counting calendar days",
    ).not.toContainText(t("team.overdueDays", { count: diffDays(promised, today) }));
  } finally {
    await query("delete from non_working_days where id = $1::int", [holiday.id]);
    await query("update companies set next_follow_up = $1::date where id = $2::uuid", [
      company.before,
      company.id,
    ]);
  }
});

test("the team row says whose customers have gone quiet, and it counts the rows its list shows", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "abdulrahman");
  // The team table is its own tab now (D151): the manager's screen answers three
  // questions and this is the third one, people rather than work.
  await page.goto(`/${locale}/team?tab=team`);

  const table = page.getByRole("table").first();
  await expect(table).toBeVisible(COLD);

  // The column exists at all, which it did not until P11J: the strip above
  // carried the team's total and the row said nothing about whose they were.
  await expect(
    table.getByRole("columnheader", { name: t("team.stuckQuiet") }),
    "the team table has no gone-quiet column",
  ).toBeVisible();

  const rep = await one<{ id: string; quiet: number }>(
    `select u.id,
            (select count(*)::int
               from companies c
              where c.rep_id = u.id
                and c.archived_at is null
                and coalesce(
                      c.next_follow_up,
                      (select min(p.next_follow_up) from projects p
                        where p.company_id = c.id and p.archived_at is null and p.lost_at is null)
                    ) is null
                and exists (select 1 from activities a
                             where a.company_id = c.id and a.archived_at is null)
                and (select max(a.happened_on) from activities a
                      where a.company_id = c.id and a.archived_at is null)
                    <= (now() at time zone 'Asia/Riyadh')::date - 14) as quiet
       from users u
      where u.email = 'faisal@technopanel.com.sa'`,
  );

  // Found by the control it is, not by the rep's name: a person is named in the
  // reader's own script, so "Faisal" is not on this screen in Arabic (D68).
  const figure = table.locator(`a[href$="rep=${rep.id}&filter=quiet"]`);
  await expect(figure, "the rep has no gone-quiet figure on his row").toHaveCount(1);
  await expect(figure).toHaveText(String(rep.quiet));

  // And it opens the list it counted (D108: a count counts the rows its list
  // shows), which is the check that the figure and the screen agree.
  await page.goto(`/${locale}/companies?rep=${rep.id}&filter=quiet`);
  await expect(page.getByRole("row")).toHaveCount(rep.quiet + 1, COLD);
});
