import { login } from "./helpers/auth";
import { query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * Numbers that answer a question, and say what they mean beside it
 * (SPEC D59, Jerom's phase 9C).
 *
 * His rule was one sentence: every number must answer a question somebody asks
 * daily, and the screen must say what the number means in words next to it. Two
 * things follow that a spec can hold, and both of them are the failure this app
 * has had before rather than a style preference:
 *
 *  - a figure and the list under it come from ONE definition. The strip that
 *    says "3 waiting" and the three rows beneath it cannot be counted twice
 *    (rules/data.md), and the caption that says how many are late cannot
 *    disagree with which rows are marked late.
 *  - a figure carries its caption. A number with nothing to be measured against
 *    is the thing Jerom was looking at when he wrote the note.
 */

const COLD = { timeout: 30_000 };

test("the coordinator's four figures each say what they mean", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "rawan");
  await expect(page).toHaveURL(new RegExp(`/${locale}/queue`), COLD);
  await expect(page.getByRole("heading", { name: t("common.queue") })).toBeVisible(COLD);

  const strip = page.locator('[data-slot="standing"]').first();

  await test.step("1 · every one of them carries a line of words", async () => {
    // Four figures, four captions. A figure without one is a number Jerom is
    // being asked to interpret, which is the whole of the note.
    await expect(strip.locator("> div")).toHaveCount(4);
    await expect(strip.locator('[data-slot="figure-caption"]')).toHaveCount(4);
  });

  await test.step("2 · the longest wait is a length, and it is the worst row's", async () => {
    // It used to be a date, which makes the reader do working-day arithmetic in
    // their head and get it wrong over a weekend (D59).
    // `:visible` because every row is rendered twice — a card layout for the
    // phone and a table for the desk, one of them hidden by CSS at any width.
    // Counting DOM nodes here would count each row twice and quietly pass.
    const shown = await page.locator('[data-slot="waited"]:visible').allInnerTexts();
    expect(shown.length, "nothing is waiting on the seeded queue").toBeGreaterThan(0);

    // The number inside each "N working days" — the words differ by locale, the
    // digits do not (D6).
    const days = shown.map((text) => Number(text.replace(/[^\d]/g, "") || 0));
    const worst = Math.max(...days);

    const longest = strip.locator("> div").filter({ hasText: t("queue.longestWait") });
    await expect(longest).toContainText(String(worst));
  });

  await test.step("3 · the caption's count of late ones is the rows that are marked late", async () => {
    const lateRows = await page.locator('[data-slot="waited"][data-late="true"]:visible').count();
    expect(lateRows, "nothing on the seeded queue is late").toBeGreaterThan(0);

    // Read from the element, not from the sentence. The sentence has two
    // numbers in it — how many are late, and what late means — which is right
    // for a person and useless for a test; `data-tone` is already how a spec
    // reads a colour without reading a hex (DESIGN §6).
    const counted = (await page.locator("[data-late-count]").all()).reduce(
      async (running, node) => (await running) + Number(await node.getAttribute("data-late-count")),
      Promise.resolve(0),
    );
    expect(await counted, "the strip and the rows disagree about what is late").toBe(lateRows);
  });

  await test.step("4 · and a late row says so in a word, not only in red", async () => {
    // "3 working days" red and "3 working days" grey are the same sentence in
    // the same shape. Colour may carry a state; it may never be the only thing
    // carrying it (DESIGN §5).
    const late = page.locator('[data-slot="waited"][data-late="true"]:visible');
    for (const row of await late.all()) {
      await expect(row).toContainText(t("queue.late"));
    }
    await expect(
      page.locator('[data-slot="waited"]:visible').filter({ hasNotText: t("queue.late") }).first(),
      "every row on the queue reads as late",
    ).toBeVisible();
  });
});

