/**
 * The daily report: the day assembled, and the sentence a person adds to it
 * (SPEC D55-D58, WORKFLOW §4).
 *
 * This is the thing that kept the Google Sheet open. A rep wrote one line a day
 * and the manager read them all in the evening, and Kladra replaced every other
 * part of that sheet and not this one.
 *
 * The rule the research settled: the system writes the WHAT, the person writes
 * the SO WHAT. Every tool that assembles a day fills in who was seen and what
 * moved; not one of them fills in why it matters or what happens next, and the
 * ones that ask a rep to retype the first half are the ones reps abandon. So
 * nothing below is ever typed by anybody — it is read out of the records that
 * already exist — and the only thing asked for is one box of free text.
 *
 * Where each figure comes from: the record's own instant where it has one. A
 * quotation knows when it was created, issued and decided; a dispatch knows when
 * it was approved; an activity knows the day it happened. Two transitions have
 * no instant on the row — a quotation being sent back, and a dispatch being
 * refused — and those two come from the audit log, which has carried every
 * transition with who and when since P4 (D54). Nothing here is a new definition
 * of anything.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { addDays, todayRiyadh, type Day } from "@/lib/dates";
import { writesReports } from "@/lib/floor";
import type { Role } from "@/lib/types";
import { isWorkingDay, type NonWorking } from "@/lib/workdays";

/** What a person on a floor did with customers on one day. */
export type FloorDay = {
  kind: "floor";
  /** Log entries written for that day, and the customers they were about. */
  logged: number;
  companies: number;
  /** The chain, from the rep's side. */
  quotationsRaised: number;
  quotationsSentBack: number;
  answersRecorded: number;
  dispatchesRaised: number;
  /**
   * Dispatches on his FLOOR that the desk approved that day — counted through
   * `companies.rep_id`, the same way the metres beside it are (S43), so the
   * count and the m² can never disagree about which dispatches they mean.
   */
  dispatchesApproved: number;
  /** The m² an approved dispatch moved on his floor that day (S41, S43). */
  sqmMoved: string;
  /** Follow-ups that fell due, and how many of those customers were logged. */
  callsDue: number;
  callsMade: number;
};

/** What the desk did that day. */
export type DeskDay = {
  kind: "desk";
  issued: number;
  sentBack: number;
  approved: number;
  refused: number;
};

export type DayWork = FloorDay | DeskDay;

/** One person's whole day, as the team screen shows it. */
export type PersonDay = {
  userId: string;
  name: string;
  role: Role;
  work: DayWork;
  /** What they wrote, or null. */
  note: string | null;
  /**
   * Why there is no note. `open` is a day that has not finished — nobody has
   * missed anything yet — and `off` is a day this person was not working, which
   * is the whole of D57: being away is not being silent, and neither is a
   * Friday. `silent` is the only one that means a report is actually missing.
   */
  state: "written" | "open" | "off" | "silent";
  /** Why the day was off, when it was. */
  off: "weekend" | "holiday" | "leave" | null;
};

export type TeamDay = {
  day: Day;
  /** True while the day has not finished. */
  open: boolean;
  /** False on a Friday, a Saturday, or a company holiday. */
  working: boolean;
  people: PersonDay[];
  /** Of the people who owed one, how many wrote. */
  written: number;
  owed: number;
};

/**
 * One person's day on the floor.
 *
 * The m² is the same arithmetic as `achievedByRep` — rounded per line, from the
 * quantity SENT rather than the quotation line's own total — narrowed to one
 * Riyadh day and one rep's companies (S41, S43, D38).
 *
 * Both tables are named outright in every correlated subquery, because a bare
 * column resolves inside the inner table and silently matches nothing
 * (rules/data.md).
 */
