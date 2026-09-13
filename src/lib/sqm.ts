import { sql, type SQL } from "drizzle-orm";
import { dispatchItems } from "@/db/schema";
import { creditedParts, shareOf } from "@/lib/credit";

/**
 * Square metres moved: the one formula (SPEC D38, D86; rules/data.md).
 *
 * Width × length × the quantity SENT, rounded once per line and once more over
 * the sum. Since P13 a dispatch line carries its own sheet — the rep edits the
 * load — so its m² is the line's own generated column, `dispatch_items.sqm`, the
 * same expression the quotation's lines generate, and nothing here multiplies a
 * dispatched quantity by a quotation's sheet any more. `sqmOf` is the one place
 * that still does, for "what is left to send" on a quotation line
 * (standing.ts), which is a quotation's figure and says so. The raw pair is for
 * SQL written as text with dispatch lines aliased `di`; the Drizzle pair is for
 * a query that names the table itself. `scripts/one-figure.mts` fails the lint on
 * any copy outside this file, and the specs keep their own copy on purpose: a
 * figure computed two ways is the point of those tests.
 */

/** The sheet, times any quantity expression, rounded once — for SQL written as text with quotation_items `qi`. */
export const sqmOf = (qty: string): string => `round(qi.width * qi.length * ${qty}, 2)`;

/** One dispatched line, in a query that aliases dispatch_items `di`. */
export const LINE_SQM = "di.sqm";

/** The sum of such lines, never null. */
export const SUM_SQM = `round(coalesce(sum(${LINE_SQM}), 0), 2)`;

/** One dispatched line, for a Drizzle query that reads `dispatchItems`. */
export const lineSqm: SQL<string> = sql<string>`${dispatchItems.sqm}`;

/** The sum of such lines, never null. */
export const sumSqm: SQL<string> = sql`round(coalesce(sum(${lineSqm}), 0), 2)`;

/**
 * Every approved dispatch's m², divided between the people credited on it —
 * one row per (dispatch, person), and the ONE definition of an achieved metre
 * since D148 replaced "the rep who raised it" (D86).
 *
 * Both halves of that replacement matter. A record with one name on it gives
 * exactly the figure the old rule gave, which is every record in the app until
 * a rep chooses otherwise; and a record with two gives two rows that add back
 * to it exactly, so the company's total is the same figure whether it is summed
 * over dispatches or over people. `tests/credit.spec.ts` asserts that both ways
 * round on the seeded month, because it is the only property that keeps the
 * manager's table and the reps' cards from disagreeing.
 *
 * Unfiltered on purpose. A caller wraps it and filters the month or the person
 * outside, so the window and the person are bound parameters in the caller's
 * own `sql` template rather than text spliced into this one; the whole history
 * of a fourteen-person company is a few thousand rows.
 */
export const CREDITED_METRES = `
  select c.user_id,
         d.id as dispatch_id,
         d.approved_at,
         d.company_id,
         ${shareOf("d.sqm", "c.parts", "c.part")} as sqm
    from (select dd.id, dd.approved_at, dd.company_id, ${SUM_SQM} as sqm
            from dispatches dd
            join dispatch_items di on di.dispatch_id = dd.id
           where dd.status = 'approved'
           group by dd.id) d
    join (select dispatch_id, user_id, ${creditedParts("dispatch_id")}
            from dispatch_credits) c
      on c.dispatch_id = d.id`;
