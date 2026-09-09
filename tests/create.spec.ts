import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { choose, pickFirst, pressChip } from "./helpers/pick";

/**
 * P8.2 — a primary button of its own on Projects, Quotations and Dispatches
 * (WORKFLOW §3).
 *
 * Before this, a project was only born inside its company, a quotation inside
 * a project, and a dispatch against a quotation opened from that quotation's
 * own drawer — so the list screen a person actually lands on had nothing to
 * press, and Jerom, standing on the Projects screen, had to go and find the
 * company first. Each create dialog now asks for its parent as its own first
 * field, and the three list screens each get a button.
 *
 * Faisal walks all three, once each. Every choice made from a picker is
 * checked against the DATABASE afterwards, not against the seed
 * (manager.spec.ts's rule) — the row a test acts on is found with a query, so
 * the spec still means something once the seed changes.
 *
 * Rawan owns no company, so nothing she could pick a project or a quotation
 * from exists either. The fourth test is the negative: a button whose
 * dropdown would open empty is never drawn.
 */

/** Toasts and first navigations, with room for a cold Turbopack route. */
const COLD = { timeout: 30_000 };

/** A dialog or drawer by its title, exactly as the other specs name it. */
function dialogNamed(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name });
}

/**
 * Opens a searchable select and picks the option carrying this exact text.
 *
 * Scoped to the popover's own content (`data-slot="popover-content"`,
 * src/components/ui/popover.tsx) rather than searched across the whole page:
 * the list screen this dialog sits on top of shows these very same labels —
 * a quotation's own number on the dispatches list, a project's name on the
 * quotations list — and an open dialog does not stop Playwright from seeing
 * text underneath it, so an unscoped search can match the wrong one.
 */
/**
 * Fills the one line a quotation needs to be saved at all. Width, length,
 * thickness and quantity already open on a sensible default (S32); only the
 * fields with no default are touched, and whichever option each list offers
 * first is enough to prove the field works, same as rep.spec.ts and
 * quotations.spec.ts.
 */
async function fillOneItem(form: Locator, t: Translate): Promise<void> {
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.pricePerSqm")).fill("120");
}

/** Shipment, destination and payment terms — every dispatch request needs them. */
async function fillTheDetails(form: Locator, t: Translate): Promise<void> {
  await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
  await form.getByLabel(t("common.destination")).fill("Riyadh — King Fahd Road, site gate");
  // A bank transfer of the whole amount, which is the ordinary one (SPEC §3).
  await pressChip(form, t("dispatches.payment.bankTransfer"));
  await pressChip(form, t("dispatches.payment.fullAmount"));
}

