import { addMonths, firstOfMonth, formatMonth, todayRiyadh } from "@/lib/dates";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P13-S10 — targets are the current month only (SPEC §3 P13: "no navigation
 * across months, editable only where the admin sets it, history read-only").
 *
 * Three things, each where it lands rather than where it was typed:
 *
 * a. The admin's screen is this Riyadh month and nothing moves it — no Back,
 *    no Next, and a `?month=` from an old link is ignored — and a box saved
 *    there is this month's row in the database.
 * b. The months before it are a table somebody reads: newest first, a dash
 *    where a person had no figure, a column for somebody who no longer carries
 *    metres, and not one control inside it.
 * c. The action refuses a month that is not this one, however the form got
 *    there. The form is posted by the screen itself with its month rewritten on
 *    the wire — which is exactly what a bookmarked tab from last month, or a
 *    hand-made request, sends.
 *
 * Both locale projects read one seeded database (playwright.config.ts:
 * `workers: 1`), so every write is taken back in a `finally`.
 */

const COLD = { timeout: 30_000 };
const SAAD = "saad@technopanel.com.sa";
const RAWAN = "rawan@technopanel.com.sa";

/** A target row as it stands, or null — for putting it back exactly. */
async function targetOf(user: string, month: string): Promise<string | null> {
  const rows = await query<{ sqm: string }>(
    "select sqm::text as sqm from targets where user_id = $1::uuid and month = $2::date",
    [user, month],
  );
  return rows[0]?.sqm ?? null;
}

async function putBack(user: string, month: string, sqm: string | null): Promise<void> {
  if (sqm === null) {
    await query("delete from targets where user_id = $1::uuid and month = $2::date", [user, month]);
    return;
  }
  await query(
    `insert into targets (user_id, month, sqm) values ($1::uuid, $2::date, $3::numeric)
     on conflict (user_id, month) do update set sqm = excluded.sqm`,
    [user, month, sqm],
  );
}

test("the admin's targets are this month's: no month to move to, and a box saves to this month", async ({
  page,
  locale,
  t,
}) => {
  const saad = await userId(SAAD);
  const name = await personName(SAAD, locale);
  const thisMonth = firstOfMonth(todayRiyadh());
  const lastMonth = addMonths(thisMonth, -1);
  const before = { now: await targetOf(saad, thisMonth), last: await targetOf(saad, lastMonth) };
  // A figure nobody seeded, so the row read back can only have come from here.
  const typed = "1750";

  try {
    await login(page, locale, "jerom");
    // The address an old link would carry. It is not obeyed.
    await page.goto(`/${locale}/admin/targets?month=${lastMonth}`);
    await expect(page.getByRole("heading", { name: t("common.targets") })).toBeVisible(COLD);
    await expect(page.locator('[data-slot="targets-month"]')).toHaveText(
      formatMonth(thisMonth, locale),
    );

    await test.step("nothing on the screen goes to another month", async () => {
      const main = page.getByRole("main");
      // Every button on it belongs to a box — its Save, or its Keep it — but
      // the one that hands the screen over as a file, which asks for this month
      // because this screen is this month (P14 14.10). Nothing is a link: the
      // Back and Next that sat above the boxes are gone.
      await expect(
        main.locator('button:not(form button):not([data-slot="export"])'),
      ).toHaveCount(0);
      await expect(main.getByRole("link")).toHaveCount(0);
    });

    await test.step("a box saved is this month's row", async () => {
      const box = page.getByLabel(name, { exact: true });
      await box.fill(typed);
      await page
        .locator("form")
        .filter({ has: box })
        .getByRole("button", { name: t("common.save") })
        .click();
      await expect(page.getByText(t("admin.targetSaved"))).toBeVisible(COLD);

      expect(Number(await targetOf(saad, thisMonth))).toBe(Number(typed));
      // And the month in the address was not touched.
      expect(await targetOf(saad, lastMonth)).toBe(before.last);
    });
  } finally {
    await putBack(saad, thisMonth, before.now);
  }
});

test("the earlier months are read, not set: newest first, a dash where a person had none, nothing to press", async ({
  page,
  locale,
  t,
}) => {
  const thisMonth = firstOfMonth(todayRiyadh());

  // What the screen should list, asked of the tables the way the screen asks:
  // every earlier month that has any target, newest first, twelve at most.
  const months = (
    await query<{ month: string }>(
      `select to_char(m, 'YYYY-MM-DD') as month from (
         select month as m from targets where month < $1::date
         union
         select month from company_targets where month < $1::date
       ) set_months
       order by m desc
       limit 12`,
      [thisMonth],
    )
  ).map((row) => row.month);
  expect(months.length, "the seed gives no earlier month a target").toBeGreaterThanOrEqual(3);

  // Somebody with a column (a target in one of those months) and a month he had none.
  const gap = await one<{ email: string; month: string }>(
    `with shown as (select unnest($1::date[]) as m),
          people as (select distinct user_id from targets where month in (select m from shown))
     select users.email, to_char(shown.m, 'YYYY-MM-DD') as month
       from people
       join users on users.id = people.user_id
      cross join shown
      where not exists (select 1 from targets
                         where targets.user_id = people.user_id and targets.month = shown.m)
      order by shown.m desc, users.email
      limit 1`,
    [months],
  );
  const gapName = await personName(gap.email, locale);

  // And somebody who has left: a column in the history, no box above it.
  const left = await one<{ email: string }>(
    `select users.email from users
      where users.active = false
        and exists (select 1 from targets
                     where targets.user_id = users.id and targets.month = any($1::date[]))
      order by users.email
      limit 1`,
    [months],
  );
  const leftName = await personName(left.email, locale);

  await login(page, locale, "jerom");
  await page.goto(`/${locale}/admin/targets`);
  await expect(page.getByRole("heading", { name: t("admin.earlierMonths") })).toBeVisible(COLD);

  const earlier = page.getByRole("region", { name: t("admin.earlierMonths") });
  await expect(earlier).toBeVisible();

  await test.step("one row a month, newest first", async () => {
    await expect(earlier.locator("tbody th[scope='row']")).toHaveText(
      months.map((month) => formatMonth(month, locale)),
    );
  });

  await test.step("nothing inside it can be typed in or pressed", async () => {
    await expect(earlier.getByRole("textbox")).toHaveCount(0);
    await expect(earlier.getByRole("spinbutton")).toHaveCount(0);
    await expect(earlier.getByRole("button")).toHaveCount(0);
    await expect(earlier.getByRole("link")).toHaveCount(0);
    await expect(earlier.locator("input, select, textarea, [contenteditable]")).toHaveCount(0);
  });

  await test.step("a dash where somebody had no target, said in words to a reader", async () => {
    const headings = await earlier.locator("thead th").allInnerTexts();
    const column = headings.findIndex((heading) => heading.trim().endsWith(gapName));
    expect(column, `${gapName} has no column`).toBeGreaterThan(1);
    const cell = earlier.locator(`tbody tr[data-earlier="${gap.month}"] > *`).nth(column);
    await expect(cell).toContainText("—");
    await expect(cell).toContainText(t("admin.noTarget"));
  });

  await test.step("somebody who has left keeps his column, and has no box this month", async () => {
    await expect(earlier.locator("thead th").filter({ hasText: leftName })).toHaveCount(1);
    await expect(page.getByLabel(leftName, { exact: true })).toHaveCount(0);
  });
});

test("a target for a month that is not this one is refused, however the form got there", async ({
  page,
  locale,
  t,
}) => {
  const rawan = await userId(RAWAN);
  const name = await personName(RAWAN, locale);
  const thisMonth = firstOfMonth(todayRiyadh());
  const lastMonth = addMonths(thisMonth, -1);
  const before = { now: await targetOf(rawan, thisMonth), last: await targetOf(rawan, lastMonth) };
  const audited = async () =>
    Number(
      (
        await one<{ n: string }>(
          "select count(*)::text as n from audit_log where action = 'target.set' and record_id = $1::text",
          [rawan],
        )
      ).n,
    );
  const auditedBefore = await audited();

  try {
    await login(page, locale, "jerom");
    await page.goto(`/${locale}/admin/targets`);
    await expect(page.getByRole("heading", { name: t("common.targets") })).toBeVisible(COLD);

    // The screen's own Save, with last month written into the form on the way
    // out: every server action is a POST carrying the Next-Action header
    // (tests/unhappy.spec.ts), and only that request is touched.
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        const body = request.postData() ?? "";
        return route.continue({ postData: body.split(thisMonth).join(lastMonth) });
      }
      return route.continue();
    });

    const box = page.getByLabel(name, { exact: true });
    await box.fill("777");
    const form = page.locator("form").filter({ has: box });
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(form.getByRole("alert")).toHaveText(t("admin.targetMonthClosed"), COLD);
    await page.unroute("**/*");

    expect(await targetOf(rawan, lastMonth), "a closed month was rewritten").toBe(before.last);
    expect(await targetOf(rawan, thisMonth)).toBe(before.now);
    expect(await audited(), "a refused target left an audit row").toBe(auditedBefore);
  } finally {
    await page.unroute("**/*");
    await putBack(rawan, lastMonth, before.last);
    await putBack(rawan, thisMonth, before.now);
  }
});
