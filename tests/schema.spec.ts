import { test, expect } from "@playwright/test";
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

test("a revision names a quotation that exists", async () => {
  const quotation = await one<{ id: string }>("select id from quotations limit 1");
  const message = await refused(
    "update quotations set revision_of = gen_random_uuid() where id = $1::uuid",
    [quotation.id],
  );
  expect(message).toContain("violates foreign key constraint");
});
