import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";

/**
 * P5 — the dispatch chain, end to end (WORKFLOW §3, Rawan-2).
 *
 * Faisal opens an issued quotation and sends part of it: cladding is taken in
 * stages, so a dispatch is normally a slice of the paper rather than all of it
 * (S37). Rawan's queue shows it arrive; she checks it against the quotation and
 * approves it with SMAC's dispatch number, which is the event the whole month
 * rests on (S41, S43).
 *
 * Then the part that only a test will ever check carefully: what is left on
 * each line afterwards. The rule is that a request cannot ask for more than the
 * quotation has left, counting requests still waiting on her desk (D12), and it
 * is enforced in two places — the dialog, so a rep is not asked to guess, and
 * the transaction, because between opening a dialog and pressing Save somebody
 * else can spend the same panels.
 */

/** Enough of the first line to leave some behind, so "left to send" moves. */
const AT_MOST = 30;

/**
 * SMAC's number for the dispatch, and it carries the locale.
 *
 * Both locale projects run against ONE seeded database (playwright.config.ts),
 * and from P9 the same SMAC number cannot be typed twice — it is the only link
 * to the system that holds the money, so a unique index refuses the second
 * (D53). A fixed fixture here meant the English run typed it first and the
 * Arabic run was refused by Postgres, three assertions later and nowhere near
 * the cause. This is the same rule the company names in tests/rep.spec.ts
 * already follow.
 */
function smacNumber(locale: Locale): string {
  return locale === "en" ? "8810" : "8811";
}

/** A number as the screen shows it, read back. Thousands separators go. */
async function figure(scope: Locator, slot: string): Promise<number> {
  const text = await scope.locator(`[data-slot='${slot}']`).first().innerText();
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  expect(match, `no number in ${slot}: "${text}"`).not.toBeNull();
  return Number(match?.[0]);
}

/** The dispatch drawer, which is named by the dispatch itself (D-3). */
function sheetFor(page: Page, label: string): Locator {
  return page.getByRole("dialog", { name: label });
}

/** The label where it is actually on screen — every list renders twice. */
function labelOnScreen(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).filter({ visible: true }).first();
}

/** Toasts and first navigations, with room for a cold Turbopack route. */
const COLD = { timeout: 30_000 };

