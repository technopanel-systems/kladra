import type { Locator, Page } from "@playwright/test";
import { login } from "./helpers/auth";
import { query } from "./helpers/db";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import { addMonths, firstOfMonth, lastOfMonth, todayRiyadh } from "@/lib/dates";
import { formatNumber, formatSqmWhole } from "@/lib/money";
import { rangeStart } from "@/lib/ranges";

/**
 * P13-S9 — shares drawn as pies, comparisons as bars, and the builder under
 * them (SPEC §3 P13: "pressing a slice or a bar opens the list behind it").
 *
 * The founder reversed D150 and kept what it kept: the drawing is never the only
 * carrier, so every assertion about a figure below reads the TEXT beside a
 * shape, and every assertion about a door presses the SHAPE — a sector or a bar
 * in an SVG, which is what a hand on a pie presses — and counts the rows of the
 * list it lands on. Every expected figure and count is this spec's own SQL
 * (rules/data.md): the app's queries are on trial, not re-run.
 *
 * Directions are compared as boxes, never read off a screenshot (words.md): the
 * first month, the first person's bar and the first slice sit where a reader of
 * the page's language starts, and the Arabic project is the one that proves it.
 */

const COLD = { timeout: 30_000 };

/**
 * The approved metres of every dispatch, divided between the people it is
 * credited to (D148) — one row per load and person, with its Riyadh day. This
 * spec's own copy: `trunc` where the app floors, and the leftover to the last
 * name by subtraction rather than by remainder, so two expressions have to
 * agree to the hundredth (tests/metrics.spec.ts has the same reason).
 */
const CREDITED = `
  with d as (
    select dd.id, dd.company_id, dd.approved_at,
           round(coalesce(sum(round(di.width * di.length * di.qty, 2)), 0), 2) as sqm
      from dispatches dd
      join dispatch_items di on di.dispatch_id = dd.id
     where dd.status = 'approved'
     group by dd.id
  ),
  cr as (
    select dispatch_id, user_id,
           count(*) over (partition by dispatch_id) as n,
           row_number() over (partition by dispatch_id order by user_id) as k
      from dispatch_credits
  ),
  credited as (
    select d.id as dispatch_id, d.company_id, cr.user_id,
           (d.approved_at at time zone 'Asia/Riyadh')::date as day,
           case when cr.k < cr.n then trunc(d.sqm / cr.n, 2)
                else d.sqm - trunc(d.sqm / cr.n, 2) * (cr.n - 1) end as sqm
      from d join cr on cr.dispatch_id = d.id
  )`;

/** The window's metres by kind of customer, largest first, and the loads behind each. */
async function segmentShares(from: string) {
  return query<{ id: number; name_en: string; name_ar: string; sqm: string; loads: number }>(
    `${CREDITED}
     select cc.id, cc.name_en, cc.name_ar,
            round(sum(credited.sqm), 2)::text as sqm,
            count(distinct credited.dispatch_id)::int as loads
       from credited
       join companies c on c.id = credited.company_id
       join company_categories cc on cc.id = c.category_id
      where credited.day >= $1::date
      group by cc.id, cc.name_en, cc.name_ar
      order by sum(credited.sqm) desc`,
    [from],
  );
}

/** Quotations raised in the window by where they got to, every revision its own row (S32). */
async function endings(from: string): Promise<Record<string, number>> {
  const rows = await query<{ status: string; n: number }>(
    `select q.status::text as status, count(*)::int as n
       from quotations q
       join companies c on c.id = q.company_id
      where c.archived_at is null
        and (q.created_at at time zone 'Asia/Riyadh')::date >= $1::date
      group by 1`,
    [from],
  );
  // The chain's six endings, in the words of the statuses they are.
  const STAGE: Record<string, string> = {
    requested: "waiting",
    returned: "returned",
    cancelled: "withdrawn",
    issued: "withCustomer",
    accepted: "accepted",
    rejected: "rejected",
  };
  const ended: Record<string, number> = {};
  for (const row of rows) ended[STAGE[row.status]] = (ended[STAGE[row.status]] ?? 0) + row.n;
  return ended;
}

