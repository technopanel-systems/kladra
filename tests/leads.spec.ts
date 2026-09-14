import { login, type Persona } from "./helpers/auth";
import { floorOfCompany, one, personName, query, restoreCompanyFloor, userId } from "./helpers/db";
import { choose, pickFirst } from "./helpers/pick";
import type { Page } from "@playwright/test";
import { test, expect, type Locale, type Translate } from "./helpers/i18n";
import type { Day } from "@/lib/dates";
import type { LeadStage } from "@/lib/leads";
import { waitedSince } from "@/lib/waiting";
import type { NonWorking } from "@/lib/workdays";

/**
 * The lead module (SPEC §3, P12-7, P13).
 *
 * "A lead is filed with the company, a contact with a phone, where it came from
 * … and the customer's query as the single note — no other note fields — and is
 * assigned to a rep or to herself in the same step. The rep receives it apart
 * from his own companies, newest first, highlighted until he acknowledges; a
 * notification; after two days unacknowledged it shows for the manager. The
 * manager's leads view assigns and reassigns. Marketing sees what became of
 * each lead it passed: acknowledged, contacted, quoted, won. Once acknowledged,
 * the lead is a normal company owned by the rep, keeping its origin."
 *
 * Every clause of that is walked below, by the person it is about. Filing IS
 * the assignment — one Save and the customer is on the chosen floor with a
 * phone number on him. The rep answers it from the band above his companies,
 * which is what clears it everywhere. A lead nobody answers in two working days
 * reaches the manager, who moves it and the new holder is told. And marketing's
 * own screen reads each lead's stage off the company's records, checked here
 * against the same question asked of the database a second way.
 *
 * The seed carries a lead at every stage (scripts/seed/demo-data.ts): one given
 * to Faisal today, one given to him three working days ago and still
 * unanswered, one acknowledged and rung, one quoted, one won. A threshold with
 * no row past it is a figure nobody has ever seen work (rules/data.md).
 */

const COLD = { timeout: 30_000 };
const MARKETING = "marketing@technopanel.com.sa";

/**
 * The lead this file files, named for the run that filed it.
 *
 * Both locale projects run against one seeded database in file order
 * (playwright.config.ts), so the English run and the Arabic run must not answer
 * each other's rows: each files its own and each answers its own. What neither
 * of them keeps touched is the seeded late one, which the manager's walk below
 * moves and puts back — a walk that consumed it would leave the second run with
 * the line it exists to prove empty.
 */
function filedName(locale: Locale): string {
  return `شركة أفنان للمقاولات ${locale.toUpperCase()}`;
}

