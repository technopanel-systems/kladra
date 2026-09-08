import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import {
  floorOfCompany,
  one,
  personName,
  query,
  restoreCompanyFloor,
  userId,
} from "./helpers/db";
import { test, expect, type Locale } from "./helpers/i18n";
import { pickFirst } from "./helpers/pick";

/**
 * P12 — two reps on one customer (WORKFLOW §3 "Two reps on one customer",
 * SPEC D147).
 *
 * A company can be shared: the second rep reads all of it and keeps his own
 * contacts, and works none of it. A project can be shared: the second rep
 * works it fully — logs, reports, quotations, dispatches — and what he
 * raises is his own, edited by nobody else. Six steps, walked in order.
 *
 * This walk needs its own company and project, not the seed's Anmaa and its
 * tower — those are ALREADY shared with Saad (scripts/seed/demo-data.ts:
 * "the case sharing exists for"), so every other screen in the suite has a
 * standing example, and the picker this test needs to press Add on would
 * find Saad already on the list and have nothing left to offer. Step 1 needs
 * a company that starts unshared and step 6 needs it unshared again at the
 * end, so this uses two of Faisal's OTHER companies instead — one per
 * locale, because both locale projects run against the one seeded database,
 * never in parallel (playwright.config.ts) — and the `finally` block below
 * puts both back to unshared even if an assertion above throws first.
 */

const COLD = { timeout: 30_000 };

type Fixture = {
  company: string;
  project: string;
  /** The person both reps have met — Faisal's contact already, name and phone. */
  contactName: string;
  contactPhone: string;
  /** SMAC's number on the one quotation the seed already raised there — the
   *  concrete, readable thing Saad's own eyes prove he can see (step 2). */
  smacNumber: string;
};

function fixtures(locale: Locale): Fixture {
  return locale === "en"
    ? {
        company: "مصنع سدرة للصناعات المعدنية",
        project: "واجهة مبنى الإدارة",
        contactName: "سعود المطرفي",
        contactPhone: "0551204477",
        smacNumber: "4519",
      }
    : {
        company: "مكتب المعمار الحديث للاستشارات الهندسية",
        project: "فيلا خاصة - الدرعية",
        contactName: "م. وليد القحطاني",
        contactPhone: "0509923417",
        smacNumber: "4531",
      };
}

/** A dialog or drawer by its title (tests/rep.spec.ts). */
function dialogNamed(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name });
}

async function companyAndProject(companyName: string, projectName: string) {
  const faisal = await userId("faisal@technopanel.com.sa");
  return one<{ companyId: string; projectId: string }>(
    `select c.id as "companyId", p.id as "projectId"
       from companies c
       join projects p on p.company_id = c.id
      where c.rep_id = $1::uuid and p.rep_id = $1::uuid
        and c.name = $2::text and p.name = $3::text
      limit 1`,
    [faisal, companyName, projectName],
  );
}

/**
 * Step 3 is "the same person Faisal already holds", so the fixture is only a
 * fixture while that person is Faisal's. When an earlier spec moves this
 * customer's people to somebody else and puts back only the company, step 3
 * asks Saad to add a contact he already has and fails on the toast, naming
 * nothing. This asks the question first, in one sentence.
 */
async function faisalHoldsTheContact(companyId: string, phone: string): Promise<boolean> {
  const rows = await query(
    `select 1 from contacts
      where company_id = $1::uuid
        and rep_id = (select id from users where email = 'faisal@technopanel.com.sa')
        and phone_normalized = $2::text
        and archived_at is null`,
    [companyId, phone],
  );
  return rows.length > 0;
}

/** Picks a specific person out of a share/hand-over picker (tests/marketing.spec.ts). */
async function pickPerson(page: Page, combobox: Locator, name: string): Promise<void> {
  await combobox.click();
  await page.getByRole("option").filter({ hasText: name }).first().click();
}

