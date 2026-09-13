import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { floorOfCompany, one, personName, query, restoreCompanyFloor, userId } from "./helpers/db";
import { choose, pickFirst, pressChip } from "./helpers/pick";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { formatSqmWhole } from "@/lib/money";

/**
 * Marketing is a rep in everything, plus a Leads module (SPEC §3 P13).
 *
 * Rewritten in P13-S5, and the reason written here as the charter asks: this
 * file used to be about a boundary — marketing works a company exactly as a rep
 * does and stops at the price, carrying no month (D44, D50). The founder's P13
 * sentence overrules both: "marketing carries a target and metres, quotes and
 * dispatches like a rep, and keeps its own module for passing leads." So what
 * is walked now is the other side of the same line: every door a rep has is
 * marketing's too, on its own customers, and the metres it sends are its own.
 * The one door it still does not have is Add company (D156 stands), which
 * tests/floor.spec.ts asks of the rule.
 *
 * The handover is checked from both ends, as before: the company leaves one
 * floor and arrives on the other. It is the SALES MANAGER who moves it, since
 * §3 — "not the owner's, not marketing's" — and the walk starts by proving that
 * the owner is not offered the control at all.
 *
 * Both locale projects run against one seeded database in file order
 * (playwright.config.ts), so every walk that writes puts it back in `finally`.
 */

const COLD = { timeout: 30_000 };
const MARKETING = "marketing@technopanel.com.sa";

/** SMAC's number for the approval, one per locale: the same number cannot be typed twice (D53). */
function smacNumber(locale: Locale): string {
  return locale === "en" ? "8850" : "8851";
}

