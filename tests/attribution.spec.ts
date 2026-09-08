import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import {
  floorOfCompany,
  one,
  personName,
  query,
  restoreCompanyFloor,
  userId,
} from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";

/**
 * Achieved m² stay with the person they were CREDITED to, not with whoever
 * ends up holding the company (SPEC D86, D148).
 *
 * A hand-over moves a customer and his open work — the coordinator's queue,
 * the follow-up date, the next quotation — but never the metres a rep already
 * had approved in his month. `achievedByRep` (src/lib/dispatches.ts) sums each
 * person's credited share of every approved dispatch, and the six-month figures
 * (src/lib/months.ts) and the daily report figure (src/lib/reports.ts) read the
 * same map. The quotation and dispatch drawers name the man who asked for the
 * paper "Raised by" (`common.raisedBy`) rather than "Rep", because a company's
 * rep is a different question from who asked for a given paper — the hand-over
 * warning (`drawer.handOverWarning`) says so in words.
 *
 * D148 moved the definition one step and left this test's point exactly where
 * it was. Until credit existed, "credited" and "raised" were the same person on
 * every record; they still are on the one this walk moves, which is chosen to
 * be a dispatch with one name on it. What a hand-over must not touch is the
 * month somebody has already earned, whichever of the two words names him.
 *
 * The seed gives this a company to prove it with: f1 is Faisal's, its quotation
 * was raised by him, and its one dispatch was approved this Riyadh month and
 * credited to him alone. Handing f1 to Saad is the whole test: under the OLD,
 * wrong definition (by `companies.rep_id`, whoever holds the company today)
 * Faisal's month would drop by exactly what that company earned and Saad's
 * would rise by it; under the one now in force neither number moves and the
 * quotation still says Faisal raised it.
 */

const COLD = { timeout: 30_000 };

/**
 * Achieved this Riyadh month by the person the dispatch was CREDITED to — the
 * one definition (D86, D148; `achievedByRep` in src/lib/dispatches.ts),
 * computed straight from the tables with its own arithmetic, so the app is
 * what is on trial and not a second copy of its own SQL. The division itself
 * is tested in tests/credit.spec.ts; what matters here is only that a
 * hand-over does not move it.
 */
async function achievedByCredit(repId: string): Promise<number> {
  const row = await one<{ sqm: string }>(
    `with d as (
       select dd.id, round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2) as sqm
         from dispatches dd
         join dispatch_items di on di.dispatch_id = dd.id
         join quotation_items qi on qi.id = di.quotation_item_id
        where dd.status = 'approved'
          and date_trunc('month', (dd.approved_at at time zone 'Asia/Riyadh')::date)
              = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)
        group by dd.id
     ),
     cr as (
       select dispatch_id, user_id,
              count(*) over (partition by dispatch_id) as n,
              row_number() over (partition by dispatch_id order by user_id) as k
         from dispatch_credits
     )
     select round(coalesce(sum(
              case when cr.k < cr.n then trunc(d.sqm / cr.n, 2)
                   else d.sqm - trunc(d.sqm / cr.n, 2) * (cr.n - 1) end), 0), 2)::text as sqm
       from d join cr on cr.dispatch_id = d.id
      where cr.user_id = $1::uuid`,
    [repId],
  );
  return Number(row.sqm);
}

/**
 * What the OLD, wrong definition would give: by whoever holds the company
 * TODAY, which a hand-over changes underneath an approval that already
 * happened. Kept only to prove the two diverge once a company moves — the
 * app itself is never asked to compute this one (D86).
 */
async function achievedByCurrentOwner(repId: string): Promise<number> {
  const row = await one<{ sqm: string }>(
    `select round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text as sqm
       from dispatches d
       join dispatch_items di on di.dispatch_id = d.id
       join quotation_items qi on qi.id = di.quotation_item_id
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = q.company_id
      where d.status = 'approved'
        and c.rep_id = $1::uuid
        and date_trunc('month', (d.approved_at at time zone 'Asia/Riyadh')::date)
            = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)`,
    [repId],
  );
  return Number(row.sqm);
}

