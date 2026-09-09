import type { Locator, Page } from "@playwright/test";
import { addDays, addMonths, firstOfMonth, lastOfMonth, todayRiyadh } from "@/lib/dates";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * The presses (SPEC D113–D116; P11D findings 77–81).
 *
 * Five things the flow walk counted and found dear: a fortnight of leave was
 * fourteen dialogs; Enter did nothing in the coordinator's number box; a new
 * month's targets opened empty with nothing saying what last month was; a log
 * on a company with one contact opened on nobody; and a queue row did not say
 * whose request it was. Each is one short test here. Every write is taken
 * back in a `finally`, because both locale projects read one seeded database
 * (playwright.config.ts: `workers: 1`).
 */

const COLD = { timeout: 30_000 };
const FAISAL = "faisal@technopanel.com.sa";

test("two weeks of leave is one entry", async ({ page, locale, t }) => {
  const note = `span ${Date.now()}`;
  // Three free days, starting tomorrow at the earliest and inside this month,
  // so every cell is on the picker's open grid (the grid shows the next
  // month's first days as outside days, which is where +2 may land).
  const today = todayRiyadh();
  const taken = new Set(
    (
      await query<{ day: string }>(
        `select to_char(day, 'YYYY-MM-DD') as day from non_working_days
          where user_id is null and day between $1::date and $2::date`,
        [addDays(today, 1), addDays(today, 40)],
      )
    ).map((row) => row.day),
  );
  let from = addDays(today, 1);
  while (
    from <= lastOfMonth(today) &&
    [0, 1, 2].some((offset) => taken.has(addDays(from, offset)))
  ) {
    from = addDays(from, 1);
  }
  const until = addDays(from, 2);
  try {
    await login(page, locale, "jerom");
    await page.goto(`/${locale}/admin/holidays`);
    await expect(page.getByRole("heading", { name: t("common.holidays") })).toBeVisible(COLD);
    await page.getByRole("button", { name: t("admin.addDay") }).click();
    const form = page.getByRole("dialog", { name: t("admin.addDay") });
    // `data-day` is react-day-picker's own ISO stamp: no localized digits read.
    await form.locator("#day-picker").click();
    await page.locator(`[data-day="${from}"] button`).first().click();
    await form.locator("#until-picker").click();
    await page.locator(`[data-day="${until}"] button`).first().click();
    await form.getByLabel(t("common.note")).fill(note);
    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("admin.daysAdded", { count: 3 }))).toBeVisible(COLD);

    const rows = await query<{ day: string; user_id: string | null }>(
      "select to_char(day, 'YYYY-MM-DD') as day, user_id from non_working_days where note = $1 order by day",
      [note],
    );
    expect(rows.map((row) => row.day)).toEqual([from, addDays(from, 1), until]);
    // Everyone's, because nobody was picked: a holiday, not leave (S48).
    expect(rows.every((row) => row.user_id === null)).toBe(true);

    // The same span again is not written twice.
    await page.getByRole("button", { name: t("admin.addDay") }).click();
    const again = page.getByRole("dialog", { name: t("admin.addDay") });
    await again.locator("#day-picker").click();
    await page.locator(`[data-day="${from}"] button`).first().click();
    await again.locator("#until-picker").click();
    await page.locator(`[data-day="${until}"] button`).first().click();
    await again.getByLabel(t("common.note")).fill(note);
    await again.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("admin.daysAdded", { count: 0 }))).toBeVisible(COLD);
    const still = await one<{ n: number }>(
      "select count(*)::int as n from non_working_days where note = $1",
      [note],
    );
    expect(Number(still.n)).toBe(3);
  } finally {
    await query("delete from non_working_days where note = $1", [note]);
  }
});

