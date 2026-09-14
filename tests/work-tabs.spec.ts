import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { formatDay, type Day } from "@/lib/dates";
import { formatSqmWhole } from "@/lib/money";

/**
 * P13-S8 — the work tabs (SPEC §3 P13, DESIGN §1b).
 *
 * The founder's sentence is "the company's target this month sits at the top of
 * the first tab, always visible … it moves out of Metrics", and the one-language
 * sweep asks for people drawn with an avatar whose ring means something and a
 * row that opens the person. Three walks, each held to the database rather than
 * to the seed: which month card is first and what it says; who carries the leave
 * ring and who the stuck one; and where a press on a team row lands.
 *
 * Every figure is computed here in this spec's own SQL — the working days
 * included — and not by calling the app's readers: the app is what is on trial
 * (rules/data.md).
 */

const COLD = { timeout: 30_000 };

/** The company's approved m² this Riyadh month (S43), exact. */
async function companyAchieved(): Promise<number> {
  const row = await one<{ sqm: string }>(
    `select round(coalesce(sum(round(di.width * di.length * di.qty, 2)), 0), 2)::text as sqm
       from dispatches d
       join dispatch_items di on di.dispatch_id = d.id
      where d.status = 'approved'
        and date_trunc('month', (d.approved_at at time zone 'Asia/Riyadh')::date)
            = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)`,
  );
  return Number(row.sqm);
}

/** One person's approved m² this month, divided between the people credited (D148). */
async function creditedThisMonth(person: string): Promise<number> {
  const row = await one<{ sqm: string }>(
    `with d as (
       select dd.id, round(coalesce(sum(round(di.width * di.length * di.qty, 2)), 0), 2) as sqm
         from dispatches dd
         join dispatch_items di on di.dispatch_id = dd.id
        where dd.status = 'approved'
          and date_trunc('month', (dd.approved_at at time zone 'Asia/Riyadh')::date)
                = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)
        group by dd.id
     ),
     cr as (
       select dispatch_id, user_id,
              count(*) over (partition by dispatch_id) as n,
              row_number() over (partition by dispatch_id order by user_id) as k
         from dispatch_credits
     )
     select round(coalesce(sum(
              case when cr.k < cr.n then trunc(d.sqm / cr.n, 2)
                   else d.sqm - trunc(d.sqm / cr.n, 2) * (cr.n - 1) end), 0), 2)::text as sqm
       from d join cr on cr.dispatch_id = d.id
      where cr.user_id = $1::uuid`,
    [person],
  );
  return Number(row.sqm);
}

/** The target set for this month — the company's when `person` is null — or null. */
async function targetThisMonth(person: string | null): Promise<number | null> {
  const rows = person
    ? await query<{ sqm: string }>(
        `select sqm::text as sqm from targets
          where user_id = $1::uuid
            and month = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)::date`,
        [person],
      )
    : await query<{ sqm: string }>(
        `select sqm::text as sqm from company_targets
          where month = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)::date`,
      );
  return rows.length === 0 ? null : Number(rows[0].sqm);
}

/**
 * The month card, held to being the FIRST thing on its tab: the element right
 * after the page's own header, with the target and achieved it prints read
 * back against the database.
 */
async function expectMonthFirst(
  page: Page,
  t: Translate,
  title: string,
  figures: { target: number | null; achieved: number },
): Promise<void> {
  const card = page.locator('[data-slot="month-card"]');
  await expect(card).toHaveCount(1, COLD);
  await expect(card.getByRole("heading", { name: title })).toBeVisible();
  expect(
    await card.evaluate((node) => node.previousElementSibling?.tagName),
    "something sits between the tabs and the month card",
  ).toBe("HEADER");

  // Whole metres on the card, rounded by the app's own formatter (money.ts)
  // from the exact figure this spec computed.
  await expect(card.locator('[data-slot="figure-achieved"]')).toHaveText(
    formatSqmWhole(figures.achieved),
  );
  if (figures.target === null) {
    // No target is a sentence, never a bar against nothing (D41, S45).
    await expect(card.getByText(t("team.noTarget"))).toBeVisible();
    await expect(card.getByRole("img")).toHaveCount(0);
  } else {
    await expect(card.locator('[data-slot="figure-target"]')).toHaveText(
      formatSqmWhole(figures.target),
    );
  }
}

