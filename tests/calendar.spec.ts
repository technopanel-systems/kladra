import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { formatDay, type Day } from "@/lib/dates";
import { quotationLabel } from "@/lib/labels";
import { waitedSince } from "@/lib/waiting";
import { isWeekend, workingDaysBetween, type NonWorking } from "@/lib/workdays";

/**
 * The calendar read back to where a wait actually started (SPEC D97, findings
 * 26/30/32).
 *
 * Two places used to read the non-working-day table on a fixed window instead
 * of the one that matters — the manager's stuck list from the first of THIS
 * month, the coordinator's queue from a flat sixty days back — so a request
 * old enough to cross a holiday before either window opened aged that holiday
 * as a working day. Both now read back to the day the OLDEST waiting row was
 * raised, which is the one day that is actually the start of every count on
 * the screen (`src/lib/team.ts` `stuckList`, `queue/page.tsx`). The seed's
 * only two requested quotations are both a few days old, so the test ages the
 * oldest of them itself, by SQL, rather than waiting for the seed to grow one.
 *
 * The second test is D97's other half: the lane of what Kladra recorded beside
 * a person's reports carries what that person can move, and nothing else. It
 * used to hold marketing's lane empty, because marketing raised no paper (D50);
 * SPEC §3 P13 made marketing a rep in everything (P13-S5), so its lane now
 * carries the load it raised exactly as a rep's carries his quotation — and the
 * manager, drilling in, reads the same lane.
 */

const COLD = { timeout: 30_000 };

/** Riyadh's today, computed independently of the app (tests/admin.spec.ts). */
function todayRiyadh(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/**
 * A weekday between today−44 and today−36 that predates the first of this
 * month whenever the first falls inside that window — which it always does, a
 * month never being longer than the gap between the two windows. Before the
 * first is the exact case the old code missed: it never looked further back
 * than that day, so a holiday sitting earlier than it was never read at all.
 */
function pickHolidayDay(today: Day): Day {
  const monthStart = today.slice(0, 8) + "01";
  const monthStartIsRecent = monthStart >= addDays(today, -36);
  const from = addDays(today, -44);
  const to = addDays(today, -36);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (isWeekend(d)) continue;
    if (monthStartIsRecent && d >= monthStart) continue;
    return d;
  }
  throw new Error("calendar.spec: no weekday between today-44 and today-36 predates this month");
}

/** The Longest-wait tile of the strip on her queue (src/components/ui-ext/standing-strip.tsx). */
function longestWaitTile(page: Page, t: Translate): Locator {
  return page
    .locator('[data-slot="standing"]')
    .first()
    .locator("> div")
    .filter({ hasText: t("queue.longestWait") });
}

