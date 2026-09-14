import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { login, type Persona } from "./helpers/auth";
import { getTranslator, prepareAppPage, type Locale, type Translate } from "./helpers/i18n";

/**
 * P13-S11 — dropdowns open in Microsoft Edge (SPEC §3, D172).
 *
 * The founder's report was that dropdowns did not open in Edge. This spec is the
 * whole of the `edge` project (playwright.config.ts): the Edge installed on the
 * machine, every role, both locales, and on each screen every KIND of popup the
 * screen has — the account menu, a Select, a searchable picker, a date picker,
 * the dialogs those live in, and the search palette — opened by a click and by
 * the keyboard, seen on screen, and made to take a choice.
 *
 * What was measured before this was written (the slice's own scratch run, Edge
 * 153 and Chrome 153 side by side, headless and headed, both themes): every one
 * of those opened in both browsers, by click and by keyboard, in both locales.
 * The first hypothesis in WORKFLOW's list is the one that reproduced — Edge's
 * own translation. Set to always translate Arabic, Edge rewrote the Arabic
 * screens under React: text changed in place, React's text nodes swapped for
 * `<font>` wrappers, `direction: ltr` stamped on what it touched, hydration
 * failing on the day screen, and in one run the company picker still reading its
 * translated placeholder after a company had been chosen. Chromium's translator
 * swaps every text node, and on a page treated that way a Select whose label had
 * been swapped took the screen down the next time it was opened. The fix is one
 * attribute on the shell, `translate="no"` (src/app/layout.tsx, DESIGN §5); the
 * last test below is what fails without it.
 *
 * Walking the keyboard through every picker found one more, in every browser: a
 * searchable picker whose row meant "everyone" had the empty string for a value,
 * and cmdk will not highlight a row with an empty value, so the holidays form's
 * Whose day could not be answered from the keyboard at all. The kit keys its rows
 * now (src/components/ui-ext/searchable-select.tsx); Jerom's walk is its test.
 *
 * No business assertions: what a list offers and what a choice saves are other
 * specs' questions. A choice is made where making it saves nothing — inside a
 * form that is then closed, a filter, the theme already chosen — and a date
 * picker that saves the moment a day is pressed (a drawer's next follow-up) is
 * opened and closed, not chosen from.
 */

/** Everything every other spec's `page` gets, without the `locale` fixture this project cannot supply. */
const test = base.extend({
  // Playwright's second argument is renamed from `use` for the same reason as in
  // tests/helpers/i18n.ts: eslint-plugin-react-hooks reads `use` as React's hook.
  page: async ({ page }, provide) => {
    const assertNone = await prepareAppPage(page);
    await provide(page);
    assertNone();
  },
});

const LOCALES: readonly Locale[] = ["en", "ar"];

/** A walk over two roles' worth of screens is more than the suite's thirty seconds. */
const WALK = 240_000;

type Kind = "menu" | "select" | "picker" | "date";

/**
 * How each kind is found, by what the kit puts on it rather than by its words:
 * a Radix menu trigger says it opens a menu, the kit's Select trigger names its
 * slot, the searchable picker is a combobox that opens a dialog, and the date
 * picker says so (src/components/ui-ext/date-picker.tsx).
 */
const TRIGGER: Record<Kind, string> = {
  menu: '[aria-haspopup="menu"]',
  select: '[data-slot="select-trigger"]',
  picker: 'button[role="combobox"][aria-haspopup="dialog"]',
  date: '[data-picker="date"]',
};

/** What to press inside the popup to choose. A Select takes a DIFFERENT value, the path that broke. */
const CHOICE: Record<Kind, string> = {
  // The account menu's chosen theme, or a row menu's first item (RowMenu has no radios).
  menu: '[role="menuitemradio"][aria-checked="true"], [role="menuitem"]',
  select: '[role="option"]:not([data-state="checked"]):not([data-disabled])',
  picker: '[role="option"]:not([data-disabled="true"])',
  date: '[role="gridcell"]:not([data-disabled]) button:not([disabled])',
};

