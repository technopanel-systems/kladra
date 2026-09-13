import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { choose, pickFirst, pressChip } from "./helpers/pick";
import { quotationLabel } from "@/lib/labels";
import { formatSqmWhole } from "@/lib/money";
import { quotationEvent } from "@/lib/quotation-events";

/**
 * P13-S3 — a dispatch is a load (SPEC §3, P13).
 *
 * Four of the founder's sentences, walked as the people they are about walk
 * them. The request opens on the quotation it comes from — every line at what
 * is left on it, every service — and whatever the rep changes is his to change;
 * what he changed is flagged for Rawan and recorded, and a partial load is not a
 * change. A customer with no paper gets a direct load, priced line by line, and
 * its metres count like any other. A refused request is corrected and sent
 * again from the record itself. And how a load is paid for is three choices with
 * nothing written in the boxes for him.
 *
 * Both locale projects run against one seeded database in file order
 * (playwright.config.ts), so every walk that writes takes it back in `finally`:
 * the Arabic run, and the dispatch chain after this file, find the floor the
 * seed left.
 */

const COLD = { timeout: 30_000 };

/** A line of the load, by the number it carries — the quotation's own (dispatch-lines.tsx). */
function loadLine(form: Locator, position: number): Locator {
  return form.locator(`[data-slot="dispatch-line"][data-position="${position}"]`);
}

