import type { Page } from "@playwright/test";
import { OFFICE_PATHS } from "@/components/shell/nav";
// The app's own day rules, not a second copy of them beside the test (D103).
import {
  addDays,
  addMonths,
  firstOfMonth,
  formatDay,
  todayRiyadh,
  weekday,
  type Day,
} from "@/lib/dates";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";

/**
 * P14 14.9 — the office: the two admin tabs the sales manager shares, and leave
 * read as periods (SPEC §3 P14, §4).
 *
 * Two founder sentences are walked here. "The holidays and leave tab and the
 * users tab belong to the sales manager as well as the admin" — so Abdulrahman
 * reaches both from his rail, works a rep's account on one of them, and is
 * offered nothing at all on the admin's. And "thirty days off is one entry with
 * its dates and its length, not thirty rows, expandable where somebody wants the
 * days" — so a fortnight with a weekend and a company holiday inside it is ONE
 * entry saying what it really costs, and the days are still reachable and still
 * removable one at a time.
 *
 * What a screen offers and what the action behind it does are asked separately,
 * because a rule that only the screen keeps is not a rule (§5 #163). The screen
 * is walked; the action is caught in the one case a screen cannot cover — the
 * row changing under it while the dialog is open, which is what the `FOR UPDATE`
 * read in `resetPasswordAction` exists for.
 *
 * Days are chosen rather than taken from today, for the reason
 * tests/leave.spec.ts gives: a spec whose answer changes with the day it runs is
 * a spec nobody trusts on a Monday. The rows this file plants are its own and
 * are taken out again in a `finally`, because one database backs the whole run.
 */

/** A cold screen behind a fresh query; the suite's default 5s is for a click. */
const COLD = { timeout: 30_000 };

/** A row of the first table on the screen, by the text in it. */
function row(page: Page, name: string) {
  return page.getByRole("table").first().getByRole("row").filter({ hasText: name }).first();
}

/**
 * One entry on the holidays screen, narrowed by the words on it — the note its
 * days carry, and the person it belongs to. The days inside an entry carry
 * `data-day` and not `data-kind`, so they are never an entry.
 */
function entry(page: Page, ...words: string[]) {
  let found = page.locator("li[data-kind]");
  for (const word of words) found = found.filter({ hasText: word });
  return found.first();
}

/**
 * The first Sunday of next month, and the days around it.
 *
 * Next month, so the planted days are ahead of today whatever day the suite
 * runs on — the list shows everything from the start of THIS month forward, so
 * they are on it — and clear of the seed's own leave, which is this month.
 */
function chosenWeek(today: Day = todayRiyadh()): Day {
  let day = firstOfMonth(addMonths(today, 1));
  // 0 is Sunday, and the Saudi week starts on one (S47).
  while (weekday(day) !== 0) day = addDays(day, 1);
  return day;
}

test("the sales manager reaches the office tabs from his rail, and nothing else of the admin's", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "abdulrahman");

  await test.step("the two tabs are in the rail, under the same heading the admin's are", async () => {
    await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
    for (const label of [t("common.users"), t("common.holidays")]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }).first(),
        `${label} is not in the manager's rail`,
      ).toBeVisible();
    }
    // The other five are the admin's, and the rail says so by not naming them.
    for (const label of [
      t("common.targets"),
      t("common.lookups"),
      t("admin.use"),
      t("admin.archive"),
      t("common.export"),
    ]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
        `${label} is on the manager's rail`,
      ).toHaveCount(0);
    }
  });

  await test.step("and both open, read from the rail's own list", async () => {
    for (const path of OFFICE_PATHS) {
      await page.goto(`/${locale}${path}`);
      await expect(page, `${path} turned the manager away`).toHaveURL(
        new RegExp(path.replace("/", "\\/")),
        COLD,
      );
    }
    await expect(page.getByRole("heading", { name: t("common.holidays") })).toBeVisible(COLD);
  });

  await test.step("the four that are not his put him back on his own screen", async () => {
    for (const path of ["/admin/targets", "/admin/lookups", "/admin/use", "/admin/archive"]) {
      await page.goto(`/${locale}${path}`);
      await expect(page, `${path} let the manager in`).toHaveURL(/\/team/, COLD);
    }
  });
});

