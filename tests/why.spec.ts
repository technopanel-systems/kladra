import { todayRiyadh } from "@/lib/dates";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * A call card says why (SPEC D111, P11D finding 75).
 *
 * The day's call card named the company, the contact, the city and the date,
 * and not the reason the call was owed — the words of the last entry lived two
 * presses away on the drawer's Activity tab, and a rep who wrote "wants 4 mm
 * samples, follow up tomorrow" read tomorrow's card as a name and a date. The
 * last entry's words ride with the card now, one line, in the writer's own
 * direction.
 *
 * The entry is written straight into the log with today's follow-up so the
 * company is on a band, and both are taken back in a `finally`: both locale
 * projects read one seeded database (playwright.config.ts: `workers: 1`).
 */

const COLD = { timeout: 30_000 };

type Company = { id: string; name: string; next_follow_up: string | null };

test("the last thing written about a customer is on the card that asks for the call", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<Company>(
    `select c.id, c.name, c.next_follow_up::text as next_follow_up
       from companies c
      where c.rep_id = $1::uuid and c.archived_at is null
      order by c.name
      limit 1`,
    [faisal],
  );
  const today = todayRiyadh();
  // Written in Arabic on purpose: the line takes its own direction on either page.
  const said = `أراد عينات 4 مم — ${Date.now()}`;
  const entry = await one<{ id: string }>(
    `insert into activities (company_id, user_id, text, channel, happened_on, next_follow_up)
     values ($1::uuid, $2::uuid, $3, 'visit', $4::date, $4::date)
     returning id`,
    [company.id, faisal, said, today],
  );
  await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
    company.id,
    today,
  ]);
  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);
    const card = page
      .locator('[data-slot="call-band"]')
      .getByRole("listitem")
      .filter({ hasText: company.name });
    await expect(card).toHaveCount(1);
    const line = card.locator('[data-slot="last-said"]');
    await expect(line).toHaveText(said);
    // A LINE somebody typed: the words take their own direction (Arabic, on
    // either page) and the line itself sits where the card starts, in the
    // page's direction — not alone at the far edge of a wide card (DESIGN §5).
    await expect(line.locator("bdi")).toHaveAttribute("dir", "auto");
    const directions = await line.evaluate((node) => ({
      line: getComputedStyle(node).direction,
      words: getComputedStyle(node.querySelector("bdi")!).direction,
    }));
    expect(directions).toEqual({ line: locale === "ar" ? "rtl" : "ltr", words: "rtl" });
  } finally {
    await query(`delete from activities where id = $1::uuid`, [entry.id]);
    await query(`update companies set next_follow_up = $2::date where id = $1::uuid`, [
      company.id,
      company.next_follow_up,
    ]);
  }
});
