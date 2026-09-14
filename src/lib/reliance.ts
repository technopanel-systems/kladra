/**
 * How often each person relies on the coordinator (SPEC §3 P13): "how often each
 * rep relies on her is tracked, so the manager can see whether it is occasional
 * or a habit."
 *
 * The answer has been in the rows since migration 0025: a paper whose
 * `raised_by_id` is not its `rep_id` was raised by somebody else for the person
 * it counts for — and the coordinator is the only person who may (`raisesForOthers`).
 * It is the same condition the "Raised by" line on a drawer and the marker on a
 * list row are drawn on, so the card and the paper cannot disagree about which
 * papers she raised.
 *
 * Over the metrics window, chosen once above every card on the tab (D154), by
 * the day each paper was raised in Riyadh. Every quotation row counts once — a
 * revision is a paper somebody raised — and every dispatch row, whatever became
 * of it since: the question is who did the work of raising it, and a withdrawal
 * a week later does not change who did. An archived customer's paper counts
 * too, for the same reason.
 *
 * Three things in one file and each has its twin: the SQL the reader runs, the
 * pure function that counts the same thing from rows (`relianceCounts`, held to
 * the SQL by tests/reliance.spec.ts), and the rule that turns two counts into a
 * word (`relianceWord`). The SQL is TEXT with positional parameters rather than
 * a Drizzle query, so the spec runs the very statement the card does.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { pool } from "@/db";
import type { Day } from "@/lib/dates";
import { RAISED_FOR_ROLES } from "@/lib/floor";
import { personNameFrom } from "@/lib/person-name";

/** The three answers, the list first and the type from it (rules/words.md). */
export const RELIANCE_WORDS = ["none", "occasional", "habit"] as const;
export type RelianceWord = (typeof RELIANCE_WORDS)[number];

/**
 * A habit (SPEC §4, DEFAULT — founder may change): a quarter or more of a
 * person's paper in the window, and at least three papers. The share alone
 * would call one paper out of two a habit in a quiet month; the count alone
 * would call three out of sixty one. Anything above nothing and short of that
 * is occasional.
 */
export const HABIT_SHARE_PERCENT = 25;
export const HABIT_AT_LEAST = 3;

export function relianceWord(raised: number, total: number): RelianceWord {
  if (raised <= 0 || total <= 0) return "none";
  // Integers on both sides, so a share of exactly a quarter is on the habit side
  // with no rounding to argue about.
  return raised >= HABIT_AT_LEAST && raised * 100 >= HABIT_SHARE_PERCENT * total
    ? "habit"
    : "occasional";
}

/** Her share of his paper, whole per cent, for the figure beside the words. */
export function reliancePercent(raised: number, total: number): number {
  return total <= 0 ? 0 : Math.round((raised * 100) / total);
}

/** One person's paper in the window, and how much of it she raised. */
export type RelianceCounts = {
  userId: string;
  quotations: number;
  raisedQuotations: number;
  dispatches: number;
  raisedDispatches: number;
};

/**
 * The statement. `$1` is the first Riyadh day of the window, `$2` the roles
 * counted (`RAISED_FOR_ROLES` — whom she may raise for), as a text array.
 *
 * Both halves counted per person inside a lateral join before anything is
 * ordered, so a person with no paper at all is a row of noughts rather than
 * missing, and nothing is filtered after the fact (rules/data.md).
 */
export const RELIANCE_SQL = `
  select person.id::text as user_id,
         person.name,
         person.name_ar,
         coalesce(q.total, 0)::int as quotations,
         coalesce(q.raised, 0)::int as raised_quotations,
         coalesce(d.total, 0)::int as dispatches,
         coalesce(d.raised, 0)::int as raised_dispatches
    from users person
    left join lateral (
          select count(*) as total,
                 count(*) filter (where paper.raised_by_id <> paper.rep_id) as raised
            from quotations paper
           where paper.rep_id = person.id
             and (paper.created_at at time zone 'Asia/Riyadh')::date >= $1::date
         ) q on true
    left join lateral (
          select count(*) as total,
                 count(*) filter (where paper.raised_by_id <> paper.rep_id) as raised
            from dispatches paper
           where paper.rep_id = person.id
             and (paper.created_at at time zone 'Asia/Riyadh')::date >= $1::date
         ) d on true
   where person.active
     and person.role::text = any($2::text[])
   order by (coalesce(q.raised, 0) + coalesce(d.raised, 0))::numeric
              / nullif(coalesce(q.total, 0) + coalesce(d.total, 0), 0) desc nulls last,
            coalesce(q.raised, 0) + coalesce(d.raised, 0) desc,
            person.id
`;

/** A row as the statement returns it. */
export type RelianceSqlRow = {
  user_id: string;
  name: string;
  name_ar: string | null;
  quotations: number;
  raised_quotations: number;
  dispatches: number;
  raised_dispatches: number;
};

/** One paper, as the pure twin reads it. */
export type ReliancePaper = {
  kind: "quotation" | "dispatch";
  repId: string;
  raisedById: string;
  /** The Riyadh day it was raised. */
  createdOn: Day;
};

/**
 * The same counts from rows, for the people given, in their order. The spec
 * feeds it every paper in the database and compares it with the statement.
 */
export function relianceCounts(
  people: readonly string[],
  papers: readonly ReliancePaper[],
  from: Day,
): RelianceCounts[] {
  const counts = new Map<string, RelianceCounts>(
    people.map((userId) => [
      userId,
      { userId, quotations: 0, raisedQuotations: 0, dispatches: 0, raisedDispatches: 0 },
    ]),
  );
  for (const paper of papers) {
    const row = counts.get(paper.repId);
    // Days as ISO text compare the way the days do.
    if (!row || paper.createdOn < from) continue;
    const raised = paper.raisedById !== paper.repId ? 1 : 0;
    if (paper.kind === "quotation") {
      row.quotations += 1;
      row.raisedQuotations += raised;
    } else {
      row.dispatches += 1;
      row.raisedDispatches += raised;
    }
  }
  return people.map((userId) => counts.get(userId)!);
}

export type RelianceRow = RelianceCounts & {
  /** In the reader's script (D68). */
  name: string;
  /** Quotations and dispatches together: what "3 of 12" says. */
  raised: number;
  total: number;
  percent: number;
  word: RelianceWord;
};

/** The two counts a row says, and its word, from the four the statement returns. */
export function relianceOf(counts: RelianceCounts): {
  raised: number;
  total: number;
  percent: number;
  word: RelianceWord;
} {
  const raised = counts.raisedQuotations + counts.raisedDispatches;
  const total = counts.quotations + counts.dispatches;
  return { raised, total, percent: reliancePercent(raised, total), word: relianceWord(raised, total) };
}

/**
 * Every person she may raise for, with their paper in the window and how much
 * of it she raised — the largest share first, so a habit is at the top of the
 * card, and anybody with no paper at all last.
 */
export async function relianceRows(from: Day, locale: string): Promise<RelianceRow[]> {
  const { rows } = await pool.query<RelianceSqlRow>(RELIANCE_SQL, [from, RAISED_FOR_ROLES]);
  return rows.map((row) => {
    const counts: RelianceCounts = {
      userId: row.user_id,
      quotations: row.quotations,
      raisedQuotations: row.raised_quotations,
      dispatches: row.dispatches,
      raisedDispatches: row.raised_dispatches,
    };
    return {
      ...counts,
      ...relianceOf(counts),
      name: personNameFrom({ name: row.name, nameAr: row.name_ar }, locale),
    };
  });
}
