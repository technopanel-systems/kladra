import type { Locator, Page, Request } from "@playwright/test";
import { login } from "./helpers/auth";
import {
  floorOfCompany,
  one,
  personName,
  query,
  restoreCompanyFloor,
  userId,
} from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { pickFirst, pressChip } from "./helpers/pick";
import { quotationLabel } from "@/lib/labels";
import { quotationEvent } from "@/lib/quotation-events";

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

/**
 * Chooses one item from a drawer's More menu. Past Add report and Add project,
 * everything a company drawer offers — Edit, Sharing, Hand over, Archive — is
 * in that one menu at the end of the action row (P13-G6 S12.2, DESIGN §6).
 */
async function fromMore(page: Page, within: Locator, menuLabel: string, item: string): Promise<void> {
  await within.getByRole("button", { name: menuLabel }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
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

      await fromMore(
        page,
        drawer,
        t("common.moreFor", { name: fixture.company }),
        t("drawer.share.action"),
      );
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
      // contact stays Faisal's: one of the two rows has a menu to touch it by.
      await expect(
        rows.getByRole("button", { name: t("common.moreFor", { name: fixture.contactName }) }),
      ).toHaveCount(1);
    });

    await test.step("4 · Saad tries the work he has not been given: no project of his own, no log, no quotation", async () => {
      const drawer = dialogNamed(page, fixture.company);

      // A company share carries reading, his own contacts and his own reports
      // (D147, D176) — so the action row holds Add report and nothing that
      // works the customer: no New project, no Edit, no Archive. Its More menu
      // holds the one thing a sharer may do to the share itself: leave it.
      const actions = drawer.getByRole("group", { name: t("drawer.companyActions") });
      await expect(actions.getByRole("button", { name: t("common.addReport") })).toBeVisible();
      const more = actions.getByRole("button", { name: t("common.moreFor", { name: fixture.company }) });
      await expect(actions.getByRole("button")).toHaveCount(2);
      await more.click();
      const menu = page.getByRole("menu");
      await expect(menu.getByRole("menuitem")).toHaveCount(1);
      await expect(menu.getByRole("menuitem")).toHaveText(t("drawer.share.leave"));
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);

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

      // Sharing is in the project drawer's menu since P13-G6 S12.3.
      await project.getByRole("button", { name: t("common.moreFor", { name: fixture.project }) }).click();
      await page.getByRole("menuitem", { name: t("drawer.share.action"), exact: true }).click();
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
      // Withdraw is last in the drawer's menu since P13-G6 S12.4.
      await own.locator('[data-slot="row-menu"]').click();
      await expect(page.getByRole("menuitem", { name: t("quotations.cancel"), exact: true })).toBeVisible();
      await page.keyboard.press("Escape");

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
        sheet.locator('[data-slot="row-menu"]'),
        "Faisal, who did not raise this quotation, was offered the menu that holds Withdraw",
      ).toHaveCount(0);
    });

    await test.step("6 · Faisal takes Saad off the company; the project goes with it, and what Saad made stays", async () => {
      await page.goto(`/${locale}/companies?open=${companyId}`);
      const drawer = dialogNamed(page, fixture.company);
      await expect(drawer).toBeVisible(COLD);
      await fromMore(
        page,
        drawer,
        t("common.moreFor", { name: fixture.company }),
        t("drawer.share.action"),
      );
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

      // The project's link says it is gone, as the company's does (P13-G6).
      await page.goto(`/${locale}/projects?open=${projectId}`);
      await expect(page.getByText(t("drawer.projectGone"))).toBeVisible(COLD);
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
    await fromMore(page, drawer, t("common.moreFor", { name: target.name }), t("drawer.handOver"));

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

/** A line of the load, by the number it carries — the quotation's own (tests/dispatches.spec.ts). */
function loadLine(form: Locator, position: number): Locator {
  return form.locator(`[data-slot="dispatch-line"][data-position="${position}"]`);
}

/**
 * The load cut down to one line of the paper, at this quantity
 * (tests/dispatches.spec.ts, where the same helper is written for the same
 * reason): the dialog opens on every line with something left on it, and a walk
 * that wants one sheet says so the way a rep does — the other lines taken off,
 * which is a partial load and not a difference.
 */
async function sendOnly(form: Locator, t: Translate, position: number, qty: number): Promise<void> {
  await expect(loadLine(form, position)).toBeVisible(COLD);
  const others = form.locator(`[data-slot="dispatch-line"]:not([data-position="${position}"])`);
  for (let count = await others.count(); count > 0; count -= 1) {
    await others.first().getByRole("button", { name: t("quotations.removeItem") }).click();
    await expect(others).toHaveCount(count - 1);
  }
  await loadLine(form, position).getByLabel(t("dispatches.sending")).fill(String(qty));
}

/** Where this load is going — typed once, and read back off Faisal's screen. */
const SITE = "Riyadh — the shared job, site gate";

/**
 * Faisal's own live paper on the shared job, and a line of it with a sheet
 * still on it.
 *
 * Asked the way the app asks it (tests/dispatches.spec.ts): the latest revision
 * of a quotation goods may move against, and a line whose quantity is more than
 * everything already on a waiting or approved load (D12). One sheet is all this
 * walk sends, so one is all it asks for — the dispatch specs earlier in the run
 * have been eating the same papers all morning, in both locale projects against
 * the one seeded database (playwright.config.ts).
 */
async function papersOnTheProject(projectId: string) {
  return query<{ id: string; number: number; revision: number; status: string; position: number }>(
    `select q.id, q.number, q.revision, q.status::text as status, qi.position
       from quotations q
       join quotation_items qi on qi.quotation_id = q.id
      where q.project_id = $1::uuid
        and q.status in ('issued', 'accepted')
        and not exists (
          select 1 from quotations later
           where later.number = q.number and later.revision > q.revision
        )
        and qi.qty > (
          select coalesce(sum(di.qty), 0)
            from dispatch_items di
            join dispatches d on d.id = di.dispatch_id
           where di.quotation_item_id = qi.id
             and d.status in ('submitted', 'approved')
        )
      order by q.number, qi.position
      limit 1`,
    [projectId],
  );
}

/**
 * The dispatch half of step 5 (SPEC §3: "An item belongs to whoever created it,
 * and only he edits it"; P14.5).
 *
 * Step 5 above proves that sentence for a QUOTATION — Saad raises one on the
 * shared job and Faisal, whose customer it is, is offered no Edit request and
 * no Withdraw. The dispatch was never walked, and that is exactly where it was
 * untrue. `updateDispatchAction` asked `mayRaiseFor`, which is the question the
 * REQUEST asks and a wider one: it says yes to the customer's rep and to
 * everybody on the job. And the drawer worked its Edit button out from
 * `mayQuote(user, dispatch.companyRepId)` — the COMPANY's rep, which is neither
 * the action's question nor §3's.
 *
 * So on a shared job Faisal could rewrite every line, quantity, destination and
 * payment term of a load Saad had raised — and a plain re-save moved the metres
 * with it, because the credit is worked out again from whoever pressed Save
 * (D148) and `dispatch_credits` is what achieved m² is counted from. Both ask
 * `mayWrite(actor, dispatch.repId)` now, the same sentence the quotation chain
 * asks.
 *
 * A load against the paper, and not a direct one. That is not a preference: a
 * direct load has no job under it, so `mayRaiseFor` is asked with a null
 * project and the customer decides alone (src/lib/visibility.ts) — Saad cannot
 * raise one on Faisal's customer at all, and a walk built on a load he is not
 * entitled to raise would prove nothing about this rule. The project share is
 * the whole of his standing here, so the load comes through the job: Faisal's
 * own issued paper on it, which is what the seed already put there.
 */
test("a load raised on a shared job is the raiser's, and the customer's rep does not edit it", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Three sign-ins, a share, and a load raised through the dialog.

  const start = new Date();
  const fixture = fixtures(locale);
  const { companyId, projectId } = await companyAndProject(fixture.company, fixture.project);
  const saadId = await userId("saad@technopanel.com.sa");
  const saadName = await personName("saad@technopanel.com.sa", locale);

  const papers = await papersOnTheProject(projectId);
  expect(
    papers,
    `no live quotation with a sheet left on it under ${fixture.project} — the dispatch specs earlier in the run have sent everything against it`,
  ).toHaveLength(1);
  const paper = papers[0];
  const label = quotationLabel(paper.number, paper.revision);

  let dispatchId = "";

  try {
    await test.step("1 · Faisal puts Saad on the job", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/projects?open=${projectId}`);
      const project = dialogNamed(page, fixture.project);
      await expect(project).toBeVisible(COLD);

      // Sharing is in the project drawer's menu since P13-G6 S12.3.
      await project
        .getByRole("button", { name: t("common.moreFor", { name: fixture.project }) })
        .click();
      await page.getByRole("menuitem", { name: t("drawer.share.action"), exact: true }).click();
      const share = page.getByRole("dialog", { name: t("drawer.share.projectTitle") });
      await pickPerson(
        page,
        share.getByRole("combobox", { name: t("drawer.share.projectWho") }),
        saadName,
      );
      await share.getByRole("button", { name: t("drawer.share.add") }).click();
      await expect(
        page.getByText(t("drawer.share.added", { name: saadName, label: fixture.project })),
      ).toBeVisible(COLD);
    });

    await test.step("2 · Saad sends one sheet against Faisal's paper, and the load is his", async () => {
      await login(page, locale, "saad");
      await page.goto(`/${locale}/quotations?open=${paper.id}`);
      const drawer = dialogNamed(page, label);
      await expect(drawer).toBeVisible(COLD);

      // Sending goods against a price is new work on a job §3 gives him, which
      // is why the button is on his screen at all (src/components/quotations/
      // quotation-drawer.tsx, §5 #163).
      await drawer.getByRole("button", { name: t("dispatches.request") }).click();
      const form = page.getByRole("dialog", { name: t("dispatches.requestFor", { label }) });
      await sendOnly(form, t, paper.position, 1);
      await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
      await form.getByLabel(t("common.destination")).fill(SITE);
      await pressChip(form, t("dispatches.payment.cash"));
      await pressChip(form, t("dispatches.payment.onDelivery"));
      await form.getByRole("button", { name: t("common.save") }).click();

      await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
      dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(dispatchId).not.toBe("");

      const row = await one<{ rep_id: string }>("select rep_id from dispatches where id = $1::uuid", [
        dispatchId,
      ]);
      expect(row.rep_id, "the load Saad raised does not carry his own id").toBe(saadId);

      // And the metres with it: `dispatch_credits` is what achieved m² is
      // counted from (D148), and this load's are his alone.
      const credited = await query<{ user_id: string }>(
        "select user_id from dispatch_credits where dispatch_id = $1::uuid",
        [dispatchId],
      );
      expect(
        credited.map((person) => person.user_id),
        "the load Saad raised counts for somebody else",
      ).toEqual([saadId]);

      // It is his: the raiser's own action is on its drawer.
      const own = page.getByRole("dialog").first();
      await expect(own.getByRole("button", { name: t("dispatches.editRequest") })).toBeVisible(COLD);
    });

    await test.step("3 · Faisal owns the customer, reads all of the load, and is offered no Edit on it", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/dispatches?open=${dispatchId}`);
      const sheet = page.getByRole("dialog").first();
      await expect(sheet).toBeVisible(COLD);
      // Readable, down to the site Saad typed — a company shared is a company
      // SEEN, all of it (D147), and this one is his own customer besides. The
      // rule this step is about is the other half: seeing is not editing.
      await expect(sheet.getByText(SITE).first()).toBeVisible();

      await expect(
        sheet.getByRole("button", { name: t("dispatches.editRequest") }),
        "Faisal, who did not raise this load, was offered Edit request on it",
      ).toHaveCount(0);
    });
  } finally {
    // Whatever the walk above finished or did not: the load goes, the paper
    // goes back to the answer it had, and the job and the customer go back to
    // unshared — the Arabic run and every spec after this file need the floor
    // the seed left (playwright.config.ts: one seeded database, no parallelism).
    if (dispatchId) {
      await query(
        "delete from notifications where subject_type = 'dispatch' and subject_id = $1::uuid",
        [dispatchId],
      );
      await query("delete from audit_log where record_type = 'dispatch' and record_id = $1::text", [
        dispatchId,
      ]);
      // Lines, services and credit go with it (on delete cascade).
      await query("delete from dispatches where id = $1::uuid", [dispatchId]);
    }
    // Raising a load ANSWERS the paper it came from — "a dispatch implies the
    // customer accepted that quotation" (SPEC §3, P12-10) — so a paper that was
    // merely issued has to be put back unanswered, trail and all, the way
    // tests/dispatch-request.spec.ts puts its own back.
    if (paper.status === "issued") {
      await query(
        `update quotations set status = 'issued', decided_at = null, decision_reason = null
          where id = $1::uuid and status = 'accepted'`,
        [paper.id],
      );
      await query(
        `delete from audit_log
          where record_type = 'quotation' and record_id = $1::text
            and action = $2::text and details->>'impliedBy' = 'dispatch'`,
        [paper.id, quotationEvent("accepted")],
      );
    }
    await query("delete from project_shares where project_id = $1::uuid and user_id = $2::uuid", [
      projectId,
      saadId,
    ]);
    await query("delete from company_shares where company_id = $1::uuid and user_id = $2::uuid", [
      companyId,
      saadId,
    ]);
    await query(
      `delete from audit_log
        where record_type = 'projectShare' and record_id = $1::text and at >= $2::timestamptz`,
      [projectId, start.toISOString()],
    );
    await query(
      `delete from notifications
        where subject_type = 'project' and subject_id = $1::uuid and created_at >= $2::timestamptz`,
      [projectId, start.toISOString()],
    );
  }
});

