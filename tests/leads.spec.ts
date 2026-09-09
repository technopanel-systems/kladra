import { login } from "./helpers/auth";
import { one, personName, query } from "./helpers/db";
import { pickFirst } from "./helpers/pick";
import { test, expect } from "./helpers/i18n";

/**
 * The lead module (SPEC §3, P12-7).
 *
 * "Marketing does not use the Add company form. Marketing has its own module
 * for bringing in a lead, and creating one there IS an assignment: it goes to a
 * chosen rep, or to a member of the marketing team."
 *
 * Two things make that sentence true and both are walked here. Filing IS the
 * assignment — one Save, and the customer is on the rep's floor with a phone
 * number on him, not in a holding pen waiting for a second act somebody has to
 * remember. And the assignment is ANSWERED — the rep says he has it, which is
 * what takes the row off his day, off marketing's waiting list and off the
 * manager's stuck list, all three from the one column.
 *
 * The seeded three are the bands: one nobody has answered in four working days,
 * one that arrived yesterday, one answered the day after it landed. A threshold
 * with no row past it is a figure nobody has ever seen work (rules/data.md).
 */

const COLD = { timeout: 30_000 };

/**
 * The lead this file files, named for the run that filed it.
 *
 * Both locale projects run against one seeded database in file order
 * (playwright.config.ts), so the English run and the Arabic run must not answer
 * each other's rows: each files its own and each answers its own. What neither
 * of them touches is the seeded late one, which is the row the manager's screen
 * below is about — a walk that consumed it would leave the second run with the
 * band it exists to prove empty.
 */
function filedName(locale: string): string {
  return `شركة أفنان للمقاولات ${locale.toUpperCase()}`;
}

/** The lead nobody has answered and that is past the two-working-day line. */
async function lateLead() {
  return one<{ id: string; name: string; rep_email: string }>(
    `select c.id, c.name, u.email as rep_email
       from companies c
       join users u on u.id = c.rep_id
      where c.lead_from_id is not null
        and c.lead_acknowledged_at is null
        and c.archived_at is null
        and (c.created_at at time zone 'Asia/Riyadh')::date
            <= (now() at time zone 'Asia/Riyadh')::date - 4
      order by c.created_at
      limit 1`,
  );
}

test("marketing files a lead and it is on the rep's floor when Save comes back", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const name = filedName(locale);
  const askedFor = "واجهة معرض سيارات على طريق الدائري، يريد سعر خلال أسبوع";
  const faisal = await personName("faisal@technopanel.com.sa", locale);

  await login(page, locale, "marketing");

  await test.step("1 · the module is where marketing lands, and its door says lead", async () => {
    await expect(page).toHaveURL(new RegExp(`/${locale}/leads`), COLD);
    await expect(page.getByRole("heading", { name: t("leads.title") })).toBeVisible(COLD);
    await page.getByRole("button", { name: t("leads.new") }).first().click();
  });

  await test.step("2 · the form asks the two things a lead has that a company does not", async () => {
    const form = page.getByRole("dialog", { name: t("leads.new") });
    await expect(form.getByLabel(t("common.company"))).toBeVisible(COLD);

    await form.getByLabel(t("common.company")).fill(name);
    for (const label of ["common.category", "common.leadSource"]) {
      await pickFirst(form.getByRole("combobox", { name: t(label) }));
    }
    await form.getByLabel(t("common.name"), { exact: true }).fill("سلطان الحربي");
    await form.getByLabel(t("common.phone")).fill("0551117788");

    // What the customer asked for, and whose floor it lands on. Neither exists
    // on Add company, and the lead is not a lead without them.
    await form.getByLabel(t("leads.query")).fill(askedFor);
    await form.getByRole("combobox", { name: t("leads.giveTo") }).click();
    await page.getByRole("option").filter({ hasText: faisal }).first().click();

    await form.getByRole("button", { name: t("common.save") }).click();
  });

  await test.step("3 · one act: the row is his, with the customer's words on it", async () => {
    await expect(page.getByText(t("leads.filed", { name, rep: faisal }))).toBeVisible(COLD);

    const row = await one<{
      rep_email: string;
      finder_email: string;
      lead_query: string;
      acknowledged: boolean;
      contacts: string;
    }>(
      `select u.email as rep_email,
              f.email as finder_email,
              c.lead_query,
              c.lead_acknowledged_at is not null as acknowledged,
              (select count(*)::text from contacts ct
                where ct.company_id = c.id and ct.rep_id = c.rep_id) as contacts
         from companies c
         join users u on u.id = c.rep_id
         join users f on f.id = c.lead_from_id
        where c.name = $1::text`,
      [name],
    );
    expect(row.rep_email, "the lead did not land on the chosen floor").toBe(
      "faisal@technopanel.com.sa",
    );
    expect(row.finder_email).toBe("marketing@technopanel.com.sa");
    expect(row.lead_query).toBe(askedFor);
    // Nobody has said he has it, which is the state the whole screen is about.
    expect(row.acknowledged).toBe(false);
    // And the phone number is HIS to ring, on his own contact row (D147).
    expect(Number(row.contacts), "the lead arrived with nobody to ring").toBe(1);
  });

  await test.step("4 · and it reads as waiting on the screen that filed it", async () => {
    const row = page.getByRole("row").filter({ hasText: name }).first();
    await expect(row).toBeVisible(COLD);
    await expect(row.getByText(t("leads.notAcknowledged"))).toBeVisible();
  });
});

