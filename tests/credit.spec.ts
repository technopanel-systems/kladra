import { login } from "./helpers/auth";
import { one, query, personName, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { creditShares, shareOf } from "@/lib/credit";
import { formatSqm, formatSqmWhole } from "@/lib/money";

/**
 * P12 — whose metres these are (SPEC §3, D148).
 *
 * The founder's rule in his own words: credit is chosen per quotation and per
 * dispatch, never inherited; where a project has more than one rep the dialog
 * asks who this one counts for — a named rep, or split between the sharers;
 * where it has one, nothing is asked. Every m² is attributed, no metre is
 * counted twice, and the manager can see for any shared job who was credited
 * what.
 *
 * Four things are on trial here and they are different in kind. The division
 * itself is arithmetic and is asked directly. That the app's SQL agrees with it
 * is checked on every approved row there is, with the split written a second
 * way — `trunc` here against the app's `floor(… * 100) / 100` — because a
 * figure computed two ways is the only kind that can be wrong out loud. That
 * nothing is counted twice is one query. And that a rep can choose at all is a
 * walk through the dialog on the one job two reps work.
 */

const COLD = { timeout: 30_000 };

/** Every approved dispatch and its own m², with the people credited on it. */
async function credited() {
  return query<{ id: string; number: number; sqm: string; users: string[] }>(
    `select d.id, d.number,
            round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text as sqm,
            (select array_agg(dc.user_id order by dc.user_id)
               from dispatch_credits dc where dc.dispatch_id = d.id) as users
       from dispatches d
       join dispatch_items di on di.dispatch_id = d.id
       join quotation_items qi on qi.id = di.quotation_item_id
      where d.status = 'approved'
      group by d.id, d.number
      order by d.number`,
  );
}

/** What one person was credited in the current Riyadh month, the other way round. */
const CREDITED_THIS_MONTH = `
  with d as (
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
  )`;

/** The share expression, written a second way on purpose (rules/data.md). */
const SHARE = `case when cr.k < cr.n then trunc(d.sqm / cr.n, 2)
                    else d.sqm - trunc(d.sqm / cr.n, 2) * (cr.n - 1) end`;

/** And the app's own, imported rather than retyped, so the two are compared. */
const APP_SHARE = shareOf("d.sqm", "cr.n", "cr.k");

test("the parts add back to the whole, and the odd hundredth has an owner", () => {
  const a = "11111111-1111-1111-1111-111111111111";
  const b = "22222222-2222-2222-2222-222222222222";
  const c = "33333333-3333-3333-3333-333333333333";

  // One name is the whole of it, which is every record until somebody shares a
  // job — and the reason this replaced "the rep who raised it" without moving
  // a single figure the day it landed.
  expect(creditShares("151.03", [a])).toEqual([{ userId: a, sqm: "151.03" }]);

  // Two names, and 151.03 does not halve. Down to the hundredth for the first,
  // and the last takes what is left, so the two add back exactly.
  expect(creditShares("151.03", [b, a])).toEqual([
    { userId: a, sqm: "75.51" },
    { userId: b, sqm: "75.52" },
  ]);

  // Three on a hundred: 33.33 three times is 99.99, and the missing hundredth
  // is not nobody's.
  const three = creditShares("100.00", [c, a, b]);
  expect(three.map((row) => row.sqm)).toEqual(["33.33", "33.33", "33.34"]);
  expect(three.reduce((sum, row) => sum + Number(row.sqm), 0)).toBeCloseTo(100, 10);

  // The order is the ids', not the order they were handed over, so two readers
  // of one dispatch give the leftover to the same man.
  expect(creditShares("100.00", [a, b, c])).toEqual(three);

  // Nobody credited is no metres attributed, rather than a crash or a nought
  // standing in for a person.
  expect(creditShares("100.00", [])).toEqual([]);

  // A name twice is one name: the unique index says so, and so does this.
  expect(creditShares("10.00", [a, a])).toEqual([{ userId: a, sqm: "10.00" }]);
});

test("every approved dispatch is attributed whole, and no metre twice", async () => {
  const rows = await credited();
  expect(rows.length).toBeGreaterThan(0);

  for (const row of rows) {
    // Nothing that moved metres is unattributed. A dispatch with no credit row
    // would vanish out of every rep's month and stay in the company's.
    expect(row.users?.length ?? 0, `D-${row.number} has nobody credited`).toBeGreaterThan(0);
    const parts = creditShares(row.sqm, row.users);
    const summed = parts.reduce((sum, part) => sum + Number(part.sqm), 0);
    expect(summed, `D-${row.number} shares do not add back`).toBeCloseTo(Number(row.sqm), 10);
  }

  // And the same thing asked of the whole month at once, both ways round: what
  // the company moved, and what its people were credited. The second is what
  // every rep's card and the manager's table are summed from, so a gap here is
  // a gap between two screens.
  const totals = await one<{ moved: string; attributed: string }>(
    `${CREDITED_THIS_MONTH}
     select (select round(coalesce(sum(sqm), 0), 2)::text from d) as moved,
            (select round(coalesce(sum(${SHARE}), 0), 2)::text
               from d join cr on cr.dispatch_id = d.id) as attributed`,
  );
  expect(totals.attributed).toBe(totals.moved);
});

test("a shared job's metres are split, and the drawer says who took what", async ({
  page,
  locale,
}) => {
  const split = await one<{ id: string; number: number; sqm: string; users: string[] }>(
    `select d.id, d.number,
            round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text as sqm,
            (select array_agg(dc.user_id order by dc.user_id)
               from dispatch_credits dc where dc.dispatch_id = d.id) as users
       from dispatches d
       join dispatch_items di on di.dispatch_id = d.id
       join quotation_items qi on qi.id = di.quotation_item_id
      where d.status = 'approved'
        and (select count(*) from dispatch_credits dc where dc.dispatch_id = d.id) > 1
      group by d.id, d.number
      -- The oldest, which is the seeded one: both locales run against one
      -- database in file order, so a dispatch an earlier spec raised would
      -- make this walk depend on what ran before it.
      order by d.number
      limit 1`,
  );
  // The demo has to hold one, or nobody has ever seen this work (rules/data.md).
  expect(split, "no seeded dispatch is shared between two reps").toBeTruthy();

  const parts = creditShares(split.sqm, split.users);
  expect(parts).toHaveLength(2);
  // Deliberately not a clean half: a demo where every split comes out even
  // proves nothing about the rounding underneath it.
  expect(parts[0].sqm).not.toBe(parts[1].sqm);

  const faisal = await userId("faisal@technopanel.com.sa");

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/dispatches?open=${split.id}`);

  // The drawer names both, with what each takes, beside the figure it came
  // from — which is how a rep who sees 151 here and 75 against his target can
  // see why without asking anybody.
  const lines = page.locator('[data-slot="credit-lines"]');
  await expect(lines).toBeVisible(COLD);
  for (const part of parts) {
    const email =
      part.userId === faisal ? "faisal@technopanel.com.sa" : "saad@technopanel.com.sa";
    await expect(lines).toContainText(await personName(email, locale));
    await expect(lines).toContainText(formatSqm(part.sqm));
  }
});

test("the month a rep is shown is the month he was credited", async ({ page, locale }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const mine = await one<{ sqm: string }>(
    `${CREDITED_THIS_MONTH}
     select round(coalesce(sum(${SHARE}), 0), 2)::text as sqm
       from d join cr on cr.dispatch_id = d.id
      where cr.user_id = $1::uuid`,
    [faisal],
  );

  // It is a share of somebody else's dispatch as well as the whole of his own,
  // so this figure is NOT the sum of what he raised — which is the point of the
  // rule, and the thing that would have silently not moved if the reads had
  // been left pointing at `dispatches.rep_id`.
  const raised = await one<{ sqm: string }>(
    `select round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text as sqm
       from dispatches d
       join dispatch_items di on di.dispatch_id = d.id
       join quotation_items qi on qi.id = di.quotation_item_id
      where d.status = 'approved' and d.rep_id = $1::uuid
        and date_trunc('month', (d.approved_at at time zone 'Asia/Riyadh')::date)
              = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)`,
    [faisal],
  );
  expect(mine.sqm).not.toBe(raised.sqm);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/day`);
  await expect(page.locator('[data-slot="figure-achieved"]').first()).toContainText(
    formatSqmWhole(mine.sqm),
    COLD,
  );
});

