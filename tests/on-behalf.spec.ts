import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { choose, pickFirst, pressChip } from "./helpers/pick";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { quotationEvent } from "@/lib/quotation-events";

/**
 * P13-S6 — paper the coordinator raises for somebody else (SPEC §3 P13).
 *
 * "The coordinator may raise a quotation or a dispatch on a rep's behalf; it
 * counts toward that rep. If she picks no rep, it is hers, under Internal
 * Sales." Walked as Rawan: For first, the customers narrowed to Faisal's, the
 * paper his in the row and on his list, her name on it as the raiser, and a
 * notice in his bell. And the other half, which no screen shows: the action
 * asks the same questions again, and a form that names somebody it should not
 * is refused in words rather than written.
 *
 * Both locale projects run against one seeded database in file order, so every
 * walk that writes takes it back in `finally`.
 */

const COLD = { timeout: 30_000 };

/** SMAC's number for the paper she issues, one per locale: a number is never typed twice (D53). */
function smacFor(locale: Locale, which: "issued" | "refused"): string {
  return { issued: { en: "4591", ar: "4592" }, refused: { en: "4593", ar: "4594" } }[which][locale];
}

/** The one line a quotation needs to be saved at all (tests/create.spec.ts). */
async function fillOneItem(form: Locator, t: Translate): Promise<void> {
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.pricePerSqm")).fill("120");
}

/** The drawer's own name once it has loaded: Q-# or D-#. */
async function nameOfTheOpenRecord(page: Page, shape: RegExp): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(shape, COLD);
  return (await heading.innerText()).trim();
}

