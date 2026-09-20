import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P14 — is the CUSTOMER in SMAC? A tick, not a number (SPEC §3, P14).
 *
 * Its own file, beside `tests/smac.spec.ts`, which is about SMAC's NUMBER on a
 * paper: the number is a link to one document and this is whether the customer
 * exists in the ERP at all. Two questions about the same system, and keeping
 * them apart is what stops one file being two.
 *
 * The founder, after a third round of use: "Reps have no SMAC numbers. A rep
 * ticks whether he believes the company is registered in SMAC, the ERP that
 * holds the money. Rawan is the one who actually registers it, while she is
 * creating a quotation, and she can tick it there — hers is the authoritative
 * answer. Who ticked it and when is recorded. She is given a way to see which
 * companies are not registered yet, or the tick is a dead field nobody acts
 * on."
 *
 * Four claims and four tests: the rep's tick is a belief and says so; hers is
 * asked where she is already inside SMAC, and is not asked at all about a
 * customer who is in there; both answers are recorded with a name and a moment;
 * and the list of who is not registered yet is on her own screen.
 */

const COLD = { timeout: 30_000 };

test("a rep says he believes the customer is in SMAC, and the record says whose word it is", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const company = await one<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and c.archived_at is null
        and c.smac_registered_at is null
        and c.smac_believed_at is null
      order by c.created_at, c.id
      limit 1`,
  );
  const faisal = await one<{ id: string }>(
    `select id from users where email = 'faisal@technopanel.com.sa'`,
  );

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${company.id}`);

    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    // Before he says anything, the drawer says nobody has (P14).
    await expect(drawer).toContainText(t("companies.smac.unknown"), COLD);

    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("common.moreFor", { name: company.name }) })
      .click();
    await page.getByRole("menuitem", { name: t("common.edit"), exact: true }).click();
    const form = page.getByRole("dialog", { name: t("forms.editCompany") });
    await expect(form).toBeVisible(COLD);

    // A tick, never a number: reps have no SMAC numbers (P14).
    await expect(form.getByLabel(t("forms.inSmac"))).not.toBeChecked();
    await form.getByLabel(t("forms.inSmac")).click();
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(form).toBeHidden(COLD);

    // The row: his name and the moment, together, because the answer is worth
    // what the person behind it is worth.
    const said = await one<{ by: string | null; at: string | null; registered: string | null }>(
      `select smac_believed_by::text as by,
              smac_believed_at::text as at,
              smac_registered_at::text as registered
         from companies where id = $1::uuid`,
      [company.id],
    );
    expect(said.by, "the belief was written without a name on it").toBe(faisal.id);
    expect(said.at, "the belief was written without a moment on it").not.toBeNull();
    expect(said.registered, "a rep's tick registered the customer").toBeNull();

    // And the drawer says it is his word and not the answer.
    await page.reload();
    await expect(page.getByRole("dialog").first()).toContainText(
      t("companies.smac.believed"),
      COLD,
    );
  } finally {
    await query(
      `update companies set smac_believed_at = null, smac_believed_by = null where id = $1::uuid`,
      [company.id],
    );
  }
});

