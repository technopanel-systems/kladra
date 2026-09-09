import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P11A-6 — a role with no floor cannot inherit a live floor (D91), and a child
 * restored onto an archived company no longer drags the company back with it
 * (D92).
 *
 * Both are refusals guarded on the server (`updateUserAction`, `restoreAction`
 * in src/actions/admin.ts) — this file only proves the screen tells the truth
 * about them: the sentence the action writes has to land somewhere Jerom can
 * read, and a child under an archived company has to show the same sentence
 * in place of a button that would only be refused.
 */

/** A cold screen behind a fresh query; the suite's default 5s is for a click
 *  (tests/admin.spec.ts). */
const COLD = { timeout: 30_000 };

/** A card in one of the admin's lists, by the text in it — and, where two
 *  rows could share a name (a contact's card also names its company), by the
 *  kind badge on the row (tests/admin.spec.ts's `card`, narrowed). */
function card(page: Page, name: string, kind?: string): Locator {
  const byName = page.getByRole("listitem").filter({ hasText: name });
  return (kind ? byName.filter({ hasText: kind }) : byName).first();
}

async function openAdmin(page: Page, locale: string, path: string, heading: string) {
  await page.goto(`/${locale}/admin/${path}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible(COLD);
}

/** A real reload, not a soft navigation — the fixture's hydration wait is
 *  wired onto `page.goto`, not `page.reload`, so this waits for it itself. */
async function reload(page: Page): Promise<void> {
  await page.reload();
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

test("a role with no floor is refused while companies are still on the account", async ({
  page,
  locale,
  t,
}) => {
  const faisalId = await userId("faisal@technopanel.com.sa");
  const faisalName = await personName("faisal@technopanel.com.sa", locale);
  const held = await one<{ n: number }>(
    `select count(*)::int as n from companies where rep_id = $1::uuid and archived_at is null`,
    [faisalId],
  );
  expect(held.n, "Faisal holds no live companies — the seed changed").toBeGreaterThan(0);

  await login(page, locale, "jerom");

  await test.step("open Faisal's edit dialog and ask for a role with no floor", async () => {
    await openAdmin(page, locale, "users", t("common.users"));

    const row = page.getByRole("table").first().getByRole("row").filter({ hasText: faisalName });
    await row.getByRole("button", { name: t("common.edit") }).click();

    const dialog = page.getByRole("dialog", { name: t("admin.editUser") });
    await expect(dialog).toBeVisible(COLD);

    // The admin, because it is the only role left that holds no floor: this
    // asked for the coordinator until SPEC §3 gave her companies of her own,
    // and the day it did, this test stopped testing the refusal and started
    // performing the change — turning Faisal into a coordinator for every spec
    // that ran after it, which is how a stale assertion becomes six failures
    // in files that have nothing to do with it.
    await dialog.getByRole("combobox", { name: t("common.role") }).click();
    await page
      .locator('[data-slot="popover-content"]')
      .getByText(t("common.admin"), { exact: true })
      .first()
      .click();
    await dialog.getByRole("button", { name: t("common.save") }).click();

    const expected = t("admin.roleHoldsCompanies", { count: held.n });
    await expect(
      dialog.getByRole("alert"),
      `the role field's error should read "${expected}" (D91) after asking to give ` +
        `a floorless role to an account still holding ${held.n} compan${held.n === 1 ? "y" : "ies"}`,
    ).toHaveText(expected, COLD);

    await page.keyboard.press("Escape");
  });

  await test.step("the refusal changed nothing", async () => {
    const after = await one<{ role: string }>("select role from users where id = $1::uuid", [
      faisalId,
    ]);
    // Put it back BEFORE asserting. The day the refusal stops happening — and
    // it did, when SPEC §3 gave the coordinator a floor — this spec is no
    // longer a test of a refusal, it is a rep being given another role in a
    // database every later file shares (§5 #167). The assertion below still
    // fails and still names it; this only stops it taking four other files
    // down with it.
    if (after.role !== "rep") {
      await query("update users set role = 'rep' where id = $1::uuid", [faisalId]);
    }
    expect(after.role, "the refused save changed Faisal's role anyway").toBe("rep");
  });
});