test("the manager's four figures each say which number they are", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "abdulrahman");
  await expect(page).toHaveURL(new RegExp(`/${locale}/team`), COLD);

  const strip = page.locator('[data-slot="standing"]').first();

  await test.step("1 · four figures, four lines of words", async () => {
    await expect(strip.locator("> div")).toHaveCount(4, COLD);
    await expect(strip.locator('[data-slot="figure-caption"]')).toHaveCount(4);
  });

  await test.step("2 · the two follow-up figures cannot be read as the same one", async () => {
    // The strip counts follow-ups more than three days past their date; the
    // column in the table below counts every overdue one. Two numbers, and
    // until P9.4 their names were a letter apart — "Follow-ups overdue" over
    // "Overdue follow-ups" (rules/data.md: one definition per figure).
    const stripLabel = t("team.stuckFollowUps");
    const columnLabel = t("team.overdueFollowUps");
    expect(stripLabel, "the two follow-up figures share a name again").not.toBe(columnLabel);

    // And the strip says its threshold out loud, so a reader knows which is
    // which without being told twice.
    const followUps = strip.locator("> div").filter({ hasText: stripLabel });
    await expect(followUps.locator('[data-slot="figure-caption"]')).toHaveText(
      t("team.stuckFollowUpsMeans", { days: 3 }),
    );
  });

  await test.step("3 · a rep's month card says whose month and when", async () => {
    // Drilling into a rep from the team table used to title the card with his
    // bare name, so Achieved / Target / Pace sat under it with no month.
    const row = page.getByRole("table").first().getByRole("link").first();
    const name = ((await row.innerText()) || "").split(/\r?\n/)[0].trim();
    await row.click();

    await expect(page).toHaveURL(/\?rep=/, COLD);
    await expect(
      page.getByRole("heading", { name: t("team.monthOf", { name }) }),
    ).toBeVisible(COLD);
  });

  await test.step("4 · and his floor says what is in play on it", async () => {
    // The band a company and a project have had since P8.5, for the person in
    // between them (D78). Checked against the database rather than against the
    // team row it was opened from: a figure derived twice is two figures, which
    // is the defect this whole file exists to catch.
    // Faisal by name, not whichever row sorts first: the table's first row is
    // the manager himself, whose floor is empty by definition, and a spec that
    // checks nought against nought passes for ever without proving anything
    // (rules/data.md).
    const repId = await userId("faisal@technopanel.com.sa");
    await page.goto(`/${locale}/companies?rep=${repId}`);

    const floor = page.locator('[data-slot="standing"]').first();
    await expect(floor.locator("> div")).toHaveCount(3, COLD);
    await expect(floor.locator('[data-slot="figure-caption"]')).toHaveCount(3);

    const live = `not exists (
      select 1 from quotations later
       where later.number = q.number and later.revision > q.revision)`;
    const mine = `exists (
      select 1 from companies c
       where c.id = q.company_id and c.rep_id = $1::uuid and c.archived_at is null)`;

    const [counts] = await query<{ open: number; with_customer: number; stopped: number }>(
      `select
         (select count(*)::int from quotations q
           where q.status in ('requested', 'returned', 'issued') and ${live} and ${mine}) as open,
         (select count(*)::int from quotations q
           where q.status = 'issued' and ${live} and ${mine}) as with_customer,
         (select count(*)::int from quotations q
           where q.status = 'returned' and ${live} and ${mine})
         + (select count(*)::int from dispatches d
              join quotations q on q.id = d.quotation_id
             where d.status = 'refused' and ${mine}) as stopped`,
      [repId],
    );
    expect(counts.open, "nothing is open on the seeded floor").toBeGreaterThan(0);

    const figure = (label: string) =>
      floor.locator("> div").filter({ hasText: label }).locator("dd").first();
    await expect(figure(t("team.openQuotations"))).toHaveText(String(counts.open));
    await expect(figure(t("team.sentBackOrRefused"))).toHaveText(String(counts.stopped));

    // And the caption is the part of the open figure nobody here can move by
    // working harder: the ones the customer is holding (D59).
    await expect(
      floor
        .locator("> div")
        .filter({ hasText: t("team.openQuotations") })
        .locator('[data-slot="figure-caption"]'),
    ).toHaveText(t("team.openWithCustomer", { count: counts.with_customer }));
  });
});

