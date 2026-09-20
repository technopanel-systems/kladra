import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P14 14.8 — archiving is a request, and the sales manager answers it.
 *
 * The founder, after a third round of use: "A company, a project or anything
 * else archivable: whoever asks writes a mandatory reason, the request goes to
 * the manager, and he approves or refuses it. A refusal comes back carrying his
 * reason, exactly as a refused dispatch does, and it can be corrected and asked
 * again. His own archives happen at once. Pending requests sit in the awaiting
 * section of his dashboard. One approval path for everything archivable, not
 * one per kind of record."
 *
 * Five claims and five tests: asking changes nothing about the record; his band
 * holds what is waiting on him and answering it yes takes the record off the
 * floor; a refusal comes back on the record carrying his words; a record with a
 * request waiting is not offered a second one; and the reason is mandatory on a
 * kind that never asked for one before.
 *
 * `tests/archive.spec.ts` is the other end of this — the admin's screen, where
 * an archived thing is found and put back. This file is about how it got there.
 */

const COLD = { timeout: 30_000 };

/** A company of Faisal's with nothing pending on it. */
async function spareCompany() {
  return one<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and c.archived_at is null
        and c.merged_into_id is null
        and not exists (
          select 1 from archive_requests r
           where r.kind = 'company' and r.record_id = c.id
        )
      order by c.created_at desc
      limit 1`,
  );
}

test("a rep asks to archive a customer, and it stays on his floor until somebody answers", async ({
  page,
  locale,
  t,
}) => {
  test.slow();
  const company = await spareCompany();
  const why = "الملف مغلق من طرفهم";

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${company.id}`);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);

    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("common.moreFor", { name: company.name }) })
      .click();
    // The button says what pressing it does: he is asking, not archiving.
    await page.getByRole("menuitem", { name: t("drawer.requestArchive") }).click();

    const ask = page.getByRole("dialog", {
      name: t("drawer.requestArchiveTitle", { name: company.name }),
    });
    await expect(ask).toBeVisible(COLD);
    await ask.getByLabel(t("drawer.archiveReason")).fill(why);
    await ask.getByRole("button", { name: t("drawer.requestArchive") }).click();
    await expect(ask).toBeHidden(COLD);

    // On the record, where it is read every day — not only in a bell that is
    // read once.
    const notice = page.locator('[data-slot="archive-request"][data-state="waiting"]');
    await expect(notice).toBeVisible(COLD);
    await expect(notice).toContainText(why);

    // And nothing has happened to the customer: he is still on the floor, which
    // is the whole of "a request changes nothing until it is answered".
    const state = await one<{ archived: string | null; status: string; reason: string }>(
      `select c.archived_at::text as archived, r.status, r.reason
         from companies c join archive_requests r on r.record_id = c.id and r.kind = 'company'
        where c.id = $1::uuid`,
      [company.id],
    );
    expect(state.archived, "asking to archive took the customer off the floor").toBeNull();
    expect(state.status).toBe("waiting");
    expect(state.reason).toBe(why);

    await page.goto(`/${locale}/companies`);
    await expect(page.getByText(company.name).first()).toBeVisible(COLD);
  } finally {
    await query(`delete from archive_requests where kind = 'company' and record_id = $1::uuid`, [
      company.id,
    ]);
  }
});

