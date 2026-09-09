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
import { pickFirst } from "./helpers/pick";
import { test, expect, type Translate } from "./helpers/i18n";
import { seesEveryLeadSource } from "@/lib/lookups";

/**
 * What each role may claim, and who moves a company (SPEC §3, P12 box 5).
 *
 * Three of the founder's sentences are walked here. "The Marketing lead source is
 * not offered to a rep adding a company. Management and marketing only" narrows
 * D1, which offered the whole list to everybody — a rep who can pick it can file
 * somebody else's lead as his own, and the figure that says where business comes
 * from stops meaning anything. And the handover, which §3 gives to the sales
 * manager alone, is walked in tests/marketing.spec.ts from both ends.
 *
 * The third is the coordinator: "a selling role too: department Internal Sales,
 * her own m² target". She has a floor now — companies, projects, quotations —
 * and the one thing that is hers alone is that she asks nobody for paper. She
 * IS the desk everybody else asks, so a request of hers would be a note to
 * herself: she types the SMAC number as she raises it, the quotation is issued
 * in the same act, and the row is flagged so the manager reads who did both.
 *
 * The list a form draws and the write behind it are asked separately on
 * purpose. A screen that hides an option while the action accepts it is a rule
 * that is not a rule, and the pair has been wrong in both directions this phase
 * (§5 #163).
 */

const COLD = { timeout: 30_000 };

/** The restricted source, read from the column rather than from its name. */
async function restrictedSource(locale: string) {
  return one<{ name: string }>(
    `select ${locale === "ar" ? "name_ar" : "name_en"} as name
       from lead_sources where restricted and active limit 1`,
  );
}

test("who is offered every lead source", () => {
  // Management, because a manager or an admin filing a company knows where it
  // came from and is not competing for the credit; and marketing, because the
  // source describes marketing's own work.
  expect(seesEveryLeadSource("manager")).toBe(true);
  expect(seesEveryLeadSource("admin")).toBe(true);
  expect(seesEveryLeadSource("marketing")).toBe(true);

  expect(seesEveryLeadSource("rep")).toBe(false);
  expect(seesEveryLeadSource("coordinator")).toBe(false);
});

test("the restricted lead source is one row of the list, and it is Marketing", async () => {
  // One row carries the rule, and it carries it as a column: the admin may
  // rename any lookup in either language, and a permission a rename can switch
  // off is not a permission.
  const rows = await query<{ name_en: string; restricted: boolean }>(
    "select name_en, restricted from lead_sources where active order by sort_order",
  );
  const restricted = rows.filter((row) => row.restricted);
  expect(restricted.map((row) => row.name_en)).toEqual(["Marketing"]);
  expect(rows.length).toBeGreaterThan(restricted.length);
});

