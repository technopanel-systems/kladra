/**
 * The manager's screen: the company's month, everybody's month beside it, and
 * what is stuck (SPEC S43–S46, D14).
 *
 * Nothing here computes a figure of its own. Achieved m² comes from
 * `src/lib/dispatches.ts`, the follow-up counts from `src/lib/followups.ts`,
 * and the working-day arithmetic from `src/lib/workdays.ts` — one definition
 * each, which is the whole point of a screen whose job is to be believed
 * (rules/data.md). What this file adds is the joining up: targets beside
 * achieved, a rep's name beside his row, and the three "stuck" questions.
 *
 * Two things it deliberately does NOT do. It does not add the reps' targets up
 * into a company target: that is one figure the admin sets, and neither derives
 * from the other (S44). And it does not combine progress and activity into a
 * score — the two sit side by side and nothing here ranks anybody (S46).
 *
 * A rep with no target is a row with a dash where the target would be, and all
 * his real figures beside it (S45).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyTargets, quotations, targets, users } from "@/db/schema";
import { listNonWorkingDays } from "@/lib/calendar";
import { firstOfMonth, lastOfMonth, todayRiyadh, type Day } from "@/lib/dates";
import { achievedByRep, companyAchievedSqm } from "@/lib/dispatches";
import { followUpCountsForRep, NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { quotationLabel } from "@/lib/labels";
import { pipelineByRep, pipelineSqm } from "@/lib/standing";
import { LATE_AFTER_WORKING_DAYS } from "@/lib/waiting";
import { monthPace, workingDaysBetween, type NonWorking } from "@/lib/workdays";
import type { Role } from "@/lib/types";

/**
 * How far into the month the working days are.
 *
 * `justStarted` is S49: in the first five working days a ratio is noise — one
 * approved dispatch reads as 400% of pace — so the screen says the month has
 * just started instead of showing a number nobody should act on.
 */
export const MONTH_JUST_STARTED_DAYS = 5;

export type Pace = {
  elapsed: number;
  total: number;
  ratio: number;
  justStarted: boolean;
};

export type MonthFigures = {
  /** The target for the month, or null — a rep may not have one (S45). */
  target: string | null;
  /** What approved dispatches actually moved (S43). */
  achieved: string;
};

export type TeamMember = MonthFigures & {
  userId: string;
  /** Expected m² on this rep's live projects (S45). */
  pipeline: string;
  name: string;
  role: Role;
  /**
   * This person's own working days, not the office's. Personal leave is in the
   * same table as the company holidays, so a rep back from two weeks off has a
   * shorter month and does not read as behind (S48).
   */
  pace: Pace;
  /** Quotations still waiting on somebody: asked, sent back, or out with the customer. */
  openQuotations: number;
  overdueFollowUps: number;
  /** Added and never contacted, old enough to be a habit (S51). */
  neverContacted: number;
};

export type TeamMonth = {
  month: Day;
  pace: Pace;
  /** The whole company's pipeline, from the same definition (S45). */
  pipeline: string;
  /** One figure the admin sets, never a sum of the reps' (S44). */
  company: MonthFigures;
  members: TeamMember[];
};

/** The month a Riyadh day falls in, as its first day — how targets are keyed. */
export function monthOf(day: Day = todayRiyadh()): Day {
  return firstOfMonth(day);
}

function paceFor(today: Day, nonWorking: NonWorking[], userId?: string): Pace {
  const { elapsed, total, ratio } = monthPace(today, nonWorking, userId);
  return { elapsed, total, ratio, justStarted: elapsed <= MONTH_JUST_STARTED_DAYS };
}

/**
 * Who carries metres, and therefore who has a month at all.
 *
 * Reps, and the manager — §3 says he sees "everyone's achieved, his own
 * included as team", and S8 says a manager who sells carries no personal
 * target, which is exactly what a null renders as.
 *
 * Not the coordinator: she has no companies of her own, so every figure on her
 * row would be a dash (D15, S9). Not the admin either, for the same reason —
 * Jerom runs the app and sells nothing, and a permanent row of dashes on the
 * manager's main screen is one more thing to read past every morning. The
 * targets screen already refused to give him a box; this is the same sentence,
 * said once, so the two screens cannot disagree about who has a month (D44).
 */
export const CARRIES_METRES = sql`users.role in ('rep', 'manager')`;

/**
 * Everybody who carries metres, with their month beside them.
 */