test("a holiday before the first of the month is a day off on both desks", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const today = todayRiyadh();
  const raisedDay = addDays(today, -45);

  // The queue's oldest row: the oldest requested quotation whose company is
  // not archived. Picked by SQL rather than named, so the test still means
  // something once the seed's two requested quotations are not the only ones.
  const target = await one<{ id: string; number: number; revision: number; created_at: Date }>(
    `select q.id, q.number, q.revision, q.created_at
       from quotations q
       join companies c on c.id = q.company_id
      where q.status = 'requested' and c.archived_at is null
      order by q.created_at asc
      limit 1`,
  );

  const holidayDay = pickHolidayDay(today);

  try {
    // Aged to forty-five days ago, well past both of the windows the old code
    // read from (this month's first, and sixty flat days) — old enough that
    // only the D97 fix reads the holiday below at all.
    await query(
      // Both instants: a wait is counted from the day a paper landed on the
      // desk (`desk_since`), which for a request never sent back is the day it
      // was raised — the seed writes the two the same, and so does this.
      `update quotations
          set created_at = (($1::date - 45)::text || ' 09:00')::timestamp at time zone 'Asia/Riyadh',
              desk_since = (($1::date - 45)::text || ' 09:00')::timestamp at time zone 'Asia/Riyadh'
        where id = $2::uuid`,
      [today, target.id],
    );

    const holiday = await one<{ id: number }>(
      `insert into non_working_days (day, kind, user_id, note)
       values ($1::date, 'holiday', null, 'calendar.spec')
       returning id`,
      [holidayDay],
    );

    try {
      // Every company holiday between the day it was raised and today — read
      // from the table rather than assumed empty, because the seed may carry
      // others of its own.
      const rows = await query<{ day: Day }>(
        `select to_char(day, 'YYYY-MM-DD') as day from non_working_days
          where user_id is null and day between $1::date and $2::date`,
        [raisedDay, today],
      );
      const nonWorking: NonWorking[] = rows.map((row) => ({ day: row.day, userId: null }));
      const expected = workingDaysBetween(raisedDay, today, nonWorking);

      // The holiday actually landed inside the count — otherwise the rest of
      // this test would pass whether or not the fix exists.
      expect(
        expected,
        "the inserted holiday was not counted off — the window did not reach it",
      ).toBeLessThan(workingDaysBetween(raisedDay, today, []));

      const label = quotationLabel(target.number, target.revision);

      await test.step("the manager's stuck list ages it from the day it was raised, not the first of the month", async () => {
        await login(page, locale, "abdulrahman");
        await page.goto(`/${locale}/team`);
        await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);

        // Oldest first and the cap is twenty (STUCK_SHOWN, list-size.ts): aged
        // to forty-five days back, this row is the oldest on the desk and
        // always inside that cap.
        const row = page.getByRole("link", { name: label }).first();
        await expect(row, `no stuck row named ${label}`).toBeVisible(COLD);
        // Three spans on the row (src/components/team/stuck-rows.tsx) — label,
        // who, and the note last — and a request row carries no date, so the
        // last span is the note text and nothing else.
        await expect(row.locator("span").last()).toHaveText(
          t("team.waitingDays", { count: expected }),
        );
      });

      await test.step("the coordinator's longest wait ages the same row the same way", async () => {
        await login(page, locale, "rawan");
        await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);

        const longest = longestWaitTile(page, t);
        await expect(longest.locator('[data-slot="figure-caption"]')).toHaveText(
          t("queue.since", { day: formatDay(raisedDay, locale) }),
          COLD,
        );
        await expect(longest.locator("dd").first()).toHaveText(
          t("queue.workingDays", { days: waitedSince(raisedDay, today, nonWorking).days }),
        );
      });
    } finally {
      await query("delete from non_working_days where id = $1::int", [holiday.id]);
    }
  } finally {
    await query("update quotations set created_at = $1, desk_since = $1 where id = $2::uuid", [
      target.created_at,
      target.id,
    ]);
  }
});

test("marketing's recorded lane carries the load it raised, as a rep's does, and the manager reads the same lane", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // A day on which each of them raised something, read from the records rather
  // than from the seed's calendar: the FIRST day marketing raised a load (the
  // seed's — a spec that raises one today and removes it again cannot move
  // it), and the newest day Faisal raised a quotation.
  const marketing = await one<{ id: string; day: Day }>(
    `select users.id, to_char(min((dispatches.created_at at time zone 'Asia/Riyadh')::date), 'YYYY-MM-DD') as day
       from users
       join dispatches on dispatches.rep_id = users.id
      where users.email = 'marketing@technopanel.com.sa'
      group by users.id`,
  );
  const faisal = await one<{ day: Day }>(
    `select to_char(max((quotations.created_at at time zone 'Asia/Riyadh')::date), 'YYYY-MM-DD') as day
       from quotations
       join users on users.id = quotations.rep_id
      where users.email = 'faisal@technopanel.com.sa'`,
  );

  const lane = () => page.getByRole("complementary", { name: t("reports.recorded") }).first();

  await test.step("marketing's own lane carries the load it raised (SPEC §3 P13)", async () => {
    await login(page, locale, "marketing");
    await page.goto(`/${locale}/reports?day=${marketing.day}`);
    await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);

    await expect(lane()).toBeVisible(COLD);
    await expect(lane().locator('[data-figure="dispatchRequests"]')).toHaveCount(1, COLD);
    await expect(lane().getByText(t("reports.recordedNothing"))).toHaveCount(0);
  });

  await test.step("the manager, drilling into marketing, reads the same lane", async () => {
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/reports?person=${marketing.id}&day=${marketing.day}`);
    await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);
    await expect(lane()).toBeVisible(COLD);
    await expect(lane().locator('[data-figure="dispatchRequests"]')).toHaveCount(1, COLD);
  });

  await test.step("and a rep's lane carries the quotation he raised", async () => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/reports?day=${faisal.day}`);
    await expect(page.getByRole("heading", { name: t("reports.title"), exact: true })).toBeVisible(COLD);
    await expect(lane().locator('[data-figure="quotationRequests"]')).toHaveCount(1, COLD);
  });
});
