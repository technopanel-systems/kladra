/**
 * Whose these metres are, and how a shared job's are divided (SPEC §3, D148).
 *
 * Two reps can work one project since D147, so a quotation and a dispatch each
 * say who they count for: a single named rep, or split between everybody on the
 * project at the moment of the raise. The choice is stored as rows naming the
 * people (`quotation_credits`, `dispatch_credits`); what each person's share
 * comes to is computed HERE, from the record's own lines, every time it is read.
 *
 * That split is the reason this is one file. A figure computed in two places
 * drifts (rules/data.md), and this one has a rounding rule that is easy to
 * write differently by accident: each share is the total divided by the number
 * of people and rounded DOWN to two decimals, and the last of them takes what
 * is left over, so the shares always add back to the record's own m² exactly.
 * Round each share to nearest instead and three people on 100 m² are credited
 * 33.33 twice and 33.33 again, and the manager's table is a hundredth short of
 * the dispatch it came from — the kind of gap nobody reports and everybody
 * stops trusting. `npm run lint` refuses a second copy of either form, the way
 * it already does for the square-metre formula (D86).
 *
 * "The last of them" is by user id, which is arbitrary and fixed: what is at
 * stake is one hundredth of a square metre, and the only property that matters
 * is that every reader picks the same person every time.
 *
 * Pure: no database, no `server-only`. `tests/credit.spec.ts` asks it directly
 * with the awkward totals, and the SQL twin is checked against it on real rows.
 */

/**
 * The answer that is not a person: divide between everybody on the job.
 *
 * A word rather than an empty value, because "nobody named" and "everybody"
 * are different answers and a form that says the second with the first is a
 * form whose default is a decision nobody made. It lives here, beside the
 * division it asks for, so the field, the action and the seed all spell it the
 * same way.
 */
export const CREDIT_SPLIT = "split";

/** One person's share of one record. `sqm` is a decimal string, like the column. */
export type CreditShare = { userId: string; sqm: string };

/** The order the leftover hundredth is decided by. Fixed, and nothing more. */
export function creditOrder(userIds: readonly string[]): string[] {
  return [...new Set(userIds)].sort();
}

/**
 * Divide a record's m² between the people credited on it.
 *
 * Hundredths throughout, so nothing here is a floating-point sum: the totals
 * arrive as `numeric(12,2)` strings and leave as the same, and the parts add
 * back to the whole by construction rather than by luck.
 */
export function creditShares(total: string | number, userIds: readonly string[]): CreditShare[] {
  const people = creditOrder(userIds);
  if (people.length === 0) return [];
  const hundredths = Math.round(Number(total) * 100);
  const each = Math.floor(hundredths / people.length);
  const leftover = hundredths - each * people.length;
  return people.map((userId, i) => ({
    userId,
    sqm: ((each + (i === people.length - 1 ? leftover : 0)) / 100).toFixed(2),
  }));
}

/**
 * The same division in SQL, for the figures that are summed over a month.
 *
 * `total` is the record's own m², `parts` how many people are credited on it
 * and `part` this person's place in the fixed order, counting from one — which
 * a query gets from `count(*) over` and `row_number() over (… order by
 * user_id)` beside them. Written as text because every caller is raw SQL and
 * because the shape is one expression; `creditedParts` is the pair of window
 * functions that feeds it, so no query writes the ordering by hand either.
 */
const PARTS =
  "count(*) over (partition by %s) as parts, row_number() over (partition by %s order by user_id) as part";

export const creditedParts = (partition: string): string => PARTS.replaceAll("%s", partition);

export const shareOf = (total: string, parts: string, part: string): string =>
  `(floor(${total} * 100 / ${parts}) / 100` +
  ` + case when ${part} = ${parts}` +
  ` then (round(${total} * 100) - floor(${total} * 100 / ${parts}) * ${parts}) / 100` +
  ` else 0 end)`;