/** One server-action press, as it went out on the wire. */
type ActionCall = { id: string; body: string; contentType: string };

/**
 * The POST a press made, caught and kept.
 *
 * A Next server action is a POST to the page it was pressed on, carrying the
 * action's own id in `next-action` and its arguments in the body. Keeping one
 * is the only way left to ask the ACTION a question the screen will not ask for
 * anybody: since D214 the Share control is simply ABSENT for the rep whose job
 * it is, and a control that is not on the screen cannot be clicked into a
 * refusal. So the manager's own press is caught here and made again below, by
 * somebody else, which is exactly the direct call D214 is about.
 *
 * Listened for rather than intercepted (`page.on`, not `page.route`): the press
 * being watched is a real one whose answer the step above is still asserting,
 * and a route handler that has to hand every request back is one more thing
 * between the button and the toast. The headers are read afterwards, because
 * `allHeaders` is asynchronous and a listener that awaits inside itself is a
 * race with the press it is watching.
 */
async function catchTheCall(
  page: Page,
  marker: string,
  press: () => Promise<void>,
): Promise<ActionCall> {
  const posts: Request[] = [];
  const watch = (request: Request) => {
    if (request.method() === "POST") posts.push(request);
  };
  page.on("request", watch);
  try {
    await press();
  } finally {
    page.off("request", watch);
  }

  for (const request of posts) {
    const headers = await request.allHeaders();
    const body = request.postData();
    const id = headers["next-action"];
    if (id && body?.includes(marker)) {
      return { id, body, contentType: headers["content-type"] ?? "text/plain;charset=UTF-8" };
    }
  }
  throw new Error(
    `no server action POST carrying ${marker} went out while Add was pressed — the share dialog no longer calls the action from the browser, and the direct call below has nothing to repeat`,
  );
}

