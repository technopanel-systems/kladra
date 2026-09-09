import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * A typed key is refused by name, and can be corrected (SPEC D88).
 *
 * The SMAC number is the one value the spec itself calls error-prone: typed by
 * a person, unique by index in both chains, the only link to the money. Typed
 * twice it used to say "something went wrong"; typed wrong it was wrong for
 * ever. Now a clash names the record that holds the number, at the field, and
 * the coordinator corrects a number in place — the row held, the status and
 * the month unmoved, the old number in the trail.
 *
 * The same fault sat under the contact form: drizzle wraps the driver's error,
 * the duplicate-phone check read the top level, and "this company already has
 * a contact with that number" had become "something went wrong" too. The last
 * test holds that answer.
 *
 * Every test puts the numbers back it changed, and deletes the audit rows it
 * caused: the Arabic project runs on the same seeded database after the
 * English one (rules/data.md).
 */

const COLD = { timeout: 30_000 };

function quotationLabel(number: number, revision: number): string {
  return revision > 1 ? `Q-${number}/${revision}` : `Q-${number}`;
}

/** Kladra's own name for a dispatch — src/lib/labels.ts's rule, kept here too. */
function dispatchLabel(number: number): string {
  return `D-${number}`;
}

/**
 * The row carrying exactly this label.
 *
 * `hasText` is a SUBSTRING, and these labels nest: "Q-1" is inside Q-11, Q-13,
 * Q-15 and Q-17, so a filter on it matches five rows and the failure reads as
 * five numbers where one was expected.
 */
function rowNamed(page: Page, label: string): Locator {
  return page.getByRole("row").filter({ has: page.getByText(label, { exact: true }) });
}

/** The drawer, which is named by the record itself (Q-12, D-3). */
function sheetFor(page: Page, label: string): Locator {
  return page.getByRole("dialog", { name: label });
}

type Numbered = { id: string; number: number; revision: number; smac_number: string };

/** The newest quotation that carries a SMAC number, other than `not`. */
async function numberedQuotation(not?: string): Promise<Numbered> {
  return one<Numbered>(
    `select id, number, revision, smac_number
       from quotations
      where smac_number is not null and id <> coalesce($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      order by created_at desc limit 1`,
    [not ?? null],
  );
}