/** The picker is searched for first: choosing a customer is what brings the fields behind it. */
const ORDER: readonly Kind[] = ["picker", "select", "date", "menu"];

let stamp = 0;

/**
 * The first trigger of this kind that a person could press, pinned by a mark of
 * our own so that "the trigger" means the same element for the whole proof. React
 * leaves an attribute it did not write alone; a trigger re-mounted underneath the
 * walk loses the mark, and the proof fails on it rather than on its neighbour.
 */
async function firstOf(scope: Locator, kind: Kind): Promise<Locator | null> {
  const all = scope.locator(TRIGGER[kind]);
  const count = await all.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = all.nth(index);
    if (!(await candidate.isVisible()) || !(await candidate.isEnabled())) continue;
    const mark = `edge-${(stamp += 1)}`;
    await candidate.evaluate((element, value) => element.setAttribute("data-edge-walk", value), mark);
    return scope.page().locator(`[data-edge-walk="${mark}"]`);
  }
  return null;
}

/** The popup a trigger controls, by the id Radix wires between them. */
async function popupOf(page: Page, trigger: Locator): Promise<Locator> {
  await expect(trigger).toHaveAttribute("aria-controls", /.+/);
  const id = await trigger.getAttribute("aria-controls");
  return page.locator(`[id="${id}"]`);
}

/** Open by a click, see it on screen, choose from it (or, where a choice saves, close it). */
async function byClick(page: Page, trigger: Locator, kind: Kind, choose: boolean): Promise<void> {
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const popup = await popupOf(page, trigger);
  await expect(popup).toBeVisible();
  await expect(popup).toBeInViewport();
  const choice = popup.locator(CHOICE[kind]).first();
  await expect(choice).toBeVisible();
  if (choose) {
    // Playwright's click refuses an element something else is covering, so this
    // is also the proof that nothing — a modal layer's `pointer-events: none`,
    // an overlay — is swallowing the press.
    await choice.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(popup).toBeHidden();
}

/**
 * Open from the keyboard, see it on screen, move through it with the arrows, and
 * choose with Enter where a choice saves nothing (a menu's choices change the
 * theme or the language, and a calendar's arrows move between days, so those two
 * are left with Escape).
 */
async function byKeyboard(page: Page, trigger: Locator, kind: Kind, choose: boolean): Promise<void> {
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const popup = await popupOf(page, trigger);
  await expect(popup).toBeVisible();
  await expect(popup).toBeInViewport();
  // The caret went into the popup, which is what makes it usable without a mouse.
  await expect.poll(() => popup.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  let chose = false;
  if (kind === "picker") {
    // A row is highlighted for the arrows to move from. cmdk marks the first one
    // a moment after the list mounts, and before the kit keyed its rows it marked
    // none at all when that row's value was empty — Everyone, Everybody.
    const marked = popup.locator('[role="option"][aria-selected="true"]');
    await expect(marked).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await expect(marked).toHaveCount(1);
    if (choose) {
      await page.keyboard.press("Enter");
      chose = true;
    }
  } else if (kind === "menu" || kind === "select") {
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => popup.evaluate((element) => document.activeElement !== element && element.contains(document.activeElement)))
      .toBe(true);
    if (choose && kind === "select") {
      await page.keyboard.press("Enter");
      chose = true;
    }
  }
  if (!chose) await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(popup).toBeHidden();
}

/**
 * Every kind present in `scope`, once each, by click and by keyboard. Returns the
 * kinds it proved, so the caller can insist on the ones that screen must have.
 */
async function everyKind(page: Page, scope: Locator, choose: boolean): Promise<Set<Kind>> {
  const proved = new Set<Kind>();
  // Three rounds: a choice in the first can bring a Select and a date picker into
  // the second (the report popup's customer, then the contact and the follow-up).
  for (let round = 0; round < 3; round += 1) {
    let found = false;
    for (const kind of ORDER) {
      if (proved.has(kind)) continue;
      const trigger = await firstOf(scope, kind);
      if (!trigger) continue;
      found = true;
      await byClick(page, trigger, kind, choose);
      await byKeyboard(page, trigger, kind, choose);
      proved.add(kind);
    }
    if (!found) break;
  }
  return proved;
}

/** The form dialog on top, which is what an opener just opened. */
function newestDialog(page: Page): Locator {
  return page.locator('[data-slot="dialog-content"]').last();
}

/**
 * A dialog opened by the keyboard and closed, then by a click, walked for every
 * kind inside it, and closed. `need` is what that form must have in it.
 */
async function dialog(page: Page, opener: Locator, need: readonly Kind[]): Promise<void> {
  await expect(opener).toBeVisible();
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(newestDialog(page)).toBeVisible();
  await expect(newestDialog(page)).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);

  await opener.click();
  const form = newestDialog(page);
  await expect(form).toBeVisible();
  // The lists a form offers arrive after it opens (DialogFormSkeleton).
  await expect(form.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 15_000 });
  const proved = await everyKind(page, form, true);
  for (const kind of need) expect(proved, `a ${kind} in this form`).toContain(kind);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
}

