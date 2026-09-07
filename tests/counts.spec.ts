import { addDays, todayRiyadh } from "@/lib/dates";
import { BAND_LIMIT, LIST_LIMIT } from "@/lib/list-size";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * A count counts the rows its list shows (SPEC D108, P11D finding 72).
 *
 * The follow-up figure was one number for three screens: it counted DATES —
 * a company's own and each of its live projects' — while the pill on Companies
 * opened one row per company, the chip on Projects opened projects only, and
 * the day's bands drew companies under that same total, so "and 1 more" could
 * point at a company that was not there. On the volume floor the Projects
 * screen said 37 overdue above a list of one.
 *
 * The spec does not restate the definition in SQL — that would be a second
 * copy of the rule beside the one the app uses (D103). It puts one of Faisal's
 * companies late on its own date AND on a project's, the case that made two
 * dates of one row, then holds each screen's number to the rows under it: the
 * sentence the pill shows must be the sentence built from the row count.
 * Both locale projects run against one seeded database (playwright.config.ts:
 * `workers: 1`), so the dates are put back in a `finally`.
 */

const COLD = { timeout: 30_000 };

type Pair = {
  company_id: string;
  company_name: string;
  company_day: string | null;
  project_id: string;
  project_name: string;
  project_day: string | null;
};

/** One of Faisal's live companies with a live project: the pair this spec dates. */
async function pairOf(repId: string): Promise<Pair> {
  return one<Pair>(
    `select c.id as company_id, c.name as company_name,
            c.next_follow_up::text as company_day,
            p.id as project_id, p.name as project_name,
            p.next_follow_up::text as project_day
       from companies c
       join projects p on p.company_id = c.id
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and p.archived_at is null
        and p.lost_at is null
      order by c.name, p.name
      limit 1`,
    [repId],
  );
}

test("a pill, a chip and a band each count the rows under them", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const faisalName = await personName("faisal@technopanel.com.sa", locale);
  const pair = await pairOf(faisal);
  const yesterday = addDays(todayRiyadh(), -1);
  // Late twice over, on one row: the shape that counted as two dates.
  await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
    pair.company_id,
    yesterday,
  ]);
  await query(`update projects set next_follow_up = $2::date where id = $1::uuid`, [
    pair.project_id,
    yesterday,
  ]);
  try {
    await login(page, locale, "faisal");

    await test.step("Companies: the overdue pill says how many rows the filter shows", async () => {
      await page.goto(`/${locale}/companies?filter=overdue`);
      await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
      const rows = page.locator("table tbody tr");
      await expect(rows.filter({ hasText: pair.company_name })).toHaveCount(1);
      const shown = await rows.count();
      expect(shown, "the seeded floor must fit under the cap for this to hold").toBeLessThan(
        LIST_LIMIT,
      );
      // The active pill is the one whose filter is in the URL (the sidebar's
      // current page says "page", never "true").
      const pill = page.locator('a[aria-current="true"]');
      await expect(pill).toHaveText(t("companies.overdueCount", { count: shown }));
    });

    await test.step("Projects: the overdue chip counts projects, not the strip's dates", async () => {
      await page.goto(`/${locale}/projects?filter=overdue`);
      await expect(page.getByRole("heading", { name: t("common.projects") })).toBeVisible(COLD);
      const rows = page.locator("table tbody tr");
      await expect(rows.filter({ hasText: pair.project_name })).toHaveCount(1);
      const shown = await rows.count();
      expect(shown).toBeLessThan(LIST_LIMIT);
      const chip = page.getByRole("link", { name: t("projects.overdueChip", { count: shown }) });
      await expect(chip).toBeVisible();
    });

    await test.step("The day: the overdue band's number is its cards, and nothing more", async () => {
      await page.goto(`/${locale}/day`);
      await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);
      const band = page.locator('[data-slot="call-band"][data-band="overdue"]');
      await expect(band).toBeVisible();
      const cards = band.getByRole("listitem");
      await expect(cards.filter({ hasText: pair.company_name })).toHaveCount(1);
      const shown = await cards.count();
      expect(shown, "the band must be under its cap for the tail line to mean anything").toBeLessThan(
        BAND_LIMIT,
      );
      await expect(band.getByRole("heading", { level: 3 })).toContainText(String(shown));
      // Every company late is on the band, so there is nobody "more": the tail
      // link is the only link in a band that points at the filtered list.
      await expect(band.locator('a[href*="filter=overdue"]')).toHaveCount(0);
    });

    await test.step("Team: the overdue count on a rep's row opens the rows it counted", async () => {
      // The manager's table (P11E). Its count for Faisal is the pill's own
      // definition on Faisal's floor, and pressing it lands on that pill with
      // that many rows under it — a count is a door, not a figure to go and
      // check.
      await login(page, locale, "abdulrahman");
      await page.goto(`/${locale}/team`);
      await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("link", { name: faisalName, exact: true }) });
      const door = row.locator('a[href*="filter=overdue"]');
      await expect(door).toHaveCount(1);
      const said = Number(await door.innerText());
      expect(said, "Faisal has an overdue company by construction").toBeGreaterThan(0);
      expect(said, "the list must be under its cap to be counted").toBeLessThan(LIST_LIMIT);
      await door.click();
      await expect(page).toHaveURL(/filter=overdue/);
      await expect(page.locator('a[aria-current="true"]')).toHaveText(
        t("companies.overdueCount", { count: said }),
      );
      await expect(page.locator("table tbody tr")).toHaveCount(said);
    });
  } finally {
    await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
      pair.company_id,
      pair.company_day,
    ]);
    await query(`update projects set next_follow_up = $2::date where id = $1::uuid`, [
      pair.project_id,
      pair.project_day,
    ]);
  }
});
