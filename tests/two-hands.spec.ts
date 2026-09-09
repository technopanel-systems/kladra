import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { pickFirst, pressChip } from "./helpers/pick";
import { quotationLabel } from "@/lib/labels";
import { quotationEvent } from "@/lib/quotation-events";

/**
 * P11A — two hands on one record (SPEC D85).
 *
 * Every transition in the quotation and dispatch chain used to check the
 * state it expected and then update by id alone: two readers, each seeing
 * "waiting", each writing an answer, the second silently overwriting the
 * first. `src/lib/hold.ts` fixes it — `holdQuotation` / `holdDispatch` run
 * `SELECT … FOR UPDATE` as the first statement of the transaction, and the
 * expected-state check runs again after the hold, so a second hand that acted
 * a moment earlier gets the sentence for the state the row is ACTUALLY in
 * rather than the one its own screen still shows.
 *
 * Three tests, three rows held:
 *
 *  1. Two tabs on the same coordinator's screen both try to issue the same
 *     waiting quotation, pressed together (D85 makes the winner exactly one of
 *     them, never both — never neither): the other is told, in the app's own
 *     words, that the request is not waiting any more (`quotations.notWaiting`).
 *     Both tabs are cut off from live updates first (`blockLiveChannel`): left
 *     connected, the loser's own live-sync refresh — carrying the WINNER's
 *     news back to this tab a moment later, since a coordinator watches every
 *     quotation — can land in the same React batch as the loser's own refusal
 *     and paint only the later one, which is a real race in the live-sync
 *     feature and not the transaction this test is about.
 *
 *  2. Two tabs both ask for every panel left on one line of the same
 *     quotation and press Save together. `holdQuotation` inside
 *     `requestDispatchAction` (src/actions/dispatches.ts) makes the second
 *     request's quantity check read the first request's committed quantity,
 *     not the stale number both tabs loaded — so exactly one dispatch is
 *     written and the other is refused (`dispatches.tooMuch`).
 *
 *  3. A dispatch is raised on an issued quotation, then that quotation is
 *     revised — which is a NEW row carrying the same number, one revision up
 *     (S34) — so the dispatch's own quotation row is no longer the live one.
 *     `isLiveRevision` (src/lib/hold.ts) is asked again at approval, after
 *     `holdDispatch`, and refuses with `dispatches.supersededQuotation`
 *     rather than approving m² against a price the customer no longer holds.
 */

/** Toasts and first navigations, with room for a cold Turbopack route. */
const COLD = { timeout: 30_000 };

/**
 * The quotation drawer, named by the quotation itself (Q-12) — exact, because
 * "Issue {label}" (`PromptDialog`'s own title) contains `label` as a
 * substring too, and this file is the first to need `sheetFor` while that
 * dialog can be open on the very same page (the refused tab keeps its own
 * ask dialog open, per PromptDialog's failure branch).
 */
function sheetFor(page: Page, label: string): Locator {
  return page.getByRole("dialog", { name: label, exact: true });
}

/** Where it is NOW — the tone-carrying badge under the quotation's name. */
function statusOf(sheet: Locator): Locator {
  return sheet.locator("[data-tone]").first();
}

