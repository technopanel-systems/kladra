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
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { companies, companyTargets, quotations, targets, users } from "@/db/schema";
import { listNonWorkingDays } from "@/lib/calendar";
import { firstOfMonth, lastOfMonth, todayRiyadh, type Day } from "@/lib/dates";
import { achievedByRep, companyAchievedSqm } from "@/lib/dispatches";
import { countOpenDuplicates, listOpenDuplicates } from "@/lib/duplicates";
import { carriesMetres } from "@/lib/floor";
import { followUpCountsForRep, NEVER_CONTACTED_DAYS } from "@/lib/followups";
import { quotationLabel } from "@/lib/labels";
import { ageLeads, lateLeads, unacknowledgedLeads, type LeadWithWait } from "@/lib/leads";
import { awayOn, type Away } from "@/lib/leave";
import { personName, personNameOf } from "@/lib/people";
import { ROLES } from "@/lib/types";
import { openQuotationsForRep, pipelineByRep, pipelineSqm } from "@/lib/standing";
import { STUCK_SHOWN, topOf, type Group } from "@/lib/list-size";
import { LATE_AFTER_WORKING_DAYS, waitedSince, type Waited } from "@/lib/waiting";
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
  /**
   * Contacted, then dropped (D63). The strip above this table has carried the
   * team's total since P9 and on a real floor it is the largest of the five
   * figures — and the row said whose the never-contacted ones were and not
   * whose these were, which is the only thing a manager can act on (D142).
   */
  goneQuiet: number;
  /**
   * Not at work today, and the day he is back (D75). Null is the ordinary case.
   * His figures are still his — the month does not stop because he is away, and
   * his pace already counts only the days he works (S48).
   */
  away: Away | null;
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
 * The coordinator is here since SPEC §3, which overrules D15 and S9: she is a
 * selling role with her own m² target, so her row carries figures rather than
 * the dashes it would have carried before she had companies of her own.
 *
 * And it is not a second list any more. This was a hand-written `role in
 * ('rep', 'manager')` beside `carriesMetres` in src/lib/floor.ts, which is the
 * shape of D42: two copies of one sentence, and the day §3 moved it only one of
 * them was edited. The SQL is derived from the predicate the screens ask, so
 * there is one place to change and no way to change half of it.
 *
 * Not the admin: Jerom runs the app and sells nothing, and a permanent row of
 * dashes on the manager's main screen is one more thing to read past every
 * morning. The targets screen already refused to give him a box; this is the
 * same sentence, said once, so the two screens cannot disagree about who has a
 * month (D44).
 */
export const CARRIES_METRES = inArray(users.role, ROLES.filter(carriesMetres));

/**
 * Everybody who carries metres, with their month beside them.
 */