/** Riyadh's today, computed independently of the app (tests/admin.spec.ts). */
function todayRiyadh(): Day {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type Waiting = { id: string; name: string; rep_email: string; given: Day; days: number };

/**
 * Every lead nobody has acknowledged that is past the two-working-day line,
 * oldest first.
 *
 * A lead's wait starts when it was GIVEN to the person holding it — filed, or
 * moved to him since — so the day is the newest reassignment on the audit trail
 * or the day it was filed. Aged in working days against the company's holidays
 * with the app's own pure rule (`waitedSince`, tests/waiting.spec.ts holds it),
 * because "late" is one definition and a second copy of it is the drift trap.
 */
async function lateLeads(): Promise<Waiting[]> {
  return (await waitingLeads()).filter((row) => row.late);
}

/** Every lead nobody has acknowledged, oldest first, with how long it has sat. */
async function waitingLeads(): Promise<(Waiting & { late: boolean })[]> {
  const today = todayRiyadh();
  const rows = await query<Omit<Waiting, "days">>(
    `select c.id, c.name, u.email as rep_email,
            to_char((coalesce(
              (select max(a.at) from audit_log a
                where a.record_type = 'company' and a.record_id = c.id::text
                  and a.action = 'lead.reassign'),
              c.created_at) at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as given
       from companies c
       join users u on u.id = c.rep_id
      where c.lead_from_id is not null
        and c.lead_acknowledged_at is null
        and c.archived_at is null
      order by 4, c.name`,
  );
  if (rows.length === 0) return [];
  const holidays = await query<{ day: Day }>(
    `select to_char(day, 'YYYY-MM-DD') as day from non_working_days
      where user_id is null and day between $1::date and $2::date`,
    [rows[0].given, today],
  );
  const nonWorking: NonWorking[] = holidays.map((row) => ({ day: row.day, userId: null }));
  return rows.map((row) => {
    const waited = waitedSince(row.given, today, nonWorking);
    return { ...row, days: waited.days, late: waited.late };
  });
}

/** The one source that names marketing's own work, in the reader's language. */
async function marketingSource(locale: Locale): Promise<string> {
  const row = await one<{ name: string }>(
    `select ${locale === "ar" ? "name_ar" : "name_en"} as name
       from lead_sources where restricted and active`,
  );
  return row.name;
}

test("marketing files a lead with a phone and the customer's query as its one note, and the rep acknowledges it from the band above his companies", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const name = filedName(locale);
  const askedFor = "واجهة معرض سيارات على طريق الدائري، يريد سعر خلال أسبوع";
  const faisal = await personName("faisal@technopanel.com.sa", locale);
  const finder = await personName(MARKETING, locale);
  const source = await marketingSource(locale);

  await test.step("1 · marketing opens its module and the form asks for the lead and nothing else", async () => {
    await login(page, locale, "marketing");
    await page.goto(`/${locale}/leads`);
    await expect(page.getByRole("heading", { name: t("leads.title") })).toBeVisible(COLD);
    await page.getByRole("button", { name: t("leads.new") }).first().click();

    const form = page.getByRole("dialog", { name: t("leads.new") });
    await expect(form.getByLabel(t("common.company"))).toBeVisible(COLD);

    // The customer's query is the single note (§3 P13): the one box of words on
    // the form, and no Notes field for the company or for the person.
    await expect(form.getByLabel(t("common.notes"))).toHaveCount(0);
    await expect(form.locator("textarea")).toHaveCount(1);

    // Under the company's own fields, three labelled groups in one spelling —
    // whom to ring, what they asked for, who takes it (S12.8, DESIGN §8) — and
    // the contact's group is named for a screen reader by its word.
    await expect(form.locator('[data-slot="labelled-group"]')).toHaveCount(3);
    await expect(form.getByRole("group", { name: t("forms.contactHeading") })).toBeVisible();

    await form.getByLabel(t("common.company")).fill(name);
    await pickFirst(form.getByRole("combobox", { name: t("common.category") }));
    // Marketing is on the list of where it came from, for this role.
    await choose(page, form.getByRole("combobox", { name: t("common.leadSource") }), source);
    // By its accessible name: the label's "*" is drawn for the eye only.
    await form.getByRole("textbox", { name: t("common.name"), exact: true }).fill("سلطان الحربي");
    await form.getByLabel(t("common.phone")).fill("0551117788");
    await form.getByLabel(t("leads.query")).fill(askedFor);
    await choose(page, form.getByRole("combobox", { name: t("leads.giveTo") }), faisal);

    await form.getByRole("button", { name: t("common.save") }).click();
    await expect(page.getByText(t("leads.filed", { name, rep: faisal }))).toBeVisible(COLD);
  });

  const lead = await one<{
    id: string;
    rep_email: string;
    finder_email: string;
    lead_query: string;
    notes: string | null;
    restricted: boolean;
    acknowledged: boolean;
  }>(
    `select c.id, u.email as rep_email, f.email as finder_email, c.lead_query, c.notes,
            ls.restricted, c.lead_acknowledged_at is not null as acknowledged
       from companies c
       join users u on u.id = c.rep_id
       join users f on f.id = c.lead_from_id
       join lead_sources ls on ls.id = c.lead_source_id
      where c.name = $1::text`,
    [name],
  );

  await test.step("2 · one act: the customer is on Faisal's floor with the query as its only note", async () => {
    expect(lead.rep_email, "the lead did not land on the chosen floor").toBe(
      "faisal@technopanel.com.sa",
    );
    expect(lead.finder_email).toBe(MARKETING);
    expect(lead.restricted, "filed under a source other than Marketing").toBe(true);
    expect(lead.lead_query).toBe(askedFor);
    expect(lead.notes, "a lead grew a second note").toBeNull();
    expect(lead.acknowledged).toBe(false);

    // The phone number is HIS to ring, on his own contact row — kept as typed
    // and matched as E.164 (src/db/schema.ts) — with no note of its own either.
    const contacts = await query<{
      phone: string;
      normalized: string;
      rep_email: string;
      notes: string | null;
    }>(
      `select ct.phone, ct.phone_normalized as normalized, u.email as rep_email, ct.notes
         from contacts ct join users u on u.id = ct.rep_id
        where ct.company_id = $1::uuid and ct.archived_at is null`,
      [lead.id],
    );
    expect(contacts).toEqual([
      {
        phone: "0551117788",
        normalized: "+966551117788",
        rep_email: "faisal@technopanel.com.sa",
        notes: null,
      },
    ]);

    // And he is told.
    const bells = await query<{ kind: string; email: string }>(
      `select n.kind, u.email from notifications n join users u on u.id = n.user_id
        where n.subject_type = 'company' and n.subject_id = $1::uuid`,
      [lead.id],
    );
    expect(bells).toEqual([{ kind: "leadAssigned", email: "faisal@technopanel.com.sa" }]);
  });

  await test.step("3 · it reads as waiting on the screen that filed it", async () => {
    const row = page.getByRole("row").filter({ hasText: name }).first();
    await expect(row).toBeVisible(COLD);
    await expect(row.getByText(t("leads.notAcknowledged"), { exact: true })).toBeVisible();
  });

  await login(page, locale, "faisal");

  await test.step("4 · it is waiting on his day, under its own word", async () => {
    await page.goto(`/${locale}/day`);
    const card = page.getByRole("link").filter({ hasText: name }).first();
    await expect(card).toBeVisible(COLD);
    await expect(card.getByText(t("day.newLead"))).toBeVisible();
  });

  const band = page.getByRole("region", { name: t("leads.bandTitle") });

  await test.step("5 · above his companies, apart from them: newest first, highlighted with its word", async () => {
    await page.goto(`/${locale}/companies`);
    await expect(band).toBeVisible(COLD);

    // Newest first: the one filed a moment ago heads the band.
    const first = band.getByRole("listitem").first();
    await expect(first).toContainText(name);
    // Highlighted, and never by tone alone: the amber of somebody owing an
    // answer, with the word that says it (DESIGN §6).
    await expect(first.locator('[data-tone="wait"]')).toHaveText(t("leads.notAcknowledged"));
    await expect(first.getByText(askedFor)).toBeVisible();
    await expect(first.getByText(t("leads.fromPersonShort", { name: finder }))).toBeVisible();

    // Apart: the band's is the only door to it on the page, because the list
    // below does not carry a lead until he has it (D185).
    await expect(
      page.getByRole("link", { name: t("companies.openCompany", { name }) }).filter({ visible: true }),
    ).toHaveCount(1);

    // Its button says whose lead it answers, as Reassign does: a band of five
    // buttons all called "Acknowledge" cannot be told apart by ear.
    await band
      .getByRole("button", { name: `${t("leads.acknowledge")} ${name}`, exact: true })
      .click();
    await expect(page.getByText(t("leads.acknowledgedToast"))).toBeVisible(COLD);
  });

  await test.step("6 · the band lets go of it, and it is a company of his, in his list", async () => {
    await expect(band.getByRole("listitem").filter({ hasText: name })).toHaveCount(0, COLD);
    const door = page
      .getByRole("link", { name: t("companies.openCompany", { name }) })
      .filter({ visible: true })
      .first();
    await expect(door).toBeVisible(COLD);
    await door.click();

    // Keeping its origin: who filed it and under which source, and what the
    // customer asked — a quiet line now, with nothing left to press.
    const drawer = page.getByRole("dialog", { name });
    await expect(drawer).toBeVisible(COLD);
    await expect(drawer.getByText(t("leads.origin", { name: finder, source }))).toBeVisible();
    await expect(drawer.getByText(askedFor)).toBeVisible();
    await expect(drawer.getByRole("button", { name: t("leads.acknowledge") })).toHaveCount(0);
  });

  await test.step("7 · the column is stamped, his notice is gone, and the finder is told", async () => {
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
      `select n.kind, u.email from notifications n join users u on u.id = n.user_id
        where n.subject_type = 'company' and n.subject_id = $1::uuid`,
      [lead.id],
    );
    expect(bells).toEqual([{ kind: "leadAcknowledged", email: MARKETING }]);
  });

  await test.step("8 · and it has left his day", async () => {
    await page.goto(`/${locale}/day`);
    await expect(page.getByRole("heading", { name: t("day.title") })).toBeVisible(COLD);
    await expect(page.getByRole("link").filter({ hasText: name })).toHaveCount(0);
  });
});

