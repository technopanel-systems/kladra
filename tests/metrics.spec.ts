import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, personName, userId } from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { formatDay } from "@/lib/dates";
import { formatSqmWhole } from "@/lib/money";
import { DEFAULT_RANGE, rangeStart, type Range } from "@/lib/ranges";

/**
 * P12 — the metrics tab (SPEC §3, D152, D154).
 *
 * The founder asked three things of it: where the metres went by kind of
 * customer, how the work narrows on its way through, and a date range on every
 * figure — with a rep picker for the manager. This walks all four, and every
 * figure it checks is computed here in its own SQL rather than by re-running
 * the app's (rules/data.md): the app is what is on trial, not a second copy of
 * its own queries.
 *
 * The window is the thing to hold on to. It is chosen once, above the cards,
 * and everything under the chips is measured over it — so the assertions below
 * change the window and check that the SAME cards move, which is the only way
 * to prove a control scopes what it claims to.
 */

const COLD = { timeout: 30_000 };

/** The metres approved in the window, by segment, largest first. */
async function segments(from: string, repId: string | null) {
  return query<{ name_en: string; name_ar: string; sqm: string }>(
    `select cc.name_en, cc.name_ar,
            round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text as sqm
       from dispatches d
       join dispatch_items di on di.dispatch_id = d.id
       join quotation_items qi on qi.id = di.quotation_item_id
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = q.company_id
       join company_categories cc on cc.id = c.category_id
      where d.status = 'approved'
        and (d.approved_at at time zone 'Asia/Riyadh')::date >= $1::date
        and ($2::uuid is null or d.rep_id = $2::uuid)
      group by cc.id, cc.name_en, cc.name_ar
      order by sum(round(qi.width * qi.length * di.qty, 2)) desc`,
    [from, repId],
  );
}

/**
 * Each row of the ratios card is a population and what became of it: of the
 * projects started in the window, how many were quoted; of the quotations
 * raised in it, how many went out. Both halves of each fraction are about the
 * same rows — the card's first version compared quotations raised in the window
 * against projects started in it, which are two different populations and can
 * print "11 of 9".
 */
async function ratios(from: string, repId: string | null) {
  return one<{
    projects: number;
    quotations: number;
    quoted: number;
    dispatches: number;
    dispatched: number;
  }>(
    `select
       (select count(*)::int from projects p
          join companies c on c.id = p.company_id
         where (p.created_at at time zone 'Asia/Riyadh')::date >= $1::date
           and c.archived_at is null and p.archived_at is null
           and ($2::uuid is null or p.rep_id = $2::uuid)) as projects,
       (select count(*)::int from projects p
          join companies c on c.id = p.company_id
         where (p.created_at at time zone 'Asia/Riyadh')::date >= $1::date
           and c.archived_at is null and p.archived_at is null
           and ($2::uuid is null or p.rep_id = $2::uuid)
           and exists (select 1 from quotations q where q.project_id = p.id)) as quoted,
       (select count(*)::int from quotations q
          join companies c on c.id = q.company_id
         where (q.created_at at time zone 'Asia/Riyadh')::date >= $1::date
           and c.archived_at is null
           and ($2::uuid is null or q.rep_id = $2::uuid)) as quotations,
       (select count(*)::int from quotations q
          join companies c on c.id = q.company_id
         where (q.created_at at time zone 'Asia/Riyadh')::date >= $1::date
           and c.archived_at is null
           and ($2::uuid is null or q.rep_id = $2::uuid)
           and exists (select 1 from dispatches d where d.quotation_id = q.id)) as dispatched,
       (select count(*)::int from dispatches d
          join quotations q on q.id = d.quotation_id
          join companies c on c.id = q.company_id
         where (d.created_at at time zone 'Asia/Riyadh')::date >= $1::date
           and c.archived_at is null
           and ($2::uuid is null or d.rep_id = $2::uuid)) as dispatches`,
    [from, repId],
  );
}

/** A card by its heading — the metrics tab draws four of them in one grid. */
function card(page: Page, heading: string) {
  return page.locator("section").filter({ hasText: heading }).last();
}

/** What the segment card should read, checked row by row and in order. */
async function expectSegments(
  page: Page,
  t: Translate,
  locale: Locale,
  from: string,
  repId: string | null,
): Promise<void> {
  const expected = await segments(from, repId);
  const rows = card(page, t("team.segments")).locator('li[data-slot="share-row"]');
  await expect(rows).toHaveCount(expected.length, COLD);

  for (const [index, segment] of expected.entries()) {
    const row = rows.nth(index);
    await expect(row).toContainText(locale === "ar" ? segment.name_ar : segment.name_en);
    // Whole metres, the way every other card in the app writes them (P11E).
    await expect(row).toContainText(formatSqmWhole(segment.sqm));
  }
}

