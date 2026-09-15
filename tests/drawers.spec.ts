import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { dispatchLabel, quotationLabel } from "@/lib/labels";

/**
 * Every button a drawer hands to the kit still opens its dialog (DESIGN §5).
 *
 * The drawers are server components. A `<Button>` one of them builds and passes
 * to a dialog as its trigger does not reach the browser as an element — it
 * arrives as a wrapper around a streamed chunk, and Radix's `asChild` slot threw
 * on it outright: "Primitive.button failed to slot onto its children". The
 * company drawer's projects tab went to "This page couldn't load" from a tab
 * click, and five more triggers were written the same way behind it.
 *
 * The kit resolves it now, once, for every trigger it has
 * (src/components/ui/use-slot-child.ts). Pressing is the only thing that proves
 * it: the button renders perfectly right up until it is used.
 *
 * A drawer renders two different sets of triggers: one when a tab has rows and
 * one when the tab is empty. The empty set is already pressed by rep.spec.ts, on
 * the company it creates, which is why the bug survived — every seeded company
 * of Faisal's has contacts, and the rows set was the one nobody pressed. This
 * file is the rows set.
 *
 * Nothing here is confirmed: every dialog is opened and left, so this runs over
 * seeded rows without changing one.
 */

/**
 * Proves a dialog with its own title came up.
 *
 * Counting dialogs does not work: Radix marks the rest of the page
 * `aria-hidden` while one is open, so the drawer underneath stops counting as a
 * dialog at the very moment the new one appears. The title does move — and a
 * title is what "a dialog opened" means to the person reading the screen.
 */
async function pressAndExpectADialog(
  page: Page,
  button: Locator,
  what: string,
  menuItem?: string,
): Promise<void> {
  const title = page.getByRole("dialog").getByRole("heading").first();
  const before = (await title.textContent())?.trim() ?? "";
  expect(before, `no drawer title to compare against before pressing ${what}`).not.toBe("");
  await button.click();
  // A row's menu holds the trigger itself: the dialog is the item's (S12.2).
  if (menuItem) await page.getByRole("menuitem", { name: menuItem, exact: true }).click();
  await expect(title, `pressing ${what} opened no dialog`).not.toHaveText(before);
}

/**
 * Opens one drawer the way a rep does — by pressing the row — and presses one
 * trigger inside it.
 *
 * The row, not the URL. Typing `?open=<id>` renders the whole page at once and
 * the trigger arrives as an ordinary element; pressing the row is a soft
 * navigation, the drawer streams in on its own, and only then does its trigger
 * reach the browser as the lazy wrapper that broke. A version of this spec that
 * loaded the URL directly passed against the unfixed kit.
 *
 * Every press starts from its own load of the list: an open dialog changes
 * which element `getByRole` resolves to, and a spec that walks several in a row
 * ends up asserting against whichever one it happens to be pointing at.
 */
async function openDrawerAndPress(
  page: Page,
  list: string,
  rowName: string,
  tab: string,
  buttonName: string,
  what: string,
  menuItem?: string,
): Promise<void> {
  await page.goto(list);
  // The row's link is named by everything in it — the company and its city and
  // its figures — so the name is matched as a substring, not as the whole.
  await page.getByRole("table").first().getByRole("link", { name: rowName }).first().click();
  const drawer = page.getByRole("dialog").first();
  await expect(drawer).toBeVisible();

  // Switching to a tab that was not the open one is also the cheapest proof
  // that React has hydrated the sheet: it is on screen from its first
  // server-rendered frame, and a press that lands before then does nothing.
  const tabButton = drawer.getByRole("tab", { name: tab });
  await tabButton.click();
  await expect(tabButton).toHaveAttribute("aria-selected", "true");

  const button = drawer.getByRole("button", { name: buttonName, exact: true }).first();
  await expect(button, `${what} is not on this drawer`).toBeVisible();
  await pressAndExpectADialog(page, button, what, menuItem);
}