/** The top bar's two popups: the account menu and the search palette. */
async function shell(page: Page, t: Translate): Promise<void> {
  const menu = page.locator(`header ${TRIGGER.menu}`);
  await byClick(page, menu, "menu", true);
  await byKeyboard(page, menu, "menu", false);

  const palette = page.getByRole("dialog", { name: t("shell.searchDialog") });
  await page.locator("main").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("Control+k");
  await expect(palette).toBeVisible();
  await expect(palette).toBeInViewport();
  await expect(palette.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();

  await page.locator("header button:has(kbd)").click();
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("combobox")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
}

/** The screen, loaded, with the error card nowhere on it. */
async function open(page: Page, t: Translate, locale: Locale, path: string): Promise<void> {
  await page.goto(`/${locale}${path}`);
  // The screen itself, not its loading shape: a route the dev server compiles
  // on first visit shows skeletons for a while, and nothing in them opens.
  await expect(page.locator("main h1").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("html[data-hydrated]")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText(t("shell.failedTitle"))).toHaveCount(0);
}

/**
 * The first record on a list whose drawer has `wanted` in it, opened. A shared
 * record is not the reader's own and offers less, so the first few rows are
 * tried in turn rather than trusting the top one.
 */
async function recordWith(
  page: Page,
  t: Translate,
  locale: Locale,
  path: string,
  wanted: (drawer: Locator) => Locator,
): Promise<Locator> {
  await open(page, t, locale, path);
  // Visible ones: a list can carry a second, hidden copy of its rows for the other width.
  const rows = page.locator('main a[href*="open="]').filter({ visible: true });
  await expect(rows.first()).toBeVisible();
  const hrefs = [...new Set(await rows.evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "")))];
  const drawer = page.locator('[data-slot="sheet-content"]');
  for (const href of hrefs.slice(0, 6)) {
    await page.goto(href);
    await expect(drawer).toBeVisible();
    await expect(drawer.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 15_000 });
    if (await wanted(drawer).first().isVisible()) return drawer;
  }
  throw new Error(`None of the first rows on ${path} opened a drawer with what this walk needs in it`);
}

async function signIn(page: Page, locale: Locale, who: Persona): Promise<Translate> {
  await login(page, locale, who);
  return getTranslator(locale);
}

