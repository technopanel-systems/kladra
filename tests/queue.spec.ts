import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { query } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { addDays, formatDay, todayRiyadh, type Day } from "@/lib/dates";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { LIST_LIMIT } from "@/lib/list-size";
import { waitedSince } from "@/lib/waiting";
import type { NonWorking } from "@/lib/workdays";

/**
 * The coordinator's longest wait, read from the desk rather than about it
 * (SPEC D95, finding 24).
 *
 * It used to come from a second query that never asked whether the company was
 * archived, so it could name a request neither list on the screen showed — a
 * caption over a list that comes from somewhere other than the list's own rows
 * (rules/data.md). It is now read from the same rows `listQuotations` and
 * `listDispatches` hand the two tables: requested quotations and submitted
 * dispatches, both already narrowed to companies that are not archived
 * (src/lib/quotations.ts, src/lib/dispatches.ts, `queue/page.tsx`'s `raised`).
 *
 * `oldestRaised` below asks the database that same question directly, so it
 * fails the moment the page's rule and this file's rule drift apart, and it
 * takes an `excludeCompanyId` for the second test's "what would the desk say
 * without this one" — one query, read twice.
 */

const COLD = { timeout: 30_000 };

/** One row of "requested" quotations union "submitted" dispatches, at a company
 *  that is not archived — the exact set the queue's two lists draw from. */
type RaisedRow = {
  kind: "quotation" | "dispatch";
  companyId: string;
  number: number | null;
  revision: number | null;
  dispatchNumber: number | null;
  day: Day;
};

/**
 * The single oldest waiting row on the desk, or null when nothing is waiting.
 *
 * Ordered on the timestamp rather than the day so a tie on one calendar day
 * still resolves to one row, deterministically. `excludeCompanyId`, when
 * given, leaves that company's rows out of both halves — what test 2 needs to
 * ask what the desk would say with one company gone from it.
 */
async function oldestRaised(excludeCompanyId?: string): Promise<RaisedRow | null> {
  const rows = await query<RaisedRow>(
    `select kind, "companyId", number, revision, "dispatchNumber", day from (
       select 'quotation' as kind, c.id as "companyId",
              q.number as number, q.revision as revision, null::int as "dispatchNumber",
              q.created_at as created_at,
              to_char((q.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as day
         from quotations q
         join companies c on c.id = q.company_id
        where q.status = 'requested' and c.archived_at is null
          and ($1::uuid is null or c.id <> $1::uuid)
       union all
       select 'dispatch' as kind, c.id as "companyId",
              null::int as number, null::int as revision, d.number as "dispatchNumber",
              d.created_at as created_at,
              to_char((d.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as day
         from dispatches d
         join quotations q on q.id = d.quotation_id
         join companies c on c.id = q.company_id
        where d.status = 'submitted' and c.archived_at is null
          and ($1::uuid is null or c.id <> $1::uuid)
     ) raised
     order by created_at asc
     limit 1`,
    [excludeCompanyId ?? null],
  );
  return rows[0] ?? null;
}

/** Q-1, or D-3 — whichever kind the row is (src/lib/labels.ts). */
function labelOf(row: RaisedRow): string {
  return row.kind === "quotation"
    ? quotationLabel(row.number as number, row.revision as number)
    : dispatchLabel(row.dispatchNumber as number);
}

/** Every holiday and every person's leave in the sixty-day window the queue
 *  itself reads (`queue/page.tsx`), shaped the way src/lib/workdays.ts wants it. */
async function nonWorkingWindow(today: Day): Promise<NonWorking[]> {
  return query<NonWorking>(
    `select to_char(day, 'YYYY-MM-DD') as day, user_id as "userId"
       from non_working_days
      where day between $1::date and $2::date`,
    [addDays(today, -60), today],
  );
}

/** One tile of the strip on her queue, by its own label (src/components/ui-ext/standing-strip.tsx). */
function figureTile(page: Page, label: string): Locator {
  return page.locator('[data-slot="standing"]').first().locator("> div").filter({ hasText: label });
}

/** The Longest-wait tile of the strip on her queue. */
function longestWaitTile(page: Page, t: Translate): Locator {
  return figureTile(page, t("queue.longestWait"));
}

/** One of the two sections the queue draws its lists in, by its own heading —
 *  "in neither list" means neither of these (`queue/page.tsx`). */
function listSection(page: Page, heading: string): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });
}

