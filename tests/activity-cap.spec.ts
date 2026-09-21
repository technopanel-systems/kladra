import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { ACTIVITY_SHOWN } from "@/lib/list-size";

/**
 * A drawer's Reports tab draws the latest fifty and says how many there are
 * (D80, `ACTIVITY_SHOWN`).
 *
 * The cap sat in src/lib/list-size.ts for phases with no reader, so every drawer
 * read a customer's whole log on every open — found in P14.5 because the
 * constant was dead code. The seeded floor has under one report per company and
 * could never show it, so this test writes a log that does: a year-old run of
 * reports on one of Faisal's jobs, older than anything the seed wrote, so the
 * oldest of them is exactly what the cap must leave out.
 *
 * Both drawers, from the one set of rows: each report is on the customer and on
 * the job, which is what a report written from the project drawer is.
 */

const COLD = { timeout: 30_000 };
const MARKER = "activity-cap.spec";
const EXTRA = ACTIVITY_SHOWN + 6;

test("the Reports tab draws the latest fifty and counts the rest, on the customer and on the job", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId("faisal@technopanel.com.sa");
  const home = await one<{ company_id: string; project_id: string }>(
    `select c.id as company_id, p.id as project_id
       from companies c join projects p on p.company_id = c.id
      where c.rep_id = $1 and p.rep_id = $1
        and c.archived_at is null and p.archived_at is null
      order by c.created_at
      limit 1`,
    [faisal],
  );

  try {
    // Day g of the run is 400 - g days ago: the first is the oldest report on
    // the customer, the last the newest of ours and still a year old.
    await query(
      `insert into activities (company_id, project_id, user_id, text, channel, happened_on, outcome_id)
       select $1, $2, $3, $4 || ' ' || g, 'call',
              (now() at time zone 'Asia/Riyadh')::date - (400 - g),
              (select id from outcomes order by id limit 1)
         from generate_series(1, $5::int) g`,
      [home.company_id, home.project_id, faisal, MARKER, EXTRA],
    );

    // The spec counts for itself, as the screen's figure is what is under test.
    const { company, project } = await one<{ company: number; project: number }>(
      `select count(*)::int as company,
              (count(*) filter (where project_id = $2))::int as project
         from activities
        where company_id = $1 and archived_at is null`,
      [home.company_id, home.project_id],
    );
    expect(company).toBeGreaterThan(ACTIVITY_SHOWN);

    await login(page, locale, "faisal");

    for (const [screen, id, total] of [
      ["companies", home.company_id, company],
      ["projects", home.project_id, project],
    ] as const) {
      await test.step(`the ${screen} drawer`, async () => {
        await page.goto(`/${locale}/${screen}?open=${id}`);
        const drawer = page.getByRole("dialog").first();
        await drawer.getByRole("tab", { name: t("drawer.activity") }).click(COLD);
        const panel = drawer.getByRole("tabpanel");
        const entries = panel.locator("ol").first().locator(":scope > li");

        // The cap, and the line that says what was left out, with the true count.
        await expect(entries).toHaveCount(ACTIVITY_SHOWN, COLD);
        await expect(
          panel.getByText(t("drawer.activityLatest", { shown: ACTIVITY_SHOWN, total })),
        ).toBeVisible();

        // The LATEST fifty: the oldest reports on the customer are ours, so the
        // first of the run is the one row that must be missing, and the newest
        // of it is drawn.
        await expect(panel.getByText(`${MARKER} 1`, { exact: true })).toHaveCount(0);
        await expect(panel.getByText(`${MARKER} ${EXTRA}`, { exact: true })).toBeVisible();
      });
    }
  } finally {
    await query(`delete from activities where text like $1`, [`${MARKER} %`]);
  }
});