/** The dispatch's own name, D-#, once the drawer holding it has loaded. */
async function nameOfTheOpenDispatch(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^D-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

/** The one line a quotation needs to be saved at all (tests/create.spec.ts). */
async function fillOneItem(form: Locator, t: Translate): Promise<void> {
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.pricePerSqm")).fill("120");
}

/**
 * Marketing's own customer with a job open on it and no paper of any kind yet —
 * the seeded one (scripts/seed/demo-data.ts, "m2"), found by what it is rather
 * than by its name. No paper matters twice: a quotation walk has something to
 * ask for, and the load raised after it can only be Direct.
 */
async function ownCustomer(): Promise<{
  id: string;
  name: string;
  project: string;
}> {
  return one<{ id: string; name: string; project: string }>(
    `select c.id, c.name, p.name as project
       from companies c
       join users u on u.id = c.rep_id
       join projects p on p.company_id = c.id and p.archived_at is null and p.lost_at is null
      where u.email = $1::text and c.archived_at is null
        and not exists (select 1 from quotations q where q.company_id = c.id)
        and not exists (select 1 from dispatches d where d.company_id = c.id)
      order by c.created_at, p.created_at
      limit 1`,
    [MARKETING],
  );
}

/**
 * What one person was credited in the current Riyadh month — this spec's own
 * copy of the figure (tests/credit.spec.ts and tests/dispatch-request.spec.ts
 * write the same one): each load's m² from its own lines, the leftover
 * hundredth to the last name.
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

async function removeQuotation(id: string): Promise<void> {
  await query("delete from notifications where subject_type = 'quotation' and subject_id = $1::uuid", [id]);
  await query("delete from audit_log where record_type = 'quotation' and record_id = $1::text", [id]);
  // Lines, services and credit go with it (on delete cascade).
  await query("delete from quotations where id = $1::uuid", [id]);
}

async function removeDispatch(id: string): Promise<void> {
  await query("delete from notifications where subject_type = 'dispatch' and subject_id = $1::uuid", [id]);
  await query("delete from audit_log where record_type = 'dispatch' and record_id = $1::text", [id]);
  await query("delete from dispatches where id = $1::uuid", [id]);
}

test("marketing is a rep in everything: its day carries a month, its rail the chain, and its own customer a price", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  await login(page, locale, "marketing");

  await test.step("1 · it opens on its day, as a rep does, and the day carries its month", async () => {
    // Its home was Leads while marketing only passed customers on (P12-7). A
    // rep in everything opens on what is waiting on him and how his month is
    // going, and the Leads module is one press away on the rail.
    await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);
    // A target and metres, like every rep (D168).
    await expect(page.getByText(t("day.myMonth")).first()).toBeVisible();
    await expect(page.locator('[data-slot="figure-achieved"]').first()).toBeVisible();
  });

  await test.step("2 · the rail carries a rep's screens and the Leads module", async () => {
    const nav = page.getByRole("navigation", { name: t("shell.mainNav") }).first();
    for (const label of [
      "day.title",
      "reports.title",
      "leads.title",
      "common.companies",
      "common.projects",
      "common.quotations",
      "common.dispatches",
    ]) {
      await expect(nav.getByRole("link", { name: t(label) }), `${label} missing`).toHaveCount(1);
    }
    // The desk is still the coordinator's.
    await expect(nav.getByRole("link", { name: t("common.queue") })).toHaveCount(0);
  });

  const customer = await ownCustomer();

  await test.step("3 · its own customer opens with everything a rep does with one, the price included", async () => {
    await page.goto(`/${locale}/companies`);
    await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
    // The door it still does not have: a customer reaches marketing's floor as
    // a lead it files, never through Add company (D156).
    await expect(page.getByRole("button", { name: t("forms.addCompany") })).toHaveCount(0);

    await page.goto(`/${locale}/companies?open=${customer.id}`);
    const drawer = page.getByRole("dialog", { name: customer.name });
    await expect(drawer).toBeVisible(COLD);
    await expect(drawer.getByRole("button", { name: t("common.addReport") }).first()).toBeVisible();
    await expect(
      drawer
        .getByRole("group", { name: t("drawer.companyActions") })
        .getByRole("button", { name: t("common.edit") }),
    ).toBeVisible();

    await drawer.getByRole("tab", { name: t("common.projects") }).click();
    await expect(
      drawer
        .getByRole("tabpanel", { name: t("common.projects") })
        .getByRole("button", { name: t("drawer.newProject") }),
    ).toBeVisible(COLD);

    // And the one thing it used to be refused: the price.
    await drawer.getByRole("tab", { name: t("common.quotations") }).click();
    await expect(drawer.getByRole("button", { name: t("quotations.request") })).toBeVisible(COLD);
  });

  await test.step("4 · both chain screens offer it their door", async () => {
    await page.goto(`/${locale}/quotations`);
    await expect(page.getByRole("button", { name: t("quotations.request") }).first()).toBeVisible(COLD);
    await page.goto(`/${locale}/dispatches`);
    await expect(page.getByRole("button", { name: t("dispatches.request") }).first()).toBeVisible(COLD);
  });
});

test("marketing requests a quotation and raises a dispatch on its own customer, and the metres count on its day", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Three sign-ins, two wide dialogs.

  const marketing = await userId(MARKETING);
  const customer = await ownCustomer();
  const qty = 4;
  let quotationId = "";
  let dispatchId = "";
  let dispatchName = "";
  let sqm = 0;

  try {
    await test.step("1 · it asks the desk for a price on its customer's job", async () => {
      await login(page, locale, "marketing");
      await page.goto(`/${locale}/quotations`);
      await page.getByRole("button", { name: t("quotations.request") }).first().click();

      const form = page.getByRole("dialog", { name: t("quotations.request") });
      const companyPicker = form.getByRole("combobox", { name: t("common.company") });
      await expect(companyPicker).toBeVisible(COLD);
      await choose(page, companyPicker, customer.name);
      const projectPicker = form.getByRole("combobox", { name: t("common.project") });
      await expect(projectPicker).toBeEnabled();
      await choose(page, projectPicker, customer.project);

      await fillOneItem(form, t);
      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
      quotationId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(quotationId).not.toBe("");

      // A request like a rep's: on the desk, waiting for the coordinator, and
      // marketing's own paper.
      const row = await one<{ rep_id: string; company_id: string; status: string }>(
        "select rep_id, company_id, status::text as status from quotations where id = $1::uuid",
        [quotationId],
      );
      expect(row).toEqual({ rep_id: marketing, company_id: customer.id, status: "requested" });
    });

    await test.step("2 · it raises a load on the same customer: nothing issued yet, so Direct", async () => {
      await page.goto(`/${locale}/dispatches`);
      await page.getByRole("button", { name: t("dispatches.request") }).first().click();

      const form = page.getByRole("dialog", { name: t("dispatches.request") });
      await choose(page, form.getByRole("combobox", { name: t("common.company") }), customer.name);
      const source = form.getByRole("combobox", { name: t("dispatches.source") });
      await expect(source.locator("bdi").first()).toHaveText(t("dispatches.direct"), COLD);

      const line = form.locator('[data-slot="dispatch-line"]').first();
      await line.getByLabel(t("common.colourCode")).fill("RAL 7016");
      for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
        await pickFirst(line.getByRole("combobox", { name: t(label) }));
      }
      await line.getByLabel(t("dispatches.sending")).fill(String(qty));
      await line.getByLabel(t("common.pricePerSqm")).fill("128");

      const width = Number(
        await line.getByRole("combobox", { name: t("common.width") }).locator("bdi").first().innerText(),
      );
      const length = Number(await line.getByLabel(t("common.length")).inputValue());
      sqm = Math.round(width * length * qty * 100) / 100;
      expect(sqm, "the line opened without a sheet size").toBeGreaterThan(0);

      await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
      await form.getByLabel(t("common.destination")).fill("Riyadh — Olaya, the office tower site");
      await pressChip(form, t("dispatches.payment.cash"));
      await pressChip(form, t("dispatches.payment.onDelivery"));
      await form.getByRole("button", { name: t("common.save") }).click();

      await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
      dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(dispatchId).not.toBe("");
      dispatchName = await nameOfTheOpenDispatch(page);

      // Marketing's load, credited to marketing.
      const row = await one<{ rep_id: string; company_id: string; credited: string[] }>(
        `select d.rep_id, d.company_id,
                (select array_agg(dc.user_id::text) from dispatch_credits dc where dc.dispatch_id = d.id) as credited
           from dispatches d where d.id = $1::uuid`,
        [dispatchId],
      );
      expect(row).toEqual({ rep_id: marketing, company_id: customer.id, credited: [marketing] });
    });

    const before = await creditedThisMonth(marketing);

    await test.step("3 · the desk approves it", async () => {
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

    await test.step("4 · its metres are marketing's this month, on its own day", async () => {
      const after = await creditedThisMonth(marketing);
      expect(after.toFixed(2)).toBe((before + sqm).toFixed(2));

      await login(page, locale, "marketing");
      await page.goto(`/${locale}/day`);
      await expect(page.locator('[data-slot="figure-achieved"]').first()).toContainText(
        formatSqmWhole(after),
        COLD,
      );
    });
  } finally {
    if (dispatchId) await removeDispatch(dispatchId);
    if (quotationId) await removeQuotation(quotationId);
  }
});

test("the sales manager moves a lead onto the floor that will price it", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // Marketing's own lead, first by name, and put back whatever happens: the
  // Arabic run and every spec after this one find it on marketing's floor.
  const lead = await one<{ id: string; name: string }>(
    `select c.id, c.name from companies c
       join users u on u.id = c.rep_id
      where u.email = $1::text and c.archived_at is null
      order by c.name
      limit 1`,
    [MARKETING],
  );
  const faisal = await personName("faisal@technopanel.com.sa", locale);
  const started = new Date();
  const floor = await floorOfCompany(lead.id);

  try {
    await test.step("1 · the owner is not offered the control", async () => {
      await login(page, locale, "marketing");
      await page.goto(`/${locale}/companies?open=${lead.id}`);
      const drawer = page.getByRole("dialog").first();
      await expect(drawer).toBeVisible(COLD);
      // Its own customer, every other button on the drawer its own — and this
      // one gone, because whose floor a company sits on is the manager's answer
      // (SPEC §3, which overrules D51).
      await expect(drawer.getByRole("button", { name: t("drawer.handOver") })).toHaveCount(0);
    });

    await test.step("2 · the manager opens the same drawer and it is there", async () => {
      await login(page, locale, "abdulrahman");
      await page.goto(`/${locale}/companies?open=${lead.id}`);
      const drawer = page.getByRole("dialog").first();
      await expect(drawer).toBeVisible(COLD);
      await drawer.getByRole("button", { name: t("drawer.handOver") }).click();
    });

    await test.step("3 · it asks who, and says what travels with the company", async () => {
      const dialog = page.getByRole("dialog", { name: t("drawer.handOverTitle", { name: lead.name }) });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(t("drawer.handOverWarning"));

      await dialog.getByRole("combobox").click();
      // The option carries the person's name and, under it, their role — one
      // accessible name of two parts, so this matches on the name inside it.
      await page.getByRole("option").filter({ hasText: faisal }).first().click();
      await dialog.getByRole("button", { name: t("drawer.handOver") }).click();
    });

    await test.step("4 · the company is on the other floor, and the move is on the record", async () => {
      await expect
        .poll(
          async () =>
            (await one<{ rep_id: string }>("select rep_id from companies where id = $1::uuid", [lead.id]))
              .rep_id,
          { timeout: 15_000 },
        )
        .not.toBe(floor.repId);

      // `record_id` is TEXT, not uuid: the audit log points at rows in a dozen
      // tables and does not pretend they share a key type (src/db/schema.ts).
      const audit = await query<{ action: string }>(
        `select action from audit_log
          where record_type = 'company' and record_id = $1::text and action = 'company.handOver'`,
        [lead.id],
      );
      expect(audit.length, "the handover was not audited").toBeGreaterThan(0);
    });
  } finally {
    await restoreCompanyFloor(floor);
    await query(
      `delete from notifications
        where subject_type = 'company' and subject_id = $1::uuid and created_at >= $2::timestamptz`,
      [lead.id, started],
    );
  }
});