test("the month is the first thing on the work tab, the company's for the manager and his own for a rep, and it has left Metrics", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  await test.step("1 · the manager's work tab opens on the company's month", async () => {
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/team?tab=work`);
    await expectMonthFirst(page, t, t("team.companyMonth"), {
      target: await targetThisMonth(null),
      achieved: await companyAchieved(),
    });
    // Above the strip and the stuck list, which are still there under it.
    await expect(page.locator('[data-slot="standing"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: t("team.stuck") })).toBeVisible();
  });

  await test.step("2 · and Metrics no longer carries it, for the company or for a picked rep", async () => {
    await page.goto(`/${locale}/team?tab=metrics`);
    await expect(page.locator('[data-slot="range-chips"]')).toBeVisible(COLD);
    await expect(page.locator('[data-slot="month-card"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: t("team.companyMonth") })).toHaveCount(0);

    const faisal = await userId("faisal@technopanel.com.sa");
    await page.goto(`/${locale}/team?tab=metrics&rep=${faisal}`);
    await expect(page.locator('[data-slot="range-chips"]')).toBeVisible(COLD);
    await expect(page.locator('[data-slot="month-card"]')).toHaveCount(0);
  });

  await test.step("3 · a rep's work tab opens on his own month", async () => {
    const faisal = await userId("faisal@technopanel.com.sa");
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/day?tab=work`);
    await expectMonthFirst(page, t, t("day.myMonth"), {
      target: await targetThisMonth(faisal),
      achieved: await creditedThisMonth(faisal),
    });
    // Today's cards follow it, in the one grid.
    await expect(
      page.locator('[data-slot="work-grid"]').getByRole("heading", { name: t("day.waitingOnYou") }),
    ).toBeVisible();
  });
});

/**
 * Working days after `from` up to today, on the office's calendar or, with a
 * person, on his: Friday and Saturday off, the company's holidays off, and his
 * own leave off when it is his clock (D141). This spec's own copy, on purpose.
 */
const WORKING_DAYS_SINCE = (from: string, person: string | null) => `(
  select count(*)
    from generate_series((${from}) + 1, (now() at time zone 'Asia/Riyadh')::date, interval '1 day') g(x)
   where extract(isodow from g.x) not in (5, 6)
     and not exists (
       select 1 from non_working_days n
        where n.day = g.x::date
          and (n.user_id is null ${person ? `or n.user_id = ${person}` : ""})
     )
)`;

/**
 * Everybody with a row on the team table, what is stuck on each of them, and
 * whether they are away today — the three rules of the stuck list that are one
 * person's (D14, P12-7, D141) and the one reader of leave (D75), in SQL.
 */
async function people(): Promise<
  {
    id: string;
    email: string;
    requests: number;
    stuck: number;
    away: boolean;
    back_on: Day | null;
  }[]
> {
  return query(
    `with p as (
       select u.id, u.email
         from users u
        where u.active and u.role in ('rep', 'marketing', 'manager', 'coordinator')
     ),
     today as (select (now() at time zone 'Asia/Riyadh')::date as d),
     counted as (
       select p.id, p.email,
              (select count(*)::int
                 from quotations q join companies c on c.id = q.company_id
                where c.rep_id = p.id and c.archived_at is null and q.status = 'requested'
                  and ${WORKING_DAYS_SINCE("(q.created_at at time zone 'Asia/Riyadh')::date", null)} > 2
              ) as requests,
              (select count(*)::int
                 from companies c
                where c.rep_id = p.id and c.archived_at is null and c.next_follow_up is not null
                  and ${WORKING_DAYS_SINCE("c.next_follow_up", "p.id")} > 3
              ) as company_follow_ups,
              (select count(*)::int
                 from projects pr join companies c on c.id = pr.company_id
                where c.rep_id = p.id and c.archived_at is null
                  and pr.archived_at is null and pr.lost_at is null and pr.next_follow_up is not null
                  and ${WORKING_DAYS_SINCE("pr.next_follow_up", "p.id")} > 3
              ) as project_follow_ups,
              (select count(*)::int
                 from companies c
                where c.rep_id = p.id and c.archived_at is null
                  and c.lead_from_id is not null and c.lead_acknowledged_at is null
                  and ${WORKING_DAYS_SINCE(
                    `(coalesce((select max(a.at) from audit_log a
                                 where a.record_type = 'company' and a.record_id = c.id::text
                                   and a.action = 'lead.reassign'), c.created_at)
                      at time zone 'Asia/Riyadh')::date`,
                    null,
                  )} > 2
              ) as leads,
              -- Away is his own leave on a day the office is open (D75).
              (extract(isodow from today.d) not in (5, 6)
                and not exists (select 1 from non_working_days h where h.day = today.d and h.user_id is null)
                and exists (select 1 from non_working_days l where l.day = today.d and l.user_id = p.id)
              ) as away,
              (select to_char(min(g.x), 'YYYY-MM-DD')
                 from generate_series(today.d + 1, today.d + 45, interval '1 day') g(x)
                where extract(isodow from g.x) not in (5, 6)
                  and not exists (select 1 from non_working_days n
                                   where n.day = g.x::date and (n.user_id is null or n.user_id = p.id))
              ) as back_on
         from p, today
     )
     select id, email, requests,
            requests + company_follow_ups + project_follow_ups + leads as stuck,
            away, back_on
       from counted
      order by email`,
  );
}

