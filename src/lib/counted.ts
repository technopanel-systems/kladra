/**
 * What a windowed figure counts, written once for the figure and for the list
 * its door opens (SPEC §3 P13, D117, rules/data.md).
 *
 * §3 asks that pressing a slice or a bar opens the list behind it. The trap in
 * that sentence is the second WHERE: a pie of approved metres by segment counted
 * one set of dispatches, and a list filtered "by hand" to match it would count a
 * set that agrees today and drifts the first time either is touched — the
 * pressed slice says six and the list shows five. So every predicate a figure
 * on the metrics tab or in the builder is read by lives here as a fragment, and
 * the list screens ask the same fragment of their own rows.
 *
 * Fragments only: no database and no `server-only`, because `src/lib/months.ts`
 * reads one and is itself read by a spec that runs outside Next (live.ts has the
 * reason). Every table is named by an alias the caller passes, and every bound
 * value carries its cast at the site (rules/data.md: an untyped parameter).
 */
import { sql, type SQL } from "drizzle-orm";
import type { Day } from "@/lib/dates";
import { CREDITED_METRES } from "@/lib/sqm";

/**
 * A window of Riyadh days, both ends included. `to` null is "up to today" —
 * which, for events that cannot happen tomorrow, is no upper bound at all.
 */
export type Window = { from: Day; to: Day | null };

/** A Riyadh day of an instant column, in the shape the hooks allow (H6/H7). */
function riyadh(column: string): SQL {
  return sql.raw(`(${column} at time zone 'Asia/Riyadh')::date`);
}

/** `day` inside the window, for a column that is already a Riyadh `date`. */
function inWindow(day: SQL, window: Window): SQL {
  return sql`(${day} >= ${window.from}::date
    and (${window.to}::date is null or ${day} <= ${window.to}::date))`;
}

/**
 * Approved metres in a window, for whoever they were credited to (S41, D148):
 * a row of `CREDITED_METRES` aliased `alias`. The metres by segment, the six
 * months, the builder's two dispatch measures and the dispatches list behind
 * every one of their doors.
 */
export function approvedWhere(alias: string, window: Window, personId: string | null): SQL {
  return sql`(${inWindow(riyadh(`${alias}.approved_at`), window)}
    and (${personId}::uuid is null or ${sql.raw(alias)}.user_id = ${personId}::uuid))`;
}

/**
 * The dispatches a list shows for that figure: the ones with a credited row in
 * the window, for the list's own `dispatches` table. The same rows, read through
 * the same definition of an achieved metre rather than past it — a load that
 * counts for nobody (D207) is in the company's figure and so in the company's
 * list, and in no person's figure and so in no person's list.
 */
export function approvedDispatches(window: Window, personId: string | null): SQL {
  return sql`dispatches.id in (
    select credited.dispatch_id
      from (${sql.raw(CREDITED_METRES)}) credited
     where ${approvedWhere("credited", window, personId)})`;
}

/**
 * Created in the window. For a quotation that is being raised — the cohort the
 * chain card follows (D62, D154), whose credit is composed beside this in
 * `cohortWhere` (src/lib/chain.ts); for a lead, being filed.
 */
export function createdIn(alias: string, window: Window): SQL {
  return inWindow(riyadh(`${alias}.created_at`), window);
}

/**
 * A lead passed in the window by a person (SPEC §3 P12-7, P13): a company that
 * somebody found and gave away, still on the floor, filed on a day inside it.
 * For `companies` unaliased, because the stage a lead reached (`LEAD_STAGE` in
 * src/lib/leads.ts) is written against that name.
 *
 * "Is a lead" is `IS_A_LEAD` in src/lib/leads.ts, which that file keeps to
 * itself; the two clauses are written here as it writes them.
 */
export function leadPassedWhere(window: Window, personId: string | null): SQL {
  return sql`(companies.lead_from_id is not null
    and companies.archived_at is null
    and ${createdIn("companies", window)}
    and (${personId}::uuid is null or companies.lead_from_id = ${personId}::uuid))`;
}

/** A quotation that has had a dispatch raised against it (the ratios card, D152). */
export function dispatchedQuotation(alias: string): SQL {
  return sql.raw(`exists (select 1 from dispatches dd where dd.quotation_id = ${alias}.id)`);
}

/**
 * A report written in the window by a person, not taken back (S4, D70): the
 * Reports screen's calendar counts and the builder's measure are this one clause.
 * `happened_on` is a Riyadh day already, typed by the writer.
 */
export function writtenWhere(alias: string, window: Window, personId: string | null): SQL {
  return sql`(${sql.raw(alias)}.archived_at is null
    and ${inWindow(sql.raw(`${alias}.happened_on`), window)}
    and (${personId}::uuid is null or ${sql.raw(alias)}.user_id = ${personId}::uuid))`;
}

/**
 * Which city a company is in, as one key: the picked city's id, or the typed
 * name folded for a customer abroad (D7), or `-` for none. The builder groups
 * by it and a list narrows by it, so two spellings of one Dubai are one row.
 */
export function cityKey(alias: string): SQL<string> {
  return sql.raw(
    `coalesce(${alias}.city_id::text, 't:' || lower(nullif(btrim(${alias}.city_text), '')), '-')`,
  ) as SQL<string>;
}

/** The three things about a customer a figure can be broken down by. */
export type CompanyNarrowing = { segment: number[]; source: number[]; city: string[] };

/**
 * A company inside a breakdown's row — its segment (D2), where it came from (D1)
 * and its city. Each list is one bound parameter per member with its own cast
 * (rules/data.md: an array interpolated whole is one malformed parameter). An
 * empty list narrows nothing.
 */
export function companyWhere(alias: string, narrowing: CompanyNarrowing): SQL {
  const clauses: SQL[] = [];
  const ints = (values: number[]) => sql.join(values.map((v) => sql`${v}::int`), sql`, `);
  if (narrowing.segment.length > 0) {
    clauses.push(sql`${sql.raw(alias)}.category_id in (${ints(narrowing.segment)})`);
  }
  if (narrowing.source.length > 0) {
    clauses.push(sql`${sql.raw(alias)}.lead_source_id in (${ints(narrowing.source)})`);
  }
  if (narrowing.city.length > 0) {
    const keys = sql.join(narrowing.city.map((v) => sql`${v}::text`), sql`, `);
    clauses.push(sql`${cityKey(alias)} in (${keys})`);
  }
  return clauses.length === 0 ? sql`true` : sql.join(clauses, sql` and `);
}