test("the rep answers the lead, and the answer is what clears it everywhere", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // The one this run filed, in the step above. Answering it leaves the seeded
  // late lead where it is, for the manager's screen below.
  const lead = await one<{ id: string; name: string; waiting: string }>(
    `select c.id,
            c.name,
            (select count(*)::text from companies mine
              where mine.rep_id = c.rep_id
                and mine.lead_from_id is not null
                and mine.lead_acknowledged_at is null
                and mine.archived_at is null) as waiting
       from companies c
      where c.name = $1::text`,
    [filedName(locale)],
  );
  const finderEmail = "marketing@technopanel.com.sa";

  await login(page, locale, "faisal");

  await test.step("1 · it is waiting on his day, first, under its own word", async () => {
    await page.goto(`/${locale}/day`);
    const card = page.getByRole("link").filter({ hasText: lead.name }).first();
    await expect(card).toBeVisible(COLD);
    await expect(card.getByText(t("day.newLead"))).toBeVisible();
    // The pill says how many, beside the three kinds that were already there.
    // Counted from the database: how many leads are on his floor depends on
    // which run this is, and a number written here would be right once.
    const pills = page.getByRole("group", { name: t("day.waitingOnYou") });
    await expect(
      pills.getByText(t("day.newLeadCount", { count: Number(lead.waiting) })),
    ).toBeVisible();
  });

  await test.step("2 · the drawer says who passed it and what they asked for", async () => {
    await page.goto(`/${locale}/companies?open=${lead.id}`);
    const drawer = page.getByRole("dialog").first();
    await expect(drawer).toBeVisible(COLD);
    const finder = await personName(finderEmail, locale);
    await expect(drawer.getByText(t("leads.fromPerson", { name: finder }))).toBeVisible();
    await drawer.getByRole("button", { name: t("leads.acknowledge") }).click();
    await expect(page.getByText(t("leads.acknowledgedToast"))).toBeVisible(COLD);
  });

  await test.step("3 · the column is stamped, the bell is gone, and the finder is told", async () => {
    await expect
      .poll(
        async () =>
          (
            await one<{ ack: boolean }>(
              "select lead_acknowledged_at is not null as ack from companies where id = $1::uuid",
              [lead.id],
            )
          ).ack,
        { timeout: 15_000 },
      )
      .toBe(true);

    // The notice was work he had to do, so doing it is what takes it off his
    // bell (D79) — not reading it, which is the act with no relation to it.
    const bells = await query<{ kind: string; email: string }>(
      `select n.kind, u.email
         from notifications n
         join users u on u.id = n.user_id
        where n.subject_type = 'company' and n.subject_id = $1::uuid`,
      [lead.id],
    );
    expect(bells.map((b) => b.kind)).toEqual(["leadAcknowledged"]);
    expect(bells[0].email, "the person who filed it was not told").toBe(finderEmail);
  });

  await test.step("4 · and it has left his day", async () => {
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);
    await expect(page.getByRole("link").filter({ hasText: lead.name })).toHaveCount(0);
  });
});

test("a lead nobody has answered reaches the manager's stuck list", async ({ page, locale, t }) => {
  const late = await lateLead();

  await login(page, locale, "abdulrahman");
  await page.goto(`/${locale}/team`);

  const heading = page.getByRole("heading", { name: t("team.stuckLeads") });
  await expect(heading).toBeVisible(COLD);
  // The rule under the group's name, because the name does not carry it (D59).
  await expect(page.getByText(t("team.stuckLeadsMeans", { days: 2 }))).toBeVisible();

  const row = page.getByRole("link").filter({ hasText: late.name }).first();
  await expect(row).toBeVisible();
  // Whose floor it is sitting on: the manager reads this to decide whom to ring.
  await expect(row).toContainText(await personName(late.rep_email, locale));
});

test("marketing reads what it brought in, and a rep has no such screen", async ({
  page,
  locale,
  t,
}) => {
  await login(page, locale, "marketing");
  await page.goto(`/${locale}/leads`);

  const mine = await query<{ name: string }>(
    `select c.name
       from companies c
       join users f on f.id = c.lead_from_id
      where f.role = 'marketing' and c.archived_at is null`,
  );
  expect(mine.length, "marketing has brought nothing in").toBeGreaterThan(0);
  for (const lead of mine) {
    await expect(page.getByText(lead.name).first(), `${lead.name} missing`).toBeVisible(COLD);
  }

  // A lead given to somebody is work on his day, not a list for him to browse:
  // the screen is marketing's and management's, and his rail does not carry it.
  await login(page, locale, "faisal");
  const nav = page.getByRole("navigation", { name: t("shell.mainNav") }).first();
  await expect(nav.getByRole("link", { name: t("leads.title") })).toHaveCount(0, COLD);
  await page.goto(`/${locale}/leads`);
  await expect(page.getByRole("heading", { name: t("leads.title") })).toHaveCount(0, COLD);
});