test("there is a month before this one, and it says which way it went", async ({
  page,
  locale,
}) => {
  test.slow();

  await login(page, locale, "abdulrahman");
  await expect(page).toHaveURL(new RegExp(`/${locale}/team`), COLD);

  const months = page.locator("[data-month]");

  await test.step("1 · six of them, oldest first, this one last", async () => {
    await expect(months).toHaveCount(6, COLD);

    const order = await months.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-month") ?? ""),
    );
    expect([...order].sort()).toEqual(order);
  });

  await test.step("2 · every one of them carries its figure as text, not as a shape", async () => {
    // The bars are aria-hidden on purpose: there is nothing in the picture that
    // is not in the number above it, so a reader who cannot see the shape has
    // lost nothing (D61).
    const figures = await page.locator('[data-slot="month-sqm"]').allInnerTexts();
    expect(figures).toHaveLength(6);
    for (const figure of figures) expect(figure.trim()).not.toBe("");
  });

  await test.step("3 · no label is cut, at the width where labels get cut", async () => {
    // «سبتمبر 2026» truncated from the end reads as a different year, which is
    // the one thing an axis label may never do (D65). Measured, not eyeballed:
    // a label whose text is wider than its box is a label being cut.
    await page.setViewportSize({ width: 375, height: 900 });
    const cut = await page
      .locator('[data-month] [data-slot="month-label"]')
      .evaluateAll((nodes) =>
        nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent ?? ""),
      );
    expect(cut).toEqual([]);

    // And the bars still stand on one baseline, which the second line would
    // break if it were only rendered on the columns that show a year.
    const bottoms = await page
      .locator("[data-month]")
      .evaluateAll((nodes) => nodes.map((n) => Math.round(n.getBoundingClientRect().bottom)));
    expect(new Set(bottoms).size).toBe(1);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  await test.step("4 · and one sentence says which way the last finished month went", async () => {
    // Against the month before it, never against this one — this one is a few
    // days old and would read as a collapse on the third of every month.
    const card = page.locator("[data-month]").first().locator("xpath=ancestor::section[1]");
    await expect(card).toContainText(/%/);
  });
});

test("where quotations go is a cohort, and every ending is named", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "abdulrahman");
  await expect(page).toHaveURL(new RegExp(`/${locale}/team`), COLD);

  const stages = page.locator("[data-stage]");
  const card = stages.first().locator("xpath=ancestor::section[1]");

  await test.step("1 · six endings, each with a word for it", async () => {
    await expect(stages).toHaveCount(6, COLD);
    for (const stage of [
      "waiting",
      "returned",
      "withdrawn",
      "withCustomer",
      "accepted",
      "rejected",
    ]) {
      await expect(
        page.locator(`[data-stage="${stage}"]`),
        `${stage} has no row`,
      ).toContainText(t(`team.chain.${stage}`));
    }
  });

  await test.step("2 · the endings add up to the number the sentence names", async () => {
    // Every quotation is counted once, at the furthest point it reached, so the
    // six add up to what was raised. A cohort whose parts do not sum to its
    // whole has lost some on the way (rules/data.md).
    const counts = await stages.evaluateAll((nodes) =>
      nodes.map((node) => Number(node.querySelector(".num")?.textContent?.trim() ?? "0")),
    );
    const total = counts.reduce((sum, n) => sum + n, 0);
    expect(total, "nothing was raised in the window").toBeGreaterThan(0);

    await expect(card).toContainText(t("team.chainMeans", { raised: total, days: 90 }));
  });

  await test.step("3 · every stage of the seeded chain has something in it", async () => {
    // A funnel where five rows are nought is a funnel nobody has seen work
    // (rules/data.md), so the demo puts a quotation at every ending.
    const counts = await stages.evaluateAll((nodes) =>
      nodes.map((node) => Number(node.querySelector(".num")?.textContent?.trim() ?? "0")),
    );
    expect(counts.filter((n) => n > 0).length, "the seeded funnel has empty stages").toBe(6);
  });
});