test("the app's division and this spec's agree to the hundredth, on every row", async () => {
  // The month card rounds to whole metres, so a screen can never show a
  // hundredth going astray. This asks the database instead: the app's own
  // expression — floor of the hundredths, remainder to the last name — against
  // the one written above it here, which reaches the same figure by truncating
  // and subtracting. Two ways of computing one figure, which is the only
  // arrangement in which either can be caught being wrong (rules/data.md).
  const rows = await query<{ user_id: string; theirs: string; ours: string }>(
    `${CREDITED_THIS_MONTH}
     select cr.user_id,
            round(sum(${APP_SHARE}), 2)::text as theirs,
            round(sum(${SHARE}), 2)::text as ours
       from d join cr on cr.dispatch_id = d.id
      group by cr.user_id`,
  );
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) expect(row.ours, `for ${row.user_id}`).toBe(row.theirs);
});

test("credit is chosen per record, and a job one rep works is asked nothing", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  // Both have to have sheets left on them: a quotation with nothing left offers
  // no Send button at all, and the dialog this is about would never open.
  const sendable = `q.status in ('issued', 'accepted')
     -- And the LIVE revision: once a quotation has been revised the customer
     -- holds the new paper and the drawer offers no Send at all (S34, S35).
     and not exists (select 1 from quotations later
                      where later.number = q.number and later.revision > q.revision)
     and exists (
       select 1 from quotation_items qi
        where qi.quotation_id = q.id
          and qi.qty > coalesce((
                select sum(di.qty) from dispatch_items di
                  join dispatches dd on dd.id = di.dispatch_id
                 where di.quotation_item_id = qi.id
                   and dd.status in ('submitted', 'approved')), 0))`;

  // Both scoped to what Faisal may actually send against, and taken oldest
  // first so they are the seeded rows: the two locales run against one database
  // in file order, and an earlier spec's shared project on somebody else's
  // floor would otherwise be the newest thing this query can see.
  const shared = await one<{ id: string }>(
    `select q.id from quotations q
      join companies c on c.id = q.company_id
      join projects p on p.id = q.project_id
      where ${sendable}
        and exists (select 1 from project_shares ps where ps.project_id = p.id)
        and (c.rep_id = $1::uuid or p.rep_id = $1::uuid
             or exists (select 1 from project_shares ps2
                         where ps2.project_id = p.id and ps2.user_id = $1::uuid))
      order by q.number limit 1`,
    [faisal],
  );
  const alone = await one<{ id: string }>(
    `select q.id from quotations q
      join companies c on c.id = q.company_id
      where ${sendable}
        and q.project_id is not null
        and c.rep_id = $1::uuid
        and not exists (select 1 from project_shares ps where ps.project_id = q.project_id)
      order by q.number limit 1`,
    [faisal],
  );

  await login(page, locale, "faisal");

  // A job one rep works has one possible answer, and a control with one option
  // is a tap he pays for every day and never uses.
  await page.goto(`/${locale}/quotations?open=${alone.id}`);
  await page.getByRole("button", { name: t("dispatches.request") }).click();
  await expect(page.locator('[data-slot="figure-sending"]').first()).toBeVisible(COLD);
  await expect(page.locator("#dispatch-credit")).toHaveCount(0);
  await page.keyboard.press("Escape");

  // And the job two reps work is asked, with both of them offered and the one
  // answer that is not a person.
  await page.goto(`/${locale}/quotations?open=${shared.id}`);
  await page.getByRole("button", { name: t("dispatches.request") }).click();
  const field = page.locator("#dispatch-credit");
  await expect(field).toBeVisible(COLD);
  await field.click();
  await expect(page.getByRole("option", { name: t("common.credit.split") })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(3);

  // And choosing it says what it comes to before he saves, not after. He is
  // giving away half of a figure he can see two inches above the field; the
  // preview is the same pure function the month is later summed from, so what
  // he agrees to here is what lands. A quantity first, because there is
  // nothing to divide until he has said what he is sending.
  await page.keyboard.press("Escape");
  const form = page.locator("form").first();
  await form.getByLabel(t("dispatches.sending")).first().fill("3");
  await field.click();
  await page.getByRole("option", { name: t("common.credit.split") }).click();
  const preview = page.locator('[data-slot="credit-preview"]');
  await expect(preview).toBeVisible();

  const sending = Number(
    (await page.locator('[data-slot="figure-sending"]').first().innerText()).replace(/[^\d.]/g, ""),
  );
  expect(sending).toBeGreaterThan(0);
  const shown = (await preview.innerText())
    .split("\n")
    .map((line) => Number(line.replace(/[^\d.]/g, "")))
    .filter((n) => n > 0);
  expect(shown).toHaveLength(2);
  // The halves add back to the figure above them, to the hundredth.
  expect(shown[0] + shown[1]).toBeCloseTo(sending, 6);
});
