import type { Locator, Page } from "@playwright/test";
import { addDays, todayRiyadh } from "@/lib/dates";
import { login } from "./helpers/auth";
import { one, personName, userId } from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { pickFirst } from "./helpers/pick";
import { answerReport } from "./helpers/report";

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

const COLD = { timeout: 30_000 };

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

/**
 * Chooses one item from the menu named "More for {name}". A company drawer
 * keeps Add report and Add project in sight and everything else in that one
 * menu; a contact row keeps its Edit, Make main and Archive in its own
 * (P13-G6 S12.2, DESIGN §6).
 */
async function fromMenu(page: Page, t: Translate, within: Locator, name: string, item: string): Promise<void> {
  await within.getByRole("button", { name: t("common.moreFor", { name }) }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/** Every archive asks first; the question names the thing (SPEC §3, D24). */
async function confirmArchive(page: Page, t: Translate, name: string): Promise<void> {
  const confirm = page.getByRole("dialog", { name: t("drawer.archiveTitle", { name }) }).or(
    page.getByRole("dialog", { name: t("drawer.archiveContactTitle", { name }) }),
  );
  // Asked once it is up: from a menu, the question opens as the menu finishes
  // closing, and a count taken before then finds no reason box to fill.
  await expect(confirm).toBeVisible();
  // A company asks why (S16, D87); a contact does not.
  const why = confirm.getByLabel(t("drawer.archiveReason"));
  if ((await why.count()) > 0) await why.fill("Closed down — rep.spec");
  await confirm.getByRole("button", { name: t("drawer.archive") }).click();
}

test("Faisal's floor: a company, its contact, a visit, a follow-up coming due, a project, and archiving", async ({
  page,
  locale,
  t,
}) => {
  // A nine-step walk of the floor — five dialogs, a date moved, a project and
  // an archive — that took 24 to 33 seconds against a 30-second budget and
  // timed out twice at the last step. The other long walks already say so.
  test.slow();
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

  await test.step("1 · Faisal signs in, his day is home, then Companies with the strip on top", async () => {
    await login(page, locale, "faisal");
    // His day is home from P8 (D49): it answers what to do now, which is the
    // question he opens the app with. The list is one press away and is still
    // where the rest of this walk happens.
    await expect(page).toHaveURL(new RegExp(`/${locale}/day(?:$|[/?#])`));
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible();

    await page.getByRole("link", { name: t("common.companies"), exact: true }).first().click();
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
    await expect(category).toHaveAttribute("aria-expanded", "true");
    // The newest list is this combobox's own (tests/helpers/pick.ts).
    const firstCategory = page.getByRole("listbox").last().getByRole("option").first();
    categoryName = (await firstCategory.innerText()).trim();
    await firstCategory.click();
    await expect(category).toHaveAttribute("aria-expanded", "false");

    await pickFirst(form.getByRole("combobox", { name: t("common.leadSource") }));

    await form.getByLabel(t("common.name"), { exact: true }).fill(fixture.contact);
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

  await test.step("3 · Report a visit with a follow-up tomorrow; it is first in Reports", async () => {
    const drawer = dialogNamed(page, fixture.company);
    // The Add report at the top of the drawer, in its actions — `exact`, so a
    // longer label that happens to start with the same words is not the one.
    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("common.addReport"), exact: true })
      .click();

    const dialog = dialogNamed(page, t("common.addReport"));
    await answerReport(dialog, t, locale, { kind: "visit", text: fixture.visit });

    // The day is two chips and already on today, so the one picker in the
    // popup is the follow-up.
    await pickDay(page, dialog.getByRole("button", { name: t("common.pickDate") }), tomorrow);

    await dialog.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("reports.dialog.added", { company: fixture.company }))).toBeVisible();

    // Newest first (SPEC S24) — the entry just written is the first one.
    const entries = dialogNamed(page, fixture.company).locator("ol > li");
    await expect(entries.first()).toContainText(fixture.visit);
    // And it takes the arrived flash where it lands, so nobody reads the list to
    // find what they just wrote (P13-G6).
    await expect(entries.first()).toHaveClass(/row-arrived/);
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
    await dialog.getByLabel(t("common.name"), { exact: true }).fill(fixture.project);
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
    // The warning's door and the row below are both "Open {company}": until
    // the form has finished leaving (150 ms, DESIGN §2) the page has two.
    await expect(form).toBeHidden();
  });

  await test.step("7 · Edit the company, the contact and the project", async () => {
    await page
      .getByRole("link", { name: t("companies.openCompany", { name: fixture.company }) })
      .click();
    const drawer = dialogNamed(page, fixture.company);

    // The company: the same fields as adding one, opened on what is there.
    await fromMenu(page, t, drawer, fixture.company, t("common.edit"));
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
    await fromMenu(page, t, khalid, fixture.contact, t("common.edit"));
    const contactForm = dialogNamed(page, t("forms.editContact"));
    await expect(contactForm.getByLabel(t("common.phone"))).toHaveValue(fixture.phone);
    await pickFirst(contactForm.getByLabel(t("common.position")));
    await contactForm.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("forms.saved", { name: fixture.contact }))).toBeVisible();

    // The project, from its own drawer.
    await page.goto(`/${locale}/projects`);
    await page
      .getByRole("link", { name: t("projects.openProject", { name: fixture.project }) })
      .click();
    const sheet = dialogNamed(page, fixture.project);
    // Edit is in the drawer's menu since P13-G6 S12.3, with Add report the one button in sight.
    await sheet.getByRole("button", { name: t("common.moreFor", { name: fixture.project }) }).click();
    await page.getByRole("menuitem", { name: t("common.edit"), exact: true }).click();
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
    await dialog.getByLabel(t("common.name"), { exact: true }).fill(fixture.secondContact);
    await dialog.getByLabel(t("common.phone")).fill(fixture.secondPhone);
    await dialog.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("forms.added", { name: fixture.secondContact }))).toBeVisible();

    // The first contact added is main on its own (D18), so the new one is the
    // only row offering to take over.
    const second = drawer.getByRole("listitem").filter({ hasText: fixture.secondContact });
    await fromMenu(page, t, second, fixture.secondContact, t("drawer.makeMain"));
    await expect(
      page.getByText(t("drawer.mainSet", { name: fixture.secondContact })),
    ).toBeVisible();
    await expect(second.getByText(t("drawer.mainContact"))).toBeVisible();

    // Archiving the main contact hands the badge back to the oldest remaining
    // one (D18) rather than refusing — the person who left is exactly the one a
    // rep wants gone.
    await fromMenu(page, t, second, fixture.secondContact, t("drawer.archive"));
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

    // Both are offered, in the drawer's menu, and they say different things.
    await sheet.getByRole("button", { name: t("common.moreFor", { name: fixture.project }) }).click();
    await expect(page.getByRole("menuitem", { name: t("common.markLost"), exact: true })).toBeVisible();
    await page.getByRole("menuitem", { name: t("drawer.archive"), exact: true }).click();
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
    await expect(drawer).toBeVisible();
    await fromMenu(
      page,
      t,
      drawer.getByRole("group", { name: t("drawer.companyActions") }),
      fixture.renamed,
      t("drawer.archive"),
    );
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

    // But it takes nothing new (D24): a report would hang off a row that
    // appears on no list — so it is not offered, and the action refuses one
    // that arrives anyway (`addReportAction`, errors.companyArchived).
    await expect(
      archived.getByRole("button", { name: t("common.addReport"), exact: true }),
    ).toHaveCount(0);
  });
});

