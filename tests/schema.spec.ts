import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { AUDIT_RECORD_TYPES, NOTIFICATION_KINDS } from "@/db/schema";
import { one, query } from "./helpers/db";

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

test("one line of a quotation goes on a dispatch once", async () => {
  const item = await one<{ dispatch_id: string; quotation_item_id: string }>(
    "select dispatch_id, quotation_item_id from dispatch_items limit 1",
  );

  // The same line again on the same dispatch: the m² it moved would count twice.
  const message = await refused(
    `insert into dispatch_items (dispatch_id, quotation_item_id, qty)
     values ($1::uuid, $2::uuid, 1)`,
    [item.dispatch_id, item.quotation_item_id],
  );
  expect(message).toContain("dispatch_items_line_idx");
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

test("one person writes one report per day, and never an empty one", async () => {
  const report = await one<{ user_id: string; day: string }>(
    "select user_id, to_char(day, 'YYYY-MM-DD') as day from daily_reports limit 1",
  );

  // A report of spaces is not a report. The action trims and Zod refuses it, and
  // so does the column, because the seed and a future import are ways in too.
  for (const note of ["", "   ", "\n\t "]) {
    const message = await refused(
      "insert into daily_reports (user_id, day, note) values ($1::uuid, $2::date + 400, $3::text)",
      [report.user_id, report.day, note],
    );
    expect(message, `an empty note was accepted: ${JSON.stringify(note)}`).toContain(
      "violates check constraint",
    );
  }

  // And a second report for the same person on the same day is the same report
  // rewritten — which is what the action's `on conflict do update` says, and
  // what the index makes true whoever is writing (D55).
  const twice = await refused(
    "insert into daily_reports (user_id, day, note) values ($1::uuid, $2::date, 'again')",
    [report.user_id, report.day],
  );
  expect(twice).toContain("duplicate key value violates unique constraint");
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

  const message = await refused(
    `insert into notifications (user_id, kind, params, link, subject_type, subject_id)
     values ($1::uuid, $2, $3::jsonb, $4, 'project', $5::uuid)`,
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
  // strangers, they are just not this test's business.
  const catalogueIndexNames = new Set(
    catalogueIndexes
      .map((row) => row.indexname)
      .filter((name) => !name.endsWith("_pkey") && !name.endsWith("_unique")),
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
