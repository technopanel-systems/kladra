import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

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
async function pressAndExpectADialog(page: Page, button: Locator, what: string): Promise<void> {
  const title = page.getByRole("dialog").getByRole("heading").first();
  const before = (await title.textContent())?.trim() ?? "";
  expect(before, `no drawer title to compare against before pressing ${what}`).not.toBe("");
  await button.click();
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
  await pressAndExpectADialog(page, button, what);
}

/**
 * The name of one of Faisal's companies that has both a contact and a project.
 * A name, not an id: a drawer is opened by pressing its row (DESIGN.md — no
 * internal ids on screen), and that is the navigation this spec needs.
 */
async function faisalCompanyWithRows(): Promise<string> {
  const faisal = await userId("faisal@technopanel.com.sa");
  const rows = await query<{ name: string }>(
    `select companies.name
       from companies
      where companies.rep_id = $1::uuid
        and companies.archived_at is null
        and (select count(*) from contacts
              where contacts.company_id = companies.id
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
  return rows[0].name;
}

test("every button a drawer hands the kit still opens its dialog", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  const company = await faisalCompanyWithRows();
  const companies = `/${locale}/companies`;

  await test.step("the tabs that have rows in them", async () => {
    const press = (tab: string, button: string, what: string) =>
      openDrawerAndPress(page, companies, company, tab, button, what);

    await press(t("common.contacts"), t("drawer.addContact"), "Add contact");
    await press(t("common.contacts"), t("common.edit"), "Edit contact");
    await press(t("common.projects"), t("drawer.newProject"), "New project");
  });

  await test.step("the project drawer, whose Log button comes the same way", async () => {
    await page.goto(`/${locale}/projects`);
    await page.getByRole("table").first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    const tab = drawer.getByRole("tab", { name: t("common.quotations") });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");

    const log = drawer.getByRole("button", { name: t("common.log"), exact: true }).first();
    await pressAndExpectADialog(page, log, "Log");
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
