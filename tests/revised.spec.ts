import { login } from "./helpers/auth";
import { one, query } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * The queue says a quotation was revised under a waiting dispatch (P11E
 * finding 86, the leftover of §5 #2).
 *
 * Approval refuses a dispatch whose quotation has a later revision (D85), and
 * until now Rawan learned that from the refusal: the queue row and the sheet
 * said nothing, and the Approve button sat there as if it would work. The row
 * carries a line now, the sheet says the sentence before the press, and Approve
 * is disabled — refusing stays hers.
 *
 * The fixture is the seed's still-submitted dispatch; a later revision of its
 * quotation is written straight into the table (requested, no SMAC number, so
 * every CHECK on the row holds) and deleted in a `finally`: both locale projects
 * read one seeded database (playwright.config.ts: `workers: 1`).
 */

const COLD = { timeout: 30_000 };

type Waiting = {
  id: string;
  label: number;
  quotation_id: string;
  quotation_number: number;
  company_name: string;
};

test("a waiting dispatch whose quotation was revised says so, and cannot be approved", async ({
  page,
  locale,
  t,
}) => {
  const waiting = await one<Waiting>(
    `select d.id, d.number as label, q.id as quotation_id, q.number as quotation_number,
            c.name as company_name
       from dispatches d
       join quotations q on q.id = d.quotation_id
       join companies c on c.id = q.company_id
      where d.status = 'submitted'
      order by d.created_at
      limit 1`,
  );
  // A later revision of the same number, as the revise action writes it:
  // requested, no SMAC number, no dates, pointing back at the one it revises.
  const revision = await one<{ id: string }>(
    `insert into quotations (number, revision, revision_of, company_id, project_id, rep_id, status, notes)
     select number, (select max(revision) from quotations where number = $2::int) + 1, id,
            company_id, project_id, rep_id, 'requested', notes
       from quotations where id = $1::uuid
     returning id`,
    [waiting.quotation_id, waiting.quotation_number],
  );
  try {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue`);
    await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);

    await test.step("the queue row says the quotation was revised", async () => {
      const row = page.getByRole("row").filter({ hasText: waiting.company_name }).filter({
        has: page.locator('[data-slot="revised-since"]'),
      });
      await expect(row).toHaveCount(1);
      await expect(row.locator('[data-slot="revised-since"]')).toHaveText(
        t("dispatches.revisedSince"),
      );
    });

    await test.step("the sheet says it in a sentence and Approve is disabled", async () => {
      await page.goto(`/${locale}/queue?dispatch=${waiting.id}`);
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible(COLD);
      await expect(sheet.locator('[data-slot="superseded-note"]')).toHaveText(
        t("dispatches.supersededQuotation"),
      );
      await expect(sheet.getByRole("button", { name: t("dispatches.approve") })).toBeDisabled();
      // Refusing is still hers.
      await expect(sheet.getByRole("button", { name: t("dispatches.refuse") })).toBeEnabled();
    });
  } finally {
    await query(`delete from quotations where id = $1::uuid`, [revision.id]);
  }
});
