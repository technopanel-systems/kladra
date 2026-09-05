import { login } from "./helpers/auth";
import { query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { BAND_LIMIT } from "@/lib/list-size";

/**
 * "Waiting on you" draws the longest-waiting and says how many it left out
 * (SPEC D83, D80). The seeded floor never reaches the cap, so this test makes
 * a floor that does: thirty-odd quotations sent back to Faisal, the oldest of
 * them older than anything the seed left waiting, and then reads his day.
 */

const COLD = { timeout: 30_000 };
const MARKER = "waiting-cap.spec";
const EXTRA = BAND_LIMIT + 6;

test("the waiting list draws the cap, counts the rest, and keeps the oldest", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId("faisal@technopanel.com.sa");
  const [home] = await query<{ company_id: string; project_id: string }>(
    `select c.id as company_id, p.id as project_id
       from companies c join projects p on p.company_id = c.id
      where c.rep_id = $1 and c.archived_at is null and p.archived_at is null and p.lost_at is null
      limit 1`,
    [faisal],
  );
  expect(home, "Faisal has a company with a project on the seeded floor").toBeTruthy();

  try {
    // Sent back a year ago and every day since: the first is older than any
    // seeded row, and the last is the newest thing waiting on him.
    await query(
      `insert into quotations
         (number, revision, company_id, project_id, rep_id, status, return_reason, created_at, updated_at)
       select nextval('quotation_numbers')::int, 1, $1, $2, $3, 'returned', $4,
              now() - (400 - g) * interval '1 day', now() - (400 - g) * interval '1 day'
         from generate_series(1, $5::int) g`,
      [home.company_id, home.project_id, faisal, MARKER, EXTRA],
    );
    const [{ total }] = await query<{ total: number }>(
      `select count(*)::int as total
         from quotations q join companies c on c.id = q.company_id
        where c.rep_id = $1 and c.archived_at is null
          and ((q.status in ('returned', 'issued')
                and not exists (select 1 from quotations later
                                 where later.number = q.number and later.revision > q.revision))
               or exists (select 1 from dispatches d where d.quotation_id = q.id and d.status = 'refused'))`,
      [faisal],
    );

    await login(page, locale, "faisal");
    await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);

    const waiting = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: t("day.waitingOnYou") }) });
    await expect(waiting.getByRole("listitem").first()).toBeVisible(COLD);

    // The cap, the true figure, and the line that says what was left out.
    await expect(waiting.getByRole("listitem")).toHaveCount(BAND_LIMIT);
    await expect(
      waiting.getByRole("heading", { name: t("day.waitingOnYou") }).locator(".num"),
    ).toHaveText(String(total));
    await expect(
      waiting.getByText(t("common.andMore", { count: total - BAND_LIMIT })),
    ).toBeVisible();

    // The oldest is drawn first, so the top row is one of ours, sent back
    // longest ago — and its reason is the marker this test wrote.
    await expect(waiting.getByRole("listitem").first()).toContainText(MARKER);
  } finally {
    await query(`delete from quotations where return_reason = $1`, [MARKER]);
  }
});