export async function teamMonth(day: Day = todayRiyadh()): Promise<TeamMonth> {
  const month = monthOf(day);

  const [people, targetRows, companyTargetRow, achieved, companyAchieved, nonWorking] =
    await Promise.all([
      db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(and(eq(users.active, true), CARRIES_METRES))
        .orderBy(asc(users.name)),
      db
        .select({ userId: targets.userId, sqm: targets.sqm })
        .from(targets)
        .where(eq(targets.month, month)),
      db
        .select({ sqm: companyTargets.sqm })
        .from(companyTargets)
        .where(eq(companyTargets.month, month))
        .limit(1),
      achievedByRep(month),
      companyAchievedSqm(month),
      listNonWorkingDays(firstOfMonth(day), lastOfMonth(day)),
    ]);

  // One statement for everybody's pipeline, and the company's is the same rows
  // read without a group — never a sum of the reps', which is how two screens
  // start disagreeing about one figure (S44, rules/data.md).
  const [pipelines, companyPipeline] = await Promise.all([
    pipelineByRep(),
    pipelineSqm(sql`true`),
  ]);

  const targetByUser = new Map(targetRows.map((row) => [row.userId, String(row.sqm)]));

  // One round trip per person for the counts rather than a second derivation of
  // them: fourteen people, and a figure that disagrees with the rep's own strip
  // is worse than a query (rules/data.md).
  const members = await Promise.all(
    people.map(async (person) => {
      const [counts, open] = await Promise.all([
        followUpCountsForRep(person.id),
        openQuotationsFor(person.id),
      ]);
      return {
        userId: person.id,
        name: person.name,
        role: person.role as Role,
        pace: paceFor(day, nonWorking, person.id),
        target: targetByUser.get(person.id) ?? null,
        achieved: achieved.get(person.id) ?? "0",
        pipeline: pipelines.get(person.id) ?? "0",
        openQuotations: open,
        overdueFollowUps: counts.overdue,
        neverContacted: counts.neverContacted,
      };
    }),
  );

  return {
    month,
    pace: paceFor(day, nonWorking),
    pipeline: companyPipeline,
    company: {
      target: companyTargetRow[0] ? String(companyTargetRow[0].sqm) : null,
      achieved: companyAchieved,
    },
    members,
  };
}

/**
 * One person's own month — the card on a rep's home (S43, S45, S46).
 *
 * The same three reads the team table makes, so his card and his row in the
 * manager's table are the same numbers.
 */
export async function repMonth(
  userId: string,
  day: Day = todayRiyadh(),
): Promise<MonthFigures & { month: Day; pace: Pace }> {
  const month = monthOf(day);
  const [targetRow, achieved, nonWorking] = await Promise.all([
    db
      .select({ sqm: targets.sqm })
      .from(targets)
      .where(and(eq(targets.userId, userId), eq(targets.month, month)))
      .limit(1),
    achievedByRep(month),
    listNonWorkingDays(firstOfMonth(day), lastOfMonth(day)),
  ]);

  return {
    month,
    target: targetRow[0] ? String(targetRow[0].sqm) : null,
    achieved: achieved.get(userId) ?? "0",
    pace: paceFor(day, nonWorking, userId),
  };
}

/**
 * Quotations still waiting on somebody at this rep's companies.
 *
 * Asked, sent back, or issued and out with the customer. Accepted, rejected and
 * withdrawn are finished, and only the live revision counts — a number quoted
 * three times is one open quotation, not three (S34, S35).
 */
async function openQuotationsFor(repId: string): Promise<number> {
  const [row] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(
      and(
        eq(companies.repId, repId),
        isNull(companies.archivedAt),
        sql`quotations.status in ('requested', 'returned', 'issued')`,
        sql`not exists (
          select 1 from quotations later
           where later.number = quotations.number
             and later.revision > quotations.revision
        )`,
      ),
    );
  return Number(row?.open ?? 0);
}

/**
 * What is stuck (D14): requests waiting more than 2 WORKING days, follow-ups
 * overdue more than 3 days, companies never contacted for more than 14.
 *
 * "Working days" is why the requests are filtered here rather than in SQL: the
 * weekend and the holiday table are `src/lib/workdays.ts`'s business, and a
 * second copy of that arithmetic in a `case` expression is how a rep back from
 * Eid gets told he is late (S48). The list is short and unpaged, so filtering
 * after the read costs nothing and cannot silently empty a screen the way
 * filtering a PAGE would (rules/data.md).
 */
/**
 * Re-exported, not redefined. The number lives in `src/lib/waiting.ts` now,
 * because the coordinator's queue asks the same question this list does — "how
 * long has this been sitting?" — and two copies of the answer is the manager's
 * screen calling a request late while the screen that could clear it says
 * nothing (D59).
 */