test("a lead marketing files onto itself is acknowledged at once, and nobody is told", async ({
  page,
  locale,
  t,
}) => {
  const name = `مؤسسة الحرفة للديكور ${locale.toUpperCase()}`;
  const itself = await personName(MARKETING, locale);

  await login(page, locale, "marketing");
  await page.goto(`/${locale}/leads`);
  await page.getByRole("button", { name: t("leads.new") }).first().click();

  const form = page.getByRole("dialog", { name: t("leads.new") });
  await expect(form.getByLabel(t("common.company"))).toBeVisible(COLD);
  await form.getByLabel(t("common.company")).fill(name);
  await pickFirst(form.getByRole("combobox", { name: t("common.category") }));
  await pickFirst(form.getByRole("combobox", { name: t("common.leadSource") }));
  await form.getByRole("textbox", { name: t("common.name"), exact: true }).fill("هشام العمري");
  await form.getByLabel(t("common.phone")).fill(locale === "en" ? "0552204418" : "0552204419");
  await form.getByLabel(t("leads.query")).fill("ديكور مكتب صغير، يسأل عن الألوان");
  // Herself: the first answer on the picker (leads/page.tsx).
  await choose(page, form.getByRole("combobox", { name: t("leads.giveTo") }), itself);
  await form.getByRole("button", { name: t("common.save") }).click();
  await expect(page.getByText(t("leads.filed", { name, rep: itself }))).toBeVisible(COLD);

  const row = await one<{ id: string; mine: boolean; acknowledged: boolean; bells: string }>(
    `select c.id, c.rep_id = c.lead_from_id as mine, c.lead_acknowledged_at is not null as acknowledged,
            (select count(*)::text from notifications n
              where n.subject_type = 'company' and n.subject_id = c.id) as bells
       from companies c where c.name = $1::text`,
    [name],
  );
  // She has it: there is nobody to wait for and nobody to tell.
  expect(row).toEqual({ id: row.id, mine: true, acknowledged: true, bells: "0" });
  await expect(
    page.getByRole("row").filter({ hasText: name }).first().getByText(t("leads.acknowledged"), {
      exact: true,
    }),
  ).toBeVisible(COLD);
});

