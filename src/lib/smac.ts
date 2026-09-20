import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { violatedUnique } from "@/lib/pg-errors";

/**
 * The SMAC number is the one value the spec itself calls error-prone (S3, D53):
 * typed by a person, the only link to the system that holds the money, unique
 * by index in both chains. Typing one twice used to come back as "something
 * went wrong". This is the named answer for either index firing, written once
 * so the two chains cannot drift about what a clash is called (D88).
 */
export type SmacKind = "quotation" | "dispatch";

const INDEX: Record<SmacKind, string> = {
  quotation: "quotations_smac_number_idx",
  dispatch: "dispatches_smac_number_idx",
};

/** Postgres 23505 on that chain's SMAC index, and nothing else. */
export function isSmacClash(error: unknown, kind: SmacKind): boolean {
  return violatedUnique(error) === INDEX[kind];
}

/**
 * Which record carries the number now — Q-12/2 or D-3 — or null if it was
 * freed between the clash and this question. Asked after the transaction has
 * rolled back, so it is its own short read.
 */
export async function smacHolder(kind: SmacKind, number: string): Promise<string | null> {
  if (kind === "quotation") {
    const result = await db.execute<{ number: number; revision: number }>(
      sql`select number, revision from quotations where smac_number = ${number} limit 1`,
    );
    const row = result.rows[0];
    return row ? quotationLabel(Number(row.number), Number(row.revision)) : null;
  }
  const result = await db.execute<{ number: number }>(
    sql`select number from dispatches where smac_dispatch_number = ${number} limit 1`,
  );
  const row = result.rows[0];
  return row ? dispatchLabel(Number(row.number)) : null;
}

/* -------------------------------------------------------------------------- */
/* Whether the customer is in SMAC at all (SPEC §3, P14)                       */
/* -------------------------------------------------------------------------- */

/**
 * Three answers, and which one a company has.
 *
 * `registered` is the coordinator's: she creates the customer in SMAC, so hers
 * is the fact. `believed` is a rep's, and it is exactly that — he has no SMAC
 * account and no number, and what he ticked is "as far as I know". `unknown` is
 * nobody having said, which is where every company starts and is a real answer:
 * it is what the coordinator's list of work is made of.
 *
 * Hers wins where both have answered, and nothing anywhere asks the two columns
 * separately — that is what stops one screen saying registered and the next one
 * saying a rep thinks so.
 */
export const SMAC_STATES = ["registered", "believed", "unknown"] as const;

/** Derived from the list and never written beside it (rules/words.md). */
export type SmacState = (typeof SMAC_STATES)[number];

export function smacState(row: {
  smacRegisteredAt: Date | null;
  smacBelievedAt: Date | null;
}): SmacState {
  if (row.smacRegisteredAt) return "registered";
  return row.smacBelievedAt ? "believed" : "unknown";
}
