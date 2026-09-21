import { sql, type SQL } from "drizzle-orm";
import { dispatchItems, dispatchStatusEnum } from "@/db/schema";
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

/**
 * The dispatch statuses that have spent a quotation line's quantity (D12): a
 * load the coordinator has in front of her, and one she approved. A draft has
 * not asked for anything yet and a rejected or withdrawn load gave it back.
 *
 * "How much of this paper has already gone out" is asked in five queries — the
 * rep's own dispatch form, the coordinator's check, the quotation's standing —
 * and was five copies of one literal until P14.5 found the constant meant for
 * them had no reader. A sixth status that spends (a partly-collected load, say)
 * would have been added to whichever copy the author found first, and the
 * paper's remaining figure would then differ by screen. It lives here, with the
 * other text written over dispatch lines, because this file imports nothing
 * that imports it back — dispatches.ts and standing.ts both read it.
 * `scripts/one-figure.mts` refuses the literal anywhere else.
 */
export const COMMITTING = ["submitted", "approved"] as const satisfies readonly (typeof dispatchStatusEnum.enumValues)[number][];

/** The same, as a SQL list for text or `sql.raw`: `('submitted', 'approved')`. */
export const COMMITTING_IN = `(${COMMITTING.map((status) => `'${status}'`).join(", ")})`;

/**
 * How many sheets of one quotation line are spoken for (D12) — written once.
 *
 * `line` is the alias of a `quotation_items` row in the caller's own query. What
 * counts against it is every load, waiting or approved, on any line that BEGAN
 * as this one: a revision is a new paper with new lines, and until the Stage 3
 * audit the count was keyed on the line's own id, so revising a paper that had
 * already sent sixty of its hundred sheets gave the revision a hundred to send
 * again. `quotation_items.origin_item_id` says where a carried line began, and
 * a line that began here is its own beginning.
 *
 * It was six copies — the drawer's figure, the dispatch form's check under its
 * lock, the picker, the load's own "elsewhere", the project's stage and the
 * rep's list — which is how one of them came to ask only for approved loads on
 * purpose and nobody could tell it from a slip. `approvedOnly` is that purpose,
 * said out loud. `scripts/one-figure.mts` refuses a seventh.
 *
 * Text, with the alias passed in from a closed set, because half its readers
 * are SQL written as text; `also` is any further condition on the load `d`
 * (leaving one dispatch out, say), written by the caller with its own binds.
 */
export type LineAlias = "qi" | "quotation_items";

export function committedFrom(line: LineAlias, approvedOnly = false): string {
  return `select coalesce(sum(di.qty), 0)::int
            from dispatch_items di
            join dispatches d on d.id = di.dispatch_id
            join quotation_items began on began.id = di.quotation_item_id
           where coalesce(began.origin_item_id, began.id) = coalesce(${line}.origin_item_id, ${line}.id)
             and d.status in ${approvedOnly ? "('approved')" : COMMITTING_IN}`;
}

/** The same as a closed expression, for a query with nothing to add to it. */
export const committedQty = (line: LineAlias, approvedOnly = false): string =>
  `(${committedFrom(line, approvedOnly)})`;

/** And with one more condition on the load, bound by the caller. */
export function committedQtySql(line: LineAlias, also?: SQL): SQL<number> {
  return also
    ? sql<number>`(${sql.raw(committedFrom(line))} and ${also})`
    : sql<number>`${sql.raw(committedQty(line))}`;
}

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
 * **A load that counts for nobody is still a row** — with no `user_id` and the
 * whole of its metres (Stage 3 audit). P14 made "no credit rows" a legal state
 * (D207: nobody on the job earns this month), and this was an inner join, so
 * such a load fell out of every figure built here — the six months, the pie,
 * the builder, the list behind each — while the company's month card, summed
 * over dispatches, kept it. The manager read 4,200 on the card and 3,800 on
 * that month's bar. Asked of the whole company these rows now add to exactly
 * what `companyAchievedSqm` says; asked of a person they are not his, because
 * no `user_id` equals his.
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
         case when c.user_id is null then d.sqm
              else ${shareOf("d.sqm", "c.parts", "c.part")} end as sqm
    from (select dd.id, dd.approved_at, dd.company_id, ${SUM_SQM} as sqm
            from dispatches dd
            join dispatch_items di on di.dispatch_id = dd.id
           where dd.status = 'approved'
           group by dd.id) d
    left join (select dispatch_id, user_id, ${creditedParts("dispatch_id")}
                 from dispatch_credits) c
      on c.dispatch_id = d.id`;
