import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { CHAIN_WINDOW_DAYS } from "@/lib/chain";
import { formatSqmWhole } from "@/lib/money";

/**
 * P11J — why we lose (D140).
 *
 * The manager could read what became of a quarter's quotations and not what
 * became of the work. Every lost project has carried a reason since P3, because
 * Mark lost refuses a save without one, and no screen had ever read them as a
 * population.
 *
 * The card is held to the same rule as every other figure in this app: what it
 * says is what the database says, asked here in its own SQL rather than by
 * re-running the app's (rules/data.md). Square metres lead, because one tower
 * lost on price and five small jobs lost on colour are not the same quarter.
 */

const COLD = { timeout: 30_000 };

/** The window's losses, by reason, with anything unrecognised folded into `other`. */
async function lossesByReason() {
  return query<{ reason: string; projects: number; sqm: string }>(
    `select case when p.lost_reason in
                 ('price','competitor','colour','stock','leadTime','specification','cancelled','quiet','other')
                 then p.lost_reason else 'other' end as reason,
            count(*)::int as projects,
            coalesce(sum(p.expected_sqm), 0)::text as sqm
       from projects p
       join companies c on c.id = p.company_id
      where p.lost_at is not null
        and p.archived_at is null
        and c.archived_at is null
        and (p.lost_at at time zone 'Asia/Riyadh')::date
            >= (now() at time zone 'Asia/Riyadh')::date - $1::int
      group by 1
      order by sum(p.expected_sqm) desc`,
    [CHAIN_WINDOW_DAYS],
  );
}

test("the card says what the quarter was lost to, largest first", async ({ page, locale, t }) => {
  const losses = await lossesByReason();
  expect(losses.length, "nothing was given up in the window").toBeGreaterThan(1);

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team`);

  const card = page.locator("section").filter({ hasText: t("team.lossTitle") }).last();
  await expect(card).toBeVisible(COLD);

  // Every reason that happened, in the order the metres put them.
  const rows = card.locator("li[data-reason]");
  await expect(rows).toHaveCount(losses.length);
  for (const [index, loss] of losses.entries()) {
    const row = rows.nth(index);
    await expect(row).toHaveAttribute("data-reason", loss.reason);
    await expect(row).toContainText(t(`projects.lossReason.${loss.reason}`));
    // The figure, whole: a sum of estimates has no decimals to show.
    await expect(row).toContainText(formatSqmWhole(loss.sqm));
    await expect(row).toContainText(t("team.lossProjects", { projects: loss.projects }));
  }
});

test("its sentence counts the same projects the rows do", async ({ page, locale, t }) => {
  const total = await one<{ projects: number; sqm: string }>(
    `select count(*)::int as projects, coalesce(sum(p.expected_sqm), 0)::text as sqm
       from projects p
       join companies c on c.id = p.company_id
      where p.lost_at is not null
        and p.archived_at is null
        and c.archived_at is null
        and (p.lost_at at time zone 'Asia/Riyadh')::date
            >= (now() at time zone 'Asia/Riyadh')::date - $1::int`,
    [CHAIN_WINDOW_DAYS],
  );

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team`);
  const card = page.locator("section").filter({ hasText: t("team.lossTitle") }).last();
  await expect(card).toContainText(
    t("team.lossMeans", {
      projects: total.projects,
      days: CHAIN_WINDOW_DAYS,
      sqm: formatSqmWhole(total.sqm),
    }),
    COLD,
  );
});

test("a reason somebody wrote counts under Other, and is not a row of its own", async ({
  page,
  locale,
  t,
}) => {
  const written = await one<{ reason: string }>(
    `select p.lost_reason as reason
       from projects p
      where p.lost_at is not null
        and p.lost_reason not in
            ('price','competitor','colour','stock','leadTime','specification','cancelled','quiet','other')
      limit 1`,
  );

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team`);
  const card = page.locator("section").filter({ hasText: t("team.lossTitle") }).last();
  await expect(card).toBeVisible(COLD);

  await expect(card.locator("li[data-reason='other']")).toHaveCount(1);
  // The line itself belongs on the project it was written about, not here.
  await expect(card).not.toContainText(written.reason);
});
