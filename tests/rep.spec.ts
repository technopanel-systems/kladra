import type { Locator, Page } from "@playwright/test";
import { addDays, todayRiyadh } from "@/lib/dates";
import { login } from "./helpers/auth";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";

/**
 * Faisal's day, exactly as WORKFLOW.md §3 writes it: sign in, add a company
 * with its first contact, log a visit that sets a follow-up, see that follow-up
 * arrive on the strip, and add a project inside the company.
 *
 * One `test.step()` per line of that script. Every visible string comes from
 * the `t` fixture, so this same file is what runs for `--project=ar`.
 *
 * Two things about how it is written:
 *
 * **Names carry the locale.** Both locale projects run against ONE seeded
 * database (playwright.config.ts: `workers: 1`, one `globalSetup` reseed), so
 * the second project would otherwise be adding a company the first already
 * added, and the duplicate warning — correctly — would fire on its own fixture.
 *
 * **Step 4 moves the date, not the clock.** The script says "move the clock to
 * tomorrow". "Today" here is Riyadh's today computed in SQL by Postgres
 * (src/lib/followups.ts), and Playwright's clock control reaches the browser
 * only, so a faked browser clock would prove nothing about the strip. The same
 * guarantee is checked from the other end: the follow-up is moved onto today
 * through the drawer's own picker, and the strip must then count it and list
 * the company under it. What is asserted is the thing that matters — the strip,
 * the filter and the row agree about one date.
 */

/** Days are compared as strings everywhere; both are Riyadh days. */
const today = todayRiyadh();
const tomorrow = addDays(today, 1);

function fixtures(locale: Locale) {
  return {
    company: `Al Noor Towers ${locale.toUpperCase()}`,
    contact: `Khalid ${locale.toUpperCase()}`,
    phone: "0551234567",
    secondContact: `Sara ${locale.toUpperCase()}`,
    // A different number: one number per company is a database constraint.
    secondPhone: locale === "en" ? "0559876543" : "0559876544",
    renamed: `Al Noor Towers ${locale.toUpperCase()} (renamed)`,
    project: `Tower A ${locale.toUpperCase()}`,
    expectedSqm: "1200",
    visit: "Showed catalogue, wants 4 mm samples",
  };
}

/**
 * Picks a day out of an open DatePicker. `data-day` is react-day-picker's own
 * ISO stamp on the cell, so this neither reads a localized number nor cares
 * which script the calendar renders its digits in. Outside days are shown, so
 * tomorrow is reachable even on the last day of a month.
 */
async function pickDay(page: Page, trigger: Locator, day: string): Promise<void> {
  await trigger.click();
  await page.locator(`[data-day="${day}"] button`).first().click();
}

/**
 * A dialog or drawer by its title. Always by name: Radix gives its popovers
 * `role="dialog"` too, so a bare `getByRole("dialog")` matches the date picker
 * hanging off the drawer as well as the drawer itself.
 */
function dialogNamed(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name });
}

/** Every archive asks first; the question names the thing (SPEC §3, D24). */
async function confirmArchive(page: Page, t: Translate, name: string): Promise<void> {
  const confirm = page.getByRole("dialog", { name: t("drawer.archiveTitle", { name }) }).or(
    page.getByRole("dialog", { name: t("drawer.archiveContactTitle", { name }) }),
  );
  await confirm.getByRole("button", { name: t("drawer.archive") }).click();
}