test("two reps on one customer: a shared company, a shared project, and taking the company back", async ({
  page,
  browser,
  locale,
  t,
}) => {
  test.slow(); // Five sign-ins, two shares, a raised quotation, and a revoke.

  const fixture = fixtures(locale);
  const { companyId, projectId } = await companyAndProject(fixture.company, fixture.project);
  const saadId = await userId("saad@technopanel.com.sa");
  const saadName = await personName("saad@technopanel.com.sa", locale);
  const faisalName = await personName("faisal@technopanel.com.sa", locale);

  let quotationId = "";

  // Saad's own bell, open before Faisal shares anything and never reloaded:
  // "Saad is told" is proved live or not at all (the suite's rule for
  // anything a second person is told without asking).
  const saadWatchContext = await browser.newContext();
  const saadWatch = await saadWatchContext.newPage();
  const unreadBefore = Number(
    (
      await one<{ unread: string }>(
        "select count(*)::text as unread from notifications where user_id = $1::uuid and read_at is null",
        [saadId],
      )
    ).unread,
  );

  try {
    await test.step("0 · Saad is watching his own bell", async () => {
      await login(saadWatch, locale, "saad");
      await saadWatch.goto(`/${locale}/day`);
      await saadWatch.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
    });

    await test.step("1 · Faisal opens the company and puts Saad on it; Saad is told, and the drawer says who else is on it", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/companies?open=${companyId}`);
      const drawer = dialogNamed(page, fixture.company);
      await expect(drawer).toBeVisible(COLD);

      await drawer.getByRole("button", { name: t("drawer.share.action") }).click();
      const share = page.getByRole("dialog", { name: t("drawer.share.companyTitle") });
      await expect(share).toBeVisible();

      await pickPerson(page, share.getByRole("combobox", { name: t("drawer.share.companyWho") }), saadName);
      await share.getByRole("button", { name: t("drawer.share.add") }).click();

      await expect(
        page.getByText(t("drawer.share.added", { name: saadName, label: fixture.company })),
      ).toBeVisible(COLD);

      // The header, refreshed by the dialog's own onDone, names him.
      const header = dialogNamed(page, fixture.company);
      await expect(header.getByText(t("drawer.share.onCompany"))).toBeVisible();
      await expect(header.getByText(saadName)).toBeVisible();

      // Told without asking, on a page open since before this and never
      // reloaded (WORKFLOW's live-update rule).
      await expect(
        saadWatch.getByRole("link", { name: t("shell.unreadCount", { count: unreadBefore + 1 }) }),
      ).toBeVisible(COLD);

      // Not only that the bell moved — what it says.
      await saadWatch.goto(`/${locale}/notifications`);
      await expect(
        saadWatch.getByText(
          t("notifications.companyShared", { rep: faisalName, label: fixture.company }),
        ),
      ).toBeVisible(COLD);
      await saadWatchContext.close();
    });

    await test.step("2 · Saad, who has never seen this customer, opens it from his own list: readable, and none of it his", async () => {
      await login(page, locale, "saad");
      await page.goto(`/${locale}/companies`);
      await page
        .getByRole("link", { name: t("companies.openCompany", { name: fixture.company }) })
        .click();

      const drawer = dialogNamed(page, fixture.company);
      await expect(drawer).toBeVisible(COLD);

      await drawer.getByRole("tab", { name: t("common.contacts") }).click();
      // Not a bare getByText: the contact's name is also inside the WhatsApp
      // link's own sr-only label a few nodes over ("Message {name} on
      // WhatsApp", tests/../rules/words.md's PhoneLinks), so the plain text
      // matches twice. The row is one thing to be visible; the text inside it
      // is two.
      await expect(
        drawer.getByRole("listitem").filter({ hasText: fixture.contactName }).first(),
      ).toBeVisible();

      await drawer.getByRole("tab", { name: t("common.projects") }).click();
      await expect(
        drawer.getByRole("listitem").filter({ hasText: fixture.project }).first(),
      ).toBeVisible();

      // The one quotation the seed already raised there — Faisal's own,
      // never Saad's, and fully readable down to SMAC's own number (D147:
      // "a company shared is a company SEEN, all of it").
      await drawer.getByRole("tab", { name: t("common.quotations") }).click();
      await expect(drawer.getByText(fixture.smacNumber, { exact: true }).first()).toBeVisible();
    });

    await test.step("3 · Saad adds his own contact — the same person Faisal already holds — and neither is a duplicate", async () => {
      expect(
        await faisalHoldsTheContact(companyId, `+966${fixture.contactPhone.slice(1)}`),
        `${fixture.contactName} is not Faisal's contact on this company — an earlier spec moved this floor and put back only the company`,
      ).toBe(true);

      const drawer = dialogNamed(page, fixture.company);
      await drawer.getByRole("tab", { name: t("common.contacts") }).click();
      await drawer.getByRole("button", { name: t("drawer.addContact") }).first().click();

      const dialog = dialogNamed(page, t("forms.addContact"));
      await dialog.getByLabel(t("common.name"), { exact: true }).fill(fixture.contactName);
      await dialog.getByLabel(t("common.phone")).fill(fixture.contactPhone);
      await dialog.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("forms.added", { name: fixture.contactName }))).toBeVisible(COLD);

      const reopened = dialogNamed(page, fixture.company);
      const rows = reopened.getByRole("listitem").filter({ hasText: fixture.contactName });
      // Faisal's, and now Saad's — the same name and number, twice, and
      // neither is a duplicate: `contacts_one_main_idx` and the phone index
      // are both keyed by rep now (drizzle/0014_who_else_is_on_it.sql).
      await expect(rows).toHaveCount(2);

      // Each is main for its own rep — one company, two "main contact" badges.
      await expect(rows.getByText(t("drawer.mainContact"))).toHaveCount(2);

      // And only the row Saad just added is his to touch. Faisal's main
      // contact stays Faisal's.
      await expect(rows.getByRole("button", { name: t("common.edit"), exact: true })).toHaveCount(1);
    });

    await test.step("4 · Saad tries the work he has not been given: no project of his own, no log, no quotation", async () => {
      const drawer = dialogNamed(page, fixture.company);

      // A company share carries reading and his own contacts, nothing else
      // (D147) — the whole action row (Log, New project, Edit, Archive) is
      // one group, gated by `mine`, and it is not there at all.
      await expect(drawer.getByRole("group", { name: t("drawer.companyActions") })).toHaveCount(0);

      await drawer.getByRole("tab", { name: t("common.projects") }).click();
      await expect(
        drawer.getByRole("button", { name: t("drawer.newProject"), exact: true }),
      ).toHaveCount(0);

      await drawer.getByRole("tab", { name: t("common.quotations") }).click();
      await expect(
        drawer.getByRole("button", { name: t("quotations.request"), exact: true }),
      ).toHaveCount(0);

      // The server side of the same two sentences — `mayWorkProject` and
      // `mayKeepContacts` for every role — is proved directly in
      // tests/floor.spec.ts, so a screen and the server cannot answer
      // differently (D50, D56) without one of the two failing.
    });

    await test.step("5 · Faisal puts Saad on the project; Saad raises a quotation and it is his; Faisal sees it and cannot edit it", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/projects?open=${projectId}`);
      const project = dialogNamed(page, fixture.project);
      await expect(project).toBeVisible(COLD);

      await project.getByRole("button", { name: t("drawer.share.action") }).click();
      const share = page.getByRole("dialog", { name: t("drawer.share.projectTitle") });
      await pickPerson(page, share.getByRole("combobox", { name: t("drawer.share.projectWho") }), saadName);
      await share.getByRole("button", { name: t("drawer.share.add") }).click();
      await expect(
        page.getByText(t("drawer.share.added", { name: saadName, label: fixture.project })),
      ).toBeVisible(COLD);

      await login(page, locale, "saad");
      await page.goto(`/${locale}/projects?open=${projectId}`);
      const drawer = dialogNamed(page, fixture.project);
      await drawer.getByRole("tab", { name: t("common.quotations") }).click();
      await drawer.getByRole("button", { name: t("quotations.request") }).first().click();

      const form = page.getByRole("dialog", {
        name: t("quotations.requestFor", { project: fixture.project }),
      });
      await form.getByLabel(t("common.colourCode")).fill("168");
      for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
        await pickFirst(form.getByRole("combobox", { name: t(label) }));
      }
      await form.getByLabel(t("common.qty")).fill("20");
      await form.getByLabel(t("common.pricePerSqm")).fill("100");
      await form.getByRole("button", { name: t("common.save") }).click();

      await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
      quotationId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(quotationId).not.toBe("");

      const row = await one<{ rep_id: string }>("select rep_id from quotations where id = $1::uuid", [
        quotationId,
      ]);
      expect(row.rep_id, "the quotation Saad raised does not carry his own id").toBe(saadId);

      // It is his: the requester's own actions are on it.
      const own = page.getByRole("dialog").first();
      await expect(own.getByRole("button", { name: t("quotations.editRequest") })).toBeVisible();
      await expect(own.getByRole("button", { name: t("quotations.cancel") })).toBeVisible();

      // Faisal owns the company and reads everything under it, but this item
      // belongs to whoever created it, and only he edits it (SPEC §3, D147).
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/quotations?open=${quotationId}`);
      const sheet = page.getByRole("dialog").first();
      await expect(sheet).toBeVisible(COLD);
      await expect(
        sheet.getByRole("button", { name: t("quotations.editRequest") }),
        "Faisal, who did not raise this quotation, was offered Edit request on it",
      ).toHaveCount(0);
      await expect(
        sheet.getByRole("button", { name: t("quotations.cancel") }),
        "Faisal, who did not raise this quotation, was offered Cancel on it",
      ).toHaveCount(0);
    });

    await test.step("6 · Faisal takes Saad off the company; the project goes with it, and what Saad made stays", async () => {
      await page.goto(`/${locale}/companies?open=${companyId}`);
      const drawer = dialogNamed(page, fixture.company);
      await drawer.getByRole("button", { name: t("drawer.share.action") }).click();
      const share = page.getByRole("dialog", { name: t("drawer.share.companyTitle") });

      await share
        .getByRole("listitem")
        .filter({ hasText: saadName })
        .getByRole("button", { name: t("drawer.share.remove") })
        .click();
      const confirm = page.getByRole("dialog", {
        name: t("drawer.share.removeCompanyTitle", { name: saadName }),
      });
      await confirm.getByRole("button", { name: t("drawer.share.remove") }).click();
      await expect(
        page.getByText(t("drawer.share.removed", { name: saadName, label: fixture.company })),
      ).toBeVisible(COLD);

      const shares = await query(
        "select 1 from company_shares where company_id = $1::uuid and user_id = $2::uuid",
        [companyId, saadId],
      );
      expect(shares, "the company share was not removed").toHaveLength(0);
      // A job on a customer he can no longer see would be a permission
      // pointing at nothing, so it goes with it.
      const projectShares = await query(
        "select 1 from project_shares where project_id = $1::uuid and user_id = $2::uuid",
        [projectId, saadId],
      );
      expect(projectShares, "the project share survived the company being taken back").toHaveLength(0);

      await login(page, locale, "saad");
      await page.goto(`/${locale}/companies?open=${companyId}`);
      await expect(dialogNamed(page, fixture.company)).toHaveCount(0);
      await expect(page.getByText(t("drawer.companyGone"))).toBeVisible(COLD);

      await page.goto(`/${locale}/projects?open=${projectId}`);
      await expect(page.getByRole("heading", { name: t("common.projects") })).toBeVisible(COLD);
      await expect(dialogNamed(page, fixture.project)).toHaveCount(0);

      // What he made is a record of work that happened, and it stays.
      const contact = await query(
        "select 1 from contacts where company_id = $1::uuid and rep_id = $2::uuid",
        [companyId, saadId],
      );
      expect(contact, "Saad's own contact did not survive the company being taken back").toHaveLength(1);
      const quotation = await one<{ rep_id: string }>(
        "select rep_id from quotations where id = $1::uuid",
        [quotationId],
      );
      expect(quotation.rep_id).toBe(saadId);
    });
  } finally {
    // Whatever the walk above finished or did not, this company and project
    // go back to unshared — the next run of this same file, in the other
    // locale project or the next full suite run, needs them to start there
    // (playwright.config.ts: one seeded database, no parallelism).
    await query("delete from project_shares where project_id = $1::uuid and user_id = $2::uuid", [
      projectId,
      saadId,
    ]);
    await query("delete from company_shares where company_id = $1::uuid and user_id = $2::uuid", [
      companyId,
      saadId,
    ]);

    // And what Saad made here goes with them. Step 6 proves it SURVIVES the
    // company being taken back, which is the product's rule; leaving it in the
    // database afterwards is this file's own business leaking into everybody
    // else's. A contact of Saad's on Faisal's customer is exactly the state
    // that made the manager's hand-over collide two files later (#159) — and
    // the spec that failed named the toast, not the cause.
    if (quotationId) {
      await query("delete from notifications where subject_type = 'quotation' and subject_id = $1::uuid", [quotationId]);
      await query("delete from audit_log where record_type = 'quotation' and record_id = $1::text", [quotationId]);
      // The lines go with it (`onDelete: "cascade"`, src/db/schema.ts).
      await query("delete from quotations where id = $1::uuid", [quotationId]);
    }
    await query("delete from contacts where company_id = $1::uuid and rep_id = $2::uuid", [
      companyId,
      saadId,
    ]);
  }
});