async function floorDay(userId: string, day: Day): Promise<FloorDay> {
  const result = await db.execute<{
    logged: number;
    companies: number;
    raised: number;
    sent_back: number;
    answers: number;
    dispatches: number;
    sqm: string;
    approved: number;
    calls_due: number;
    calls_made: number;
  }>(sql`
    with logs as (
      select count(*)::int as logged, count(distinct activities.company_id)::int as companies
        from activities
       where activities.user_id = ${userId}::uuid and activities.happened_on = ${day}::date
    ),
    raised as (
      select count(*)::int as n from quotations
       where quotations.rep_id = ${userId}::uuid
         and (quotations.created_at at time zone 'Asia/Riyadh')::date = ${day}::date
    ),
    sent_back as (
      select count(*)::int as n
        from audit_log
        join quotations on quotations.id = audit_log.record_id::uuid
       where audit_log.action = 'quotation.sendBack'
         and (audit_log.at at time zone 'Asia/Riyadh')::date = ${day}::date
         and quotations.rep_id = ${userId}::uuid
    ),
    answers as (
      select count(*)::int as n from quotations
       where quotations.rep_id = ${userId}::uuid
         and quotations.status in ('accepted', 'rejected')
         and (quotations.decided_at at time zone 'Asia/Riyadh')::date = ${day}::date
    ),
    raised_dispatches as (
      select count(*)::int as n from dispatches
       where dispatches.rep_id = ${userId}::uuid
         and (dispatches.created_at at time zone 'Asia/Riyadh')::date = ${day}::date
    ),
    moved as (
      select round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2) as sqm,
             count(distinct d.id)::int as approved
        from dispatches d
        join dispatch_items di on di.dispatch_id = d.id
        join quotation_items qi on qi.id = di.quotation_item_id
        join quotations q on q.id = d.quotation_id
        join companies c on c.id = q.company_id
       where d.status = 'approved'
         and (d.approved_at at time zone 'Asia/Riyadh')::date = ${day}::date
         and c.rep_id = ${userId}::uuid
    ),
    due as (
      select c.id as company_id from companies c
       where c.rep_id = ${userId}::uuid and c.archived_at is null
         and c.next_follow_up = ${day}::date
      union
      select p.company_id from projects p
        join companies c on c.id = p.company_id
       where c.rep_id = ${userId}::uuid and p.archived_at is null and p.lost_at is null
         and p.next_follow_up = ${day}::date
    )
    select logs.logged, logs.companies,
           raised.n as raised, sent_back.n as sent_back, answers.n as answers,
           raised_dispatches.n as dispatches, moved.approved, moved.sqm,
           (select count(*)::int from due) as calls_due,
           (select count(*)::int from due
             where exists (
               select 1 from activities a
                where a.company_id = due.company_id
                  and a.happened_on = ${day}::date
                  and a.user_id = ${userId}::uuid
             )) as calls_made
      from logs, raised, sent_back, answers, raised_dispatches, moved
  `);

  const row = result.rows[0];
  return {
    kind: "floor",
    logged: Number(row?.logged ?? 0),
    companies: Number(row?.companies ?? 0),
    quotationsRaised: Number(row?.raised ?? 0),
    quotationsSentBack: Number(row?.sent_back ?? 0),
    answersRecorded: Number(row?.answers ?? 0),
    dispatchesRaised: Number(row?.dispatches ?? 0),
    dispatchesApproved: Number(row?.approved ?? 0),
    sqmMoved: String(row?.sqm ?? "0"),
    callsDue: Number(row?.calls_due ?? 0),
    callsMade: Number(row?.calls_made ?? 0),
  };
}

/**
 * The desk's day — the desk's, not one person's.
 *
 * There is one coordinator and one queue, and the rows do not record who issued
 * a quotation or approved a dispatch: `issued_at` and `approved_at` are the
 * record, and they carry a when and not a who. So all four figures are scoped by
 * the day alone, which is consistent and true today. Two of them were filtered by
 * `audit_log.user_id` and two were not, which was neither. If a second
 * coordinator is ever hired, all four should come from the audit log, which has
 * carried the who since P4 (D54) — and that is the moment to change it, not now,
 * because a filter that can only ever match one person is a filter that hides a
 * missing column.
 *
 * Issued and approved date themselves on the row; sent back and refused leave no
 * instant on it, so those two come from the audit log either way.
 */
async function deskDay(day: Day): Promise<DeskDay> {
  const result = await db.execute<{
    issued: number;
    sent_back: number;
    approved: number;
    refused: number;
  }>(sql`
    select
      (select count(*)::int from quotations
        where (quotations.issued_at at time zone 'Asia/Riyadh')::date = ${day}::date) as issued,
      (select count(*)::int from audit_log
        where audit_log.action = 'quotation.sendBack'
          and (audit_log.at at time zone 'Asia/Riyadh')::date = ${day}::date) as sent_back,
      (select count(*)::int from dispatches
        where (dispatches.approved_at at time zone 'Asia/Riyadh')::date = ${day}::date) as approved,
      (select count(*)::int from audit_log
        where audit_log.action = 'dispatch.refuse'
          and (audit_log.at at time zone 'Asia/Riyadh')::date = ${day}::date) as refused
  `);

  const row = result.rows[0];
  return {
    kind: "desk",
    issued: Number(row?.issued ?? 0),
    sentBack: Number(row?.sent_back ?? 0),
    approved: Number(row?.approved ?? 0),
    refused: Number(row?.refused ?? 0),
  };
}