/** One fact on a drawer, by its label: the value under "For", not the word "For". */
function fact(sheet: Locator, label: string): Locator {
  return sheet
    .locator("dl > div")
    .filter({ has: sheet.page().locator("dt").getByText(label, { exact: true }) })
    .locator("dd");
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

/** Raising a load accepts an issued paper (P12-10); this puts it back as the seed left it. */
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

/** A job on Faisal's own customer that nobody else is on — so Saad may not raise on it. */
async function faisalsOwnJob(faisal: string) {
  return one<{ id: string; name: string; company_id: string; company_name: string }>(
    `select p.id, p.name, c.id as company_id, c.name as company_name
       from projects p
       join companies c on c.id = p.company_id
      where c.rep_id = $1::uuid and p.rep_id = $1::uuid
        and c.archived_at is null and p.archived_at is null and p.lost_at is null
        and not exists (select 1 from project_shares s where s.project_id = p.id)
        and not exists (select 1 from company_shares s where s.company_id = c.id)
      order by p.created_at, p.id
      limit 1`,
    [faisal],
  );
}

test("the coordinator issues a quotation for Faisal from the quotations screen: it is his, it says she raised it, and he is told", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Two sign-ins and a form.

  const faisal = await userId("faisal@technopanel.com.sa");
  const rawan = await userId("rawan@technopanel.com.sa");
  const faisalName = await personName("faisal@technopanel.com.sa", locale);
  const rawanName = await personName("rawan@technopanel.com.sa", locale);
  const job = await faisalsOwnJob(faisal);
  const smac = smacFor(locale, "issued");
  let quotationId = "";
  let label = "";

  try {
    await test.step("For is her first field, on Internal Sales, and choosing Faisal offers his customers", async () => {
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/quotations`);
      await page.getByRole("button", { name: t("quotations.issueOwn") }).first().click();

      const form = page.getByRole("dialog", { name: t("quotations.issueOwn") });
      const forPicker = form.getByRole("combobox", { name: t("common.onBehalf.for") });
      await expect(forPicker).toBeVisible(COLD);
      await expect(forPicker).toContainText(t("common.onBehalf.nobody"));

      await choose(page, forPicker, faisalName);
      await expect(forPicker).toContainText(faisalName);

      const companyPicker = form.getByRole("combobox", { name: t("common.company") });
      await choose(page, companyPicker, job.company_name);
      await choose(page, form.getByRole("combobox", { name: t("common.project") }), job.name);
      await fillOneItem(form, t);
      await form.getByLabel(t("common.smacNumber")).fill(smac);
      await form.getByRole("button", { name: t("quotations.issue"), exact: true }).click();

      await expect(page.getByText(t("quotations.issuedOwn"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
      quotationId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(quotationId).not.toBe("");
    });

    await test.step("the row counts for him and names her as the raiser, and so does its audit line", async () => {
      const row = await one<{
        rep_id: string;
        raised_by_id: string;
        status: string;
        self_issued: boolean;
        number: number;
        revision: number;
        credited: string[];
      }>(
        `select q.rep_id, q.raised_by_id, q.status, q.self_issued, q.number, q.revision,
                (select array_agg(qc.user_id::text) from quotation_credits qc where qc.quotation_id = q.id) as credited
           from quotations q where q.id = $1::uuid`,
        [quotationId],
      );
      expect(row.rep_id, "the quotation is not Faisal's").toBe(faisal);
      expect(row.raised_by_id, "the quotation does not name Rawan as its raiser").toBe(rawan);
      // Issued in the same act, as her own paper is (SPEC §4).
      expect(row.status).toBe("issued");
      expect(row.self_issued).toBe(true);
      expect(row.credited, "its metres are not Faisal's").toEqual([faisal]);
      label = quotationLabel(row.number, row.revision);

      const audit = await one<{ rep_id: string; raised_by_id: string; user_id: string }>(
        `select details->>'repId' as rep_id, details->>'raisedById' as raised_by_id, user_id::text
           from audit_log
          where record_type = 'quotation' and record_id = $1::text and action = $2::text`,
        [quotationId, quotationEvent("request")],
      );
      expect(audit).toEqual({ rep_id: faisal, raised_by_id: rawan, user_id: rawan });
    });

    await test.step("her drawer says it is for Faisal and raised by her", async () => {
      const name = await nameOfTheOpenRecord(page, /^Q-\d+$/);
      expect(name).toBe(label);
      const sheet = page.getByRole("dialog", { name });
      await expect(fact(sheet, t("common.onBehalf.for"))).toHaveText(faisalName);
      await expect(sheet.locator('[data-slot="raised-by"]')).toHaveText(
        t("common.onBehalf.raisedBy", { name: rawanName }),
      );
    });

    await test.step("Faisal is told, in his bell, that she issued it for him", async () => {
      const notice = await one<{ kind: string; raised_for: number }>(
        `select kind, (params->>'raisedFor')::int as raised_for
           from notifications
          where user_id = $1::uuid and subject_type = 'quotation' and subject_id = $2::uuid`,
        [faisal, quotationId],
      );
      expect(notice).toEqual({ kind: "quotationIssued", raised_for: 1 });

      await login(page, locale, "faisal");
      await page.goto(`/${locale}/notifications`);
      await expect(
        page.getByText(
          t("notifications.raisedFor.quotationIssued", {
            rep: rawanName,
            label,
            company: job.company_name,
            smacNumber: smac,
          }),
        ),
      ).toBeVisible(COLD);
    });

    await test.step("and it is on his own list, marked as raised by her", async () => {
      await page.goto(`/${locale}/quotations`);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByText(label, { exact: true }) })
        .filter({ visible: true })
        .first();
      await expect(row).toBeVisible(COLD);
      await expect(row.locator('[data-slot="row-raised-by"]')).toHaveText(
        t("common.onBehalf.raisedBy", { name: rawanName }),
      );
    });
  } finally {
    if (quotationId) await removeQuotation(quotationId);
  }
});

test("a dispatch she raises for nobody is hers, under Internal Sales", async ({ page, locale, t }) => {
  test.slow();

  const rawan = await userId("rawan@technopanel.com.sa");
  // Her own paper with something left to send: the load Internal Sales can raise.
  const paper = await one<{
    id: string;
    number: number;
    revision: number;
    status: string;
    company_name: string;
  }>(
    `select q.id, q.number, q.revision, q.status::text, c.name as company_name
       from quotations q
       join companies c on c.id = q.company_id
      where q.rep_id = $1::uuid
        and q.status in ('issued', 'accepted')
        and c.archived_at is null
        and not exists (select 1 from quotations later
                         where later.number = q.number and later.revision > q.revision)
        and exists (select 1 from quotation_items qi
                     where qi.quotation_id = q.id
                       and qi.qty > (select coalesce(sum(di.qty), 0)
                                       from dispatch_items di
                                       join dispatches d on d.id = di.dispatch_id
                                      where di.quotation_item_id = qi.id
                                        and d.status in ('submitted', 'approved')))
      order by q.number desc
      limit 1`,
    [rawan],
  );
  let dispatchId = "";

  try {
    await test.step("For opens on Internal Sales, and her own paper is the source", async () => {
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/dispatches`);
      await page.getByRole("button", { name: t("dispatches.request") }).first().click();

      const form = page.getByRole("dialog", { name: t("dispatches.request") });
      const forPicker = form.getByRole("combobox", { name: t("common.onBehalf.for") });
      await expect(forPicker).toBeVisible(COLD);
      await expect(forPicker).toContainText(t("common.onBehalf.nobody"));

      await choose(page, form.getByRole("combobox", { name: t("common.company") }), paper.company_name);
      await expect(form.getByRole("combobox", { name: t("dispatches.source") })).toContainText(
        quotationLabel(paper.number, paper.revision),
        COLD,
      );
      await expect(form.locator('[data-slot="dispatch-line"]').first()).toBeVisible(COLD);

      await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
      await form.getByLabel(t("common.destination")).fill("Riyadh — Kharj Road, showroom site");
      await pressChip(form, t("dispatches.payment.cash"));
      await pressChip(form, t("dispatches.payment.onDelivery"));
      await form.getByRole("button", { name: t("common.save") }).click();

      await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
      dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(dispatchId).not.toBe("");
    });

    await test.step("the load is hers on both counts, and nobody is told it was raised for them", async () => {
      const row = await one<{ rep_id: string; raised_by_id: string; number: number }>(
        "select rep_id, raised_by_id, number from dispatches where id = $1::uuid",
        [dispatchId],
      );
      expect(row.rep_id, "the load is not hers").toBe(rawan);
      expect(row.raised_by_id).toBe(rawan);

      const notices = await query<{ n: number }>(
        `select count(*)::int as n from notifications
          where subject_type = 'dispatch' and subject_id = $1::uuid and params ? 'raisedFor'`,
        [dispatchId],
      );
      expect(notices[0].n).toBe(0);

      const name = await nameOfTheOpenRecord(page, /^D-\d+$/);
      expect(name).toBe(dispatchLabel(row.number));
      const sheet = page.getByRole("dialog", { name });
      // Nobody else pressed the button, so there is nothing to say about who did.
      await expect(sheet.locator('[data-slot="raised-by"]')).toHaveCount(0);
    });
  } finally {
    if (dispatchId) await removeDispatch(dispatchId);
    // Only a paper this load answered: one the seed left accepted stays accepted.
    if (paper.status === "issued") await unanswer(paper.id);
  }
});