test("the coordinator registers the customer in the same act as issuing the price", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // A request waiting on her desk, for a customer nobody has registered.
  const waiting = await one<{ id: string; company_id: string; number: number }>(
    `select q.id, q.company_id, q.number
       from quotations q
       join companies c on c.id = q.company_id
      where q.status = 'requested' and c.smac_registered_at is null
      order by q.created_at
      limit 1`,
  );
  const rawan = await one<{ id: string }>(
    `select id from users where email = 'rawan@technopanel.com.sa'`,
  );
  const smacNumber = `T${Date.now().toString().slice(-7)}`;

  try {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue?open=${waiting.id}`);

    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    await drawer.getByRole("button", { name: t("quotations.issue") }).click();

    const dialog = page.getByRole("dialog", { name: /.*/ }).last();
    const tick = dialog.getByLabel(t("forms.registerInSmac"));
    // Asked here, beside SMAC's own number, because this is the one moment she
    // is inside SMAC with this customer in front of her (P14).
    await expect(tick).toBeVisible(COLD);
    await dialog.getByLabel(t("common.smacNumber")).fill(smacNumber);
    await tick.click();
    await dialog.getByRole("button", { name: t("quotations.issue") }).click();
    await expect(page.getByText(t("quotations.issued", { label: `Q-${waiting.number}` }))).toBeVisible(
      COLD,
    );

    const said = await one<{ by: string | null; at: string | null }>(
      `select smac_registered_by::text as by, smac_registered_at::text as at
         from companies where id = $1::uuid`,
      [waiting.company_id],
    );
    expect(said.by, "the answer was written without her name on it").toBe(rawan.id);
    expect(said.at).not.toBeNull();
  } finally {
    await query(
      `update companies set smac_registered_at = null, smac_registered_by = null where id = $1::uuid`,
      [waiting.company_id],
    );
    await query(
      `update quotations set status = 'requested', smac_number = null, issued_at = null where id = $1::uuid`,
      [waiting.id],
    );
    await query(`delete from audit_log where record_id = $1::text and action = 'quotation.issue'`, [
      waiting.id,
    ]);
  }
});

test("a customer already in SMAC is not asked about twice", async ({ page, locale, t }) => {
  // A customer the seed has already registered, with a price of his still
  // waiting on her desk: the one arrangement where she could be asked twice.
  const paper = await one<{ id: string }>(
    `select q.id
       from quotations q
       join companies c on c.id = q.company_id
      where q.status = 'requested' and c.smac_registered_at is not null
      order by q.created_at
      limit 1`,
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue?open=${paper.id}`);
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible(COLD);
  await drawer.getByRole("button", { name: t("quotations.issue") }).click();

  const dialog = page.getByRole("dialog").last();
  await expect(dialog.getByLabel(t("common.smacNumber"))).toBeVisible(COLD);
  // Nothing to ask: a tick that can only say what the record already says is a
  // question with one answer (P14).
  await expect(dialog.getByLabel(t("forms.registerInSmac"))).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("her own screen says which customers are not in SMAC yet", async ({ page, locale, t }) => {
  const outstanding = await one<{ n: number; name: string }>(
    `select count(*) over ()::int as n, c.name
       from companies c
       join quotations q on q.company_id = c.id
      where c.smac_registered_at is null and c.archived_at is null
      group by c.id, c.name
      order by min(q.created_at), c.name
      limit 1`,
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue`);

  // On the desk she lives on, under the work, because it is hers and nothing
  // else in the app would ever show it to her (P14).
  const section = page.locator('[data-slot="not-in-smac"]');
  await expect(section.getByRole("heading", { name: t("queue.notInSmac") })).toBeVisible(COLD);
  await expect(section).toContainText(String(outstanding.n));
  await expect(section.locator('[data-slot="not-in-smac-row"]').first()).toContainText(
    outstanding.name,
  );

  // And the customer somebody HAS registered is not on it.
  const registered = await one<{ name: string }>(
    `select name from companies where smac_registered_at is not null limit 1`,
  );
  await expect(section).not.toContainText(registered.name);

  // It is hers and not everybody's: the queue is a screen anybody signed in can
  // type the address of, and this list names every rep's customers (P14).
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/queue`);
  await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);
  await expect(page.locator('[data-slot="not-in-smac"]')).toHaveCount(0);
});

test("the rep is told the answer rather than asked for a belief about it", async ({
  page,
  locale,
  t,
}) => {
  // The seed's registered customer is Faisal's, and it is his drawer that has
  // to state the answer rather than ask him for a belief about it.
  const company = await one<{ id: string }>(
    `select c.id
       from companies c join users u on u.id = c.rep_id
      where c.smac_registered_at is not null
        and u.email = 'faisal@technopanel.com.sa'
      limit 1`,
  );

  const faisal = await one<{ id: string }>(
    `select id::text as id from users where email = 'faisal@technopanel.com.sa'`,
  );
  // A belief he recorded back in March, under her answer. Nothing draws it
  // — once she has answered, hers is the one that counts — which is exactly
  // why a save has to be asked whether it kept it.
  await query(
    `update companies
        set smac_believed_at = timestamptz '2026-03-02 09:00+03', smac_believed_by = $2::uuid
      where id = $1::uuid`,
    [company.id, faisal.id],
  );

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${company.id}`);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: /.+/ })
      .last()
      .click();
    await page.getByRole("menuitem", { name: t("common.edit"), exact: true }).click();

    const form = page.getByRole("dialog", { name: t("forms.editCompany") });
    await expect(form).toBeVisible(COLD);
    // Her answer, stated; no tick of his own, because it would change nothing.
    await expect(form.locator('[data-slot="smac-answer"]')).toBeVisible();
    await expect(form.getByLabel(t("forms.inSmac"))).toHaveCount(0);

    // And saving that form leaves the belief where it was. A form that does not
    // ASK a question must not answer it: the tick is absent here, and absence
    // read as "he says no" would take his March word back on every save.
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(form).toBeHidden(COLD);

    const after = await one<{ by: string | null; at: string | null }>(
      `select smac_believed_by::text as by, smac_believed_at::text as at
         from companies where id = $1::uuid`,
      [company.id],
    );
    expect(after.by, "a save with no tick on the form took his belief back").toBe(faisal.id);
    expect(after.at, "a save with no tick on the form took his belief back").not.toBeNull();
  } finally {
    await query(
      `update companies set smac_believed_at = null, smac_believed_by = null where id = $1::uuid`,
      [company.id],
    );
  }
});
