import type { Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * Two rules about reading a screen, both of which shipped broken first
 * (DESIGN §5).
 */

/** Any character from the Arabic script, wherever it sits in a run. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** The screens a rep actually reads, plus a drawer, which is where dates live. */
const SCREENS = ["", "companies", "projects", "notifications"];

/**
 * Direction follows the first strong character, never a forced `ltr`.
 *
 * `dir="ltr"` around `04/سبتمبر/2026` puts the month name in its own
 * right-to-left run and reclassifies the year after it as an Arabic number.
 * The two join, swap, and the button reads `04/2026/سبتمبر` while the label
 * beside it is correct. It was in two places and would have been in every
 * quotation date.
 *
 * The rule is what this checks, not the symptom: `dir="ltr"` is for runs with
 * no letters in them at all — a phone number, a quantity, a keycap. Anything
 * with an Arabic letter in it either has no `dir` or has `dir="auto"`.
 */
async function forcedLtrWithArabic(page: Page): Promise<string[]> {
  const texts = await page.locator("[dir='ltr']").evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
  return texts.filter((text) => ARABIC.test(text));
}

test("nothing with an Arabic letter in it is forced left-to-right", async ({
  page,
  locale,
  t,
}) => {
  test.skip(locale !== "ar", "The rule only bites where the strong characters are Arabic.");
  await login(page, locale, "faisal");

  for (const screen of SCREENS) {
    await page.goto(`/${locale}/${screen}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
    expect(await forcedLtrWithArabic(page), `forced ltr on /${locale}/${screen}`).toEqual([]);
  }

  await test.step("and inside a drawer, where the dates are", async () => {
    await page.goto(`/${locale}/companies`);
    await page.getByRole("table").first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible();

    for (const tab of ["common.contacts", "common.projects", "drawer.activity"]) {
      const tabButton = drawer.getByRole("tab", { name: t(tab) });
      await tabButton.click();
      await expect(tabButton).toHaveAttribute("aria-selected", "true");
      expect(await forcedLtrWithArabic(page), `forced ltr under ${tab}`).toEqual([]);
    }
  });
});

/**
 * A dialog's footer never lands on its last field.
 *
 * The scrolling body needs `min-h-0 flex-1`; without them it sizes to its
 * content instead of to the space left over, and the sticky footer sits on top
 * of the last field — which on Add company is Notes, and on a phone is most of
 * the form. Reported as "the Save bar covers Email".
 *
 * Measured on a short window, scrolled to the bottom: the dialog is capped at a
 * fraction of the viewport height, so a short window is what makes the body
 * scroll and puts the footer over the end of the form.
 */
test("a dialog's footer never covers its last field", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  // Both shapes the same dialog takes: the desktop dialog on a window too short
  // to hold the form, and the bottom sheet a phone gets, which has a layout of
  // its own (ResponsiveDialog).
  const sizes = [
    { width: 1366, height: 600, what: "a short desktop window" },
    { width: 375, height: 667, what: "a phone" },
  ];

  for (const size of sizes) {
    await test.step(size.what, async () => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(`/${locale}/companies`);
      await page.getByRole("button", { name: t("forms.addCompany") }).first().click();

      const form = page.getByRole("dialog", { name: t("forms.addCompany") });
      await expect(form.getByLabel(t("common.company"))).toBeVisible();

      // The last field a person can actually reach — the form also carries
      // hidden inputs holding the ids behind the dropdowns.
      const last = form.locator("input, textarea").filter({ visible: true }).last();
      await last.scrollIntoViewIfNeeded();

      // `data-slot` is the kit's own name for the part, not a styling class — a
      // form's action bar has no role of its own to ask for.
      const footer = form.locator("[data-slot='form-footer']");
      await expect(footer).toBeVisible();

      const fieldBox = await last.boundingBox();
      const footerBox = await footer.boundingBox();
      const formBox = await form.boundingBox();
      expect(fieldBox, "the form has no fields").not.toBeNull();
      expect(footerBox, "the dialog has no footer").not.toBeNull();
      expect(formBox, "the dialog has no box").not.toBeNull();
      if (!fieldBox || !footerBox || !formBox) return;

      const overlap = Math.round(fieldBox.y + fieldBox.height - footerBox.y);
      expect(overlap, `the footer covers ${overlap}px of the last field`).toBeLessThanOrEqual(0);

      // And the footer is inside the dialog, not pushed past its end: that is
      // the other way the same broken layout showed up, with Save off screen.
      const below = Math.round(footerBox.y + footerBox.height - (formBox.y + formBox.height));
      expect(below, `the footer hangs ${below}px past the end of the dialog`).toBeLessThanOrEqual(1);

      await page.keyboard.press("Escape");
    });
  }
});

/**
 * Every date on a screen reads the same way round.
 *
 * `formatDay` builds one string, `04/Sep/2026` or `04/سبتمبر/2026`, and then
 * thirteen call sites each decided separately how to lay it out — two set
 * `dir="auto"`, two put it in the mono figure face, nine did nothing. A
 * screenshot pass found the follow-up date in a company drawer apparently
 * reading day-first while the picker under it read year-first, which is the
 * shape that mistake takes when it is real.
 *
 * A date is a bidi paragraph of its own, so the test cannot read the DOM for
 * this: the text is identical either way round. It measures instead — a range
 * over the first digit and a range over the last, and which one is further
 * left. English reads day-first; Arabic takes the month name's direction and
 * reads day-first from the right, which is how an Arabic date is written.
 */
async function dateDirections(page: Page): Promise<string[]> {
  return page.locator("[data-slot='day']").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const text = node.textContent ?? "";
        const first = text.search(/\d/);
        const last = text.length - 1 - [...text].reverse().findIndex((c) => /\d/.test(c));
        if (first < 0 || last <= first) return null; // "—", or a one-digit date

        const at = (index: number) => {
          const range = document.createRange();
          range.setStart(node.firstChild as Node, index);
          range.setEnd(node.firstChild as Node, index + 1);
          return range.getBoundingClientRect();
        };
        const a = at(first);
        const b = at(last);
        if (a.width === 0 || b.width === 0) return null; // not rendered
        return a.left < b.left
          ? "day-first-from-the-left"
          : ("day-first-from-the-right" as string);
      })
      .filter((seen): seen is string => seen !== null),
  );
}

test("every date on a screen reads the same way round", async ({ page, locale }) => {
  await login(page, locale, "faisal");
  const expected = locale === "ar" ? "day-first-from-the-right" : "day-first-from-the-left";

  for (const screen of SCREENS) {
    await page.goto(`/${locale}/${screen}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const seen = await dateDirections(page);
    expect(new Set(seen).size, `/${locale}/${screen} shows ${seen.length} dates: ${seen}`)
      .toBeLessThanOrEqual(1);
    for (const one of seen) expect(one, `on /${locale}/${screen}`).toBe(expected);
  }

  await test.step("and in a drawer, where a date sits beside its picker", async () => {
    await page.goto(`/${locale}/companies`);
    await page.getByRole("table").first().getByRole("link").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible();

    const seen = await dateDirections(page);
    expect(seen.length, "the drawer shows no dates at all").toBeGreaterThan(0);
    for (const one of seen) expect(one, "in the company drawer").toBe(expected);
  });
});

/**
 * A value and the unit after it read the way the language does.
 *
 * The thicknesses list is the one place a number carries a word: "2.0 mm",
 * "2.0 مم". The two are built as one string, so they are one bidi paragraph
 * and the DOM says nothing about which way round they came out. Arabic writes
 * the number first and the unit after it, which on an RTL line means the digits
 * sit to the RIGHT of the word — the same shape as a date, and the same thing
 * three reviews in a row have called a defect while reading the pixels
 * left-to-right.
 *
 * Measured, therefore, not looked at.
 */
test("a value and the unit after it read the way the language does", async ({ page, locale }) => {
  await login(page, locale, "jerom");
  await page.goto(`/${locale}/admin/lookups?list=thicknesses`);
  await expect(page.getByRole("heading").first()).toBeVisible();

  const seen = await page.locator("[data-slot='lookup-name']").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const text = (node.textContent ?? "").trimEnd();
        const first = text.search(/\d/);
        const last = text.length - 1;
        if (first < 0 || last <= first || /\d/.test(text[last])) return null; // no unit on it

        const at = (index: number) => {
          const range = document.createRange();
          range.setStart(node.firstChild as Node, index);
          range.setEnd(node.firstChild as Node, index + 1);
          return range.getBoundingClientRect();
        };
        const digit = at(first);
        const unit = at(last);
        if (digit.width === 0 || unit.width === 0) return null;
        return digit.left < unit.left
          ? "number-first-from-the-left"
          : ("number-first-from-the-right" as string);
      })
      .filter((one): one is string => one !== null),
  );

  const expected = locale === "ar" ? "number-first-from-the-right" : "number-first-from-the-left";
  expect(seen.length, "no thickness carries a unit").toBeGreaterThan(0);
  for (const one of seen) expect(one, `on /${locale}/admin/lookups`).toBe(expected);
});

