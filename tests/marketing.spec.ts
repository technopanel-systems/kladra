import { login } from "./helpers/auth";
import { one, personName, query, userId } from "./helpers/db";
import { test, expect } from "./helpers/i18n";

/**
 * Marketing, the fifth role (SPEC §1, D50), and the handover that puts a lead
 * on the floor that will price it (D51, narrowed by SPEC §3).
 *
 * What is checked is the boundary, because that is the whole role: it works a
 * company exactly as a rep does and stops at the price. A screen that offered
 * it a quotation would be offering work the server refuses, and — worse — a
 * screen that hid the quotation button while the action allowed it would be
 * hiding nothing at all.
 *
 * The handover is checked from both ends: the company leaves one floor and
 * arrives on the other, with its projects and its follow-up. It is the SALES
 * MANAGER who moves it, since §3 — the founder's own words, "not the owner's,
 * not marketing's" — and the walk starts by proving that the role who used to
 * do it is no longer offered the control at all. A permission taken away is
 * only taken away if the screen agrees with the action, and this is the pair
 * that has been wrong in both directions this phase (§5 #163).
 */

const COLD = { timeout: 30_000 };

test("marketing works its floor and is offered no price anywhere", async ({ page, locale, t }) => {
  test.slow();

  await login(page, locale, "marketing");

  await test.step("1 · its home is a day, like a rep's, with no month on it", async () => {
    await expect(page).toHaveURL(new RegExp(`/${locale}/day`), COLD);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);
    // No target, so no card that would read as a permanent shortfall (D44).
    await expect(page.getByText(t("day.myMonth"))).toHaveCount(0);
  });

  await test.step("2 · the rail carries its three screens and neither chain screen", async () => {
    const nav = page.getByRole("navigation", { name: t("shell.mainNav") }).first();
    for (const label of ["day.title", "common.companies", "common.projects"]) {
      await expect(nav.getByRole("link", { name: t(label) }), `${label} missing`).toHaveCount(1);
    }
    for (const label of ["common.quotations", "common.dispatches", "common.queue"]) {
      await expect(nav.getByRole("link", { name: t(label) }), `${label} offered`).toHaveCount(0);
    }
  });

  await test.step("3 · a lead of its own opens with the work of a floor on it", async () => {
    // Counted from the database rather than written down: the other spec in
    // this file hands one lead away, and both locale projects run against one
    // seeded database (playwright.config.ts), so a fixed number here would be
    // right on the first run and wrong on the second.
    const { count } = await one<{ count: string }>(
      `select count(*)::text as count from companies c
         join users u on u.id = c.rep_id
        where u.role = 'marketing' and c.archived_at is null`,
    );
    expect(Number(count), "marketing has no leads left to work").toBeGreaterThan(0);

    await page.goto(`/${locale}/companies`);
    await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
    // Its own, and nobody else's.
    const rows = page.getByRole("table").first().getByRole("row");
    await expect(rows).toHaveCount(Number(count) + 1, COLD);

    await rows.nth(1).getByRole("link").first().click();
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);

    // Everything a rep does with a customer.
    for (const label of ["common.log", "drawer.newProject", "common.edit"]) {
      await expect(drawer.getByRole("button", { name: t(label) }), `${label} missing`).toHaveCount(
        1,
      );
    }
    // And the one thing it does not: the price.
    await expect(drawer.getByRole("button", { name: t("quotations.request") })).toHaveCount(0);
  });

  await test.step("4 · the Quotations screen is not reachable by typing it either", async () => {
    await page.goto(`/${locale}/quotations`);
    // Nothing to quote on, so nothing to press; the list itself is empty.
    await expect(page.getByRole("button", { name: t("quotations.request") })).toHaveCount(0, COLD);
  });
});

test("the sales manager moves a lead onto the floor that will price it", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const lead = await one<{ id: string; name: string }>(
    `select c.id, c.name from companies c
       join users u on u.id = c.rep_id
      where u.role = 'marketing' and c.archived_at is null
      order by c.name
      limit 1`,
  );
  const faisal = {
    id: await userId("faisal@technopanel.com.sa"),
    name: await personName("faisal@technopanel.com.sa", locale),
  };

  // One database, two locale projects (playwright.config.ts): the English run
  // moves the first lead and the Arabic run must not find it already gone.
  const before = await one<{ rep_id: string }>("select rep_id from companies where id = $1::uuid", [
    lead.id,
  ]);

  await test.step("1 · the man who owns it is not offered the control", async () => {
    await login(page, locale, before.rep_id === faisal.id ? "faisal" : "marketing");
    await page.goto(`/${locale}/companies?open=${lead.id}`);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    // His own customer, every other button on the drawer his — and this one
    // gone, because whose floor a company sits on is the manager's answer
    // (SPEC §3, which overrules D51).
    await expect(drawer.getByRole("button", { name: t("drawer.handOver") })).toHaveCount(0);
  });

  await test.step("2 · the manager opens the same drawer and it is there", async () => {
    await login(page, locale, "abdulrahman");
    await page.goto(`/${locale}/companies?open=${lead.id}`);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    await drawer.getByRole("button", { name: t("drawer.handOver") }).click();
  });

  // Both names come from the database in the reader's language (D68): the
  // account is "Marketing" in English and التسويق in Arabic.
  const to =
    before.rep_id === faisal.id
      ? await personName("marketing@technopanel.com.sa", locale)
      : faisal.name;

  await test.step("3 · it asks who, and says what travels with the company", async () => {
    const dialog = page.getByRole("dialog", { name: t("drawer.handOverTitle", { name: lead.name }) });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(t("drawer.handOverWarning"));

    await dialog.getByRole("combobox").click();
    // The option carries the person's name and, under it, their role — one
    // accessible name of two parts, so this matches on the name inside it.
    await page.getByRole("option").filter({ hasText: to }).first().click();
    await dialog.getByRole("button", { name: t("drawer.handOver") }).click();
  });

  await test.step("4 · the company is on the other floor, and the move is on the record", async () => {
    await expect
      .poll(
        async () =>
          (await one<{ rep_id: string }>("select rep_id from companies where id = $1::uuid", [lead.id]))
            .rep_id,
        { timeout: 15_000 },
      )
      .not.toBe(before.rep_id);

    // `record_id` is TEXT, not uuid: the audit log points at rows in a dozen
    // tables and does not pretend they share a key type (src/db/schema.ts). A
    // `::uuid` cast here is the "operator does not exist" failure in
    // .claude/rules/data.md, from the other side.
    const audit = await query<{ action: string }>(
      `select action from audit_log
        where record_type = 'company' and record_id = $1::text and action = 'company.handOver'`,
      [lead.id],
    );
    expect(audit.length, "the handover was not audited").toBeGreaterThan(0);
  });
});