test("the manager's metrics tab measures the window its chips name", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Four cards, two windows and a rep, all read from the database.

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=metrics`);

  await test.step("1 · it opens on the quarter, and says so on every card", async () => {
    const chips = page.locator('[data-slot="range-chips"]');
    await expect(chips).toBeVisible(COLD);
    // The default is the quarter and not the month, because a quotation raised
    // on the 28th has not had time to be answered (D152).
    expect(DEFAULT_RANGE).toBe("quarter");
    await expect(
      chips.getByRole("link", { name: t("common.range.quarter") }),
      "the tab opened on a window nobody chose",
    ).toHaveAttribute("aria-current", "true");

    // The window in words, on the card that has the most to lose from being
    // read over the wrong one.
    await expect(card(page, t("team.chainTitle"))).toContainText(
      formatDay(rangeStart(DEFAULT_RANGE), locale),
    );
  });

  await test.step("2 · the metres are the metres, by segment, largest first", async () => {
    await expectSegments(page, t, locale, rangeStart(DEFAULT_RANGE), null);
  });

  await test.step("3 · each fraction is a population and what became of it", async () => {
    const expected = await ratios(rangeStart(DEFAULT_RANGE), null);
    const ratiosCard = card(page, t("team.ratios"));

    // Both halves are about the same rows, so neither part can be larger than
    // its whole. The first version of this card compared quotations raised in
    // the window against projects started in it — two populations, and a bar
    // that could run off its own track.
    expect(expected.quoted).toBeLessThanOrEqual(expected.projects);
    expect(expected.dispatched).toBeLessThanOrEqual(expected.quotations);

    await expect(ratiosCard).toContainText(
      t("team.ratioOf", { part: expected.quoted, whole: expected.projects }),
    );
    await expect(ratiosCard).toContainText(
      t("team.ratioOf", { part: expected.dispatched, whole: expected.quotations }),
    );
    // The totals underneath: what the two fractions were taken out of.
    await expect(ratiosCard).toContainText(
      t("team.ratiosMeans", {
        quotations: expected.quotations,
        dispatches: expected.dispatches,
      }),
    );
  });

  await test.step("4 · pressing a window moves every card under it, not one", async () => {
    const month: Range = "month";
    await page
      .locator('[data-slot="range-chips"]')
      .getByRole("link", { name: t("common.range.month") })
      .click();

    await expect(page).toHaveURL(/range=month/, COLD);
    const from = rangeStart(month);

    // Two cards, one window: the chain says the new first day and the segments
    // are recomputed over it. A control that moved one card and not the other
    // is the defect this step exists for.
    await expect(card(page, t("team.chainTitle"))).toContainText(formatDay(from, locale), COLD);
    await expectSegments(page, t, locale, from, null);
  });
});

test("the rep picker scopes the whole tab, not one card on it", async ({ page, locale, t }) => {
  test.slow();

  const faisal = {
    id: await userId("faisal@technopanel.com.sa"),
    name: await personName("faisal@technopanel.com.sa", locale),
  };

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=metrics`);

  await page.getByRole("combobox").first().click();
  await page.getByRole("option").filter({ hasText: faisal.name }).first().click();

  await expect(page).toHaveURL(new RegExp(`rep=${faisal.id}`), COLD);

  // The month card names whose month it is now — the same card, one person's
  // figures, so nothing on the screen is the company's and one rep's at once.
  await expect(page.getByRole("heading", { name: faisal.name })).toBeVisible(COLD);

  // And the window is not lost on the way: picking a person keeps the window,
  // as pressing a window keeps the person.
  await expect(page).toHaveURL(/range=quarter/);
  await expectSegments(page, t, locale, rangeStart(DEFAULT_RANGE), faisal.id);
});

test("a rep reads his own metrics, in the same two cards", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/day?tab=metrics`);

  // His own, not the floor's: the same layout the manager reads about everybody,
  // which is what makes a rep recognise his figures where he meets them again.
  await expectSegments(page, t, locale, rangeStart(DEFAULT_RANGE), faisal);

  const expected = await ratios(rangeStart(DEFAULT_RANGE), faisal);
  await expect(card(page, t("team.ratios"))).toContainText(
    t("team.ratioOf", { part: expected.quoted, whole: expected.projects }),
  );
});