/** One person's assembled day, whichever kind of day they have. */
export async function dayWork(userId: string, role: Role, day: Day): Promise<DayWork> {
  return role === "coordinator" ? deskDay(day) : floorDay(userId, day);
}

/** Everybody's sentence for one day, by user id — one read, not one per person. */
async function reportNotes(day: Day): Promise<Map<string, string>> {
  const result = await db.execute<{ user_id: string; note: string }>(sql`
    select daily_reports.user_id, daily_reports.note
      from daily_reports
     where daily_reports.day = ${day}::date
  `);
  return new Map(result.rows.map((row) => [row.user_id, row.note]));
}

/** What this person wrote for that day, or null. */
async function reportNote(userId: string, day: Day): Promise<string | null> {
  const result = await db.execute<{ note: string }>(sql`
    select note from daily_reports
     where daily_reports.user_id = ${userId}::uuid and daily_reports.day = ${day}::date
     limit 1
  `);
  return result.rows[0]?.note ?? null;
}

/**
 * The next working day in one direction, strictly past `day`.
 *
 * One walker for both questions that ask it — what the arrows point at, and how
 * far back the write window reaches — because two of them would be two answers
 * to "when was the last working day". Capped at three weeks, which is longer
 * than any run of holidays this business has had and stops a bad row in the
 * table becoming an endless loop.
 */
function stepWorking(day: Day, by: -1 | 1, nonWorking: NonWorking[]): Day {
  let d = addDays(day, by);
  for (let i = 0; i < 21 && !isWorkingDay(d, nonWorking); i += 1) d = addDays(d, by);
  return d;
}

/**
 * A report can be written for today and for the last WORKING day before today,
 * and then it closes (D58).
 *
 * The rule was "today and yesterday" and that was wrong in Riyadh, where the
 * week ends on Thursday. A rep who closes at six on Thursday and remembers
 * something on Sunday morning is the exact case this exists for, and plain
 * yesterday shut him out of it — on a Saturday, with the app freshly seeded, not
 * one person on the floor could write anything at all. Working days close the
 * hole and keep the point: a report rewritten a week later is not a record of a
 * day, it is a reconstruction.
 */
export async function mayWriteFor(day: Day, today: Day = todayRiyadh()): Promise<boolean> {
  if (day === today) return true;
  if (day > today) return false;

  const offDays = await db.execute<{ day: Day; user_id: string | null }>(sql`
    select to_char(n.day, 'YYYY-MM-DD') as day, n.user_id
      from non_working_days n
     where n.day between ${today}::date - 21 and ${today}::date
  `);
  const nonWorking: NonWorking[] = offDays.rows.map((row) => ({
    day: row.day,
    userId: row.user_id,
  }));

  return day === stepWorking(today, -1, nonWorking);
}

/**
 * The whole team's day, in one read (D56).
 *
 * Alphabetical by name and never by how much anybody did: a screen that sorts
 * people by output is a leaderboard, and fourteen people on long cladding cycles
 * all know who is second without being shown.
 */
export async function teamDay(day: Day, today: Day = todayRiyadh()): Promise<TeamDay> {
  const open = day >= today;

  const [people, offDays] = await Promise.all([
    db.execute<{ id: string; name: string; role: Role }>(sql`
      select u.id, u.name, u.role
        from users u
       where u.active = true and u.role in ('rep', 'marketing', 'coordinator')
       order by u.name
    `),
    // The company's holidays and each person's leave, for this one day (S48).
    db.execute<{ day: Day; user_id: string | null; kind: "holiday" | "leave" }>(sql`
      select to_char(n.day, 'YYYY-MM-DD') as day, n.user_id, n.kind
        from non_working_days n
       where n.day = ${day}::date
    `),
  ]);

  const nonWorking: NonWorking[] = offDays.rows.map((row) => ({
    day: row.day,
    userId: row.user_id,
  }));
  const working = isWorkingDay(day, nonWorking);

  const notes = await reportNotes(day);

  const rows = await Promise.all(
    people.rows.map(async (person) => {
      const work = await dayWork(person.id, person.role, day);
      const note = notes.get(person.id) ?? null;

      // The same working-day rule the pace line and the stuck list already use
      // (src/lib/workdays.ts), asked for this person: a Friday is not a missed
      // day, and neither is his leave.
      const worksToday = isWorkingDay(day, nonWorking, person.id);
      const off: PersonDay["off"] = worksToday
        ? null
        : !working && offDays.rows.some((row) => row.user_id === null)
          ? "holiday"
          : offDays.rows.some((row) => row.user_id === person.id)
            ? "leave"
            : "weekend";

      const state: PersonDay["state"] = note
        ? "written"
        : !worksToday
          ? "off"
          : open
            ? "open"
            : "silent";
      return { userId: person.id, name: person.name, role: person.role, work, note, state, off };
    }),
  );

  return {
    day,
    open,
    working,
    people: rows,
    written: rows.filter((row) => row.state === "written").length,
    owed: rows.filter((row) => row.state !== "off").length,
  };
}

