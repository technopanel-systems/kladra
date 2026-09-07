import type { Locator, Page } from "@playwright/test";
import { addDays, formatDay, todayRiyadh, type Day } from "@/lib/dates";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { pickFirst } from "./helpers/pick";

/**
 * P11A-7 — a drawer says what it writes (SPEC D94, S18).
 *
 * Three places where the company drawer's screen and its write used to
 * disagree, from the P11A review:
 *
 * A. "Request a quotation" on the Quotations tab used to raise one against no
 *    project at all, though S18 says every quotation belongs to one. The
 *    dialog now asks which of the company's open projects, offers no button
 *    when there is none, and the action refuses a request with none picked.
 * B. The follow-up picker at the top of the drawer writes only the company's
 *    own date, but the list colours the row by the earlier of that date and
 *    its open projects'. The drawer now says when a project is the one
 *    driving the row, and clearing the company's date says so rather than
 *    claiming the row is bare.
 * C. (Correcting/unfiling a log entry sending the same live event a new entry
 *    sends) is not tested here — no screen assertion follows from it.
 *
 * Every row this file touches is found by querying the seed, never
 * hard-coded, and every write it makes to the shared `kladra_test` database
 * is undone in a `finally`, because the suite this file joins does not
 * reseed between the `en` and `ar` projects (playwright.config.ts).
 */

/** Toasts and first navigations, with room for a cold Turbopack route. */
const COLD = { timeout: 30_000 };

/** A dialog or drawer by its title, exactly as the other specs name it. */
function dialogNamed(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name });
}

/**
 * Opens a searchable select and picks the option carrying this exact text.
 * Scoped to the popover's own content, as create.spec.ts's `choose` is —
 * the screen behind the dialog carries some of the same labels.
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
 * Fills the one line a quotation needs to be saved at all — the fields with
 * no default (create.spec.ts's `fillOneItem`).
 */
async function fillOneItem(form: Locator, t: Translate): Promise<void> {
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.pricePerSqm")).fill("120");
}

/** How many quotations this company has on file right now. */
async function quotationCountFor(companyId: string): Promise<number> {
  const row = await one<{ count: string }>(
    "select count(*)::text as count from quotations where company_id = $1::uuid",
    [companyId],
  );
  return Number(row.count);
}

test("the drawer asks which project the quotation is for, and refuses none", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and exists (
          select 1 from projects p
           where p.company_id = c.id and p.lost_at is null and p.archived_at is null
        )
      order by c.name
      limit 1`,
    [faisal],
  );
  const project = await one<{ id: string; name: string }>(
    `select id, name
       from projects
      where company_id = $1::uuid and lost_at is null and archived_at is null
      order by name
      limit 1`,
    [company.id],
  );

  const before = await quotationCountFor(company.id);
  let quotationId = "";

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${company.id}`);
    const drawer = dialogNamed(page, company.name);
    await expect(drawer).toBeVisible(COLD);

    await drawer.getByRole("tab", { name: t("common.quotations") }).click();
    await drawer.getByRole("button", { name: t("quotations.request") }).first().click();

    const form = dialogNamed(page, t("quotations.request"));
    const picker = form.getByRole("combobox", { name: t("common.project") });
    await expect(picker).toBeVisible(COLD);
    await expect(picker).toContainText(t("quotations.pickProject"));

    await test.step("saving with no project chosen is refused, at the picker", async () => {
      await fillOneItem(form, t);
      await form.getByRole("button", { name: t("common.save") }).click();

      const alert = form.getByRole("alert");
      await expect(alert).toHaveText(t("errors.projectRequired"));
      await expect(form).toBeVisible();

      expect(
        await quotationCountFor(company.id),
        "a refused request should not have written a row",
      ).toBe(before);
    });

    await test.step("choosing the project lets the same request through", async () => {
      await choose(page, picker, project.name);
      await expect(picker).toContainText(project.name);

      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);
      await expect(page).toHaveURL(/\/quotations\?open=/, COLD);

      quotationId = new URL(page.url()).searchParams.get("open") ?? "";
      expect(quotationId).not.toBe("");

      const row = await one<{ projectId: string | null }>(
        `select project_id as "projectId" from quotations where id = $1::uuid`,
        [quotationId],
      );
      expect(row.projectId, "the quotation did not land on the project picked").toBe(project.id);
    });
  } finally {
    if (quotationId) {
      await query("delete from quotation_items where quotation_id = $1::uuid", [quotationId]);
      await query(
        "delete from audit_log where record_type = 'quotation' and record_id = $1::text",
        [quotationId],
      );
      await query(
        "delete from notifications where subject_type = 'quotation' and subject_id = $1::uuid",
        [quotationId],
      );
      await query("delete from quotations where id = $1::uuid", [quotationId]);
    }
  }
});

