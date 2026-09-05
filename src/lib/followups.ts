/**
 * Follow-ups — the ONE definition of "overdue", "due today" and "never
 * contacted" (rules/data.md § one definition per figure). The rep home strip,
 * the companies list, the projects list and the manager's counts all read the
 * expressions built here. A second derivation beside them is the drift trap
 * that showed two answers on two screens in FACET.
 *
 * Every comparison is against RIYADH's today, computed in SQL. Postgres's own
 * "today" keyword is the SERVER's UTC day, one behind Riyadh until 03:00 (hook
 * H6), and `AT TIME ZONE` on a bare `date` strips the zone (H7). The only safe
 * shape is `(now() at time zone 'Asia/Riyadh')::date`.
 *
 * The window a rep works in (SPEC S50): a date he set silences chasing until
 * it arrives and then becomes the reminder — due today is due, not overdue.
 *
 * No `import "server-only"` here, for the reason given in src/lib/live.ts:
 * host-side scripts drive these same functions, and Next aliases that module
 * at the compiler level so a plain `tsx` run cannot resolve it. Nothing here
 * belongs in a client component — it reaches for `pg` through Drizzle.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { seesAll } from "@/lib/authz";
import type { Day } from "@/lib/dates";
import type { SessionUser } from "@/lib/types";

/** How a pending follow-up reads on a row. `null` means none is set. */
export type FollowUpState = "overdue" | "today" | "future";

/**
 * The filter vocabulary the lists and the home strip share. `followups` is the
 * strip's own click — everything waiting today or earlier. `never` is SPEC S51:
 * added, never contacted, old enough to nag.
 */
const FILTERS = ["overdue", "today", "followups", "never", "quiet"] as const;

/**
 * Derived from the list, never written twice. The union and the runtime list
 * were two copies for one afternoon, `quiet` reached only the union, and
 * `?filter=quiet` parsed to undefined — so the pill opened the WHOLE list and
 * called it the quiet ones (D64).
 */
export type FollowUpFilter = (typeof FILTERS)[number];

/** Narrow a `?filter=` search param without trusting it. */
export function parseFollowUpFilter(value: unknown): FollowUpFilter | undefined {
  return typeof value === "string" && (FILTERS as readonly string[]).includes(value)
    ? (value as FollowUpFilter)
    : undefined;
}

/** A company added and never contacted reminds its rep after this many days (S51). */
export const NEVER_CONTACTED_DAYS = 14;

/** Today, as Riyadh counts it. A fresh fragment per call — never a shared one. */
export function riyadhTodaySql(): SQL<string> {
  return sql`(now() at time zone 'Asia/Riyadh')::date`;
}

/**
 * overdue / today / future / null for a `date` expression. `day` is inlined
 * three times rather than named once: the subqueries behind it are cheap
 * against the follow-up indexes, and a lateral would push its shape into every
 * caller.
 */
export function followUpStateSql(day: SQL): SQL<FollowUpState | null> {
  return sql`case
    when (${day}) is null then null
    when (${day}) < ${riyadhTodaySql()} then 'overdue'
    when (${day}) = ${riyadhTodaySql()} then 'today'
    else 'future'
  end`;
}

/**
 * The soonest pending date on the customer.
 *
 * It lived in src/lib/companies.ts, private, until the gone-quiet count needed
 * it too — and "the customer has no next step" is a follow-up question, so it
 * belongs beside the other follow-up fragments rather than being copied
 * (rules/data.md: one definition per figure): the company's own, or the earliest
 * of its open projects'. `least` ignores NULLs in Postgres, so a company with
 * no date of its own still surfaces through its project, and vice versa.
 */
export function effectiveFollowUpSql(): SQL<Day | null> {
  return sql`least(companies.next_follow_up, (
    select min(p.next_follow_up)
      from projects p
     where p.company_id = companies.id
       and p.archived_at is null
       and p.lost_at is null
  ))`;
}

/**
 * The WHERE clause for a `?filter=`, resolved in SQL so the ordering and any
 * limit apply to the rows that actually match (rules/data.md: filtering a
 * fetched page returns silently empty screens). `never` is not about a day, so
 * the caller passes the predicate it built for its own table.
 */
export function followUpFilterSql(
  day: SQL,
  filter: FollowUpFilter,
  never: SQL,
  quiet?: SQL,
): SQL {
  switch (filter) {
    case "overdue":
      return sql`(${day}) < ${riyadhTodaySql()}`;
    case "today":
      return sql`(${day}) = ${riyadhTodaySql()}`;
    case "followups":
      return sql`(${day}) <= ${riyadhTodaySql()}`;
    case "never":
      return never;
    case "quiet":
      // Only the company list has a `quiet` predicate to give; a caller that
      // does not is asking for a band it cannot fill, and an unfiltered list
      // would be the worst possible answer (rules/data.md).
      if (!quiet) throw new Error("the `quiet` filter needs its predicate");
      return quiet;
  }
}