type Notice = {
  id: string;
  user_id: string;
  kind: string;
  params: unknown;
  link: string;
  subject_type: string;
  subject_id: string;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

/** Every notice about a company, as it stands, so a walk that moves it can put them back. */
async function noticesOn(companyId: string): Promise<Notice[]> {
  return query<Notice>(
    `select id, user_id, kind, params, link, subject_type, subject_id, read_at, created_at, updated_at
       from notifications where subject_type = 'company' and subject_id = $1::uuid`,
    [companyId],
  );
}

async function putNoticesBack(companyId: string, notices: Notice[]): Promise<void> {
  await query("delete from notifications where subject_type = 'company' and subject_id = $1::uuid", [
    companyId,
  ]);
  for (const notice of notices) {
    await query(
      `insert into notifications
         (id, user_id, kind, params, link, subject_type, subject_id, read_at, created_at, updated_at)
       values ($1::uuid, $2::uuid, $3::text, $4::jsonb, $5::text, $6::text, $7::uuid,
               $8::timestamptz, $9::timestamptz, $10::timestamptz)
       on conflict (id) do nothing`,
      [
        notice.id,
        notice.user_id,
        notice.kind,
        JSON.stringify(notice.params),
        notice.link,
        notice.subject_type,
        notice.subject_id,
        notice.read_at,
        notice.created_at,
        notice.updated_at,
      ],
    );
  }
}

test("a lead nobody has acknowledged in two working days is on the manager's leads view, and he reassigns it to a rep who is told", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  const late = (await lateLeads()).find((lead) => lead.rep_email !== "saad@technopanel.com.sa");
  expect(late, "the seed has no lead past the two-working-day line").toBeTruthy();
  if (!late) return;

  const saad = {
    id: await userId("saad@technopanel.com.sa"),
    name: await personName("saad@technopanel.com.sa", locale),
  };
  const holder = await personName(late.rep_email, locale);
  const manager = await personName("abdulrahman@technopanel.com.sa", locale);
  // Whoever filed it: given back to her, it is hers at once (D157).
  const finder = await personName(
    (
      await one<{ email: string }>(
        "select f.email from companies c join users f on f.id = c.lead_from_id where c.id = $1::uuid",
        [late.id],
      )
    ).email,
    locale,
  );

  // Everything the move changes, as it stood, put back whatever happens: the
  // Arabic run finds this very lead still late on the floor it was on.
  const started = new Date();
  const floor = await floorOfCompany(late.id);
  const notices = await noticesOn(late.id);

  try {
    await login(page, locale, "abdulrahman");

    await test.step("1 · it is on his stuck list, on the floor it is sitting on", async () => {
      await page.goto(`/${locale}/team`);
      await expect(page.getByRole("heading", { name: t("team.stuckLeads") })).toBeVisible(COLD);
      const row = page.getByRole("link").filter({ hasText: late.name }).first();
      await expect(row).toBeVisible();
      await expect(row).toContainText(holder);
    });

    await test.step("2 · his leads view narrows to the unanswered ones, and to who has them", async () => {
      await page.goto(`/${locale}/leads`);
      await expect(page.getByRole("heading", { name: t("leads.title") })).toBeVisible(COLD);

      const states = page.getByRole("group", { name: t("leads.state") });
      await states.getByRole("link", { name: t("leads.notAcknowledged") }).click();
      await expect(page).toHaveURL(/[?&]state=waiting/, COLD);

      await choose(
        page,
        page.getByRole("combobox", { name: t("leads.with"), exact: true }),
        holder,
      );
      await expect(page).toHaveURL(/[?&]with=/, COLD);

      // Red, with how long it has sat in working days, and "late" in words —
      // the red is never the only thing saying so (S12.8, DESIGN §5).
      const row = page.getByRole("row").filter({ hasText: late.name }).first();
      await expect(row).toBeVisible(COLD);
      await expect(row.locator('[data-tone="bad"]')).toHaveText(t("leads.notAcknowledged"));
      const waited = row.locator('[data-slot="lead-stage"] [data-slot="waited"]');
      await expect(waited).toContainText(t("queue.workingDays", { days: late.days }));
      await expect(waited).toContainText(t("queue.late"));
    });

    await test.step("3 · he gives it to Saad from the row, told what will happen to it with whoever he picks", async () => {
      const row = page.getByRole("row").filter({ hasText: late.name }).first();
      await row.getByRole("button", { name: t("leads.reassign") }).click();

      const ask = page.getByRole("dialog", { name: t("leads.reassignTitle", { name: late.name }) });
      await expect(ask).toBeVisible(COLD);
      // Before anybody is picked, only what is true whoever it goes to.
      await expect(ask).toContainText(t("leads.reassignWarning"));
      await expect(ask).not.toContainText(t("leads.reassignWaits", { name: saad.name }));

      // Back to the person who filed it, it would be hers at once — so that is
      // what the dialog says while she is the one picked.
      const giveTo = ask.getByRole("combobox", { name: t("leads.giveTo") });
      await choose(page, giveTo, finder);
      await expect(ask).toContainText(t("leads.reassignBack", { name: finder }));
      await expect(ask).not.toContainText(t("leads.reassignWaits", { name: finder }));

      await choose(page, giveTo, saad.name);
      await expect(ask).toContainText(t("leads.reassignWaits", { name: saad.name }));
      await ask.getByRole("button", { name: t("leads.reassign") }).click();
      await expect(page.getByText(t("leads.filed", { name: late.name, rep: saad.name }))).toBeVisible(
        COLD,
      );
    });

    await test.step("4 · it is Saad's and waiting on him, and the move is on the record", async () => {
      await expect
        .poll(
          async () =>
            (await one<{ rep_id: string }>("select rep_id from companies where id = $1::uuid", [late.id]))
              .rep_id,
          { timeout: 15_000 },
        )
        .toBe(saad.id);

      const after = await one<{ acknowledged: boolean }>(
        "select lead_acknowledged_at is not null as acknowledged from companies where id = $1::uuid",
        [late.id],
      );
      expect(after.acknowledged, "a moved lead arrived already answered").toBe(false);

      // `record_id` is TEXT: the audit log points at rows in a dozen tables.
      const audit = await query<{ to: string }>(
        `select details->>'to' as "to" from audit_log
          where record_type = 'company' and record_id = $1::text and action = 'lead.reassign'
            and at >= $2::timestamptz`,
        [late.id, started],
      );
      expect(audit).toEqual([{ to: saad.id }]);

      // The old holder's notice named work that is not his any more; the new
      // holder has one of his own.
      const bells = await query<{ kind: string; user_id: string }>(
        `select kind, user_id from notifications
          where subject_type = 'company' and subject_id = $1::uuid and kind = 'leadAssigned'`,
        [late.id],
      );
      expect(bells).toEqual([{ kind: "leadAssigned", user_id: saad.id }]);
    });

    await test.step("5 · Saad is told, and it is in the band above his companies", async () => {
      await login(page, locale, "saad");
      await page.goto(`/${locale}/notifications`);
      await expect(
        page.getByText(t("notifications.leadAssigned", { rep: manager, company: late.name })),
      ).toBeVisible(COLD);

      await page.goto(`/${locale}/companies`);
      const band = page.getByRole("region", { name: t("leads.bandTitle") });
      await expect(band.getByRole("listitem").filter({ hasText: late.name })).toHaveCount(1, COLD);
    });
  } finally {
    await restoreCompanyFloor(floor);
    await query("update companies set lead_acknowledged_at = null where id = $1::uuid", [late.id]);
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text and at >= $2::timestamptz`,
      [late.id, started],
    );
    await putNoticesBack(late.id, notices);
  }
});

test("the manager handing an unanswered lead over from the drawer is the same move as reassigning it", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // A lead nobody has answered and that is not yet late: the late one is the
  // walk above's, and the one this file files is each run's own.
  const late = new Set((await lateLeads()).map((lead) => lead.id));
  const waiting = await query<{ id: string; name: string }>(
    `select c.id, c.name from companies c
       join users u on u.id = c.rep_id
      where c.lead_from_id is not null and c.lead_acknowledged_at is null
        and c.archived_at is null and u.email <> 'saad@technopanel.com.sa'
        and c.name not like 'شركة أفنان للمقاولات%'
      order by c.created_at desc`,
  );
  const lead = waiting.find((row) => !late.has(row.id));
  expect(lead, "the seed has no unanswered lead inside the two working days").toBeTruthy();
  if (!lead) return;

  const saad = {
    id: await userId("saad@technopanel.com.sa"),
    name: await personName("saad@technopanel.com.sa", locale),
  };
  const started = new Date();
  const floor = await floorOfCompany(lead.id);
  const notices = await noticesOn(lead.id);

  try {
    await test.step("1 · he hands it to Saad from the customer's drawer", async () => {
      await login(page, locale, "abdulrahman");
      await page.goto(`/${locale}/companies?open=${lead.id}`);
      const drawer = page.getByRole("dialog").first();
      await expect(drawer).toBeVisible(COLD);
      await drawer.getByRole("button", { name: t("drawer.handOver") }).click();

      const dialog = page.getByRole("dialog", { name: t("drawer.handOverTitle", { name: lead.name }) });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("combobox").click();
      await page.getByRole("option").filter({ hasText: saad.name }).first().click();
      await dialog.getByRole("button", { name: t("drawer.handOver") }).click();
    });

    await test.step("2 · it waits on Saad from today, told as a lead, and the old notice is gone", async () => {
      await expect
        .poll(
          async () =>
            (await one<{ rep_id: string }>("select rep_id from companies where id = $1::uuid", [lead.id]))
              .rep_id,
          { timeout: 15_000 },
        )
        .toBe(saad.id);

      const after = await one<{ acknowledged: boolean }>(
        "select lead_acknowledged_at is not null as acknowledged from companies where id = $1::uuid",
        [lead.id],
      );
      expect(after.acknowledged, "a handed-over lead arrived already answered").toBe(false);

      // One act, one record: the move a lead's wait is counted from.
      const audit = await query<{ action: string; to: string }>(
        `select action, details->>'to' as "to" from audit_log
          where record_type = 'company' and record_id = $1::text
            and action in ('lead.reassign', 'company.handOver') and at >= $2::timestamptz`,
        [lead.id, started],
      );
      expect(audit).toEqual([{ action: "lead.reassign", to: saad.id }]);

      const bells = await query<{ user_id: string }>(
        `select user_id from notifications
          where subject_type = 'company' and subject_id = $1::uuid and kind = 'leadAssigned'`,
        [lead.id],
      );
      expect(bells).toEqual([{ user_id: saad.id }]);
    });
  } finally {
    await restoreCompanyFloor(floor);
    await query("update companies set lead_acknowledged_at = null where id = $1::uuid", [lead.id]);
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text and at >= $2::timestamptz`,
      [lead.id, started],
    );
    await putNoticesBack(lead.id, notices);
  }
});