/**
 * The hand-over that used to collide (#159).
 *
 * Sharing a company is what produces two reps holding the same person: each
 * keeps his own contact, and that is not a duplicate (D147). Then the manager
 * hands the company to the rep who was only sharing it, the departing rep's
 * people travel with it, and the same number arrives at somebody who already
 * has it — which two unique indexes refuse: one number per rep per company,
 * and one main contact per rep per company.
 *
 * It reached the manager as "something went wrong", the hand-over silently did
 * not happen, and nothing on any screen said why. The new owner's own row
 * stands, because it carries what HE wrote about the person; the arriving
 * duplicate is archived where it is, never deleted (S16, D153).
 */
test("a company handed to the rep who already holds his own people there", async ({
  page,
  locale,
  t,
}) => {
  const faisalId = await userId("faisal@technopanel.com.sa");
  const saadId = await userId("saad@technopanel.com.sa");
  const saadName = await personName("saad@technopanel.com.sa", locale);
  const walked = fixtures(locale);

  // Not the company the walk above is already sharing, and not one Saad has a
  // contact on: this test creates that collision itself, in one row, so it can
  // say exactly which row is which afterwards.
  const target = await one<{
    id: string;
    name: string;
    contactId: string;
    contactName: string;
    phone: string;
    phoneNormalized: string;
  }>(
    `select c.id, c.name,
            ct.id as "contactId", ct.name as "contactName",
            ct.phone, ct.phone_normalized as "phoneNormalized"
       from companies c
       join contacts ct on ct.company_id = c.id
        and ct.rep_id = c.rep_id and ct.is_main and ct.archived_at is null
      where c.rep_id = $1::uuid and c.archived_at is null and c.name <> $2::text
        and not exists (select 1 from contacts x where x.company_id = c.id and x.rep_id = $3::uuid)
      order by c.name
      limit 1`,
    [faisalId, walked.company, saadId],
  );

  const floor = await floorOfCompany(target.id);
  let saadsOwn = "";

  try {
    // Saad's own row for the same person — the shape a shared company leaves
    // behind, written straight in because the walk above already proves the
    // screen that writes it.
    saadsOwn = (
      await one<{ id: string }>(
        `insert into contacts (company_id, rep_id, name, phone, phone_normalized, is_main)
              values ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, true)
           returning id`,
        [target.id, saadId, target.contactName, target.phone, target.phoneNormalized],
      )
    ).id;

    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/companies?open=${target.id}`);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    await drawer.getByRole("button", { name: t("drawer.handOver") }).click();

    const dialog = page.getByRole("dialog", {
      name: t("drawer.handOverTitle", { name: target.name }),
    });
    await expect(dialog).toBeVisible();
    await pickPerson(page, dialog.getByRole("combobox"), saadName);
    await dialog.getByRole("button", { name: t("drawer.handOver") }).click();

    await expect
      .poll(
        async () =>
          (
            await one<{ repId: string }>(
              'select rep_id as "repId" from companies where id = $1::uuid',
              [target.id],
            )
          ).repId,
        { timeout: 15_000 },
      )
      .toBe(saadId);

    const rows = await query<{
      id: string;
      repId: string;
      isMain: boolean;
      archived: boolean;
    }>(
      `select id, rep_id as "repId", is_main as "isMain", archived_at is not null as archived
         from contacts where company_id = $1::uuid`,
      [target.id],
    );
    const row = (id: string) => rows.find((r) => r.id === id)!;

    expect(row(saadsOwn), "the new owner's own contact did not survive the hand-over").toMatchObject(
      { repId: saadId, isMain: true, archived: false },
    );
    expect(
      row(target.contactId),
      "the arriving duplicate was moved onto the new owner instead of being archived where it stands",
    ).toMatchObject({ repId: faisalId, archived: true });

    const live = rows.filter((r) => !r.archived);
    expect(
      live.every((r) => r.repId === saadId),
      "somebody's live contact stayed behind on a company that moved",
    ).toBe(true);
    expect(
      live.filter((r) => r.isMain).length,
      "the hand-over left the new owner with more than one main contact",
    ).toBe(1);
  } finally {
    if (saadsOwn) await query("delete from contacts where id = $1::uuid", [saadsOwn]);
    await restoreCompanyFloor(floor);
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text and action = 'company.handOver'`,
      [target.id],
    );
    await query(
      `delete from notifications
        where subject_type = 'company' and subject_id = $1::uuid and kind = 'companyHandedOver'`,
      [target.id],
    );
  }
});
