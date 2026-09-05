import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { one, personName, userId } from "./helpers/db";
import { test, expect, type Translate } from "./helpers/i18n";
import { quotationLabel } from "@/lib/labels";

/**
 * P4 — the quotation chain, end to end (WORKFLOW §3).
 *
 * Faisal asks for a price on one of his projects. Rawan sends it back because
 * something is wrong with it. Faisal fixes the line and asks again. Rawan gives
 * it SMAC's number, which is what issues it. Faisal records what the customer
 * said. Then the customer wants it again at a different price, so Faisal raises
 * a revision and the first one is marked superseded.
 *
 * That is the whole of S28–S36 in one walk, and it is walked in both locales.
 *
 * The figures are checked twice over on purpose. `src/lib/money.ts` adds them
 * up in the browser while the rep types, and SQL adds them up again in
 * `src/lib/quotations.ts` once they are stored — two derivations of the same
 * four numbers, which is the drift trap rules/data.md is about. The test pins
 * both to arithmetic done here, so neither can move without the other.
 */

/**
 * Two items on the standard sheet, 1.24 × 5.8 m — the shape §3 asks for, and
 * chosen so every figure is exact in two decimals: 7.192 m² a sheet, so ten
 * sheets are 71.92 m² and five are 35.96.
 */
const SHEET = 1.24 * 5.8;
const ITEMS = [
  { qty: 10, price: 120 },
  { qty: 5, price: 200 },
];
const COLOUR = "168";
const REVISED_PRICE = 130;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** What the four figures come to, when the first item is priced at `firstPrice`. */
function expectedTotals(firstPrice: number) {
  const prices = [firstPrice, ITEMS[1].price];
  const perItem = ITEMS.map((item) => round2(SHEET * item.qty));
  const sqm = round2(perItem.reduce((a, b) => a + b, 0));
  // Rounded per line, as the app does — a line is a price somebody quoted.
  const subtotal = round2(
    perItem.reduce((sum, itemSqm, index) => sum + round2(itemSqm * prices[index]), 0),
  );
  const vat = round2(subtotal * 0.15);
  return { sqm, subtotal, vat, total: round2(subtotal + vat) };
}

/**
 * The four figures as the screen shows them, read back as numbers.
 *
 * The money rows carry the currency after the figure, and in Arabic that is
 * "ر.س" — which has a full stop in it, so stripping non-digits would turn
 * "8,630.40 ر.س" into something that is not a number at all. The first numeric
 * run is the figure.
 */
async function figures(scope: Locator) {
  async function read(name: string): Promise<number> {
    const text = await scope.locator(`[data-slot='figure-${name}']`).innerText();
    const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    expect(match, `no number in the ${name} row: "${text}"`).not.toBeNull();
    return Number(match?.[0]);
  }
  return {
    sqm: await read("sqm"),
    subtotal: await read("subtotal"),
    vat: await read("vat"),
    total: await read("total"),
  };
}

/**
 * Fills item number `index + 1`. The fields are located by their label and then
 * by which line they belong to — a card per item, all with the same nine labels.
 */
async function fillItem(form: Locator, t: Translate, index: number, price: number) {
  await form.getByLabel(t("common.colourCode")).nth(index).fill(COLOUR);

  // Supplier, fire rating and class have no default — whatever each list
  // offers first proves the field works and keeps the assertion out of English.
  for (const label of ["common.supplier", "common.fireRating", "common.class"]) {
    await form.getByRole("combobox", { name: t(label) }).nth(index).click();
    await form.page().getByRole("option").first().click();
  }

  // Thickness and the sheet's size open on the standard 4 mm, 1.24 × 5.8 m.
  await form.getByLabel(t("common.qty")).nth(index).fill(String(ITEMS[index].qty));
  await form.getByLabel(t("common.pricePerSqm")).nth(index).fill(String(price));
}

