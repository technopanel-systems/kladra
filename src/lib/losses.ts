/**
 * Why we lose (Phase 11J, D140).
 *
 * The manager's screen could already answer what became of a quarter's
 * quotations (`@/lib/chain`, D62) — how many stopped on a desk, how many
 * reached a customer, how many he answered. What it could not answer is the
 * question underneath it: when we lose, what do we lose to.
 *
 * The answer has been in the database since P3 and was never read as a
 * population. Every lost project carries a reason, because "Mark lost" refuses
 * a save without one (S20): one of nine codes, or the rep's own line for
 * "Other". Nine rows over a quarter is the difference between "we are losing"
 * and "we are losing on lead time, and it is the third quarter running".
 *
 * The same window as every other card on the tab, and not because this file
 * says so: the window is chosen once above them all and passed in (D154). Two
 * cards on one screen asking about two different quarters is the defect
 * rules/words.md names — a reader cannot hold two windows, and neither can the
 * person who adds a third card.
 *
 * Square metres lead and the count supports, because that is how this business
 * measures everything (DESIGN §6). Five small jobs lost to colour and one
 * five-thousand-metre tower lost on price are not the same quarter, and a card
 * counting projects says they are.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { type Day } from "@/lib/dates";
import { LOSS_REASON_CODES, type LossReasonCode } from "@/lib/loss-reason";

/** One reason, and what it cost in the window. */
export type LossRow = {
  reason: LossReasonCode;
  projects: number;
  /** numeric(12,2) as text, all the way to the screen. */
  sqm: string;
  /** Share of the window's lost metres, 0-100, rounded for a bar's width. */
  share: number;
};

export type LossCohort = {
  /** The first day of the window. */
  from: Day;
  /** How many projects were given up in it, and what they were expected to be. */
  projects: number;
  sqm: string;
  /** Only the reasons that happened, largest first. */
  rows: LossRow[];
};

export async function lossCohort(repId: string | null, from: Day): Promise<LossCohort> {

  /*
   * The nine codes as bound parameters, built FROM the constant rather than
   * written out again in SQL — the list is the source (rules/words.md), and a
   * tenth reason must not need a second edit here. Anything else stored in the
   * column is somebody's own line for "Other", which is what `other` counts;
   * the line itself stays readable on the project it belongs to.
   */
  const codes = sql.join(
    LOSS_REASON_CODES.map((code) => sql`${code}`),
    sql`, `,
  );

  const result = await db.execute<{ reason: LossReasonCode; projects: number; sqm: string }>(sql`
    select case when p.lost_reason in (${codes}) then p.lost_reason else 'other' end as reason,
           count(*)::int as projects,
           coalesce(sum(p.expected_sqm), 0)::text as sqm
      from projects p
      join companies c on c.id = p.company_id
     where p.lost_at is not null
       and p.archived_at is null
       and c.archived_at is null
       and (p.lost_at at time zone 'Asia/Riyadh')::date >= ${from}::date
       -- Whose job was given up, not whose customer it sits under: a project
       -- has had a rep of its own since P12 (D147), and on a shared company
       -- the two are different people.
       and (${repId}::uuid is null or p.rep_id = ${repId}::uuid)
     group by 1
  `);

  const rows = result.rows.map((row) => ({
    reason: row.reason,
    projects: Number(row.projects),
    sqm: String(row.sqm ?? "0"),
  }));

  const projects = rows.reduce((sum, row) => sum + row.projects, 0);
  /*
   * The total is summed in SQL as well, rather than adding the rows up here: a
   * decimal added as a JavaScript number is the rounding this codebase keeps
   * out of every other figure (rules/data.md).
   */
  const [totals] = (
    await db.execute<{ sqm: string }>(sql`
      select coalesce(sum(p.expected_sqm), 0)::text as sqm
        from projects p
        join companies c on c.id = p.company_id
       where p.lost_at is not null
         and p.archived_at is null
         and c.archived_at is null
         and (p.lost_at at time zone 'Asia/Riyadh')::date >= ${from}::date
         and (${repId}::uuid is null or p.rep_id = ${repId}::uuid)
    `)
  ).rows;
  const sqm = String(totals?.sqm ?? "0");

  const total = Number(sqm);
  const order = new Map(LOSS_REASON_CODES.map((code, index) => [code, index]));
  const withShare = rows
    .map((row) => ({
      ...row,
      // A width, not a figure: every row prints its own metres beside it.
      share: total > 0 ? Math.round((Number(row.sqm) / total) * 100) : 0,
    }))
    .sort(
      (a, b) =>
        Number(b.sqm) - Number(a.sqm) ||
        b.projects - a.projects ||
        (order.get(a.reason) ?? 0) - (order.get(b.reason) ?? 0),
    );

  return { from, projects, sqm, rows: withShare };
}
