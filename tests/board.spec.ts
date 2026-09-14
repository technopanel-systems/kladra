import { login } from "./helpers/auth";
import { one, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";
import { quotationLabel } from "@/lib/labels";
import { DEFAULT_VIEW, parseView, viewFor, type ListView } from "@/lib/view";

/**
 * The second view, on the two screens that earn one (DESIGN §6).
 *
 * A board is worth building only if it answers "what is stuck", so what is
 * checked here is the two things that make it answer that: a column carries the
 * count of what is in it, and every card in a column really is in that state. A
 * board that shows the right cards in the wrong columns looks perfect and is
 * worse than the list it replaced.
 *
 * And the part that has no appearance in English: in Arabic the first column is
 * the RIGHTMOST one. That is measured, not looked at — three reviews in a row
 * have read an RTL line left to right and called it a defect.
 */

const COLD = { timeout: 30_000 };

/**
 * Waits until the SERVER has stored the remembered view, by asking it: the
 * quotations screen with no `?view=` on it answers with whatever the memory
 * says (SPEC §3, D164).
 *
 * There is nothing in the browser to look at any more. The choice used to be a
 * cookie, which a spec could read out of the jar; it is a row of
 * `screen_choices` now, written by an effect after hydration and read back only
 * by the server. Two things make polling the screen safe rather than
 * deadlocked: the `page` fixture's `goto` already waits for `html[data-hydrated]`,
 * so the write has been SENT before this is called, and a visit with no view on
 * it writes nothing itself — it agrees with what it was given — so this cannot
 * overwrite the answer it is waiting for.
 */
async function remembered(
  page: import("@playwright/test").Page,
  locale: string,
  name: string,
  view: ListView,
): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.goto(`/${locale}/quotations`);
        return await page
          .getByRole("link", { name })
          .getAttribute("aria-current", { timeout: 10_000 });
      },
      { timeout: COLD.timeout, message: `"${view}" was never remembered for this person` },
    )
    .toBe("true");
}

/** The columns on screen, as the accessible name reports them: "Issued (3)". */
async function columns(page: import("@playwright/test").Page) {
  const labels = await page
    .locator("[data-slot='board']")
    .getByRole("region")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label") ?? ""));

  return labels.map((label) => {
    const open = label.lastIndexOf("(");
    const close = label.lastIndexOf(")");
    return {
      label,
      name: open > 0 ? label.slice(0, open).trim() : label,
      count: open > 0 && close > open ? Number(label.slice(open + 1, close)) : Number.NaN,
    };
  });
}

test("the URL wins, the person remembers, and the list is the default", () => {
  expect(parseView("board")).toBe("board");
  expect(parseView("list")).toBe("list");
  expect(parseView("kanban")).toBeNull();
  expect(parseView(undefined)).toBeNull();

  expect(viewFor("board", "list")).toBe("board");
  expect(viewFor(undefined, "board")).toBe("board");
  expect(viewFor(undefined, undefined)).toBe(DEFAULT_VIEW);
  expect(viewFor("nonsense", "board")).toBe("board");
});

test("every card is in the column its status names, and the counts agree", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "rawan");

  const screens = [
    {
      name: "quotations",
      keys: [
        "quotations.statusRequested",
        "quotations.statusReturned",
        "quotations.statusIssued",
        "quotations.statusAccepted",
        "quotations.statusRejected",
        // Withdrawn. Not a filter chip — nobody is waiting on a withdrawn
        // request — but a column, because a state with no column is a record
        // that vanishes when a rep presses Board.
        "quotations.statusCancelled",
      ],
    },
    {
      name: "dispatches",
      keys: [
        "dispatches.statusSubmitted",
        "dispatches.statusApproved",
        "dispatches.statusRefused",
      ],
    },
  ];

  for (const screen of screens) {
    await page.goto(`/${locale}/${screen.name}?view=board`);
    await expect(page.getByRole("heading").first()).toBeVisible(COLD);

    const seen = await columns(page);
    expect(seen.length, `${screen.name} drew ${seen.length} columns`).toBe(screen.keys.length);

    let onBoard = 0;
    for (const key of screen.keys) {
      const label = t(key);
      const column = seen.find((one) => one.name === label);
      expect(column, `${screen.name} has no "${label}" column`).toBeTruthy();
      if (!column) continue;

      // The heading's own count against what the column actually drew: a board
      // whose number and cards disagree is worse than no number.
      const cards = await page
        .locator("[data-slot='board']")
        .getByRole("region", { name: column.label })
        .getByRole("listitem")
        .count();
      expect(cards, `"${label}" counted ${column.count} and drew ${cards}`).toBe(column.count);
      onBoard += cards;
    }

    // The same rows as the list, split up rather than filtered down: a board
    // that quietly drops a state is the defect this catches.
    await page.goto(`/${locale}/${screen.name}?view=list`);
    await expect(page.getByRole("heading").first()).toBeVisible(COLD);
    const rows = await page.getByRole("row").count();
    expect(onBoard, `${screen.name}: ${onBoard} on the board, ${rows - 1} in the list`).toBe(
      Math.max(rows - 1, 0),
    );
  }
});