test("SMAC's number is the one a row leads with, and Kladra's own is the quiet one", async ({
  page,
  locale,
  t,
}) => {
  // Both chains, because the rule is about a record's number and not about
  // either of them (P12-11).
  const quotation = await one<{ number: number; revision: number; smac_number: string }>(
    `select q.number, q.revision, q.smac_number
       from quotations q join companies c on c.id = q.company_id
       join users u on u.id = c.rep_id
      where u.email = $1::text and q.smac_number is not null
        and not exists (select 1 from quotations later
                         where later.number = q.number and later.revision > q.revision)
      order by q.created_at desc limit 1`,
    ["faisal@technopanel.com.sa"],
  );
  const dispatch = await one<{
    number: number;
    smac_dispatch_number: string;
    quotation_number: number;
    quotation_revision: number;
    quotation_smac_number: string;
  }>(
    `select d.number, d.smac_dispatch_number,
            q.number as quotation_number, q.revision as quotation_revision,
            q.smac_number as quotation_smac_number
       from dispatches d
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = q.company_id
       join users u on u.id = c.rep_id
      where u.email = $1::text and d.smac_dispatch_number is not null
        and q.smac_number is not null
      order by d.created_at desc limit 1`,
    ["faisal@technopanel.com.sa"],
  );

  await login(page, locale, "faisal");

  await test.step("the quotations list leads with the number the customer holds", async () => {
    await page.goto(`/${locale}/quotations`);
    await expect(page.getByRole("heading", { name: t("common.quotations") })).toBeVisible(COLD);

    const label = quotationLabel(quotation.number, quotation.revision);
    const row = rowNamed(page, label);
    await expect(row.locator('[data-slot="row-number"]')).toHaveText(quotation.smac_number);
    await expect(row.locator('[data-slot="row-second-number"]')).toHaveText(label);
    // A number that names a paper is not one a translator may rewrite: on an
    // Arabic page a helpful one turns Q-12's digits into Arabic-Indic ones and
    // the paper has been renamed (D161, `Ref` in figures.tsx).
    await expect(row.locator('[data-slot="row-number"] > span')).toHaveAttribute(
      "translate",
      "no",
    );
  });

  await test.step("and the dispatches list leads with SMAC's dispatch number", async () => {
    await page.goto(`/${locale}/dispatches`);
    await expect(page.getByRole("heading", { name: t("common.dispatches") })).toBeVisible(COLD);

    const label = dispatchLabel(dispatch.number);
    const row = rowNamed(page, label);
    await expect(row.locator('[data-slot="row-number"]')).toHaveText(
      dispatch.smac_dispatch_number,
    );
    await expect(row.locator('[data-slot="row-second-number"]')).toHaveText(label);
  });

  await test.step("and the load names its quotation the way that list does", async () => {
    // A cross-reference is looked up, so it says the number she will search
    // for; Kladra's own goes under it, exactly as the first cell does.
    const row = rowNamed(page, dispatchLabel(dispatch.number));
    await expect(row.locator('[data-slot="row-quotation"]')).toHaveText(
      dispatch.quotation_smac_number,
    );
    await expect(row.locator('[data-slot="row-quotation-second"]')).toHaveText(
      quotationLabel(dispatch.quotation_number, dispatch.quotation_revision),
    );
  });

  await test.step("and on his day the quiet number sits under the loud one", async () => {
    // The card that carries both, in a flex column rather than a table cell —
    // which is where this rule broke. A box carrying `dir="ltr"` resolves
    // `text-align: start` against its OWN direction, so a block-level one goes
    // to the left edge whatever the page does, and on the Arabic card Q-7 sat
    // alone against the far left while 4531 was at the right (§5 #193). The
    // assertion is where the two numbers START, which is the same edge in
    // either language and the thing a reader actually sees.
    const withCustomer = await one<{ number: number; revision: number; smac_number: string }>(
      `select q.number, q.revision, q.smac_number
         from quotations q
         join companies c on c.id = q.company_id
         join users u on u.id = c.rep_id
        where u.email = $1::text and q.status = 'issued' and q.smac_number is not null
          and not exists (select 1 from quotations later
                           where later.number = q.number and later.revision > q.revision)
        order by q.issued_at desc limit 1`,
      ["faisal@technopanel.com.sa"],
    );

    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.waitingOnYou") })).toBeVisible(COLD);

    const card = page
      .getByRole("listitem")
      .filter({ has: page.getByText(withCustomer.smac_number, { exact: true }) });
    // The run inside each, not the box around it: the box is a flex item and
    // stretches to the card, and it is the TEXT whose edge is being read.
    const loud = card.locator('[data-slot="waiting-number"] > span');
    const quiet = card.locator('[data-slot="waiting-second-number"] > span');
    await expect(loud).toHaveText(withCustomer.smac_number);
    await expect(quiet).toHaveText(quotationLabel(withCustomer.number, withCustomer.revision));

    const above = await loud.boundingBox();
    const below = await quiet.boundingBox();
    expect(above, "the leading number has no box").not.toBeNull();
    expect(below, "the quiet number has no box").not.toBeNull();
    const startOf = (box: { x: number; width: number }) =>
      locale === "ar" ? box.x + box.width : box.x;
    expect(
      Math.abs(startOf(above!) - startOf(below!)),
      "the quiet number does not start where the loud one does",
    ).toBeLessThan(8);
    // And it is genuinely the line below, not beside.
    expect(below!.y).toBeGreaterThan(above!.y);
  });

  await test.step("a record with no SMAC number yet leads with Kladra's own, alone", async () => {
    // The other half of the rule, and the one that keeps a request readable:
    // nothing has been issued, so there is no second number to be quiet about.
    const waiting = await one<{ number: number; revision: number }>(
      `select q.number, q.revision from quotations q
         join companies c on c.id = q.company_id
         join users u on u.id = c.rep_id
        where u.email = $1::text and q.status = 'requested'
        order by q.created_at limit 1`,
      ["faisal@technopanel.com.sa"],
    );
    const label = quotationLabel(waiting.number, waiting.revision);
    await page.goto(`/${locale}/quotations`);
    const row = rowNamed(page, label);
    await expect(row.locator('[data-slot="row-number"]')).toHaveText(label);
    await expect(row.locator('[data-slot="row-second-number"]')).toHaveCount(0);
  });
});