test("the sales manager works a rep's account and is offered nothing on the admin's", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await personName("faisal@technopanel.com.sa", locale);
  const jerom = await personName("jerom@technopanel.com.sa", locale);
  const me = await personName("abdulrahman@technopanel.com.sa", locale);
  const password = `office-${locale}-first`;

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/admin/users`);
  await expect(page.getByRole("heading", { name: t("common.users") })).toBeVisible(COLD);

  await test.step("one sentence says what is his and what is not", async () => {
    await expect(page.getByText(t("admin.usersOfficeHint"))).toBeVisible();
  });

  await test.step("a rep's row has its menu; the admin's and his own have none", async () => {
    await expect(
      row(page, faisal).getByRole("button", { name: t("common.moreFor", { name: faisal }) }),
    ).toBeVisible();
    await expect(
      row(page, jerom).getByRole("button", { name: t("common.moreFor", { name: jerom }) }),
      "the manager was offered the admin's account",
    ).toHaveCount(0);
    await expect(
      row(page, me).getByRole("button", { name: t("common.moreFor", { name: me }) }),
      "the manager was offered his own account",
    ).toHaveCount(0);
  });

  await test.step("and nobody's eyes but his own — View as is the admin's", async () => {
    await expect(page.getByRole("button", { name: t("viewAs.start") })).toHaveCount(0);
  });

  await test.step("the role picker offers the three below him and neither above", async () => {
    await page.getByRole("button", { name: t("admin.addUser") }).click();
    const form = page.getByRole("dialog", { name: t("admin.addUser") });
    await form.getByRole("combobox", { name: t("common.role") }).click();
    const offered = (await page.getByRole("option").allInnerTexts()).map((label) => label.trim());
    expect(offered).toContain(t("common.rep"));
    expect(offered).toContain(t("common.marketing"));
    expect(offered).toContain(t("common.coordinator"));
    expect(offered, "a manager was offered the admin role").not.toContain(t("common.admin"));
    expect(offered, "a manager was offered his own role").not.toContain(t("common.manager"));
    // Chosen rather than escaped, so the popup closes and the dialog stays.
    await page.getByRole("option", { name: t("common.rep"), exact: true }).click();
    await form.getByRole("button", { name: t("common.cancel") }).click();
  });

  await test.step("and a rep's password is his to reset", async () => {
    const before = await one<{ password_hash: string }>(
      "select password_hash from users where email = 'faisal@technopanel.com.sa'",
    );
    await fromRowMenu(page, t, faisal, t("admin.resetPassword"));
    const ask = page.getByRole("dialog", { name: t("admin.resetPasswordTitle", { name: faisal }) });
    await ask.getByLabel(t("admin.newPassword")).fill(password);
    await ask.getByRole("button", { name: t("admin.resetPassword") }).click();
    await expect(page.getByText(t("admin.passwordReset", { name: faisal }))).toBeVisible(COLD);

    const after = await one<{ password_hash: string }>(
      "select password_hash from users where email = 'faisal@technopanel.com.sa'",
    );
    expect(after.password_hash).not.toBe(before.password_hash);

    // Back to the seed's own password: every other spec signs in with it.
    await query("update users set password_hash = $1::text where email = $2::text", [
      before.password_hash,
      "faisal@technopanel.com.sa",
    ]);
  });
});

test("an account that became a manager while the screen was open is refused at the write", async ({
  page,
  locale,
  t,
}) => {
  // Its own account, so no seeded person is disturbed if this walk falls over.
  const email = `office.${locale}@technopanel.com.sa`;
  const person = `Nawaf Office ${locale.toUpperCase()}`;
  await query("delete from users where email = $1::text", [email]);
  await query(
    `insert into users (name, email, role, password_hash, active)
     values ($1::text, $2::text, 'rep', 'not-a-real-hash', true)`,
    [person, email],
  );

  try {
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/admin/users`);
    await expect(row(page, person)).toBeVisible(COLD);

    await fromRowMenu(page, t, person, t("admin.resetPassword"));
    const ask = page.getByRole("dialog", { name: t("admin.resetPasswordTitle", { name: person }) });
    await ask.getByLabel(t("admin.newPassword")).fill("office-race-password");

    // The screen was right when it was drawn and is wrong now. The action reads
    // the row it is about to write, holds it, and answers the sentence §4 gives
    // it — never the screen's stale idea of whose account this is.
    await query("update users set role = 'manager' where email = $1::text", [email]);

    await ask.getByRole("button", { name: t("admin.resetPassword") }).click();
    await expect(ask.getByRole("alert")).toHaveText(t("admin.accountIsAdmins"), COLD);

    const still = await one<{ password_hash: string }>(
      "select password_hash from users where email = $1::text",
      [email],
    );
    expect(still.password_hash, "the refused reset wrote anyway").toBe("not-a-real-hash");
  } finally {
    await query("delete from users where email = $1::text", [email]);
  }
});