test("reassigning a lead somebody has acknowledged moves a customer: it stays acknowledged and the move is a hand-over", async ({
  page,
  locale,
  t,
}) => {
  test.slow();

  // An acknowledged lead of marketing's on somebody else's floor, not Saad's —
  // the contacted one the seed carries is this. Every fact the move changes is
  // captured first and put back, because the Arabic run reads the same row.
  const lead = await one<{ id: string; name: string; ack: string }>(
    `select c.id, c.name, c.lead_acknowledged_at::text as ack
       from companies c
       join users f on f.id = c.lead_from_id
       join users u on u.id = c.rep_id
      where f.email = $1::text and c.archived_at is null
        and c.rep_id <> c.lead_from_id
        and c.lead_acknowledged_at is not null
        and u.email <> 'saad@technopanel.com.sa'
        and c.name not like 'شركة أفنان للمقاولات%'
      order by c.name
      limit 1`,
    [MARKETING],
  );
  const saad = {
    id: await userId("saad@technopanel.com.sa"),
    name: await personName("saad@technopanel.com.sa", locale),
  };
  const started = new Date();
  const floor = await floorOfCompany(lead.id);
  const notices = await noticesOn(lead.id);

  try {
    await test.step("1 · the manager is told it stays acknowledged, and moves it to Saad", async () => {
      await login(page, locale, "abdulrahman");
      await page.goto(`/${locale}/leads`);
      await expect(page.getByRole("heading", { name: t("leads.title") })).toBeVisible(COLD);

      const row = page.getByRole("row").filter({ hasText: lead.name }).first();
      await row.getByRole("button", { name: t("leads.reassign") }).click();
      const ask = page.getByRole("dialog", { name: t("leads.reassignTitle", { name: lead.name }) });
      await expect(ask).toBeVisible(COLD);

      await choose(page, ask.getByRole("combobox", { name: t("leads.giveTo") }), saad.name);
      await expect(ask).toContainText(t("leads.reassignKeeps", { name: saad.name }));
      // Not the sentence for a lead still waiting, which would be untrue of it.
      await expect(ask).not.toContainText(t("leads.reassignWaits", { name: saad.name }));

      await ask.getByRole("button", { name: t("leads.reassign") }).click();
      await expect(page.getByText(t("leads.filed", { name: lead.name, rep: saad.name }))).toBeVisible(
        COLD,
      );
    });

    await test.step("2 · Saad's customer, acknowledged on the day it was, and the record says hand-over", async () => {
      await expect
        .poll(
          async () =>
            (await one<{ rep_id: string }>("select rep_id from companies where id = $1::uuid", [lead.id]))
              .rep_id,
          { timeout: 15_000 },
        )
        .toBe(saad.id);

      const after = await one<{ same: boolean }>(
        `select lead_acknowledged_at = $2::timestamptz as same from companies where id = $1::uuid`,
        [lead.id, lead.ack],
      );
      expect(after.same, "the move took the stamp off a customer his rep had already rung").toBe(true);

      const audit = await query<{ action: string; to: string }>(
        `select action, details->>'to' as "to" from audit_log
          where record_type = 'company' and record_id = $1::text
            and action in ('lead.reassign', 'company.handOver') and at >= $2::timestamptz`,
        [lead.id, started],
      );
      expect(audit).toEqual([{ action: "company.handOver", to: saad.id }]);

      // Told as a hand-over tells him — news, not a lead to pick up.
      const bells = await query<{ kind: string; user_id: string }>(
        `select kind, user_id from notifications
          where subject_type = 'company' and subject_id = $1::uuid and created_at >= $2::timestamptz`,
        [lead.id, started],
      );
      expect(bells).toEqual([{ kind: "companyHandedOver", user_id: saad.id }]);
    });

    await test.step("3 · it is not in Saad's band: it is one of his companies", async () => {
      await login(page, locale, "saad");
      await page.goto(`/${locale}/companies`);
      await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
      await expect(
        page.getByRole("region", { name: t("leads.bandTitle") }).getByRole("listitem").filter({ hasText: lead.name }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: t("companies.openCompany", { name: lead.name }) }).filter({ visible: true }),
      ).toHaveCount(1, COLD);
    });
  } finally {
    await restoreCompanyFloor(floor);
    await query("update companies set lead_acknowledged_at = $2::timestamptz where id = $1::uuid", [
      lead.id,
      lead.ack,
    ]);
    await query(
      `delete from audit_log
        where record_type = 'company' and record_id = $1::text and at >= $2::timestamptz`,
      [lead.id, started],
    );
    await putNoticesBack(lead.id, notices);
  }
});