test("Faisal's floor: a company, its contact, a visit, a follow-up coming due, a project, and archiving", async ({
  page,
  locale,
  t,
}) => {
  const fixture = fixtures(locale);
  let categoryName = "";
  /**
   * What the strip read before any of this. Captured in step 1 because from
   * step 2 on there is a drawer open, and Radix marks everything behind it
   * aria-hidden — the strip is on screen but out of the accessibility tree.
   * Nothing between here and step 4 is due today, so this is still the "before"
   * when the date is finally moved.
   */
  let stripBefore = "";
  /** From `?open=` after the save — the only place the test learns an id. */
  let companyId = "";

  await test.step("1 · Faisal signs in and Companies is home, follow-up strip on top", async () => {
    await login(page, locale, "faisal");
    await expect(page).toHaveURL(new RegExp(`/${locale}/companies(?:$|[/?#])`));
    await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible();

    const strip = page.getByRole("group", { name: t("common.followUps") });
    await expect(strip).toBeVisible();
    // The strip is above the list, which is what makes it the first thing read.
    const listTop = await page.getByRole("table").first().boundingBox();
    const stripTop = await strip.boundingBox();
    expect(stripTop && listTop && stripTop.y < listTop.y).toBe(true);
    stripBefore = await strip.innerText();
  });

  await test.step("2 · Add company with its first contact; toast, row marked, drawer opens", async () => {
    await page.getByRole("button", { name: t("forms.addCompany") }).first().click();

    const form = dialogNamed(page, t("forms.addCompany"));
    await expect(form.getByLabel(t("common.company"))).toBeVisible();
    await form.getByLabel(t("common.company")).fill(fixture.company);

    // Category and lead source are required and have no sensible default —
    // whichever the list offers first is enough to prove the field works, and
    // reading its text back keeps the assertion out of English.
    const category = form.getByRole("combobox", { name: t("common.category") });
    await category.click();
    const firstCategory = page.getByRole("option").first();
    categoryName = (await firstCategory.innerText()).trim();
    await firstCategory.click();

    await form.getByRole("combobox", { name: t("common.leadSource") }).click();
    await page.getByRole("option").first().click();

    await form.getByLabel(t("common.name")).fill(fixture.contact);
    await form.getByLabel(t("common.phone")).fill(fixture.phone);

    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("forms.added", { name: fixture.company }))).toBeVisible();

    // The open record lives in the URL (SPEC §3), and the drawer that opened is
    // this company's.
    await expect(page).toHaveURL(/[?&]open=/);
    companyId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(companyId).not.toBe("");
    await expect(dialogNamed(page, fixture.company)).toBeVisible();

    // The row the drawer belongs to says so. A CSS locator on purpose: the
    // sheet marks the rest of the page aria-hidden, so a role locator would
    // not see the row underneath it. Filtered to what is on screen, because
    // the list renders BOTH layouts — a table from `md` up and a card per row
    // below it — and CSS decides which one is shown.
    await expect(
      page
        .locator('[aria-current="true"]')
        .filter({ hasText: fixture.company })
        .filter({ visible: true }),
    ).toHaveCount(1);
  });

  await test.step("3 · Log a visit with a follow-up tomorrow; it is first in Activity", async () => {
    const drawer = dialogNamed(page, fixture.company);
    // The primary Log, at the top of the drawer — the empty Activity panel
    // offers a second one. `exact` because in Arabic "تسجيل" (Log) is a prefix
    // of "تسجيل الخروج" (Sign out).
    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("common.log"), exact: true })
      .click();

    const dialog = dialogNamed(page, t("drawer.logTitle"));
    await dialog.getByLabel(t("drawer.whatHappened")).fill(fixture.visit);

    // "Visit" is already the channel. The one picker still reading "pick a
    // date" is the follow-up; the other already holds today.
    await pickDay(page, dialog.getByRole("button", { name: t("common.pickDate") }), tomorrow);

    await dialog.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("drawer.logged"))).toBeVisible();

    // Newest first (SPEC S24) — the entry just written is the first one.
    const entries = dialogNamed(page, fixture.company).locator("ol > li");
    await expect(entries.first()).toContainText(fixture.visit);
  });

  await test.step("4 · The follow-up comes due: the strip counts it and lists the company", async () => {
    const drawer = dialogNamed(page, fixture.company);
    await expect(drawer).toContainText(categoryName);

    // Move the date onto today through the picker a rep would use.
    const picker = drawer.getByRole("group", { name: t("common.nextFollowUp") });
    await picker.getByRole("button").click();
    await page.getByRole("button", { name: t("common.today"), exact: true }).click();

    // The header says it in a word as well as a colour (DESIGN §1).
    await expect(drawer.getByText(t("common.dueToday"))).toBeVisible();

    // The drawer's own close button, not Escape: the date popover has just
    // closed and a stray Escape lands on whichever layer still has focus.
    await drawer.getByRole("button", { name: t("common.close") }).click();
    await expect(drawer).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]open=/);

    const strip = page.getByRole("group", { name: t("common.followUps") });
    await expect(strip).not.toHaveText(stripBefore);

    // "…and the company is listed under it": the pill is a link, and following
    // it narrows the list to exactly the companies that count.
    await strip.locator('a[href*="filter=today"]').click();
    await expect(page).toHaveURL(/[?&]filter=today/);
    await expect(
      page.getByRole("link", { name: t("companies.openCompany", { name: fixture.company }) }),
    ).toBeVisible();

    await page.goto(`/${locale}/companies`);
  });

  await test.step("5 · Open the company and add a project with its expected m²", async () => {
    await page
      .getByRole("link", { name: t("companies.openCompany", { name: fixture.company }) })
      .click();

    const drawer = dialogNamed(page, fixture.company);
    await drawer.getByRole("button", { name: t("drawer.newProject") }).first().click();

    const dialog = dialogNamed(page, t("projects.newProject"));
    await dialog.getByLabel(t("common.name")).fill(fixture.project);
    await dialog.getByLabel(t("common.expectedSqm")).fill(fixture.expectedSqm);
    await dialog.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("projects.created"))).toBeVisible();

    // Saving opens the new project, so the rep lands where the next thing he
    // does already is.
    await expect(page).toHaveURL(new RegExp(`/${locale}/projects\\?.*open=`));
    await expect(dialogNamed(page, fixture.project)).toBeVisible();

    // And it is under the company's Projects tab.
    await page.goto(`/${locale}/companies`);
    await page
      .getByRole("link", { name: t("companies.openCompany", { name: fixture.company }) })
      .click();
    const company = dialogNamed(page, fixture.company);
    await company.getByRole("tab", { name: t("common.projects") }).click();
    await expect(company.getByText(fixture.project)).toBeVisible();
  });

  /*
   * Past the end of WORKFLOW §3's five lines, and deliberately: the duplicate
   * warning, adding a second contact, moving who is main (SPEC D18) and
   * archiving (SPEC §3 — archive, never delete) are the rest of what a rep can
   * do to a company. Archiving last, because it takes the fixture off the floor
   * and there is nothing to do with it afterwards.
   */
  await test.step("6 · Adding the same company again warns, and does not block", async () => {
    // The company from step 2 is now on file, so it is its own fixture for the
    // warning (SPEC D8, S15). Asserted here because duplicateCheckAction
    // swallows a failed lookup on purpose — a warning that cannot be computed
    // is not an error a rep should see — so a broken query would be silent.
    await dialogNamed(page, fixture.company)
      .getByRole("button", { name: t("common.close") })
      .click();

    await page.getByRole("button", { name: t("forms.addCompany") }).first().click();
    const form = dialogNamed(page, t("forms.addCompany"));
    await form.getByLabel(t("common.company")).fill(fixture.company);

    const warning = form.getByRole("status");
    await expect(warning).toContainText(fixture.company);

    // It is advice, not a gate: Save is still there to press.
    await expect(form.getByRole("button", { name: t("common.save") })).toBeEnabled();
    await form.getByRole("button", { name: t("common.cancel") }).click();
  });

  await test.step("7 · Edit the company, the contact and the project", async () => {
    await page
      .getByRole("link", { name: t("companies.openCompany", { name: fixture.company }) })
      .click();
    const drawer = dialogNamed(page, fixture.company);

    // The company: the same fields as adding one, opened on what is there.
    await drawer.getByRole("button", { name: t("common.edit"), exact: true }).click();
    const companyForm = dialogNamed(page, t("forms.editCompany"));
    await expect(companyForm.getByLabel(t("common.company"))).toHaveValue(fixture.company);
    await companyForm.getByLabel(t("common.company")).fill(fixture.renamed);
    await companyForm.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("forms.saved", { name: fixture.renamed }))).toBeVisible();
    await expect(dialogNamed(page, fixture.renamed)).toBeVisible();

    // The contact.
    const renamed = dialogNamed(page, fixture.renamed);
    await renamed.getByRole("tab", { name: t("common.contacts") }).click();
    const khalid = renamed.getByRole("listitem").filter({ hasText: fixture.contact });
    await khalid.getByRole("button", { name: t("common.edit"), exact: true }).click();
    const contactForm = dialogNamed(page, t("forms.editContact"));
    await expect(contactForm.getByLabel(t("common.phone"))).toHaveValue(fixture.phone);
    await contactForm.getByLabel(t("common.position")).click();
    await page.getByRole("option").first().click();
    await contactForm.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("forms.saved", { name: fixture.contact }))).toBeVisible();

    // The project, from its own drawer.
    await page.goto(`/${locale}/projects`);
    await page
      .getByRole("link", { name: t("projects.openProject", { name: fixture.project }) })
      .click();
    const sheet = dialogNamed(page, fixture.project);
    await sheet.getByRole("button", { name: t("common.edit"), exact: true }).click();
    const projectForm = dialogNamed(page, t("projects.editProject"));
    // numeric(12,2) comes back "1200.00"; the rep typed 1200 and should see it.
    await expect(projectForm.getByLabel(t("common.expectedSqm"))).toHaveValue(
      fixture.expectedSqm,
    );
    await projectForm.getByLabel(t("common.expectedSqm")).fill("1500");
    await projectForm.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("forms.saved", { name: fixture.project }))).toBeVisible();

    await page.goto(`/${locale}/companies`);
  });

  await test.step("8 · A second contact becomes the main one, then the company is archived", async () => {
    await page
      .getByRole("link", { name: t("companies.openCompany", { name: fixture.renamed }) })
      .click();
    const drawer = dialogNamed(page, fixture.renamed);
    await drawer.getByRole("tab", { name: t("common.contacts") }).click();
    await drawer.getByRole("button", { name: t("drawer.addContact") }).first().click();

    const dialog = dialogNamed(page, t("forms.addContact"));
    await dialog.getByLabel(t("common.name")).fill(fixture.secondContact);
    await dialog.getByLabel(t("common.phone")).fill(fixture.secondPhone);
    await dialog.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("forms.added", { name: fixture.secondContact }))).toBeVisible();

    // The first contact added is main on its own (D18), so the new one is the
    // only row offering to take over.
    const second = drawer.getByRole("listitem").filter({ hasText: fixture.secondContact });
    await second.getByRole("button", { name: t("drawer.makeMain") }).click();
    await expect(
      page.getByText(t("drawer.mainSet", { name: fixture.secondContact })),
    ).toBeVisible();
    await expect(second.getByText(t("drawer.mainContact"))).toBeVisible();

    // Archiving the main contact hands the badge back to the oldest remaining
    // one (D18) rather than refusing — the person who left is exactly the one a
    // rep wants gone.
    await second.getByRole("button", { name: t("drawer.archive") }).click();
    await confirmArchive(page, t, fixture.secondContact);
    await expect(page.getByText(t("drawer.archived", { name: fixture.secondContact }))).toBeVisible();

    const reopened = dialogNamed(page, fixture.renamed);
    await expect(reopened.getByText(fixture.secondContact)).toHaveCount(0);
    await expect(
      reopened.getByRole("listitem").filter({ hasText: fixture.contact }).getByText(t("drawer.mainContact")),
    ).toBeVisible();
  });

  await test.step("9 · The project is archived, and it is not the same act as marking it lost", async () => {
    await page.goto(`/${locale}/projects`);
    await page
      .getByRole("link", { name: t("projects.openProject", { name: fixture.project }) })
      .click();
    const sheet = dialogNamed(page, fixture.project);

    // Both are offered, and they say different things.
    await expect(sheet.getByRole("button", { name: t("common.markLost") })).toBeVisible();
    await sheet.getByRole("button", { name: t("drawer.archive") }).click();
    await confirmArchive(page, t, fixture.project);
    await expect(page.getByText(t("drawer.archived", { name: fixture.project }))).toBeVisible();

    await page.goto(`/${locale}/projects`);
    await expect(
      page.getByRole("link", { name: t("projects.openProject", { name: fixture.project }) }),
    ).toHaveCount(0);
  });

  await test.step("10 · The company is archived: off the list, still on file, and closed to new work", async () => {
    await page.goto(`/${locale}/companies?open=${companyId}`);
    const drawer = dialogNamed(page, fixture.renamed);
    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("drawer.archive") })
      .click();
    await confirmArchive(page, t, fixture.renamed);
    await expect(page.getByText(t("drawer.archived", { name: fixture.renamed }))).toBeVisible();

    await page.goto(`/${locale}/companies`);
    await expect(
      page.getByRole("link", { name: t("companies.openCompany", { name: fixture.renamed }) }),
    ).toHaveCount(0);

    // Archive is not delete (S16): the record still opens by link, so a company
    // that resurfaces in two years still shows what happened.
    await page.goto(`/${locale}/companies?open=${companyId}`);
    const archived = dialogNamed(page, fixture.renamed);
    await expect(archived).toBeVisible();

    // But it takes nothing new (D24): a log entry would hang off a row that
    // appears on no list.
    await archived
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("common.log"), exact: true })
      .click();
    const log = dialogNamed(page, t("drawer.logTitle"));
    await log.getByLabel(t("drawer.whatHappened")).fill("after archiving");
    await log.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("errors.companyArchived"))).toBeVisible();
  });
});

