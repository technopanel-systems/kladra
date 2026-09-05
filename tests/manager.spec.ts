import type { Page } from "@playwright/test";
import { login, type Persona } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { formatDay, type Day } from "@/lib/dates";
import { test, expect } from "./helpers/i18n";

/**
 * P6 — the manager's screen (WORKFLOW §3, Abdulrahman).
 *
 * Abdulrahman opens the app and the question he came with is already answered:
 * how the company is doing this month, who is doing it, and what has stopped
 * moving. Nothing on that screen was typed by anybody — it is all derived from
 * what the reps and the coordinator did in the course of their own work, which
 * is S27: the history of a company IS the report.
 *
 * The figures are checked against the database rather than against the seed, so
 * the test still means something after the seed changes.
 */

const COLD = { timeout: 30_000 };

/** The company's achieved m² this Riyadh month — the one definition (S43). */
async function companyAchieved(): Promise<number> {
  const row = await one<{ sqm: string }>(
    `select round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text as sqm
       from dispatches d
       join dispatch_items di on di.dispatch_id = d.id
       join quotation_items qi on qi.id = di.quotation_item_id
      where d.status = 'approved'
        and date_trunc('month', (d.approved_at at time zone 'Asia/Riyadh')::date)
            = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)`,
  );
  return Number(row.sqm);
}

/** A figure as the screen shows it, read back. */
async function figure(page: Page, slot: string): Promise<number> {
  const text = await page.locator(`[data-slot='${slot}']`).first().innerText();
  return Number(text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0]);
}

