import { eq, sql } from "drizzle-orm";
import type { db } from "@/db";
import { dispatches, quotations } from "@/db/schema";
import type { DispatchStatus } from "@/lib/dispatches";
import type { QuotationStatus } from "@/lib/quotations";

/**
 * A write holds its row before it decides (SPEC D85, DESIGN §5).
 *
 * Every transition in the quotation and dispatch chain used to check the state
 * it expected BEFORE its transaction and then update by id alone — which is
 * two people each reading "waiting", each writing an answer, and the second
 * one silently overwriting the first. The quantity check on a dispatch was the
 * same shape one step out: a plain SELECT under READ COMMITTED, so two reps
 * pressing Save in the same second could both spend the last panel, while the
 * comment above it said the transaction made that impossible.
 *
 * `SELECT … FOR UPDATE` is the whole fix: the row is held until the transaction
 * ends, a second transaction on the same row waits, and when it reads the state
 * it reads the one the first transaction wrote. The check at the door stays;
 * the door is locked while it runs.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Holds the quotation row for the rest of the transaction; its status now, or null. */
export async function holdQuotation(tx: Tx, id: string): Promise<QuotationStatus | null> {
  const [row] = await tx
    .select({ status: quotations.status })
    .from(quotations)
    .where(eq(quotations.id, id))
    .for("update");
  return row?.status ?? null;
}

/** Holds the dispatch row for the rest of the transaction; its status now, or null. */
export async function holdDispatch(tx: Tx, id: string): Promise<DispatchStatus | null> {
  const [row] = await tx
    .select({ status: dispatches.status })
    .from(dispatches)
    .where(eq(dispatches.id, id))
    .for("update");
  return row?.status ?? null;
}

/**
 * Whether no later revision of this quotation's number exists (S34, D36).
 * Asked AFTER the hold, because a revision holds the same row while it is
 * raised: whichever of the two came second sees the first.
 *
 * Raw SQL with both tables named outright, for the reason rules/data.md gives:
 * a Drizzle column inside a correlated subquery loses its table qualifier when
 * the outer query joins nothing, and `later.number = "number"` compares the
 * inner row with itself — always false, so "not exists" was always true and the
 * guard never refused anything. tests/two-hands.spec.ts found it on its first run.
 */
export async function isLiveRevision(tx: Tx, quotationId: string): Promise<boolean> {
  const result = await tx.execute<{ live: boolean }>(sql`
    select not exists (
             select 1 from quotations later
              where later.number = quotations.number
                and later.revision > quotations.revision
           ) as live
      from quotations
     where quotations.id = ${quotationId}::uuid
  `);
  return result.rows[0]?.live === true;
}