/**
 * WORKFLOW §3's Abdulrahman script, line 4: the manager reads the rep floor and
 * works none of it (SPEC S8, D42). His own spec belongs to P6, but the screens
 * are P3's and the rule is enforced here.
 *
 * It failed on everything below the list for three phases. A company's rep is
 * whoever pressed Save, so the Add company button was kept off the screen from
 * the start — but the drawer under it offered Log, New contact, New project,
 * Edit and Archive to anyone who could open it, and the actions behind them
 * asked "may he SEE this?" and let him through. The read gate and the write
 * gate are two questions now (`mayOpen` and `mayWrite`), and this walks the
 * screens that were wrong.
 */
test("a manager reads the rep floor and works none of it", async ({ page, locale, t }) => {
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/companies`);

  await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible();
  // He sees everyone's companies, so the list is not empty...
  await expect(page.getByRole("table").first()).toBeVisible();
  // ...and there is nothing on it offering to add one.
  await expect(page.getByRole("button", { name: t("forms.addCompany") })).toHaveCount(0);

  await test.step("the company drawer opens, and hands him nothing to press", async () => {
    await page.getByRole("table").first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    // He reads it: the history is the report (S27), so the log has to be there.
    await expect(drawer.getByRole("tab", { name: t("drawer.activity") })).toBeVisible();
    // And the date is a sentence rather than a picker.
    await expect(drawer.getByRole("button", { name: t("common.pickDate") })).toHaveCount(0);

    for (const label of [
      t("common.addReport"),
      t("drawer.newProject"),
      t("common.edit"),
      t("drawer.archive"),
    ]) {
      await expect(
        drawer.getByRole("button", { name: label, exact: true }),
        `${label} is on a floor that is not his`,
      ).toHaveCount(0);
    }

    // What a manager does to a customer is decide who holds it and who else
    // reads it (D42, D147) — so the action row is one More menu, and that menu
    // holds those two and nothing that works the customer.
    const actions = drawer.getByRole("group", { name: t("drawer.companyActions") });
    await expect(actions.getByRole("button")).toHaveCount(1);
    await actions.getByRole("button").click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText([
      t("drawer.share.action"),
      t("drawer.handOver"),
    ]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);

    await drawer.getByRole("tab", { name: t("common.contacts") }).click();
    for (const label of [t("drawer.addContact"), t("drawer.makeMain"), t("common.edit"), t("drawer.archive")]) {
      await expect(
        drawer.getByRole("button", { name: label, exact: true }),
        `${label} is offered on somebody else's contact`,
      ).toHaveCount(0);
    }
    // He still reads the contact — the name and the number are the point.
    await expect(drawer.getByRole("link", { name: /\d/ }).first()).toBeVisible();

    await drawer.getByRole("tab", { name: t("common.projects") }).click();
    await expect(
      drawer.getByRole("button", { name: t("drawer.newProject"), exact: true }),
    ).toHaveCount(0);

    await drawer.getByRole("tab", { name: t("common.quotations") }).click();
    await expect(
      drawer.getByRole("button", { name: t("quotations.request"), exact: true }),
    ).toHaveCount(0);
  });

  await test.step("and neither does the project drawer", async () => {
    await page.goto(`/${locale}/projects`);
    await page.getByRole("table").first().getByRole("link").first().click();
    const sheet = page.getByRole("dialog").first();
    await expect(sheet).toBeVisible();

    await expect(sheet.getByRole("tab", { name: t("drawer.activity") })).toBeVisible();
    await expect(sheet.getByRole("button", { name: t("common.pickDate") })).toHaveCount(0);

    for (const label of [
      t("common.addReport"),
      t("common.edit"),
      t("common.markLost"),
      t("drawer.archive"),
      t("quotations.request"),
    ]) {
      await expect(
        sheet.getByRole("button", { name: label, exact: true }),
        `${label} is on a project that is not his`,
      ).toHaveCount(0);
    }
    // Edit, Archive and Mark lost live in the drawer's menu since P13-G6, so the
    // buttons above are absent for everybody; the menu is where to look. He may
    // share a job (mayShare), and that is the only thing in it.
    await sheet.locator('[data-slot="row-menu"]').click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem"), "the manager's menu on a rep's project").toHaveText([
      t("drawer.share.action"),
    ]);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  });
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
      // Said as what may have happened, not as "nothing here yet".
      await expect(page.getByText(t("drawer.companyGoneMeans"))).toBeVisible();
    });
  }

  // A project link that opens nothing says so the same way (P13-G6): it drew
  // its skeleton and vanished, which reads as a drawer that failed to load.
  for (const open of ["not-a-uuid", "00000000-0000-4000-8000-000000000000"]) {
    await test.step(`a project link: ${open}`, async () => {
      const response = await page.goto(`/${locale}/projects?open=${open}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByText(t("drawer.projectGone"))).toBeVisible();
      await expect(page.getByText(t("drawer.projectGoneMeans"))).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByText(t("drawer.projectGone"))).toHaveCount(0);
      await expect(page).not.toHaveURL(/[?&]open=/);
    });
  }
});

/**
 * Two of the four kinds of empty on the companies list (DESIGN §8, P13-G6
 * S12.2). A chip that empties a search says how many companies it is holding
 * back and hands them back, keeping the search; and a floor with nothing on it
 * is one sentence naming whose floor it is, with no chips and no search box
 * over nothing.
 */
test("an empty companies list says which empty it is", async ({ page, locale, t }) => {
  await test.step("filtered out: how many the chip hides, and the way to show them", async () => {
    await login(page, locale, "faisal");

    // One of his companies the overdue chip does not hold: read off the list
    // itself, so the fixture is whatever the list says today.
    const doorsOn = async (path: string) => {
      await page.goto(`/${locale}/companies${path}`);
      const table = page.getByRole("table").first();
      await expect(table).toBeVisible(COLD);
      return table
        .locator('a[href*="open="]')
        .evaluateAll((links) =>
          links.map((link) => new URL(link.getAttribute("href") ?? "", location.href).searchParams.get("open")),
        );
    };
    const all = await doorsOn("");
    const overdue = new Set(await doorsOn("?filter=overdue"));
    const calm = all.find((id) => id && !overdue.has(id));
    expect(calm, "every company of Faisal's is overdue, so no chip can hide one").toBeTruthy();
    const { name } = await one<{ name: string }>("select name from companies where id = $1::uuid", [calm]);

    // The same search without the chip: what the chip is hiding.
    await page.goto(`/${locale}/companies?q=${encodeURIComponent(name)}`);
    const matched = await page.getByRole("table").first().locator('a[href*="open="]').count();
    expect(matched).toBeGreaterThan(0);

    await page.goto(`/${locale}/companies?q=${encodeURIComponent(name)}&filter=overdue`);
    await expect(page.getByText(t("companies.filteredOut", { count: matched }))).toBeVisible(COLD);
    const showAll = page.getByRole("link", { name: t("companies.clearFilter") });
    await showAll.click();
    await expect(page).not.toHaveURL(/[?&]filter=/, COLD);
    await expect(page).toHaveURL(/[?&]q=/);
    await expect(
      page.getByRole("link", { name: t("companies.openCompany", { name }) }).filter({ visible: true }).first(),
    ).toBeVisible(COLD);
  });

  await test.step("first use: a floor with nothing on it is one sentence", async () => {
    // The manager holds no companies in the seed: his own floor, read as one.
    const email = "abdulrahman@technopanel.com.sa";
    const [id, name] = await Promise.all([userId(email), personName(email, locale)]);
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/companies?rep=${id}`);
    await expect(page.getByText(t("companies.emptyFloor", { name }))).toBeVisible(COLD);
    await expect(page.getByRole("searchbox", { name: t("companies.searchLabel") })).toHaveCount(0);
    await expect(page.getByRole("group", { name: t("common.followUps") })).toHaveCount(0);
  });
});