test("a fortnight off is one entry with its dates and its length, and the days are inside it", async ({
  page,
  locale,
  t,
}) => {
  const note = `Office spec ${locale.toUpperCase()}`;
  const sunday = chosenWeek();
  const faisalId = await userId("faisal@technopanel.com.sa");
  const faisal = await personName("faisal@technopanel.com.sa", locale);

  // Sunday, Monday — Tuesday is a company holiday and carries no leave row —
  // Wednesday, Thursday, and then the Sunday after the weekend. Five rows that
  // are one stretch: nothing workable stands between any two of them.
  const leaveDays = [0, 1, 3, 4, 7].map((offset) => addDays(sunday, offset));
  const holiday = addDays(sunday, 2);

  await plantDays(note, holiday, null);
  for (const day of leaveDays) await plantDays(note, day, faisalId);

  try {
    await login(page, locale, "jerom");
    await page.goto(`/${locale}/admin/holidays`);
    await expect(page.getByRole("heading", { name: t("common.holidays") })).toBeVisible(COLD);

    await test.step("five rows read as one entry, dated and priced in working days", async () => {
      const leave = entry(page, note, faisal);
      await expect(leave).toHaveAttribute("data-kind", "leave");
      await expect(leave, "the span did not read as one entry").toHaveAttribute("data-days", "5");

      const dates = leave.locator('[data-slot="day"]');
      await expect(dates.first()).toHaveText(formatDay(sunday, locale));
      await expect(dates.nth(1)).toHaveText(formatDay(addDays(sunday, 7), locale));

      // Five days off, and every one of them a day he would otherwise have
      // worked: the weekend and the company holiday are not among them.
      await expect(leave).toContainText(t("admin.workingDaysOff", { count: 5 }));
    });

    await test.step("and the days are one press away", async () => {
      const leave = entry(page, note, faisal);
      const open = leave.getByRole("button", { name: t("admin.daysInside", { count: 5 }) });
      await expect(open).toHaveAttribute("aria-expanded", "false");
      await open.click();
      const days = leave.locator('[data-slot="period-days"] > li');
      await expect(days).toHaveCount(5);
      await expect(days.first()).toHaveAttribute("data-day", sunday);
      await expect(days.last()).toHaveAttribute("data-day", addDays(sunday, 7));
    });

    await test.step("a single day inside it still goes on its own", async () => {
      const leave = entry(page, note, faisal);
      const last = addDays(sunday, 7);
      // The day's own control names the day it takes off, so it is never the
      // entry's Remove by another name.
      await leave
        .locator(`[data-slot="period-days"] > li[data-day="${last}"]`)
        .getByRole("button", {
          name: t("admin.removeDayTitle", { date: formatDay(last, locale) }),
        })
        .click();
      const ask = page.getByRole("dialog", {
        name: t("admin.removeDayTitle", { date: formatDay(last, locale) }),
      });
      await ask.getByRole("button", { name: t("admin.removeDay"), exact: true }).click();
      await expect(page.getByText(t("admin.dayRemoved", { date: formatDay(last, locale) }))).toBeVisible(COLD);

      const left = await query("select 1 from non_working_days where day = $1::date and user_id = $2::uuid", [
        last,
        faisalId,
      ]);
      expect(left.length).toBe(0);

      // What is left is the four days before the weekend, still one entry.
      await expect(entry(page, note, faisal)).toHaveAttribute("data-days", "4", COLD);
    });

    await test.step("and removing the entry removes the whole span", async () => {
      const leave = entry(page, note, faisal);
      await leave
        .locator('[data-slot="period-actions"]')
        .getByRole("button", { name: t("admin.removeDay"), exact: true })
        .click();
      const ask = page.getByRole("dialog", { name: t("admin.removePeriodTitle") });
      await ask.getByRole("button", { name: t("admin.removeDay"), exact: true }).click();
      await expect(page.getByText(t("admin.periodRemoved", { count: 4 }))).toBeVisible(COLD);

      const left = await query(
        "select 1 from non_working_days where user_id = $1::uuid and note = $2::text",
        [faisalId, note],
      );
      expect(left.length, "removing the entry left days behind").toBe(0);
    });
  } finally {
    await query("delete from non_working_days where note = $1::text", [note]);
  }
});