/**
 * The "Achieved" figure on a named row of the team table. The column carries
 * no `data-slot` (only Pace does — team-table.tsx), so it is found by its own
 * heading, the way tests/manager.spec.ts reads every column by `t(key)`
 * rather than by position, and read back the way tests/manager.spec.ts reads
 * a card figure: strip everything but the digits and the point (D6 — Western
 * digits in both locales, so the parse itself is locale-blind).
 */
async function teamAchieved(page: Page, t: Translate, name: string): Promise<number> {
  const table = page.getByRole("table").first();
  const headers = await table.getByRole("columnheader").allInnerTexts();
  const column = headers.findIndex((header) => header.trim() === t("team.achieved"));
  expect(column, `no "${t("team.achieved")}" column on the team table`).toBeGreaterThanOrEqual(0);

  const text = await table
    .getByRole("row")
    .filter({ hasText: name })
    .first()
    .getByRole("cell")
    .nth(column)
    .innerText();
  return Number(text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0]);
}

test("achieved metres stay with the person who earned them", async ({ page, locale, t }) => {
  test.slow();

  const faisal = {
    id: await userId("faisal@technopanel.com.sa"),
    name: await personName("faisal@technopanel.com.sa", locale),
  };
  const saad = {
    id: await userId("saad@technopanel.com.sa"),
    name: await personName("saad@technopanel.com.sa", locale),
  };

  // Faisal's own company, whose quotation was raised by him and whose one
  // approved dispatch this month was raised by him too (D86's whole case).
  const target = await one<{ company_id: string; company_name: string; quotation_id: string }>(
    `select c.id as company_id, c.name as company_name, q.id as quotation_id
       from dispatches d
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = q.company_id
      where d.rep_id = $1::uuid
        and d.status = 'approved'
        and c.rep_id = $1::uuid
        -- Credited to him alone, so "raised" and "credited" name one man on
        -- the record this walk moves (D148).
        and not exists (select 1 from dispatch_credits dc
                         where dc.dispatch_id = d.id and dc.user_id <> $1::uuid)
        and date_trunc('month', (d.approved_at at time zone 'Asia/Riyadh')::date)
            = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)
      order by q.number
      limit 1`,
    [faisal.id],
  );

  // Computed ONCE, by the one definition, before anything moves — comparing
  // it against itself after the hand-over would be circular. And the old,
  // wrong definition is read before as well as after, because since D148 the
  // two no longer coincide across the whole floor: a rep can be credited a
  // share of a dispatch on his own customer that his colleague raised. What
  // proves the point is that the wrong one MOVES with the company and the
  // right one does not.
  const faisalByCredit = await achievedByCredit(faisal.id);
  const saadByCredit = await achievedByCredit(saad.id);
  const faisalByOwnerBefore = await achievedByCurrentOwner(faisal.id);
  expect(faisalByCredit, "Faisal is credited nothing this month — the seed changed").toBeGreaterThan(0);
  expect(saadByCredit, "Saad is credited nothing this month — the seed changed").toBeGreaterThan(0);

  // The dispatch this walk moves has one name on it, so for THAT record the
  // two definitions still say the same man and the divergence in step 2 is the
  // hand-over's doing rather than a split that was already there.
  const onTheTarget = await one<{ n: number }>(
    `select count(*)::int as n
       from dispatches d
       join dispatch_credits dc on dc.dispatch_id = d.id
       join quotations q on q.id = d.quotation_id
      where q.company_id = $1::uuid and d.status = 'approved' and dc.user_id <> $2::uuid`,
    [target.company_id, faisal.id],
  );
  expect(
    onTheTarget.n,
    "the target company's approved metres are shared with somebody — pick another",
  ).toBe(0);

  // The floor as it stands before anything moves. A hand-over takes the
  // company's projects and contacts with it (src/actions/companies.ts), so
  // putting back `companies.rep_id` alone would leave this customer's people
  // on Saad's floor for every spec that runs after this one.
  const floor = await floorOfCompany(target.company_id);

  try {
    await login(page, locale, "abdulrahman");

    await test.step("1 · Abdulrahman hands the company to Saad", async () => {
      await page.goto(`/${locale}/companies?open=${target.company_id}`);
      const drawer = page.getByRole("dialog").first();
      await expect(drawer).toBeVisible(COLD);
      await drawer.getByRole("button", { name: t("drawer.handOver") }).click();

      const dialog = page.getByRole("dialog", {
        name: t("drawer.handOverTitle", { name: target.company_name }),
      });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(t("drawer.handOverWarning"));

      await dialog.getByRole("combobox").click();
      // The option carries the person's name and, under it, their role — one
      // accessible name of two parts, so this matches on the name inside it
      // (tests/marketing.spec.ts).
      await page.getByRole("option").filter({ hasText: saad.name }).first().click();
      await dialog.getByRole("button", { name: t("drawer.handOver") }).click();

      await expect
        .poll(
          async () =>
            (
              await one<{ rep_id: string }>("select rep_id from companies where id = $1::uuid", [
                target.company_id,
              ])
            ).rep_id,
          { timeout: 15_000 },
        )
        .toBe(saad.id);

      // And his people and his jobs went with it (#155). Before P12 a project
      // and a contact had no rep of their own, so moving the company moved
      // everything under it by definition; now that they say whose they are,
      // a hand-over that moves the company alone hands the new owner a
      // customer he cannot log against and leaves the man who left still
      // holding the work.
      const his = {
        projects: floor.projects.filter((p) => p.repId === faisal.id).map((p) => p.id),
        contacts: floor.contacts
          .filter((c) => c.repId === faisal.id && c.archivedAt === null)
          .map((c) => c.id),
      };
      expect(
        his.projects.length + his.contacts.length,
        "the target company has no projects and no contacts of Faisal's — nothing to prove the move with",
      ).toBeGreaterThan(0);
      const leftBehind = await query<{ id: string }>(
        `select id from projects where id = any($1::uuid[]) and rep_id = $2::uuid
          union all
         -- Except one the new owner already held himself: that row is
         -- archived where it stands, on purpose (#159, D153).
         select id from contacts
          where id = any($3::uuid[]) and rep_id = $2::uuid and archived_at is null`,
        [his.projects, faisal.id, his.contacts],
      );
      expect(
        leftBehind.length,
        "the company moved and left the departing rep's projects or contacts behind",
      ).toBe(0);
    });

    await test.step("2 · the team screen still credits each man with what he raised", async () => {
      // The company DID move — proof that the old, wrong definition would
      // have moved its metres with it, which is exactly the bug D86 fixes.
      expect(
        await achievedByCurrentOwner(faisal.id),
        "the old, company-owner definition did not move even though the company did",
      ).not.toBe(faisalByOwnerBefore);

      // The team table is its own tab now (D151): the manager's screen answers three
      // questions and this is the third one, people rather than work.
      await page.goto(`/${locale}/team?tab=team`);
      await expect(page.getByRole("heading", { name: t("shell.team") })).toBeVisible(COLD);

      expect(
        await teamAchieved(page, t, faisal.name),
        "Faisal's achieved figure moved when the company did",
      ).toBe(Math.round(faisalByCredit));
      expect(
        await teamAchieved(page, t, saad.name),
        "Saad's achieved figure moved when the company did",
      ).toBe(Math.round(saadByCredit));
    });

    await test.step("3 · the quotation still says Faisal raised it, not Saad", async () => {
      await page.goto(`/${locale}/quotations?open=${target.quotation_id}`);
      const drawer = page.getByRole("dialog").first();
      await expect(drawer).toBeVisible(COLD);

      const raisedBy = drawer.locator("dl > div").filter({ hasText: t("common.raisedBy") });
      await expect(raisedBy).toBeVisible();
      await expect(raisedBy.locator("dd")).toHaveText(faisal.name);
    });
  } finally {
    // The floor as the seed left it, for every spec that runs after this one
    // (rules/data.md — nothing here may leak into another file's assumptions).
    // `audit_log.record_id` is text; `notifications.subject_id` is uuid
    // (src/db/schema.ts) — cast each to its own column's type, not the other's.
    await restoreCompanyFloor(floor);
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text and action = 'company.handOver'`,
      [target.company_id],
    );
    await query(
      `delete from notifications
        where subject_type = 'company' and subject_id = $1::uuid and kind = 'companyHandedOver'`,
      [target.company_id],
    );
  }
});