test("a rep is not offered the Marketing lead source, and marketing is", async ({
  page,
  locale,
  t,
}) => {
  const hidden = await restrictedSource(locale);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await page.getByRole("button", { name: t("forms.addCompany") }).first().click();

  const form = page.getByRole("dialog", { name: t("forms.addCompany") });
  await expect(form.getByLabel(t("common.company"))).toBeVisible(COLD);

  const picker = form.getByRole("combobox", { name: t("common.leadSource") });
  await picker.click();
  const list = page.getByRole("listbox").last();
  await expect(list.getByRole("option").first()).toBeVisible();
  // Every other source is there; this one is not, and the list is not empty,
  // so an absent option is a decision rather than a query that found nothing.
  await expect(list.getByRole("option")).not.toHaveCount(0);
  await expect(list.getByRole("option", { name: hidden.name, exact: true })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Marketing is offered the source that names its own work — on its own form,
  // which since P12-7 is New lead and not Add company (SPEC §3).
  await login(page, locale, "marketing");
  await page.goto(`/${locale}/leads`);
  await page.getByRole("button", { name: t("leads.new") }).first().click();

  const theirs = page.getByRole("dialog", { name: t("leads.new") });
  await expect(theirs.getByLabel(t("common.company"))).toBeVisible(COLD);
  await theirs.getByRole("combobox", { name: t("common.leadSource") }).click();
  await expect(
    page.getByRole("listbox").last().getByRole("option", { name: hidden.name, exact: true }),
  ).toBeVisible();
});

/** Her own job — the floor SPEC §3 gave her, read from the role rather than a name. */
async function herProject() {
  return one<{ id: string; name: string }>(
    `select p.id, p.name
       from projects p
       join companies c on c.id = p.company_id
       join users u on u.id = c.rep_id
      where u.role = 'coordinator' and p.lost_at is null and c.archived_at is null
      order by p.created_at limit 1`,
  );
}

/** Opens a searchable select and picks the option carrying this exact text. */
async function choose(page: Page, trigger: Locator, label: string): Promise<void> {
  await trigger.click();
  await page
    .locator('[data-slot="popover-content"]')
    .getByText(label, { exact: true })
    .first()
    .click();
}

/** The one line a quotation needs to be saved; the rest opens on S32's defaults. */
async function fillOneItem(form: Locator, t: Translate): Promise<void> {
  await form.getByLabel(t("common.colourCode")).fill("168");
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await pickFirst(form.getByRole("combobox", { name: t(label) }));
  }
  await form.getByLabel(t("common.pricePerSqm")).fill("120");
}

test("the coordinator raises her own quotation and issues it in the same act", async ({
  page,
  locale,
  t,
}) => {
  const project = await herProject();
  // One number per locale: the two projects run against a single database in
  // file order and the SMAC index is unique across the whole chain, so a fixed
  // number here would clash on the second and read as a defect in the action.
  const smac = `SI-${locale.toUpperCase()}-1`;

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations`);

  // The door says what it does. A rep's says Request, because his paper waits
  // in her queue; hers cannot say it, because the queue is hers.
  const door = page.getByRole("button", { name: t("quotations.issueOwn") });
  await expect(door).toBeVisible(COLD);
  await expect(page.getByRole("button", { name: t("quotations.request") })).toHaveCount(0);
  await door.click();

  const form = page.getByRole("dialog", { name: t("quotations.issueOwn") });
  const picker = form.getByRole("combobox", { name: t("common.project") });
  await expect(picker).toBeVisible(COLD);
  await choose(page, picker, project.name);
  await fillOneItem(form, t);

  // The field a rep never sees, and the reason this is one act rather than two.
  await form.getByLabel(t("common.smacNumber")).fill(smac);
  await form.getByRole("button", { name: t("quotations.issue") }).click();

  await expect(page.getByText(t("quotations.issuedOwn"))).toBeVisible(COLD);
  await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
  const id = new URL(page.url()).searchParams.get("open") ?? "";
  expect(id).not.toBe("");

  const row = await one<{ status: string; self_issued: boolean; smac_number: string }>(
    "select status, self_issued, smac_number from quotations where id = $1::uuid",
    [id],
  );
  expect(row.status, "her quotation did not go out as she raised it").toBe("issued");
  expect(row.smac_number).toBe(smac);
  // The founder's own clause: flagged, so nobody issues their own work unseen.
  expect(row.self_issued).toBe(true);

  // Two events, both hers, in the order they happened. An issue with no request
  // before it would read as paper that appeared out of nothing (D143).
  const trail = await query<{ action: string }>(
    "select action from audit_log where record_id = $1 order by created_at",
    [id],
  );
  expect(trail.map((e) => e.action)).toEqual(["quotation.request", "quotation.issue"]);

  // And nobody was asked for anything: the bell a request rings is the desk's,
  // and she is the desk.
  const bells = await query<{ kind: string }>(
    `select kind from notifications
      where subject_type = 'quotation' and subject_id = $1::uuid`,
    [id],
  );
  expect(bells.map((b) => b.kind)).not.toContain("quotationRequested");

  // The drawer it lands on says both things: issued, and issued by the person
  // who asked for it.
  // First: the word is on the status badge at the top and again in the trail
  // at the bottom, which is the drawer working as designed.
  const drawer = page.getByRole("dialog").first();
  await expect(
    drawer.getByText(t("quotations.statusIssued"), { exact: true }).first(),
  ).toBeVisible(COLD);
  await expect(drawer.getByText(t("quotations.selfIssuedBadge"))).toBeVisible();
});

test("her month is a row of figures on the manager's table, not a row of dashes", async ({
  page,
  locale,
}) => {
  // The founder's sentence is a target of her own, and a target nothing is
  // measured against is not a target: both halves are asked here.
  // By the account and not by the role: the admin spec creates people and sets
  // their targets, and the two locales run against one database in file order,
  // so "the coordinator" is not a row this query can count on being alone.
  const target = await one<{ sqm: string }>(
    `select t.sqm::text as sqm
       from targets t
       join users u on u.id = t.user_id
      where u.email = 'rawan@technopanel.com.sa'
        and t.month = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)::date`,
  );
  expect(Number(target.sqm)).toBeGreaterThan(0);
  const name = await personName("rawan@technopanel.com.sa", locale);

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=team`);

  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect(row).toBeVisible(COLD);

  // Metres against a target, and the pace beside them. A dash here is the row
  // she carried before §3, and taking it away is what the founder asked for.
  await expect(row.locator("[data-slot='figure-pace']")).toBeVisible();
  const figures = (await row.innerText()).match(/[\d,]+(\.\d+)?/g) ?? [];
  expect(figures.length, "her row reads as dashes rather than as a month").toBeGreaterThan(2);
});