test("a lead nobody has acknowledged stays on the list of a rep it is shared with, and off its holder's", async ({
  page,
  locale,
  t,
}) => {
  // A waiting lead on somebody else's floor, shared with Saad. The band above
  // Saad's companies carries only what is waiting on HIM, so if his list left
  // it out too, it would be on no screen of his at all (D185).
  const late = new Set((await lateLeads()).map((lead) => lead.id));
  const lead = (
    await query<{ id: string; name: string; rep_email: string }>(
      `select c.id, c.name, u.email as rep_email from companies c
         join users u on u.id = c.rep_id
        where c.lead_from_id is not null and c.lead_acknowledged_at is null
          and c.archived_at is null and u.email <> 'saad@technopanel.com.sa'
          and c.name not like 'شركة أفنان للمقاولات%'
          and not exists (
            select 1 from company_shares s
              join users su on su.id = s.user_id
             where s.company_id = c.id and su.email = 'saad@technopanel.com.sa'
          )
        order by c.created_at desc`,
    )
  ).find((row) => !late.has(row.id));
  expect(lead, "the seed has no unanswered lead to share").toBeTruthy();
  if (!lead) return;

  const saad = await userId("saad@technopanel.com.sa");
  const manager = await userId("abdulrahman@technopanel.com.sa");
  await query(
    `insert into company_shares (company_id, user_id, granted_by)
          values ($1::uuid, $2::uuid, $3::uuid)`,
    [lead.id, saad, manager],
  );

  try {
    await test.step("1 · on Saad's list, and not in his band", async () => {
      await login(page, locale, "saad");
      await page.goto(`/${locale}/companies`);
      await expect(page.getByRole("heading", { name: t("common.companies") })).toBeVisible(COLD);
      await expect(
        page.getByRole("link", { name: t("companies.openCompany", { name: lead.name }) }).filter({ visible: true }),
      ).toHaveCount(1, COLD);
      await expect(
        page.getByRole("region", { name: t("leads.bandTitle") }).getByRole("listitem").filter({ hasText: lead.name }),
      ).toHaveCount(0);
    });

    await test.step("2 · on its holder's screen it is in the band, and only there", async () => {
      const holder = lead.rep_email.split("@")[0] as Persona;
      await login(page, locale, holder);
      await page.goto(`/${locale}/companies`);
      const band = page.getByRole("region", { name: t("leads.bandTitle") });
      await expect(band.getByRole("listitem").filter({ hasText: lead.name })).toHaveCount(1, COLD);
      await expect(
        page.getByRole("link", { name: t("companies.openCompany", { name: lead.name }) }).filter({ visible: true }),
      ).toHaveCount(1);
    });
  } finally {
    await query("delete from company_shares where company_id = $1::uuid and user_id = $2::uuid", [
      lead.id,
      saad,
    ]);
  }
});