test("Abdulrahman's floor: the company's month, everyone's month, and what is stuck", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  await login(page, locale, "abdulrahman");

  await test.step("1 · his home is the team screen, and it opens on the company's month", async () => {
    // `homeFor` decides where a role lands (D15) — the test does not name the
    // path, it checks that signing in got him there.
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);

    // Whole metres on a card (money.ts): a target is set in whole m² and half a
    // metre is not a fact anybody acts on. The figure behind it is exact.
    const shown = await figure(page, "figure-achieved");
    expect(shown, "the company card is not what the dispatches add up to").toBe(
      Math.round(await companyAchieved()),
    );
  });

  await test.step("2 · every person has a row with the month and the habits on it", async () => {
    // The name this language shows, not the Latin one on the row (D68).
    const faisal = { name: await personName("faisal@technopanel.com.sa", locale) };
    const rawan = { name: await personName("rawan@technopanel.com.sa", locale) };
    const jerom = { name: await personName("jerom@technopanel.com.sa", locale) };
    const marketing = { name: await personName("marketing@technopanel.com.sa", locale) };

    // Every column §3 asks for, by its own heading.
    for (const key of [
      "team.member",
      "team.target",
      "team.achieved",
      "team.pace",
      "team.openQuotations",
      "team.overdueFollowUps",
      "team.neverContacted",
    ]) {
      await expect(page.getByRole("columnheader", { name: t(key) })).toBeVisible();
    }

    // Exact: a rep's name also appears on the stuck rows underneath, and the
    // one being asked about is the row whose whole label is his name.
    await expect(page.getByRole("link", { name: faisal.name, exact: true })).toBeVisible();
    // The coordinator carries no metres and no companies, so she is not a row
    // of dashes on a screen about metres (D15, S9). Nor is the admin: he runs
    // the app and sells nothing, and the targets screen already refuses to give
    // him a box — one rule, two screens (D44).
    await expect(page.getByRole("link", { name: rawan.name, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: jerom.name, exact: true })).toHaveCount(0);
    // Nor marketing, which owns companies and closes none of them: a target it
    // could never meet would read as a shortfall every month (D44, D50).
    await expect(page.getByRole("link", { name: marketing.name, exact: true })).toHaveCount(0);
  });

  await test.step("3 · the Stuck list names what has stopped moving", async () => {
    await expect(page.getByRole("heading", { name: t("team.stuck") })).toBeVisible();

    // Whatever the database says is stuck is what the screen says. Counted
    // rather than named, because which rows qualify moves with the clock.
    const overdue = await query<{ id: string }>(
      `select companies.id from companies
        where companies.archived_at is null
          and companies.next_follow_up is not null
          and companies.next_follow_up < (now() at time zone 'Asia/Riyadh')::date - 3`,
    );
    const never = await query<{ id: string }>(
      `select companies.id from companies
        where companies.archived_at is null
          and not exists (select 1 from activities where activities.company_id = companies.id)
          and (companies.created_at at time zone 'Asia/Riyadh')::date
              <= (now() at time zone 'Asia/Riyadh')::date - 14`,
    );

    if (overdue.length > 0) {
      await expect(page.getByRole("heading", { name: t("team.stuckFollowUps") })).toBeVisible();
    }
    if (never.length > 0) {
      await expect(page.getByRole("heading", { name: t("team.stuckNever") })).toBeVisible();
    }
    if (overdue.length === 0 && never.length === 0) {
      await expect(page.getByText(t("team.stuckNothing"))).toBeVisible();
    }
  });

  await test.step("4 · a name opens that rep's floor, and he cannot add to it", async () => {
    const faisal = {
      id: await userId("faisal@technopanel.com.sa"),
      name: await personName("faisal@technopanel.com.sa", locale),
    };
    await page.getByRole("link", { name: faisal.name, exact: true }).first().click();

    await expect(page).toHaveURL(new RegExp(`rep=${faisal.id}`), COLD);
    await expect(
      page.getByRole("heading", { name: t("team.companiesOf", { name: faisal.name }) }),
    ).toBeVisible();
    // He reads it; he adds to nobody's floor (S8, and rep.spec checks the
    // action refuses him as well).
    await expect(page.getByRole("button", { name: t("forms.addCompany") })).toHaveCount(0);

    // And it is HIS list: every company on it is one of Faisal's.
    const mine = await query<{ name: string }>(
      `select companies.name from companies
        where companies.rep_id = $1::uuid and companies.archived_at is null`,
      [faisal.id],
    );
    const shown = await page
      .getByRole("table")
      .first()
      .getByRole("link")
      .filter({ visible: true })
      .allInnerTexts();
    const names = new Set(mine.map((row) => row.name));
    for (const text of shown) {
      const first = text.split("\n")[0].trim();
      if (first.startsWith("0") || first.startsWith("+")) continue; // a phone link
      expect(names.has(first), `${first} is not one of Faisal's companies`).toBe(true);
    }

    await page.getByRole("link", { name: t("team.backToTeam") }).click();
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible();
  });

  await test.step("5 · the bell lists his notices, and reading them drops the count", async () => {
    const abdulrahman = await userId("abdulrahman@technopanel.com.sa");
    const before = Number(
      (
        await one<{ unread: string }>(
          "select count(*)::text as unread from notifications where user_id = $1::uuid and read_at is null",
          [abdulrahman],
        )
      ).unread,
    );

    const bell = page.getByRole("link", {
      name: before > 0 ? t("shell.unreadCount", { count: before }) : t("common.notifications"),
    });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByRole("heading", { name: t("common.notifications") })).toBeVisible(COLD);

    if (before === 0) {
      await expect(page.getByText(t("shell.emptyNotifications"))).toBeVisible();
      return;
    }

    await page.getByRole("button", { name: t("common.markAllRead") }).click();
    // The bell reads the live channel, so it drops without a reload (DESIGN §2).
    await expect(page.getByRole("link", { name: t("common.notifications") })).toBeVisible(COLD);
    await expect(page.getByRole("button", { name: t("common.markAllRead") })).toHaveCount(0);
  });
});