/**
 * The founder's sentence, which the cookie could not keep: "remembered per
 * person and carried in the URL" (SPEC §3, D164).
 *
 * The signing-in between the steps is the point. `login` clears every cookie
 * first, so each of these is a different browser as far as this app can tell —
 * her desk in the morning and her phone in the car. A memory that survives that
 * is hers; a memory that does not was the machine's all along.
 */
test("the view a person chose comes back on another browser, and is only theirs", async ({
  page,
  locale,
  t,
}) => {
  const board = t("common.viewBoard");
  const list = t("common.viewList");
  await login(page, locale, "rawan");

  await page.goto(`/${locale}/quotations?view=board`);
  await expect(page.getByRole("heading").first()).toBeVisible(COLD);
  await remembered(page, locale, board, "board");

  // Her choice, on this screen. The dispatches list is a different question and
  // has not been asked, so it opens on the list it always did.
  await page.goto(`/${locale}/dispatches`);
  await expect(page.getByRole("link", { name: list })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );

  // A clean session — no cookie of hers survives it — and the board is still
  // what quotations opens on.
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations`);
  await expect(page.getByRole("link", { name: board })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );

  // And it is hers alone: the next man to sign in at this machine gets the list
  // he never left.
  await login(page, locale, "faisal");
  await page.goto(`/${locale}/quotations`);
  await expect(page.getByRole("link", { name: list })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );

  // Choosing the list puts it back — the row is overwritten, not only written.
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?view=board`);
  await page.getByRole("link", { name: list }).click();
  await expect(page.getByRole("link", { name: list })).toHaveAttribute(
    "aria-current",
    "true",
    COLD,
  );
  await remembered(page, locale, list, "list");
});

test("in Arabic the first column is the one on the right", async ({ page, locale }) => {
  test.skip(locale !== "ar", "the question only exists right-to-left");
  await login(page, locale, "rawan");

  await page.goto(`/${locale}/quotations?view=board`);
  await expect(page.getByRole("heading").first()).toBeVisible(COLD);

  const lefts = await page
    .locator("[data-slot='board']")
    .getByRole("region")
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));

  expect(lefts.length, "no columns on the board").toBeGreaterThan(1);
  // Requested is first in the work's own order, so on an RTL screen it is the
  // furthest right and every column after it is further left.
  for (let i = 1; i < lefts.length; i += 1) {
    expect(lefts[i], `column ${i} is not to the left of column ${i - 1}`).toBeLessThan(lefts[i - 1]);
  }
});

/**
 * P13-G6 — a phone shows one column at a time, under a picker that names them.
 *
 * Every column was 16rem in a sideways scroller at every width, so 375 pixels
 * showed one column and ninety of the next with its header cut, «SENT BAC» —
 * an edge that looked like something to drag. The walk: the picker names every
 * column in the board's own order, from the inline start, with its count; one is
 * chosen; the board draws that one and only that one, across the whole width;
 * tapping another moves both, puts it on the address and keeps it there through
 * a card's drawer; and the arrows move along the line in the reader's direction.
 */