/** Both items, as the rep types them, and the totals that appear underneath. */
async function fillTheItems(form: Locator, t: Translate, firstPrice: number) {
  await fillItem(form, t, 0, firstPrice);
  await form.getByRole("button", { name: t("quotations.addItem") }).click();
  await fillItem(form, t, 1, ITEMS[1].price);
  return figures(form);
}

/**
 * Where the quotation is NOW — the badge under its name.
 *
 * The trail further down the drawer says some of the same words about a day
 * gone by: "Sent back" is the state it is in and also the thing that happened
 * on the 27th, and a reader tells the two apart by where they are on the screen.
 * A locator cannot, so a spec that means the badge asks for the badge, by the
 * tone attribute every state badge carries (DESIGN §5).
 */
function statusOf(sheet: Locator): Locator {
  return sheet.locator("[data-tone]").first();
}

/** The quotation drawer, which is named by the quotation itself (Q-12). */
function sheetFor(page: Page, label: string): Locator {
  return page.getByRole("dialog", { name: label });
}

/**
 * The quotation's name where it is actually on screen.
 *
 * Every list in this app renders twice — a table from `md` up and a card per
 * row below it — and CSS picks one. Without the visible filter the first match
 * is the hidden layout, which cannot be clicked and is never what the assertion
 * meant. Exact, too: Q-8 and Q-8/2 are different quotations.
 */
function labelOnScreen(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).filter({ visible: true }).first();
}

/**
 * A toast, with room for the dev server's first compile of a route.
 *
 * The five-second default is right for everything that is already warm; the
 * first server action of a run answers minutes into a cold Turbopack build and
 * the toast arrives after it, not before. Nothing here is waiting on the app
 * being slow in production.
 */
const COLD = { timeout: 30_000 };

/**
 * The quotation's name, once the drawer holding it has actually loaded.
 *
 * The sheet renders a skeleton first, whose heading is "Opening the
 * quotation" — read a moment too early and the rest of the walk goes looking
 * for a dialog by that name.
 */
async function nameOfTheOpenQuotation(page: Page): Promise<string> {
  const heading = page.getByRole("dialog").first().getByRole("heading").first();
  await expect(heading).toHaveText(/^Q-\d+$/, COLD);
  return (await heading.innerText()).trim();
}

/**
 * The trail on the drawer, one line per thing that happened, oldest first.
 *
 * Read by the attribute the component stamps rather than by the words, so the
 * order can be asserted in a language the assertion does not have to know.
 */
function trail(sheet: Locator): Locator {
  return sheet.locator("li[data-event]");
}

/** The id in ?open= — the app's own way of saying which record is open. */
function openId(page: Page): string {
  return new URL(page.url()).searchParams.get("open") ?? "";
}