test("the longest wait is the oldest row on the desk, counted in working days", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const today = todayRiyadh();
  const oldest = await oldestRaised();
  expect(oldest, "nothing is waiting on the seeded queue").not.toBeNull();
  const nonWorking = await nonWorkingWindow(today);
  const expected = waitedSince(oldest!.day, today, nonWorking);

  await login(page, locale, "rawan");
  await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);

  const longest = longestWaitTile(page, t);

  await test.step("its caption names the day the oldest row arrived", async () => {
    await expect(longest.locator('[data-slot="figure-caption"]')).toHaveText(
      t("queue.since", { day: formatDay(oldest!.day, locale) }),
      COLD,
    );
  });

  await test.step("and its value is that day's wait, in working days", async () => {
    await expect(longest.locator("dd").first()).toHaveText(
      t("queue.workingDays", { days: expected.days }),
    );
  });
});

test("archiving the oldest request's company moves the wait to the next one, rather than leaving a wait over a desk that does not hold it", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const today = todayRiyadh();
  const nonWorking = await nonWorkingWindow(today);

  const oldest = await oldestRaised();
  expect(oldest, "nothing is waiting on the seeded queue").not.toBeNull();
  const label = labelOf(oldest!);
  // What the desk would say with this one company's rows gone from it —
  // computed BEFORE the archive, from the rows as they stand now.
  const next = await oldestRaised(oldest!.companyId);

  try {
    await query(
      "update companies set archived_at = now(), archive_reason = 'queue.spec' where id = $1::uuid",
      [oldest!.companyId],
    );

    await login(page, locale, "rawan");
    await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);

    await test.step("its row is in neither list", async () => {
      const quotationsList = listSection(page, t("common.quotations"));
      const dispatchesList = listSection(page, t("common.dispatches"));
      await expect(quotationsList.getByText(label, { exact: true })).toHaveCount(0, COLD);
      await expect(dispatchesList.getByText(label, { exact: true })).toHaveCount(0);
    });

    const longest = longestWaitTile(page, t);

    if (next) {
      const expected = waitedSince(next.day, today, nonWorking);
      await test.step("the wait moved to the next-oldest row still on the desk", async () => {
        await expect(longest.locator('[data-slot="figure-caption"]')).toHaveText(
          t("queue.since", { day: formatDay(next.day, locale) }),
        );
        await expect(longest.locator("dd").first()).toHaveText(
          t("queue.workingDays", { days: expected.days }),
        );
      });
    } else {
      await test.step("nothing is left waiting, and the strip says so", async () => {
        await expect(longest.locator("dd").first()).toHaveText("—");
        await expect(longest.locator('[data-slot="figure-caption"]')).toHaveText(
          t("queue.nothingWaiting"),
        );
      });
    }
  } finally {
    await query(
      "update companies set archived_at = null, archive_reason = null where id = $1::uuid",
      [oldest!.companyId],
    );
  }
});

test("her desk is in the order she works it: the longest wait is the first row", async ({
  page,
  locale,
  t,
}) => {
  const oldest = await oldestRaised();
  expect(oldest, "nothing is waiting on the seeded queue").not.toBeNull();
  expect(oldest!.kind, "the seeded desk has no waiting quotation to order").toBe("quotation");
  const label = quotationLabel(oldest!.number!, oldest!.revision!);

  await login(page, locale, "rawan");
  await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);

  // The screen has said "oldest first" since P8 and both lists came back newest
  // first, so the row she must answer next was the last one she read (D137).
  const section = listSection(page, t("common.quotations"));
  await expect(section.getByRole("row").nth(1).getByText(label, { exact: true })).toBeVisible(COLD);
});

test("one search box over both her lists, and it filters both", async ({ page, locale, t }) => {
  const raised = await query<{ company: string }>(
    `select c.name as company
       from quotations q
       join companies c on c.id = q.company_id
      where q.status = 'requested' and c.archived_at is null
      order by q.created_at
      limit 1`,
  );
  expect(raised.length, "nothing is waiting on the seeded queue").toBe(1);

  await login(page, locale, "rawan");
  await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);

  // Two tables meant two boxes: she typed the name twice, and the second box
  // sat empty over a list that was already filtered (D137).
  const boxes = page.getByRole("search");
  await expect(boxes).toHaveCount(1);

  await boxes.getByRole("searchbox").fill(raised[0].company);
  await expect(page).toHaveURL(/[?&]q=/, COLD);
  const quotations = listSection(page, t("common.quotations"));
  await expect(
    quotations.getByRole("row").filter({ hasText: raised[0].company }).first(),
  ).toBeVisible(COLD);
  // The term is on the URL once, and the box that wrote it is the box that shows it.
  await expect(boxes.getByRole("searchbox")).toHaveValue(raised[0].company);
});