/** The dispatch's own name, D-#, once the drawer holding it has loaded. */
async function nameOfTheOpenDispatch(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^D-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

/** A figure typed into a box, read back as a number: "120.00" and "120" are one. */
async function valueOf(box: Locator): Promise<number> {
  return Number((await box.inputValue()).replace(/,/g, ""));
}

/** Shipment, destination, cash on delivery — the answers every load needs. */
async function fillTheDetails(form: Locator, t: Translate, destination: string): Promise<void> {
  await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
  await form.getByLabel(t("common.destination")).fill(destination);
  await pressChip(form, t("dispatches.payment.cash"));
  await pressChip(form, t("dispatches.payment.onDelivery"));
}

/** The queue's row for this dispatch, by its exact name (D-2 is inside D-21). */
function queueRow(page: Page, label: string): Locator {
  return page
    .getByRole("row")
    .filter({ has: page.getByText(label, { exact: true }) })
    .filter({ visible: true })
    .first();
}

/** A dispatch this file raised, and everything hanging off it. */
async function removeDispatch(id: string): Promise<void> {
  await query("delete from notifications where subject_type = 'dispatch' and subject_id = $1::uuid", [id]);
  await query("delete from audit_log where record_type = 'dispatch' and record_id = $1::text", [id]);
  // Lines, services and credit go with it (on delete cascade).
  await query("delete from dispatches where id = $1::uuid", [id]);
}

/**
 * A quotation a dispatch of this file answered goes back to unanswered, as the
 * seed left it — the same undo tests/two-hands.spec.ts writes, and for the same
 * reason: raising a load accepts the paper (P12-10).
 */
async function unanswer(id: string): Promise<void> {
  await query(
    `update quotations set status = 'issued', decided_at = null, decision_reason = null
      where id = $1::uuid and status = 'accepted'`,
    [id],
  );
  await query(
    `delete from audit_log
      where record_type = 'quotation' and record_id = $1::text
        and action = $2::text and details->>'impliedBy' = 'dispatch'`,
    [id, quotationEvent("accepted")],
  );
}

/** How many of a quotation line's panels are on a waiting or approved load. */
const COMMITTED = `(select coalesce(sum(di.qty), 0)
                      from dispatch_items di
                      join dispatches d on d.id = di.dispatch_id
                     where di.quotation_item_id = qi.id
                       and d.status in ('submitted', 'approved'))`;

/**
 * What one person was credited in the current Riyadh month — this spec's own
 * copy of the figure (tests/credit.spec.ts writes the same one): each load's m²
 * from its own lines, the leftover hundredth to the last name.
 */
async function creditedThisMonth(userIdValue: string): Promise<number> {
  const row = await one<{ sqm: string }>(
    `with d as (
       select dd.id, round(coalesce(sum(round(di.width * di.length * di.qty, 2)), 0), 2) as sqm
         from dispatches dd
         join dispatch_items di on di.dispatch_id = dd.id
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
    [userIdValue],
  );
  return Number(row.sqm);
}

/** One of Faisal's customers with no quotation at all, so the only load it can have is direct. */
async function customerWithNoPaper(faisal: string): Promise<{ id: string; name: string }> {
  return one<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
      where c.rep_id = $1::uuid and c.archived_at is null
        and not exists (select 1 from quotations q where q.company_id = c.id)
      order by c.name
      limit 1`,
    [faisal],
  );
}

/** SMAC's number for the approval, one per locale: the same number cannot be typed twice (D53). */
function smacNumber(locale: Locale): string {
  return locale === "en" ? "8830" : "8831";
}

test("a load opens on its quotation's lines and services, and the two things the rep changed are what the desk reads", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Two sign-ins, a dialog with a table in it.

  const faisal = await userId("faisal@technopanel.com.sa");
  /*
   * A customer of his whose NEWEST paper with panels left on it — the one the
   * dialog chooses for him (dispatchTargets, newest first) — carries services.
   * Asked the way the picker asks it, so "preselected" is checked against the
   * rule rather than against the seed's order.
   */
  const paper = await one<{
    id: string;
    number: number;
    revision: number;
    status: string;
    smac: string | null;
    company: string;
  }>(
    `with live as (
       select q.id, q.number, q.revision, q.status::text as status, q.smac_number as smac,
              q.company_id, c.name as company
         from quotations q
         join companies c on c.id = q.company_id
        where c.rep_id = $1::uuid and c.archived_at is null
          and q.status in ('issued', 'accepted')
          and not exists (select 1 from quotations later
                           where later.number = q.number and later.revision > q.revision)
          and exists (select 1 from quotation_items qi
                       where qi.quotation_id = q.id and qi.qty > ${COMMITTED})
     )
     select l.id, l.number, l.revision, l.status, l.smac, l.company
       from live l
      where l.number = (select max(o.number) from live o where o.company_id = l.company_id)
        and exists (select 1 from quotation_services s where s.quotation_id = l.id)
      order by l.number
      limit 1`,
    [faisal],
  );
  const label = quotationLabel(paper.number, paper.revision);

  const lines = await query<{ position: number; left: number; price: string }>(
    `select qi.position, (qi.qty - ${COMMITTED})::int as left, qi.price_per_sqm::text as price
       from quotation_items qi
      where qi.quotation_id = $1::uuid
      order by qi.position`,
    [paper.id],
  );
  const open = lines.filter((line) => line.left > 0);
  const paperServices = await query<{ position: number; sqm: string }>(
    `select position, sqm::text as sqm from quotation_services
      where quotation_id = $1::uuid order by position`,
    [paper.id],
  );
  // A service the paper does not have, where there is one: an addition reads as one.
  const extra = await one<{ name: string }>(
    `select case when $2::text = 'ar' then s.name_ar else s.name_en end as name
       from services s
      where s.active
      order by (s.id in (select service_id from quotation_services where quotation_id = $1::uuid)),
               s.sort_order
      limit 1`,
    [paper.id, locale],
  );

  const changed = open[0];
  const newPrice = (Number(changed.price) + 7).toFixed(2);
  let dispatchId = "";

  try {
    await test.step("the customer first, and his newest paper is already chosen", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/dispatches`);
      await page.getByRole("button", { name: t("dispatches.request") }).first().click();

      const form = page.getByRole("dialog", { name: t("dispatches.request") });
      await choose(page, form.getByRole("combobox", { name: t("common.company") }), paper.company);
      const source = form.getByRole("combobox", { name: t("dispatches.source") });
      await expect(source.locator("bdi").first()).toHaveText(label, COLD);
    });

    const form = page.getByRole("dialog", { name: t("dispatches.request") });

    await test.step("every line with something left opens at what is left, and every service with it", async () => {
      await expect(form.locator('[data-slot="dispatch-line"]')).toHaveCount(open.length, COLD);
      for (const line of open) {
        const row = loadLine(form, line.position);
        await expect(row).toHaveAttribute("data-carried", "true");
        await expect(row.locator('[data-slot="figure-left"]')).toHaveText(String(line.left));
        await expect(row.getByLabel(t("dispatches.sending"))).toHaveValue(String(line.left));
        expect(await valueOf(row.getByLabel(t("common.pricePerSqm")))).toBe(Number(line.price));
      }

      const services = form.locator('[data-slot="quotation-service"]');
      await expect(services).toHaveCount(paperServices.length);
      for (const [index, service] of paperServices.entries()) {
        const sqm = services.nth(index).getByLabel(t("common.sqm"), { exact: true });
        expect(await valueOf(sqm)).toBe(Number(service.sqm));
      }

      // Nothing touched is nothing to flag.
      await expect(form.locator('[data-slot="form-differs"]')).toHaveCount(0);
    });

    await test.step("one of each goes, which is a partial load and not a difference", async () => {
      // One sheet a line, so the Arabic run behind this one still finds panels.
      for (const line of open) {
        await loadLine(form, line.position).getByLabel(t("dispatches.sending")).fill("1");
      }
      await expect(form.locator('[data-slot="form-differs"]')).toHaveCount(0);
    });

    await test.step("a price agreed on the phone and a service added are flagged as he types", async () => {
      await loadLine(form, changed.position).getByLabel(t("common.pricePerSqm")).fill(newPrice);

      const services = form.locator('[data-slot="quotation-service"]');
      await form.getByRole("button", { name: t("quotations.addService") }).click();
      await expect(services).toHaveCount(paperServices.length + 1);
      const added = services.nth(paperServices.length);
      await choose(page, added.getByRole("combobox", { name: t("quotations.service") }), extra.name);
      await added.getByLabel(t("common.sqm"), { exact: true }).fill("25");
      await added.getByLabel(t("common.pricePerSqm"), { exact: true }).fill("18");

      await expect(form.locator('[data-slot="form-differs"]')).toHaveText(
        t("dispatches.formDiffers", { label }),
      );

      await fillTheDetails(form, t, "Riyadh — showroom site, gate 2");
      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
      dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(dispatchId).not.toBe("");
    });

    const dispatchName = await nameOfTheOpenDispatch(page);

    await test.step("the drawer names exactly those two, above the buttons", async () => {
      const sheet = page.getByRole("dialog", { name: dispatchName });
      const differs = sheet.locator('[data-slot="differs"]');
      await expect(differs).toBeVisible(COLD);
      // Named as the drawer's own facts name the paper: SMAC's number first (P12-11).
      await expect(differs.getByRole("heading")).toHaveText(
        t("dispatches.differsFrom", { label: paper.smac ?? label }),
      );

      const entries = differs.locator(":scope > ul > li");
      await expect(entries).toHaveCount(2);
      const line = entries.nth(0);
      await expect(line).toHaveAttribute("data-change-of", "line");
      await expect(line).toHaveAttribute("data-change", "changed");
      await expect(line.locator("li[data-field]")).toHaveCount(1);
      await expect(line.locator("li[data-field]")).toHaveAttribute("data-field", "pricePerSqm");
      await expect(line).toContainText(newPrice);

      const service = entries.nth(1);
      await expect(service).toHaveAttribute("data-change-of", "service");
      await expect(service).toHaveAttribute("data-change", "added");
      await expect(service).toContainText(extra.name);
    });

    await test.step("recorded for later: two entries, from and to, and the trail says so", async () => {
      const row = await one<{ difference: unknown }>(
        "select quotation_difference as difference from dispatches where id = $1::uuid",
        [dispatchId],
      );
      const lastService = Math.max(...paperServices.map((service) => service.position));
      expect(row.difference).toEqual([
        {
          kind: "line",
          position: changed.position,
          change: "changed",
          field: "pricePerSqm",
          from: Number(changed.price).toFixed(2),
          to: newPrice,
        },
        { kind: "service", position: lastService + 1, change: "added" },
      ]);

      const audit = await one<{ differsFrom: string | null; differences: number | null }>(
        `select details->>'differsFrom' as "differsFrom", (details->>'differences')::int as differences
           from audit_log
          where record_type = 'dispatch' and record_id = $1::text and action = 'dispatch.request'`,
        [dispatchId],
      );
      expect(audit).toEqual({ differsFrom: label, differences: 2 });
    });

    await test.step("and Rawan's queue row says it in words before she opens it", async () => {
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/queue`);
      const row = queueRow(page, dispatchName);
      await expect(row).toBeVisible(COLD);
      await expect(row.locator('[data-slot="differs-chip"]')).toHaveText(t("dispatches.differsChip"));
    });
  } finally {
    if (dispatchId) await removeDispatch(dispatchId);
    if (paper.status === "issued") await unanswer(paper.id);
  }
});