/** A person's row in the desk table, found by the door that is named for him. */
function rowOf(page: Page, name: string): Locator {
  return page
    .getByRole("table")
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
}

test("a person on leave wears the leave ring and says so, and a person with a stuck request the red one", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const everybody = await people();
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=team`);
  await expect(page.getByRole("table")).toBeVisible(COLD);

  await test.step("on leave today: the leave ring, and the words beside it", async () => {
    const away = everybody.find((person) => person.away);
    if (!away) {
      // A Friday, a Saturday or a holiday, when nobody is away by definition
      // (D75) — and then no row may claim it.
      await expect(page.locator('[data-slot="member-avatar"][data-ring="over"]')).toHaveCount(0);
      return;
    }
    const row = rowOf(page, await personName(away.email, locale));
    await expect(row).toHaveCount(1);
    // Leave wins the ring when both are true: nothing on the floor of somebody
    // who is not at work is his to clear today.
    await expect(row.locator('[data-slot="member-avatar"]')).toHaveAttribute("data-ring", "over");
    await expect(row.locator('[data-tone="over"]')).toHaveText(
      t("team.backOn", { day: formatDay(away.back_on as Day, locale) }),
    );
  });

  await test.step("a stuck request: the red ring, and how many things are stuck", async () => {
    const stuck = everybody.find((person) => person.requests > 0 && !person.away);
    expect(stuck, "the seed has no request stuck on anybody at work today").toBeTruthy();
    const row = rowOf(page, await personName(stuck!.email, locale));
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-slot="member-avatar"]')).toHaveAttribute("data-ring", "bad");
    await expect(row.locator('[data-tone="bad"]')).toHaveText(
      t("team.stuckCount", { count: stuck!.stuck }),
    );
  });

  await test.step("and nobody else wears a ring or a word they have not earned", async () => {
    for (const person of everybody) {
      const row = rowOf(page, await personName(person.email, locale));
      if ((await row.count()) === 0) continue;
      const ring = person.away ? "over" : person.stuck > 0 ? "bad" : "none";
      await expect(row.locator('[data-slot="member-avatar"]'), person.email).toHaveAttribute(
        "data-ring",
        ring,
      );
      await expect(row.locator('[data-tone="bad"]'), person.email).toHaveCount(person.stuck > 0 ? 1 : 0);
    }
  });

  // The stuck word counts what the work tab lists, and the caption says so.
  await expect(
    page.getByText(
      t("team.stuckOnRowMeans", {
        work: t("common.tab.work"),
        requests: t("team.stuckRequests"),
        followUps: t("team.stuckFollowUps"),
        leads: t("team.stuckLeads"),
      }),
    ),
  ).toBeVisible();
});

test("a team row's body opens that person's companies, and a figure on it opens the filtered list instead", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = {
    id: await userId("faisal@technopanel.com.sa"),
    name: await personName("faisal@technopanel.com.sa", locale),
  };

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=team`);
  const row = rowOf(page, faisal.name);
  await expect(row).toHaveCount(1, COLD);

  await test.step("1 · a press on the row, away from his name, opens his floor", async () => {
    // The pipeline cell: no link of its own, three columns from the name. A
    // press at a point rather than `click()` on the cell, because the name's
    // door is stretched over the row and Playwright rightly refuses to click
    // what it covers (tests/presses.spec.ts).
    const cell = row.getByRole("cell").nth(2);
    await cell.scrollIntoViewIfNeeded();
    const box = await cell.boundingBox();
    expect(box, "the pipeline cell has no box to press").not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page).toHaveURL(new RegExp(`/companies\\?rep=${faisal.id}$`), COLD);
    await expect(
      page.getByRole("heading", { name: t("team.companiesOf", { name: faisal.name }) }),
    ).toBeVisible();
  });

  await test.step("2 · a figure on the same row opens the rows it counted", async () => {
    await page.goto(`/${locale}/team?tab=team`);
    const door = rowOf(page, faisal.name).locator('a[href*="&filter="]').first();
    await expect(door, "Faisal has no figure above nought to press").toBeVisible(COLD);
    const href = (await door.getAttribute("href")) ?? "";
    const filter = href.match(/filter=(\w+)/)?.[1];
    expect(filter).toBeTruthy();

    await door.click();
    await expect(page).toHaveURL(new RegExp(`rep=${faisal.id}&filter=${filter}`), COLD);
  });
});