/** One month's approved metres and the loads that moved them. */
async function monthOf(month: string) {
  const [row] = await query<{ sqm: string; loads: number }>(
    `${CREDITED}
     select round(coalesce(sum(sqm), 0), 2)::text as sqm,
            count(distinct dispatch_id)::int as loads
       from credited
      where day between $1::date and $2::date`,
    [month, lastOfMonth(month)],
  );
  return row;
}

/** Metres approved in the window by the person each is credited to, and the whole. */
async function metresByPerson(from: string, locale: Locale) {
  const name = locale === "ar" ? "coalesce(nullif(u.name_ar, ''), u.name)" : "u.name";
  const rows = await query<{ name: string; value: string }>(
    `${CREDITED}
     select ${name} as name, round(sum(credited.sqm), 2)::text as value
       from credited
       join users u on u.id = credited.user_id
      where credited.day >= $1::date
      group by u.id, u.name, u.name_ar
      order by sum(credited.sqm) desc`,
    [from],
  );
  const [whole] = await query<{ value: string }>(
    `${CREDITED}
     select round(coalesce(sum(sqm), 0), 2)::text as value from credited where day >= $1::date`,
    [from],
  );
  return { rows, total: whole.value };
}

/** Quotations raised in the window that the customer accepted, by kind of customer. */
async function acceptedBySegment(from: string, locale: Locale) {
  const rows = await query<{ id: number; name: string; value: string }>(
    `select cc.id, ${locale === "ar" ? "cc.name_ar" : "cc.name_en"} as name,
            count(*)::text as value
       from quotations q
       join companies c on c.id = q.company_id
       join company_categories cc on cc.id = c.category_id
      where c.archived_at is null
        and q.status = 'accepted'
        and (q.created_at at time zone 'Asia/Riyadh')::date >= $1::date
      group by cc.id, cc.name_en, cc.name_ar
      order by count(*) desc`,
    [from],
  );
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
  return { rows, total: String(total) };
}

/**
 * The whole per cent a row prints. `common.percent` is `{percent}%`, and the
 * loader isolates the digits (rules/words.md), so two invisible marks sit
 * between the number and its sign.
 */
function percentIn(text: string): number {
  const match = /(\d+)%/.exec(text.replace(/[\u{2066}-\u{2069}]/gu, ""));
  if (!match) throw new Error(`no per cent in «${text}»`);
  return Number(match[1]);
}

/** A card by its heading. */
function card(page: Page, heading: string): Locator {
  return page.locator("section").filter({ hasText: heading }).last();
}

function builderOf(page: Page): Locator {
  return page.locator('[data-slot="builder"]');
}

/**
 * Press a shape in a drawing where the shape actually is. A slice's box is a
 * rectangle round a wedge, and its middle can belong to the slice beside it or
 * to nothing; a bar's box takes in the target rule above it. The point pressed
 * is one the browser itself says is this shape.
 */
async function press(shape: Locator): Promise<void> {
  // Visible, not only attached: the drawing is laid out a moment after the
  // markup around it, and a shape with no box yet has no point to press.
  await expect(shape).toBeVisible(COLD);
  const at = await shape.evaluate((node) => {
    // Scrolled and measured in one turn, so the point is read off the layout
    // it will be pressed in.
    node.scrollIntoView({ block: "center" });
    const box = node.getBoundingClientRect();
    const steps = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9];
    for (const fy of steps) {
      for (const fx of steps) {
        const hit = document.elementFromPoint(box.left + box.width * fx, box.top + box.height * fy);
        if (hit && node.contains(hit)) return { x: box.width * fx, y: box.height * fy };
      }
    }
    return null;
  });
  if (!at) throw new Error("no point of the shape can be pressed");
  await shape.click({ position: at });
}