/**
 * A figure is not the length of a list (D144).
 *
 * Her four figures used to be counted off the two arrays her lists had been
 * given, and a list is two hundred rows (D80) — so past the cap her desk would
 * have said two hundred waiting for ever, and counted the late ones out of the
 * same two hundred. The seeded floor never reaches the cap, so this test builds
 * a floor that does, on both halves of the desk at once, and reads the strip.
 *
 * Everything it inserts is raised today, so the longest wait stays where the
 * seed put it and the tests above still describe the same desk.
 */
test("her figures are the whole desk's, not the first two hundred rows'", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const MARKER = "queue-cap.spec";
  const OVER = LIST_LIMIT + 6;

  const [home] = await query<{ companyId: string; projectId: string | null; repId: string }>(
    `select c.id as "companyId", c.rep_id as "repId",
            (select p.id from projects p
              where p.company_id = c.id and p.archived_at is null and p.lost_at is null
              limit 1) as "projectId"
       from companies c
      where c.archived_at is null
      limit 1`,
  );
  expect(home, "the seeded floor has a company to hang requests on").toBeTruthy();

  const [issued] = await query<{ id: string; repId: string }>(
    `select q.id, q.rep_id as "repId"
       from quotations q join companies c on c.id = q.company_id
      where q.status = 'issued' and c.archived_at is null
      limit 1`,
  );
  expect(issued, "the seeded floor has an issued quotation to dispatch against").toBeTruthy();
  const [method] = await query<{ id: number }>(`select id from shipment_methods order by id limit 1`);

  try {
    await query(
      `insert into quotations
         (number, revision, company_id, project_id, rep_id, status, notes, created_at, updated_at)
       select nextval('quotation_numbers')::int, 1, $1, $2, $3, 'requested', $4, now(), now()
         from generate_series(1, $5::int)`,
      [home.companyId, home.projectId, home.repId, MARKER, OVER],
    );
    await query(
      `insert into dispatches
         (number, quotation_id, rep_id, status, shipment_method_id, destination, payment_terms,
          created_at, updated_at)
       select nextval('dispatch_numbers')::int, $1, $2, 'submitted', $3, $4, $5, now(), now()
         from generate_series(1, $6::int)`,
      [issued.id, issued.repId, method.id, MARKER, MARKER, OVER],
    );

    // The same question the lists ask, asked here in SQL: everything requested
    // at a company that is not archived and is nobody's earlier revision, and
    // everything submitted behind it.
    const [{ quotations: waitingQuotations }] = await query<{ quotations: number }>(
      `select count(*)::int as quotations
         from quotations q join companies c on c.id = q.company_id
        where q.status = 'requested' and c.archived_at is null
          and not exists (select 1 from quotations later
                           where later.number = q.number and later.revision > q.revision)`,
    );
    const [{ dispatches: waitingDispatches }] = await query<{ dispatches: number }>(
      `select count(*)::int as dispatches
         from dispatches d
         join quotations q on q.id = d.quotation_id
         join companies c on c.id = q.company_id
        where d.status = 'submitted' and c.archived_at is null`,
    );
    expect(waitingQuotations).toBeGreaterThan(LIST_LIMIT);
    expect(waitingDispatches).toBeGreaterThan(LIST_LIMIT);

    await login(page, locale, "rawan");
    await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);

    await test.step("each figure is the true count, not the capped list's length", async () => {
      await expect(figureTile(page, t("common.quotations")).locator("dd").first()).toHaveText(
        String(waitingQuotations),
        COLD,
      );
      await expect(figureTile(page, t("common.dispatches")).locator("dd").first()).toHaveText(
        String(waitingDispatches),
      );
    });

    await test.step("and each list says what the cap left off", async () => {
      await expect(
        listSection(page, t("common.quotations")).locator('[data-slot="list-tail"]'),
      ).toHaveText(t("common.showingFirst", { shown: LIST_LIMIT, total: waitingQuotations }));
      await expect(
        listSection(page, t("common.dispatches")).locator('[data-slot="list-tail"]'),
      ).toHaveText(t("common.showingFirst", { shown: LIST_LIMIT, total: waitingDispatches }));
    });
  } finally {
    await query(`delete from dispatches where destination = $1`, [MARKER]);
    await query(`delete from quotations where notes = $1`, [MARKER]);
  }
});
