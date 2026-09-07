import { login } from "./helpers/auth";
import { one } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * P11J — what he wrote about a customer is read back to him (D136).
 *
 * The founder put Notes on the company form, on the project, and inside the
 * contact captured with the company (SPEC §3). All three were written, kept and
 * queried — and rendered on no screen in the app. The only way to read a note
 * back was to open the Edit dialog it had been typed in, which on a phone in a
 * lobby is three presses and a form, so the answer was to stop writing them.
 *
 * Here each note is read where its record is read: the company's on the drawer,
 * the contact's on the contact's own card, the project's on the project sheet.
 * A manager reading a floor he may not write on reads them too (D42) — the
 * block is outside the `mine` gate, because a note is what the record says, not
 * something to press.
 */

const COLD = { timeout: 30_000 };

async function companyWithNote() {
  return one<{ id: string; name: string; notes: string }>(
    `select c.id, c.name, c.notes
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and c.archived_at is null
        and c.notes is not null and c.notes <> ''
      order by c.created_at
      limit 1`,
  );
}

test("the company drawer reads back what he wrote about the customer", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "faisal");
  const company = await companyWithNote();
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);

  const note = drawer.locator("[data-slot='company-notes']");
  await expect(note, "the note was written and shown nowhere").toBeVisible(COLD);
  await expect(note).toHaveText(company.notes);
  // Its own word above it, so a paragraph under the buttons is not read as one
  // more sentence from the app.
  await expect(drawer.getByText(t("common.notes"), { exact: true }).first()).toBeVisible();
});

test("a note edited on the company is the note the drawer shows", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");
  const company = await companyWithNote();
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);

  const written = `${company.notes} · ${Date.now()}`;
  await drawer
    .getByRole("group", { name: t("drawer.companyActions") })
    .getByRole("button", { name: t("common.edit") })
    .click();
  const form = page.getByRole("dialog", { name: t("forms.editCompany") });
  await expect(form).toBeVisible(COLD);
  await form.getByLabel(t("common.notes")).fill(written);
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(form).toBeHidden(COLD);

  await expect(drawer.locator("[data-slot='company-notes']")).toHaveText(written, COLD);

  // Put it back, so the floor reads the same on the next run.
  await drawer
    .getByRole("group", { name: t("drawer.companyActions") })
    .getByRole("button", { name: t("common.edit") })
    .click();
  await expect(form).toBeVisible(COLD);
  await form.getByLabel(t("common.notes")).fill(company.notes);
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(form).toBeHidden(COLD);
});

test("a contact's note is on the contact's own card", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");
  const contact = await one<{ companyId: string; company: string; name: string; notes: string }>(
    `select c.id as "companyId", c.name as company, k.name, k.notes
       from contacts k
       join companies c on c.id = k.company_id
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and c.archived_at is null and k.archived_at is null
        and k.notes is not null and k.notes <> ''
      order by k.created_at
      limit 1`,
  );
  await page.goto(`/${locale}/companies?open=${contact.companyId}`);
  const drawer = page.getByRole("dialog", { name: contact.company });
  await expect(drawer).toBeVisible(COLD);
  await drawer.getByRole("tab", { name: t("common.contacts") }).click();

  const card = drawer.locator("li").filter({ hasText: contact.name });
  await expect(card.locator("[data-slot='contact-notes']")).toHaveText(contact.notes, COLD);
});

test("a project's note is on the project sheet", async ({ page, locale }) => {
  await login(page, locale, "faisal");
  const project = await one<{ id: string; name: string; notes: string }>(
    `select p.id, p.name, p.notes
       from projects p
       join companies c on c.id = p.company_id
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and p.archived_at is null and c.archived_at is null
        and p.notes is not null and p.notes <> ''
      order by p.created_at
      limit 1`,
  );
  await page.goto(`/${locale}/projects?open=${project.id}`);
  const sheet = page.getByRole("dialog", { name: project.name });
  await expect(sheet).toBeVisible(COLD);
  await expect(sheet.locator("[data-slot='project-notes']")).toHaveText(project.notes, COLD);
});

test("a manager reads the note on a floor he may not write on", async ({ page, locale, t }) => {
  await login(page, locale, "abdulrahman");
  const company = await companyWithNote();
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);

  await expect(drawer.locator("[data-slot='company-notes']")).toHaveText(company.notes, COLD);
  // Nothing to press: reading a floor is not writing on it (D42).
  await expect(drawer.getByRole("group", { name: t("drawer.companyActions") })).toHaveCount(0);
});