test("a company with no open project is told to add one, not given a button", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");

  const withoutOpenProject = await query<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and not exists (
          select 1 from projects p
           where p.company_id = c.id and p.lost_at is null and p.archived_at is null
        )
      order by c.name
      limit 1`,
    [faisal],
  );

  let company: { id: string; name: string };
  /** Set only when the situation had to be made by SQL — restored in `finally`. */
  let closedProjectId = "";

  if (withoutOpenProject.length > 0) {
    company = withoutOpenProject[0];
  } else {
    const candidate = await one<{ id: string; name: string; projectId: string }>(
      `select c.id, c.name, p.id as "projectId"
         from companies c
         join projects p
           on p.company_id = c.id and p.lost_at is null and p.archived_at is null
        where c.rep_id = $1::uuid
          and c.archived_at is null
          and not exists (
            select 1 from projects p2
             where p2.company_id = c.id
               and p2.id <> p.id
               and p2.lost_at is null
               and p2.archived_at is null
          )
        order by c.name
        limit 1`,
      [faisal],
    );
    company = { id: candidate.id, name: candidate.name };
    closedProjectId = candidate.projectId;
    await query(
      "update projects set lost_at = now(), lost_reason = $2::text where id = $1::uuid",
      [closedProjectId, "drawer-writes.spec"],
    );
  }

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${company.id}`);
    const drawer = dialogNamed(page, company.name);
    await expect(drawer).toBeVisible(COLD);
    await drawer.getByRole("tab", { name: t("common.quotations") }).click();

    await expect(drawer.getByText(t("quotations.needsProject"))).toBeVisible();
    await expect(drawer.getByRole("button", { name: t("quotations.request") })).toHaveCount(0);
  } finally {
    if (closedProjectId) {
      await query(
        "update projects set lost_at = null, lost_reason = null where id = $1::uuid",
        [closedProjectId],
      );
    }
  }
});

test("the picker says when a project's date is the one the list shows, and cleared is not a lie", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  // Exactly one open project, so the earliest-open-project date the drawer
  // reports about can only be this one — nothing else can be driving it.
  const row = await one<{
    companyId: string;
    companyName: string;
    projectId: string;
    projectName: string;
    companyFollowUp: Day | null;
    projectFollowUp: Day | null;
  }>(
    `select c.id as "companyId", c.name as "companyName",
            p.id as "projectId", p.name as "projectName",
            c.next_follow_up::text as "companyFollowUp",
            p.next_follow_up::text as "projectFollowUp"
       from companies c
       join projects p
         on p.company_id = c.id and p.lost_at is null and p.archived_at is null
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and not exists (
          select 1 from projects p2
           where p2.company_id = c.id
             and p2.id <> p.id
             and p2.lost_at is null
             and p2.archived_at is null
        )
      order by c.name
      limit 1`,
    [faisal],
  );

  const today = todayRiyadh();
  const companyDay = addDays(today, 10);
  const projectDay = addDays(today, 3);

  await query("update companies set next_follow_up = $2::date where id = $1::uuid", [
    row.companyId,
    companyDay,
  ]);
  await query("update projects set next_follow_up = $2::date where id = $1::uuid", [
    row.projectId,
    projectDay,
  ]);

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${row.companyId}`);
    const drawer = dialogNamed(page, row.companyName);
    await expect(drawer).toBeVisible(COLD);

    await test.step("the drawer says the project, not the company, is what is due", async () => {
      await expect(drawer).toContainText(
        t("drawer.projectDrivesFollowUp", {
          project: row.projectName,
          date: formatDay(projectDay, locale),
        }),
      );
    });

    await test.step("clearing the company's own date says the project still has one", async () => {
      const picker = drawer.getByRole("group", { name: t("common.nextFollowUp") });
      await picker.getByRole("button").click();
      await page.getByRole("button", { name: t("common.clear"), exact: true }).click();

      await expect(
        page.getByText(t("drawer.followUpClearedProject", { project: row.projectName })),
      ).toBeVisible(COLD);
      // The plain "cleared" toast would be a lie here — the project is still due.
      await expect(page.getByText(t("drawer.followUpCleared"), { exact: true })).toHaveCount(0);
    });

    await test.step("the database agrees: only the company's date moved", async () => {
      const after = await one<{
        companyFollowUp: Day | null;
        projectFollowUp: Day | null;
      }>(
        `select
           (select next_follow_up::text from companies where id = $1::uuid) as "companyFollowUp",
           (select next_follow_up::text from projects where id = $2::uuid) as "projectFollowUp"`,
        [row.companyId, row.projectId],
      );
      expect(after.companyFollowUp, "the company's date should be cleared").toBeNull();
      expect(after.projectFollowUp, "the project's own date must not move").toBe(projectDay);
    });
  } finally {
    await query("update companies set next_follow_up = $2::date where id = $1::uuid", [
      row.companyId,
      row.companyFollowUp,
    ]);
    await query("update projects set next_follow_up = $2::date where id = $1::uuid", [
      row.projectId,
      row.projectFollowUp,
    ]);
  }
});
