import type { Locator } from "@playwright/test";
import { login } from "./helpers/auth";
import { one } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { PHONE_MAX_PX } from "@/lib/breakpoint";

/**
 * P11H — a rep with one hand free at 375 (DESIGN §2: on a phone the sidebar is
 * a bottom bar and dialogs are bottom sheets; the thumb reaches the bottom).
 *
 * Four rules, each in DESIGN §5: the line between a phone and everything else
 * is drawn once, and the shell and the forms change on it (D128); every form
 * is a bottom sheet with its primary action lowest (D129); what a thumb
 * presses is 44px (D130); and the four things a rep does standing up — log,
 * call, quote, read what came back — are walked at 375 and measured, not
 * eyeballed.
 */

const COLD = { timeout: 30_000 };
const PHONE = { width: 375, height: 812 };
/** Apple's and Android's own figure for a fingertip. */
const THUMB = 44;

type Company = { id: string; name: string };

/** One of Faisal's companies with a live project and somebody to call. */
async function companyToWorkOn(): Promise<Company> {
  return one<Company>(
    `select c.id, c.name
       from companies c
       join users u on u.id = c.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and c.archived_at is null
        and exists (
          select 1 from projects p
           where p.company_id = c.id and p.lost_at is null and p.archived_at is null)
        and exists (
          select 1 from contacts k
           where k.company_id = c.id and k.phone is not null and k.archived_at is null)
      order by c.created_at desc
      limit 1`,
  );
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect, "the control is not on the screen").not.toBeNull();
  return rect!;
}