/** The rows of the list a door landed on: the table's, less its heading. */
async function expectListRows(page: Page, rows: number, what: string): Promise<void> {
  // The note over the list says it is narrowed, and to what (D117).
  await expect(page.locator('[data-slot="narrowing"]'), `${what}: the list does not say it is narrowed`).toBeVisible(COLD);
  await expect(page.getByRole("table").first().getByRole("row"), what).toHaveCount(rows + 1, COLD);
}

/** The builder's table as text: every body row's cells, and the footer's. */
async function builderTable(page: Page) {
  const table = builderOf(page).getByRole("table");
  await expect(table).toBeVisible(COLD);
  const cells = (rows: Locator) =>
    rows.evaluateAll((nodes) =>
      nodes.map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() ?? "")),
    );
  return {
    rows: await cells(table.locator("tbody tr")),
    total: (await cells(table.locator("tfoot tr")))[0] ?? [],
  };
}

/** A CSV the way a spreadsheet reads it: the BOM off, quoted cells, CRLF rows. */
function parseCsv(text: string): string[][] {
  const body = text.replace(/^\u{FEFF}/u, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (body[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && body[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  return rows;
}

/**
 * One question answered three ways that must agree: the table on the screen
 * (formatted for reading), the CSV behind its Export button (as the database
 * gave it, so a spreadsheet adds it up), and this spec's SQL.
 */
async function expectAnswer(
  page: Page,
  t: Translate,
  head: string[],
  expected: { rows: { name: string; value: string }[]; total: string },
  format: (value: string) => string,
): Promise<void> {
  expect(expected.rows.length, "the seed has nothing for this question to count").toBeGreaterThan(0);

  // The screen: every row, whatever the drawing above it folded (D150).
  const table = await builderTable(page);
  expect(table.rows.map(([label, figure]) => [label, figure]).sort()).toEqual(
    expected.rows.map((row) => [row.name, format(row.value)]).sort(),
  );
  // Largest first: each figure no larger than the one above it.
  const figures = table.rows.map(([, figure]) => Number(figure.replaceAll(",", "")));
  expect(figures).toEqual([...figures].sort((a, b) => b - a));
  expect(table.total).toEqual([t("metrics.total"), format(expected.total)]);

  // The file: the same rows, the whole last, UTF-8 with its BOM (D19).
  const href = await builderOf(page).getByRole("link", { name: t("metrics.exportCsv") }).getAttribute("href");
  expect(href, "there is no Export button").toBeTruthy();
  const response = await page.request.get(href as string);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const bytes = await response.body();
  expect([...bytes.subarray(0, 3)], "the file has no BOM, and Excel reads it as ANSI").toEqual([0xef, 0xbb, 0xbf]);

  const [fileHead, ...fileRows] = parseCsv(bytes.toString("utf8"));
  expect(fileHead).toEqual(head);
  const fileTotal = fileRows.pop();
  expect(fileRows.map(([label, value]) => [label, value]).sort()).toEqual(
    expected.rows.map((row) => [row.name, row.value]).sort(),
  );
  expect(fileTotal).toEqual([t("metrics.total"), expected.total]);
}

test("a slice or a bar carries the figure its SQL counts, and pressing it opens a list of exactly that many", async ({
  page,
  locale,
  t,
}) => {
  test.slow(); // Four drawings, four lists, each read from the database.

  const from = rangeStart("quarter");
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=metrics`);

  await test.step("1 · the metres by kind of customer: each slice its figure, the shares a hundred", async () => {
    const shares = await segmentShares(from);
    expect(shares.length, "nothing was approved in the quarter").toBeGreaterThan(1);
    const segments = card(page, t("team.segments"));
    const rows = segments.locator('li[data-slot="share-row"]');
    const kept = shares.length > 6 ? shares.slice(0, 5) : shares;
    await expect(rows).toHaveCount(kept.length + (shares.length > 6 ? 1 : 0), COLD);

    const whole = shares.reduce((sum, share) => sum + Number(share.sqm), 0);
    const printed: number[] = [];
    for (const [index, share] of kept.entries()) {
      const row = rows.nth(index);
      await expect(row).toContainText(locale === "ar" ? share.name_ar : share.name_en);
      await expect(row).toContainText(formatSqmWhole(share.sqm));
      // The share is written beside the part, a whole per cent within one of
      // the exact one — and the parts add up to a hundred, not to 99 or 101.
      const percent = percentIn(await row.innerText());
      expect(Math.abs(percent - (Number(share.sqm) / whole) * 100)).toBeLessThan(1);
      printed.push(percent);
    }
    if (shares.length <= 6) expect(printed.reduce((sum, n) => sum + n, 0)).toBe(100);
  });

  await test.step("2 · pressing the largest slice opens exactly the loads it counted", async () => {
    const [largest] = await segmentShares(from);
    await press(card(page, t("team.segments")).locator(`[data-slice="${largest.id}"]`));
    await expect(page).toHaveURL(/\/dispatches\?/, COLD);
    await expectListRows(page, largest.loads, "the loads behind the slice");
  });

  await test.step("3 · where quotations go: each ending its count, and pressing one opens that many", async () => {
    await page.goto(`/${locale}/team?tab=metrics`);
    const ended = await endings(from);
    for (const stage of ["waiting", "returned", "withdrawn", "withCustomer", "accepted", "rejected"]) {
      await expect(page.locator(`li[data-stage="${stage}"] .num`).first(), stage).toHaveText(
        String(ended[stage] ?? 0),
        COLD,
      );
    }

    // The ending with the most in it, so the slice is one a thumb can find.
    const [stage, count] = Object.entries(ended).sort((a, b) => b[1] - a[1])[0];
    await press(card(page, t("team.chainTitle")).locator(`[data-slice="${stage}"]`));
    await expect(page).toHaveURL(/\/quotations\?/, COLD);
    await expectListRows(page, count, `the quotations that ended ${stage}`);
  });

  await test.step("4 · last month's bar says its metres and opens the loads that moved them", async () => {
    await page.goto(`/${locale}/team?tab=metrics`);
    const month = addMonths(firstOfMonth(todayRiyadh()), -1);
    const expected = await monthOf(month);
    expect(expected.loads, "nothing was approved last month").toBeGreaterThan(0);

    await expect(page.locator(`[data-month="${month}"] [data-slot="bar-figure"]`)).toHaveText(
      formatSqmWhole(expected.sqm),
      COLD,
    );
    await press(page.locator(`[data-bar="${month}:achieved"]`));
    await expect(page).toHaveURL(/\/dispatches\?/, COLD);
    await expectListRows(page, expected.loads, "last month's loads");
  });

  await test.step("5 · the builder's pie is a door as well", async () => {
    await page.goto(`/${locale}/team?tab=metrics&m=accepted&by=segment&p=quarter`);
    const { rows } = await acceptedBySegment(from, locale);
    expect(rows.length, "nothing was accepted in the quarter").toBeGreaterThan(0);
    const [largest] = rows;
    await press(builderOf(page).locator(`[data-slice="${largest.id}"]`));
    await expect(page).toHaveURL(/\/quotations\?/, COLD);
    await expectListRows(page, Number(largest.value), "the accepted quotations behind the slice");
  });
});

test("the builder answers two questions in tables its SQL agrees with, keeps them in the address, and exports the same rows", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=metrics`);
  const builder = builderOf(page);
  // Exact names: "This month" is also the start of "This month against last".
  const chip = (group: string, choice: string) =>
    builder
      .getByRole("group", { name: group, exact: true })
      .getByRole("link", { name: choice, exact: true });
  const choose = async (group: string, choice: string, inUrl: RegExp) => {
    await chip(group, choice).click();
    await expect(page).toHaveURL(inUrl, COLD);
    await expect(chip(group, choice)).toHaveAttribute("aria-current", "true");
  };

  await test.step("1 · metres approved, by person, this month", async () => {
    // Metres and person are what the builder opens on; the month is pressed.
    await choose(t("common.window"), t("common.range.month"), /[?&]p=month\b/);
    await expect(page).toHaveURL(/[?&]m=metres\b/);
    await expect(page).toHaveURL(/[?&]by=rep\b/);

    await expectAnswer(
      page,
      t,
      [t("metrics.by.rep"), t("metrics.measure.metres")],
      await metresByPerson(rangeStart("month"), locale),
      (value) => formatNumber(value, 2),
    );
  });

  await test.step("2 · quotations accepted, by kind of customer, over the last three months", async () => {
    await choose(t("metrics.measureLabel"), t("metrics.measure.accepted"), /[?&]m=accepted\b/);
    await choose(t("metrics.byLabel"), t("metrics.by.segment"), /[?&]by=segment\b/);
    await choose(t("common.window"), t("common.range.quarter"), /[?&]p=quarter\b/);

    const expected = await acceptedBySegment(rangeStart("quarter"), locale);
    await expectAnswer(
      page,
      t,
      [t("metrics.by.segment"), t("metrics.measure.accepted")],
      expected,
      (value) => formatNumber(value, 0),
    );

    // A link is the question: opened cold, the address asks it again.
    await page.goto(page.url());
    const table = await builderTable(page);
    expect(table.rows).toHaveLength(expected.rows.length);
  });
});

test("a chart starts where the page's reader starts: the first month, the first bar, the first slice", async ({
  page,
  locale,
  t,
}) => {
  const rtl = locale === "ar";
  await login(page, locale, "abdulrahman");

  await test.step("1 · the six months run from the inline start, each bar under its own name", async () => {
    await page.goto(`/${locale}/team?tab=metrics`);
    await expect(page.locator("[data-month]")).toHaveCount(6, COLD);
    // The drawing is laid out a moment after the words over it.
    await expect(page.locator('[data-bar$=":achieved"] path').first()).toBeVisible(COLD);
    const columns = await page.locator("[data-month]").evaluateAll((nodes) =>
      nodes.map((node) => {
        const month = node.getAttribute("data-month");
        const label = node.getBoundingClientRect();
        const bar = document.querySelector(`[data-bar="${month}:achieved"] path`)?.getBoundingClientRect();
        return {
          left: label.left,
          right: label.right,
          bar: bar && bar.width > 0 ? (bar.left + bar.right) / 2 : null,
        };
      }),
    );
    const [first, last] = [columns[0], columns[columns.length - 1]];
    if (rtl) expect(first.right, "the oldest month is not at the inline start").toBeGreaterThan(last.right);
    else expect(first.left, "the oldest month is not at the inline start").toBeLessThan(last.left);

    // Recharts has no direction of its own: a bar left where English puts it
    // would stand under another month's name in Arabic.
    const drawn = columns.filter((column) => column.bar !== null);
    expect(drawn.length, "no month has a bar").toBeGreaterThan(1);
    for (const column of drawn) {
      expect(column.bar).toBeGreaterThan(column.left);
      expect(column.bar).toBeLessThan(column.right);
    }
  });

  await test.step("2 · a person's bar grows from the inline start, beside the name", async () => {
    await page.goto(`/${locale}/team?tab=metrics&m=metres&by=rep&p=quarter`);
    const bars = builderOf(page).locator('[data-slot="bars"]');
    await expect(bars.locator("[data-bar] path").last()).toBeVisible(COLD);
    // The LAST person's bar: the first is the longest, runs the whole width of
    // the plot, and would touch both edges whichever way the axis ran.
    const boxes = await bars.evaluate((node) => {
      const labels = node.querySelectorAll("[data-row]");
      const label = labels[labels.length - 1];
      const key = label?.getAttribute("data-row");
      const bar = node.querySelector(`[data-bar^="${key}:"] path`)?.getBoundingClientRect();
      const plot = node.querySelector('[data-slot="chart"]')?.getBoundingClientRect();
      const name = label?.getBoundingClientRect();
      return bar && plot && name && labels.length > 1
        ? {
            bar: { left: bar.left, right: bar.right },
            plot: { left: plot.left, right: plot.right },
            name: { left: name.left, right: name.right },
          }
        : null;
    });
    if (!boxes) throw new Error("fewer than two people have a bar to compare");
    expect(boxes.bar.right - boxes.bar.left, "the last bar is as long as the first").toBeLessThan(
      boxes.plot.right - boxes.plot.left - 4,
    );
    if (rtl) {
      expect(Math.abs(boxes.bar.right - boxes.plot.right)).toBeLessThanOrEqual(2);
      expect(boxes.name.left).toBeGreaterThanOrEqual(boxes.plot.right);
    } else {
      expect(Math.abs(boxes.bar.left - boxes.plot.left)).toBeLessThanOrEqual(2);
      expect(boxes.name.right).toBeLessThanOrEqual(boxes.plot.left);
    }
  });

  await test.step("3 · the pie's first slice leaves twelve o'clock towards the inline end", async () => {
    await page.goto(`/${locale}/team?tab=metrics`);
    const chain = card(page, t("team.chainTitle"));
    const first = chain.locator("[data-slice]").first();
    await expect(first).toBeVisible(COLD);
    const key = await first.getAttribute("data-slice");
    const share = percentIn(await chain.locator(`li[data-stage="${key}"]`).innerText());
    // Half a pie or more reaches both sides of the circle, and has no side.
    expect(share, "the first ending is half of the quarter or more").toBeLessThan(50);

    const boxes = await first.evaluate((node) => {
      const slice = node.getBoundingClientRect();
      const circle = node.closest("svg")?.getBoundingClientRect();
      return circle ? { left: slice.left, right: slice.right, centre: circle.left + circle.width / 2 } : null;
    });
    if (!boxes) throw new Error("the slice is not in a drawing");
    // Clockwise in English, so the first part sits right of the top; the other
    // way round in Arabic, as the list beside it reads from the other side.
    if (rtl) {
      expect(boxes.right).toBeLessThanOrEqual(boxes.centre + 2);
      expect(boxes.left).toBeLessThan(boxes.centre - 2);
    } else {
      expect(boxes.left).toBeGreaterThanOrEqual(boxes.centre - 2);
      expect(boxes.right).toBeGreaterThan(boxes.centre + 2);
    }
  });
});

test("printed, the metrics tab is the builder's question, chart and table, without the shell", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team?tab=metrics&m=accepted&by=segment&p=quarter`);

  const builder = builderOf(page);
  const table = builder.getByRole("table");
  await expect(table).toBeVisible(COLD);
  const rows = await table.getByRole("row").count();
  expect(rows, "the question has nothing in its table").toBeGreaterThan(2);

  // On screen first, so a hidden thing below is hidden by the print and not by
  // a locator that never found it.
  // A role locator leaves out what is not displayed, so a count is what shows.
  const shell = {
    topBar: page.getByRole("banner"),
    rail: page.getByRole("navigation", { name: t("shell.mainNav") }),
    tabs: page.getByRole("navigation", { name: t("common.sections") }),
    picker: page.getByRole("main").getByRole("combobox"),
    rangeChips: page.locator('[data-slot="range-chips"]').filter({ visible: true }),
    exportCsv: builder.getByRole("link", { name: t("metrics.exportCsv") }),
    chips: builder.getByRole("group", { name: t("metrics.measureLabel"), exact: true }),
    otherCards: page.getByRole("heading", { name: t("team.segments") }),
  };
  for (const [name, locator] of Object.entries(shell)) {
    await expect(locator, `${name} is not on the screen to begin with`).toHaveCount(1);
  }

  await page.emulateMedia({ media: "print" });

  // No shell — the rail, the top bar, the bottom bar, the tabs — nothing a
  // pointer would press, and none of the other cards on the tab.
  for (const [name, locator] of Object.entries(shell)) {
    await expect(locator, `${name} is printed`).toHaveCount(0);
  }
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);

  // The question in words, its drawing, and every row of its table.
  await expect(builder).toContainText(
    t("metrics.question", {
      measure: t("metrics.measure.accepted"),
      by: t("metrics.by.segment"),
      period: t("common.range.quarter"),
    }),
  );
  await expect(builder.locator('[data-slot="share-pie"]')).toBeVisible();
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(rows);
});
