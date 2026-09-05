import { sql, type SQL } from "drizzle-orm";
import { dispatchItems, quotationItems } from "@/db/schema";

/**
 * Square metres moved: the one formula (SPEC D38, D86; rules/data.md).
 *
 * Width × length × the quantity SENT — never the quotation line's own quantity,
 * which is the whole quoted amount — rounded once per line and once more over
 * the sum. It was retyped in six files and a test, every copy correct and none
 * of them checked against another; `scripts/one-figure.mts` fails the lint on
 * any copy outside this file now. The raw pair is for SQL written as text,
 * where the dispatch lines are `di` and the quotation lines `qi`; the Drizzle
 * pair is for a query that names the tables itself; `sqmOf` takes any quantity
 * expression, which is how "what is left to send" (standing.ts) shares the
 * sheet arithmetic without pretending to be the same figure. The specs keep
 * their own copy on purpose: a figure computed two ways is the point of those
 * tests.
 */

/** The sheet, times any quantity expression, rounded once — for SQL written as text with quotation_items `qi`. */
export const sqmOf = (qty: string): string => `round(qi.width * qi.length * ${qty}, 2)`;

/** One dispatched line, in a query that aliases dispatch_items `di` and quotation_items `qi`. */
export const LINE_SQM = sqmOf("di.qty");

/** The sum of such lines, never null. */
export const SUM_SQM = `round(coalesce(sum(${LINE_SQM}), 0), 2)`;

/** One dispatched line, for a Drizzle query joining `dispatchItems` and `quotationItems`. */
export const lineSqm: SQL<string> = sql`round(${quotationItems.width} * ${quotationItems.length} * ${dispatchItems.qty}, 2)`;

/** The sum of such lines, never null. */
export const sumSqm: SQL<string> = sql`round(coalesce(sum(${lineSqm}), 0), 2)`;