test("the shell and the forms change on the same line", async ({ page, locale, t }) => {
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  const rail = page.locator("aside[data-collapsed]");
  const add = page.getByRole("button", { name: t("forms.addCompany") });
  const sheet = page.locator('[data-slot="drawer-content"]');
  const dialog = page.locator('[data-slot="dialog-content"]');

  await test.step(`at ${PHONE_MAX_PX} the shell is a phone, and so is the form`, async () => {
    await page.setViewportSize({ width: PHONE_MAX_PX, height: 900 });
    await expect(rail).toBeHidden();
    await add.click();
    await expect(sheet).toBeVisible(COLD);
    await expect(dialog).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  await test.step("one pixel wider, neither is", async () => {
    // The pixel that used to hold a bottom bar under a centred dialog (§5 #35).
    await page.setViewportSize({ width: PHONE_MAX_PX + 1, height: 900 });
    await expect(rail).toBeVisible();
    await add.click();
    await expect(dialog).toBeVisible(COLD);
    await expect(sheet).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});

test("log, project and quotation: a bottom sheet each, Save under the thumb, and the log is written", async ({
  page,
  locale,
  t,
}) => {
  await page.setViewportSize(PHONE);
  const company = await companyToWorkOn();
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);
  const actions = drawer.getByRole("group", { name: t("drawer.companyActions") });
  const sheet = page.locator('[data-slot="drawer-content"]');

  /** The form is a bottom sheet, and its primary button is the lowest thing in it. */
  async function underTheThumb(form: Locator, label = t("common.save")): Promise<Locator> {
    await expect(form).toBeVisible(COLD);
    await expect(sheet, "the form is not a bottom sheet").toHaveCount(1);
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
    const save = form.getByRole("button", { name: label });
    const cancel = form.getByRole("button", { name: t("common.cancel") });
    // Measured at rest: the sheet slides up from below the screen, and a box
    // taken mid-slide is a box below the fold.
    await expect(save, "Save is below the fold").toBeInViewport({ ratio: 1, ...COLD });
    const [s, c] = await Promise.all([box(save), box(cancel)]);
    expect(s.y, "Save is not the lowest button").toBeGreaterThanOrEqual(c.y);
    expect(s.y + s.height, "Save is below the fold").toBeLessThanOrEqual(PHONE.height + 1);
    expect(s.height, "Save is shorter than a thumb").toBeGreaterThanOrEqual(THUMB);
    return save;
  }

  await test.step("1 · log what happened, and it is logged", async () => {
    await actions.getByRole("button", { name: t("common.log"), exact: true }).click();
    const form = page.getByRole("dialog", { name: t("drawer.logTitle") });
    const save = await underTheThumb(form);
    // Not a word the toast uses: on a repeat the last run's sentence is in the
    // history below, and "Logged" would match it too.
    const written = `With one thumb ${Date.now()}`;
    await form.getByLabel(t("drawer.whatHappened")).fill(written);
    await save.click();
    await expect(page.getByText(t("drawer.logged"), { exact: true })).toBeVisible(COLD);
    await expect(form).toBeHidden();
    await expect(drawer.getByText(written)).toBeVisible(COLD);
  });

  await test.step("2 · a new project is a sheet too", async () => {
    await actions.getByRole("button", { name: t("drawer.newProject") }).click();
    const form = page.getByRole("dialog", {
      name: t("projects.newProjectIn", { company: company.name }),
    });
    await underTheThumb(form);
    await form.getByRole("button", { name: t("common.cancel") }).click();
    await expect(form).toBeHidden();
  });

  await test.step("3 · a quotation is asked for from the Quotations tab, Save in reach", async () => {
    await drawer.getByRole("tab", { name: t("common.quotations") }).click();
    await drawer.getByRole("button", { name: t("quotations.request") }).first().click();
    await expect(sheet.getByLabel(t("common.colourCode")).first()).toBeVisible(COLD);
    // Nine fields a line and the totals under them: the body scrolls, the
    // footer does not, and Save is on the screen before anything is typed.
    await underTheThumb(sheet);
    await sheet.getByRole("button", { name: t("common.cancel") }).click();
    await expect(sheet).toBeHidden();
  });
});

test("what a thumb presses on the day screen is a thumb wide", async ({ page, locale, t }) => {
  await page.setViewportSize(PHONE);
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/day`);

  // A call card with somebody to call: Log, the number, the handset (D98). Each
  // sits above the card's own stretched link, and each is the size of the
  // finger that presses it, so a rushed thumb does not open the drawer
  // instead (§5 #27).
  const card = page.locator('[data-slot="call-band"] li:has(a[href^="tel:"])').first();
  await expect(card).toBeVisible(COLD);
  const controls: [string, Locator][] = [
    ["Log", card.getByRole("button").first()],
    ["the number", card.locator('a[href^="https://wa.me/"]')],
    ["the handset", card.locator('a[href^="tel:"]')],
  ];
  for (const [what, control] of controls) {
    const rect = await box(control);
    expect(rect.height, `${what} is shorter than a thumb`).toBeGreaterThanOrEqual(THUMB);
    expect(rect.width, `${what} is narrower than a thumb`).toBeGreaterThanOrEqual(THUMB);
  }

  // The bar is the shell on a phone; every door in it is a thumb tall.
  const bar = page.getByRole("navigation", { name: t("shell.mainNav") });
  const doors = await bar.getByRole("link").all();
  expect(doors.length).toBeGreaterThan(0);
  for (const door of doors) {
    expect((await box(door)).height).toBeGreaterThanOrEqual(THUMB);
  }
});

test("what came back is read before the calls, whole, on a phone", async ({ page, locale, t }) => {
  await page.setViewportSize(PHONE);
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/day`);

  const heading = page.getByRole("heading", { name: t("day.waitingOnYou") });
  await expect(heading).toBeVisible(COLD);
  const section = heading.locator("xpath=ancestor::section[1]");
  const calls = page.locator('[data-slot="call-band"]').first();
  expect((await box(section)).y, "the calls come before what came back").toBeLessThan(
    (await box(calls)).y,
  );

  const rows = section.locator("ul > li > a");
  expect(await rows.count(), "the seed left Faisal nothing waiting").toBeGreaterThan(0);
  for (const row of await rows.all()) {
    expect((await box(row)).height).toBeGreaterThanOrEqual(THUMB);
  }
  // A row is a card the width of the screen: her reason wraps inside it and
  // nothing runs past its edge.
  const clipped = await rows.evaluateAll((nodes) =>
    nodes.filter((node) => node.scrollWidth > node.clientWidth + 1).length,
  );
  expect(clipped, "a waiting row is wider than the screen").toBe(0);
});