/**
 * The same POST again, from whoever the page in hand is signed in as.
 *
 * Sent from inside the page rather than through `page.request`, so the browser
 * puts this person's session cookie and this origin on it itself — a server
 * action refuses a POST from anywhere else, and a refusal about the ORIGIN
 * would read exactly like the refusal this walk is looking for. The answer is
 * drained before the number is returned: the write happens while it is still
 * being streamed, and a spec that read the table first would read it too early.
 */
async function callAgain(page: Page, call: ActionCall, body: string): Promise<number> {
  return page.evaluate(
    async ({ id, contentType, payload }) => {
      const response = await fetch(window.location.href, {
        method: "POST",
        headers: { "next-action": id, "content-type": contentType },
        body: payload,
      });
      await response.text();
      return response.status;
    },
    { id: call.id, contentType: call.contentType, payload: body },
  );
}

/**
 * Everything one share writes for one person: the row on the job, and the row
 * on the customer under it. `shareProjectAction` writes both in one
 * transaction, because somebody put on a job he cannot see the customer of
 * would open nothing — which is the whole of why D214 asks two owners.
 */
async function sharesFor(projectId: string, companyId: string, person: string) {
  return query<{ kind: string }>(
    `select 'company' as kind from company_shares
      where company_id = $2::uuid and user_id = $3::uuid
     union all
     select 'project' as kind from project_shares
      where project_id = $1::uuid and user_id = $3::uuid
     order by kind`,
    [projectId, companyId, person],
  );
}