test("a direct dispatch: no quotation, one priced line, approved, and the metres are the rep's", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Three sign-ins.

  const faisal = await userId("faisal@technopanel.com.sa");
  const customer = await customerWithNoPaper(faisal);
  const qty = 5;
  let dispatchId = "";
  let dispatchName = "";
  let sqm = 0;

  try {
    await test.step("a customer with no paper has one source, Direct, and one empty line", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/dispatches`);
      await page.getByRole("button", { name: t("dispatches.request") }).first().click();

      const form = page.getByRole("dialog", { name: t("dispatches.request") });
      await choose(page, form.getByRole("combobox", { name: t("common.company") }), customer.name);
      const source = form.getByRole("combobox", { name: t("dispatches.source") });
      await expect(source.locator("bdi").first()).toHaveText(t("dispatches.direct"), COLD);
      await expect(form.getByText(t("dispatches.directHint"))).toBeVisible();

      const lines = form.locator('[data-slot="dispatch-line"]');
      await expect(lines).toHaveCount(1);
      // Nothing is left to send on a paper that does not exist, and no service
      // is carried from one.
      await expect(form.locator('[data-slot="line-left"]')).toHaveCount(0);
      await expect(form.locator('[data-slot="quotation-service"]')).toHaveCount(0);
    });

    await test.step("he prices the line himself and raises it", async () => {
      const form = page.getByRole("dialog", { name: t("dispatches.request") });
      const line = form.locator('[data-slot="dispatch-line"]').first();
      await line.getByLabel(t("common.colourCode")).fill("RAL 9016");
      for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
        await pickFirst(line.getByRole("combobox", { name: t(label) }));
      }
      await line.getByLabel(t("dispatches.sending")).fill(String(qty));
      await line.getByLabel(t("common.pricePerSqm")).fill("130");

      const width = Number(
        await line.getByRole("combobox", { name: t("common.width") }).locator("bdi").first().innerText(),
      );
      const length = Number(await line.getByLabel(t("common.length")).inputValue());
      sqm = Math.round(width * length * qty * 100) / 100;
      expect(sqm, "the line opened without a sheet size").toBeGreaterThan(0);

      await fillTheDetails(form, t, "Riyadh — the workshop, Al Sulay");
      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
      dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(dispatchId).not.toBe("");
      dispatchName = await nameOfTheOpenDispatch(page);

      // Where a quotation number would be, the word — never a blank or a dead link.
      const sheet = page.getByRole("dialog", { name: dispatchName });
      await expect(sheet.locator('[data-slot="fact-direct"]')).toHaveText(t("dispatches.direct"));
      await expect(sheet.locator('[data-slot="differs"]')).toHaveCount(0);

      const row = await one<{
        quotation_id: string | null;
        project_id: string | null;
        difference: unknown;
        company_id: string;
        price: string;
        qty: number;
        credited: string[];
      }>(
        `select d.quotation_id, d.project_id, d.quotation_difference as difference, d.company_id,
                di.price_per_sqm::text as price, di.qty,
                (select array_agg(dc.user_id::text) from dispatch_credits dc where dc.dispatch_id = d.id) as credited
           from dispatches d
           join dispatch_items di on di.dispatch_id = d.id
          where d.id = $1::uuid`,
        [dispatchId],
      );
      expect(row).toEqual({
        quotation_id: null,
        project_id: null,
        difference: null,
        company_id: customer.id,
        price: "130.00",
        qty,
        credited: [faisal],
      });
    });

    const before = await creditedThisMonth(faisal);

    await test.step("the desk approves it, with nothing to ask of a paper it does not have", async () => {
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/queue?dispatch=${dispatchId}`);
      const sheet = page.getByRole("dialog", { name: dispatchName });
      await expect(sheet).toBeVisible(COLD);
      await sheet.getByRole("button", { name: t("dispatches.approve") }).click();
      const ask = page.getByRole("dialog", {
        name: t("dispatches.approveTitle", { label: dispatchName }),
      });
      await ask.getByLabel(t("common.smacDispatchNumber")).fill(smacNumber(locale));
      await ask.getByRole("button", { name: t("dispatches.approve") }).click();
      await expect(page.getByText(t("dispatches.approved", { label: dispatchName }))).toBeVisible(
        COLD,
      );
    });

    await test.step("its metres are Faisal's this month, on his own card", async () => {
      const after = await creditedThisMonth(faisal);
      expect(after.toFixed(2)).toBe((before + sqm).toFixed(2));

      await login(page, locale, "faisal");
      await page.goto(`/${locale}/day`);
      await expect(page.locator('[data-slot="figure-achieved"]').first()).toContainText(
        formatSqmWhole(after),
        COLD,
      );
    });
  } finally {
    if (dispatchId) await removeDispatch(dispatchId);
  }
});