test("a company filed as marketing's stays editable by the rep it is handed to", async ({
  page,
  locale,
  t,
}) => {
  /*
   * The path §3 describes end to end: marketing files a lead as its own, the
   * manager gives it to a rep, and the rep works it. Until §5 #168 the last step
   * was impossible — the form sent back the source the company arrived with, the
   * guard read that as him filing somebody else's lead as his own, and he could
   * not save the customer at all: not the notes, not the name, nothing.
   *
   * The hand-over is done in SQL rather than through the manager's screen, which
   * `tests/marketing.spec.ts` already walks, and the floor is put back whatever
   * happens (§5 #167): this file must not leave a company on a rep who did not
   * have it for every spec that runs after it.
   */
  const faisal = await userId("faisal@technopanel.com.sa");
  const company = await one<{ id: string; name: string; source: string }>(
    `select c.id, c.name, ${locale === "ar" ? "ls.name_ar" : "ls.name_en"} as source
       from companies c
       join lead_sources ls on ls.id = c.lead_source_id
      where ls.restricted and c.archived_at is null
      order by c.created_at limit 1`,
  );
  const floor = await floorOfCompany(company.id);
  await query("update companies set rep_id = $1::uuid where id = $2::uuid", [faisal, company.id]);

  try {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/companies?open=${company.id}`);
    const drawer = page.getByRole("dialog", { name: company.name });
    await expect(drawer).toBeVisible(COLD);

    await drawer
      .getByRole("group", { name: t("drawer.companyActions") })
      .getByRole("button", { name: t("common.edit") })
      .click();
    const form = page.getByRole("dialog", { name: t("forms.editCompany") });
    await expect(form).toBeVisible(COLD);

    // The picker says what the company says. It read the placeholder before,
    // because the value was missing from the narrowed list — a screen lying
    // about its own record, and the save then failed on the lie.
    await expect(form.getByRole("combobox", { name: t("common.leadSource") })).toContainText(
      company.source,
    );

    const written = `${t("common.notes")} ${Date.now()}`;
    await form.getByLabel(t("common.notes")).fill(written);
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(form).toBeHidden(COLD);
    await expect(drawer.locator("[data-slot='company-notes']")).toHaveText(written, COLD);

    // And the source is exactly where it was: keeping it is not claiming it,
    // and the save did not quietly move the company to a source he may pick.
    const after = await one<{ restricted: boolean }>(
      `select ls.restricted from companies c
         join lead_sources ls on ls.id = c.lead_source_id
        where c.id = $1::uuid`,
      [company.id],
    );
    expect(after.restricted, "the save moved the company off the source it was filed under").toBe(
      true,
    );
  } finally {
    await restoreCompanyFloor(floor);
  }
});

test("the palette gives her her own customer, and somebody else's paper", async ({
  page,
  locale,
  t,
}) => {
  /*
   * The one person for whom "what may I read" and "what is mine" are different
   * questions (SPEC §3). Her desk is every company in the building, so both hits
   * are offered; what differs is where each one takes her. Her own opens in the
   * drawer, like a rep's. Somebody else's opens the quotations screen filtered
   * to that name, because the company drawer would refuse the row — which is
   * the defect D139 was: a sheet saying the company she had just read the name
   * of "is no longer available".
   */
  const mine = await one<{ id: string; name: string }>(
    `select c.id, c.name from companies c
       join users u on u.id = c.rep_id
      where u.role = 'coordinator' and c.archived_at is null
      order by c.created_at limit 1`,
  );
  const contact = await one<{ name: string }>(
    `select ct.name from contacts ct
       join companies c on c.id = ct.company_id
       join users u on u.id = c.rep_id
      where u.role = 'coordinator' and ct.archived_at is null and c.archived_at is null
      order by ct.created_at limit 1`,
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue`);

  const openPalette = async () => {
    await page.locator("button:has([data-slot='search-label'])").click();
    const palette = page.getByRole("dialog", { name: t("shell.searchDialog") });
    await expect(palette).toBeVisible(COLD);
    return palette;
  };

  // Her own company: the drawer, not the paper.
  let palette = await openPalette();
  await palette.getByRole("combobox").fill(mine.name);
  await palette.getByRole("option").filter({ hasText: mine.name }).first().click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/companies\\?open=${mine.id}`), COLD);
  const drawer = page.getByRole("dialog", { name: mine.name });
  await expect(drawer).toBeVisible(COLD);
  // Closed before the next question: the drawer's own overlay covers the search
  // box the palette is opened from.
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden(COLD);

  // And her own customer's people are findable at all, which they were not
  // until §3: the palette offered her no contacts, on the reasoning that she
  // had no floor for one to sit on.
  palette = await openPalette();
  await palette.getByRole("combobox").fill(contact.name);
  await expect(
    palette.getByRole("option").filter({ hasText: contact.name }).first(),
  ).toBeVisible(COLD);
});

test("she is taken to the number she left out, not left guessing at a full form", async ({
  page,
  locale,
  t,
}) => {
  /*
   * Her form is taller than the screen: nine fields on one line, the totals,
   * and the SMAC box under them. Measured at 1366, that box sits on the
   * scroller's clipped edge and the notes below it are off the fold entirely —
   * so a sentence beside the field is a sentence she may never scroll to. She
   * would press Issue, see nothing move, and press it again.
   */
  const project = await herProject();

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations`);
  await page.getByRole("button", { name: t("quotations.issueOwn") }).click();

  const form = page.getByRole("dialog", { name: t("quotations.issueOwn") });
  const picker = form.getByRole("combobox", { name: t("common.project") });
  await expect(picker).toBeVisible(COLD);
  await choose(page, picker, project.name);
  await fillOneItem(form, t);

  // Everything but the number, which is the one field only she is asked for.
  await form.getByRole("button", { name: t("quotations.issue") }).click();

  const smac = form.getByLabel(t("common.smacNumber"));
  await expect(smac).toHaveAttribute("aria-invalid", "true", COLD);
  await expect(smac).toBeFocused();
  await expect(smac).toBeInViewport();

  // And nothing was raised on the strength of a form that was refused.
  const stray = await one<{ n: number }>(
    `select count(*)::int as n from quotations
      where project_id = $1::uuid and smac_number is null`,
    [project.id],
  );
  expect(stray.n, "a quotation was created by a submission the form refused").toBe(0);
});