/**
 * A job whose rep is not the customer's rep, on a customer he can nevertheless
 * read — the shape D214 is about, asked by its definition rather than by a seed
 * name.
 *
 * The demo already holds one and the APP put it there: the manager folded
 * Turki's record of a customer into Faisal's and kept Faisal's
 * (scripts/seed/demo-data.ts, FOLD "keptAndShared"), and a fold leaves a
 * project on the survivor with its own rep unchanged (D158) and the man who
 * found the customer reading it through a company share. It is the same gap a
 * hand-over leaves, from the other end.
 */
async function aJobOnSomebodyElsesCustomer() {
  return query<{
    projectId: string;
    projectName: string;
    projectRepId: string;
    companyId: string;
    companyName: string;
    companyRepId: string;
  }>(
    `select p.id as "projectId", p.name as "projectName", p.rep_id as "projectRepId",
            c.id as "companyId", c.name as "companyName", c.rep_id as "companyRepId"
       from projects p
       join companies c on c.id = p.company_id
      where p.rep_id <> c.rep_id
        and p.archived_at is null and p.lost_at is null and c.archived_at is null
        and exists (
          select 1 from company_shares s
           where s.company_id = c.id and s.user_id = p.rep_id
        )
      order by p.created_at
      limit 1`,
  );
}