test("the month strip says which days the office is shut and who is away", async ({
  page,
  locale,
  t,
}) => {
  const note = `Office strip ${locale.toUpperCase()}`;
  const sunday = chosenWeek();
  const month = sunday.slice(0, 7);
  const faisalId = await userId("faisal@technopanel.com.sa");

  await plantDays(note, addDays(sunday, 2), null);
  await plantDays(note, sunday, faisalId);

  try {
    await login(page, locale, "jerom");
    // The month is in the address, so a link lands on the month its sender read.
    await page.goto(`/${locale}/admin/holidays?month=${month}`);
    const strip = page.locator('[data-slot="holidays-month"]');
    await expect(strip).toBeVisible(COLD);

    await expect(strip.locator(`[data-day="${addDays(sunday, 2)}"]`)).toHaveAttribute("data-shut", "true");
    await expect(strip.locator(`[data-day="${sunday}"]`)).toHaveAttribute("data-away", /^[1-9]/);
    // A day with nothing on it is marked with nothing.
    await expect(strip.locator(`[data-day="${addDays(sunday, 1)}"]`)).not.toHaveAttribute("data-shut", "true");
    await expect(strip.locator('[data-slot="month-legend"]')).toHaveText(t("admin.monthLegend"));

    // And the sales manager reads the same strip.
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/admin/holidays?month=${month}`);
    await expect(
      page.locator(`[data-slot="holidays-month"] [data-day="${addDays(sunday, 2)}"]`),
    ).toHaveAttribute("data-shut", "true", COLD);
  } finally {
    await query("delete from non_working_days where note = $1::text", [note]);
  }
});

/** One day on the calendar, planted by this spec and taken out again after it. */
async function plantDays(note: string, day: Day, userId: string | null): Promise<void> {
  await query(
    `insert into non_working_days (day, kind, user_id, note)
     values ($1::date, $2, $3::uuid, $4::text)
     on conflict do nothing`,
    [day, userId ? "leave" : "holiday", userId, note],
  );
}

/** One of a row's menu items: the row keeps its frequent action in sight and the rest here. */
async function fromRowMenu(page: Page, t: Translate, name: string, item: string) {
  await row(page, name).getByRole("button", { name: t("common.moreFor", { name }) }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}