/** A rep has no business on the team screen, and is not shown an error about it. */
test("a rep who follows a link to the team screen lands on his own home", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/team`);

  await expect(page).toHaveURL(/\/day/, COLD);
  await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible();
});

/**
 * Somebody is away, and his floor is not left to nobody (D75, 9A item 9).
 *
 * Leave has been in this system since the schema and reached exactly two
 * things: the pace arithmetic, and the daily report's own "off" mark. So a rep
 * went on leave and his customers simply stopped being anybody's — the five-day
 * walk put it in four words, nobody covers a floor.
 *
 * Both halves are asserted from the database rather than from the seed: who is
 * away today is a row in `non_working_days`, and what is due on his floor is the
 * same follow-up arithmetic every other screen uses. On a Friday or a Saturday
 * the right answer is nothing at all — a weekend is not leave, and there is no
 * floor to cover on a day the office is shut — so that is what the test asks for
 * instead, which is the case that would have gone untested (rules/data.md).
 */
test("a rep on leave is named on the manager's screen, and what is due on his floor with him", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const today = await one<{ day: Day }>(
    "select to_char((now() at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as day",
  );
  const away = await query<{ id: string; email: string; back_on: Day }>(
    `select u.id, u.email, to_char(min(n2.day), 'YYYY-MM-DD') as back_on
       from non_working_days n
       join users u on u.id = n.user_id
       join generate_series(n.day + 1, n.day + 45, interval '1 day') as n2(day)
         on extract(isodow from n2.day) not in (5, 6)
        and not exists (
          select 1 from non_working_days x
           where x.day = n2.day::date
             and (x.user_id is null or x.user_id = u.id)
        )
      where n.day = $1::date
      group by u.id, u.email`,
    [today.day],
  );

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team`);
  await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);

  if (away.length === 0) {
    // A weekend, or a day nobody happens to be off. Nothing may claim otherwise.
    await expect(page.getByRole("heading", { name: t("team.uncovered") })).toHaveCount(0);
    return;
  }

  const person = away[0];
  const name = await personName(person.email, locale);
  const backOn = person.back_on;

  await test.step("his row says he is away and when he is back", async () => {
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row.first()).toBeVisible();
    await expect(page.getByText(t("team.backOn", { day: formatDay(backOn, locale) })).first()).toBeVisible();
  });

  await test.step("what is due on his floor is on this screen, with his name on it", async () => {
    const due = await query<{ id: string }>(
      `select companies.id from companies
        where companies.archived_at is null
          and companies.rep_id = $1::uuid
          and companies.next_follow_up is not null
          and companies.next_follow_up <= (now() at time zone 'Asia/Riyadh')::date
       union all
       select projects.id from projects
        join companies c on c.id = projects.company_id
        where projects.archived_at is null
          and projects.lost_at is null
          and c.archived_at is null
          and c.rep_id = $1::uuid
          and projects.next_follow_up is not null
          and projects.next_follow_up <= (now() at time zone 'Asia/Riyadh')::date`,
      [person.id],
    );

    if (due.length === 0) {
      await expect(page.getByRole("heading", { name: t("team.uncovered") })).toHaveCount(0);
      return;
    }

    const group = page.getByRole("heading", { name: t("team.uncovered") });
    await expect(group).toBeVisible();
    await expect(page.getByText(t("team.uncoveredMeans"))).toBeVisible();
    await expect(
      page.getByText(t("team.awayBackOn", { name, day: formatDay(backOn, locale) })).first(),
      "the row does not say whose floor it is or when he is back",
    ).toBeVisible();
  });

  await test.step("and his own day says it to him, without hiding what is due", async () => {
    // Whoever the seed has away — the personas are named by the local part of
    // their address, so the test follows the data rather than a name in it.
    await login(page, locale, person.email.split("@")[0] as Persona);
    await page.goto(`/${locale}/day`);
    await expect(page.getByText(t("day.onLeave", { day: formatDay(backOn, locale) }))).toBeVisible(
      COLD,
    );
  });
});