/**
 * What became of each lead marketing passed, asked of the database a second way.
 *
 * The app derives the stage with correlated `exists` subqueries (`LEAD_STAGE`,
 * src/lib/leads.ts, over the board's `STANDING` and `PRICED`); this reads the
 * same records through grouped joins, so the two can only agree by both being
 * right about the rule (D182):
 *
 * - not acknowledged, whatever else is on the company, is still waiting;
 * - won is an approved load on the company, on a paper or direct;
 * - quoted is a priced paper standing on it — a quotation number whose newest
 *   revision is still requested, sent back, issued or accepted, and some
 *   revision of which was issued. A request on the desk that was never priced
 *   is not a quote;
 * - contacted is a report on the company on or after the day it was
 *   acknowledged, and otherwise it is acknowledged.
 */
async function stagesInSql(): Promise<{ id: string; name: string; stage: LeadStage }[]> {
  return query<{ id: string; name: string; stage: LeadStage }>(
    `with passed as (
       select c.id, c.name, c.lead_acknowledged_at as ack
         from companies c
         join users f on f.id = c.lead_from_id
        where f.email = $1::text and c.archived_at is null
     ),
     numbers as (
       select (array_agg(q.company_id order by q.revision desc))[1] as company_id,
              (array_agg(q.status::text order by q.revision desc))[1] as newest,
              bool_or(q.issued_at is not null) as issued
         from quotations q
        group by q.number
     ),
     paper as (
       select numbers.company_id,
              bool_or(numbers.issued
                      and numbers.newest in ('requested', 'returned', 'issued', 'accepted')) as priced
         from numbers
        group by numbers.company_id
     ),
     loads as (
       select d.company_id, bool_or(d.status = 'approved') as approved
         from dispatches d
        group by d.company_id
     ),
     calls as (
       select p.id as company_id, count(a.id) as n
         from passed p
         join activities a on a.company_id = p.id
          and a.archived_at is null
          and p.ack is not null
          and a.happened_on >= (p.ack at time zone 'Asia/Riyadh')::date
        group by p.id
     )
     select p.id::text as id, p.name,
            case
              when p.ack is null then 'waiting'
              when coalesce(loads.approved, false) then 'won'
              when coalesce(paper.priced, false) then 'quoted'
              when coalesce(calls.n, 0) > 0 then 'contacted'
              else 'acknowledged'
            end as stage
       from passed p
       left join paper on paper.company_id = p.id
       left join loads on loads.company_id = p.id
       left join calls on calls.company_id = p.id
      order by p.name`,
    [MARKETING],
  );
}

/** The stage word the leads screen draws for each stage, in the reader's language. */
function stageWords(t: (key: string) => string): Record<LeadStage, string> {
  return {
    waiting: t("leads.notAcknowledged"),
    acknowledged: t("leads.acknowledged"),
    contacted: t("leads.contacted"),
    quoted: t("leads.quoted"),
    won: t("leads.won"),
  };
}

test("marketing's leads screen says what became of each lead it passed, as the company's own records say", async ({
  page,
  locale,
  t,
}) => {
  const expected = await stagesInSql();

  // The founder's four words each have a seeded row behind them, or this walk
  // would pass with one of them never drawn (rules/data.md).
  const seen = new Set(expected.map((lead) => lead.stage));
  for (const stage of ["acknowledged", "contacted", "quoted", "won"] as const) {
    expect(seen.has(stage), `no lead of marketing's is ${stage}`).toBe(true);
  }

  const word = stageWords(t);

  await login(page, locale, "marketing");
  await page.goto(`/${locale}/leads`);
  await expect(page.getByRole("heading", { name: t("leads.title") })).toBeVisible(COLD);

  for (const lead of expected) {
    const row = page.getByRole("row").filter({ hasText: lead.name }).first();
    await expect(row, `${lead.name} is missing`).toBeVisible(COLD);
    const stage = row.locator('[data-slot="lead-stage"]');
    await expect(stage, `${lead.name} reads the wrong stage`).toHaveAttribute(
      "data-stage",
      lead.stage,
    );
    await expect(stage.getByText(word[lead.stage], { exact: true })).toBeVisible();
  }
});