/**
 * WORKFLOW §3's Abdulrahman script, line 4, brought forward: the manager reads
 * the same companies screen and there is no Add company button on it. His own
 * spec belongs to P6, but the screen is P3's and the rule is enforced here —
 * a company's rep is whoever pressed Save, so a manager adding one would
 * quietly become its rep (SPEC S8).
 */
test("a manager reads the rep floor and cannot add to it", async ({ page, locale, t }) => {
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/companies`);

  await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible();
  // He sees everyone's companies, so the list is not empty...
  await expect(page.getByRole("table").first()).toBeVisible();
  // ...and there is nothing on it offering to add one.
  await expect(page.getByRole("button", { name: t("forms.addCompany") })).toHaveCount(0);
});

/**
 * `?open=` is whatever is in the address bar. A rep gets links from colleagues,
 * keeps tabs open for days, and edits URLs. None of the three ways that id can
 * be wrong may take the screen down with it.
 */
test("a stale or foreign ?open= leaves the list standing", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  // Saad's company: real, and not Faisal's. Found through Saad's own list so
  // the spec never has to hard-code an id.
  await login(page, locale, "saad");
  await page.goto(`/${locale}/companies`);
  const first = page.getByRole("table").first().getByRole("link").first();
  const foreign = new URL(await first.getAttribute("href") ?? "", page.url()).searchParams.get(
    "open",
  );
  expect(foreign).toBeTruthy();

  await login(page, locale, "faisal");

  for (const [what, open] of [
    ["not a uuid", "not-a-uuid"],
    ["no such company", "00000000-0000-4000-8000-000000000000"],
    ["another rep's company", foreign as string],
  ] as const) {
    await test.step(what, async () => {
      const response = await page.goto(`/${locale}/companies?open=${open}`);
      // The route answered rather than throwing. Asserted on the status, not on
      // the page heading: the drawer opens either way, and Radix marks the rest
      // of the page aria-hidden behind it.
      expect(response?.status()).toBe(200);
      await expect(page.getByText(t("drawer.companyGone"))).toBeVisible();
    });
  }
});