test("a refused dispatch is corrected and sent again, back on the desk, its difference worked out again", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Two sign-ins and a dialog.

  const start = new Date();
  const refused = await one<{
    id: string;
    number: number;
    quotation_id: string;
    reason: string;
    difference: string;
    updated_at: string;
    smac: string | null;
    q_number: number;
    q_revision: number;
  }>(
    `select d.id, d.number, d.quotation_id, d.refuse_reason as reason,
            d.quotation_difference::text as difference, d.updated_at::text as updated_at,
            q.smac_number as smac, q.number as q_number, q.revision as q_revision
       from dispatches d
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = d.company_id
       join users u on u.id = c.rep_id
      where d.status = 'refused' and u.email = 'faisal@technopanel.com.sa'
      order by d.created_at
      limit 1`,
  );
  const label = `D-${refused.number}`;
  const paperLabel = quotationLabel(refused.q_number, refused.q_revision);

  // What it holds now, to put back: its lines by number, and the bell it rang.
  const lines = await query<{ position: number; qty: number; price: string; left: number }>(
    `select di.position, di.qty, di.price_per_sqm::text as price,
            (qi.qty - (select coalesce(sum(o.qty), 0)
                         from dispatch_items o
                         join dispatches od on od.id = o.dispatch_id
                        where o.quotation_item_id = qi.id
                          and od.status in ('submitted', 'approved')))::int as left
       from dispatch_items di
       join quotation_items qi on qi.id = di.quotation_item_id
      where di.dispatch_id = $1::uuid
      order by di.position`,
    [refused.id],
  );
  const bell = await one<{ rows: string }>(
    `select coalesce(json_agg(n), '[]'::json)::text as rows
       from notifications n
      where n.subject_type = 'dispatch' and n.subject_id = $1::uuid`,
    [refused.id],
  );
  const line = lines.find((row) => row.left >= 1);
  if (!line) throw new Error("the refused dispatch has no line with anything left on its paper");
  const newPrice = (Number(line.price) + 5).toFixed(2);

  try {
    await test.step("Faisal opens it from the record, not from nothing", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/dispatches?open=${refused.id}`);
      const sheet = page.getByRole("dialog", { name: label });
      await expect(sheet).toBeVisible(COLD);
      await expect(sheet.getByText(refused.reason).first()).toBeVisible();
      await sheet.getByRole("button", { name: t("dispatches.editRequest") }).click();

      const form = page.getByRole("dialog", { name: t("dispatches.editRequest") });
      const row = loadLine(form, line.position);
      // The load as it was sent, against what its paper has left without it.
      await expect(row.getByLabel(t("dispatches.sending"))).toHaveValue(String(line.qty), COLD);
      await expect(row.locator('[data-slot="figure-left"]')).toHaveText(String(line.left));
      // Its customer and its paper are what it is; only the load moves.
      await expect(form.getByRole("combobox", { name: t("common.company") })).toBeDisabled();
      await expect(form.getByRole("combobox", { name: t("dispatches.source") })).toBeDisabled();
    });

    await test.step("he corrects the quantity and the price, and sends it again", async () => {
      const form = page.getByRole("dialog", { name: t("dispatches.editRequest") });
      const row = loadLine(form, line.position);
      await row.getByLabel(t("dispatches.sending")).fill("1");
      await row.getByLabel(t("common.pricePerSqm")).fill(newPrice);
      await expect(form.locator('[data-slot="form-differs"]')).toHaveText(
        t("dispatches.formDiffers", { label: paperLabel }),
      );
      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("dispatches.updated"))).toBeVisible(COLD);

      const saved = await one<{ status: string; reason: string | null; difference: unknown; qty: number }>(
        `select d.status, d.refuse_reason as reason, d.quotation_difference as difference, di.qty
           from dispatches d
           join dispatch_items di on di.dispatch_id = d.id and di.position = $2::int
          where d.id = $1::uuid`,
        [refused.id, line.position],
      );
      expect(saved.status).toBe("submitted");
      expect(saved.reason, "the refusal outlived the state it explained").toBeNull();
      expect(saved.qty).toBe(1);
      // Worked out again from the load as it is now: what it was refused with
      // is gone, and what he changed is there.
      expect(saved.difference).toEqual([
        {
          kind: "line",
          position: line.position,
          change: "changed",
          field: "pricePerSqm",
          from: Number(line.price).toFixed(2),
          to: newPrice,
        },
      ]);
    });

    await test.step("it is back on Rawan's queue, flagged", async () => {
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/queue`);
      const row = queueRow(page, label);
      await expect(row).toBeVisible(COLD);
      await expect(row.locator('[data-slot="differs-chip"]')).toHaveText(t("dispatches.differsChip"));
    });
  } finally {
    // Back to the seed's refused request, as it was: the load, the state, the
    // record of it, and the bell the refusal rang for him.
    for (const row of lines) {
      await query(
        `update dispatch_items set qty = $3::int, price_per_sqm = $4::numeric
          where dispatch_id = $1::uuid and position = $2::int`,
        [refused.id, row.position, row.qty, row.price],
      );
    }
    await query(
      `update dispatches
          set status = 'refused', refuse_reason = $2::text,
              quotation_difference = $3::jsonb, updated_at = $4::timestamptz
        where id = $1::uuid`,
      [refused.id, refused.reason, refused.difference, refused.updated_at],
    );
    await query(
      `delete from audit_log
        where record_type = 'dispatch' and record_id = $1::text and at >= $2::timestamptz`,
      [refused.id, start.toISOString()],
    );
    await query(
      `delete from notifications
        where subject_type = 'dispatch' and subject_id = $1::uuid and created_at >= $2::timestamptz`,
      [refused.id, start.toISOString()],
    );
    await query(
      `insert into notifications
       select * from json_populate_recordset(null::notifications, $1::json)
       on conflict (id) do nothing`,
      [bell.rows],
    );
  }
});