test("a SMAC number typed twice is refused by name, and the request stays waiting", async ({
  page,
  locale,
  t,
}) => {
  const waiting = await one<{ id: string; number: number; revision: number }>(
    `select id, number, revision from quotations
      where status = 'requested' order by created_at desc limit 1`,
  );
  const holder = await numberedQuotation();
  const label = quotationLabel(waiting.number, waiting.revision);
  const holderLabel = quotationLabel(holder.number, holder.revision);
  const auditBefore = await one<{ n: string }>(
    "select count(*)::text as n from audit_log where record_type = 'quotation' and record_id = $1::text",
    [waiting.id],
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue?open=${waiting.id}`);
  const sheet = sheetFor(page, label);
  await expect(sheet).toBeVisible(COLD);

  await sheet.getByRole("button", { name: t("quotations.issue") }).click();
  const ask = page.getByRole("dialog", { name: t("quotations.issueTitle", { label }) });
  await ask.getByLabel(t("common.smacNumber")).fill(holder.smac_number);
  await ask.getByRole("button", { name: t("quotations.issue") }).click();

  // Named, at the field — which quotation has it — not "something went wrong".
  await expect(ask.getByRole("alert")).toHaveText(
    t("quotations.smacTaken", { number: holder.smac_number, label: holderLabel }),
  );
  await expect(ask.getByRole("button", { name: t("quotations.issue") })).toBeEnabled();

  const still = await one<{ status: string; smac_number: string | null }>(
    "select status, smac_number from quotations where id = $1::uuid",
    [waiting.id],
  );
  expect(still.status).toBe("requested");
  expect(still.smac_number).toBeNull();
  const auditAfter = await one<{ n: string }>(
    "select count(*)::text as n from audit_log where record_type = 'quotation' and record_id = $1::text",
    [waiting.id],
  );
  expect(auditAfter.n, "a refused issue left an audit row").toBe(auditBefore.n);
});

test("the coordinator corrects a number in place, and the trail keeps the old one", async ({
  page,
  locale,
  t,
}) => {
  test.slow();
  const target = await one<Numbered & { status: string; issued_at: string }>(
    `select id, number, revision, smac_number, status, issued_at::text as issued_at
       from quotations where status = 'issued' order by created_at desc limit 1`,
  );
  const other = await numberedQuotation(target.id);
  const label = quotationLabel(target.number, target.revision);
  const otherLabel = quotationLabel(other.number, other.revision);
  const fresh = `SMAC-FIX-${locale.toUpperCase()}-${Date.now()}`;

  try {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/quotations?open=${target.id}`);
    const sheet = sheetFor(page, label);
    await expect(sheet).toBeVisible(COLD);

    await sheet.getByRole("button", { name: t("quotations.correctNumber") }).click();
    const ask = page.getByRole("dialog", { name: t("quotations.correctNumberTitle", { label }) });
    const field = ask.getByLabel(t("common.smacNumber"));
    // Opens on the number as it stands: a one-character typo is a one-character fix.
    await expect(field).toHaveValue(target.smac_number);
    await field.fill(fresh);
    await ask.getByRole("button", { name: t("quotations.correctNumber") }).click();
    await expect(page.getByText(t("quotations.numberCorrected", { label }))).toBeVisible(COLD);

    await expect(sheet.getByText(fresh, { exact: true })).toBeVisible(COLD);
    const line = sheet.locator('[data-event="correctNumber"]');
    await expect(line).toContainText(t("quotations.event.correctNumber"));
    await expect(line).toContainText(t("common.wasNumber", { number: target.smac_number }));

    const row = await one<{ smac_number: string; status: string; issued_at: string }>(
      "select smac_number, status, issued_at::text as issued_at from quotations where id = $1::uuid",
      [target.id],
    );
    expect(row.smac_number).toBe(fresh);
    expect(row.status, "a correction is not a second issue").toBe(target.status);
    expect(row.issued_at, "the instant it was issued moved").toBe(target.issued_at);
    const audit = await one<{ from: string; to: string }>(
      `select details ->> 'from' as "from", details ->> 'to' as "to"
         from audit_log
        where record_type = 'quotation' and record_id = $1::text and action = 'quotation.correctNumber'
        order by at desc limit 1`,
      [target.id],
    );
    expect(audit.from).toBe(target.smac_number);
    expect(audit.to).toBe(fresh);

    // A number another quotation carries is refused the same way as at issue …
    await sheet.getByRole("button", { name: t("quotations.correctNumber") }).click();
    const again = page.getByRole("dialog", { name: t("quotations.correctNumberTitle", { label }) });
    await again.getByLabel(t("common.smacNumber")).fill(other.smac_number);
    await again.getByRole("button", { name: t("quotations.correctNumber") }).click();
    await expect(again.getByRole("alert")).toHaveText(
      t("quotations.smacTaken", { number: other.smac_number, label: otherLabel }),
    );
    // … and the number it already carries is not a correction.
    await again.getByLabel(t("common.smacNumber")).fill(fresh);
    await again.getByRole("button", { name: t("quotations.correctNumber") }).click();
    await expect(again.getByRole("alert")).toHaveText(t("quotations.sameNumber"));
  } finally {
    await query("update quotations set smac_number = $2 where id = $1::uuid", [
      target.id,
      target.smac_number,
    ]);
    await query(
      `delete from audit_log
        where record_type = 'quotation' and record_id = $1::text and action = 'quotation.correctNumber'`,
      [target.id],
    );
  }
});