/**
 * The name of one of Faisal's companies that has both a contact and a project.
 * A name, not an id: a drawer is opened by pressing its row (DESIGN.md — no
 * internal ids on screen), and that is the navigation this spec needs. With it,
 * the name of one contact of his own there: a contact's Edit is in that
 * contact's own menu, and the menu is named by the contact.
 */
async function faisalCompanyWithRows(): Promise<{ name: string; contact: string }> {
  const faisal = await userId("faisal@technopanel.com.sa");
  const rows = await query<{ name: string; contact: string }>(
    `select companies.name,
            (select contacts.name from contacts
              where contacts.company_id = companies.id
                and contacts.rep_id = $1::uuid
                and contacts.archived_at is null
              order by contacts.is_main desc, contacts.name
              limit 1) as contact
       from companies
      where companies.rep_id = $1::uuid
        and companies.archived_at is null
        and (select count(*) from contacts
              where contacts.company_id = companies.id
                and contacts.rep_id = $1::uuid
                and contacts.archived_at is null) > 0
        and (select count(*) from projects
              where projects.company_id = companies.id
                and projects.archived_at is null) > 0
      order by companies.created_at
      limit 1`,
    [faisal],
  );
  if (rows.length === 0) {
    throw new Error(
      "The seed has no company of Faisal's with both a contact and a project — " +
        "scripts/seed-demo.ts changed and this spec no longer presses the triggers it was written for.",
    );
  }
  return rows[0];
}

test("every button a drawer hands the kit still opens its dialog", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  const { name: company, contact } = await faisalCompanyWithRows();
  const companies = `/${locale}/companies`;

  await test.step("the tabs that have rows in them", async () => {
    const press = (tab: string, button: string, what: string, menuItem?: string) =>
      openDrawerAndPress(page, companies, company, tab, button, what, menuItem);

    await press(t("common.contacts"), t("drawer.addContact"), "Add contact");
    await press(
      t("common.contacts"),
      t("common.moreFor", { name: contact }),
      "Edit contact",
      t("common.edit"),
    );
    await press(t("common.projects"), t("drawer.newProject"), "New project");
  });

  await test.step("the project drawer, whose Add report button comes the same way", async () => {
    await page.goto(`/${locale}/projects`);
    await page.getByRole("table").first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    const tab = drawer.getByRole("tab", { name: t("common.quotations") });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");

    const report = drawer.getByRole("button", { name: t("common.addReport"), exact: true }).first();
    await pressAndExpectADialog(page, report, "Add report");
  });
});

/**
 * The crash itself, in the shape it arrived in: open a drawer by pressing its
 * row, then read through its tabs.
 *
 * Nothing is asserted about what the tabs contain — the point is that the
 * browser throws nothing. A tab's panel mounts on the click, which is when the
 * trigger inside it is slotted, so walking the tabs is what provokes it; the
 * uncaught-error watch in tests/helpers/i18n.ts is what fails the test. Before
 * the kit resolved the trigger, this ended on "This page couldn't load".
 */
test("reading through a drawer's tabs throws nothing", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  await test.step("the company drawer, all four tabs", async () => {
    await page.goto(`/${locale}/companies`);
    await page.getByRole("table").first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    for (const tab of ["common.contacts", "common.projects", "common.quotations", "drawer.activity"]) {
      const tabButton = drawer.getByRole("tab", { name: t(tab) });
      await tabButton.click();
      await expect(tabButton).toHaveAttribute("aria-selected", "true");
    }
  });

  await test.step("the project drawer, both of its", async () => {
    await page.goto(`/${locale}/projects`);
    await page.getByRole("table").first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    for (const tab of ["common.quotations", "drawer.activity"]) {
      const tabButton = drawer.getByRole("tab", { name: t(tab) });
      await tabButton.click();
      await expect(tabButton).toHaveAttribute("aria-selected", "true");
    }
  });
});