test("Enter in the number box issues the quotation", async ({ page, locale, t }) => {
  const found = await one<{ id: string; number: number; revision: number; smac: string | null }>(
    `select q.id, q.number, q.revision, q.smac_number as smac
       from quotations q where q.status = 'requested' order by q.created_at limit 1`,
  );
  const waiting = { ...found, label: quotationLabel(found.number, found.revision) };
  const number = `E${String(Date.now()).slice(-6)}`;
  try {
    await login(page, locale, "rawan");
    await page.goto(`/${locale}/queue?open=${waiting.id}`);
    const sheet = page.getByRole("dialog", { name: waiting.label });
    await expect(sheet).toBeVisible(COLD);
    await sheet.getByRole("button", { name: t("quotations.issue") }).click();
    const ask = page.getByRole("dialog", { name: t("quotations.issueTitle", { label: waiting.label }) });
    const box = ask.getByLabel(t("common.smacNumber"));
    await box.fill(number);
    // The hand stays on the keyboard (D114).
    await box.press("Enter");
    await expect(page.getByText(t("quotations.issued", { label: waiting.label }))).toBeVisible(
      COLD,
    );
    const row = await one<{ status: string; smac: string | null }>(
      "select status, smac_number as smac from quotations where id = $1::uuid",
      [waiting.id],
    );
    expect(row.status).toBe("issued");
    expect(row.smac).toBe(number);
  } finally {
    await query(
      "update quotations set status = 'requested', smac_number = $2, issued_at = null where id = $1::uuid",
      [waiting.id, waiting.smac],
    );
    await query(
      "delete from notifications where subject_type = 'quotation' and subject_id = $1::uuid and kind = 'quotationIssued'",
      [waiting.id],
    );
  }
});

test("a new month's target box says what last month was, keeps it, and saves on Enter", async ({
  page,
  locale,
  t,
}) => {
  const faisal = await userId(FAISAL);
  const thisMonth = firstOfMonth(todayRiyadh());
  const nextMonth = addMonths(thisMonth, 1);
  const current = await one<{ sqm: string }>(
    "select sqm::text as sqm from targets where user_id = $1::uuid and month = $2::date",
    [faisal, thisMonth],
  );
  const name = await personName(FAISAL, locale);
  try {
    await login(page, locale, "jerom");
    await page.goto(`/${locale}/admin/targets?month=${nextMonth}`);
    await expect(page.getByRole("heading", { name: t("common.targets") })).toBeVisible(COLD);
    const box = page.getByLabel(name, { exact: true });
    await expect(box).toHaveValue("");
    const whole = String(Number(current.sqm));
    const form = page.locator("form").filter({ has: box });
    await expect(form.locator('[data-slot="target-previous"]')).toHaveText(
      t("admin.lastMonthWas", { sqm: whole }),
    );
    await form.getByRole("button", { name: t("admin.keepLastMonth") }).click();
    await expect(box).toHaveValue(whole);
    await box.press("Enter");
    await expect(page.getByText(t("admin.targetSaved"))).toBeVisible(COLD);
    const saved = await one<{ sqm: string }>(
      "select sqm::text as sqm from targets where user_id = $1::uuid and month = $2::date",
      [faisal, nextMonth],
    );
    expect(Number(saved.sqm)).toBe(Number(current.sqm));
  } finally {
    await query("delete from targets where user_id = $1::uuid and month = $2::date", [
      faisal,
      nextMonth,
    ]);
  }
});