/** The dispatch's own name, once the drawer holding it has loaded. */
async function nameOfTheOpenDispatch(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^D-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

/** A raw page (`context.newPage()`, `browser.newContext()`) has none of the
 * `page` fixture's wrapping (tests/helpers/i18n.ts): the live channel only
 * opens once React has taken the page over, so every such navigation waits
 * for the same mark the fixture waits for automatically. */
async function gotoAndHydrate(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
}

/** Where it is going and how it is paid for — any values the form accepts. */
const DESTINATION = "Riyadh — Al Olaya, warehouse gate";
const TERMS = "Net 30, per the framework agreement";

/** Fills the shipment, destination and terms every dispatch request needs. */
async function fillTheDetails(form: Locator, t: Translate): Promise<void> {
  await pickFirst(form.getByRole("combobox", { name: t("common.shipment") }));
  await form.getByLabel(t("common.destination")).fill(DESTINATION);
  // Credit, which is the one that makes the note mandatory (SPEC §3).
  await pressChip(form, t("dispatches.payment.credit"));
  await form.getByLabel(t("common.paymentNote")).fill(TERMS);
}

/**
 * Races two outcomes that are each proven by a Playwright `expect(...)` call
 * already in flight, and returns whichever settles first — swallowing the
 * loser's eventual timeout instead of leaving it an unhandled rejection.
 */
async function firstOf<A, B>(a: Promise<A>, b: Promise<B>): Promise<A | B> {
  return new Promise((resolve, reject) => {
    let settled = false;
    a.then((v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    }).catch((error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error as Error);
      }
    });
    b.then((v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    }).catch((error: unknown) => {
      if (!settled) {
        settled = true;
        reject(error as Error);
      }
    });
  });
}

/**
 * Waits for a dispatch request to land one way or the other, from two signals
 * that outlast the moment they arrive — never the toast, which `sonner`
 * dismisses after a few seconds and which two concurrent server round trips
 * can make come and go before either page is ever asked to look for it.
 *
 * The lasting pair: on success the dialog closes and the app navigates to the
 * new dispatch (`/dispatches?open=…`), a URL that does not revert itself; on
 * refusal the dialog stays open with `FormFooter`'s own sentence in it
 * (src/components/ui-ext/form-shell.tsx), which also stays until somebody
 * closes the dialog. D85 makes these the only two outcomes there are — never
 * both, never neither.
 */
async function settleDispatchRequest(
  page: Page,
  form: Locator,
  t: Translate,
): Promise<"success" | "tooMuch"> {
  return firstOf(
    expect(page)
      .toHaveURL(/\/dispatches\?open=/, COLD)
      .then(() => "success" as const),
    expect(form.getByText(t("dispatches.tooMuch")).first())
      .toBeVisible(COLD)
      .then(() => "tooMuch" as const),
  );
}

/**
 * The race for issuing a quotation, read from two signals that are each
 * specific to THIS page's own press and last for as long as the page does —
 * true here because `blockLiveChannel` has already cut this tab off from
 * news of the OTHER tab's press, so neither signal can be pre-empted by it.
 *
 * The winner's own drawer comes to show its own SMAC number once its action
 * answers (`myNumber`, not "Issued" in general — the badge alone cannot say
 * WHICH press wrote it, only that somebody did). The loser's `PromptDialog`
 * stays open with its own refusal sentence, because nothing here is left
 * to un-mount it from underneath.
 */
async function settleQuotationIssue(
  page: Page,
  ask: Locator,
  label: string,
  myNumber: string,
  t: Translate,
): Promise<"success" | "notWaiting"> {
  return firstOf(
    expect(sheetFor(page, label)).toContainText(myNumber, COLD).then(() => "success" as const),
    expect(ask.getByText(t("quotations.notWaiting")))
      .toBeVisible(COLD)
      .then(() => "notWaiting" as const),
  );
}

/**
 * Cuts a page off from live updates (`/api/events`, src/app/api/events/route.ts
 * — `LiveProvider`'s one `EventSource`), so a write on the OTHER tab cannot
 * reach this one mid-test.
 *
 * D85 is a transaction-level guarantee; the live channel is a separate
 * feature (DESIGN §2, "nobody refreshes") that happens to touch the exact
 * same screen this test presses on. Left connected, the two tabs' own
 * `router.refresh()` calls race the record's real state against a live
 * update carrying the SAME news a moment later, and the two can land in one
 * React batch that paints only the later one — confirmed by sampling the DOM
 * every 100ms: the loser's refusal sentence present at t=100ms, gone by
 * t=200ms, and on another run never painted at all, same code, same machine.
 * That is a real race in the app's live-sync design, not a bug in the
 * transaction it is not this test's job to hold still — so this test holds
 * IT still instead, by never letting the live channel open on either tab,
 * and reads each press's own answer off a screen nothing else is touching.
 */