/**
 * A drawer takes focus itself, and arms nothing.
 *
 * Radix moves focus to the first tabbable control in the panel. In the company
 * drawer that was the follow-up date picker: opening a shared `?open=` link put
 * a focus ring on a date nobody had touched and made Enter open a calendar.
 * A drawer is a place, not a form — so it focuses the panel, a screen reader
 * reads the title, and the first Tab goes where the reader chose to go.
 */
test("opening a drawer focuses the drawer, not the first thing inside it", async ({
  page,
  locale,
}) => {
  await login(page, locale, "faisal");

  for (const screen of ["companies", "projects", "quotations"] as const) {
    await page.goto(`/${locale}/${screen}`);
    const first = page.getByRole("table").first().getByRole("link").first();
    await first.click();
    await expect(page.getByRole("dialog").first()).toBeVisible();

    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return {
        role: el?.getAttribute("role") ?? el?.tagName ?? "",
        // Nothing is drawn around the panel: an outline on an element a person
        // cannot act on says nothing (src/components/ui/sheet.tsx).
        outlined: el ? getComputedStyle(el).outlineStyle !== "none" : false,
      };
    });

    expect(focused.role, `/${locale}/${screen} focused a control inside the drawer`).toBe("dialog");
    expect(focused.outlined, `/${locale}/${screen} drew a ring round the whole panel`).toBe(false);
  }
});
/**
 * A record opens in one panel, whichever record it is (DESIGN §6, D166).
 *
 * Four screens drew the drawer themselves and agreed about none of it: a
 * company came in at 32rem, a project at 36rem and a quotation at 42rem, so the
 * surface changed size as a rep walked one job from the customer to the paper.
 * Two of the loading skeletons were pinned to the right, which is the wrong
 * edge in Arabic — the panel arrived from one side and the record replacing it
 * from the other. And three of the four bordered the edge that faces away from
 * the page, where in Arabic nothing can see it.
 *
 * What is measured is what a reader would notice: the same width every time,
 * the same edge, and the line on the edge facing the list. The widths are
 * compared with each other rather than against a number, because the rule is
 * that they agree — not that they are 672 pixels.
 */
test("every record opens in the same panel, on the edge the language reads from", async ({
  page,
  locale,
}) => {
  const panel = () => page.locator("[data-slot='sheet-content']").first();

  async function open(screen: string): Promise<{ width: number; side: string; borders: string[] }> {
    await page.goto(`/${locale}/${screen}`);
    await page.getByRole("table").first().getByRole("link").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 30_000 });

    const box = await panel().boundingBox();
    expect(box, `no panel on /${locale}/${screen}`).not.toBeNull();
    const side = (await panel().getAttribute("data-side")) ?? "";
    // Read until the panel answers: the drawer's body streams in after it
    // opens, and a style read off a node being replaced comes back empty.
    let borders: string[] = [];
    await expect
      .poll(async () => {
        borders = await panel().evaluate((node) => {
          const style = getComputedStyle(node);
          return [style.borderInlineStartWidth, style.borderInlineEndWidth];
        });
        return borders.every((width) => width !== "");
      })
      .toBe(true);
    return { width: Math.round(box?.width ?? 0), side, borders };
  }

  await login(page, locale, "faisal");
  const company = await open("companies");
  const project = await open("projects");
  const quotation = await open("quotations");

  await login(page, locale, "rawan");
  const dispatch = await open("dispatches");

  const seen = [company, project, quotation, dispatch];

  // One width. It is a panel over the list, not the whole screen.
  const widths = seen.map((one) => one.width);
  expect(new Set(widths).size, `four panels, ${widths.join(" / ")} wide`).toBe(1);
  expect(widths[0]).toBeGreaterThan(0);
  const viewport = page.viewportSize();
  expect(widths[0]).toBeLessThan(viewport?.width ?? 0);

  // One edge, and it is the end of the line: the right in English, the left in
  // Arabic. Radix's own sides are physical, so this is the mirror image.
  for (const one of seen) {
    expect(one.side, "a panel came from the wrong edge").toBe(locale === "ar" ? "left" : "right");
    // The line is drawn on the edge facing the page, which is the inline-start
    // one in both languages, because the panel comes from the inline-end edge.
    expect(one.borders[0], "no line on the edge facing the list").not.toBe("0px");
    expect(one.borders[1], "a line on the edge nothing can see").toBe("0px");
  }
});

