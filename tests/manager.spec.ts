import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
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
    const faisal = await one<{ name: string }>(
      "select name from users where email = 'faisal@technopanel.com.sa'",
    );
    const rawan = await one<{ name: string }>(
      "select name from users where email = 'rawan@technopanel.com.sa'",
    );
    const jerom = await one<{ name: string }>(
      "select name from users where email = 'jerom@technopanel.com.sa'",
    );
    const marketing = await one<{ name: string }>(
      "select name from users where email = 'marketing@technopanel.com.sa'",
    );

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
    const faisal = await one<{ id: string; name: string }>(
      "select id, name from users where email = 'faisal@technopanel.com.sa'",
    );
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