test("on a phone the board is one column at a time, under a picker that names every column", async ({
  page,
  locale,
  t,
}) => {
  test.slow();
  const keys = [
    "quotations.statusRequested",
    "quotations.statusReturned",
    "quotations.statusIssued",
    "quotations.statusAccepted",
    "quotations.statusRejected",
    "quotations.statusCancelled",
  ];
  await page.setViewportSize({ width: 375, height: 812 });
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?view=board`);

  const picker = page.getByRole("tablist", { name: t("common.status") });
  await expect(picker).toBeVisible(COLD);
  const tabs = picker.getByRole("tab");
  const regions = page.locator("[data-slot='board']").getByRole("region");

  /** The one column drawn, which must be the one the picker has chosen. */
  async function shows(label: string) {
    await expect(picker.getByRole("tab", { selected: true })).toHaveCount(1);
    await expect(picker.getByRole("tab", { selected: true })).toContainText(label);
    await expect(regions).toHaveCount(1);
    const literal = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(regions.first()).toHaveAccessibleName(new RegExp(`^${literal} \\(\\d+\\)$`));
  }

  await test.step("every column is named, in order, each with its count", async () => {
    await expect(tabs).toHaveCount(keys.length);
    for (const [index, key] of keys.entries()) {
      await expect(tabs.nth(index)).toContainText(t(key));
      await expect(tabs.nth(index)).toContainText(/\d/);
    }
    const [one, two] = await Promise.all([tabs.nth(0).boundingBox(), tabs.nth(1).boundingBox()]);
    if (locale === "ar") expect(one!.x + one!.width, "the first stage is not at the right").toBeGreaterThan(two!.x + two!.width);
    else expect(one!.x, "the first stage is not at the left").toBeLessThan(two!.x);
  });

  await test.step("one column is drawn, across the whole width, and the page does not scroll sideways", async () => {
    const label = (await picker.getByRole("tab", { selected: true }).innerText()).replace(/\s*\d+\s*$/, "").trim();
    await shows(label);
    const surface = page.getByRole("region", { name: t("common.viewBoard"), exact: true });
    const [column, board] = await Promise.all([regions.first().boundingBox(), surface.boundingBox()]);
    expect(column!.width, "the column does not take the board's width").toBeGreaterThan(board!.width - 16);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(sideways, "the board widened the page").toBeLessThanOrEqual(0);
  });

  const issued = t("quotations.statusIssued");
  await test.step("tapping a stage draws it and writes it on the address", async () => {
    await tabs.filter({ hasText: issued }).click();
    await shows(issued);
    await expect(page).toHaveURL(/[?&]stage=issued\b/);
  });

  await test.step("a card opened from the column comes back to the same column", async () => {
    await regions.first().getByRole("link").first().click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible(COLD);
    await expect(page).toHaveURL(/[?&]stage=issued\b/);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden(COLD);
    await shows(issued);
  });

  await test.step("the arrows move along the line the way it reads", async () => {
    await picker.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press(locale === "ar" ? "ArrowLeft" : "ArrowRight");
    const accepted = t("quotations.statusAccepted");
    await shows(accepted);
    await expect(tabs.filter({ hasText: accepted })).toBeFocused();
  });
});

/**
 * P13-G6 — on a desk the edge says there is more. Two of the quotation board's
 * six columns sat past the edge at 1366 with nothing to show they existed; the
 * columns are sized to the room now, so where they do not all fit a sliver of
 * the next one stands at the inline end, and where they do they fill the width
 * with nothing cut. And a column's heading is a word in a sentence's case, not a
 * tracked eyebrow (DESIGN §8).
 */
test("on a desk a sliver of the next column shows where the columns do not all fit", async ({
  page,
  locale,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await login(page, locale, "rawan");
  const rtl = locale === "ar";

  /** How far each column reaches past the scroller's inline end, in pixels (negative: inside it). */
  async function past(path: string) {
    await page.goto(`/${locale}${path}`);
    const board = page.locator("[data-slot='board']");
    await expect(board.getByRole("region").first()).toBeVisible(COLD);
    return board.evaluate((node, rtl) => {
      const room = node.parentElement!.getBoundingClientRect();
      const columns = [...node.querySelectorAll(":scope > section")].map((one) => one.getBoundingClientRect());
      return {
        room: room.width,
        reach: columns.map((one) => (rtl ? room.left - one.left : one.right - room.right)),
        start: columns.map((one) => (rtl ? room.right - one.right : one.left - room.left)),
        width: columns.map((one) => one.width),
      };
    }, rtl);
  }

  await test.step("six columns that do not fit: whole ones, then a sliver", async () => {
    const { reach, width } = await past("/quotations?view=board");
    const cut = reach.findIndex((one) => one > 1);
    expect(cut, "every column fits at 1366 — nothing to prove").toBeGreaterThan(0);
    for (const one of reach.slice(0, cut)) expect(one, "a column before the sliver is cut").toBeLessThanOrEqual(1);
    const sliver = width[cut] - reach[cut];
    expect(sliver, `the next column shows ${Math.round(sliver)}px`).toBeGreaterThanOrEqual(24);
    expect(sliver, `the next column shows ${Math.round(sliver)}px`).toBeLessThanOrEqual(64);
  });

  await test.step("three columns that fit: the width filled, nothing cut", async () => {
    const { reach, start, room } = await past("/dispatches?view=board");
    expect(reach.length).toBe(3);
    for (const one of reach) expect(one, "a column is cut where all three fit").toBeLessThanOrEqual(1);
    expect(start[0], "the first column is not at the inline start").toBeLessThan(16);
    expect(reach[reach.length - 1], `the columns leave ${-reach[reach.length - 1]}px of ${room} empty`).toBeGreaterThan(-16);
  });

  await test.step("a column's heading is a word, not an eyebrow", async () => {
    const heading = page.locator("[data-slot='board'] section header h3").first();
    const look = await heading.evaluate((el) => {
      const style = getComputedStyle(el);
      return { transform: style.textTransform, tracking: style.letterSpacing };
    });
    expect(look.transform).toBe("none");
    expect(look.tracking).toBe("normal");
  });
});

/**
 * P13-G6 — the board is the view read for what moved, and it was the one view
 * where nothing said a card had just moved. A list row somebody else changed
 * takes the arrived flash (D105); a card now does the same where it lands.
 *
 * The write is the one tests/live.spec.ts makes, for the same reason: a request
 * copied from one already on the desk, announced on the channel the app's own
 * writes use, and taken away again by id.
 */
test("a card somebody else just added takes the arrived flash on the board", async ({ page, locale }) => {
  test.slow();
  await login(page, locale, "rawan");
  const rawanId = await userId("rawan@technopanel.com.sa");
  await page.goto(`/${locale}/quotations?view=board`);
  await expect(page.locator("[data-slot='board']").getByRole("region").first()).toBeVisible(COLD);

  // The listener opens once her own EventSource reaches the server.
  await expect
    .poll(
      async () =>
        (
          await query<{ pid: string }>(
            `select pid from pg_stat_activity
              where application_name = 'kladra-live' and datname = current_database()`,
          )
        ).length,
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);

  const source = await one<{ id: string }>(
    `select id from quotations where status = 'requested' order by created_at limit 1`,
  );
  const inserted = await one<{ id: string; number: number }>(
    `insert into quotations
       (number, company_id, project_id, rep_id, raised_by_id, status, notes, warehouse_id,
        created_at, updated_at)
     select nextval('quotation_numbers'), company_id, project_id, rep_id, raised_by_id, 'requested', notes,
            warehouse_id, now(), now()
       from quotations where id = $1::uuid
     returning id, number`,
    [source.id],
  );

  try {
    await query("select pg_notify('kladra', $1::text)", [
      JSON.stringify({
        userIds: [rawanId],
        event: {
          type: "quotation",
          id: inserted.id,
          number: quotationLabel(inserted.number, 1),
          status: "requested",
        },
      }),
    ]);
    const card = page.locator(`[data-slot='board'] a[href*="open=${inserted.id}"]`);
    await expect(card, "the new request never reached the board").toBeVisible(COLD);
    await expect(card).toHaveClass(/\brow-arrived\b/);
  } finally {
    await query("delete from quotation_items where quotation_id = $1::uuid", [inserted.id]);
    await query("delete from quotations where id = $1::uuid", [inserted.id]);
  }
});

test("the open card is a wash on the board, never a ring", async ({ page, locale }) => {
  await login(page, locale, "rawan");
  await page.goto(`/${locale}/quotations?view=board`);
  const card = page.locator("[data-slot='board'] a[href*='open=']").first();
  await expect(card).toBeVisible(COLD);
  await card.click();

  // The same wash the list gives its open row. A ring was the alert red DESIGN
  // §1 had already retired from every surface (P11G, §5 #34).
  const current = page.locator("[data-slot='board'] a[aria-current='true']");
  await expect(current).toHaveCount(1, COLD);
  await expect(current).toHaveClass(/\bbg-surface-2\b/);
  await expect(current).not.toHaveClass(/\bring-/);
});
