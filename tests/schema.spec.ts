import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { AUDIT_RECORD_TYPES, CHOICE_KINDS, NOTIFICATION_KINDS } from "@/db/schema";
import { one, query, userId } from "./helpers/db";

/**
 * What a row is allowed to contain (SPEC D52, D53).
 *
 * The third spec in this suite that is not a walk through a screen, and it earns
 * the exception for the same reason as the other two: none of this has an
 * appearance when it is wrong. A quotation line with a zero quantity does not
 * look broken, it looks like arithmetic. The same line twice on one dispatch
 * doubles the metres the whole month is measured by and every screen agrees with
 * itself about the wrong number.
 *
 * Zod already refuses all of it at the door. This is about the other ways in —
 * the seed, a migration, the import that will exist next year — so every check
 * below is asked of the DATABASE, with the app nowhere in the picture.
 *
 * Each attempt violates a constraint, so each fails atomically and leaves
 * nothing behind: there is no cleanup, because nothing is ever written.
 */

/** Runs the statement and returns the Postgres error, or fails if it succeeded. */
async function refused(sql: string, params: readonly unknown[] = []): Promise<string> {
  try {
    await query(sql, params);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(`the database accepted this: ${sql}`);
}

test("a quotation line cannot carry a zero or a minus", async () => {
  const line = await one<{ id: string }>("select id from quotation_items limit 1");

  for (const [column, value] of [
    ["qty", "0"],
    ["qty", "-1"],
    ["width", "0"],
    ["length", "-1.24"],
    ["price_per_sqm", "-1"],
  ] as const) {
    const message = await refused(
      `update quotation_items set ${column} = ${value} where id = $1::uuid`,
      [line.id],
    );
    expect(message, `${column} = ${value} was accepted`).toContain("violates check constraint");
  }
});

test("there is no price out of nowhere and no load from nowhere (0021, P12-9)", async () => {
  const quotation = await one<{ id: string }>("select id from quotations limit 1");
  const dispatch = await one<{ id: string }>("select id from dispatches limit 1");

  // SPEC §3: one warehouse per whole quotation and per whole dispatch. NOT NULL
  // is the whole of that rule on this side — the "never per line" half is the
  // absence of the column on quotation_items, which nothing can assert but the
  // schema itself.
  for (const [table, id] of [
    ["quotations", quotation.id],
    ["dispatches", dispatch.id],
  ] as const) {
    const message = await refused(`update ${table} set warehouse_id = null where id = $1::uuid`, [
      id,
    ]);
    expect(message, `${table}.warehouse_id took a null`).toContain("null value");
  }

  // And a store that is not a store. A row deleted out from under a quotation
  // is the same refusal from the other side, which is why the reference has no
  // cascade: a warehouse that closes is deactivated, never deleted.
  const stranger = await refused(
    "update quotations set warehouse_id = 987654321 where id = $1::uuid",
    [quotation.id],
  );
  expect(stranger).toContain("violates foreign key constraint");
});

/**
 * P14 — the rare second and third store, and the three things the database
 * says about them so that nothing else has to (SPEC §3, P14).
 *
 * The paper's own column is still the FIRST store and still NOT NULL, which is
 * what keeps "every paper names at least one" a promise the database makes.
 * These rows are the others: numbered from one, each number once on a paper,
 * each store once on a paper.
 */
test("a paper's other stores are numbered, once each, and each store is named once (0028, P14)", async () => {
  for (const [table, column, paper] of [
    [
      "quotation_warehouses",
      "quotation_id",
      `select q.id from quotations q
        where not exists (select 1 from quotation_warehouses w where w.quotation_id = q.id)
        limit 1`,
    ],
    [
      "dispatch_warehouses",
      "dispatch_id",
      `select d.id from dispatches d
        where not exists (select 1 from dispatch_warehouses w where w.dispatch_id = d.id)
        limit 1`,
    ],
  ] as const) {
    const row = await one<{ id: string }>(paper);
    const store = await one<{ id: number }>("select id from warehouses order by id limit 1");
    const other = await one<{ id: number }>("select id from warehouses order by id desc limit 1");
    const put = (warehouse: number, position: number) =>
      refused(
        `insert into ${table} (${column}, warehouse_id, position) values ($1::uuid, $2::int, $3::int)`,
        [row.id, warehouse, position],
      );

    // A store at no position, or at a position before the first.
    expect(await put(store.id, 0), `${table} took a nought position`).toContain(
      `${table}_position_check`,
    );
    expect(await put(store.id, -1), `${table} took a minus position`).toContain(
      `${table}_position_check`,
    );
    // A store that is not a store, for the same reason as the column above.
    expect(await put(987654321, 1), `${table} took a stranger`).toContain(
      "violates foreign key constraint",
    );

    // And the two ways one paper says one thing twice, which are the two ways
    // the list a screen reads it back as would be wrong.
    await query(
      `insert into ${table} (${column}, warehouse_id, position) values ($1::uuid, $2::int, 1)`,
      [row.id, store.id],
    );
    try {
      expect(await put(store.id, 2), `${table} named one store twice`).toContain(
        "duplicate key value",
      );
      expect(await put(other.id, 1), `${table} put two stores at one position`).toContain(
        "duplicate key value",
      );
    } finally {
      await query(`delete from ${table} where ${column} = $1::uuid and warehouse_id = $2::int`, [
        row.id,
        store.id,
      ]);
    }
  }
});

test("every quotation names a job, and the column is what says so (0023, P12-10)", async () => {
  const quotation = await one<{ id: string }>("select id from quotations limit 1");

  // S18 is the founder's own sentence and the form has refused a quotation
  // without a job since P12-9 — but the COLUMN stayed optional behind it, so
  // eighteen queries carried a shape only the seed could produce (§5 #184).
  // A column looser than the form is the wrong way round (rules/data.md).
  expect(
    await refused("update quotations set project_id = null where id = $1::uuid", [quotation.id]),
    "a quotation with no job on it",
  ).toContain("null value");

  // And the job has to be a job. `on delete set null` went with the null: a
  // project is archived and never deleted here, so that clause only ever said
  // "quietly detach the prices if a job is somehow removed", which is the one
  // outcome S18 forbids. The foreign key refuses the delete instead.
  const project = await one<{ id: string }>(
    "select project_id as id from quotations where id = $1::uuid",
    [quotation.id],
  );
  expect(
    await refused("delete from projects where id = $1::uuid", [project.id]),
    "a job deleted out from under the prices raised on it",
  ).toContain("violates foreign key constraint");
});

test("how a load is paid for is a choice the column holds to its own shape (0022, P12-10)", async () => {
  const id = (await one<{ id: string }>("select id from dispatches limit 1")).id;
  const set = (fields: string) =>
    refused(`update dispatches set ${fields} where id = $1::uuid`, [id]);

  // The second question is answered when it is asked. This is the case a CHECK
  // written the short way lets through: `payment_detail in (…)` is NULL rather
  // than FALSE when the column is null, and a CHECK refuses only on FALSE
  // (§5 #176), so the constraint carries `is not null and` in front of it.
  expect(
    await set("payment_terms = 'bankTransfer', payment_detail = null, payment_note = null"),
    "a transfer with no amount on it",
  ).toContain("dispatches_payment_detail_check");

  // And with the OTHER question's answer: "on delivery" is not a thing a bank
  // transfer can be, and "the full amount" is not a place cash is handed over.
  expect(
    await set("payment_terms = 'bankTransfer', payment_detail = 'onDelivery'"),
    "a transfer answered with a moment",
  ).toContain("dispatches_payment_detail_check");
  expect(
    await set("payment_terms = 'cash', payment_detail = 'fullAmount'"),
    "cash answered with an amount",
  ).toContain("dispatches_payment_detail_check");

  // Where there is no second question there is no second answer either.
  expect(
    await set("payment_terms = 'credit', payment_detail = 'fullAmount', payment_note = 'x'"),
    "credit carrying an answer nobody asked for",
  ).toContain("dispatches_payment_detail_check");

  // "Credit and tasaheel are one payment option with a mandatory note" (SPEC §3,
  // P13) — for finance to review.
  expect(
    await set("payment_terms = 'credit', payment_detail = null, payment_note = null"),
    "credit with nothing written for finance",
  ).toContain("dispatches_payment_note_check");
  expect(
    await set("payment_terms = 'tasaheel'"),
    "tasaheel as a fourth option, after P13 made it one with credit",
  ).toContain("invalid input value for enum");

  // A note that is there says something. `btrim` trims spaces and not tabs or
  // newlines, which is how an empty daily report once satisfied its own
  // constraint (rules/data.md), so the emptiness test is a character class.
  expect(await set("payment_note = E'\t\n'"), "a note of whitespace").toContain(
    "dispatches_payment_note_blank_check",
  );

  // And the three are a closed set: a fourth way to pay is a migration, not a
  // string somebody types.
  expect(await set("payment_terms = 'cheque'"), "a way to pay that is not one of the three")
    .toContain("invalid input value for enum");
});

test("a quotation names a person at its own customer, or nobody (0021, P12-9)", async () => {
  // The column is nullable and means it: a price for stock is addressed to the
  // company rather than to anybody, and the seed has one of those.
  const row = await one<{ n: string }>(
    "select count(*)::text as n from quotations where contact_id is null",
  );
  expect(Number(row.n)).toBeGreaterThan(0);

  // The pairing is not a database constraint and this says why, so the next
  // reader does not add one: a fold archives the arriving duplicate of a person
  // both reps held where it is (D153), so a quotation may honestly keep
  // pointing at a contact whose company is now a tombstone. What the database
  // does guarantee is that the person exists.
  const stranger = await refused(
    `update quotations set contact_id = '00000000-0000-0000-0000-000000000001'::uuid
      where id = (select id from quotations limit 1)`,
  );
  expect(stranger).toContain("violates foreign key constraint");

  // Every live one that names somebody names somebody at its own customer,
  // which is the action's rule (`readAddressing`) holding on the seeded floor.
  const wrong = await query(
    `select 1 from quotations q
       join contacts ct on ct.id = q.contact_id
       join companies c on c.id = q.company_id
      where ct.company_id <> q.company_id and c.merged_into_id is null`,
  );
  expect(wrong).toHaveLength(0);
});

test("a dispatch cannot be approved before it was raised", async () => {
  const row = await one<{ id: string }>(
    "select id from dispatches where status = 'approved' limit 1",
  );

  // The demo wrote exactly this for two dispatches, on two clocks, and no screen
  // read the pair in order until the drawer's trail did (P11J).
  const message = await refused(
    "update dispatches set approved_at = created_at - interval '1 day' where id = $1::uuid",
    [row.id],
  );
  expect(message, "an approval before the request was accepted").toContain(
    "violates check constraint",
  );
});

test("one line of a quotation goes on a dispatch once", async () => {
  const item = await one<{ dispatch_id: string; quotation_item_id: string }>(
    "select dispatch_id, quotation_item_id from dispatch_items where quotation_item_id is not null limit 1",
  );

  // The same line again on the same dispatch: the m² it moved would count twice.
  // Its whole sheet is copied and only the position moved, so the one thing
  // wrong with the row is that it is the same line.
  const message = await refused(
    `insert into dispatch_items
       (dispatch_id, quotation_item_id, qty, position, colour_code, supplier_id, fire_rating_id,
        class_id, thickness_id, width, length, price_per_sqm)
     select dispatch_id, quotation_item_id, 1, position + 1000, colour_code, supplier_id,
            fire_rating_id, class_id, thickness_id, width, length, price_per_sqm
       from dispatch_items
      where dispatch_id = $1::uuid and quotation_item_id = $2::uuid`,
    [item.dispatch_id, item.quotation_item_id],
  );
  expect(message).toContain("dispatch_items_line_idx");
});

test("a dispatch is a load: its own customer and sheet, a job under a paper, a difference only where there was one (0025, P13)", async () => {
  const d = await one<{ id: string }>(
    "select id from dispatches where quotation_id is not null limit 1",
  );
  const set = (fields: string) =>
    refused(`update dispatches set ${fields} where id = $1::uuid`, [d.id]);

  // The customer is the dispatch's own now, because a direct one has no paper to
  // read it through.
  expect(await set("company_id = null"), "a load to nobody").toContain("not-null");
  expect(await set("raised_by_id = null"), "a load nobody raised").toContain("not-null");
  // A quotation is always for a job (S18), so a dispatch prefilled from one is.
  expect(await set("project_id = null"), "a paper's load with no job").toContain(
    "dispatches_project_check",
  );
  // The difference is recorded exactly when there was a paper to differ from.
  expect(await set("quotation_difference = null"), "a paper's load with no record").toContain(
    "dispatches_difference_check",
  );
  expect(
    await set("quotation_id = null, quotation_difference = '[]'::jsonb"),
    "a direct load claiming to match a paper it does not have",
  ).toContain("dispatches_difference_check");
  expect(
    await refused(
      "update quotations set raised_by_id = null where id = (select id from quotations limit 1)",
    ),
    "a quotation nobody raised",
  ).toContain("not-null");

  // A line carries its own sheet, held to the same rules as a quotation's.
  const line = await one<{ id: string }>(
    "select id from dispatch_items where dispatch_id = $1::uuid limit 1",
    [d.id],
  );
  for (const [column, value] of [
    ["qty", "0"],
    ["width", "0"],
    ["length", "-1.24"],
    ["price_per_sqm", "-1"],
  ] as const) {
    expect(
      await refused(`update dispatch_items set ${column} = ${value} where id = $1::uuid`, [line.id]),
      `a dispatch line with ${column} = ${value}`,
    ).toContain("violates check constraint");
  }
  // Its m² is generated from its own sheet, never from the quotation's.
  const stale = await one<{ n: string }>(
    "select count(*)::text as n from dispatch_items where sqm is distinct from round(width * length * qty, 2)",
  );
  expect(Number(stale.n)).toBe(0);
  // "Item 1, Item 2" on a load is a position, and two lines cannot share one.
  const [two] = await query<{ dispatch_id: string }>(
    "select dispatch_id from dispatch_items group by dispatch_id having count(*) > 1 limit 1",
  );
  expect(two, "the demo floor has a dispatch of more than one line").toBeTruthy();
  if (two) {
    expect(
      await refused(
        `update dispatch_items set position = (
           select min(position) from dispatch_items where dispatch_id = $1::uuid)
          where id = (select id from dispatch_items where dispatch_id = $1::uuid
                       order by position desc limit 1)`,
        [two.dispatch_id],
      ),
    ).toContain("dispatch_items_position_idx");
  }
});

test("a service is priced over an area, once per position, on a quotation and on a dispatch (0025, P13)", async () => {
  const q = await one<{ id: string }>("select id from quotations limit 1");
  const d = await one<{ id: string }>("select id from dispatches limit 1");
  for (const [table, parent, id] of [
    ["quotation_services", "quotation_id", q.id],
    ["dispatch_services", "dispatch_id", d.id],
  ] as const) {
    const insert = (rows: string) =>
      refused(
        `insert into ${table} (${parent}, position, service_id, sqm, price_per_sqm)
         select $1::uuid, v.position, (select id from services order by sort_order limit 1), v.sqm, v.price
           from (values ${rows}) as v(position, sqm, price)`,
        [id],
      );
    expect(await insert("(1, 0::numeric, 10::numeric)"), `${table}: no area`).toContain(
      `${table}_sqm_check`,
    );
    expect(await insert("(1, 12::numeric, -1::numeric)"), `${table}: a minus price`).toContain(
      `${table}_price_check`,
    );
    expect(
      await insert("(1, 12::numeric, 5::numeric), (1, 8::numeric, 5::numeric)"),
      `${table}: two services at one position`,
    ).toContain(`${table}_position_idx`);
  }
});

test("a log entry takes an outcome from the admin's list and the kinds a report offers (0025, P13)", async () => {
  // Six kinds of what happened, a site visit and a meeting among them.
  const kinds = await one<{ kinds: string }>("select enum_range(null::channel)::text as kinds");
  expect(kinds.kinds).toBe("{visit,siteVisit,meeting,call,whatsapp,other}");
  // An outcome is a row the admin keeps, never a word typed into the entry.
  expect(
    await refused(
      "update activities set outcome_id = 2147483647 where id = (select id from activities limit 1)",
    ),
  ).toContain("activities_outcome_id_outcomes_id_fk");
  const lists = await one<{ services: string; outcomes: string }>(
    "select (select count(*)::text from services) as services, (select count(*)::text from outcomes) as outcomes",
  );
  expect(Number(lists.services)).toBeGreaterThan(0);
  expect(Number(lists.outcomes)).toBeGreaterThan(0);
});

test("the same SMAC number cannot be typed twice", async () => {
  const rows = await query<{ id: string; smac_number: string }>(
    "select id, smac_number from quotations where smac_number is not null order by number limit 2",
  );
  expect(rows.length, "the seed has fewer than two issued quotations").toBe(2);

  const message = await refused("update quotations set smac_number = $1::text where id = $2::uuid", [
    rows[0].smac_number,
    rows[1].id,
  ]);
  expect(message).toContain("quotations_smac_number_idx");
});

test("a company has exactly one main contact and exactly one city", async () => {
  const contact = await one<{ id: string; company_id: string }>(
    `select c.id, c.company_id from contacts c
      where c.is_main = false and c.archived_at is null
      limit 1`,
  );
  const second = await refused("update contacts set is_main = true where id = $1::uuid", [
    contact.id,
  ]);
  expect(second).toContain("contacts_one_main_idx");

  const company = await one<{ id: string }>(
    "select id from companies where city_id is not null limit 1",
  );
  // Both, which is what a form with two city fields would write.
  const both = await refused(
    "update companies set city_text = 'Riyadh' where id = $1::uuid",
    [company.id],
  );
  expect(both).toContain("companies_city_check");
});

/**
 * The three columns that make a company a lead are one fact (D157).
 *
 * A lead with nothing the customer asked for is a name and a phone number,
 * which is what Add company is already for; and an acknowledgement of a lead
 * nobody gave is a state that never happened. Both are refused by the column,
 * not only by the action, because the column is the guard for the ways in that
 * are not the app (rules/data.md).
 */
test("a lead carries what was asked, and an answer belongs to a lead", async () => {
  const lead = await one<{ id: string }>(
    "select id from companies where lead_from_id is not null limit 1",
  );
  const noQuery = await refused("update companies set lead_query = null where id = $1::uuid", [
    lead.id,
  ]);
  expect(noQuery).toContain("companies_lead_check");

  const plain = await one<{ id: string }>(
    "select id from companies where lead_from_id is null limit 1",
  );
  const answered = await refused(
    "update companies set lead_acknowledged_at = now() where id = $1::uuid",
    [plain.id],
  );
  expect(answered).toContain("companies_lead_ack_check");
});

test("a status and the instants that belong to it agree", async () => {
  const issued = await one<{ id: string }>(
    "select id from quotations where status = 'issued' limit 1",
  );

  // An issued quotation with no issued_at reads as one that has waited zero days
  // for ever, on the screen that says what is stuck.
  const noInstant = await refused("update quotations set issued_at = null where id = $1::uuid", [
    issued.id,
  ]);
  expect(noInstant).toContain("quotations_issued_check");

  const noNumber = await refused("update quotations set smac_number = null where id = $1::uuid", [
    issued.id,
  ]);
  expect(noNumber).toContain("quotations_smac_check");
});

test("a reason lives exactly as long as the state it explains", async () => {
  const returned = await one<{ id: string }>(
    "select id from quotations where status = 'returned' limit 1",
  );

  // The rep fixes what she sent back and asks again — and her words must not
  // come with it. They did: the status moved to `requested` and the reason
  // stayed, saying something untrue about a corrected quotation. No screen shows
  // it, because every screen asks the status first, which is exactly why it
  // survived to be read by something else one day (D72).
  const stale = await refused(
    "update quotations set status = 'requested' where id = $1::uuid",
    [returned.id],
  );
  expect(stale).toContain("quotations_returned_check");

  // And the other way round: sent back is sent back FOR something. A returned
  // quotation with no reason is a rep told to fix he does not know what.
  const silent = await refused("update quotations set return_reason = null where id = $1::uuid", [
    returned.id,
  ]);
  expect(silent).toContain("quotations_returned_check");
});

test("a decided quotation carries its instant, and only a decided one", async () => {
  // Half of `quotations_decided_check` (drizzle/0002_constraints.sql):
  // `(decided_at is not null) = (status in ('accepted','rejected','cancelled'))`.
  // Untested since it was written (SPEC D99) — the app always writes both
  // columns together, so only a direct write ever finds the gap.
  const issued = await one<{ id: string }>(
    "select id from quotations where status = 'issued' and decided_at is null limit 1",
  );

  // A decided status with no instant: reads as waiting zero days for ever.
  const statusOnly = await refused(
    "update quotations set status = 'rejected' where id = $1::uuid",
    [issued.id],
  );
  expect(statusOnly, "a decided status with no decided_at was accepted").toContain(
    "violates check constraint",
  );
  expect(statusOnly).toContain("quotations_decided_check");

  // And the other way round: an instant with no decision behind it.
  const instantOnly = await refused(
    "update quotations set decided_at = now() where id = $1::uuid",
    [issued.id],
  );
  expect(instantOnly, "an instant on an undecided quotation was accepted").toContain(
    "violates check constraint",
  );
  expect(instantOnly).toContain("quotations_decided_check");

  // Both together is the real transition the app performs, and the
  // constraint has to let it through. `query()` draws from a pool, so a
  // BEGIN here has no guarantee of landing on the same connection as the
  // ROLLBACK after it — the update is made and then undone by hand instead.
  try {
    await query("update quotations set status = 'rejected', decided_at = now() where id = $1::uuid", [
      issued.id,
    ]);
  } finally {
    await query("update quotations set status = 'issued', decided_at = null where id = $1::uuid", [
      issued.id,
    ]);
  }
});

test("a revision names a quotation that exists", async () => {
  const quotation = await one<{ id: string }>("select id from quotations limit 1");
  const message = await refused(
    "update quotations set revision_of = gen_random_uuid() where id = $1::uuid",
    [quotation.id],
  );
  expect(message).toContain("violates foreign key constraint");
});

test("a report says what came of it, and there is no second kind of report beside it (0026, P13-S4)", async () => {
  // A report is the entries (D167): the end-of-day sentence and its table are
  // gone, and so is the audit trail's word for them. Asked of information_schema
  // rather than of the migration's success line (rules/migrations.md).
  const gone = await query(
    "select 1 from information_schema.tables where table_schema = 'public' and table_name = 'daily_reports'",
  );
  expect(gone.length, "daily_reports is still there").toBe(0);
  expect(AUDIT_RECORD_TYPES as readonly string[]).not.toContain("daily_report");
  const trail = await one<{ n: string }>(
    "select count(*)::text as n from audit_log where record_type = 'daily_report'",
  );
  expect(trail.n).toBe("0");

  // What came of it is one answer from the admin's list, and there is no report
  // without one (SPEC §3 P13) — the popup asks, and so does the column, because
  // the seed and a future import are ways in too.
  const column = await one<{ is_nullable: string }>(
    `select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'activities' and column_name = 'outcome_id'`,
  );
  expect(column.is_nullable).toBe("NO");

  const entry = await one<{ company_id: string; user_id: string }>(
    "select company_id, user_id from activities limit 1",
  );
  const message = await refused(
    `insert into activities (company_id, user_id, text, channel, happened_on)
     values ($1::uuid, $2::uuid, 'a call with nothing come of it', 'call', '2026-01-04'::date)`,
    [entry.company_id, entry.user_id],
  );
  expect(message, "an entry without an outcome was accepted").toContain("outcome_id");
  expect(message).toContain("not-null constraint");
});

test("archiving a company keeps why (S16, D87)", async () => {
  // Asked of information_schema, not of the ORM's opinion (rules/migrations.md):
  // a migration that silently did nothing would leave the app writing to a
  // column that is not there.
  const column = await query<{ data_type: string }>(
    `select data_type from information_schema.columns
      where table_name = 'companies' and column_name = 'archive_reason'`,
  );
  expect(column).toHaveLength(1);
  expect(column[0].data_type).toBe("text");
});

test("a notice's subject is one of a closed list (D100)", async () => {
  // subject_type was a closed list in TypeScript over a free-text column: closed
  // in the editor, open here, so a seed or a migration could write a fourth kind
  // that no clearing would ever look for.
  const rows = await query<{
    user_id: string;
    kind: string;
    params: Record<string, unknown>;
    link: string;
    subject_id: string;
  }>("select user_id, kind, params, link, subject_id from notifications limit 1");
  const seeded = rows[0];

  const userId = seeded?.user_id ?? (await one<{ id: string }>("select id from users limit 1")).id;
  const kind = seeded?.kind ?? "test";
  const params = JSON.stringify(seeded?.params ?? {});
  const link = seeded?.link ?? "#";
  const subjectId =
    seeded?.subject_id ?? (await one<{ id: string }>("select gen_random_uuid() as id")).id;

  // This test has had to move its own goalposts twice, and both moves are the
  // rule working rather than the rule bending. 'project' was the refused value
  // until migration 0014 (D147), when a project SHARE needed a notice about the
  // record itself. 'contact' was the refused value after that — a notice was
  // never about a person on their own, it was read through the company — until
  // migration 0030 (P14 14.8), when two of one customer's people could each
  // have a request to archive waiting on them, and a notice about one had to be
  // clearable without clearing the other. So the list is five now, and the
  // value below is outside it: nothing in this app ever notifies about a user.
  const message = await refused(
    `insert into notifications (user_id, kind, params, link, subject_type, subject_id)
     values ($1::uuid, $2, $3::jsonb, $4, 'user', $5::uuid)`,
    [userId, kind, params, link, subjectId],
  );
  expect(message).toContain("violates check constraint");
  expect(message).toContain("notifications_subject_type_check");
});

test("a quotation line's position is unique within the quotation (D100)", async () => {
  // dispatch_items had its line index from 0002; a quotation's lines had none —
  // the app rewrites lines by delete-and-insert, so nothing renumbers in place
  // against it, and two lines at one position are one label for two figures.
  const line = await one<{
    quotation_id: string;
    position: number;
    colour_code: string;
    supplier_id: number;
    fire_rating_id: number;
    class_id: number;
    qty: number;
    thickness_id: number;
    width: string;
    length: string;
    price_per_sqm: string;
  }>(
    `select quotation_id, position, colour_code, supplier_id, fire_rating_id, class_id, qty,
            thickness_id, width, length, price_per_sqm
       from quotation_items limit 1`,
  );

  const message = await refused(
    `insert into quotation_items
       (quotation_id, position, colour_code, supplier_id, fire_rating_id, class_id, qty,
        thickness_id, width, length, price_per_sqm)
     values ($1::uuid, $2::integer, $3, $4::integer, $5::integer, $6::integer, $7::integer,
             $8::integer, $9::numeric, $10::numeric, $11::numeric)`,
    [
      line.quotation_id,
      line.position,
      line.colour_code,
      line.supplier_id,
      line.fire_rating_id,
      line.class_id,
      line.qty,
      line.thickness_id,
      line.width,
      line.length,
      line.price_per_sqm,
    ],
  );
  expect(message).toContain("duplicate key value violates unique constraint");
  expect(message).toContain("quotation_items_position_idx");
});

test("a target's month is always the first of the month (D100)", async () => {
  // A target's month is its first day. The form made it so; the unique index on
  // (person, month) only means anything if every writer does — the person's
  // target first, then the company's own.
  const user = await one<{ id: string }>("select id from users limit 1");

  const badTarget = await refused(
    "insert into targets (user_id, month, sqm) values ($1::uuid, '2031-03-15', 10)",
    [user.id],
  );
  expect(badTarget).toContain("targets_month_check");

  const badCompanyTarget = await refused(
    "insert into company_targets (month, sqm) values ('2031-03-15', 10)",
  );
  expect(badCompanyTarget).toContain("company_targets_month_check");

  // And the real write the form makes — the first of a month far enough in the
  // future that no seeded row collides with it — must go through.
  try {
    await query("insert into company_targets (month, sqm) values ('2031-03-01', 10)");
    const written = await query(
      "select sqm from company_targets where month = '2031-03-01'",
    );
    expect(written, "a first-of-month company target was refused").toHaveLength(1);
  } finally {
    await query("delete from company_targets where month = '2031-03-01'");
  }
});

test("the catalogue carries what D100 promised", async () => {
  // Asked of pg_indexes/pg_constraint, not the ORM's opinion (rules/migrations.md):
  // a migration that silently did nothing would leave the app relying on an
  // index or a check that is not actually there.
  const indexes = await query<{ indexname: string }>(
    `select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in ('audit_log_user_at_idx', 'quotation_items_position_idx')`,
  );
  expect(indexes.map((row) => row.indexname).sort()).toEqual([
    "audit_log_user_at_idx",
    "quotation_items_position_idx",
  ]);

  const constraints = await query<{ conname: string }>(
    `select conname from pg_constraint
      where conname in ('notifications_subject_type_check', 'targets_month_check', 'company_targets_month_check')`,
  );
  expect(constraints.map((row) => row.conname).sort()).toEqual([
    "company_targets_month_check",
    "notifications_subject_type_check",
    "targets_month_check",
  ]);
});

test("a notice's kind is one of the list (0012, D106)", async () => {
  // kind was the same trap subject_type already had (D100): a TypeScript union
  // over a free-text column, closed in the editor and open in the database.
  const seeded = await one<{
    user_id: string;
    params: Record<string, unknown>;
    link: string;
    subject_type: string;
    subject_id: string;
  }>("select user_id, params, link, subject_type, subject_id from notifications limit 1");

  // A copy of a real row with the kind swapped for one no locale has a
  // sentence for — it would reach the bell as a raw key.
  const bad = await refused(
    `insert into notifications (user_id, kind, params, link, subject_type, subject_id)
     values ($1::uuid, 'somethingElse', $2::jsonb, $3, $4, $5::uuid)`,
    [seeded.user_id, JSON.stringify(seeded.params), seeded.link, seeded.subject_type, seeded.subject_id],
  );
  expect(bad).toContain("violates check constraint");
  expect(bad).toContain("notifications_kind_check");

  // And the other way round: every kind the app actually writes, from the one
  // list the check itself reads — never a copy of it typed again here.
  try {
    for (const kind of NOTIFICATION_KINDS) {
      await query(
        `insert into notifications (user_id, kind, params, link, subject_type, subject_id)
         values ($1::uuid, $2, $3::jsonb, '/spec-11c1', $4, gen_random_uuid())`,
        [seeded.user_id, kind, JSON.stringify(seeded.params), seeded.subject_type],
      );
    }
    const written = await query("select kind from notifications where link = '/spec-11c1'");
    expect(written, "not every listed kind was accepted").toHaveLength(NOTIFICATION_KINDS.length);
  } finally {
    await query("delete from notifications where link = '/spec-11c1'");
  }
});

test("a trail line is about a kind of record the app writes (0012, D106)", async () => {
  const user = await one<{ id: string }>("select id from users limit 1");

  // A kind the trail has no word for — nothing renders it, nothing clears it.
  const bad = await refused(
    `insert into audit_log (user_id, action, record_type, record_id)
     values ($1::uuid, 'spec.check', 'invoice', gen_random_uuid()::text)`,
    [user.id],
  );
  expect(bad).toContain("violates check constraint");
  expect(bad).toContain("audit_log_record_type_check");

  // Every kind the trail is actually written against — the eight floor
  // records, the two admin settings, the eight reference lists — from
  // AUDIT_RECORD_TYPES itself, so a ninth list added there is proven here too.
  try {
    for (const recordType of AUDIT_RECORD_TYPES) {
      await query(
        `insert into audit_log (user_id, action, record_type, record_id)
         values ($1::uuid, 'spec.check', $2, gen_random_uuid()::text)`,
        [user.id, recordType],
      );
    }
    const written = await query("select record_type from audit_log where action = 'spec.check'");
    expect(written, "not every listed record type was accepted").toHaveLength(
      AUDIT_RECORD_TYPES.length,
    );
  } finally {
    await query("delete from audit_log where action = 'spec.check'");
  }
});

test("an archive reason lives only on an archived company (0012, D87)", async () => {
  const live = await one<{ id: string }>("select id from companies where archived_at is null limit 1");

  // A reason on a company that never left the floor is a state that never
  // happened (rules/data.md).
  const onLive = await refused(
    "update companies set archive_reason = 'spec' where id = $1::uuid",
    [live.id],
  );
  expect(onLive).toContain("violates check constraint");
  expect(onLive).toContain("companies_archive_reason_check");

  // The other way stays open: an archived company with no reason is a row
  // archived before 0010 gave one, and the constraint has to let that through.
  // The demo keeps one archived company with its reason (rules/data.md: a
  // state the demo never shows is a branch nobody has seen), so this half of
  // the rule runs against a row every time rather than being skipped.
  const archived = await query<{ id: string; archive_reason: string | null }>(
    "select id, archive_reason from companies where archived_at is not null limit 1",
  );
  expect(archived, "the seed has no archived company for this half to run against").toHaveLength(1);
  const company = archived[0];
  try {
    const written = await query(
      "update companies set archive_reason = null where id = $1::uuid returning archive_reason",
      [company.id],
    );
    expect(written, "a cleared reason on an archived company was refused").toHaveLength(1);
  } finally {
    await query("update companies set archive_reason = $2 where id = $1::uuid", [
      company.id,
      company.archive_reason,
    ]);
  }
});

test("a company cannot be shared with the same person twice (0014, D147)", async () => {
  // The seed's own standing example (scripts/seed/demo-data.ts): Anmaa,
  // shared with Saad, so this asks about a row that is guaranteed to exist
  // rather than an arbitrary `limit 1` a later test's own fixture could shift.
  //
  // One of its shares and not its only one. The seeded fold puts Turki on this
  // same company as well (P12-8), which is what "keep it and share it" means —
  // so the named company pins WHICH list this is about, and the order pins
  // which row of it, without either of them claiming the list has one row.
  const row = await one<{ company_id: string; user_id: string; granted_by: string }>(
    `select cs.company_id, cs.user_id, cs.granted_by
       from company_shares cs
       join companies c on c.id = cs.company_id
      where c.name = $1::text
      order by cs.user_id
      limit 1`,
    ["شركة أنماء للمقاولات"],
  );
  // Pressing "Add" a second time on somebody already on the list is the
  // action's own `onConflictDoNothing` (src/actions/shares.ts) — this is the
  // index that makes that safe, asked directly against a write that skips it.
  const message = await refused(
    "insert into company_shares (company_id, user_id, granted_by) values ($1::uuid, $2::uuid, $3::uuid)",
    [row.company_id, row.user_id, row.granted_by],
  );
  expect(message).toContain("company_shares_company_user_idx");
});

test("a project cannot be shared with the same person twice (0014, D147)", async () => {
  // The seed's own tower, shared with Saad alongside Anmaa — the same reason
  // as the company test above: a row this is guaranteed to find.
  const row = await one<{ project_id: string; user_id: string; granted_by: string }>(
    `select ps.project_id, ps.user_id, ps.granted_by
       from project_shares ps
       join projects p on p.id = ps.project_id
      where p.name = $1::text`,
    ["برج مكاتب طريق الملك فهد"],
  );
  const message = await refused(
    "insert into project_shares (project_id, user_id, granted_by) values ($1::uuid, $2::uuid, $3::uuid)",
    [row.project_id, row.user_id, row.granted_by],
  );
  expect(message).toContain("project_shares_project_user_idx");
});

test("contacts_one_main_idx is now per rep: two mains on one company for two reps, never two for one (0014, D147)", async () => {
  // Anmaa again, by name rather than an arbitrary row: this test WRITES a
  // second main contact, and a `limit 1` main contact picked at random could
  // land on a company tests/sharing.spec.ts has its own rep on, which would
  // make the "different rep" half below collide with a row that spec left
  // behind on purpose (D147: "stays exactly where it is").
  const anmaa = await one<{ id: string }>("select id from companies where name = $1::text", [
    "شركة أنماء للمقاولات",
  ]);
  const main = await one<{ id: string; rep_id: string }>(
    `select id, rep_id from contacts
      where company_id = $1::uuid and is_main = true and archived_at is null
      limit 1`,
    [anmaa.id],
  );

  // The same rep, a second main: two would make "the number to call" depend
  // on which row came back first (D18).
  const sameRep = await refused(
    `insert into contacts (company_id, rep_id, name, phone, phone_normalized, is_main)
     values ($1::uuid, $2::uuid, 'spec-schema-same-rep', '0500000010', '+966500000010', true)`,
    [anmaa.id, main.rep_id],
  );
  expect(sameRep).toContain("contacts_one_main_idx");

  // A different rep on the SAME company: narrowed by D147, one main per rep
  // rather than one per company, so a second rep's own first contact there
  // must go through. Jerom never holds a contact anywhere in the seed, so
  // this row cannot collide with one a fixture left behind.
  const jerom = await userId("jerom@technopanel.com.sa");
  try {
    const written = await query(
      `insert into contacts (company_id, rep_id, name, phone, phone_normalized, is_main)
       values ($1::uuid, $2::uuid, 'spec-schema-other-rep', '0500000011', '+966500000011', true)
       returning id`,
      [anmaa.id, jerom],
    );
    expect(written, "a second rep's own main contact on the same company was refused").toHaveLength(
      1,
    );
  } finally {
    await query("delete from contacts where phone_normalized = '+966500000011'");
  }
});

test("fold_name takes the spelling out of a name, and the stored column is not stale (0020, D158)", async () => {
  /*
   * The pairs a duplicate warning has to see through. Every left-hand name is a
   * different STRING from its right-hand one and the same customer: the
   * definite article Arabic glues to a word, a fatha somebody typed, ة against
   * ه, ى against ي, Arabic-Indic digits, and the words every second firm in
   * this trade carries in front of its own name.
   */
  const same = [
    ["الشركة الوطنية للتشييد", "شركة الوطنية للتشييد"],
    ["مؤسسة الفَهْد للتجارة", "الفهد للتجاره"],
    ["مصنع ٢٤ للألمنيوم", "24 للالمنيوم"],
    ["Al-Watania Trading Co.", "AL WATANIA TRADING COMPANY"],
    ["مكتب المعمار الحديث", "المعمار الحديث"],
  ];
  for (const [a, b] of same) {
    const row = await one<{ same: boolean }>(
      "select fold_name($1::text) = fold_name($2::text) as same",
      [a, b],
    );
    expect(row.same, `${a} and ${b} should fold alike`).toBe(true);
  }

  // And two firms that merely start the same way do not become one name.
  const apart = await one<{ same: boolean }>(
    "select fold_name($1::text) = fold_name($2::text) as same",
    ["شركة الفهد للمقاولات", "شركة النصر للمقاولات"],
  );
  expect(apart.same).toBe(false);

  // A name that is nothing but the trade's own words folds to NULL, so it
  // matches nothing rather than everything.
  const noise = await one<{ folded: string | null }>("select fold_name('شركة') as folded");
  expect(noise.folded).toBeNull();

  /*
   * The trap that comes with a stored generated column: Postgres does not
   * recompute one when the function behind it changes. A fold edited without
   * rewriting the column leaves every company on file compared by last year's
   * rule, and no screen looks any different. This is the only thing that would
   * ever say so.
   */
  const stale = await query(
    "select id from companies where name_folded is distinct from fold_name(name)",
  );
  expect(stale, "companies.name_folded is stale — rewrite it in the migration that changed fold_name").toHaveLength(0);
});

test("one duplicate flag per pair, for ever, whichever way round it arrives (0020, D158)", async () => {
  const flag = await one<{ company_id: string; other_id: string; matched_phone: string }>(
    "select company_id, other_id, matched_phone from duplicate_flags limit 1",
  );

  // The same pair again, as the detector offers it on every later run.
  const again = await refused(
    "insert into duplicate_flags (company_id, other_id, matched_phone) values ($1::uuid, $2::uuid, $3::text)",
    [flag.company_id, flag.other_id, flag.matched_phone],
  );
  expect(again).toContain("duplicate_flags_pair_idx");

  // And the other way round, which is how it arrives when the second record is
  // the one whose number changed. This is what "a false duplicate is remembered
  // so the same pair is never raised again" IS.
  const reversed = await refused(
    "insert into duplicate_flags (company_id, other_id, matched_phone) values ($1::uuid, $2::uuid, $3::text)",
    [flag.other_id, flag.company_id, flag.matched_phone],
  );
  expect(reversed).toContain("duplicate_flags_pair_idx");

  // A pair of one is not a pair.
  const itself = await refused(
    "insert into duplicate_flags (company_id, other_id, matched_phone) values ($1::uuid, $1::uuid, '+966500000099')",
    [flag.company_id],
  );
  expect(itself).toContain("duplicate_flags_pair_check");
});

test("a ruling and its survivor stand or fall together (0020, D158)", async () => {
  const flag = await one<{ id: string }>(
    "select id from duplicate_flags where status = 'open' limit 1",
  );
  const jerom = await userId("jerom@technopanel.com.sa");

  // Answered with nobody having answered it.
  const noRuler = await refused(
    "update duplicate_flags set status = 'notDuplicate' where id = $1::uuid",
    [flag.id],
  );
  expect(noRuler).toContain("duplicate_flags_ruled_check");

  // A fold with no record continuing.
  const noSurvivor = await refused(
    "update duplicate_flags set status = 'kept', ruled_by = $2::uuid, ruled_at = now() where id = $1::uuid",
    [flag.id, jerom],
  );
  expect(noSurvivor).toContain("duplicate_flags_survivor_check");

  // A survivor that is neither of the two records.
  const stranger = await one<{ id: string }>(
    `select c.id from companies c
      where c.id not in (select company_id from duplicate_flags where id = $1::uuid
                          union select other_id from duplicate_flags where id = $1::uuid)
      limit 1`,
    [flag.id],
  );
  const wrongSurvivor = await refused(
    `update duplicate_flags set status = 'kept', survivor_id = $3::uuid,
            ruled_by = $2::uuid, ruled_at = now() where id = $1::uuid`,
    [flag.id, jerom, stranger.id],
  );
  expect(wrongSurvivor).toContain("duplicate_flags_survivor_check");

  // And a status nothing has a word for.
  const unknown = await refused(
    "update duplicate_flags set status = 'merged', ruled_by = $2::uuid, ruled_at = now() where id = $1::uuid",
    [flag.id, jerom],
  );
  expect(unknown).toContain("duplicate_flags_status_check");
});

test("a tombstone is off the floor by construction, and is never its own survivor (0020, D158)", async () => {
  const pair = await one<{ folded: string; survivor: string }>(
    "select id as folded, merged_into_id as survivor from companies where merged_into_id is not null limit 1",
  );

  // Back on the floor while still pointing at another record: the state the
  // admin's restore refuses in a sentence, refused here in the column.
  const onFloor = await refused(
    "update companies set archived_at = null where id = $1::uuid",
    [pair.folded],
  );
  expect(onFloor).toContain("companies_merged_check");

  const itself = await refused(
    "update companies set merged_into_id = id where id = $1::uuid",
    [pair.folded],
  );
  expect(itself).toContain("companies_merged_check");
});

test("a person has one answer per question, and the question is one of three (0024, D164)", async () => {
  const user = await one<{ id: string }>("select id from users limit 1");
  // A screen no page reads, so nothing this walk writes can decide what a later
  // one opens on.
  const screen = "spec-14";

  // The same trap every free-text column with a union over it has (D106): a
  // fourth kind would be a preference nothing ever reads back.
  const bad = await refused(
    `insert into screen_choices (user_id, kind, screen, choice)
     values ($1::uuid, 'colour', $2, 'blue')`,
    [user.id, screen],
  );
  expect(bad).toContain("violates check constraint");
  expect(bad).toContain("screen_choices_kind_check");

  try {
    // Every kind the app writes, from the list the check itself reads.
    for (const kind of CHOICE_KINDS) {
      await query(
        `insert into screen_choices (user_id, kind, screen, choice)
         values ($1::uuid, $2, $3, 'board')`,
        [user.id, kind, screen],
      );
    }
    const written = await query(
      "select kind from screen_choices where user_id = $1::uuid and screen = $2",
      [user.id, screen],
    );
    expect(written, "not every listed kind was accepted").toHaveLength(CHOICE_KINDS.length);

    // And one answer each. A second row for the same person, kind and screen
    // would be two memories of one choice, and nothing decides between them —
    // which is why the write is an upsert and the key is all three columns.
    const twice = await refused(
      `insert into screen_choices (user_id, kind, screen, choice)
       values ($1::uuid, 'view', $2, 'list')`,
      [user.id, screen],
    );
    expect(twice).toContain("duplicate key value");
  } finally {
    await query("delete from screen_choices where user_id = $1::uuid and screen = $2", [
      user.id,
      screen,
    ]);
  }
});

test("a request to archive is waiting or answered, and never half of either (0030, D212)", async () => {
  const waiting = await one<{ id: string; kind: string; record_id: string }>(
    "select id, kind, record_id from archive_requests where status = 'waiting' limit 1",
  );
  const manager = await userId("abdulrahman@technopanel.com.sa");
  const faisal = await userId("faisal@technopanel.com.sa");

  // A reason of spaces is no reason. The action trims and refuses empty; this
  // is the same sentence said where nothing can go round it.
  const blank = await refused(
    `insert into archive_requests (kind, record_id, reason, requested_by)
     values ('company', $1::uuid, ' 
	 ', $2::uuid)`,
    [waiting.record_id, faisal],
  );
  expect(blank).toContain("archive_requests_reason_check");

  // Answered by somebody, on no day at all, and still called waiting: three
  // ways of saying one thing, so they cannot be made to disagree.
  const halfAnswered = await refused(
    `insert into archive_requests (kind, record_id, reason, requested_by, decided_by)
     values ('project', $1::uuid, 'no', $2::uuid, $3::uuid)`,
    [waiting.record_id, faisal, manager],
  );
  expect(halfAnswered).toContain("archive_requests_decided_check");

  // Only a refusal carries a refusal's reason — and a refusal without one is
  // the state S53 exists to prevent: a decision that ends somebody's work
  // reaching him with nothing to answer.
  const approvedWithReason = await refused(
    `insert into archive_requests
       (kind, record_id, reason, requested_by, status, decided_by, decided_at, refuse_reason)
     values ('company', $1::uuid, 'no', $2::uuid, 'approved', $3::uuid, now(), 'because')`,
    [waiting.record_id, faisal, manager],
  );
  expect(approvedWithReason).toContain("archive_requests_refusal_check");

  const refusedSilently = await refused(
    `insert into archive_requests
       (kind, record_id, reason, requested_by, status, decided_by, decided_at)
     values ('company', $1::uuid, 'no', $2::uuid, 'refused', $3::uuid, now())`,
    [waiting.record_id, faisal, manager],
  );
  expect(refusedSilently).toContain("archive_requests_refusal_check");

  // A kind that is not one of the three archivable things.
  const strangeKind = await refused(
    `insert into archive_requests (kind, record_id, reason, requested_by)
     values ('quotation', $1::uuid, 'no', $2::uuid)`,
    [waiting.record_id, faisal],
  );
  expect(strangeKind).toContain("archive_requests_kind_check");

  // And two people asking for the same record at once, which would hand the
  // manager the same decision twice.
  const twice = await refused(
    `insert into archive_requests (kind, record_id, reason, requested_by)
     values ($1::text, $2::uuid, 'again', $3::uuid)`,
    [waiting.kind, waiting.record_id, manager],
  );
  expect(twice).toContain("archive_requests_waiting_idx");
});

test("the schema file and the catalogue agree, both ways (D106)", async () => {
  // Asked of pg_constraint/pg_indexes, not the ORM's opinion (rules/migrations.md):
  // a name typed once in schema.ts and never migrated, or dropped by hand and
  // never un-typed, is invisible to every other test in this file, which only
  // ever asks about the names it already knows to ask about.
  const schemaSource = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf-8");

  const checkNames = new Set<string>();
  const indexNames = new Set<string>();
  const namePattern = /(check|index|uniqueIndex)\(\s*"([a-z0-9_]+)"/g;
  for (const match of schemaSource.matchAll(namePattern)) {
    const [, kind, name] = match;
    (kind === "check" ? checkNames : indexNames).add(name);
  }

  const catalogueChecks = await query<{ conname: string }>(
    `select conname from pg_constraint
      where contype = 'c' and connamespace = 'public'::regnamespace`,
  );
  const catalogueIndexes = await query<{ indexname: string }>(
    "select indexname from pg_indexes where schemaname = 'public'",
  );
  const catalogueCheckNames = new Set(catalogueChecks.map((row) => row.conname));
  // The auto-named indexes from `.unique()` columns and primary keys were
  // never typed in schema.ts by name — Postgres named them — so they are not
  // strangers, they are just not this test's business. `_pk` is the third of
  // those and arrived with the first COMPOSITE primary key in this schema
  // (`screen_choices`, 0024): Postgres names a single-column one `<table>_pkey`,
  // and Drizzle names a composite one after its columns.
  const catalogueIndexNames = new Set(
    catalogueIndexes
      .map((row) => row.indexname)
      .filter(
        (name) =>
          !name.endsWith("_pkey") && !name.endsWith("_unique") && !name.endsWith("_pk"),
      ),
  );

  const checksNotInCatalogue = [...checkNames].filter((name) => !catalogueCheckNames.has(name));
  expect(
    checksNotInCatalogue,
    `schema.ts names a check the catalogue does not have: ${checksNotInCatalogue.join(", ")}`,
  ).toEqual([]);

  const indexesNotInCatalogue = [...indexNames].filter((name) => !catalogueIndexNames.has(name));
  expect(
    indexesNotInCatalogue,
    `schema.ts names an index the catalogue does not have: ${indexesNotInCatalogue.join(", ")}`,
  ).toEqual([]);

  const checksNotInSchema = [...catalogueCheckNames].filter((name) => !checkNames.has(name));
  expect(
    checksNotInSchema,
    `the catalogue has a check schema.ts does not name: ${checksNotInSchema.join(", ")}`,
  ).toEqual([]);

  const indexesNotInSchema = [...catalogueIndexNames].filter((name) => !indexNames.has(name));
  expect(
    indexesNotInSchema,
    `the catalogue has an index schema.ts does not name: ${indexesNotInSchema.join(", ")}`,
  ).toEqual([]);
});
