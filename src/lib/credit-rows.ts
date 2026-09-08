import "server-only";

import { asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { dispatchCredits, quotationCredits, users } from "@/db/schema";
import { CREDIT_SPLIT, creditOrder, creditShares } from "@/lib/credit";
import { personName } from "@/lib/people";

/**
 * The rows that say who a quotation or a dispatch counts for (D148).
 *
 * `src/lib/credit.ts` is the arithmetic and is pure; this is the database side
 * of the same rule, kept apart so a form can do the sum without dragging the
 * schema into the browser bundle (rules/data.md).
 *
 * Two things live here and nowhere else: who the sharers of a job ARE at the
 * moment of a raise, and the insert that freezes them. Both are one-liners and
 * both were about to be written four times — in the quotation request, in the
 * revision that follows it, in the dispatch request and in the seed — which is
 * how the second definition of a figure gets in.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Everybody a record on this job may count for: the job's own rep, whoever has
 * been put on it, and whoever is raising the record.
 *
 * The owner is IN the list, unlike `projectSharers`, which answers the
 * different question a screen asks — "who else" — and leaves him out because
 * he is named beside it already. So is the raiser, even in the one case where
 * he is neither: a rep may raise on his own customer's job that another rep
 * owns, and a man who may raise a dispatch may certainly earn its metres.
 *
 * ONE list, and that is the point of it. The picker offers exactly these
 * people, "split" divides between exactly these people, and the action refuses
 * exactly the names that are not among them — so a screen cannot offer a choice
 * the write behind it would reject (DESIGN §5).
 */
export async function creditPool(projectId: string | null, actorId: string): Promise<string[]> {
  if (!projectId) return [actorId];
  return creditOrder([...(await peopleOnProject(projectId)), actorId]);
}

/**
 * Turn the form's answer into the people it names, or null if it names anybody
 * who is not on the job.
 *
 * Re-read inside the transaction that writes the record, never trusted from the
 * form: the list the dialog was drawn with is a minute old, and a share is a
 * permission that can be taken away while a dialog sits open.
 */
export async function resolveCredit(
  projectId: string | null,
  actorId: string,
  answer: string | undefined,
): Promise<string[] | null> {
  const pool = await creditPool(projectId, actorId);
  if (!answer || answer === actorId) return [actorId];
  if (answer === CREDIT_SPLIT) return pool;
  return pool.includes(answer) ? [answer] : null;
}

/**
 * Everybody on this job, without the raiser. What "split" divides between.
 *
 * Written out rather than built with the query builder: a UNION of two selects
 * as a subquery renders with the underlying column names, so asking it for `u`
 * raised `column "u" does not exist` — and the one caller that reads it treats
 * a failure as "nothing to ask", so the question simply stopped being asked and
 * every dispatch went to whoever raised it. A read whose failure is invisible
 * needs its query to be plain.
 */
export async function peopleOnProject(projectId: string): Promise<string[]> {
  const rows = await db.execute<{ user_id: string }>(sql`
    select rep_id as user_id from projects where id = ${projectId}::uuid
    union
    select user_id from project_shares where project_id = ${projectId}::uuid
  `);
  return creditOrder(rows.rows.map((row) => row.user_id));
}

/**
 * The same people, named in the reader's script and in their own order (D68).
 *
 * Sorted by name for a picker; the ids keep their own fixed order elsewhere,
 * because that one decides where a leftover hundredth lands and must never
 * depend on what language somebody is reading in.
 *
 * `inArray`, never an array interpolated into a `sql` template: Drizzle binds a
 * JS array as ONE parameter whose text is the members joined by commas, and the
 * query then dies on a malformed array literal — on the branch that only
 * happens when the list is not empty (rules/data.md).
 */
export async function creditPoolNamed(
  projectId: string | null,
  actorId: string,
): Promise<{ value: string; label: string }[]> {
  const ids = await creditPool(projectId, actorId);
  if (ids.length === 0) return [];
  const locale = await getLocale();
  return (
    await db
      .select({ value: users.id, label: personName(locale) })
      .from(users)
      .where(inArray(users.id, ids))
      .orderBy(asc(personName(locale)))
  ).map((row) => ({ value: row.value, label: row.label }));
}

/**
 * Say who this quotation counts for, inside the transaction that writes it.
 *
 * Written as "clear, then set" rather than as an insert, because the same call
 * settles a raise and a correction. A record still waiting has earned nobody
 * anything — no metre moves until an approval — so for exactly as long as a rep
 * may fix the lines he may fix who they are for, and the two are one save.
 */
export async function creditQuotation(tx: Tx, quotationId: string, userIds: readonly string[]) {
  await tx.delete(quotationCredits).where(eq(quotationCredits.quotationId, quotationId));
  await tx
    .insert(quotationCredits)
    .values(creditOrder(userIds).map((userId) => ({ quotationId, userId })));
}

/** The same for a dispatch, and for the same reason. */
export async function creditDispatch(tx: Tx, dispatchId: string, userIds: readonly string[]) {
  await tx.delete(dispatchCredits).where(eq(dispatchCredits.dispatchId, dispatchId));
  await tx
    .insert(dispatchCredits)
    .values(creditOrder(userIds).map((userId) => ({ dispatchId, userId })));
}

/** One name on a record, and what it takes of the record's metres. */
export type CreditLine = { userId: string; name: string; sqm: string };

/**
 * Who a dispatch counts for, and how much each of them gets (D148).
 *
 * The division is `creditShares`, the same pure function the SQL twin mirrors,
 * fed the record's own m² — so what a drawer prints and what a month totals
 * cannot disagree by a hundredth.
 */
export async function creditOnDispatch(dispatchId: string, sqm: string): Promise<CreditLine[]> {
  const locale = await getLocale();
  const rows = await db
    .select({ userId: dispatchCredits.userId, name: personName(locale) })
    .from(dispatchCredits)
    .innerJoin(users, eq(users.id, dispatchCredits.userId))
    .where(eq(dispatchCredits.dispatchId, dispatchId));
  const named = new Map(rows.map((row) => [row.userId, row.name]));
  return creditShares(sqm, [...named.keys()])
    .map((share) => ({
      userId: share.userId,
      name: named.get(share.userId) ?? "",
      sqm: share.sqm,
    }))
    // Divided in id order, because that is what decides the leftover hundredth
    // and must not depend on anybody's language; READ in name order, because
    // that is what a person scanning two screens expects. The row's own list
    // (`creditNames` in src/lib/dispatches.ts) is sorted the same way.
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who a quotation counts for. No division: a quotation's m² is what was
 * offered, not what moved, and dividing an offer would put a figure on a screen
 * that nothing is ever measured against.
 */
export async function creditOnQuotation(quotationId: string): Promise<Omit<CreditLine, "sqm">[]> {
  const locale = await getLocale();
  return db
    .select({ userId: quotationCredits.userId, name: personName(locale) })
    .from(quotationCredits)
    .innerJoin(users, eq(users.id, quotationCredits.userId))
    .where(eq(quotationCredits.quotationId, quotationId))
    .orderBy(asc(personName(locale)));
}

/**
 * "Is this one his?" — for a list that has already aliased the record.
 *
 * A count is not divisible the way a metre is, so credit answers a count by
 * membership: a quotation two reps share is one quotation in each of their
 * funnels and one in the company's total, which is the honest reading of a job
 * they both worked. Only the m² is divided (D148).
 *
 * A null id is the whole company and the clause disappears — written with the
 * casts on both sides because a bare JS null reaches Postgres with no type at
 * all and the statement dies with "could not determine data type"
 * (rules/data.md).
 */
export const creditedQuotation = (alias: string, repId: string | null): SQL =>
  sql`(${repId}::uuid is null or exists (
        select 1 from quotation_credits qc
         where qc.quotation_id = ${sql.raw(alias)}.id and qc.user_id = ${repId}::uuid))`;

export const creditedDispatch = (alias: string, repId: string | null): SQL =>
  sql`(${repId}::uuid is null or exists (
        select 1 from dispatch_credits dc
         where dc.dispatch_id = ${sql.raw(alias)}.id and dc.user_id = ${repId}::uuid))`;