/**
 * The day the report screen opens on: today when today is a working day, and
 * otherwise the last one there was.
 *
 * A manager opening this on a Saturday wants Thursday, not an empty weekend, and
 * a screen that makes him press back twice to find the work is a screen he stops
 * opening.
 */
export async function latestReportDay(today: Day = todayRiyadh()): Promise<Day> {
  const offDays = await db.execute<{ day: Day; user_id: string | null }>(sql`
    select to_char(n.day, 'YYYY-MM-DD') as day, n.user_id
      from non_working_days n
     where n.day <= ${today}::date and n.day > ${today}::date - 14
  `);
  const nonWorking: NonWorking[] = offDays.rows.map((row) => ({
    day: row.day,
    userId: row.user_id,
  }));

  let day = today;
  // Two weeks is longer than any run of holidays this business has ever had, and
  // it stops a bad row in the holiday table becoming an endless loop.
  for (let i = 0; i < 14; i += 1) {
    if (isWorkingDay(day, nonWorking)) return day;
    day = addDays(day, -1);
  }
  return today;
}

/**
 * The working day either side of this one — what the two arrows go to.
 *
 * They skip the weekend and the holidays for the reason `latestReportDay` opens
 * on the last working day: a manager stepping back from Sunday wants Thursday,
 * and three presses through an empty weekend is three presses that teach him the
 * screen is slow. `next` is null on the last day there is, which is what
 * disables the arrow.
 *
 * One query for the window rather than one per step. Three weeks each way is
 * wider than any run of holidays this business has, and the walk is capped so a
 * bad row in the table cannot spin.
 */
export async function reportNeighbours(
  day: Day,
  today: Day = todayRiyadh(),
): Promise<{ previous: Day; next: Day | null }> {
  const offDays = await db.execute<{ day: Day; user_id: string | null }>(sql`
    select to_char(n.day, 'YYYY-MM-DD') as day, n.user_id
      from non_working_days n
     where n.day between ${day}::date - 21 and ${day}::date + 21
  `);
  const nonWorking: NonWorking[] = offDays.rows.map((row) => ({
    day: row.day,
    userId: row.user_id,
  }));

  const next = stepWorking(day, 1, nonWorking);
  return {
    previous: stepWorking(day, -1, nonWorking),
    next: next > today ? null : next,
  };
}

/** Whether this person owes a report at all — the sentence the screens ask. */
export function owesReport(role: Role): boolean {
  return writesReports(role);
}

/**
 * Is today's report still unwritten, for this person?
 *
 * The one question the nudge on a rep's own day asks. It is false on a day he
 * did not work and false the moment he writes, so the line appears when there is
 * something to do about it and never otherwise — which is the difference between
 * a reminder and a badge that is always lit.
 */
export async function owesToday(
  userId: string,
  role: Role,
  today: Day = todayRiyadh(),
): Promise<boolean> {
  if (!writesReports(role)) return false;

  const [note, offDays] = await Promise.all([
    reportNote(userId, today),
    db.execute<{ day: Day; user_id: string | null }>(sql`
      select to_char(n.day, 'YYYY-MM-DD') as day, n.user_id
        from non_working_days n
       where n.day = ${today}::date
    `),
  ]);
  if (note) return false;

  const nonWorking: NonWorking[] = offDays.rows.map((row) => ({
    day: row.day,
    userId: row.user_id,
  }));
  return isWorkingDay(today, nonWorking, userId);
}