async function blockLiveChannel(page: Page): Promise<void> {
  await page.route("**/api/events", (route) => route.abort());
}

/**
 * Every quotation this file has already spent, so the next query never picks
 * a row a previous test in here already turned into something else — tests
 * run in file order against one seeded database (playwright.config.ts).
 */
const usedQuotationIds: string[] = [];

type SpendableLine = {
  quotationId: string;
  number: number;
  revision: number;
  /** What the fixture found it in — an answer a dispatch implies is undone. */
  status: string;
  itemId: string;
  position: number;
  remaining: number;
};

/**
 * One of Faisal's quotations, in one of `statuses`, still the live revision,
 * carrying a line with at least one panel left on it (D12) — read the same
 * way the app reads "left to send" (src/lib/dispatches.ts, checkQuantities).
 *
 * `raisedByHim` narrows it to paper he RAISED, which is a different question
 * from whose customer it is: Revise, Accept and Reject are offered to the
 * quotation's own rep (`owner` in the drawer is `mayWrite(user, quotation.repId)`),
 * and a shared job puts another rep's quotation on his customer. A walk that
 * presses one of those three has to say so, or it picks a paper whose drawer
 * draws none of them and waits ninety seconds for a button.
 *
 * The status comes back with the row because it is now consumable: since
 * P12-10 raising a dispatch ANSWERS the quotation, so a walk that starts from
 * an unanswered one has to hand that back for the run after it.
 */
async function pickSpendableLine(
  faisalId: string,
  statuses: string[],
  exclude: string[],
  raisedByHim = false,
): Promise<SpendableLine> {
  const row = await one<{
    quotationId: string;
    number: number;
    revision: number;
    status: string;
    itemId: string;
    position: number;
    remaining: string;
  }>(
    `select q.id as "quotationId", q.number, q.revision, q.status::text as status,
            qi.id as "itemId", qi.position,
            (qi.qty - coalesce(committed.qty, 0))::text as remaining
       from quotations q
       join companies c on c.id = q.company_id
       join quotation_items qi on qi.quotation_id = q.id
       left join lateral (
         select sum(di.qty)::int as qty
           from dispatch_items di
           join dispatches d on d.id = di.dispatch_id
          where di.quotation_item_id = qi.id
            and d.status in ('submitted', 'approved')
       ) committed on true
      where c.rep_id = $1::uuid
        and q.status::text = any($2::text[])
        and not exists (
          select 1 from quotations later
           where later.number = q.number and later.revision > q.revision
        )
        and (qi.qty - coalesce(committed.qty, 0)) >= 1
        and q.id <> all($3::uuid[])
        ${raisedByHim ? "and q.rep_id = $1::uuid" : ""}
      order by q.created_at, qi.position
      limit 1`,
    [faisalId, statuses, exclude],
  );
  return { ...row, remaining: Number(row.remaining) };
}

/**
 * What a test wrote, it takes back. Both locale projects share one database
 * and every spec after this one — the Arabic dispatch chain most of all —
 * expects the seeded floor as the seed left it: a request still waiting, a
 * quotation with panels still to send, no revision it did not raise. Each
 * test registers its own undo before it acts, and `afterEach` runs them
 * whether the test passed or not.
 */
const cleanups: (() => Promise<void>)[] = [];
test.afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!();
});

async function removeDispatch(id: string): Promise<void> {
  await query("delete from notifications where subject_type = 'dispatch' and subject_id = $1::uuid", [id]);
  await query("delete from audit_log where record_type = 'dispatch' and record_id = $1::text", [id]);
  await query("delete from dispatch_items where dispatch_id = $1::uuid", [id]);
  await query("delete from dispatches where id = $1::uuid", [id]);
}

/** Every dispatch on the quotation that was not there when the test began. */
async function removeDispatchesSince(quotationId: string, before: Set<string>): Promise<void> {
  const rows = await query<{ id: string }>(
    "select id from dispatches where quotation_id = $1::uuid",
    [quotationId],
  );
  for (const row of rows) if (!before.has(row.id)) await removeDispatch(row.id);
}

