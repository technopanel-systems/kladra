import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { choose, pickFirst } from "./helpers/pick";
import { WIDE_DIALOG_PX } from "@/lib/dialog-width";

/**
 * P13-S2 — services inside the quotation, and a request dialog wide enough for
 * them (SPEC §3, P13).
 *
 * Two founder sentences. "Services — CNC cutting, denting, fabrication — live
 * inside the quotation as their own section, each with m² and a price per m²,
 * subtotalled apart from the panels." And, reported twice: the request dialog
 * was too narrow, centred, and compacted as items were added — so it has a
 * stated minimum width on a desk, and this is the test that asserts it.
 *
 * The money is checked the way tests/quotations.spec.ts checks it: the browser
 * adds it up while the rep types (src/lib/money.ts), SQL adds it up again once
 * it is stored (src/lib/quotations.ts), and this file does the arithmetic a
 * third time, here, on the figures it typed and on the rows it reads back, so
 * neither of the app's two copies can move without the other.
 */

const COLD = { timeout: 30_000 };

/** The standard sheet, 1.24 × 5.8 m: 7.192 m² a sheet, so ten are 71.92. */
const SHEET = 1.24 * 5.8;
const LINE = { qty: 10, price: 120 };

/**
 * Two services whose totals do not come out even, so the per-service rounding
 * is exercised: 36.75 × 22.35 is 821.3625 and 12.5 × 65.25 is 815.625, which a
 * rounding done once over the sum rather than per service would get a halala
 * wrong.
 */