test("payment is three choices with nothing written in the boxes, and credit without the terms is refused at the field", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const customer = await customerWithNoPaper(faisal);
  const count = async () =>
    (
      await one<{ n: number }>("select count(*)::int as n from dispatches where company_id = $1::uuid", [
        customer.id,
      ])
    ).n;
  const before = await count();

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/dispatches`);
  await page.getByRole("button", { name: t("dispatches.request") }).first().click();
  const form = page.getByRole("dialog", { name: t("dispatches.request") });
  await choose(page, form.getByRole("combobox", { name: t("common.company") }), customer.name);
  await expect(form.locator('[data-slot="dispatch-line"]')).toHaveCount(1, COLD);

  await test.step("three answers, credit and tasaheel being one of them", async () => {
    const terms = form.locator('input[name="paymentTerms"]');
    await expect(terms).toHaveCount(3);
    for (const key of ["bankTransfer", "cash", "credit"]) {
      await expect(form.getByRole("radio", { name: t(`dispatches.payment.${key}`), exact: true })).toHaveCount(1);
    }
  });

  await test.step("no payment box carries words written for him (SPEC §3)", async () => {
    // Asked with the second question showing too, so every payment field is on screen.
    await pressChip(form, t("dispatches.payment.bankTransfer"));
    const fields = form.locator(
      'input[name="paymentTerms"], input[name="paymentDetail"], [name="paymentNote"]',
    );
    await expect(fields.first()).toBeAttached();
    for (const field of await fields.all()) {
      await expect(field).not.toHaveAttribute("placeholder");
    }
    await expect(form.locator('[name^="payment"][placeholder]')).toHaveCount(0);
  });

  await test.step("credit with the terms left blank is refused at the note, and nothing is written", async () => {
    const line = form.locator('[data-slot="dispatch-line"]').first();
    await line.getByLabel(t("common.colourCode")).fill("RAL 7016");
    for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
      await pickFirst(line.getByRole("combobox", { name: t(label) }));
    }
    await line.getByLabel(t("dispatches.sending")).fill("2");
    await line.getByLabel(t("common.pricePerSqm")).fill("120");
    await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
    await form.getByLabel(t("common.destination")).fill("Riyadh — site office");

    await pressChip(form, t("dispatches.payment.credit"));
    const note = form.getByLabel(t("common.paymentNote"));
    await expect(note).not.toHaveAttribute("placeholder");
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(note).toHaveAttribute("aria-invalid", "true", COLD);
    await expect(form.locator("#dispatch-payment-note-error")).toHaveText(
      t("dispatches.payment.noteRequired"),
    );
    await expect(form).toBeVisible();
    expect(await count()).toBe(before);
  });
});