export async function teamMonth(day: Day = todayRiyadh()): Promise<TeamMonth> {
  const month = monthOf(day);
  // The reader's script, not the account's (D68). Every one of these functions
  // is already async and already inside a request, so the page's locale is here
  // for the asking and no caller had to change.
  const locale = await getLocale();

  const [people, targetRows, companyTargetRow, achieved, companyAchieved, nonWorking, away] =
    await Promise.all([
      db
        .select({ id: users.id, name: personName(locale), role: users.role })
        .from(users)
        .where(and(eq(users.active, true), CARRIES_METRES))
        .orderBy(asc(personName(locale))),
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
      awayOn(day),
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
        openQuotationsForRep(person.id),
      ]);
      return {
        userId: person.id,
        name: person.name,
        role: person.role as Role,
        pace: paceFor(day, nonWorking, person.id),
        target: targetByUser.get(person.id) ?? null,
        achieved: achieved.get(person.id) ?? "0",
        pipeline: pipelines.get(person.id) ?? "0",
        openQuotations: open.total,
        overdueFollowUps: counts.overdue,
        neverContacted: counts.neverContacted,
        goneQuiet: counts.goneQuiet,
        away: away.get(person.id) ?? null,
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
 * What is due on the floors of the people who are not here (D75).
 *
 * Asked only when somebody is away, which is most days nobody: an empty map is
 * an empty band and no query at all. Due TODAY counts as well as overdue, which
 * is the difference between this group and the stuck one — a customer expecting
 * a call this morning from a rep who is on leave is the whole point, and by the
 * time it is three days late the damage is done.
 */
async function uncoveredFollowUps(
  away: Map<string, Away>,
  locale: string,
): Promise<RawFollowUp[]> {
  if (away.size === 0) return [];

  /*
   * A JS array interpolated into a `sql` template is ONE parameter, and its text
   * is the members joined by commas — so `= any($1::uuid[])` reached Postgres as
   * a single string and the whole team screen answered 500 with "malformed array
   * literal" the moment anybody was on leave (rules/data.md). `sql.join` is the
   * shape that makes a list: one bound parameter per id, cast at each one.
   */
  const ids = sql.join(
    [...away.keys()].map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const rows = await db.execute<{
    id: string;
    name: string;
    company_name: string;
    rep_name: string;
    rep_id: string;
    day: Day;
    kind: "company" | "project";
  }>(sql`
    select companies.id::text as id,
           companies.name as name,
           companies.name as company_name,
           ${personNameOf("u", locale)} as rep_name,
           u.id::text as rep_id,
           to_char(companies.next_follow_up, 'YYYY-MM-DD') as day,
           'company' as kind
      from companies
      join users u on u.id = companies.rep_id
     where companies.archived_at is null
       and companies.next_follow_up is not null
       and companies.next_follow_up <= (now() at time zone 'Asia/Riyadh')::date
       and u.id in (${ids})
    union all
    select projects.id::text as id,
           projects.name as name,
           c.name as company_name,
           ${personNameOf("u", locale)} as rep_name,
           u.id::text as rep_id,
           to_char(projects.next_follow_up, 'YYYY-MM-DD') as day,
           'project' as kind
      from projects
      join companies c on c.id = projects.company_id
      join users u on u.id = c.rep_id
     where projects.archived_at is null
       and projects.lost_at is null
       and projects.next_follow_up is not null
       and c.archived_at is null
       and projects.next_follow_up <= (now() at time zone 'Asia/Riyadh')::date
       and u.id in (${ids})
     order by day asc
  `);

  return rows.rows.flatMap((row) => {
    // The query asked for these people by id, so this cannot miss; a row whose
    // rep is not in the map would be one this band cannot say anything true
    // about, and it is left out rather than given a made-up day.
    const back = away.get(row.rep_id);
    if (!back) return [];
    return [
      {
        id: row.id,
        name: row.name,
        companyName: row.company_name,
        repName: row.rep_name,
        repId: row.rep_id,
        day: row.day,
        kind: row.kind,
        backOn: back.backOn,
      },
    ];
  });
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
 * What is stuck (D14): requests waiting more than 2 WORKING days, follow-ups
 * overdue more than 3 days, companies never contacted for more than 14, and
 * since P12-7 a lead nobody has picked up in the same 2 working days a request
 * gets.
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
/**
 * And a late follow-up is counted the same way (D141).
 *
 * It was three CALENDAR days, which put two clocks on one screen: a request
 * waiting since Thursday read "1 working day" and a call promised for Thursday
 * read "3 days overdue", on the same list, on the same Sunday morning. Worse
 * over a holiday — a rep back from Eid was told he was nine days late on every
 * date in his book, which is the sentence the comment above says this file must
 * never produce.
 */
export const STUCK_FOLLOW_UP_WORKING_DAYS = 3;

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
  /**
   * How long it has been in the state its own group names: since it was added,
   * for one nobody has ever contacted; since the last thing logged, for one
   * that went quiet. Not `daysSinceAdded`, which is what it was called when
   * there was one group — and which the gone-quiet rows would have made a lie.
   */
  days: number;
};

/**
 * A follow-up due on a floor nobody is standing on (D75).
 *
 * The same row as a stuck follow-up, plus the day its rep is back — which is
 * the whole decision the manager is making when he reads it: call the customer
 * himself, or leave it three days.
 */
export type UncoveredFollowUp = StuckFollowUp & { backOn: Day };

/**
 * A follow-up as the database hands it over: the day it was promised for, and
 * whose it is. How LATE it is cannot be asked in SQL, because the answer counts
 * working days and the weekend and the holiday table are `@/lib/workdays`'s
 * business (D141) — so every row in this file is read first and aged after, the
 * way the waiting requests already were.
 */
type RawFollowUp = {
  id: string;
  name: string;
  companyName: string;
  repName: string;
  repId: string;
  day: Day;
  kind: "company" | "project";
  backOn?: Day;
};

/** One group of the stuck list: what is drawn, and how many there are. */
export type StuckGroup<Row> = Group<Row>;

/** This screen's share of the one rule (src/lib/list-size.ts). */
const top = <Row,>(rows: Row[]): StuckGroup<Row> => topOf(rows, STUCK_SHOWN);

export type Stuck = {
  requests: StuckGroup<StuckRequest>;
  followUps: StuckGroup<StuckFollowUp>;
  /**
   * Due today or already past, and the rep is on leave. First on the screen
   * because it is the only group on it that is about TODAY: the others have
   * been waiting days and will still be there tomorrow.
   */
  uncovered: StuckGroup<UncoveredFollowUp>;
  neverContacted: StuckGroup<StuckCompany>;
  /**
   * Contacted, then dropped: no next step anywhere on the customer and nothing
   * logged for a fortnight (D63). The other half of `neverContacted`, and the
   * bigger half — a company nobody ever called is a lead that went nowhere, and
   * this is a customer somebody was already talking to.
   */
  goneQuiet: StuckGroup<StuckCompany>;
  /**
   * A lead marketing handed somebody and nobody has picked up (SPEC §3, P12-7).
   *
   * Late at the same age as a request on the coordinator's desk, because it is
   * the same fact: something arrived, and the person it arrived for has not
   * touched it. Two clocks for one idea of "too long" is what D141 was.
   */
  leads: StuckGroup<LeadWithWait>;
  /**
   * Two records that hold one telephone number, waiting on HIM (P12-8).
   *
   * First on the screen, and the only group here that is his own work rather
   * than somebody else's that he is watching: nobody but the manager can answer
   * it (§3, `mayHandOver`), and until he does, two reps are ringing one customer
   * and neither of them knows.
   *
   * Not filtered by age, unlike a request or a follow-up. There is no such thing
   * as a duplicate flag that is young enough to leave alone — the question was
   * answerable the second it was raised, and every day it waits is a day of
   * somebody's work going onto the wrong record.
   */
  duplicates: StuckGroup<StuckDuplicate>;
};

/** A pair on the manager's stuck list; the screen behind it is `/duplicates`. */
export type StuckDuplicate = {
  id: string;
  /** The record that arrived, which is the one he has probably not seen. */
  name: string;
  /** Both holders, named in one sentence rather than joined into one string. */
  older: string;
  newer: string;
  waited: Waited;
};

export async function stuckList(day: Day = todayRiyadh()): Promise<Stuck> {
  const locale = await getLocale();
  const [waiting, followUps, never, quiet, away, leads, pairs] = await Promise.all([
    db
      .select({
        id: quotations.id,
        number: quotations.number,
        revision: quotations.revision,
        companyName: companies.name,
        repName: personName(locale),
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
      rep_id: string;
      day: Day;
      kind: "company" | "project";
    }>(sql`
      select companies.id::text as id,
             companies.name as name,
             companies.name as company_name,
             ${personNameOf("u", locale)} as rep_name,
             u.id::text as rep_id,
             to_char(companies.next_follow_up, 'YYYY-MM-DD') as day,
             'company' as kind
        from companies
        join users u on u.id = companies.rep_id
       where companies.archived_at is null
         and companies.next_follow_up is not null
         -- A CALENDAR-day cut, and deliberately the wrong one: N working days
         -- back is never later than N calendar days back, so this is a superset
         -- of what the working-day rule keeps and the read stays narrow. The
         -- rule itself is applied below, once (D141).
         and companies.next_follow_up
             < (now() at time zone 'Asia/Riyadh')::date - ${STUCK_FOLLOW_UP_WORKING_DAYS}::int
      union all
      select projects.id::text as id,
             projects.name as name,
             c.name as company_name,
             ${personNameOf("u", locale)} as rep_name,
             u.id::text as rep_id,
             to_char(projects.next_follow_up, 'YYYY-MM-DD') as day,
             'project' as kind
        from projects
        join companies c on c.id = projects.company_id
        join users u on u.id = c.rep_id
       where projects.archived_at is null
         and projects.lost_at is null
         and projects.next_follow_up is not null
         and c.archived_at is null
         and projects.next_follow_up
             < (now() at time zone 'Asia/Riyadh')::date - ${STUCK_FOLLOW_UP_WORKING_DAYS}::int
       order by day asc
    `),

    db.execute<{ id: string; name: string; rep_name: string; days: number }>(sql`
      select companies.id::text as id,
             companies.name as name,
             ${personNameOf("u", locale)} as rep_name,
             ((now() at time zone 'Asia/Riyadh')::date
               - (companies.created_at at time zone 'Asia/Riyadh')::date)::int as days
        from companies
        join users u on u.id = companies.rep_id
       where companies.archived_at is null
         and not exists (
           select 1 from activities
            where activities.company_id = companies.id and activities.archived_at is null
         )
         and (companies.created_at at time zone 'Asia/Riyadh')::date
             <= (now() at time zone 'Asia/Riyadh')::date - ${NEVER_CONTACTED_DAYS}::int
       order by days desc
    `),

    db.execute<{ id: string; name: string; rep_name: string; days: number }>(sql`
      select companies.id::text as id,
             companies.name as name,
             ${personNameOf("u", locale)} as rep_name,
             ((now() at time zone 'Asia/Riyadh')::date
               - (select max(a.happened_on) from activities a
                   where a.company_id = companies.id and a.archived_at is null))::int as days
        from companies
        join users u on u.id = companies.rep_id
       where companies.archived_at is null
         and least(companies.next_follow_up, (
           select min(p.next_follow_up) from projects p
            where p.company_id = companies.id
              and p.archived_at is null
              and p.lost_at is null
         )) is null
         and exists (
           select 1 from activities
            where activities.company_id = companies.id and activities.archived_at is null
         )
         and (select max(a.happened_on) from activities a
               where a.company_id = companies.id and a.archived_at is null)
             <= (now() at time zone 'Asia/Riyadh')::date - ${NEVER_CONTACTED_DAYS}::int
       order by days desc
    `),

    awayOn(day),

    // Read whole and aged below, like every other row on this screen: working
    // days are `@/lib/workdays`'s business and a second copy of that arithmetic
    // is how a rep back from Eid gets told he is late (D141).
    unacknowledgedLeads(),

    // The manager's own queue, read here so that his home screen names it
    // (P12-8). Capped at the size the band draws, because this read exists to
    // fill that band and the whole list is one click away on `/duplicates`.
    listOpenDuplicates(STUCK_SHOWN),
  ]);

  /*
   * How many there are in all, asked only when the list came back full (D80).
   *
   * NOT `rows.length`, which is the cap. Every other group on this screen hands
   * `top()` a whole list and lets it carry the length; this one is capped in
   * SQL, so `top()` would report the cap as the total and the band's "and N
   * more" would be silently zero for ever — a figure that is the length of a
   * capped list (D144).
   */
  const openPairs =
    pairs.length === STUCK_SHOWN ? await countOpenDuplicates() : pairs.length;

  // What is due on a floor nobody is standing on. Asked here rather than in the
  // read above because it needs `away`, and asked BEFORE the holidays because
  // its rows are aged by them too (D141).
  const uncovered = await uncoveredFollowUps(away, locale);

  /*
   * The holidays every wait on this screen crosses, back to the earliest day any
   * of them counts from (D97). It read from the first of the month, so a request
   * from the 28th aged a holiday on the 30th as a working day and read a day
   * older than it was on the manager's screen and the coordinator's. Each list
   * is ordered oldest first, so its first row is its own earliest day — and a
   * follow-up promised in March is now aged by this too, which is the whole of
   * D141.
   */
  const earliest = [
    firstOfMonth(day),
    waiting[0]?.since as Day | undefined,
    followUps.rows[0]?.day,
    leads[0]?.givenOn,
    pairs[0]?.raisedOn,
    ...uncovered.map((row) => row.day),
  ].reduce<Day>((soonest, candidate) => (candidate && candidate < soonest ? candidate : soonest), firstOfMonth(day));
  const nonWorking = await listNonWorkingDays(earliest, day);

  /**
   * How late a promised call is, in working days, counted against the person
   * whose call it is: his own leave is not lateness (S48, D141).
   */
  const lateBy = (row: RawFollowUp) => workingDaysBetween(row.day, day, nonWorking, row.repId);

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
    requests: top(requests),
    // Due TODAY counts here, which is the difference between this band and the
    // stuck one, so nothing is filtered — only aged.
    uncovered: top(
      uncovered.map((row) => ({
        id: row.id,
        name: row.name,
        companyName: row.companyName,
        repName: row.repName,
        day: row.day,
        daysOverdue: lateBy(row),
        kind: row.kind,
        backOn: row.backOn as Day,
      })),
    ),
    followUps: top(
      followUps.rows
        .map((row) => ({
          id: row.id,
          name: row.name,
          companyName: row.company_name,
          repName: row.rep_name,
          repId: row.rep_id,
          day: row.day,
          kind: row.kind,
        }))
        .filter((row) => lateBy(row) > STUCK_FOLLOW_UP_WORKING_DAYS)
        .map((row) => ({
          id: row.id,
          name: row.name,
          companyName: row.companyName,
          repName: row.repName,
          day: row.day,
          daysOverdue: lateBy(row),
          kind: row.kind,
        })),
    ),
    goneQuiet: top(
      quiet.rows.map((row) => ({
        id: String(row.id),
        name: row.name,
        repName: row.rep_name,
        days: Number(row.days),
      })),
    ),
    neverContacted: top(
      never.rows.map((row) => ({
        id: row.id,
        name: row.name,
        repName: row.rep_name,
        days: Number(row.days),
      })),
    ),
    leads: top(lateLeads(ageLeads(leads, day, nonWorking))),
    duplicates: {
      rows: pairs.map((pair) => ({
        id: pair.id,
        name: pair.newer.name,
        older: pair.older.repName,
        newer: pair.newer.repName,
        waited: waitedSince(pair.raisedOn, day, nonWorking),
      })),
      total: openPairs,
    },
  };
}