test("his own band holds what is waiting on him, and yes takes the record off the floor", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // The seed leaves one waiting on a customer (P14 14.8): his band is drawn
  // from it, and this is the row he answers.
  const waiting = await one<{ id: string; recordId: string; name: string }>(
    `select r.id, r.record_id as "recordId", c.name
       from archive_requests r join companies c on c.id = r.record_id
      where r.kind = 'company' and r.status = 'waiting'
      order by r.created_at
      limit 1`,
  );

  try {
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/team`);

    // Its own group, beside the coordinator's desk and not inside it.
    const band = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: t("team.archiveAsks") }) })
      .first();
    await expect(band).toBeVisible(COLD);
    await expect(band).toContainText(waiting.name);

    // The row is a door to the record, which is where he answers it.
    await band.getByRole("link").filter({ hasText: waiting.name }).first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    const notice = drawer.locator('[data-slot="archive-request"][data-state="waiting"]');
    await expect(notice).toBeVisible(COLD);

    await notice.getByRole("button", { name: t("dispatches.approve") }).click();
    const confirm = page.getByRole("dialog", {
      name: t("drawer.approveArchiveTitle", { name: waiting.name }),
    });
    await expect(confirm).toBeVisible(COLD);
    await confirm.getByRole("button", { name: t("dispatches.approve") }).click();
    await expect(confirm).toBeHidden(COLD);

    const after = await one<{ archived: string | null; status: string; decided: string | null }>(
      `select c.archived_at::text as archived, r.status, r.decided_at::text as decided
         from archive_requests r join companies c on c.id = r.record_id
        where r.id = $1::uuid`,
      [waiting.id],
    );
    expect(after.status, "approving left the request waiting").toBe("approved");
    expect(after.decided, "an answer with nobody's day on it").not.toBeNull();
    expect(after.archived, "approving the request did not archive the customer").not.toBeNull();
  } finally {
    // Back to the floor, and back to waiting, so the second locale walks the
    // same morning this one did.
    await query(
      `update companies set archived_at = null, archive_reason = null where id = $1::uuid`,
      [waiting.recordId],
    );
    await query(
      `update archive_requests
          set status = 'waiting', decided_by = null, decided_at = null, refuse_reason = null
        where id = $1::uuid`,
      [waiting.id],
    );
    await query(
      `delete from audit_log where record_type = 'company' and record_id = $1 and action = 'company.archive'`,
      [waiting.recordId],
    );
  }
});

test("a refusal comes back on the record, carrying his reason", async ({ page, locale, t }) => {
  // The seed leaves one refused, on a person at one of Faisal's customers.
  const refused = await one<{
    companyId: string;
    company: string;
    contact: string;
    refuseReason: string;
  }>(
    `select cc.id as "companyId", cc.name as company, ct.name as contact,
            r.refuse_reason as "refuseReason"
       from archive_requests r
       join contacts ct on ct.id = r.record_id
       join companies cc on cc.id = ct.company_id
      where r.kind = 'contact' and r.status = 'refused'
      limit 1`,
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies?open=${refused.companyId}`);
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible(COLD);
  await drawer.getByRole("tab", { name: t("common.contacts") }).click();

  const card = drawer.locator("li").filter({ hasText: refused.contact });
  const notice = card.locator('[data-slot="archive-request"][data-state="refused"]');
  await expect(notice).toBeVisible(COLD);
  // His words, on the record, where the next attempt has to answer them.
  await expect(notice).toContainText(refused.refuseReason);
  // And the person is still there: a refusal leaves the record exactly as it was.
  await expect(card).toBeVisible();
});

test("a record with a request waiting is not offered a second one", async ({
  page,
  locale,
  t,
}) => {
  const waiting = await one<{ id: string; name: string }>(
    `select c.id, c.name
       from archive_requests r join companies c on c.id = r.record_id
      where r.kind = 'company' and r.status = 'waiting' and c.archived_at is null
      limit 1`,
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies?open=${waiting.id}`);
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible(COLD);
  await expect(drawer.locator('[data-slot="archive-request"]')).toBeVisible(COLD);

  await drawer
    .getByRole("group", { name: t("drawer.companyActions") })
    .getByRole("button", { name: t("common.moreFor", { name: waiting.name }) })
    .click();
  // No dead control: the action would refuse a second ask, so the menu does not
  // offer one (DESIGN §5).
  await expect(page.getByRole("menuitem", { name: t("drawer.requestArchive") })).toHaveCount(0);
});

test("a job is asked for with a reason too, and an empty one is refused at the field", async ({
  page,
  locale,
  t,
}) => {
  const project = await one<{ id: string; name: string }>(
    `select p.id, p.name
       from projects p
       join companies c on c.id = p.company_id
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and p.archived_at is null and p.lost_at is null and c.archived_at is null
        and not exists (
          select 1 from archive_requests r where r.kind = 'project' and r.record_id = p.id
        )
      order by p.created_at desc
      limit 1`,
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/projects?open=${project.id}`);
  const sheet = page.getByRole("dialog", { name: project.name });
  await expect(sheet).toBeVisible(COLD);

  await sheet.getByRole("button", { name: t("common.moreFor", { name: project.name }) }).click();
  await page.getByRole("menuitem", { name: t("drawer.requestArchive") }).click();

  const ask = page.getByRole("dialog", {
    name: t("drawer.requestArchiveTitle", { name: project.name }),
  });
  await expect(ask).toBeVisible(COLD);
  // A job never asked for a reason until now. Pressing with an empty box is
  // answered in the app's own sentence, at the field (DESIGN §5).
  await ask.getByRole("button", { name: t("drawer.requestArchive") }).click();
  await expect(ask.getByText(t("errors.archiveReasonRequired"))).toBeVisible(COLD);

  const nothing = await query(
    `select 1 from archive_requests where kind = 'project' and record_id = $1::uuid`,
    [project.id],
  );
  expect(nothing.length, "a request was written with no reason on it").toBe(0);
});