/**
 * The app's own labels are never cut off mid-word.
 *
 * A company name that does not fit gets an ellipsis and that is right — the
 * rep knows his own customers. A label Kladra wrote is different: "Search
 * companies, contacts, proje…" reads as a fault. The top bar's search button
 * carried the full sentence from 640px up while it only had room for it from
 * 1024, so at a tablet width it was cut in both languages.
 */
/** Everything on screen whose words the APP wrote, rather than a rep. */
const APP_LABELS = "[data-slot='search-label'], [data-slot='figure-label']";

async function cutOff(page: Page): Promise<string[]> {
  return page.locator(APP_LABELS).evaluateAll((nodes) =>
    nodes
      .filter((node) => (node as HTMLElement).offsetParent !== null)
      .filter((node) => node.scrollWidth > node.clientWidth + 1)
      .map((node) => (node.textContent ?? "").trim()),
  );
}

/**
 * A customer's name may be cut short; a word the app chose may not.
 *
 * This looked at one slot on one screen, and P8 put four narrow columns of
 * figures at the top of every drawer — where OPEN QUOTATIONS came out as "OPEN
 * QUOTATIO…" at every width, on the widest screen anybody uses. A label that
 * ends in an ellipsis has told the reader nothing, and "it fits in Arabic" is
 * not an answer. So the check follows the labels rather than the screen: both
 * slots, on the list and inside the drawer, at four widths.
 */