/**
 * Companies that went quiet (SPEC D63, WORKFLOW §4 item 2).
 *
 * The leak the five-day walk found and the one a CRM has no excuse for: a
 * customer who was contacted, has no next step on him or on any of his live
 * projects, and therefore appears on no band of any screen. Eight of Faisal's
 * twelve were in exactly this state, invisible, on the day it was measured.
 *
 * "Never contacted" already has a band, so this one is deliberately the other
 * half: it requires at least one log entry. A company nobody has ever called and
 * a company somebody called once and dropped are two different failures with two
 * different next actions.
 *
 * The same fourteen days as `NEVER_CONTACTED_DAYS`, and for the same reason: it
 * is the point at which silence is a habit rather than a gap in the week. One
 * number, one meaning, and the screen says it out loud.
 */
export function goneQuietCompanySql(followUp: SQL): SQL {
  return sql`(
    (${followUp}) is null
    and exists (select 1 from activities where activities.company_id = companies.id)
    and (
      select max(a.happened_on) from activities a where a.company_id = companies.id
    ) <= ${riyadhTodaySql()} - ${NEVER_CONTACTED_DAYS}::int
  )`;
}

/**
 * "Never contacted": no log entry at all, and added long enough ago that the
 * silence is a habit rather than a fresh row (S51).
 *
 * BOTH tables are named outright inside the correlated subquery, because
 * Drizzle drops a column's qualifier when the outer query joins nothing —
 * `where company_id = id` then resolves inside `activities` and is never true,
 * returning zero and raising nothing (rules/data.md; three times in FACET).
 */
export function neverContactedCompanySql(): SQL {
  return sql`(
    not exists (select 1 from activities where activities.company_id = companies.id)
    and (companies.created_at at time zone 'Asia/Riyadh')::date
        <= ${riyadhTodaySql()} - ${NEVER_CONTACTED_DAYS}::int
  )`;
}

/** The same, for a project: nothing logged against it, and old enough to nag. */
export function neverContactedProjectSql(): SQL {
  return sql`(
    not exists (select 1 from activities where activities.project_id = projects.id)
    and (projects.created_at at time zone 'Asia/Riyadh')::date
        <= ${riyadhTodaySql()} - ${NEVER_CONTACTED_DAYS}::int
  )`;
}

export type FollowUpCounts = {
  overdue: number;
  today: number;
  neverContacted: number;
  /** Contacted, no next step, silent for a fortnight (D63). */
  goneQuiet: number;
};

/**
 * The three numbers behind the home strip — "Follow-ups: 2 overdue · 1 today".
 *
 * Counted over companies AND projects (SPEC D9: "the home strip counts both"),
 * inside one statement, against Riyadh's today. A rep is counted on his own
 * records only; manager and admin see everyone's (S8).
 *
 * A lost project is finished work, so its date no longer chases anybody; an
 * archived company or project never appears anywhere.
 */
export async function followUpCounts(user: SessionUser): Promise<FollowUpCounts> {
  return countsWhere(seesAll(user) ? sql`true` : sql`companies.rep_id = ${user.id}::uuid`);
}

/**
 * The same three numbers for ONE rep, whoever is asking — the manager's team
 * table (S8, D14). Same statement, so his row and the rep's own strip cannot
 * disagree; only the WHERE differs.
 */
export async function followUpCountsForRep(repId: string): Promise<FollowUpCounts> {
  return countsWhere(sql`companies.rep_id = ${repId}::uuid`);
}

async function countsWhere(mine: SQL): Promise<FollowUpCounts> {
  const result = await db.execute<{
    overdue: number;
    due_today: number;
    never_contacted: number;
    gone_quiet: number;
  }>(sql`
    with riyadh as (select ${riyadhTodaySql()} as d),
    due as (
      select companies.next_follow_up as day
        from companies
       where companies.archived_at is null
         and companies.next_follow_up is not null
         and ${mine}
      union all
      select projects.next_follow_up as day
        from projects
        join companies on companies.id = projects.company_id
       where projects.archived_at is null
         and projects.lost_at is null
         and projects.next_follow_up is not null
         and companies.archived_at is null
         and ${mine}
    )
    select
      (select count(*) from due, riyadh where due.day < riyadh.d)::int as overdue,
      (select count(*) from due, riyadh where due.day = riyadh.d)::int as due_today,
      (select count(*) from companies
        where companies.archived_at is null
          and ${mine}
          and ${neverContactedCompanySql()})::int as never_contacted,
      -- The same predicate the list filters by, so the pill and the rows it
      -- opens cannot disagree about how many there are (rules/data.md).
      (select count(*) from companies
        where companies.archived_at is null
          and ${mine}
          and ${goneQuietCompanySql(effectiveFollowUpSql())})::int as gone_quiet
  `);

  const row = result.rows[0];
  return {
    overdue: Number(row?.overdue ?? 0),
    today: Number(row?.due_today ?? 0),
    neverContacted: Number(row?.never_contacted ?? 0),
    goneQuiet: Number(row?.gone_quiet ?? 0),
  };
}
