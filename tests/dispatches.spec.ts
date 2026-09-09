import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { pickFirst, pressChip } from "./helpers/pick";
import { dispatchLabel } from "@/lib/labels";

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

/**
 * The state, read where the state is said.
 *
 * Not `getByText`: since D143 the trail under it names the event that produced
 * the state, and in both languages that is the same word — an approved
 * dispatch says "Approved" twice on one screen, and both are right. `[data-tone]`
 * is how the quotation chain's specs have read a state since P9.
 */
function statusOf(sheet: Locator): Locator {
  return sheet.locator("[data-tone]").first();
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

/** Where it is going and how it is paid for — answered for THIS load (§3). */
const DESTINATION = "Riyadh — King Fahd Road, site gate";

async function fillTheDetails(form: Locator, t: Translate) {
  await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
  await form.getByLabel(t("common.destination")).fill(DESTINATION);
  // Cash, on delivery: the choice and the answer it asks for (SPEC §3).
  await pressChip(form, t("dispatches.payment.cash"));
  await pressChip(form, t("dispatches.payment.onDelivery"));
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
  return one<{ id: string; number: number; company: string }>(
    `select q.id, q.number, c.name as company
       from quotations q
       join companies c on c.id = q.company_id
      where c.rep_id = $1::uuid
        -- Either state goods may move against (DISPATCHABLE in
        -- src/lib/quotations.ts), and not issued alone: since P12-10 the first
        -- test in this file ANSWERS the quotation it sends against, so a
        -- fixture asking for an unanswered one would find none after it ran.
        -- No backticks in this comment: it is template-literal source, and one
        -- would close the template (rules/data.md).
        and q.status in ('issued', 'accepted')
        and not exists (
          select 1 from quotations later
           where later.number = q.number and later.revision > q.revision
        )
        -- And with a line that has room for a PART-send, which is what the
        -- first walk in this file needs and one more than the app's own picker
        -- asks (dispatchableQuotationOptions asks for one). Once accepted
        -- quotations are candidates the oldest of them is a delivered job from
        -- the months behind us with every panel already sent, and after two
        -- locale runs against one seeded database the survivors are thin.
        and exists (
          select 1 from quotation_items qi
           where qi.quotation_id = q.id
             and qi.qty > 1 + (
               select coalesce(sum(di.qty), 0)
                 from dispatch_items di
                 join dispatches d on d.id = di.dispatch_id
                where di.quotation_item_id = qi.id
                  and d.status in ('submitted', 'approved')
             )
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
  // The first line with room on it, not the first line. The fixture asks for a
  // quotation with SOMETHING left on it, which is the question the app's own
  // picker asks, and the room can be on the second line: a paper whose first
  // line has gone out entirely is ordinary, and after two locale runs against
  // one seeded database it is what is left (playwright.config.ts).
  const index = lines.findIndex((line) => line.remaining > 1);
  expect(index, "no line of the chosen quotation has room for a part-send").toBeGreaterThanOrEqual(
    0,
  );
  const first = lines[index];

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

    const box = form.getByLabel(t("dispatches.sending")).nth(index);
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

  await test.step("1a · and the quotation behind it now says the customer accepted", async () => {
    // "A dispatch implies the customer accepted that quotation" (SPEC §3):
    // sending goods against a price is the answer, and the rep is not asked to
    // record a second, weaker one afterwards.
    const row = await one<{ status: string; decided: string | null }>(
      "select status, decided_at::text as decided from quotations where id = $1::uuid",
      [quotation.id],
    );
    expect(row.status, "the quotation was left waiting on an answer it has").toBe("accepted");
    expect(row.decided, "accepted with no day on it (quotations_decided_check)").not.toBeNull();

    // One audit row, saying who and when — the trail the drawer prints (D143).
    const trail = await query<{ id: string }>(
      `select id from audit_log
        where action = 'quotation.accepted' and record_id = $1::text`,
      [quotation.id],
    );
    expect(trail, "the implied acceptance left no trail").toHaveLength(1);

    // And the screen agrees: the drawer that offered "Customer accepted" does
    // not offer it any more, because there is nothing left to record.
    await page.goto(`/${locale}/quotations?open=${quotation.id}`);
    const drawer = page.getByRole("dialog", { name: `Q-${quotation.number}` });
    await expect(drawer.getByText(t("quotations.statusAccepted"), { exact: true })).toBeVisible(
      COLD,
    );
    await expect(drawer.getByRole("button", { name: t("quotations.accepted") })).toHaveCount(0);
    await page.keyboard.press("Escape");
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
    // Her check: how many are going, against how many the quotation asked for,
    // what other dispatches already hold, and what is left once this one is
    // counted (D112) — the line's own arithmetic, not the mini list's.
    await expect(sheet.getByText(t("dispatches.quoted")).first()).toBeVisible();
    await expect(sheet.getByText(String(first.qty), { exact: true }).first()).toBeVisible();
    await expect(sheet.locator('[data-slot="figure-elsewhere"]').first()).toHaveText(
      String(first.qty - first.remaining),
    );
    await expect(sheet.locator('[data-slot="figure-left-after"]').first()).toHaveText(
      String(first.remaining - sending),
    );

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
      t("notifications.dispatchApproved", {
        label,
        company: quotation.company,
        smacNumber: smacNumber(locale),
      }),
    );
    await expect(notice).toBeVisible(COLD);
    await notice.click();
    await expect(page).toHaveURL(new RegExp(`/dispatches\\?open=${dispatchId}`), COLD);

    const sheet = sheetFor(page, label);
    await expect(statusOf(sheet)).toHaveText(t("dispatches.statusApproved"));
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

    // That line's remaining count sits under "Left to send" on its own card.
    const left = form
      .getByText(t("dispatches.remaining"))
      .nth(index)
      .locator("xpath=..")
      .getByText(String(first.remaining - sending), { exact: true });
    await expect(left).toBeVisible();

    // And NOTHING is carried forward from the one before it (SPEC §3, which
    // overrules D81): not the site, not how it is paid for, not the quantity.
    // The form used to open on the last dispatch's answers on the argument that
    // they belong to the job; the founder's rule is flatter than the argument.
    await expect(form.getByLabel(t("common.destination"))).toHaveValue("");
    await expect(form.getByLabel(t("common.paymentNote"))).toHaveValue("");
    for (const chip of await form.getByRole("radio").all()) {
      await expect(chip).not.toBeChecked();
    }
    for (const box of await form.getByLabel(t("dispatches.sending")).all()) {
      await expect(box).toHaveValue("");
    }

    // The one answer that does come from somewhere is the store, and it comes
    // from the QUOTATION rather than from the dispatch before it: a child
    // reading its own parent is not one record prefilling the next (D159).
    await expect(form.getByRole("combobox", { name: t("common.warehouse") })).not.toHaveText(
      t("forms.choose"),
    );

    await page.keyboard.press("Escape");
  });
});

/**
 * How a load is paid for is a choice, and two of the four owe finance a
 * sentence (SPEC §3, P12-10).
 *
 * The founder's rule has three halves and this walks all of them: the choice is
 * four chips rather than a box to type in; the second question is asked only
 * where it exists, in the words of the choice it belongs to; and credit and
 * tasaheel are refused until the rep says what was agreed, because finance
 * reviews those and cannot review a blank.
 */
test("credit is refused until the rep says what was agreed, and the desk reads it", async ({
  page,
  locale,
  t,
}) => {
  test.slow();
  const quotation = await issuedQuotation();
  const lines = await linesOf(quotation.id);
  const index = lines.findIndex((line) => line.remaining >= 1);
  expect(index, "nothing is left to send on this quotation").toBeGreaterThanOrEqual(0);
  const note = "دفعة أولى 30% والباقي على ثلاث دفعات — معتمد من المالية";

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations?open=${quotation.id}`);

  const drawer = page.getByRole("dialog", { name: `Q-${quotation.number}` });
  await drawer.getByRole("button", { name: t("dispatches.request") }).click();
  const form = page.getByRole("dialog", {
    name: t("dispatches.requestFor", { label: `Q-${quotation.number}` }),
  });
  await expect(form.getByLabel(t("dispatches.sending")).first()).toBeVisible(COLD);
  await form.getByLabel(t("dispatches.sending")).nth(index).fill("1");
  await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
  await form.getByLabel(t("common.destination")).fill(DESTINATION);

  await test.step("a transfer asks how much; cash asks when; credit asks neither", async () => {
    await pressChip(form, t("dispatches.payment.bankTransfer"));
    await expect(form.getByRole("radio", { name: t("dispatches.payment.fullAmount") })).toBeVisible();
    await expect(
      form.getByRole("radio", { name: t("dispatches.payment.onDelivery") }),
    ).toHaveCount(0);

    await pressChip(form, t("dispatches.payment.cash"));
    await expect(form.getByRole("radio", { name: t("dispatches.payment.onDelivery") })).toBeVisible();
    await expect(form.getByRole("radio", { name: t("dispatches.payment.fullAmount") })).toHaveCount(0);

    // And the second question is asked in the words of the answer it belongs
    // to: an amount for a transfer, a moment for cash.
    await pressChip(form, t("dispatches.payment.bankTransfer"));
    await expect(form.getByText(t("dispatches.payment.amount"))).toBeVisible();
    await pressChip(form, t("dispatches.payment.cash"));
    await expect(form.getByText(t("dispatches.payment.when"))).toBeVisible();

    await pressChip(form, t("dispatches.payment.credit"));
    await expect(form.getByRole("radio", { name: t("dispatches.payment.onDelivery") })).toHaveCount(0);
    // It says why it is not optional, in the founder's own reason.
    await expect(form.getByText(t("dispatches.payment.noteRequired"))).toBeVisible();
  });

  await test.step("saved with nothing written, it is refused at the field", async () => {
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(form.getByText(t("dispatches.payment.noteRequired")).last()).toBeVisible(COLD);
    // Refused, not saved: the form is still open on the answers he gave.
    await expect(form).toBeVisible();
  });

  await test.step("with the words, it goes, and the drawer reads them back", async () => {
    await form.getByLabel(t("common.paymentNote")).fill(note);
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);

    const id = new URL(page.url()).searchParams.get("open") ?? "";
    const row = await one<{ terms: string; detail: string | null; note: string | null }>(
      `select payment_terms as terms, payment_detail as detail, payment_note as note
         from dispatches where id = $1::uuid`,
      [id],
    );
    expect(row.terms).toBe("credit");
    expect(row.detail, "credit was given an answer to a question it does not ask").toBeNull();
    expect(row.note).toBe(note);

    const sheet = page.getByRole("dialog").filter({ hasText: t("common.paymentTerms") }).first();
    await expect(sheet.getByText(t("dispatches.payment.credit"), { exact: true })).toBeVisible(
      COLD,
    );
    await expect(sheet.getByText(note)).toBeVisible();
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
  // The first line with room on it, not the first line: a quotation that has
  // been partly sent already has boxes the form disables, and a walk that types
  // into a disabled box proves nothing about the rule it was written for.
  const index = lines.findIndex((line) => line.remaining >= 1);
  expect(index, "nothing is left to send on this quotation").toBeGreaterThanOrEqual(0);
  const tooMany = lines[index].remaining + 1;

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations?open=${quotation.id}`);

  const quotationLabel = `Q-${quotation.number}`;
  const drawer = page.getByRole("dialog", { name: quotationLabel });
  await expect(drawer).toBeVisible(COLD);
  await drawer.getByRole("button", { name: t("dispatches.request") }).click();

  const form = page.getByRole("dialog", {
    name: t("dispatches.requestFor", { label: quotationLabel }),
  });
  const box = form.getByLabel(t("dispatches.sending")).nth(index);
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

/**
 * The desk's other answer to a request: not approved, refused with a reason
 * (SPEC D37, S39). The seed already carries one refused dispatch (d4) so
 * Faisal's day is never empty on this row (D99) — this walk refuses a
 * DIFFERENT one, the seed's still-submitted d3, so the seeded row and the
 * one this test makes are never confused for each other in the assertions
 * or in the cleanup.
 *
 * Refusing gives the quantities back and ends the request the way approving
 * does (D79): it leaves Rawan's queue, and it lands on Faisal's day under
 * "Waiting on you" carrying her words, exactly like a sent-back quotation.
 */
/**
 * The coordinator's own "answered today" figure, read off her queue.
 *
 * The label and the number are a `dt`/`dd` pair in one tile of the standing
 * strip (`src/components/ui-ext/standing-strip.tsx`), so the number is found
 * through the word above it rather than by position — a strip that gains a
 * figure would otherwise silently move this one.
 */
function answeredToday(page: Page, t: Translate): Locator {
  return page
    .locator('dt[data-slot="figure-label"]', { hasText: t("queue.answeredToday") })
    .locator("xpath=following-sibling::dd[1]");
}

test("the desk refuses a dispatch with a reason, and the rep reads it on his day", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Two sign-ins and a dialog.

  const start = new Date();
  // Read off her screen after she refuses, and read again after he has fixed
  // it. What she did this morning is not the rep's to undo (§5 #185).
  let answered = 0;
  const dispatch = await one<{ id: string; number: number }>(
    `select id, number from dispatches where status = 'submitted' order by created_at limit 1`,
  );
  const label = dispatchLabel(dispatch.number);
  const reason = "The shipment method quoted is not what SMAC has on file for this job.";

  try {
    await test.step("Rawan refuses the submitted dispatch, with a reason", async () => {
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/queue?dispatch=${dispatch.id}`);

      const sheet = sheetFor(page, label);
      await expect(sheet).toBeVisible(COLD);

      await sheet.getByRole("button", { name: t("dispatches.refuse") }).click();
      const ask = page.getByRole("dialog", { name: t("dispatches.refuseTitle", { label }) });
      await ask.getByLabel(t("common.reason")).fill(reason);
      await ask.getByRole("button", { name: t("dispatches.refuse") }).click();

      await expect(page.getByText(t("dispatches.refused", { label }))).toBeVisible(COLD);

      // Answered, so it is off her queue (D79) — read fresh, not live: this is
      // the same user who just acted, not the second-context check further up.
      await page.goto(`/${locale}/queue`);
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);

      answered = Number(await answeredToday(page, t).innerText());
      expect(answered, "the refusal she just made is not in her own figure").toBeGreaterThan(0);
    });

    await test.step("the row and one audit row carry the refusal", async () => {
      const row = await one<{ status: string; refuse_reason: string | null }>(
        "select status, refuse_reason from dispatches where id = $1::uuid",
        [dispatch.id],
      );
      expect(row.status).toBe("refused");
      expect(row.refuse_reason).toBe(reason);

      // record_id is text (rules/data.md) — cast the dispatch's uuid to match.
      const audit = await query(
        `select id from audit_log
          where action = 'dispatch.refuse' and record_id = $1::text and at >= $2::timestamptz`,
        [dispatch.id, start.toISOString()],
      );
      expect(audit, "expected exactly one dispatch.refuse audit row for this dispatch").toHaveLength(1);
    });

    await test.step("Faisal reads it under Waiting on you, in her words", async () => {
      await login(page, locale, "faisal");
      await page.goto(`/${locale}/day`);

      await expect(page.getByRole("heading", { name: t("day.waitingOnYou") })).toBeVisible(COLD);

      const labelText = labelOnScreen(page, label);
      await expect(labelText).toBeVisible(COLD);
      const card = labelText.locator("xpath=ancestor::li[1]");
      await expect(card.getByText(t("day.refused"), { exact: true })).toBeVisible();
      await expect(card.getByText(reason)).toBeVisible();
    });

    await test.step("he corrects it and sends it again, as the same request", async () => {
      // A refusal is the dispatch chain's send-back (SPEC §3, P12-10): he
      // answers it from the record itself, not by typing a new one from
      // nothing — which is the only other way now that §3 forbids carrying
      // anything forward.
      await page.goto(`/${locale}/dispatches?open=${dispatch.id}`);
      const sheet = sheetFor(page, label);
      await expect(sheet).toBeVisible(COLD);
      // Twice on this screen: the panel that says why it came back, and the
      // trail underneath it (D143). The panel is the first.
      await expect(sheet.getByText(reason).first()).toBeVisible();

      await sheet.getByRole("button", { name: t("dispatches.editRequest") }).click();
      const form = page.getByRole("dialog", { name: t("dispatches.editRequest") });
      await expect(form.getByLabel(t("dispatches.sending")).first()).toBeVisible(COLD);
      await form.getByRole("button", { name: t("common.save") }).click();
      await expect(page.getByText(t("dispatches.updated"))).toBeVisible(COLD);

      // Back on her desk as the same number, and her words are off the row:
      // a reason lives exactly as long as the state it explains (D72).
      const row = await one<{ status: string; reason: string | null }>(
        "select status, refuse_reason as reason from dispatches where id = $1::uuid",
        [dispatch.id],
      );
      expect(row.status).toBe("submitted");
      expect(row.reason, "the refusal outlived the state it explained").toBeNull();

      // The trail keeps the whole story, which is where a reason belongs once
      // the row has moved on (D143).
      const trail = await query<{ action: string }>(
        `select action from audit_log
          where record_type = 'dispatch' and record_id = $1::text and at >= $2::timestamptz
          order by at`,
        [dispatch.id, start.toISOString()],
      );
      expect(trail.map((line) => line.action)).toEqual(["dispatch.refuse", "dispatch.update"]);

      // And the notice she raised is cleared by the WORK, not by his reading it
      // (D79): the row he fixed is not still bold in his bell.
      const bell = await query<{ kind: string }>(
        `select kind from notifications
          where subject_type = 'dispatch' and subject_id = $1::uuid
            and created_at >= $2::timestamptz`,
        [dispatch.id, start.toISOString()],
      );
      expect(bell.map((row) => row.kind)).toEqual(["dispatchRequested"]);
    });

    await test.step("her figure still counts the refusal she made this morning", async () => {
      // It counted the STATES the rows were in — dispatches in
      // ('approved','refused'), updated today — so the moment he fixed this
      // one her own number went down, hours after she had done the work. It
      // reads the audit log now, where the event is (§5 #185).
      await login(page, locale, "rawan");
      await page.goto(`/${locale}/queue`);
      await expect(answeredToday(page, t)).toHaveText(String(answered), COLD);
    });
  } finally {
    await query(
      `update dispatches
          set status = 'submitted', refuse_reason = null, updated_at = now()
        where id = $1::uuid`,
      [dispatch.id],
    );
    await query(
      `delete from audit_log
        where action = 'dispatch.refuse' and record_id = $1::text and at >= $2::timestamptz`,
      [dispatch.id, start.toISOString()],
    );
    await query(
      `delete from notifications
        where subject_type = 'dispatch' and subject_id = $1::uuid and created_at >= $2::timestamptz`,
      [dispatch.id, start.toISOString()],
    );
  }
});