/** The revisions a test raised on top of the one it started from, and what hangs off them. */
async function removeLaterRevisions(number: number, revision: number): Promise<void> {
  const rows = await query<{ id: string }>(
    "select id from quotations where number = $1 and revision > $2",
    [number, revision],
  );
  for (const row of rows) {
    await removeDispatchesSince(row.id, new Set());
    await query("delete from notifications where subject_type = 'quotation' and subject_id = $1::uuid", [row.id]);
    await query("delete from audit_log where record_type = 'quotation' and record_id = $1::text", [row.id]);
    await query("delete from quotation_items where quotation_id = $1::uuid", [row.id]);
    await query("delete from quotations where id = $1::uuid", [row.id]);
  }
}

/**
 * A quotation a dispatch answered goes back to unanswered, as the seed left it.
 *
 * Raising a dispatch marks the quotation accepted (SPEC §3, P12-10), which made
 * an unanswered quotation a CONSUMABLE: the floor has few, both locale projects
 * read one seeded database, and the English run was leaving the Arabic one with
 * none — three specs starved at their fixtures, a hundred tests away from the
 * walk that ate it. Guarded on the status and on the detail the action writes,
 * so it can only undo an answer one of this file's own dispatches implied.
 */
async function unanswer(id: string): Promise<void> {
  await query(
    `update quotations set status = 'issued', decided_at = null, decision_reason = null
      where id = $1::uuid and status = 'accepted'`,
    [id],
  );
  await query(
    `delete from audit_log
      where record_type = 'quotation' and record_id = $1::text
        and action = $2::text and details->>'impliedBy' = 'dispatch'`,
    [id, quotationEvent("accepted")],
  );
}

/** A request the test issued goes back to waiting, as the seed left it. */
async function restoreRequest(id: string): Promise<void> {
  await query(
    "update quotations set status = 'requested', smac_number = null, issued_at = null where id = $1::uuid and status = 'issued'",
    [id],
  );
  await query(
    "delete from audit_log where record_type = 'quotation' and record_id = $1::text and action like 'quotation.%issue%'",
    [id],
  );
  await query(
    "delete from notifications where subject_type = 'quotation' and subject_id = $1::uuid and kind = 'quotationIssued'",
    [id],
  );
}