test("the quotation chain: request, send back, edit, issue, the customer's answer, a revision", async ({
  page,
  browser,
  locale,
  t,
}) => {
  test.slow(); // Six sign-ins and four dialogs.

  const faisal = await userId("faisal@technopanel.com.sa");
  const project = await one<{ id: string; name: string }>(
    `select p.id, p.name
       from projects p
       join companies c on c.id = p.company_id
      where c.rep_id = $1::uuid
        and p.lost_at is null
        and p.archived_at is null
        and c.archived_at is null
      order by p.created_at
      limit 1`,
    [faisal],
  );

  let quotationId = "";
  let label = "";

  // Rawan's queue, open in her own browser, untouched from here on: whatever
  // appears on it appears because the server told it to (DESIGN §2, no polls).
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
    // The live channel only opens once React has taken the page over.
    await rawan.waitForFunction(() => document.documentElement.dataset.hydrated === "true");
  });

  await test.step("1 · Faisal asks for a price on his project", async () => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/projects?open=${project.id}`);
    const drawer = page.getByRole("dialog", { name: project.name });
    await expect(drawer).toBeVisible();

    // A quotation is asked for from where the quotations are, not from the
    // drawer's action row: that row is what a rep does to the project itself.
    await drawer.getByRole("tab", { name: t("common.quotations") }).click();
    await drawer.getByRole("button", { name: t("quotations.request") }).first().click();

    const form = page.getByRole("dialog", {
      name: t("quotations.requestFor", { project: project.name }),
    });
    await expect(form.getByLabel(t("common.colourCode"))).toBeVisible();

    const live = await fillTheItems(form, t, ITEMS[0].price);
    expect(live, "the totals under the lines are wrong as they are typed").toEqual(
      expectedTotals(ITEMS[0].price),
    );

    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);

    // Saving lands on the quotation itself, not back on the list.
    await expect(page).toHaveURL(/\/quotations\?open=/, COLD);
    quotationId = openId(page);
    expect(quotationId).not.toBe("");
  });

  await test.step("2 · and the drawer's figures are the ones SQL worked out", async () => {
    // The label is the quotation's name and the drawer's title (Q-12).
    label = await nameOfTheOpenQuotation(page);

    const sheet = sheetFor(page, label);
    await expect(statusOf(sheet)).toHaveText(t("quotations.statusRequested"));
    expect(await figures(sheet), "the stored figures differ from the typed ones").toEqual(
      expectedTotals(ITEMS[0].price),
    );
  });

  await test.step("3 · it reaches Rawan's queue and her bell without a reload", async () => {
    await expect(labelOnScreen(rawan, label)).toBeVisible(COLD);
    await expect(
      rawan.getByRole("link", { name: t("shell.unreadCount", { count: unreadBefore + 1 }) }),
    ).toBeVisible(COLD);
    await rawanContext.close();
  });

  await test.step("4 · Rawan opens it and sends it back with a reason", async () => {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue`);
    await expect(labelOnScreen(page, label)).toBeVisible(COLD);

    await labelOnScreen(page, label).click();
    const sheet = sheetFor(page, label);
    await expect(sheet).toBeVisible();

    // Her two actions, and only hers: the customer's answer is the rep's.
    await expect(sheet.getByRole("button", { name: t("quotations.accepted") })).toHaveCount(0);

    await sheet.getByRole("button", { name: t("quotations.sendBack") }).click();
    const ask = page.getByRole("dialog", { name: t("quotations.sendBackTitle", { label }) });
    await ask.getByLabel(t("common.reason")).fill("Price is below the floor for this class.");
    await ask.getByRole("button", { name: t("quotations.sendBack") }).click();

    await expect(page.getByText(t("quotations.sentBack", { label }))).toBeVisible(COLD);
  });

  await test.step("5 · Faisal is told, reads why, and asks again at a new price", async () => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/notifications`);

    // The notice is a sentence in his language, built from the kind and its
    // params — the row stores no English (D13).
    const notice = page.getByText(
      t("notifications.quotationReturned", {
        label,
        reason: "Price is below the floor for this class.",
      }),
    );
    await expect(notice).toBeVisible();
    await notice.click();
    await expect(page).toHaveURL(new RegExp(`/quotations\\?open=${quotationId}`));

    const sheet = sheetFor(page, label);
    await expect(statusOf(sheet)).toHaveText(t("quotations.statusReturned"));
    await expect(sheet.getByText(t("quotations.sentBackReason"), { exact: true })).toBeVisible();

    await sheet.getByRole("button", { name: t("quotations.editRequest") }).click();
    const form = page.getByRole("dialog", { name: t("quotations.editRequest") });

    // It opens on the line he already typed — this is the whole point of edit
    // rather than a second request (S54).
    await expect(form.getByLabel(t("common.colourCode")).first()).toHaveValue(COLOUR);
    await form.getByLabel(t("common.pricePerSqm")).first().fill(String(REVISED_PRICE));
    expect(await figures(form)).toEqual(expectedTotals(REVISED_PRICE));

    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("quotations.requested"))).toBeVisible(COLD);

    // Her reason is off the screen with the state it explained (D72). It also
    // came off the ROW — which nothing here can see, because every screen asks
    // the status first, and which is exactly how it survived being wrong. The
    // database refuses it now; tests/schema.spec.ts is where that is proved, and
    // it is why this save would fail outright if the action ever forgot again.
    const fixed = sheetFor(page, label);
    await expect(fixed.getByText(t("quotations.sentBackReason"), { exact: true })).toHaveCount(0);

    // What happened to it, on the other hand, is kept: asked, sent back, fixed.
    await expect(trail(fixed)).toContainText([
      t("quotations.event.request"),
      t("quotations.event.sendBack"),
      t("quotations.event.update"),
    ]);
    await expect(fixed.getByText(t("quotations.sentBackTimes", { count: 1 }))).toBeVisible();
  });

  await test.step("6 · Rawan gives it SMAC's number, which is what issues it", async () => {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue?open=${quotationId}`);

    const sheet = sheetFor(page, label);
    await expect(statusOf(sheet)).toHaveText(t("quotations.statusRequested"));
    expect(await figures(sheet), "the edit did not reach the stored figures").toEqual(
      expectedTotals(REVISED_PRICE),
    );

    await sheet.getByRole("button", { name: t("quotations.issue") }).click();
    const ask = page.getByRole("dialog", { name: t("quotations.issueTitle", { label }) });
    // The locale is in the number: one database, two projects, and from P9 the
    // same SMAC number cannot be typed twice (D53).
    await ask.getByLabel(t("common.smacNumber")).fill(`SMAC-2026-0442-${locale.toUpperCase()}`);
    await ask.getByRole("button", { name: t("quotations.issue") }).click();

    await expect(page.getByText(t("quotations.issued", { label }))).toBeVisible(COLD);
  });

  await test.step("7 · Faisal records what the customer said", async () => {
    await login(page, locale, "faisal");
    await page.goto(`/${locale}/quotations?open=${quotationId}`);

    const sheet = sheetFor(page, label);
    await expect(statusOf(sheet)).toHaveText(t("quotations.statusIssued"));
    await expect(sheet.getByText("SMAC-2026-0442")).toBeVisible();

    // Once it is issued the request is not editable any more; a change is a
    // revision, because the paper has gone out (S34).
    await expect(sheet.getByRole("button", { name: t("quotations.editRequest") })).toHaveCount(0);

    await sheet.getByRole("button", { name: t("quotations.accepted") }).click();
    const ask = page.getByRole("dialog", { name: t("quotations.acceptTitle", { label }) });
    await ask.getByRole("button", { name: t("quotations.accepted") }).click();

    await expect(page.getByText(t("quotations.acceptedDone", { label }))).toBeVisible(COLD);
    await expect(statusOf(sheetFor(page, label))).toHaveText(t("quotations.statusAccepted"));
  });

  await test.step("8 · and a revision carries the same number, one up", async () => {
    const sheet = sheetFor(page, label);
    await sheet.getByRole("button", { name: t("quotations.revise") }).click();

    const form = page.getByRole("dialog", { name: t("quotations.revise") });
    await expect(form.getByLabel(t("common.colourCode")).first()).toHaveValue(COLOUR);
    await form.getByLabel(t("common.pricePerSqm")).first().fill(String(ITEMS[0].price));
    await form.getByRole("button", { name: t("common.save") }).click();

    await expect(page.getByText(t("quotations.revised"))).toBeVisible(COLD);

    const revision = `${label}/2`;
    await expect(sheetFor(page, revision)).toBeVisible(COLD);
    expect(openId(page), "the revision is a new quotation, not the old one").not.toBe(quotationId);
    expect(await figures(sheetFor(page, revision))).toEqual(expectedTotals(ITEMS[0].price));

    // And it says what it changed, which is the whole of what Rawan opens it
    // for: she priced the first one, and only one of its two lines moved (D76).
    const changed = sheetFor(page, revision).locator("li[data-change]");
    await expect(changed, "the revision lists changes it did not make").toHaveCount(1);
    await expect(changed.first()).toHaveAttribute("data-change", "changed");
    await expect(changed.first()).toContainText(t("common.pricePerSqm"));
    await expect(changed.first()).toContainText(String(ITEMS[0].price));
    await expect(changed.first()).toContainText(String(REVISED_PRICE));

    // The first one is still readable, and says it has been overtaken.
    await page.goto(`/${locale}/quotations?open=${quotationId}`);
    await expect(sheetFor(page, label).getByText(t("quotations.supersededBadge"), { exact: true })).toBeVisible();

    // And it carries its whole life, in the order it was lived. Six steps, six
    // lines, written by the six actions this walk just performed — the trail is
    // the audit log the actions already write, not a record kept beside it.
    await expect(trail(sheetFor(page, label))).toContainText([
      t("quotations.event.request"),
      t("quotations.event.sendBack"),
      t("quotations.event.update"),
      t("quotations.event.issue"),
      t("quotations.event.accepted"),
    ]);
  });
});