/**
 * The project drawer has a hierarchy (DESIGN §6, P13-G6 S12.3).
 *
 * Mark lost stood in the drawer's row at the weight of Edit, a finger's width
 * from Add report, and it is the act that ends a job (S20). Now one action is in
 * sight — Add report, the brand — and the rest are in the menu at the row's end,
 * with the act that takes the job away last, apart, in the tint. And the head
 * names the company with its face: a 40px square, as a company is drawn (§1b).
 *
 * A dialog a menu item opens is hosted by the drawer, so the proof that it
 * works is pressing it, and the proof that it hands back is where focus lands.
 */
test("the project drawer shows Add report, keeps the rest in its menu, and puts Mark lost last", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const project = await one<{ id: string; name: string }>(
    `select p.id, p.name
       from projects p
       join companies c on c.id = p.company_id
      where p.rep_id = $1::uuid and c.rep_id = $1::uuid
        and p.lost_at is null and p.archived_at is null and c.archived_at is null
      order by p.created_at
      limit 1`,
    [faisal],
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/projects?view=list&open=${project.id}`);
  const drawer = page.getByRole("dialog", { name: project.name });
  await expect(drawer).toBeVisible({ timeout: 30_000 });

  await test.step("the head names the company with its 40px square", async () => {
    const avatar = drawer.locator("[data-slot='avatar']").first();
    await expect(avatar).toBeVisible();
    const box = await avatar.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(40);
    // A circle's radius is half its width or more; a company's corners are rounded.
    const radius = await avatar.evaluate((node) => parseFloat(getComputedStyle(node).borderTopLeftRadius));
    expect(radius, "a company's avatar is drawn as a circle").toBeLessThan(20);
  });

  const actions = drawer.getByRole("group", { name: t("projects.projectActions") });
  const more = actions.getByRole("button", { name: t("common.moreFor", { name: project.name }) });

  await test.step("one action in sight, and the menu beside it", async () => {
    const report = actions.getByRole("button", { name: t("common.addReport"), exact: true });
    await expect(report).toHaveAttribute("data-variant", "brand");
    await expect(more).toBeVisible();
    await expect(actions.getByRole("button")).toHaveCount(2);
    for (const label of ["common.edit", "common.markLost", "drawer.archive", "drawer.share.action"]) {
      await expect(
        drawer.getByRole("button", { name: t(label), exact: true }),
        `${t(label)} still stands in the drawer as a button`,
      ).toHaveCount(0);
    }
  });

  await test.step("the menu: what changes the record, then — apart, in the tint — Archive and Mark lost", async () => {
    // At a drawer's head the menu's button stands with the 32px buttons beside it.
    const box = await more.boundingBox();
    expect(box?.height, "the drawer head's menu button").toBe(32);
    await more.click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText([
      t("common.edit"),
      t("drawer.share.action"),
      t("drawer.archive"),
      t("common.markLost"),
    ]);
    const items = menu.getByRole("menuitem");
    await expect(items.nth(1)).not.toHaveAttribute("data-variant", "destructive");
    await expect(items.nth(2)).toHaveAttribute("data-variant", "destructive");
    await expect(items.nth(3)).toHaveAttribute("data-variant", "destructive");
    await expect(menu.getByRole("separator")).toHaveCount(1);
    // The divider stands between the two groups: straight after Sharing.
    const afterSharing = await items
      .nth(1)
      .evaluate((node) => node.nextElementSibling?.getAttribute("role") ?? null);
    expect(afterSharing, "what follows Sharing in the menu").toBe("separator");
  });

  await test.step("Edit opens from the menu, and closing it gives focus back to the menu's button", async () => {
    await page.getByRole("menuitem", { name: t("common.edit"), exact: true }).click();
    const form = page.getByRole("dialog", { name: t("projects.editProject") });
    await expect(form).toBeVisible();
    await expect(form.getByLabel(t("common.name"), { exact: true })).toHaveValue(project.name);
    await page.keyboard.press("Escape");
    await expect(form).toBeHidden();
    await expect(more).toBeFocused();
  });
});

/**
 * The dispatch drawer has the same hierarchy (DESIGN §6, P13-G6 S12.5).
 *
 * It opened on a bare row of facts — quotation, raised by, date — with its
 * square metres three screens down in the totals and its trail under the payment
 * note, and Refuse stood at the weight of Approve beside it. Now the head is the
 * customer's square, the load and its state, and the strip leads with the metres
 * the load puts on the month (SPEC §3 P8). Approve is her one brand button,
 * Refuse is last and apart in the tint, and what happened sits under them.
 */
test("the dispatch drawer leads with the customer and its metres, keeps Refuse last and apart, and reads its trail under the actions", async ({
  page,
  locale,
  t,
}) => {
  // Waiting on her, on a live paper or none, so Approve is pressable (D85).
  const dispatch = await one<{ id: string; number: number }>(
    `select d.id, d.number
       from dispatches d
       join companies c on c.id = d.company_id
       left join quotations q on q.id = d.quotation_id
      where d.status = 'submitted' and c.archived_at is null
        and (q.id is null or not exists (
              select 1 from quotations later
               where later.number = q.number and later.revision > q.revision))
      order by d.created_at, d.number
      limit 1`,
  );
  const label = dispatchLabel(dispatch.number);

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue?dispatch=${dispatch.id}`);
  const drawer = page.getByRole("dialog", { name: label });
  await expect(drawer).toBeVisible({ timeout: 30_000 });

  await test.step("the head: the customer's 40px square, the load and its state", async () => {
    const avatar = drawer.locator("[data-slot='avatar']").first();
    await expect(avatar).toBeVisible();
    const box = await avatar.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(40);
    const radius = await avatar.evaluate((node) => parseFloat(getComputedStyle(node).borderTopLeftRadius));
    expect(radius, "a company's avatar is drawn as a circle").toBeLessThan(20);
    await expect(drawer.getByRole("heading").first()).toHaveText(label);
    await expect(drawer.locator("[data-tone]").first()).toHaveText(t("dispatches.statusSubmitted"));
  });

  await test.step("the strip leads with the metres, then the paper, the day and SMAC's number", async () => {
    const strip = drawer.locator("[data-slot='standing']");
    await expect(strip.locator("[data-slot='figure-label']")).toHaveText([
      t("common.sqm"),
      t("common.quotation"),
      t("common.date"),
      t("common.smacDispatchNumber"),
    ]);
    await expect(strip.locator("[data-slot='figure-sending']")).toContainText(/\d/);
  });

  const actions = drawer.getByRole("group", { name: t("dispatches.actions") });
  const approve = actions.getByRole("button", { name: t("dispatches.approve"), exact: true });
  const refuse = actions.getByRole("button", { name: t("dispatches.refuse"), exact: true });

  await test.step("Approve is the one brand button, and Refuse is last, apart, in the tint", async () => {
    await expect(approve).toHaveAttribute("data-variant", "brand");
    await expect(actions.locator("[data-variant='brand']")).toHaveCount(1);
    await expect(refuse).toHaveAttribute("data-variant", "destructive");
    await expect(actions.getByRole("button").last()).toHaveText(t("dispatches.refuse"));

    // Apart: at the far end of its row, whichever way the row reads. Measured
    // at rest: the gap read 3, 4 and 5px on three runs while the drawer was
    // still coming in.
    await drawer.evaluate((node) =>
      Promise.all(node.getAnimations({ subtree: true }).map((motion) => motion.finished)),
    );
    const row = await actions.boundingBox();
    const end = await refuse.boundingBox();
    expect(row, "the action row has no box").not.toBeNull();
    expect(end, "Refuse has no box").not.toBeNull();
    const gap =
      locale === "ar"
        ? (end?.x ?? 0) - (row?.x ?? 0)
        : (row?.x ?? 0) + (row?.width ?? 0) - ((end?.x ?? 0) + (end?.width ?? 0));
    expect(Math.round(gap), "Refuse is not at the end of its row").toBeLessThanOrEqual(1);
  });

  await test.step("what happened is read under the actions, before the load itself", async () => {
    const order = await drawer.evaluate((node) => {
      const group = node.querySelector("[role='group']");
      const trail = node.querySelector("li[data-event]");
      const item = node.querySelector("[data-slot='dispatch-item']");
      const follows = (a: Element | null, b: Element | null) =>
        Boolean(a && b && a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { trailAfterActions: follows(group, trail), itemAfterTrail: follows(trail, item) };
    });
    expect(order).toEqual({ trailAfterActions: true, itemAfterTrail: true });
  });

  await test.step("Refuse asks for her reason, and the button that sends it is in the tint too", async () => {
    await refuse.click();
    const ask = page.getByRole("dialog", { name: t("dispatches.refuseTitle", { label }) });
    await expect(ask).toBeVisible();
    await expect(ask.getByLabel(t("common.reason"))).toBeVisible();
    await expect(ask.getByRole("button", { name: t("dispatches.refuse"), exact: true })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();
  });
});

/**
 * The quotation drawer has the same hierarchy (DESIGN §6, P13-G6 S12.4).
 *
 * It led with the paper's number and put the company small under it; what
 * happened to the paper came last, after the lines, the totals, the dispatches
 * and the revisions; and Withdraw stood beside Edit request at the same weight,
 * though it ends the request. Now the company leads with its 40px square and the
 * number sits beside its state; one act is the brand — the one the paper is
 * waiting on from this reader, or Add report where it waits on nothing — the
 * trail is straight under the actions, and Withdraw is the last act in the menu,
 * in the tint. The number is still the drawer's name, which is what opens it here.
 */
test("the quotation drawer leads with the company, keeps what happened under its actions, and puts Withdraw last in its menu", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId("faisal@technopanel.com.sa");
  const latest = (status: string) =>
    one<{ id: string; number: number; revision: number; company: string }>(
      `select q.id, q.number, q.revision, c.name as company
         from quotations q
         join companies c on c.id = q.company_id
         join projects p on p.id = q.project_id
        where q.rep_id = $1::uuid and c.rep_id = $1::uuid and q.status::text = $2::text
          and c.archived_at is null and p.archived_at is null and p.lost_at is null
          and not exists (select 1 from quotations later
                           where later.number = q.number and later.revision > q.revision)
        order by q.created_at
        limit 1`,
      [faisal, status],
    );
  const waiting = await latest("requested");
  const label = quotationLabel(waiting.number, waiting.revision);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations?view=list&open=${waiting.id}`);
  const drawer = page.getByRole("dialog", { name: label });
  await expect(drawer).toBeVisible({ timeout: 30_000 });
  const actions = drawer.getByRole("group", { name: t("quotations.actions") });
  const more = actions.getByRole("button", { name: t("common.moreFor", { name: label }) });

  await test.step("the head: the company with its 40px square, then the number beside its state", async () => {
    const avatar = drawer.locator("[data-slot='avatar']").first();
    await expect(avatar).toBeVisible();
    const box = await avatar.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(40);
    const radius = await avatar.evaluate((node) => parseFloat(getComputedStyle(node).borderTopLeftRadius));
    expect(radius, "a company's avatar is drawn as a circle").toBeLessThan(20);

    const company = drawer.locator("[data-slot='quotation-company']");
    await expect(company).toHaveText(waiting.company);
    const title = drawer.getByRole("heading", { name: label, exact: true });
    const companyBox = await company.boundingBox();
    const titleBox = await title.boundingBox();
    expect(companyBox?.y ?? Infinity, "the number leads the head again").toBeLessThan(titleBox?.y ?? 0);
    await expect(drawer.locator("[data-tone]").first()).toHaveText(t("quotations.statusRequested"));
  });

  await test.step("nothing is owed on a waiting request, so Add report is the brand and Withdraw is not in sight", async () => {
    const brand = actions.locator("[data-slot='button'][data-variant='brand']");
    await expect(brand).toHaveCount(1);
    await expect(brand).toHaveText(t("common.addReport"));
    await expect(actions.getByRole("button", { name: t("quotations.editRequest") })).toHaveAttribute(
      "data-variant",
      "outline",
    );
    await expect(drawer.getByRole("button", { name: t("quotations.cancel"), exact: true })).toHaveCount(0);
    const menuBox = await more.boundingBox();
    expect(menuBox?.height, "the drawer head's menu button").toBe(32);
  });

  await test.step("what happened is straight under the actions, before the lines", async () => {
    const actionsBox = await actions.boundingBox();
    const trailBox = await drawer.locator("li[data-event]").first().boundingBox();
    const itemBox = await drawer.locator("[data-slot='quotation-item']").first().boundingBox();
    expect(actionsBox?.y ?? Infinity, "the trail sits above the actions").toBeLessThan(trailBox?.y ?? 0);
    expect(trailBox?.y ?? Infinity, "the trail still comes after the lines").toBeLessThan(itemBox?.y ?? 0);
  });

  await test.step("a line's figures say what they are, and the totals' label is a word, not an eyebrow", async () => {
    const item = drawer.locator("[data-slot='quotation-item']").first();
    await expect(item).toContainText(t("common.sar"));
    await expect(item).toContainText(t("common.sqm"));
    const totalsLabel = drawer.locator("[data-slot='totals'] dt").first();
    await expect(totalsLabel).toHaveCSS("text-transform", "none");
    await expect(totalsLabel).toHaveCSS("letter-spacing", "normal");
  });

  await test.step("Withdraw is the menu's last act, in the tint, and its confirmation hands focus back", async () => {
    await more.click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText([t("quotations.cancel")]);
    await expect(menu.getByRole("menuitem").first()).toHaveAttribute("data-variant", "destructive");
    await expect(menu.getByRole("separator")).toHaveCount(0);
    await menu.getByRole("menuitem").first().click();

    const ask = page.getByRole("dialog", { name: t("quotations.cancelTitle", { label }) });
    await expect(ask.getByRole("button", { name: t("quotations.cancel") })).toHaveAttribute(
      "data-variant",
      "destructive",
    );
    await page.keyboard.press("Escape");
    await expect(ask).toBeHidden();
    await expect(more).toBeFocused();
  });

  await test.step("sent back to him, Edit request is the brand", async () => {
    const returned = await latest("returned");
    const name = quotationLabel(returned.number, returned.revision);
    await page.goto(`/${locale}/quotations?view=list&open=${returned.id}`);
    const sheet = page.getByRole("dialog", { name });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    const brand = sheet
      .getByRole("group", { name: t("quotations.actions") })
      .locator("[data-slot='button'][data-variant='brand']");
    await expect(brand).toHaveCount(1);
    await expect(brand).toHaveText(t("quotations.editRequest"));
  });

  await test.step("on her desk, Issue is the brand and Send back beside it, with no menu", async () => {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue?open=${waiting.id}`);
    const sheet = page.getByRole("dialog", { name: label });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    const hers = sheet.getByRole("group", { name: t("quotations.actions") });
    await expect(hers.getByRole("button").nth(0)).toHaveText(t("quotations.issue"));
    await expect(hers.getByRole("button").nth(0)).toHaveAttribute("data-variant", "brand");
    await expect(hers.getByRole("button").nth(1)).toHaveText(t("quotations.sendBack"));
    await expect(hers.getByRole("button").nth(1)).toHaveAttribute("data-variant", "outline");
    await expect(hers.locator("[data-slot='row-menu']")).toHaveCount(0);
  });
});