test("the same on an approved dispatch, whose month does not move", async ({ page, locale, t }) => {
  const target = await one<{ id: string; number: number; smac_dispatch_number: string; approved_at: string }>(
    `select id, number, smac_dispatch_number, approved_at::text as approved_at
       from dispatches where status = 'approved' order by created_at desc limit 1`,
  );
  const other = await one<{ number: number; smac_dispatch_number: string }>(
    `select number, smac_dispatch_number from dispatches
      where status = 'approved' and id <> $1::uuid order by created_at desc limit 1`,
    [target.id],
  );
  const label = `D-${target.number}`;
  const fresh = `SMAC-D-FIX-${locale.toUpperCase()}-${Date.now()}`;

  try {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/dispatches?open=${target.id}`);
    const sheet = sheetFor(page, label);
    await expect(sheet).toBeVisible(COLD);

    await sheet.getByRole("button", { name: t("dispatches.correctNumber") }).click();
    const ask = page.getByRole("dialog", { name: t("dispatches.correctNumberTitle", { label }) });
    const field = ask.getByLabel(t("common.smacDispatchNumber"));
    await expect(field).toHaveValue(target.smac_dispatch_number);
    await field.fill(fresh);
    await ask.getByRole("button", { name: t("dispatches.correctNumber") }).click();
    await expect(page.getByText(t("dispatches.numberCorrected", { label }))).toBeVisible(COLD);
    await expect(sheet.getByText(fresh, { exact: true })).toBeVisible(COLD);
    // The number it used to carry, under the correction — the one line the
    // dispatch trail draws that no other event on it draws, and the hint in
    // the dialog promises it in both languages (D88, D143). The quotation
    // twin of this test has asserted the same two lines since P9.
    const line = sheet.locator('[data-event="correctNumber"]');
    await expect(line).toContainText(t("dispatches.event.correctNumber"));
    await expect(line).toContainText(
      t("common.wasNumber", { number: target.smac_dispatch_number }),
    );

    const row = await one<{ smac_dispatch_number: string; status: string; approved_at: string }>(
      `select smac_dispatch_number, status, approved_at::text as approved_at
         from dispatches where id = $1::uuid`,
      [target.id],
    );
    expect(row.smac_dispatch_number).toBe(fresh);
    expect(row.status).toBe("approved");
    expect(row.approved_at, "the month it counts in moved").toBe(target.approved_at);
    const audit = await one<{ from: string; to: string }>(
      `select details ->> 'from' as "from", details ->> 'to' as "to"
         from audit_log
        where record_type = 'dispatch' and record_id = $1::text and action = 'dispatch.correctNumber'
        order by at desc limit 1`,
      [target.id],
    );
    expect(audit.from).toBe(target.smac_dispatch_number);
    expect(audit.to).toBe(fresh);

    await sheet.getByRole("button", { name: t("dispatches.correctNumber") }).click();
    const again = page.getByRole("dialog", { name: t("dispatches.correctNumberTitle", { label }) });
    await again.getByLabel(t("common.smacDispatchNumber")).fill(other.smac_dispatch_number);
    await again.getByRole("button", { name: t("dispatches.correctNumber") }).click();
    await expect(again.getByRole("alert")).toHaveText(
      t("dispatches.smacTaken", { number: other.smac_dispatch_number, label: `D-${other.number}` }),
    );
  } finally {
    await query("update dispatches set smac_dispatch_number = $2 where id = $1::uuid", [
      target.id,
      target.smac_dispatch_number,
    ]);
    await query(
      `delete from audit_log
        where record_type = 'dispatch' and record_id = $1::text and action = 'dispatch.correctNumber'`,
      [target.id],
    );
  }
});

test("the rep is offered no correction", async ({ page, locale, t }) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const quotation = await one<{ id: string; number: number; revision: number }>(
    `select id, number, revision from quotations
      where rep_id = $1::uuid and status = 'issued' order by created_at desc limit 1`,
    [faisal],
  );
  const dispatch = await one<{ id: string; number: number }>(
    `select id, number from dispatches
      where rep_id = $1::uuid and status = 'approved' order by created_at desc limit 1`,
    [faisal],
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations?open=${quotation.id}`);
  const sheet = sheetFor(page, quotationLabel(quotation.number, quotation.revision));
  await expect(sheet).toBeVisible(COLD);
  await expect(sheet.getByRole("button", { name: t("quotations.correctNumber") })).toHaveCount(0);

  await page.goto(`/${locale}/dispatches?open=${dispatch.id}`);
  const dispatchSheet = sheetFor(page, `D-${dispatch.number}`);
  await expect(dispatchSheet).toBeVisible(COLD);
  await expect(
    dispatchSheet.getByRole("button", { name: t("dispatches.correctNumber") }),
  ).toHaveCount(0);
});