/** The dispatch's own name, once the drawer holding it has loaded. */
async function nameOfTheOpenDispatch(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^D-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

/** Fills the shipment, destination and terms every request needs. */
/** Where it is going and how it is paid for — the job's, not this dispatch's. */
const DESTINATION = "Riyadh — King Fahd Road, site gate";
const TERMS = "50% advance, balance on delivery";

async function fillTheDetails(form: Locator, t: Translate) {
  await form.getByRole("combobox", { name: t("common.shipment") }).click();
  await form.page().getByRole("option").first().click();
  await form.getByLabel(t("common.destination")).fill(DESTINATION);
  await form.getByLabel(t("common.paymentTerms")).fill(TERMS);
}

/**
 * An issued quotation of Faisal's that is still the live revision.
 *
 * Not "one with nothing sent against it": the first test in this file sends
 * something, so the second would find none. What is left is read per line
 * instead, which is what the rule is about anyway (D12).
 */
async function issuedQuotation() {
  const faisal = await userId("faisal@technopanel.com.sa");
  return one<{ id: string; number: number }>(
    `select q.id, q.number
       from quotations q
       join companies c on c.id = q.company_id
      where c.rep_id = $1::uuid
        and q.status = 'issued'
        and not exists (
          select 1 from quotations later
           where later.number = q.number and later.revision > q.revision
        )
      order by q.created_at
      limit 1`,
    [faisal],
  );
}

type Line = {
  id: string;
  position: number;
  qty: number;
  width: string;
  length: string;
  /** Quoted minus everything on a submitted or approved dispatch (D12). */
  remaining: number;
};

/**
 * The lines of a quotation with what is left on each — read the same way the
 * app reads it, so the test is checking the screen against the database rather
 * than against an assumption about the seed.
 */
async function linesOf(quotationId: string): Promise<Line[]> {
  const rows = await query<Omit<Line, "remaining"> & { remaining: string }>(
    `select qi.id, qi.position, qi.qty,
            qi.width::text as width, qi.length::text as length,
            (qi.qty - (
               select coalesce(sum(di.qty), 0)
                 from dispatch_items di
                 join dispatches d on d.id = di.dispatch_id
                where di.quotation_item_id = qi.id
                  and d.status in ('submitted', 'approved')
             ))::text as remaining
       from quotation_items qi
      where qi.quotation_id = $1::uuid
      order by qi.position`,
    [quotationId],
  );
  return rows.map((row) => ({ ...row, remaining: Number(row.remaining) }));
}

/** m² of a quantity on one line, rounded once, the way the app rounds it. */
function sqmOf(line: Line, qty: number): number {
  return Math.round(Number(line.width) * Number(line.length) * qty * 100) / 100;
}

test("the dispatch chain: request part of a quotation, the queue, approval, and what is left", async ({
  page,
  browser,
  locale,
  t,
}) => {
  test.slow(); // Four sign-ins and three dialogs.

  const quotation = await issuedQuotation();
  const lines = await linesOf(quotation.id);
  expect(lines.length, "the seeded quotation has no lines").toBeGreaterThan(0);
  const first = lines[0];
  expect(first.remaining, "the first line has nothing left to send").toBeGreaterThan(1);

  // Part of it, never all of it: the point of the walk is that some is left.
  const sending = Math.min(AT_MOST, first.remaining - 1);
  const expectedSqm = sqmOf(first, sending);
  let dispatchId = "";
  let label = "";

  // Rawan's queue, open in her own browser and never reloaded from here on.
  const rawanContext = await browser.newContext();
  const rawan = await rawanContext.newPage();
  const rawanId = await userId("rawan@technopanel.com.sa");
  const unreadBefore = Number(
    (
      await one<{ unread: string }>(
        "select count(*)::text as unread from notifications where user_id = $1::uuid and read_at is null",
        [rawanId],
      )
    ).unread,
  );

  await test.step("0 · Rawan is watching her queue", async () => {
    await login(rawan, locale, "rawan");
    await rawan.goto(`/${locale}/queue`);
    await rawan.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  });

  await test.step("1 · Faisal sends part of an issued quotation", async () => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/quotations?open=${quotation.id}`);

    const quotationLabel = `Q-${quotation.number}`;
    const drawer = page.getByRole("dialog", { name: quotationLabel });
    await expect(drawer).toBeVisible(COLD);

    await drawer.getByRole("button", { name: t("dispatches.request") }).click();
    const form = page.getByRole("dialog", {
      name: t("dispatches.requestFor", { label: quotationLabel }),
    });

    // Every line says what is left on it, which is the one figure a rep cannot
    // work out for himself.
    const remaining = form.getByText(t("dispatches.remaining")).first();
    await expect(remaining).toBeVisible(COLD);

    const box = form.getByLabel(t("dispatches.sending")).first();
    await box.fill(String(sending));

    // The m² appears as he types, on the same arithmetic the database will use.
    expect(await figure(form, "figure-sending")).toBe(expectedSqm);

    await fillTheDetails(form, t);
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
    await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
    dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(dispatchId).not.toBe("");

    label = await nameOfTheOpenDispatch(page);
    const sheet = sheetFor(page, label);
    await expect(sheet.getByText(t("dispatches.statusSubmitted"), { exact: true })).toBeVisible();
    // What SQL added up, against the same arithmetic as the live figure.
    expect(await figure(sheet, "figure-sending")).toBe(expectedSqm);
  });

  await test.step("2 · it reaches Rawan's queue and her bell without a reload", async () => {
    await expect(labelOnScreen(rawan, label)).toBeVisible(COLD);
    await expect(
      rawan.getByRole("link", { name: t("shell.unreadCount", { count: unreadBefore + 1 }) }),
    ).toBeVisible(COLD);
    await rawanContext.close();
  });

  await test.step("3 · Rawan opens it, sees what was quoted, and approves it", async () => {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue?dispatch=${dispatchId}`);

    const sheet = sheetFor(page, label);
    await expect(sheet).toBeVisible(COLD);
    // Her check: how many are going, against how many the quotation asked for.
    await expect(sheet.getByText(t("dispatches.quoted")).first()).toBeVisible();
    await expect(sheet.getByText(String(first.qty), { exact: true }).first()).toBeVisible();

    await sheet.getByRole("button", { name: t("dispatches.approve") }).click();
    const ask = page.getByRole("dialog", { name: t("dispatches.approveTitle", { label }) });
    await ask.getByLabel(t("common.smacDispatchNumber")).fill(smacNumber(locale));
    await ask.getByRole("button", { name: t("dispatches.approve") }).click();

    await expect(page.getByText(t("dispatches.approved", { label }))).toBeVisible(COLD);
  });

  await test.step("4 · Faisal is told, and it reads Approved with the number", async () => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/notifications`);

    const notice = page.getByText(
      t("notifications.dispatchApproved", { label, smacNumber: smacNumber(locale) }),
    );
    await expect(notice).toBeVisible(COLD);
    await notice.click();
    await expect(page).toHaveURL(new RegExp(`/dispatches\\?open=${dispatchId}`), COLD);

    const sheet = sheetFor(page, label);
    await expect(sheet.getByText(t("dispatches.statusApproved"), { exact: true })).toBeVisible();
    await expect(sheet.getByText(smacNumber(locale), { exact: true })).toBeVisible();
  });

  await test.step("5 · approval is what counts toward the month (S41, S43)", async () => {
    // Not the request and not the number: the row's own approved_at decides the
    // month, and the m² is width × length × the quantity SENT — never the
    // quotation line's own, which is the whole quoted amount.
    const row = await one<{ sqm: string }>(
      `select round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text as sqm
         from dispatches d
         join dispatch_items di on di.dispatch_id = d.id
         join quotation_items qi on qi.id = di.quotation_item_id
        where d.id = $1::uuid and d.status = 'approved'
          and date_trunc('month', (d.approved_at at time zone 'Asia/Riyadh')::date)
              = date_trunc('month', (now() at time zone 'Asia/Riyadh')::date)`,
      [dispatchId],
    );
    expect(Number(row.sqm)).toBe(expectedSqm);
  });

  await test.step("6 · the next one starts from this one, and knows what is left", async () => {
    await page.goto(`/${locale}/quotations?open=${quotation.id}`);
    const drawer = page.getByRole("dialog", { name: `Q-${quotation.number}` });
    await drawer.getByRole("button", { name: t("dispatches.request") }).click();

    const form = page.getByRole("dialog", {
      name: t("dispatches.requestFor", { label: `Q-${quotation.number}` }),
    });
    await expect(form.getByText(t("dispatches.remaining")).first()).toBeVisible(COLD);

    // The first line's remaining count sits under "Left to send" on its card.
    const left = form
      .getByText(t("dispatches.remaining"))
      .first()
      .locator("xpath=..")
      .getByText(String(first.remaining - sending), { exact: true });
    await expect(left).toBeVisible();

    // And it opens on the last one's site and terms (D81). A second dispatch
    // against a job goes to the same gate on the same terms, and both were
    // typed from nothing every time — the same complaint as the quotation line
    // one screen back (D74).
    await expect(form.getByLabel(t("common.destination"))).toHaveValue(DESTINATION);
    await expect(form.getByLabel(t("common.paymentTerms"))).toHaveValue(TERMS);

    // What is NOT carried is the quantity, which is the whole of what this
    // dispatch is: every box starts empty, however many the last one sent.
    for (const box of await form.getByLabel(t("dispatches.sending")).all()) {
      await expect(box).toHaveValue("");
    }

    await page.keyboard.press("Escape");
  });
});

/**
 * A request cannot ask for more than the quotation has left (D12).
 *
 * The dialog says so at the field the moment the number goes over, and the save
 * is refused in the app's own words — the two are separate enforcements and the
 * second one is the real one, because the first is only what is on screen.
 */
test("a request for more than the quotation has left is refused, in the app's words", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const quotation = await issuedQuotation();
  const lines = await linesOf(quotation.id);
  const first = lines[0];
  const tooMany = first.remaining + 1;

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations?open=${quotation.id}`);

  const quotationLabel = `Q-${quotation.number}`;
  const drawer = page.getByRole("dialog", { name: quotationLabel });
  await expect(drawer).toBeVisible(COLD);
  await drawer.getByRole("button", { name: t("dispatches.request") }).click();

  const form = page.getByRole("dialog", {
    name: t("dispatches.requestFor", { label: quotationLabel }),
  });
  const box = form.getByLabel(t("dispatches.sending")).first();
  await expect(box).toBeVisible(COLD);
  await box.fill(String(tooMany));

  // Said at the field, straight away, in the reader's language (DESIGN §5).
  await expect(form.getByText(t("dispatches.tooMuch")).first()).toBeVisible();
  await expect(box).toHaveAttribute("aria-invalid", "true");

  await fillTheDetails(form, t);
  await form.getByRole("button", { name: t("common.save") }).click();

  // And refused by the action, which is the enforcement that counts: nothing is
  // written, and the dialog stays open on what was typed.
  await expect(form.getByText(t("dispatches.tooMuch")).first()).toBeVisible(COLD);
  await expect(page).not.toHaveURL(/\/dispatches\?open=/);
});