test("two hands on one request: one issue wins, the other is refused, in the app's words", async ({
  page,
  context,
  locale,
  t,
}) => {
  test.slow(); // A sign-in and two dialogs opened at once.

  // The NEWEST request, not the oldest: the oldest on the seeded floor is the
  // one that has waited past two working days, and the coordinator's figures
  // spec (tests/numbers.spec.ts) needs it still waiting when the Arabic run
  // reaches it after this English one has issued its pick.
  const quotation = await one<{ id: string; number: number; revision: number }>(
    `select id, number, revision from quotations
      where status = 'requested' order by created_at desc limit 1`,
  );
  const label = quotationLabel(quotation.number, quotation.revision);
  cleanups.push(() => restoreRequest(quotation.id));
  const numberA = `TWOHANDS-1A-${locale.toUpperCase()}`;
  const numberB = `TWOHANDS-1B-${locale.toUpperCase()}`;

  await login(page, locale, "rawan");
  // The same coordinator, two tabs — `context.newPage()` shares the session
  // page A just signed in with, which is the whole shape of the bug (D85).
  const pageB = await context.newPage();
  // Neither tab hears about the other's write mid-test (blockLiveChannel) —
  // this test is about the transaction, not the live-sync feature that
  // happens to share its screen.
  await blockLiveChannel(page);
  await blockLiveChannel(pageB);

  let askA!: Locator;
  let askB!: Locator;

  await test.step("both tabs show it waiting, and both start typing SMAC's number", async () => {
    await page.goto(`/${locale}/queue?open=${quotation.id}`);
    await gotoAndHydrate(pageB, `/${locale}/queue?open=${quotation.id}`);

    await expect(statusOf(sheetFor(page, label))).toHaveText(t("quotations.statusRequested"));
    await expect(statusOf(sheetFor(pageB, label))).toHaveText(t("quotations.statusRequested"));

    // Opened and filled on both before either one saves, so the only race left
    // is the one this test is about: which Save reaches the database first.
    await sheetFor(page, label).getByRole("button", { name: t("quotations.issue") }).click();
    askA = page.getByRole("dialog", { name: t("quotations.issueTitle", { label }) });
    await askA.getByLabel(t("common.smacNumber")).fill(numberA);

    await sheetFor(pageB, label).getByRole("button", { name: t("quotations.issue") }).click();
    askB = pageB.getByRole("dialog", { name: t("quotations.issueTitle", { label }) });
    await askB.getByLabel(t("common.smacNumber")).fill(numberB);
  });

  // Fired together, so the only thing decided is which transaction's
  // `SELECT … FOR UPDATE` (holdQuotation, src/lib/hold.ts) reaches the row
  // first — never which tab happened to click a moment sooner.
  const outcomesPromise = Promise.all([
    settleQuotationIssue(page, askA, label, numberA, t),
    settleQuotationIssue(pageB, askB, label, numberB, t),
  ]);
  await test.step("both press Issue at the same moment", async () => {
    await Promise.all([
      askA.getByRole("button", { name: t("quotations.issue") }).click(),
      askB.getByRole("button", { name: t("quotations.issue") }).click(),
    ]);
  });
  const [outcomeA, outcomeB] = await outcomesPromise;

  await test.step("exactly one tab issued it, exactly one was refused, in the app's own words", async () => {
    const outcomes = [outcomeA, outcomeB];
    expect(outcomes.filter((o) => o === "success"), outcomes.join(", ")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "notWaiting"), outcomes.join(", ")).toHaveLength(1);
  });

  await test.step("the database shows one issue, with the winner's number, and one audit row", async () => {
    const winningNumber = outcomeA === "success" ? numberA : numberB;
    const row = await one<{ status: string; smacNumber: string | null }>(
      `select status, smac_number as "smacNumber" from quotations where id = $1::uuid`,
      [quotation.id],
    );
    expect(row.status).toBe("issued");
    expect(row.smacNumber).toBe(winningNumber);

    const audits = await query(
      `select id from audit_log
        where record_type = 'quotation' and record_id = $1::text and action = 'quotation.issue'`,
      [quotation.id],
    );
    expect(audits).toHaveLength(1);
  });

  usedQuotationIds.push(quotation.id);
  await pageB.close();
});