test("a customer nobody has a next step for is on a band at last", async ({ page, locale, t }) => {
  test.slow();

  // The leak the five-day walk found: contacted once, no follow-up on him or on
  // any of his live projects, and therefore on no band of any screen. Every band
  // this app had was keyed on a date, and these have none (D63).
  const quiet = await query<{ id: string; name: string }>(
    `select companies.id, companies.name
       from companies
       join users u on u.id = companies.rep_id
      where u.email = 'faisal@technopanel.com.sa'
        and companies.archived_at is null
        and least(companies.next_follow_up, (
          select min(p.next_follow_up) from projects p
           where p.company_id = companies.id
             and p.archived_at is null
             and p.lost_at is null
        )) is null
        and exists (select 1 from activities where activities.company_id = companies.id)
        and (select max(a.happened_on) from activities a where a.company_id = companies.id)
            <= (now() at time zone 'Asia/Riyadh')::date - 14`,
  );
  expect(quiet.length, "the seed has nobody who went quiet").toBeGreaterThan(0);

  await login(page, locale, "faisal");
  await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);

  await test.step("1 · the band is on his day, with the rule written under it", async () => {
    const heading = page.getByRole("heading", { name: new RegExp(t("common.goneQuiet")) });
    await expect(heading).toBeVisible(COLD);
    await expect(page.getByText(t("common.quietMeans", { days: 14 }))).toBeVisible();

    for (const company of quiet) {
      await expect(page.getByRole("link", { name: company.name }).first()).toBeVisible();
    }
  });

  await test.step("2 · and the pill on his list opens exactly the same set", async () => {
    await page.goto(`/${locale}/companies`);
    await page
      .getByRole("link", { name: t("companies.quietCount", { count: quiet.length }) })
      .click();

    await expect(page).toHaveURL(/filter=quiet/, COLD);
    // One definition, two screens: the count on the pill is the number of rows
    // the filter behind it returns (rules/data.md).
    const rows = page.getByRole("table").first().getByRole("row");
    await expect(rows).toHaveCount(quiet.length + 1, COLD);
  });
});

test("a rep's floor and his day cannot disagree about what is waiting", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // Two screens, one list. The strip on his floor counts the rows his day
  // renders — sent back and refused on one figure, the ones with the customer on
  // the caption beside the open ones — so the manager reading "2 stopped" and the
  // rep reading two rows are reading the same two (rules/data.md, D78).
  await login(page, locale, "faisal");
  await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);

  const waiting = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: t("day.waitingOnYou") }) });
  await expect(waiting.getByRole("listitem").first()).toBeVisible(COLD);
  const rows = await waiting.getByRole("listitem").count();
  const withCustomer = await waiting
    .getByRole("listitem")
    .filter({ hasText: t("day.withCustomer") })
    .count();

  await page.goto(`/${locale}/companies`);
  const floor = page.locator('[data-slot="standing"]').first();
  await expect(floor).toBeVisible(COLD);

  await expect(
    floor
      .locator("> div")
      .filter({ hasText: t("team.sentBackOrRefused") })
      .locator("dd")
      .first(),
  ).toHaveText(String(rows - withCustomer));
  await expect(
    floor
      .locator("> div")
      .filter({ hasText: t("team.openQuotations") })
      .locator('[data-slot="figure-caption"]'),
  ).toHaveText(t("team.openWithCustomer", { count: withCustomer }));
});