/** The quotation's own name, Q-#, once its drawer has actually loaded. */
async function nameOfTheOpenQuotation(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^Q-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

/** The dispatch's own name, D-#, once its drawer has actually loaded. */
async function nameOfTheOpenDispatch(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^D-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

/** src/lib/labels.ts's own rule — needed here to know what text the picker's option carries. */
function quotationLabel(number: number, revision: number): string {
  return revision > 1 ? `Q-${number}/${revision}` : `Q-${number}`;
}

test("a project is added from the projects screen, without going to find its company", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<{ id: string; name: string }>(
    `select id, name from companies
      where rep_id = $1::uuid and archived_at is null
      order by name
      limit 1`,
    [faisal],
  );
  // Unique to this run: the file may run against a database this same spec
  // already wrote to a moment ago (this file is not reseeded between the two
  // locale projects — playwright.config.ts).
  const projectName = `P8.2 project ${locale.toUpperCase()} ${Date.now()}`;

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/projects`);

  await test.step("the button asks for the company first, by name — never a trip to find it", async () => {
    await page.getByRole("button", { name: t("projects.newProject") }).first().click();

    const form = dialogNamed(page, t("projects.newProject"));
    const picker = form.getByRole("combobox", { name: t("common.company") });
    await expect(picker).toContainText(t("common.pickCompany"));

    await choose(page, picker, company.name);
    await expect(picker).toContainText(company.name);

    await form.getByLabel(t("common.name"), { exact: true }).fill(projectName);
    await form.getByRole("button", { name: t("common.save") }).click();
  });

  await test.step("saving opens the new project, born on the company that was chosen", async () => {
    await expect(page.getByText(t("projects.created"))).toBeVisible(COLD);
    await expect(page).toHaveURL(new RegExp(`/${locale}/projects\\?.*open=`), COLD);
    const projectId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(projectId).not.toBe("");
    await expect(dialogNamed(page, projectName)).toBeVisible();

    const row = await one<{ company_id: string }>(
      "select company_id from projects where id = $1::uuid",
      [projectId],
    );
    expect(row.company_id, "the project landed on a company other than the one picked").toBe(
      company.id,
    );
  });
});

test("a quotation is requested from the quotations screen", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const project = await one<{
    id: string;
    name: string;
    company_id: string;
    company_name: string;
  }>(
    `select p.id, p.name, c.id as company_id, c.name as company_name
       from projects p
       join companies c on c.id = p.company_id
      where p.rep_id = $1::uuid
        and c.archived_at is null
        and p.archived_at is null
        and p.lost_at is null
      order by p.created_at, p.id
      limit 1`,
    [faisal],
  );

  // Who at the customer, and a store that is NOT the one the form opens on —
  // a field that is only ever left alone is a field nobody has proved works.
  const person = await one<{ id: string; name: string }>(
    `select id, name from contacts
      where company_id = $1::uuid and archived_at is null
      order by created_at
      limit 1`,
    [project.company_id],
  );
  const store = await one<{ id: number; name_en: string; name_ar: string }>(
    `select id, name_en, name_ar from warehouses
      where active order by sort_order desc, id desc limit 1`,
  );
  const storeName = locale === "ar" ? store.name_ar : store.name_en;

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);

  await test.step("company → project → contact, in the order a rep has the answers", async () => {
    await page.getByRole("button", { name: t("quotations.request") }).first().click();

    const form = dialogNamed(page, t("quotations.request"));
    const companyPicker = form.getByRole("combobox", { name: t("common.company") });
    // The pickers are gated behind the same lookups the lines need (suppliers,
    // fire ratings, classes), so they can arrive a moment after the dialog does.
    await expect(companyPicker).toBeVisible(COLD);
    await expect(companyPicker).toContainText(t("common.pickCompany"));

    // Until a customer is named there is nothing to choose from: the job list
    // used to be every job in the building (P12-9).
    const projectPicker = form.getByRole("combobox", { name: t("common.project") });
    await expect(projectPicker).toContainText(t("common.pickCompanyFirst"));
    await expect(projectPicker).toBeDisabled();

    await choose(page, companyPicker, project.company_name);
    await expect(companyPicker).toContainText(project.company_name);
    await expect(projectPicker).toBeEnabled();

    await choose(page, projectPicker, project.name);
    await expect(projectPicker).toContainText(project.name);

    await choose(page, form.getByRole("combobox", { name: t("common.contact") }), person.name);
    await choose(page, form.getByRole("combobox", { name: t("common.warehouse") }), storeName);
  });

  await test.step("the line asks its nine boxes in the founder's order, quantity fifth", async () => {
    const form = dialogNamed(page, t("quotations.request"));
    const line = form.locator('[data-slot="quotation-line"]').first();
    // SPEC §3, word for word: "Colour code · Supplier (N/K/C/D) · Fire rating
    // (B1/A2/Normal) · Class · Qty · Thickness · Width · Length · Price per m²".
    // Read off the DOM in drawing order, so moving one box fails here and not
    // in somebody's hands.
    await expect(line.locator("label")).toHaveText([
      t("common.colourCode"),
      t("common.supplier"),
      t("common.fireRating"),
      t("common.class"),
      t("common.qty"),
      t("common.thickness"),
      t("common.width"),
      t("common.length"),
      t("common.pricePerSqm"),
    ]);

    // The widths a sheet actually comes in are a list, and anything else is
    // typed (§3, src/lib/sheet.ts). Nothing had ever opened this control.
    const width = line.getByRole("combobox", { name: t("common.width") });
    await expect(width).toContainText("1.24");
    await choose(page, width, "1.5");
    await expect(width).toContainText("1.5");

    await line.getByLabel(t("common.qty")).fill("12");
    await fillOneItem(form, t);
    await form.getByRole("button", { name: t("common.save") }).click();
  });

  await test.step("it lands on the new quotation, with everything that was chosen on it", async () => {
    await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
    await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
    const quotationId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(quotationId).not.toBe("");

    const label = await nameOfTheOpenQuotation(page);
    const drawer = dialogNamed(page, label);
    await expect(drawer).toBeVisible();
    // The store and the person are on the paper the coordinator will read.
    await expect(drawer).toContainText(storeName);
    await expect(drawer).toContainText(person.name);

    const row = await one<{
      company_id: string;
      project_id: string | null;
      contact_id: string | null;
      warehouse_id: number;
    }>(
      `select company_id, project_id, contact_id, warehouse_id
         from quotations where id = $1::uuid`,
      [quotationId],
    );
    expect(row.company_id, "the quotation's company is not the picked project's own").toBe(
      project.company_id,
    );
    expect(row.project_id, "the quotation did not land on the project picked").toBe(project.id);
    expect(row.contact_id, "the quotation is not addressed to the person picked").toBe(person.id);
    expect(Number(row.warehouse_id), "the quotation is not out of the store picked").toBe(
      Number(store.id),
    );

    // Width and quantity as typed, and the metres they make: the one figure on
    // this screen a rep has to trust is the product of the two controls this
    // walk is the first thing ever to open (rules/data.md).
    const line = await one<{ width: string; qty: number; sqm: string }>(
      "select width, qty, sqm from quotation_items where quotation_id = $1::uuid",
      [quotationId],
    );
    expect(Number(line.width)).toBe(1.5);
    expect(Number(line.qty)).toBe(12);
    expect(Number(line.sqm)).toBeCloseTo(1.5 * 5.8 * 12, 2);
  });
});

test("a dispatch is requested from the dispatches screen", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const quotation = await one<{
    id: string;
    number: number;
    revision: number;
    company_name: string;
    warehouse_en: string;
    warehouse_ar: string;
  }>(
    `select q.id, q.number, q.revision, c.name as company_name,
            w.name_en as warehouse_en, w.name_ar as warehouse_ar
       from quotations q
       join companies c on c.id = q.company_id
       join warehouses w on w.id = q.warehouse_id
      where c.rep_id = $1::uuid
        -- Either state goods may move against (DISPATCHABLE), not issued
        -- alone: since P12-10 raising a dispatch answers the quotation it is
        -- raised on, so the walks that raise one leave accepted quotations
        -- behind them, and a fixture demanding an unanswered one would starve
        -- the specs that genuinely need one.
        and q.status in ('issued', 'accepted')
        and not exists (
          select 1 from quotations later
           where later.number = q.number and later.revision > q.revision
        )
        and exists (
          select 1 from quotation_items qi
           where qi.quotation_id = q.id
             and qi.qty > (
               select coalesce(sum(di.qty), 0)
                 from dispatch_items di
                 join dispatches d on d.id = di.dispatch_id
                where di.quotation_item_id = qi.id
                  and d.status in ('submitted', 'approved')
             )
        )
      order by q.created_at
      limit 1`,
    [faisal],
  );
  const label = quotationLabel(quotation.number, quotation.revision);

  // What is left on each line, read the same way the app reads it (D12), so
  // the box filled in is one that is actually still open to fill in.
  const lines = await query<{ id: string; remaining: string }>(
    `select qi.id,
            (qi.qty - coalesce((
               select sum(di.qty)
                 from dispatch_items di
                 join dispatches d on d.id = di.dispatch_id
                where di.quotation_item_id = qi.id
                  and d.status in ('submitted', 'approved')
             ), 0))::text as remaining
       from quotation_items qi
      where qi.quotation_id = $1::uuid
      order by qi.position`,
    [quotation.id],
  );
  const index = lines.findIndex((line) => Number(line.remaining) >= 1);
  expect(index, "the chosen quotation has nothing left on any line").toBeGreaterThanOrEqual(0);
  const line = lines[index];
  const sending = 1;

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/dispatches`);

  await test.step("the customer is asked first, and the papers offered are that customer's", async () => {
    await page.getByRole("button", { name: t("dispatches.request") }).first().click();

    const form = dialogNamed(page, t("dispatches.request"));
    await expect(form.getByText(t("dispatches.pickQuotationFirst"))).toBeVisible();

    // The chain, in the order a rep has it (P12-10): until a customer is named
    // the papers field says so and opens nothing at all. It was one flat list
    // of every dispatchable quotation in the building.
    const picker = form.getByRole("combobox", { name: t("common.quotation") });
    await expect(picker).toContainText(t("common.pickCompanyFirst"));
    await expect(picker).toBeDisabled();

    const customer = form.getByRole("combobox", { name: t("common.company") });
    await expect(customer).toContainText(t("common.pickCompany"));
    await choose(page, customer, quotation.company_name);

    await expect(picker).toContainText(t("dispatches.pickQuotation"));
    await choose(page, picker, label);

    await expect(form.getByText(t("dispatches.pickQuotationFirst"))).toHaveCount(0);
  });

  await test.step("the quantity typed on the line that still has room is what gets saved", async () => {
    const form = dialogNamed(page, t("dispatches.request"));
    // Every line of the quotation is listed (dispatch-items.tsx); the one at
    // `index` is the one the database query above found room on.
    const box = form.getByLabel(t("dispatches.sending")).nth(index);
    await expect(box).toBeVisible(COLD);
    await box.fill(String(sending));

    // The store the load leaves from opens on the QUOTATION's own, which is
    // where the price was worked out and the answer nine times in ten (SPEC §3,
    // P12-9) — a child reading its own parent, never the dispatch before it.
    const store = form.getByRole("combobox", { name: t("common.warehouse") });
    await expect(store).toContainText(
      locale === "ar" ? quotation.warehouse_ar : quotation.warehouse_en,
    );

    await fillTheDetails(form, t);
    await form.getByRole("button", { name: t("common.save") }).click();
  });

  await test.step("it lands on the new dispatch, against the quotation chosen", async () => {
    await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
    await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
    const dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(dispatchId).not.toBe("");

    const dispatchLabel = await nameOfTheOpenDispatch(page);
    await expect(dialogNamed(page, dispatchLabel)).toBeVisible();

    const row = await one<{ quotation_id: string; warehouse: string }>(
      `select d.quotation_id, w.name_en as warehouse
         from dispatches d join warehouses w on w.id = d.warehouse_id
        where d.id = $1::uuid`,
      [dispatchId],
    );
    expect(row.quotation_id, "the dispatch is not against the quotation picked").toBe(
      quotation.id,
    );
    expect(row.warehouse, "the load did not leave from the store the price came out of").toBe(
      quotation.warehouse_en,
    );

    const items = await query<{ qty: string }>(
      `select qty::text as qty from dispatch_items
        where dispatch_id = $1::uuid and quotation_item_id = $2::uuid`,
      [dispatchId, line.id],
    );
    expect(
      items.map((r) => Number(r.qty)),
      "the quantity stored is not the quantity typed",
    ).toEqual([sending]);
  });
});