test("a child under an archived company gets a sentence, not a button; the company restored, it gets its button back", async ({
  page,
  locale,
  t,
}) => {
  const start = (await one<{ now: string }>("select now()::text as now")).now;

  const target = await one<{
    companyId: string;
    companyName: string;
    contactId: string;
    contactName: string;
  }>(
    `select companies.id as "companyId", companies.name as "companyName",
            contacts.id as "contactId", contacts.name as "contactName"
       from companies
       join contacts on contacts.company_id = companies.id
       join users on users.id = companies.rep_id
      where users.email = 'faisal@technopanel.com.sa'
        and companies.archived_at is null
        and contacts.archived_at is null
      order by companies.created_at desc
      limit 1`,
  );

  try {
    await test.step("archive the contact, then the company, by SQL", async () => {
      await query("update contacts set archived_at = now() where id = $1::uuid", [
        target.contactId,
      ]);
      await query(
        "update companies set archived_at = now(), archive_reason = 'restore.spec' where id = $1::uuid",
        [target.companyId],
      );

      const beforeCompany = await one<{ n: number }>(
        `select count(*)::int as n from audit_log
          where record_type = 'company' and record_id = $1::text and action = 'restore'
            and at >= $2::timestamptz`,
        [target.companyId, start],
      );
      const beforeContact = await one<{ n: number }>(
        `select count(*)::int as n from audit_log
          where record_type = 'contact' and record_id = $1::text and action = 'restore'
            and at >= $2::timestamptz`,
        [target.contactId, start],
      );
      expect(beforeCompany.n, "a restore row already exists for the company").toBe(0);
      expect(beforeContact.n, "a restore row already exists for the contact").toBe(0);
    });

    await login(page, locale, "jerom");
    await openAdmin(page, locale, "archive", t("admin.archive"));

    const companyCard = card(page, target.companyName, t("admin.kind.company"));
    const contactCard = card(page, target.contactName, t("admin.kind.contact"));

    await test.step("the company's card shows the reason; the contact's shows the sentence, not a button", async () => {
      await expect(companyCard).toBeVisible(COLD);
      await expect(companyCard).toContainText("restore.spec");

      await expect(contactCard).toBeVisible();
      await expect(contactCard).toContainText(t("admin.restoreCompanyFirstContact"));
      await expect(
        contactCard.getByRole("button", { name: t("admin.restore") }),
        "the contact's card offers a Restore button while its company is still archived (D92)",
      ).toHaveCount(0);
    });

    await test.step("restoring the company does not drag the contact back with it", async () => {
      await companyCard.getByRole("button", { name: t("admin.restore") }).click();
      await page
        .getByRole("dialog", { name: t("admin.restoreTitle", { name: target.companyName }) })
        .getByRole("button", { name: t("admin.restore") })
        .click();
      await expect(
        page.getByText(t("admin.restored", { name: target.companyName })),
      ).toBeVisible(COLD);

      const company = await one<{ archivedAt: string | null; archiveReason: string | null }>(
        `select archived_at as "archivedAt", archive_reason as "archiveReason"
           from companies where id = $1::uuid`,
        [target.companyId],
      );
      expect(company.archivedAt, "the company is still archived after its own restore").toBeNull();
      expect(company.archiveReason, "the reason outlived the state it explained (D87)").toBeNull();

      const contact = await one<{ archivedAt: string | null }>(
        "select archived_at as \"archivedAt\" from contacts where id = $1::uuid",
        [target.contactId],
      );
      expect(
        contact.archivedAt,
        "the company's restore dragged the contact back onto the floor too (D92)",
      ).not.toBeNull();
    });

    await test.step("after a reload the contact has its own button back, and its own restore", async () => {
      await reload(page);
      const contactCardAfter = card(page, target.contactName, t("admin.kind.contact"));
      const restoreButton = contactCardAfter.getByRole("button", { name: t("admin.restore") });
      await expect(
        restoreButton,
        "the contact's card still shows the sentence once its company is back on the floor",
      ).toBeVisible(COLD);

      await restoreButton.click();
      await page
        .getByRole("dialog", { name: t("admin.restoreTitle", { name: target.contactName }) })
        .getByRole("button", { name: t("admin.restore") })
        .click();
      await expect(
        page.getByText(t("admin.restored", { name: target.contactName })),
      ).toBeVisible(COLD);

      const contact = await one<{ archivedAt: string | null }>(
        "select archived_at as \"archivedAt\" from contacts where id = $1::uuid",
        [target.contactId],
      );
      expect(contact.archivedAt, "the contact's own restore did not take").toBeNull();
    });

    await test.step("exactly one audit row for each restore, written by this test", async () => {
      const afterCompany = await one<{ n: number }>(
        `select count(*)::int as n from audit_log
          where record_type = 'company' and record_id = $1::text and action = 'restore'
            and at >= $2::timestamptz`,
        [target.companyId, start],
      );
      const afterContact = await one<{ n: number }>(
        `select count(*)::int as n from audit_log
          where record_type = 'contact' and record_id = $1::text and action = 'restore'
            and at >= $2::timestamptz`,
        [target.contactId, start],
      );
      expect(afterCompany.n, "not exactly one restore row for the company").toBe(1);
      expect(afterContact.n, "not exactly one restore row for the contact").toBe(1);
    });
  } finally {
    // Whatever this test got to, the seed's floor comes back exactly as it
    // was found: neither row archived, no reason left behind, and no trace
    // of this run in the audit log (rules/data.md — nothing here may leak
    // into another file's assumptions).
    await query(
      "update companies set archived_at = null, archive_reason = null where id = $1::uuid",
      [target.companyId],
    );
    await query("update contacts set archived_at = null where id = $1::uuid", [
      target.contactId,
    ]);
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text and action = 'restore'
          and at >= $2::timestamptz`,
      [target.companyId, start],
    );
    await query(
      `delete from audit_log
        where record_type = 'contact' and record_id = $1::text and action = 'restore'
          and at >= $2::timestamptz`,
      [target.contactId, start],
    );
  }
});