/**
 * The second line, and the second quotation, both start from the last one.
 *
 * Nine fields, four of them dropdowns with no default, and this floor sells the
 * same specification to the same customers over and over — item 7 on the
 * five-day list, and the plainest sentence in it: "nothing offers him the last
 * one" (D74). Two offers now do, and this walks both of them.
 */
test("a repeat request opens on the last quotation, and a second line on the first one's sheet", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId("faisal@technopanel.com.sa");

  // The newest quotation on any of Faisal's companies that also has a project to
  // raise the next one from — so it IS what the offer will name, computed the
  // way the app computes it rather than hard-coded to a seeded row.
  const previous = await one<{
    projectId: string;
    projectName: string;
    number: number;
    revision: number;
    colourCode: string;
    lines: number;
  }>(
    `select p.id as "projectId",
            p.name as "projectName",
            q.number,
            q.revision,
            first_value(i.colour_code) over (partition by q.id order by i.position) as "colourCode",
            count(*) over (partition by q.id)::int as lines
       from projects p
       join companies c on c.id = p.company_id
       join quotations q on q.company_id = c.id
       join quotation_items i on i.quotation_id = q.id
      where c.rep_id = $1::uuid
        and c.archived_at is null
        and p.archived_at is null
        and p.lost_at is null
      order by q.created_at desc, i.position
      limit 1`,
    [faisal],
  );
  const label = quotationLabel(previous.number, previous.revision);

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/projects?open=${previous.projectId}`);
  const drawer = page.getByRole("dialog", { name: previous.projectName });
  await drawer.getByRole("tab", { name: t("common.quotations") }).click();
  await drawer.getByRole("button", { name: t("quotations.request") }).first().click();

  const form = page.getByRole("dialog", {
    name: t("quotations.requestFor", { project: previous.projectName }),
  });
  await expect(form.getByLabel(t("common.colourCode"))).toBeVisible(COLD);

  const copy = form.getByRole("button", { name: t("quotations.copyItemsFrom", { label }) });
  await expect(copy, "the offer names the last quotation at this customer").toBeVisible(COLD);
  await copy.click();

  // Every line of it, as it was typed, ready to be changed.
  const colours = form.getByLabel(t("common.colourCode"));
  await expect(colours).toHaveCount(previous.lines);
  await expect(colours.first()).toHaveValue(previous.colourCode);

  // And the offer is gone, because there is now something to lose.
  await expect(copy).toHaveCount(0);

  // A new line opens on the sheet above it: same supplier, rating, class and
  // thickness, and nothing that identifies the line or prices it.
  const suppliers = form.getByRole("combobox", { name: t("common.supplier") });
  const before = await suppliers.count();
  const sheet = await suppliers.nth(before - 1).innerText();

  await form.getByRole("button", { name: t("quotations.addItem") }).click();
  await expect(suppliers).toHaveCount(before + 1);
  await expect(suppliers.nth(before)).toHaveText(sheet);
  await expect(colours.nth(before)).toHaveValue("");
  await expect(form.getByLabel(t("common.pricePerSqm")).nth(before)).toHaveValue("");
});

/**
 * Twice is not once, and until the trail was read back nothing said which.
 *
 * A quotation carries the reason it came back the LAST time and no memory of the
 * one before, so a request Rawan had returned twice looked exactly like one she
 * had returned once — on her queue, on his day, and in the drawer. The count is
 * the figure the manager asked for by name (9A item 5, D72).
 */
test("a quotation that came back twice says so, and says what was wrong each time", async ({
  page,
  locale,
  t,
}) => {
  const rawan = await personName("rawan@technopanel.com.sa", locale);
  const returned = await one<{ id: string; reasons: string[] }>(
    `select q.id,
            array_agg(a.details ->> 'reason' order by a.at) as reasons
       from quotations q
       join audit_log a
         on a.record_type = 'quotation'
        and a.record_id = q.id::text
        and a.action = 'quotation.sendBack'
      where q.status = 'returned'
      group by q.id
     having count(*) = 2
      limit 1`,
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?open=${returned.id}`);
  const label = await nameOfTheOpenQuotation(page);
  const sheet = sheetFor(page, label);

  await expect(sheet.getByText(t("quotations.sentBackTimes", { count: 2 }))).toBeVisible(COLD);

  // Both of her reasons are there — the first one is the one the row itself
  // threw away when he fixed it and she sent it back again. The last one is on
  // the drawer twice over, in the trail and in the box that says why it is with
  // him now, so the assertion takes the first of whichever it matches.
  for (const reason of returned.reasons) {
    await expect(sheet.getByText(reason).first()).toBeVisible();
  }

  // Every line says who, in the reader's own script (D68).
  await expect(trail(sheet).filter({ hasText: t("quotations.event.sendBack") })).toContainText([
    rawan,
    rawan,
  ]);
});