/** One lead's row on marketing's own leads screen, read for its stage. */
async function expectStage(page: Page, t: Translate, name: string, stage: LeadStage): Promise<void> {
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: name }).first();
  await expect(row, `${name} is missing`).toBeVisible(COLD);
  const cell = row.locator('[data-slot="lead-stage"]');
  await expect(cell, `${name} reads the wrong stage`).toHaveAttribute("data-stage", stage, COLD);
  await expect(cell.getByText(stageWords(t)[stage], { exact: true })).toBeVisible();
}

test("a request still on the desk is not a quote, and a lead nobody has acknowledged reads so whatever paper is on it", async ({
  page,
  locale,
  t,
}) => {
  // A lead of marketing's that somebody acknowledged, with exactly one
  // quotation on it — issued, the customer holding the price — and no load. The
  // seed's quoted lead is this (scripts/seed/demo-data.ts); asked for by shape,
  // not by name, and every change below is put back.
  const lead = await one<{
    id: string;
    name: string;
    ack: string;
    quotation: string;
    issued_at: string;
    smac: string;
  }>(
    `select c.id, c.name, c.lead_acknowledged_at::text as ack,
            q.id as quotation, q.issued_at::text as issued_at, q.smac_number as smac
       from companies c
       join users f on f.id = c.lead_from_id
       join quotations q on q.company_id = c.id
      where f.email = $1::text and c.archived_at is null
        and c.rep_id <> c.lead_from_id
        and c.lead_acknowledged_at is not null
        and q.status = 'issued' and q.revision = 1 and not q.self_issued
        and (select count(*) from quotations every_q where every_q.company_id = c.id) = 1
        and not exists (
          select 1 from dispatches d where d.company_id = c.id and d.status = 'approved'
        )
      order by c.name
      limit 1`,
    [MARKETING],
  );
  const twin = async () => (await stagesInSql()).find((row) => row.id === lead.id)?.stage;

  await login(page, locale, "marketing");
  await page.goto(`/${locale}/leads`);
  await expect(page.getByRole("heading", { name: t("leads.title") })).toBeVisible(COLD);

  try {
    await test.step("1 · a priced paper standing on it: Quoted", async () => {
      expect(await twin()).toBe("quoted");
      await expectStage(page, t, lead.name, "quoted");
    });

    await test.step("2 · the same paper back on the desk, never priced: not a quote", async () => {
      await query(
        `update quotations set status = 'requested', issued_at = null, smac_number = null
          where id = $1::uuid`,
        [lead.quotation],
      );
      const stage = await twin();
      expect(stage, "a request on the desk read as a quote").not.toBe("quoted");
      expect(["acknowledged", "contacted"]).toContain(stage);
      await expectStage(page, t, lead.name, stage!);
    });

    await test.step("3 · priced again but nobody has acknowledged it: Not acknowledged, with its age", async () => {
      await query(
        `update quotations set status = 'issued', issued_at = $2::timestamptz, smac_number = $3::text
          where id = $1::uuid`,
        [lead.quotation, lead.issued_at, lead.smac],
      );
      await query("update companies set lead_acknowledged_at = null where id = $1::uuid", [lead.id]);
      expect(await twin()).toBe("waiting");
      await expectStage(page, t, lead.name, "waiting");
      // And how long it has sat, which a row badged Quoted never said.
      const waited = (await waitingLeads()).find((row) => row.id === lead.id);
      expect(waited, "the lead is not waiting in the database").toBeTruthy();
      const row = page.getByRole("row").filter({ hasText: lead.name }).first();
      await expect(
        row.locator('[data-slot="lead-stage"] [data-slot="waited"]'),
      ).toContainText(t("queue.workingDays", { days: waited!.days }));
    });
  } finally {
    await query(
      `update quotations set status = 'issued', issued_at = $2::timestamptz, smac_number = $3::text
        where id = $1::uuid`,
      [lead.quotation, lead.issued_at, lead.smac],
    );
    await query("update companies set lead_acknowledged_at = $2::timestamptz where id = $1::uuid", [
      lead.id,
      lead.ack,
    ]);
  }
});

test("a rep has no leads screen: what is given to him waits above his companies", async ({
  page,
  locale,
  t,
}) => {
  // A lead given to somebody is work on his floor, not a list for him to
  // browse: the screen is marketing's and management's, and his rail does not
  // carry it.
  await login(page, locale, "faisal");
  const nav = page.getByRole("navigation", { name: t("shell.mainNav") }).first();
  await expect(nav.getByRole("link", { name: t("leads.title") })).toHaveCount(0, COLD);
  await page.goto(`/${locale}/leads`);
  await expect(page.getByRole("heading", { name: t("leads.title") })).toHaveCount(0, COLD);
});
