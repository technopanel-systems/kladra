import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { todayRiyadh, type Day } from "@/lib/dates";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { LATE_AFTER_WORKING_DAYS } from "@/lib/waiting";
import { workingDaysBetween, type NonWorking } from "@/lib/workdays";

/**
 * P14 14B — what is waiting on the coordinator is on the manager's screen from
 * the morning it is raised (SPEC §3, P14).
 *
 * It was not. A request was dropped from his awaiting list until it had sat for
 * two working days, which is the line the coordinator's own queue calls late —
 * and on a desk that is cleared the same day, that is an empty group under a
 * heading promising the opposite. The founder's answer after a third round of
 * use: the delay hides exactly what he opens the screen for.
 *
 * Two things are proved here, because the fix is only half about showing more.
 * Everything on her desk is on the list, from today; and the two-day line still
 * exists, in the one place it means anything — what is coloured, and what
 * counts against a person. A red dot on every morning with a request in it is a
 * dot that says nothing (DESIGN §1b).
 *
 * Both halves of the desk, too: a load waiting to be approved is a request
 * waiting on the coordinator in the founder's own words, and it appeared on no
 * screen of his.
 */

const COLD = { timeout: 30_000 };

/** Company holidays in a window, read rather than assumed (the seed has its own). */
async function companyHolidays(from: Day, to: Day): Promise<NonWorking[]> {
  const rows = await query<{ day: Day }>(
    `select to_char(day, 'YYYY-MM-DD') as day from non_working_days
      where user_id is null and day between $1::date and $2::date`,
    [from, to],
  );
  return rows.map((row) => ({ day: row.day, userId: null }));
}

/**
 * Her desk as both screens define it: a quotation still `requested` and a load
 * still `submitted`, on a customer nobody has archived (src/lib/team.ts,
 * src/app/[locale]/(app)/queue/page.tsx).
 */
async function desk(): Promise<{ label: string; since: Day }[]> {
  const quotations = await query<{ number: number; revision: number; since: Day }>(
    `select q.number, q.revision,
            to_char((q.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as since
       from quotations q
       join companies c on c.id = q.company_id
      where q.status = 'requested' and c.archived_at is null`,
  );
  const dispatches = await query<{ number: number; since: Day }>(
    `select d.number,
            to_char((d.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as since
       from dispatches d
       join companies c on c.id = d.company_id
      where d.status = 'submitted' and c.archived_at is null`,
  );
  return [
    ...quotations.map((row) => ({
      label: quotationLabel(row.number, row.revision),
      since: row.since,
    })),
    ...dispatches.map((row) => ({ label: dispatchLabel(row.number), since: row.since })),
  ];
}

test("a request is on the manager's awaiting list the morning it is raised", async ({
  page,
  locale,
  t,
}) => {
  const quotation = await one<{ id: string; number: number; revision: number; before: string }>(
    `select q.id, q.number, q.revision, q.created_at::text as before
       from quotations q
       join companies c on c.id = q.company_id
      where q.status = 'requested' and c.archived_at is null
      order by q.created_at
      limit 1`,
  );
  const dispatch = await one<{ id: string; number: number; before: string }>(
    `select d.id, d.number, d.created_at::text as before
       from dispatches d
       join companies c on c.id = d.company_id
      where d.status = 'submitted' and c.archived_at is null
      order by d.created_at
      limit 1`,
  );

  // Raised this minute, which is the case that used to be invisible. Both
  // halves of the desk, because both are "a request waiting on the
  // coordinator".
  await query("update quotations set created_at = now() where id = $1::uuid", [quotation.id]);
  await query("update dispatches set created_at = now() where id = $1::uuid", [dispatch.id]);

  try {
    // Twenty rows are drawn (STUCK_SHOWN) and a real desk holds a handful, so
    // the two raised above are on the card and not behind its "and N more".
    expect(
      (await desk()).length,
      "more requests are waiting than the card draws; this test cannot see the new ones",
    ).toBeLessThanOrEqual(20);

    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/team?tab=work`);
    await expect(page.getByRole("heading", { name: t("team.stuck") })).toBeVisible(COLD);

    const card = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: t("team.stuckRequests") }) })
      .last();
    await expect(card).toBeVisible();

    // "today" — the same words the row wears on any other morning, with the
    // count at nought (team.waitingDays).
    const fresh = t("team.waitingDays", { count: 0 });
    const rowFor = (label: string) =>
      card
        .getByRole("link")
        .filter({ has: page.getByText(label, { exact: true }) })
        .first();

    for (const label of [
      quotationLabel(quotation.number, quotation.revision),
      dispatchLabel(dispatch.number),
    ]) {
      const row = rowFor(label);
      await expect(row, `${label} is not on the awaiting list the day it was raised`).toBeVisible();
      await expect(row).toContainText(fresh);
    }

    // And each row goes where its own paper lives, not both to the quotations.
    await expect(rowFor(dispatchLabel(dispatch.number))).toHaveAttribute(
      "href",
      /\/dispatches\?open=/,
    );
  } finally {
    await query("update quotations set created_at = $1::timestamptz where id = $2::uuid", [
      quotation.before,
      quotation.id,
    ]);
    await query("update dispatches set created_at = $1::timestamptz where id = $2::uuid", [
      dispatch.before,
      dispatch.id,
    ]);
  }
});

test("the awaiting figure is the whole desk, and only the late part is red", async ({
  page,
  locale,
  t,
}) => {
  // Two reads of the holiday table and a sign-in before the screen is asked
  // for anything, on a machine that is also running the dev server.
  test.slow();

  const today = todayRiyadh();
  const waiting = await desk();
  const oldest = waiting.reduce<Day>(
    (soonest, row) => (row.since < soonest ? row.since : soonest),
    today,
  );
  const nonWorking = await companyHolidays(oldest, today);
  const late = waiting.filter(
    (row) => workingDaysBetween(row.since, today, nonWorking) > LATE_AFTER_WORKING_DAYS,
  ).length;

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=work`);
  await expect(page.getByRole("heading", { name: t("team.stuck") })).toBeVisible(COLD);

  // The figure over the list is everything on the desk, and its caption says
  // how much of that is past the line (D59).
  const figure = page
    .locator("[data-slot='standing'] > div")
    .filter({ hasText: t("team.stuckRequests") })
    .first();
  await expect(figure.locator("dd").first()).toHaveText(String(waiting.length));
  await expect(figure.locator("[data-slot='figure-caption']")).toHaveText(
    t("team.stuckRequestsMeans", { days: LATE_AFTER_WORKING_DAYS, late }),
  );

  if (waiting.length > 0) {
    // The card's dot: red where something on it is actually late, amber where
    // the desk is simply busy.
    const card = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: t("team.stuckRequests") }) })
      .last();
    await expect(card.locator("[data-slot='title-dot']").first()).toHaveAttribute(
      "data-tone-dot",
      late > 0 ? "bad" : "wait",
    );
  }
});