test("no label the app wrote is cut off mid-word", async ({ page, locale }) => {
  await login(page, locale, "faisal");

  // Opened by address rather than by pressing a row: on a phone the list is not
  // a table at all, it is a stack of cards, so a locator that reaches for one
  // finds nothing at 375 and waits until the test dies.
  const company = await one<{ id: string }>(
    `select c.id from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa' and c.archived_at is null
      order by c.name
      limit 1`,
  );

  for (const width of [1366, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 768 });

    await page.goto(`/${locale}/companies`);
    expect(await cutOff(page), `cut off on the list at ${width}px`).toEqual([]);

    // The drawer, where the band of figures is — and where the columns are
    // narrowest, because the panel is narrower than the page.
    await page.goto(`/${locale}/companies?open=${company.id}`);
    await expect(page.locator("[data-slot='standing']").first()).toBeVisible();
    expect(await cutOff(page), `cut off in the drawer at ${width}px`).toEqual([]);
  }
});

/**
 * Figures are Western digits, everywhere, in both languages (SPEC D6).
 *
 * Saudi business writes 1,234.50 and 480.00 m², not ١٢٣٤٫٥٠ — and every number
 * in this app comes from `Intl`, which decides by locale tag. It gives Western
 * digits for "ar" and Arabic-Indic for "ar-SA", so the whole rule rests on one
 * two-letter string in the routing config and would break silently the day
 * somebody made the tag more specific. Nothing on the screen would throw; the
 * money would simply stop being readable to the accounts department.
 *
 * The check is on the rendered page rather than on the config, because it also
 * catches the other way in: a digit typed into a message file by hand.
 */
const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;

test("every figure is in Western digits", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");

  for (const screen of [...SCREENS, "quotations"]) {
    await page.goto(`/${locale}/${screen}`);
    await expect(page.getByRole("heading").first()).toBeVisible();

    const wrong = await page.locator("body").evaluate((body) => {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      const found: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        if (/[٠-٩۰-۹]/.test(text)) found.push(text.trim());
      }
      return found;
    });
    expect(wrong, `Arabic-Indic digits on /${locale}/${screen}`).toEqual([]);
    expect(ARABIC_INDIC_DIGITS.test(wrong.join(""))).toBe(false);
  }

  await test.step("including the calendar, which brings its own locale with it", async () => {
    // The picker is handed react-day-picker's Arabic locale so a screen reader
    // hears Arabic instead of "Go to the Previous Month" — and a locale is
    // exactly the thing that could put ٠٤ in the day grid. Thirty-odd numbered
    // buttons, checked as rendered.
    await page.goto(`/${locale}/companies`);
    await page.getByRole("table").first().getByRole("link").first().click();
    await expect(page.getByRole("dialog").first()).toBeVisible();
    // The picker is the one control in the group the follow-up label names.
    await page
      .getByRole("group", { name: t("common.nextFollowUp") })
      .getByRole("button")
      .first()
      .click();

    const grid = page.getByRole("grid").first();
    await expect(grid).toBeVisible();
    const days = (await grid.getByRole("gridcell").allInnerTexts()).join("");
    expect(days.length, "the calendar rendered no days at all").toBeGreaterThan(0);
    expect(ARABIC_INDIC_DIGITS.test(days), `calendar days: ${days}`).toBe(false);

    // And what a screen reader hears. Every visible string in the calendar was
    // already Arabic while its accessible names said "Go to the Previous Month"
    // and "Sunday, August 30th, 2026" — a leak with no pixels to give it away.
    const names = await grid
      .page()
      .locator("[aria-label]")
      .filter({ visible: true })
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));
    const calendarNames = names.filter((name) => /2026/.test(name) || /month/i.test(name));
    expect(calendarNames.length, "the calendar has no accessible names at all").toBeGreaterThan(0);
    if (locale === "ar") {
      for (const name of calendarNames) {
        expect(name, "an English accessible name on the Arabic calendar").toMatch(
          /[؀-ۿ]/,
        );
      }
    }
  });
});