for (const locale of LOCALES) {
  test.describe(`${locale}`, () => {
    test.use({ locale: locale === "ar" ? "ar-SA" : "en-GB" });

    test("every popup on Faisal's screens opens in Edge by click and by keyboard, and takes a choice", async ({
      page,
    }) => {
      test.setTimeout(WALK);
      const t = await signIn(page, locale, "faisal");

      await open(page, t, locale, "/day");
      await shell(page, t);
      await dialog(page, page.locator('[data-slot="add-report"]'), ["picker", "select", "date"]);

      await open(page, t, locale, "/companies");
      await dialog(page, page.getByRole("button", { name: t("forms.addCompany"), exact: true }).first(), ["picker"]);

      const share = (drawer: Locator) => drawer.getByRole("button", { name: t("drawer.share.action"), exact: true });
      const company = await recordWith(page, t, locale, "/companies", (drawer) => drawer.locator(TRIGGER.date));
      // The drawer's own date picker saves the day pressed, so it is opened and closed.
      expect(await everyKind(page, company, false)).toContain("date");
      if (await share(company).isVisible()) await dialog(page, share(company), ["picker"]);

      // Mark lost is the last item in the project drawer's menu since P13-G6 S12.3,
      // and the dialog it opens is hosted by the drawer, so it is opened from the menu.
      const more = (drawer: Locator) => drawer.locator('[data-slot="row-menu"]');
      const project = await recordWith(page, t, locale, "/projects", more);
      expect(await everyKind(page, project, false)).toContain("date");
      await more(project).click();
      await page.getByRole("menuitem", { name: t("common.markLost"), exact: true }).click();
      const lost = newestDialog(page);
      await expect(lost).toBeVisible();
      await expect(lost).toBeInViewport();
      expect(await everyKind(page, lost, true)).toContain("select");
      await page.keyboard.press("Escape");
      await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);

      await open(page, t, locale, "/quotations");
      await dialog(page, page.getByRole("button", { name: t("quotations.request"), exact: true }).first(), ["picker"]);

      await open(page, t, locale, "/dispatches");
      await dialog(page, page.getByRole("button", { name: t("dispatches.request"), exact: true }).first(), ["picker"]);

      await open(page, t, locale, "/reports");
      expect(await everyKind(page, page.locator("main"), true)).toContain("picker");
    });

    test("every popup on Rawan's screens opens in Edge by click and by keyboard, and takes a choice", async ({
      page,
    }) => {
      test.setTimeout(WALK);
      const t = await signIn(page, locale, "rawan");

      await open(page, t, locale, "/queue");
      await shell(page, t);
      await dialog(page, page.locator('[data-slot="add-report"]'), ["picker"]);

      // She raises no quotation from the quotations screen; her own floor has its forms.
      await open(page, t, locale, "/companies");
      await dialog(page, page.getByRole("button", { name: t("forms.addCompany"), exact: true }).first(), ["picker"]);

      await open(page, t, locale, "/dispatches");
      await dialog(page, page.getByRole("button", { name: t("dispatches.request"), exact: true }).first(), ["picker"]);
    });

    test("every popup on Abdulrahman's screens opens in Edge by click and by keyboard, and takes a choice", async ({
      page,
    }) => {
      test.setTimeout(WALK);
      const t = await signIn(page, locale, "abdulrahman");

      await open(page, t, locale, "/team");
      await shell(page, t);

      await open(page, t, locale, "/reports");
      expect(await everyKind(page, page.locator("main"), true)).toContain("picker");

      await open(page, t, locale, "/leads");
      expect(await everyKind(page, page.locator("main"), true)).toContain("picker");

      const handOver = (drawer: Locator) => drawer.getByRole("button", { name: t("drawer.handOver"), exact: true });
      const company = await recordWith(page, t, locale, "/companies", handOver);
      await dialog(page, handOver(company), ["picker"]);
    });

    test("every popup on Jerom's screens opens in Edge by click and by keyboard, and takes a choice", async ({
      page,
    }) => {
      test.setTimeout(WALK);
      const t = await signIn(page, locale, "jerom");

      await open(page, t, locale, "/admin/users");
      await shell(page, t);
      await dialog(page, page.getByRole("button", { name: t("admin.addUser"), exact: true }), ["picker"]);

      await open(page, t, locale, "/admin/holidays");
      await dialog(page, page.getByRole("button", { name: t("admin.addDay"), exact: true }), ["picker", "date"]);
    });

    /**
     * The regression test for the cause (DESIGN §5). A translator is put on the
     * page the way Chromium's own works — every text node in the page's language
     * replaced by `<font>` wrappers, again whenever new text appears, skipping
     * whatever sits under `translate="no"` — and the walk that broke is walked on
     * it: the report popup's Select, given a different contact, opened again.
     * With the shell marked, nothing is translated and the Select opens. Without
     * the mark, the swapped label is not a child of the value any more when React
     * removes it, and "This screen could not be drawn" replaces the form.
     *
     * Simulated, not Edge's own translator: that one needs a profile told to
     * translate, a network service and a headed window, none of which belongs in
     * a gate. Edge was measured honouring the attribute in the slice's scratch run.
     */
    test("a page a browser would translate is marked not to be, and a Select given a new value on it still opens", async ({
      page,
    }) => {
      test.setTimeout(WALK);
      await page.addInitScript({ content: translator(locale) });
      const t = await signIn(page, locale, "faisal");

      await open(page, t, locale, "/day");
      await translatorSettled(page);

      await page.locator('[data-slot="add-report"]').click();
      const form = newestDialog(page);
      await expect(form).toBeVisible();
      const customer = form.locator(TRIGGER.picker).first();
      const contact = form.locator(TRIGGER.select).first();
      // The first customer with a contact; a customer with none has no Select to break.
      for (let index = 0; index < 5 && !(await contact.isVisible()); index += 1) {
        await customer.click();
        await page.locator('[data-slot="popover-content"] [role="option"]').nth(index).click();
        await expect(customer).toHaveAttribute("aria-expanded", "false");
        await expect(form.locator('[data-slot="skeleton"]')).toHaveCount(0, { timeout: 15_000 });
      }
      await expect(contact).toBeVisible();

      for (let round = 0; round < 2; round += 1) {
        await translatorSettled(page);
        await contact.click();
        const list = page.getByRole("listbox");
        await expect(list).toBeVisible();
        await translatorSettled(page);
        await list.locator(CHOICE.select).first().click();
        await expect(list).toBeHidden();
        await translatorSettled(page);
      }
      await contact.click();
      await expect(page.getByRole("listbox")).toBeVisible();
      await expect(page.getByText(t("shell.failedTitle"))).toHaveCount(0);
      await page.keyboard.press("Escape");
      // And why: the shell says so, and so nothing on the page was touched.
      await expect(page.locator("html")).toHaveAttribute("translate", "no");
      await expect(page.locator("font")).toHaveCount(0);
    });
  });
}