test("two hands on the last panels: only one dispatch is written", async ({
  page,
  context,
  locale,
  t,
}) => {
  test.slow(); // A sign-in and two forms filled and saved together.

  const faisal = await userId("faisal@technopanel.com.sa");
  const line = await pickSpendableLine(faisal, ["issued", "accepted"], usedQuotationIds);
  if (line.status === "issued") cleanups.push(() => unanswer(line.quotationId));
  const label = quotationLabel(line.number, line.revision);

  const before = await query<{ id: string }>(
    `select id from dispatches where quotation_id = $1::uuid`,
    [line.quotationId],
  );
  const beforeIds = new Set(before.map((row) => row.id));
  cleanups.push(() => removeDispatchesSince(line.quotationId, beforeIds));

  await login(page, locale, "faisal");
  const pageB = await context.newPage();

  let formA: Locator;
  let formB: Locator;

  await test.step("both tabs open the request form and ask for every panel left on the same line", async () => {
    await page.goto(`/${locale}/quotations?open=${line.quotationId}`);
    await gotoAndHydrate(pageB, `/${locale}/quotations?open=${line.quotationId}`);

    const drawerA = sheetFor(page, label);
    const drawerB = sheetFor(pageB, label);
    await expect(drawerA).toBeVisible(COLD);
    await expect(drawerB).toBeVisible(COLD);

    await drawerA.getByRole("button", { name: t("dispatches.request") }).click();
    await drawerB.getByRole("button", { name: t("dispatches.request") }).click();

    formA = page.getByRole("dialog", { name: t("dispatches.requestFor", { label }) });
    formB = pageB.getByRole("dialog", { name: t("dispatches.requestFor", { label }) });
    await expect(formA.getByText(t("dispatches.remaining")).first()).toBeVisible(COLD);
    await expect(formB.getByText(t("dispatches.remaining")).first()).toBeVisible(COLD);

    // The chosen line, and only it: everything else is left at zero, which is
    // how a rep says "not this one this time" (dispatch-items.tsx).
    await formA.getByLabel(t("dispatches.sending")).nth(line.position - 1).fill(String(line.remaining));
    await formB.getByLabel(t("dispatches.sending")).nth(line.position - 1).fill(String(line.remaining));
    await fillTheDetails(formA, t);
    await fillTheDetails(formB, t);
  });

  await test.step("both press Save at the same moment", async () => {
    const saveA = formA.getByRole("button", { name: t("common.save") });
    const saveB = formB.getByRole("button", { name: t("common.save") });
    await Promise.all([saveA.click(), saveB.click()]);
  });

  const [outcomeA, outcomeB] = await test.step("one succeeds, the other is told there is nothing left", async () => {
    return Promise.all([
      settleDispatchRequest(page, formA, t),
      settleDispatchRequest(pageB, formB, t),
    ]);
  });

  await test.step("the database never let committed quantity pass what was quoted", async () => {
    // (a) — true regardless of how the UI-level race above landed: the row
    // holds the quotation while it checks, so this can never be violated
    // (holdQuotation in requestDispatchAction, src/actions/dispatches.ts).
    const lines = await query<{ id: string; qty: number; committed: string }>(
      `select qi.id, qi.qty,
              coalesce(sum(di.qty) filter (where d.status in ('submitted', 'approved')), 0)::text
                as committed
         from quotation_items qi
         left join dispatch_items di on di.quotation_item_id = qi.id
         left join dispatches d on d.id = di.dispatch_id
        where qi.quotation_id = $1::uuid
        group by qi.id, qi.qty`,
      [line.quotationId],
    );
    for (const row of lines) {
      expect(Number(row.committed), `line ${row.id} is over-committed`).toBeLessThanOrEqual(row.qty);
    }
  });

  await test.step("exactly one new dispatch was written for this quotation", async () => {
    // (b)
    const after = await query<{ id: string }>(
      `select id from dispatches where quotation_id = $1::uuid`,
      [line.quotationId],
    );
    const created = after.filter((row) => !beforeIds.has(row.id));
    expect(created).toHaveLength(1);
  });

  // (c) — expected to hold every time, not only usually: the hold serialises
  // the two transactions, so the second one always reads the first one's
  // committed quantity rather than the stale figure both tabs loaded. Kept
  // as its own step, separate from (a) and (b), so a flake here would be
  // reported as exactly this and not mistaken for the database being wrong.
  await test.step("one tab shows success, the other shows dispatches.tooMuch", async () => {
    const outcomes = [outcomeA, outcomeB];
    expect(outcomes.filter((o) => o === "success"), outcomes.join(", ")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "tooMuch"), outcomes.join(", ")).toHaveLength(1);
  });

  usedQuotationIds.push(line.quotationId);
  await pageB.close();
});

