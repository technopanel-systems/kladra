import { login } from "./helpers/auth";
import { one } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { quotationLabel } from "@/lib/labels";
import { formatDay, type Day } from "@/lib/dates";

/**
 * P11J — the desk knows what it is holding (D138, D139).
 *
 * Two states the app could reach and could not say:
 *
 * A project marked lost while a request for it is still in the coordinator's
 * queue. A NEW request on a lost project is refused at the action, so this is
 * only reachable by that race — and nothing on her screen said so, so she
 * priced a job whose decision had already been taken. The row says it now, and
 * the drawer says the day and the reason.
 *
 * And the reason itself: `projects.lost_reason` holds one of nine codes, or the
 * rep's own line for "Other". The company drawer printed the column, so a rep
 * read "competitor" — an internal code on a screen (CLAUDE.md's Never list).
 *
 * Then the palette. It shows the coordinator every company on purpose, and sent
 * her to a company screen that narrows to her own floor, which is nothing: an
 * empty list with a sheet over it saying the company she had just read the name
 * of is no longer available.
 */

const COLD = { timeout: 30_000 };

/** The request that is waiting on a project somebody has since marked lost. */
async function waitingOnALostProject() {
  return one<{
    id: string;
    number: number;
    revision: number;
    company: string;
    project: string;
    reason: string;
    lostOn: Day;
  }>(
    `select q.id, q.number, q.revision,
            c.name as company, p.name as project, p.lost_reason as reason,
            to_char((p.lost_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as "lostOn"
       from quotations q
       join companies c on c.id = q.company_id
       join projects p on p.id = q.project_id
      where q.status = 'requested'
        and p.lost_at is not null
        and c.archived_at is null
      order by q.created_at
      limit 1`,
  );
}

test("her desk says the project was marked lost, before she prices it", async ({
  page,
  locale,
  t,
}) => {
  const waiting = await waitingOnALostProject();
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue`);

  // `getByRole("row")` and not the whole page: the same rows are drawn again as
  // cards for the phone, hidden at this width but findable by text.
  const row = page.getByRole("row").filter({ hasText: waiting.project });
  await expect(row.first()).toBeVisible(COLD);
  await expect(
    row.first().locator("[data-slot='project-lost']"),
    "the queue priced a project that had already been given up",
  ).toHaveText(t("common.projectLost"));
});

test("and the drawer says which day, and why, in words", async ({ page, locale, t }) => {
  const waiting = await waitingOnALostProject();
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue?open=${waiting.id}`);

  const drawer = page.getByRole("dialog", {
    name: quotationLabel(waiting.number, waiting.revision),
  });
  await expect(drawer).toBeVisible(COLD);
  const lost = drawer.locator("[data-slot='project-lost']");
  await expect(lost).toBeVisible(COLD);
  // The stored value is a code; what she reads is the sentence for it. Asserted
  // as the sentence rather than as "not the code", because the English sentence
  // for `competitor` contains the word competitor — the company drawer's test
  // below is where the code itself is refused, with an exact match.
  await expect(lost).toContainText(t(`projects.lossReason.${waiting.reason}`));
  // And the day it was given up, read the way every other day on the screen is.
  await expect(lost).toContainText(
    t("common.projectLostOn", { date: formatDay(waiting.lostOn, locale) }),
  );
});

test("the company drawer says why it was lost, not the code we stored", async ({
  page,
  locale,
  t,
}) => {
  const lost = await one<{ companyId: string; company: string; reason: string }>(
    `select c.id as "companyId", c.name as company, p.lost_reason as reason
       from projects p
       join companies c on c.id = p.company_id
      where p.lost_at is not null and p.archived_at is null and c.archived_at is null
      order by p.lost_at desc
      limit 1`,
  );
  await login(page, locale, "turki");
  await page.goto(`/${locale}/companies?open=${lost.companyId}`);
  const drawer = page.getByRole("dialog", { name: lost.company });
  await expect(drawer).toBeVisible(COLD);

  await drawer.getByRole("tab", { name: t("common.projects") }).click();
  await expect(drawer.getByText(t(`projects.lossReason.${lost.reason}`)).first()).toBeVisible(COLD);
  await expect(drawer.getByText(lost.reason, { exact: true })).toHaveCount(0);
});

test("a company found in the palette opens something for the coordinator", async ({
  page,
  locale,
  t,
}) => {
  const company = await one<{ name: string }>(
    `select c.name
       from quotations q
       join companies c on c.id = q.company_id
      where c.archived_at is null
      group by c.name
      order by count(*) desc
      limit 1`,
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue`);
  await page.locator("button:has([data-slot='search-label'])").click();
  const palette = page.getByRole("dialog", { name: t("shell.searchDialog") });
  await expect(palette).toBeVisible(COLD);
  await palette.getByRole("combobox").fill(company.name);

  const hit = palette.getByRole("option").filter({ hasText: company.name }).first();
  await expect(hit).toBeVisible(COLD);
  await hit.click();

  // She holds no floor, so the company screen has nothing on it for her. What
  // she wants a company for is what we have quoted them.
  await expect(page).toHaveURL(new RegExp(`/${locale}/quotations\\?q=`), COLD);
  await expect(page.getByRole("row").filter({ hasText: company.name }).first()).toBeVisible(COLD);
});

test("and the rep's own hit still opens the company itself", async ({ page, locale, t }) => {
  const company = await one<{ id: string; name: string }>(
    `select c.id, c.name
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa' and c.archived_at is null
      order by c.created_at
      limit 1`,
  );

  await login(page, locale, "faisal");
  await page.locator("button:has([data-slot='search-label'])").click();
  const palette = page.getByRole("dialog", { name: t("shell.searchDialog") });
  await expect(palette).toBeVisible(COLD);
  await palette.getByRole("combobox").fill(company.name);
  await palette.getByRole("option").filter({ hasText: company.name }).first().click();

  await expect(page).toHaveURL(new RegExp(`/${locale}/companies\\?open=${company.id}`), COLD);
  await expect(page.getByRole("dialog", { name: company.name })).toBeVisible(COLD);
});
