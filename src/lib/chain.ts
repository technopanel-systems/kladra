/**
 * Where quotations die (SPEC D62, WORKFLOW §4 item 5).
 *
 * One of the five questions Jerom named, and the app could not answer any part
 * of it. The quotation screen lists what each one IS right now; nothing anywhere
 * said what happens to them as a population — how many of the ones raised in a
 * quarter ever reached a customer, how many the customer answered, and how many
 * simply stopped.
 *
 * The four things a funnel has to show are volume, conversion, time-in-stage and
 * drop-off, and only the last two say anything a list does not. So this is not a
 * picture of the pipeline as it stands: it follows one COHORT — every quotation
 * raised inside a window — forward through what actually became of it. A funnel
 * of current statuses tells you what the board already tells you.
 *
 * Every quotation is counted once, at the furthest point it reached. A revision
 * is its own row (S32), because "raised twice and issued twice" is two trips
 * through the chain and pretending otherwise hides the rework this exists to
 * find.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addDays, todayRiyadh, type Day } from "@/lib/dates";

/** The window the question is asked over. A quarter — long enough to have shape. */
export const CHAIN_WINDOW_DAYS = 90;

/**
 * Where a quotation got to. Ordered as the chain runs, so a screen can render
 * them in order without knowing anything about them.
 */
export const CHAIN_STAGES = [
  /** Raised and still on the coordinator's desk. */
  "waiting",
  /** She sent it back and the rep has not asked again. */
  "returned",
  /** The rep took his own request back (D32). */
  "withdrawn",
  /** Issued, and the customer has not answered. */
  "withCustomer",
  /** The customer said yes. */
  "accepted",
  /** The customer said no. */
  "rejected",
] as const;

export type ChainStage = (typeof CHAIN_STAGES)[number];

export type ChainCohort = {
  /** The first day of the window, and how many were raised in it. */
  from: Day;
  raised: number;
  /** How many of them stopped at each point. Sums to `raised`. */
  ended: Record<ChainStage, number>;
  /**
   * Of the ones that reached a customer, how many he answered — the one
   * conversion in the chain that is about the market rather than about us.
   */
  answered: number;
  reached: number;
};

/**
 * The cohort raised in the last `CHAIN_WINDOW_DAYS`, and where each of them
 * ended up.
 *
 * `scope` narrows it to one rep's floor. It is a fragment rather than a uuid so
 * the company-wide read and a rep's own go through one statement, and neither
 * can drift from the other (rules/data.md).
 */
export async function chainCohort(
  repId: string | null,
  today: Day = todayRiyadh(),
): Promise<ChainCohort> {
  const from = addDays(today, -CHAIN_WINDOW_DAYS);

  const result = await db.execute<{
    stage: ChainStage;
    n: number;
  }>(sql`
    select case q.status
             when 'requested' then 'waiting'
             when 'returned' then 'returned'
             when 'cancelled' then 'withdrawn'
             when 'issued' then 'withCustomer'
             when 'accepted' then 'accepted'
             when 'rejected' then 'rejected'
           end as stage,
           count(*)::int as n
      from quotations q
      join companies c on c.id = q.company_id
     where (q.created_at at time zone 'Asia/Riyadh')::date >= ${from}::date
       and c.archived_at is null
       and (${repId}::uuid is null or c.rep_id = ${repId}::uuid)
     group by 1
  `);

  const ended = Object.fromEntries(CHAIN_STAGES.map((stage) => [stage, 0])) as Record<
    ChainStage,
    number
  >;
  for (const row of result.rows) {
    if (row.stage) ended[row.stage] = Number(row.n);
  }

  const raised = CHAIN_STAGES.reduce((sum, stage) => sum + ended[stage], 0);
  // Reaching a customer is being issued at all — with him, accepted or
  // rejected. A superseded revision is not a separate case: the row that was
  // superseded still went out, and the one that replaced it is its own trip.
  const reached = ended.withCustomer + ended.accepted + ended.rejected;

  return {
    from,
    raised,
    ended,
    reached,
    answered: ended.accepted + ended.rejected,
  };
}

/** The share of a cohort that ended at one stage, 0–100, rounded. */
export function shareOf(cohort: ChainCohort, stage: ChainStage): number {
  return cohort.raised === 0 ? 0 : Math.round((cohort.ended[stage] / cohort.raised) * 100);
}