export const STUCK_REQUEST_WORKING_DAYS = LATE_AFTER_WORKING_DAYS;
export const STUCK_FOLLOW_UP_DAYS = 3;

export type StuckRequest = {
  id: string;
  label: string;
  companyName: string;
  repName: string;
  /** The Riyadh day it was asked for. */
  since: Day;
  workingDaysWaiting: number;
};

export type StuckFollowUp = {
  id: string;
  name: string;
  companyName: string;
  repName: string;
  day: Day;
  daysOverdue: number;
  kind: "company" | "project";
};

export type StuckCompany = {
  id: string;
  name: string;
  repName: string;
  daysSinceAdded: number;
};

export type Stuck = {
  requests: StuckRequest[];
  followUps: StuckFollowUp[];
  neverContacted: StuckCompany[];
};

export async function stuckList(day: Day = todayRiyadh()): Promise<Stuck> {
  const [waiting, followUps, never, nonWorking] = await Promise.all([
    db
      .select({
        id: quotations.id,
        number: quotations.number,
        revision: quotations.revision,
        companyName: companies.name,
        repName: users.name,
        since: sql<string>`to_char((quotations.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .innerJoin(users, eq(users.id, companies.repId))
      .where(and(eq(quotations.status, "requested"), isNull(companies.archivedAt)))
      .orderBy(asc(quotations.createdAt)),

    db.execute<{
      id: string;
      name: string;
      company_name: string;
      rep_name: string;
      day: string;
      days_overdue: number;
      kind: "company" | "project";
    }>(sql`
      select companies.id::text as id,
             companies.name as name,
             companies.name as company_name,
             u.name as rep_name,
             to_char(companies.next_follow_up, 'YYYY-MM-DD') as day,
             ((now() at time zone 'Asia/Riyadh')::date - companies.next_follow_up)::int as days_overdue,
             'company' as kind
        from companies
        join users u on u.id = companies.rep_id
       where companies.archived_at is null
         and companies.next_follow_up is not null
         and companies.next_follow_up
             < (now() at time zone 'Asia/Riyadh')::date - ${STUCK_FOLLOW_UP_DAYS}::int
      union all
      select projects.id::text as id,
             projects.name as name,
             c.name as company_name,
             u.name as rep_name,
             to_char(projects.next_follow_up, 'YYYY-MM-DD') as day,
             ((now() at time zone 'Asia/Riyadh')::date - projects.next_follow_up)::int as days_overdue,
             'project' as kind
        from projects
        join companies c on c.id = projects.company_id
        join users u on u.id = c.rep_id
       where projects.archived_at is null
         and projects.lost_at is null
         and projects.next_follow_up is not null
         and c.archived_at is null
         and projects.next_follow_up
             < (now() at time zone 'Asia/Riyadh')::date - ${STUCK_FOLLOW_UP_DAYS}::int
       order by day asc
    `),

    db.execute<{ id: string; name: string; rep_name: string; days: number }>(sql`
      select companies.id::text as id,
             companies.name as name,
             u.name as rep_name,
             ((now() at time zone 'Asia/Riyadh')::date
               - (companies.created_at at time zone 'Asia/Riyadh')::date)::int as days
        from companies
        join users u on u.id = companies.rep_id
       where companies.archived_at is null
         and not exists (select 1 from activities where activities.company_id = companies.id)
         and (companies.created_at at time zone 'Asia/Riyadh')::date
             <= (now() at time zone 'Asia/Riyadh')::date - ${NEVER_CONTACTED_DAYS}::int
       order by days desc
    `),

    listNonWorkingDays(firstOfMonth(day), day),
  ]);

  const requests: StuckRequest[] = [];
  for (const row of waiting) {
    const days = workingDaysBetween(row.since, day, nonWorking);
    if (days <= STUCK_REQUEST_WORKING_DAYS) continue;
    requests.push({
      id: row.id,
      label: quotationLabel(row.number, row.revision),
      companyName: row.companyName,
      repName: row.repName,
      since: row.since,
      workingDaysWaiting: days,
    });
  }

  return {
    requests,
    followUps: followUps.rows.map((row) => ({
      id: row.id,
      name: row.name,
      companyName: row.company_name,
      repName: row.rep_name,
      day: row.day,
      daysOverdue: Number(row.days_overdue),
      kind: row.kind,
    })),
    neverContacted: never.rows.map((row) => ({
      id: row.id,
      name: row.name,
      repName: row.rep_name,
      daysSinceAdded: Number(row.days),
    })),
  };
}