test("a rep's dialogs ask nobody who the paper is for", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  await test.step("Request quotation opens on the customer", async () => {
    await page.goto(`/${locale}/quotations`);
    await page.getByRole("button", { name: t("quotations.request") }).first().click();
    const form = page.getByRole("dialog", { name: t("quotations.request") });
    await expect(form.getByRole("combobox", { name: t("common.company") })).toBeVisible(COLD);
    await expect(form.getByRole("combobox", { name: t("common.onBehalf.for") })).toHaveCount(0);
    await form.getByRole("button", { name: t("common.cancel") }).click();
  });

  await test.step("and so does Request dispatch", async () => {
    await page.goto(`/${locale}/dispatches`);
    await page.getByRole("button", { name: t("dispatches.request") }).first().click();
    const form = page.getByRole("dialog", { name: t("dispatches.request") });
    await expect(form.getByRole("combobox", { name: t("common.company") })).toBeVisible(COLD);
    await expect(form.getByRole("combobox", { name: t("common.onBehalf.for") })).toHaveCount(0);
  });
});

test("the action refuses a rep who names somebody else, and the coordinator who names somebody off the customer", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId("faisal@technopanel.com.sa");
  const saad = await userId("saad@technopanel.com.sa");
  const saadName = await personName("saad@technopanel.com.sa", locale);
  const job = await faisalsOwnJob(faisal);
  const onTheJob = async () =>
    (
      await one<{ n: number }>("select count(*)::int as n from quotations where project_id = $1::uuid", [
        job.id,
      ])
    ).n;
  const before = await onTheJob();
  const smac = smacFor(locale, "refused");

  try {
    await test.step("Faisal's form, with Saad's id slipped into it, is refused and writes nothing", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/quotations`);
      await page.getByRole("button", { name: t("quotations.request") }).first().click();
      const form = page.getByRole("dialog", { name: t("quotations.request") });
      await choose(page, form.getByRole("combobox", { name: t("common.company") }), job.company_name);
      await choose(page, form.getByRole("combobox", { name: t("common.project") }), job.name);
      await fillOneItem(form, t);

      // What a hand-edited request would carry: a field his dialog never draws.
      await form.locator("form").evaluate((element, id) => {
        const forged = document.createElement("input");
        forged.type = "hidden";
        forged.name = "repId";
        forged.value = id;
        element.appendChild(forged);
      }, saad);
      await form.getByRole("button", { name: t("common.save") }).click();

      await expect(
        form.getByRole("alert").filter({ hasText: t("common.onBehalf.notForOthers") }).first(),
      ).toBeVisible(COLD);
      expect(await onTheJob(), "a forged request was written").toBe(before);
    });

    await test.step("Rawan's form for Saad on Faisal's own job is refused at For, naming him", async () => {
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/quotations`);
      await page.getByRole("button", { name: t("quotations.issueOwn") }).first().click();
      const form = page.getByRole("dialog", { name: t("quotations.issueOwn") });
      const forPicker = form.getByRole("combobox", { name: t("common.onBehalf.for") });
      await expect(forPicker).toBeVisible(COLD);
      // Chosen as Faisal, so his customer and his job are offered...
      await choose(page, forPicker, await personName("faisal@technopanel.com.sa", locale));
      await choose(page, form.getByRole("combobox", { name: t("common.company") }), job.company_name);
      await choose(page, form.getByRole("combobox", { name: t("common.project") }), job.name);
      await fillOneItem(form, t);
      await form.getByLabel(t("common.smacNumber")).fill(smac);

      // ...and sent as Saad, who works neither.
      await form.locator('input[name="repId"]').evaluate((element, id) => {
        (element as HTMLInputElement).value = id;
      }, saad);
      await form.getByRole("button", { name: t("quotations.issue"), exact: true }).click();

      await expect(
        form
          .getByRole("alert")
          .filter({ hasText: t("common.onBehalf.notTheirs", { name: saadName }) })
          .first(),
      ).toBeVisible(COLD);
      expect(await onTheJob(), "a quotation for somebody off the customer was written").toBe(before);
      const numbered = await query<{ id: string }>("select id from quotations where smac_number = $1", [smac]);
      expect(numbered).toHaveLength(0);
    });
  } finally {
    // Nothing should have been written; if something was, it does not outlive the run.
    const stray = await query<{ id: string }>(
      "select id from quotations where project_id = $1::uuid and smac_number = $2",
      [job.id, smac],
    );
    for (const row of stray) await removeQuotation(row.id);
  }
});