test("approved against the price the customer holds: a dispatch on a superseded quotation is refused", async ({
  page,
  browser,
  locale,
  t,
}) => {
  test.slow(); // Two sign-ins and three dialogs.

  const faisal = await userId("faisal@technopanel.com.sa");
  // His OWN paper, in either state goods may move against. This walk presses
  // Revise, which the drawer offers to the quotation's own rep and not to the
  // customer's, and a shared job puts another rep's paper on his customer — the
  // walk found one and waited ninety seconds for a button nobody was drawing.
  //
  // It asked for `issued` alone before, which named his own paper by accident
  // and cost the floor its one unanswered quotation: since P12-10 the dispatch
  // this raises ANSWERS it, and the English run was starving three Arabic specs
  // at their fixtures. The undo below hands it back.
  const line = await pickSpendableLine(faisal, ["issued", "accepted"], usedQuotationIds, true);
  if (line.status === "issued") cleanups.push(() => unanswer(line.quotationId));
  const label = quotationLabel(line.number, line.revision);
  const dispatchesBefore = new Set(
    (
      await query<{ id: string }>("select id from dispatches where quotation_id = $1::uuid", [
        line.quotationId,
      ])
    ).map((row) => row.id),
  );
  cleanups.push(async () => {
    await removeLaterRevisions(line.number, line.revision);
    await removeDispatchesSince(line.quotationId, dispatchesBefore);
  });

  await login(page, locale, "faisal");

  let dispatchId = "";
  let dispatchLabelText = "";

  await test.step("Faisal raises a dispatch on the live quotation", async () => {
    await page.goto(`/${locale}/quotations?open=${line.quotationId}`);
    const drawer = sheetFor(page, label);
    await expect(drawer).toBeVisible(COLD);

    await drawer.getByRole("button", { name: t("dispatches.request") }).click();
    const form = page.getByRole("dialog", { name: t("dispatches.requestFor", { label }) });
    await expect(form.getByText(t("dispatches.remaining")).first()).toBeVisible(COLD);

    // Any quantity at least 1 and within what is left, per D85 — one is both.
    await form.getByLabel(t("dispatches.sending")).nth(line.position - 1).fill("1");
    await fillTheDetails(form, t);
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("dispatches.requested"))).toBeVisible(COLD);
    await expect(page).toHaveURL(/\/dispatches\?open=/, COLD);
    dispatchId = new URL(page.url()).searchParams.get("open") ?? "";
    expect(dispatchId).not.toBe("");
    dispatchLabelText = await nameOfTheOpenDispatch(page);
  });

  await test.step("and then raises a revision, which supersedes it", async () => {
    await page.goto(`/${locale}/quotations?open=${line.quotationId}`);
    const drawer = sheetFor(page, label);
    await expect(drawer).toBeVisible(COLD);

    await drawer.getByRole("button", { name: t("quotations.revise") }).click();
    const form = page.getByRole("dialog", { name: t("quotations.revise") });
    // Opens on the line as it was typed — nothing here needs to change; the
    // revision itself, carrying the same number one revision up (S34), is
    // what makes the quotation the dispatch was raised against no longer live.
    await expect(form.getByLabel(t("common.colourCode")).first()).toBeVisible(COLD);
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("quotations.revised"))).toBeVisible(COLD);
  });

  const rawanContext = await browser.newContext();
  const rawan = await rawanContext.newPage();

  await test.step("Rawan approves the dispatch, but its quotation has been superseded", async () => {
    await login(rawan, locale, "rawan");
    await gotoAndHydrate(rawan, `/${locale}/queue?dispatch=${dispatchId}`);

    const sheet = sheetFor(rawan, dispatchLabelText);
    await expect(sheet).toBeVisible(COLD);
    // Said before the press (D119, P11E): the sheet carries the sentence the
    // action would refuse with and Approve is disabled, so there is no press to
    // refuse. The action's own lock (D85, `isLiveRevision`) stands behind it for
    // a page that was open before the revision landed — the same test, in SQL,
    // that puts the sentence on this sheet (`selection().superseded`).
    await expect(sheet.getByText(t("dispatches.supersededQuotation"))).toBeVisible(COLD);
    await expect(sheet.getByRole("button", { name: t("dispatches.approve") })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: t("dispatches.refuse") })).toBeEnabled();
  });

  await test.step("the dispatch is still submitted — the refusal wrote nothing", async () => {
    const row = await one<{ status: string }>(`select status from dispatches where id = $1::uuid`, [
      dispatchId,
    ]);
    expect(row.status).toBe("submitted");
  });

  usedQuotationIds.push(line.quotationId);
  await rawanContext.close();
});