const TYPED_SERVICES = [
  { sqm: "36.75", price: "22.35" },
  { sqm: "12.5", price: "65.25" },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

type Totals = {
  sqm: number;
  panels: number;
  services: number;
  subtotal: number;
  vat: number;
  total: number;
};

/**
 * What a quotation comes to, from its lines and its services, done here: each
 * line and each service rounded to the halala before summing, the two subtotals
 * added, 15% of that, and the two added. The m² is the panels' alone — a
 * service's m² counts toward nothing (D173).
 */
function totalsOf(
  lines: { sqm: number; price: number }[],
  services: { sqm: number; price: number }[],
): Totals {
  const sqm = round2(lines.reduce((sum, line) => sum + line.sqm, 0));
  const panels = round2(lines.reduce((sum, line) => sum + round2(line.sqm * line.price), 0));
  const servicesTotal = round2(
    services.reduce((sum, service) => sum + round2(round2(service.sqm) * round2(service.price)), 0),
  );
  const subtotal = round2(panels + servicesTotal);
  const vat = round2(subtotal * 0.15);
  return { sqm, panels, services: servicesTotal, subtotal, vat, total: round2(subtotal + vat) };
}

const EXPECTED = totalsOf(
  [{ sqm: round2(SHEET * LINE.qty), price: LINE.price }],
  TYPED_SERVICES.map((service) => ({ sqm: Number(service.sqm), price: Number(service.price) })),
);

/**
 * The six figures of a totals block, read back as numbers. The first numeric
 * run is the figure: the Arabic currency, ر.س, has a full stop in it.
 */
async function figures(scope: Locator): Promise<Totals> {
  async function read(name: string): Promise<number> {
    const text = await scope.locator(`[data-slot='figure-${name}']`).innerText();
    const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    expect(match, `no number in the ${name} row: "${text}"`).not.toBeNull();
    return Number(match?.[0]);
  }
  return {
    sqm: await read("sqm"),
    panels: await read("panels"),
    services: await read("services"),
    subtotal: await read("subtotal"),
    vat: await read("vat"),
    total: await read("total"),
  };
}

/** Two active services, in the admin's order, named in the reader's language. */
async function twoServices(locale: string): Promise<{ id: number; name: string }[]> {
  const rows = await query<{ id: number; name_en: string; name_ar: string }>(
    `select id, name_en, name_ar from services
      where active
      order by sort_order, name_en
      limit 2`,
  );
  expect(rows.length, "fewer than two active services are seeded").toBe(2);
  return rows.map((row) => ({ id: Number(row.id), name: locale === "ar" ? row.name_ar : row.name_en }));
}

/** One of Faisal's own live projects, for a request raised from its drawer. */
async function faisalsProject(): Promise<{ id: string; name: string }> {
  const faisal = await userId("faisal@technopanel.com.sa");
  return one<{ id: string; name: string }>(
    `select p.id, p.name
       from projects p
       join companies c on c.id = p.company_id
      where c.rep_id = $1::uuid
        and p.rep_id = $1::uuid
        and p.lost_at is null
        and p.archived_at is null
        and c.archived_at is null
      order by p.created_at, p.id
      limit 1`,
    [faisal],
  );
}

/** Opens the request dialog on a project's Quotations tab and waits for its lists. */
async function openRequest(page: Page, t: Translate, locale: string, project: { id: string; name: string }) {
  await page.goto(`/${locale}/projects?open=${project.id}`);
  const drawer = page.getByRole("dialog", { name: project.name });
  await expect(drawer).toBeVisible(COLD);
  await drawer.getByRole("tab", { name: t("common.quotations") }).click();
  await drawer.getByRole("button", { name: t("quotations.request") }).first().click();
  const form = page.getByRole("dialog", {
    name: t("quotations.requestFor", { project: project.name }),
  });
  await expect(form.getByLabel(t("common.colourCode"))).toBeVisible(COLD);
  return form;
}

/** The one line: the standard sheet, ten of them, at 120 a metre. */
async function fillTheLine(form: Locator, t: Translate): Promise<void> {
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.qty")).fill(String(LINE.qty));
  await form.getByLabel(t("common.pricePerSqm")).fill(String(LINE.price));
}

/** Adds a service row and fills it: which service, its m², its price. */
async function addService(
  page: Page,
  form: Locator,
  t: Translate,
  index: number,
  service: { name: string },
  typed: { sqm: string; price: string },
): Promise<void> {
  const rows = form.locator('[data-slot="quotation-service"]');
  await form.getByRole("button", { name: t("quotations.addService") }).click();
  await expect(rows).toHaveCount(index + 1);
  const row = rows.nth(index);
  await choose(page, row.getByRole("combobox", { name: t("quotations.service") }), service.name);
  // Exact: "m²" is also the tail of "Price / m²".
  await row.getByLabel(t("common.sqm"), { exact: true }).fill(typed.sqm);
  await row.getByLabel(t("common.pricePerSqm"), { exact: true }).fill(typed.price);
}

/** The quotation's own name, Q-#, once its drawer has actually loaded. */
async function nameOfTheOpenQuotation(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^Q-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

test("the request dialog stands at its stated width on a desk, and lines and services do not move it", async ({
  page,
  locale,
  t,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);

  await page.getByRole("button", { name: t("quotations.request") }).first().click();
  const form = page.getByRole("dialog", { name: t("quotations.request") });
  await expect(form.getByLabel(t("common.colourCode"))).toBeVisible(COLD);

  // Measured at rest: the dialog zooms in over 200ms, and since S12.4 its
  // fields are drawn before that ends, so the label alone no longer waits it out.
  await form.evaluate((node) => Promise.all(node.getAnimations().map((motion) => motion.finished)));
  const widthOf = async () => (await form.boundingBox())?.width ?? 0;
  const before = await widthOf();
  expect(before, "the request dialog is narrower than its stated desk width").toBeGreaterThanOrEqual(
    WIDE_DIALOG_PX,
  );
  expect(before, "the request dialog is wider than the screen less a gutter").toBeLessThanOrEqual(
    1366 - 32,
  );

  // Three more lines and two services: the form the founder watched compact.
  for (let i = 0; i < 3; i += 1) {
    await form.getByRole("button", { name: t("quotations.addItem") }).click();
  }
  for (let i = 0; i < 2; i += 1) {
    await form.getByRole("button", { name: t("quotations.addService") }).click();
  }
  await expect(form.locator('[data-slot="quotation-line"]')).toHaveCount(4);
  await expect(form.locator('[data-slot="quotation-service"]')).toHaveCount(2);

  expect(await widthOf(), "the dialog changed width as lines and services were added").toBe(before);
});

test("a rep requests a quotation with two services, and the live totals are the ones SQL reads back", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const project = await faisalsProject();
  const services = await twoServices(locale);

  await login(page, locale, "faisal");
  const form = await openRequest(page, t, locale, project);

  let quotationId = "";

  await test.step("the form opens with no services, and adds up what is typed", async () => {
    // Nothing is carried in from another quotation (D163): the section is
    // there, and empty.
    await expect(form.locator('[data-slot="quotation-services"]')).toBeVisible();
    await expect(form.locator('[data-slot="quotation-service"]')).toHaveCount(0);

    await fillTheLine(form, t);
    await addService(page, form, t, 0, services[0], TYPED_SERVICES[0]);
    await addService(page, form, t, 1, services[1], TYPED_SERVICES[1]);

    expect(await figures(form), "the totals under the form are wrong as they are typed").toEqual(
      EXPECTED,
    );
    // The section's own subtotal is the same figure as the totals block's.
    await expect(form.locator('[data-slot="services-subtotal"]')).toContainText(
      EXPECTED.services.toLocaleString("en-US", { minimumFractionDigits: 2 }),
    );

    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
    await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
    quotationId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(quotationId).not.toBe("");
  });

  await test.step("the rows stored are what was typed, and SQL adds them up to the same figures", async () => {
    const stored = await query<{ position: number; service_id: number; sqm: string; price_per_sqm: string }>(
      `select position, service_id, sqm, price_per_sqm
         from quotation_services
        where quotation_id = $1::uuid
        order by position`,
      [quotationId],
    );
    expect(
      stored.map((row) => ({
        position: Number(row.position),
        service: Number(row.service_id),
        sqm: Number(row.sqm),
        price: Number(row.price_per_sqm),
      })),
    ).toEqual(
      TYPED_SERVICES.map((typed, index) => ({
        position: index + 1,
        service: services[index].id,
        sqm: Number(typed.sqm),
        price: Number(typed.price),
      })),
    );

    // The totals in SQL, written out here rather than asked of the app.
    const sums = await one<{ sqm: string; panels: string; services: string }>(
      `select
         (select round(coalesce(sum(qi.sqm), 0), 2)
            from quotation_items qi where qi.quotation_id = $1::uuid) as sqm,
         (select round(coalesce(sum(round(qi.sqm * qi.price_per_sqm, 2)), 0), 2)
            from quotation_items qi where qi.quotation_id = $1::uuid) as panels,
         (select round(coalesce(sum(round(qs.sqm * qs.price_per_sqm, 2)), 0), 2)
            from quotation_services qs where qs.quotation_id = $1::uuid) as services`,
      [quotationId],
    );
    const subtotal = round2(Number(sums.panels) + Number(sums.services));
    const vat = round2(subtotal * 0.15);
    expect({
      sqm: Number(sums.sqm),
      panels: Number(sums.panels),
      services: Number(sums.services),
      subtotal,
      vat,
      total: round2(subtotal + vat),
    }).toEqual(EXPECTED);
  });

  await test.step("the drawer shows the services in their own section, and the same totals", async () => {
    const label = await nameOfTheOpenQuotation(page);
    const sheet = page.getByRole("dialog", { name: label });

    const section = sheet.locator('[data-slot="quotation-services"]');
    await expect(section.getByRole("heading", { name: t("quotations.services") })).toBeVisible();
    await expect(section.locator('[data-slot="quotation-service"]')).toHaveCount(2);
    await expect(section).toContainText(services[0].name);
    await expect(section).toContainText(services[1].name);
    await expect(section.locator('[data-slot="services-subtotal"]')).toContainText(
      t("quotations.servicesSubtotal"),
    );
    await expect(section.locator('[data-slot="services-subtotal"]')).toContainText(
      EXPECTED.services.toLocaleString("en-US", { minimumFractionDigits: 2 }),
    );

    expect(await figures(sheet), "the drawer's figures differ from the typed ones").toEqual(
      EXPECTED,
    );
  });
});

test("a revision that changes a service's price names that change", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const project = await faisalsProject();
  const [service] = await twoServices(locale);
  const smacNumber = `SMAC-SVC-${locale.toUpperCase()}-${Date.now()}`;
  const newPrice = "26";

  await login(page, locale, "faisal");
  const form = await openRequest(page, t, locale, project);
  await fillTheLine(form, t);
  await addService(page, form, t, 0, service, TYPED_SERVICES[0]);
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
  const quotationId = new URL(page.url()).searchParams.get("open") ?? "";
  const label = await nameOfTheOpenQuotation(page);

  await test.step("Rawan issues it, so there is paper to revise", async () => {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue?open=${quotationId}`);
    const sheet = page.getByRole("dialog", { name: label });
    await sheet.getByRole("button", { name: t("quotations.issue") }).click();
    const ask = page.getByRole("dialog", { name: t("quotations.issueTitle", { label }) });
    await ask.getByLabel(t("common.smacNumber")).fill(smacNumber);
    await ask.getByRole("button", { name: t("quotations.issue") }).click();
    await expect(page.getByText(t("quotations.issued", { label }))).toBeVisible(COLD);
  });

  await test.step("Faisal revises it at a new price for the service, and nothing else", async () => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/quotations?open=${quotationId}`);
    const sheet = page.getByRole("dialog", { name: label });
    await sheet.getByRole("button", { name: t("quotations.revise") }).click();

    const revise = page.getByRole("dialog", { name: t("quotations.revise") });
    // It opens on the paper it revises, services and all (D10) — and only
    // because the form sent them does the revision carry them (D163).
    const row = revise.locator('[data-slot="quotation-service"]');
    await expect(row).toHaveCount(1, COLD);
    const price = row.getByLabel(t("common.pricePerSqm"), { exact: true });
    await expect(price).toHaveValue(TYPED_SERVICES[0].price);
    await price.fill(newPrice);
    await revise.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("quotations.revised"))).toBeVisible(COLD);
  });

  await test.step("the revision says which service changed, from what, to what", async () => {
    const revision = page.getByRole("dialog", { name: `${label}/2` });
    await expect(revision).toBeVisible(COLD);

    const changed = revision.locator("li[data-change]");
    await expect(changed, "the revision lists changes it did not make").toHaveCount(1);
    const serviceChange = revision.locator('li[data-change="changed"][data-change-of="service"]');
    await expect(serviceChange).toHaveCount(1);
    await expect(serviceChange).toContainText(service.name);
    await expect(serviceChange).toContainText(t("common.pricePerSqm"));
    await expect(serviceChange).toContainText("26.00");
    await expect(serviceChange).toContainText(
      t("quotations.changedWas", { from: Number(TYPED_SERVICES[0].price).toFixed(2) }),
    );

    const stored = await one<{ price_per_sqm: string }>(
      `select qs.price_per_sqm
         from quotation_services qs
         join quotations q on q.id = qs.quotation_id
        where q.revision_of = $1::uuid`,
      [quotationId],
    );
    expect(Number(stored.price_per_sqm)).toBe(Number(newPrice));
  });
});
