import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";

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
async function choose(page: Page, trigger: Locator, label: string): Promise<void> {
  await trigger.click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByText(label, { exact: true })
    .first()
    .click();
}

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
    await form.getByRole("combobox", { name: t(label) }).click();
    await form.page().getByRole("option").first().click();
  }
  await form.getByLabel(t("common.pricePerSqm")).fill("120");
}

/** Shipment, destination and payment terms — every dispatch request needs them. */
async function fillTheDetails(form: Locator, t: Translate): Promise<void> {
  await form.getByRole("combobox", { name: t("common.shipment") }).click();
  await form.page().getByRole("option").first().click();
  await form.getByLabel(t("common.destination")).fill("Riyadh — King Fahd Road, site gate");
  await form.getByLabel(t("common.paymentTerms")).fill("50% advance, balance on delivery");
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
    await expect(picker).toContainText(t("projects.pickCompany"));

    await choose(page, picker, company.name);
    await expect(picker).toContainText(company.name);

    await form.getByLabel(t("common.name")).fill(projectName);
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
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and p.archived_at is null
        and p.lost_at is null
      order by p.created_at
      limit 1`,
    [faisal],
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);

  await test.step("the button asks for the project first, its company a quieter line under it", async () => {
    await page.getByRole("button", { name: t("quotations.request") }).first().click();

    const form = dialogNamed(page, t("quotations.request"));
    const picker = form.getByRole("combobox", { name: t("common.project") });
    // The picker is gated behind the same lookups the lines need (suppliers,
    // fire ratings, classes), so it can arrive a moment after the dialog does.
    await expect(picker).toBeVisible(COLD);
    await expect(picker).toContainText(t("quotations.pickProject"));

    await choose(page, picker, project.name);
    await expect(picker).toContainText(project.company_name);

    await fillOneItem(form, t);
    await form.getByRole("button", { name: t("common.save") }).click();
  });

  await test.step("it lands on the new quotation, against the project and company chosen", async () => {
    await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
    await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
    const quotationId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(quotationId).not.toBe("");

    const label = await nameOfTheOpenQuotation(page);
    await expect(dialogNamed(page, label)).toBeVisible();

    const row = await one<{ company_id: string; project_id: string | null }>(
      "select company_id, project_id from quotations where id = $1::uuid",
      [quotationId],
    );
    expect(row.company_id, "the quotation's company is not the picked project's own").toBe(
      project.company_id,
    );
    expect(row.project_id, "the quotation did not land on the project picked").toBe(project.id);
  });
});

test("a dispatch is requested from the dispatches screen", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const quotation = await one<{ id: string; number: number; revision: number }>(
    `select q.id, q.number, q.revision
       from quotations q
       join companies c on c.id = q.company_id
      where c.rep_id = $1::uuid
        and q.status = 'issued'
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

  await test.step("nothing is asked until a quotation is chosen, then its lines load", async () => {
    await page.getByRole("button", { name: t("dispatches.request") }).first().click();

    const form = dialogNamed(page, t("dispatches.request"));
    await expect(form.getByText(t("dispatches.pickQuotationFirst"))).toBeVisible();

    const picker = form.getByRole("combobox", { name: t("common.quotation") });
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

    const row = await one<{ quotation_id: string }>(
      "select quotation_id from dispatches where id = $1::uuid",
      [dispatchId],
    );
    expect(row.quotation_id, "the dispatch is not against the quotation picked").toBe(
      quotation.id,
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

test("the coordinator is offered no button she could not use", async ({ page, locale, t }) => {
  await login(page, locale, "rawan");

  await test.step("no button on /quotations — she owns no company to raise one on", async () => {
    await page.goto(`/${locale}/quotations`);
    await expect(page.getByRole("button", { name: t("quotations.request") })).toHaveCount(0);
  });

  await test.step("no button on /dispatches, either", async () => {
    await page.goto(`/${locale}/dispatches`);
    await expect(page.getByRole("button", { name: t("dispatches.request") })).toHaveCount(0);
  });

  await test.step("on /projects she gets the earlier step instead of a dropdown that would open empty", async () => {
    await page.goto(`/${locale}/projects`);
    await expect(page.getByRole("button", { name: t("projects.newProject") })).toHaveCount(0);
    // The empty list has its own copy of the same link in its empty-state
    // card (projects-table.tsx `EmptyProjects`), on top of the header's — the
    // same doubling rep.spec.ts's "Add company" hits, and the same fix.
    await expect(
      page.getByRole("link", { name: t("projects.openCompanies") }).first(),
    ).toBeVisible();
  });
});