/**
 * Chromium's page translation, as far as the DOM can tell: each text node in the
 * source language is taken out and a `<font><font>…</font></font>` put where it
 * was, and text that appears later — a popup that has just been portalled in — is
 * translated a moment after it lands. An element under `translate="no"` (the
 * nearest `translate` attribute says "no") is left alone, as the browser leaves
 * it. The words are not changed, so the page still reads the same to the test.
 */
function translator(locale: Locale): string {
  const source = locale === "ar" ? "[\\u0600-\\u06FF]" : "[A-Za-z]{2}";
  return `(() => {
    const SOURCE = new RegExp(${JSON.stringify(source)});
    window.__translatorPasses = 0;
    const excluded = (text) => {
      const parent = text.parentElement;
      if (!parent) return true;
      if (parent.closest("script, style, noscript, textarea, title, font")) return true;
      const marked = parent.closest("[translate]");
      return !!marked && marked.getAttribute("translate") === "no";
    };
    const pass = () => {
      window.__translatorPasses += 1;
      if (!document.body) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const found = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (SOURCE.test(node.nodeValue) && !excluded(node)) found.push(node);
      }
      for (const node of found) {
        const outer = document.createElement("font");
        const inner = document.createElement("font");
        outer.style.verticalAlign = "inherit";
        inner.style.verticalAlign = "inherit";
        inner.textContent = node.nodeValue;
        outer.appendChild(inner);
        node.parentNode.replaceChild(outer, node);
      }
    };
    let timer = 0;
    const later = () => {
      window.__translatorQuiet = false;
      clearTimeout(timer);
      timer = setTimeout(() => { pass(); window.__translatorQuiet = true; }, 40);
    };
    window.addEventListener("load", () => {
      pass();
      window.__translatorQuiet = true;
      new MutationObserver(later).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
  })();`;
}

/** The translator has had its pass over whatever last changed. */
async function translatorSettled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __translatorQuiet?: boolean }).__translatorQuiet)).toBe(true);
}