test("a phone already on the company is refused by name, not as 'something went wrong'", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<{ id: string; name: string; phone: string }>(
    `select c.id, c.name, ct.phone_normalized as phone
       from companies c
       join contacts ct on ct.company_id = c.id and ct.archived_at is null
      where c.rep_id = $1::uuid and c.archived_at is null and ct.phone_normalized is not null
        -- HIS contact, not merely one on his company: since P12 the phone is
        -- unique per rep per company (drizzle/0014_who_else_is_on_it.sql), so
        -- a number another rep holds here is not a number Faisal is refused.
        and ct.rep_id = $1::uuid
      order by c.created_at desc limit 1`,
    [faisal],
  );
  const contactsBefore = await one<{ n: string }>(
    "select count(*)::text as n from contacts where company_id = $1::uuid",
    [company.id],
  );
  const name = "Duplicate phone — smac.spec";

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${company.id}`);
    const drawer = page.getByRole("dialog", { name: company.name });
    await expect(drawer).toBeVisible(COLD);
    await drawer.getByRole("tab", { name: t("common.contacts") }).click();
    await drawer.getByRole("button", { name: t("drawer.addContact") }).first().click();

    const dialog = page.getByRole("dialog", { name: t("forms.addContact") });
    await dialog.getByLabel(t("common.name"), { exact: true }).fill(name);
    await dialog.getByLabel(t("common.phone")).fill(company.phone);
    await dialog.getByRole("button", { name: t("common.save") }).click();

    await expect(
      dialog.getByRole("alert").filter({ hasText: t("errors.phoneTaken") }),
    ).toBeVisible(COLD);

    const contactsAfter = await one<{ n: string }>(
      "select count(*)::text as n from contacts where company_id = $1::uuid",
      [company.id],
    );
    expect(contactsAfter.n).toBe(contactsBefore.n);
  } finally {
    await query("delete from contacts where company_id = $1::uuid and name = $2::text", [
      company.id,
      name,
    ]);
  }
});