/**
 * D214 — a share is granted by the owner of the thing it actually opens (P14.5,
 * the tooling sweep's security pass).
 *
 * §3 says a company's or a project's owner may share his own, because inviting
 * help is his call. Kladra reads that as TWO gates, because sharing a job
 * writes two rows: the project share, and a company share beside it — and a
 * company share is total read on that customer, every contact, every price,
 * every load. `shareProjectAction` asked only about the project, and on every
 * ordinary record that is the same question, because the job's rep and the
 * customer's rep are one man.
 *
 * They part company exactly where the customer has MOVED. A hand-over
 * deliberately leaves a third rep's job with him — "a handover is not a way to
 * take somebody else's work" (src/actions/companies.ts) — and a fold leaves one
 * on the survivor the same way (D158). In that gap a rep could put anybody he
 * liked on a customer who was not his and had never been his, and neither the
 * customer's rep nor the manager was told.
 *
 * So this walks the gap being MADE, by the manager's own hand-over, which is a
 * real control on a real screen; the job that stays behind was put there by the
 * app's own fold before the demo was seeded. Then the three sentences D214
 * ends on: the job is still his to work, it is not his to share, and the
 * manager, who may share anybody's, still can.
 *
 * The one thing built by hand is nothing: the state this needs is in the seed
 * already. What the walk itself writes — a customer on another floor, two
 * shares and an audit trail — goes back in the `finally`, floor and all.
 */