test("a log on a company with one contact opens on him", async ({ page, locale, t }) => {
  const faisal = await userId(FAISAL);
  const company = await one<{ id: string; name: string; contact: string }>(
    `select c.id, c.name, ct.name as contact
       from companies c
       join contacts ct on ct.company_id = c.id and ct.archived_at is null
      where c.rep_id = $1::uuid and c.archived_at is null
        and (select count(*) from contacts x where x.company_id = c.id and x.archived_at is null) = 1
      order by c.name limit 1`,
    [faisal],
  );
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies?open=${company.id}`);
  const drawer = page.getByRole("dialog", { name: company.name });
  await expect(drawer).toBeVisible(COLD);
  await drawer.getByRole("button", { name: t("common.log"), exact: true }).click();
  const form = page.getByRole("dialog", { name: t("drawer.logTitle") });
  await expect(form.getByLabel(t("common.contact"))).toHaveText(company.contact);
  await form.getByRole("button", { name: t("common.cancel") }).click();
});

/**
 * Presses the middle of a row's LAST cell — how long it has waited, which is
 * where her eye stops reading and about nine hundred pixels from the number at
 * the start of the row (P12-11).
 *
 * The mouse, at a point, rather than `click()` on the cell: the door is the
 * first cell's own link stretched over the row, so Playwright refuses to click
 * the cell — it correctly reports that something covers it — and refusing is
 * the very thing being tested. A press at that point is what a person does.
 */
async function pressTheFarEndOf(page: Page, row: Locator): Promise<void> {
  const cell = row.getByRole("cell").last();
  await expect(cell).toBeVisible(COLD);
  // The box is measured against the VIEWPORT, and the queue is two tables long:
  // a row below the fold has a y nobody can press, and the click then lands on
  // whatever happens to be at that height instead of failing.
  await cell.scrollIntoViewIfNeeded();
  const box = await cell.boundingBox();
  expect(box, "the row's last cell has no box to press").not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
}

test("the whole row opens the record, not only the number at the start of it", async ({
  page,
  locale,
  t,
}) => {
  // Both halves of her desk, because both are tables and the rule is about the
  // table rather than about either chain (P12-11).
  const quotation = await one<{ number: number; revision: number }>(
    `select number, revision from quotations
      where status = 'requested' order by created_at limit 1`,
  );
  const dispatch = await one<{ number: number }>(
    `select number from dispatches where status = 'submitted' order by created_at limit 1`,
  );

  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue`);
  await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);

  await test.step("a quotation opens from the far end of its row", async () => {
    const label = quotationLabel(quotation.number, quotation.revision);
    await pressTheFarEndOf(page, page.getByRole("row").filter({ hasText: label }));
    await expect(page.getByRole("dialog", { name: label })).toBeVisible(COLD);
    await expect(page).toHaveURL(/[?&]open=/);
  });

  await test.step("and a dispatch does the same, into its own drawer", async () => {
    // A fresh screen rather than Escape: an open drawer lays an overlay over
    // the row this is about, and a press at a point would land on the overlay.
    await page.goto(`/${locale}/queue`);
    await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);
    const label = dispatchLabel(dispatch.number);
    await pressTheFarEndOf(page, page.getByRole("row").filter({ hasText: label }));
    await expect(page.getByRole("dialog", { name: label })).toBeVisible(COLD);
    // Two lists, two words for what is open, so one press cannot open two
    // drawers on one id (the queue page's own rule).
    await expect(page).toHaveURL(/[?&]dispatch=/);
  });
});

/**
 * What a press at this point would land on — the only question a stretched
 * overlay ever answers wrongly. `elementFromPoint` rather than a real press,
 * because one of the two answers opens WhatsApp in a second tab.
 */
async function whatIsUnder(page: Page, target: Locator): Promise<string | null> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box, "nothing to press").not.toBeNull();
  return page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("a")?.getAttribute("href") ?? null,
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
  );
}

test("the door covers the row, and the number on it stays on top", async ({
  page,
  locale,
  t,
}) => {
  // A customer with somebody to call has TWO links in its row, and the phone
  // one is the exception the overlay lets through (D161, globals.css
  // `row-door`). That has been right since P8 and nothing proved it, so on the
  // day the overlay changed shape nothing would have said the number went dead.
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/companies`);
  await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);

  const row = page
    .getByRole("row")
    .filter({ has: page.locator('a[href*="wa.me"]') })
    .first();
  await expect(row).toBeVisible(COLD);
  const door = await row.getByRole("link").first().getAttribute("href");
  expect(door, "the row's first link is the door").toContain("open=");

  await test.step("the number is still the number, not the row underneath it", async () => {
    expect(await whatIsUnder(page, row.locator('a[href*="wa.me"]').first())).toContain("wa.me");
  });

  await test.step("and everything beside it is the door", async () => {
    // The city, a cell away from the name and under no link of its own.
    expect(await whatIsUnder(page, row.getByRole("cell").nth(1))).toBe(door);
  });
});

test("a queue row says whose request it is", async ({ page, locale, t }) => {
  const found = await one<{ number: number; revision: number; rep_email: string }>(
    `select q.number, q.revision, u.email as rep_email
       from quotations q join users u on u.id = q.rep_id
      where q.status = 'requested' order by q.created_at limit 1`,
  );
  const waiting = { label: quotationLabel(found.number, found.revision) };
  const rep = await personName(found.rep_email, locale);
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/queue`);
  await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);
  const row = page.getByRole("row").filter({ hasText: waiting.label });
  await expect(row.locator('[data-slot="row-rep"]')).toHaveText(rep);
  // And on his own list the same row does not repeat his own name to him.
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);
  await expect(page.getByRole("heading", { name: t("common.quotations") })).toBeVisible(COLD);
  await expect(page.locator('[data-slot="row-rep"]')).toHaveCount(0);
});