/**
 * A rep may take back his own request, and only while it is still with him.
 *
 * §3 gave the rep a way to ask and the coordinator a way to answer, and no way
 * to unask — which in FACET meant Rawan pricing something nobody wanted
 * (SPEC D32). Nothing is deleted: it leaves her queue wearing the word
 * "withdrawn".
 */
test("a rep withdraws his own request and it leaves the coordinator's queue", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const faisal = await userId("faisal@technopanel.com.sa");
  const project = await one<{ id: string; name: string }>(
    `select p.id, p.name
       from projects p
       join companies c on c.id = p.company_id
      where c.rep_id = $1::uuid and p.lost_at is null and p.archived_at is null
      order by p.created_at
      limit 1`,
    [faisal],
  );

  await login(page, locale, "faisal");
  await page.goto(`/${locale}/projects?open=${project.id}`);
  const drawer = page.getByRole("dialog", { name: project.name });
  await drawer.getByRole("tab", { name: t("common.quotations") }).click();
  await drawer.getByRole("button", { name: t("quotations.request") }).first().click();

  const form = page.getByRole("dialog", {
    name: t("quotations.requestFor", { project: project.name }),
  });
  await expect(form.getByLabel(t("common.colourCode"))).toBeVisible();
  await fillTheItems(form, t, ITEMS[0].price);
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page).toHaveURL(/\/quotations\?open=/, COLD);

  const label = await nameOfTheOpenQuotation(page);

  await sheetFor(page, label).getByRole("button", { name: t("quotations.cancel") }).click();
  const ask = page.getByRole("dialog", { name: t("quotations.cancelTitle", { label }) });
  await ask.getByRole("button", { name: t("quotations.cancel") }).click();
  await expect(page.getByText(t("quotations.cancelled", { label }))).toBeVisible(COLD);

  await test.step("it is off Rawan's queue and still readable, marked withdrawn", async () => {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue`);
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);

    await page.goto(`/${locale}/quotations`);
    await expect(labelOnScreen(page, label)).toBeVisible(COLD);
    await labelOnScreen(page, label).click();
    await expect(statusOf(sheetFor(page, label))).toHaveText(t("quotations.statusCancelled"));
  });
});