test("D214 · a job on a customer who has moved is still his to work, and not his to share", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Four sign-ins, a hand-over, a share, and two direct calls.

  const start = new Date();
  const found = await aJobOnSomebodyElsesCustomer();
  expect(
    found,
    "no live job sits on a customer whose rep is somebody else — the seed's fold (demo-data.ts FOLD) is what puts one there, and D214 has nothing to be about without it",
  ).toHaveLength(1);
  const job = found[0];
  // Named, because the walk below signs in as him. The query asks for the state
  // by its definition rather than by a seed key, and the one the demo holds is
  // Turki's — so if it ever finds a different one, this says so here instead of
  // failing four steps down as a drawer that will not open.
  expect(
    job.projectRepId,
    "the job on somebody else's customer is not Turki's — this walk signs in as him",
  ).toBe(await userId("turki@technopanel.com.sa"));

  // Whom the customer is handed to. The coordinator, who "creates companies,
  // projects and quotations like a rep" (SPEC §3) and holds a floor for them to
  // sit on — and who holds nothing on this customer today, which is what lets
  // the `finally` put it back exactly: a hand-over takes the new owner's own
  // shares off what he now owns, and a share this walk never made is one it
  // could not know to restore.
  const rawanId = await userId("rawan@technopanel.com.sa");
  const rawanName = await personName("rawan@technopanel.com.sa", locale);
  expect(rawanId, "the coordinator already owns this customer").not.toBe(job.companyRepId);
  expect(rawanId, "the coordinator already owns this job").not.toBe(job.projectRepId);
  const hers = await query(
    `select 1 from company_shares where company_id = $1::uuid and user_id = $2::uuid
     union all
     select 1 from project_shares ps join projects p on p.id = ps.project_id
      where p.company_id = $1::uuid and ps.user_id = $2::uuid
     union all
     select 1 from contacts where company_id = $1::uuid and rep_id = $2::uuid`,
    [job.companyId, rawanId],
  );
  expect(
    hers,
    "the coordinator already holds something on this customer — the hand-over would take it off her and this walk has no way to put it back",
  ).toHaveLength(0);

  // Two people with nothing to do with this customer: the one the manager
  // actually puts on the job, and the one the direct call aims at. Faisal is
  // the second on purpose — the hand-over has just taken this customer off him,
  // so a share granted to him would hand a man back total read of a customer
  // who is no longer his, which is the exact shape of the thing D214 stops.
  const marketingId = await userId("marketing@technopanel.com.sa");
  const marketingName = await personName("marketing@technopanel.com.sa", locale);
  const faisalId = await userId("faisal@technopanel.com.sa");
  const faisalName = await personName("faisal@technopanel.com.sa", locale);

  const floor = await floorOfCompany(job.companyId);
  let call: ActionCall | null = null;

  try {
    await test.step("1 · the manager hands the customer to the coordinator; the job stays where it was", async () => {
      await login(page, locale, "abdulrahman");
      await page.goto(`/${locale}/companies?open=${job.companyId}`);
      const drawer = dialogNamed(page, job.companyName);
      await expect(drawer).toBeVisible(COLD);

      await fromMore(
        page,
        drawer,
        t("common.moreFor", { name: job.companyName }),
        t("drawer.handOver"),
      );
      const dialog = page.getByRole("dialog", {
        name: t("drawer.handOverTitle", { name: job.companyName }),
      });
      await expect(dialog).toBeVisible();
      await pickPerson(page, dialog.getByRole("combobox"), rawanName);
      await dialog.getByRole("button", { name: t("drawer.handOver") }).click();

      await expect
        .poll(
          async () =>
            (
              await one<{ repId: string }>(
                'select rep_id as "repId" from companies where id = $1::uuid',
                [job.companyId],
              )
            ).repId,
          { timeout: 15_000 },
        )
        .toBe(rawanId);

      // Only the departing rep's jobs travel with the customer, on purpose:
      // "a handover is not a way to take somebody else's work". So this one is
      // still its own rep's — and it now sits on a customer who has never been
      // his and is no longer the man's who let him in.
      const stayed = await one<{ repId: string }>(
        'select rep_id as "repId" from projects where id = $1::uuid',
        [job.projectId],
      );
      expect(stayed.repId, "the hand-over carried a third rep's job off with it").toBe(
        job.projectRepId,
      );
    });

    await test.step("2 · its own rep works it as before, and is offered no Sharing on it", async () => {
      await login(page, locale, "turki");
      await page.goto(`/${locale}/projects?open=${job.projectId}`);
      const sheet = dialogNamed(page, job.projectName);
      await expect(sheet).toBeVisible(COLD);

      // His to work, quote and dispatch — which is the half of D214 that takes
      // nothing away. He reads the customer through the share the fold gave
      // him, and the job is his outright.
      await sheet.getByRole("tab", { name: t("common.quotations") }).click();
      await expect(
        sheet.getByRole("button", { name: t("quotations.request"), exact: true }),
      ).toBeVisible();

      await sheet
        .getByRole("button", { name: t("common.moreFor", { name: job.projectName }) })
        .click();
      const menu = page.getByRole("menu");
      // The menu is open and it is his: Edit is in it, because owning the row
      // is a different question from sharing it (src/components/projects).
      await expect(menu.getByRole("menuitem", { name: t("common.edit"), exact: true })).toBeVisible();
      await expect(
        menu.getByRole("menuitem", { name: t("drawer.share.action"), exact: true }),
        "the rep whose job this is was offered Sharing on a customer who is not his (D214)",
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
    });

    await test.step("2a · and on a job of his own, on his own customer, it is there", async () => {
      // The control that keeps the step above honest. The rule is not "a rep
      // may not share a job" — it is "not one whose customer is not his" — and
      // an absence proves nothing until the same menu is shown carrying it.
      const own = await one<{ id: string; name: string }>(
        `select p.id, p.name
           from projects p
           join companies c on c.id = p.company_id
          where p.rep_id = $1::uuid and c.rep_id = $1::uuid
            and p.archived_at is null and p.lost_at is null and c.archived_at is null
          order by p.created_at
          limit 1`,
        [job.projectRepId],
      );

      await page.goto(`/${locale}/projects?open=${own.id}`);
      const mine = dialogNamed(page, own.name);
      await expect(mine).toBeVisible(COLD);
      await mine.getByRole("button", { name: t("common.moreFor", { name: own.name }) }).click();
      await expect(
        page.getByRole("menu").getByRole("menuitem", { name: t("drawer.share.action"), exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    });

    await test.step("3 · the manager, who may share anybody's, is offered it and uses it", async () => {
      await login(page, locale, "abdulrahman");
      await page.goto(`/${locale}/projects?open=${job.projectId}`);
      const sheet = dialogNamed(page, job.projectName);
      await expect(sheet).toBeVisible(COLD);

      await sheet
        .getByRole("button", { name: t("common.moreFor", { name: job.projectName }) })
        .click();
      const menu = page.getByRole("menu");
      // He writes nothing on anybody's floor (D42), so Sharing is the only
      // thing in his menu — no Edit, no Archive, no Mark lost.
      await expect(menu.getByRole("menuitem")).toHaveCount(1);
      await expect(menu.getByRole("menuitem")).toHaveText(t("drawer.share.action"));
      await menu.getByRole("menuitem", { name: t("drawer.share.action"), exact: true }).click();

      const share = page.getByRole("dialog", { name: t("drawer.share.projectTitle") });
      await expect(share).toBeVisible();
      await pickPerson(
        page,
        share.getByRole("combobox", { name: t("drawer.share.projectWho") }),
        marketingName,
      );

      call = await catchTheCall(page, job.projectId, async () => {
        await share.getByRole("button", { name: t("drawer.share.add") }).click();
        await expect(
          page.getByText(
            t("drawer.share.added", { name: marketingName, label: job.projectName }),
          ),
        ).toBeVisible(COLD);
      });

      expect(
        (await sharesFor(job.projectId, job.companyId, marketingId)).map((row) => row.kind),
        "the manager's share did not write both rows",
      ).toEqual(["company", "project"]);
    });

    await test.step("4 · the same call, made by the job's own rep, writes nothing", async () => {
      const made = call as ActionCall | null;
      expect(made, "the manager's press was never caught on the wire").not.toBeNull();
      const pressed = made as ActionCall;

      // His press with another name in it. Both are uuids and the body carries
      // them as text, so the swap changes who it is aimed at and nothing else —
      // and a body that came back unchanged would mean the call did not carry
      // the person he shared it with, which is worth failing on here rather
      // than three assertions later.
      const aimedAtFaisal = pressed.body.split(marketingId).join(faisalId);
      expect(
        aimedAtFaisal,
        "the manager's own call did not carry the id of the person he put on the job",
      ).not.toBe(pressed.body);
      expect(
        await sharesFor(job.projectId, job.companyId, faisalId),
        `${faisalName} is already on this customer, so the call below would prove nothing`,
      ).toHaveLength(0);

      await login(page, locale, "turki");
      await page.goto(`/${locale}/projects?open=${job.projectId}`);
      await expect(dialogNamed(page, job.projectName)).toBeVisible(COLD);
      const refused = await callAgain(page, pressed, aimedAtFaisal);

      expect(
        await sharesFor(job.projectId, job.companyId, faisalId),
        `the job's own rep put ${faisalName} on a customer that is not his, straight past the screen that no longer offers it (the action answered ${refused})`,
      ).toHaveLength(0);

      // And the same call from the manager goes through — which is what says
      // the refusal above was the ACTION's answer and not a POST that never
      // reached it. Without this the step passes just as well when the id is
      // wrong, the body is malformed or the route is gone.
      await login(page, locale, "abdulrahman");
      await page.goto(`/${locale}/projects?open=${job.projectId}`);
      await expect(dialogNamed(page, job.projectName)).toBeVisible(COLD);
      const allowed = await callAgain(page, pressed, aimedAtFaisal);

      expect(
        (await sharesFor(job.projectId, job.companyId, faisalId)).map((row) => row.kind),
        `the manager's own repeat of the same call wrote nothing either, so the refusal above proves nothing about the action (it answered ${allowed})`,
      ).toEqual(["company", "project"]);
    });
  } finally {
    // The two people this walk put on the job, and the customer under it.
    for (const person of [marketingId, faisalId]) {
      await query("delete from project_shares where project_id = $1::uuid and user_id = $2::uuid", [
        job.projectId,
        person,
      ]);
      await query("delete from company_shares where company_id = $1::uuid and user_id = $2::uuid", [
        job.companyId,
        person,
      ]);
    }
    // And the customer back on the floor it was on, with its jobs, its people
    // and the shares it already had — by id, each row to the state it was
    // actually in (tests/helpers/db.ts, and the five failures that taught it).
    await restoreCompanyFloor(floor);
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text
          and action = 'company.handOver' and at >= $2::timestamptz`,
      [job.companyId, start.toISOString()],
    );
    await query(
      `delete from audit_log
        where record_type = 'projectShare' and record_id = $1::text and at >= $2::timestamptz`,
      [job.projectId, start.toISOString()],
    );
    await query(
      `delete from notifications
        where subject_type = 'company' and subject_id = $1::uuid
          and kind = 'companyHandedOver' and created_at >= $2::timestamptz`,
      [job.companyId, start.toISOString()],
    );
    await query(
      `delete from notifications
        where subject_type = 'project' and subject_id = $1::uuid
          and kind = 'projectShared' and created_at >= $2::timestamptz`,
      [job.projectId, start.toISOString()],
    );
  }
});