/*
 * Rewritten in P12-5. It read "the coordinator is offered no button she could
 * not use", and every step of it asserted an absence: no Request quotation, no
 * Request dispatch, no New project, because she owned no company to raise
 * anything on. SPEC §3 gave her one, so every one of those absences is now the
 * defect it was written to catch — a door the action would allow and the screen
 * does not show. The rule it was really testing has not changed, and this is it
 * said the other way round: what her screens offer is what her role may do.
 *
 * The Request-quotation door is deliberately still asserted absent. Hers says
 * Issue, because a request of hers would be a note to herself, and the walk
 * through that dialog is tests/roles.spec.ts.
 */
test("the coordinator is offered the doors her floor gives her", async ({ page, locale, t }) => {
  await login(page, locale, "rawan");

  await test.step("on /quotations the door says Issue rather than Request", async () => {
    await page.goto(`/${locale}/quotations`);
    await expect(page.getByRole("button", { name: t("quotations.issueOwn") })).toBeVisible(COLD);
    await expect(page.getByRole("button", { name: t("quotations.request") })).toHaveCount(0);
  });

  await test.step("on /dispatches she may send against her own paper", async () => {
    await page.goto(`/${locale}/dispatches`);
    await expect(page.getByRole("button", { name: t("dispatches.request") })).toBeVisible(COLD);
  });

  await test.step("and a new project on her own customer", async () => {
    await page.goto(`/${locale}/projects`);
    await expect(page.getByRole("button", { name: t("projects.newProject") })).toBeVisible(COLD);
  });
});
