/**
 * Leads: what marketing brings in, and what happens to it (SPEC §3, P12-7, P13).
 *
 * The founder's sentences are "Marketing does not use the Add company form.
 * Marketing has its own module for bringing in a lead, and creating one there
 * IS an assignment" (P12), and "The rep receives it apart from his own
 * companies, newest first, highlighted until he acknowledges … after two days
 * unacknowledged it shows for the manager. The manager's leads view assigns and
 * reassigns. Marketing sees what became of each lead it passed: acknowledged,
 * contacted, quoted, won" (P13). Two things follow and they decide this file.
 *
 * **A lead is a company.** There is no second table and nothing to convert. The
 * row lands on the chosen person's floor with his id on it, and everything the
 * app already does to a company — the log, the follow-up date, a project, a
 * quotation — works on it from the first second. A separate `leads` table would
 * have had to reinvent all of that, or make somebody press a button to turn one
 * thing into the other: a step the founder did not ask for and nobody would
 * remember to take.
 *
 * **What makes it a lead is who found it.** `lead_from_id` is the person who
 * filed it and gave it away, `lead_query` is what the customer asked for in
 * that person's own words, and `lead_acknowledged_at` is the receiver saying he
 * has it. Three columns on `companies`. What became of it is NOT a fourth: it is
 * read from the company's own records every time it is asked (`LEAD_STAGE`), so
 * nobody types it and nothing can leave it behind.
 *
 * Late is the same two working days the coordinator's desk and the manager's
 * stuck list already use. One figure, one definition (D59): a lead nobody has
 * picked up in two working days is exactly as stuck as a quotation nobody has
 * priced, and calling one of them late at a different age would put two clocks
 * on the manager's screen, which is the defect D141 was.
 */
import "server-only";

import { and, desc, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { cities, companies, users } from "@/db/schema";
import type { LeadQuery } from "@/components/leads/lead-view";
import { riyadhDay, type Day } from "@/lib/dates";
import { PRICED, STANDING } from "@/lib/project-stage";
import { seesAllRoles } from "@/lib/floor";
import { personNameOf } from "@/lib/people";
import type { SessionUser } from "@/lib/types";
import { LATE_AFTER_WORKING_DAYS, waitedSince, type Waited } from "@/lib/waiting";
import type { NonWorking } from "@/lib/workdays";

/** More than this many working days unacknowledged and somebody should say so. */
export const LEAD_LATE_WORKING_DAYS = LATE_AFTER_WORKING_DAYS;

/**
 * How far a lead has got, furthest first in the order a sale goes (SPEC §3 P13).
 *
 * `waiting` is the one the founder did not name because it is the absence of
 * the other four: given, and nobody has said he has it.
 */
export const LEAD_STAGES = ["waiting", "acknowledged", "contacted", "quoted", "won"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/**
 * What became of a lead, derived in SQL from the company's own records (D182).
 *
 * First the one fact that outranks the rest, then the furthest of four, each
 * asked of the table that holds it:
 *
 * - **waiting** — nobody has said he has it. Whatever else is on the company —
 *   a paper, a load — the question marketing and the manager are asking of this
 *   row is still "has anybody picked it up?", and a row badged Quoted under the
 *   Not acknowledged chip, with no age beside it, answers neither.
 * - **won** — the customer has bought: a load to the company the desk approved,
 *   on a paper or direct (S41: approved is the event that counts). On the
 *   projects board such a job ordinarily reads Dispatching or Won, and the two
 *   words part on purpose: the board asks where the job has got to, a lead asks
 *   whether the customer bought. An accepted paper with nothing gone out is a
 *   yes nobody has loaded yet: Quoted.
 * - **quoted** — a priced paper stands on the company: the board's own "priced
 *   standing paper" (`STANDING` and `PRICED` from src/lib/project-stage.ts, the
 *   one definition, asked of the company instead of the job). A request still
 *   on the desk is not a quote; a withdrawn or rejected one stands for nothing.
 * - **contacted** — a report written on it since it was acknowledged (S4's
 *   entries, unfiled ones excluded, D70). Before that day it was not his.
 * - **acknowledged** — the column itself.
 *
 * Every correlated reference names its table outright (`companies.id`, never an
 * interpolated column), because a bare name inside a subquery resolves to the
 * inner table and the `exists` is then silently false for ever (rules/data.md).
 * The outer query must select FROM `companies` unaliased, which every reader in
 * this file does.
 */
export const LEAD_STAGE: SQL<LeadStage> = sql<LeadStage>`(case
  when companies.lead_acknowledged_at is null then 'waiting'
  when exists (
         select 1 from dispatches won_d
          where won_d.company_id = companies.id and won_d.status = 'approved'
       )
    then 'won'
  when exists (
         select 1 from quotations q
          where q.company_id = companies.id
            and ${sql.raw(STANDING)}
            and ${sql.raw(PRICED)}
       )
    then 'quoted'
  when exists (
         select 1 from activities contact_a
          where contact_a.company_id = companies.id
            and contact_a.archived_at is null
            and contact_a.happened_on
                >= (companies.lead_acknowledged_at at time zone 'Asia/Riyadh')::date
       )
    then 'contacted'
  else 'acknowledged'
end)`;

/**
 * When the lead reached the person holding it now: the day it was filed, or the
 * day the manager last gave it to somebody else (SPEC §3 P13).
 *
 * A reassignment is a lead ARRIVING on a floor, and the two working days a
 * holder has before he is late start when it reaches him, not when it reached
 * the man before him — otherwise the manager's fix for a stuck lead would land
 * it on the next rep already red, and it would stay on the stuck list it was
 * moved to clear. Read from the act itself, the audit row `reassignLeadAction`
 * writes, because a figure about an event is counted from the event
 * (rules/data.md); there is no column for it and nothing to keep in step.
 *
 * Exported since P14 14.10b: the leads file carries this day in its `passed`
 * column, and a second `coalesce` written beside it in the builder would be the
 * copy rules/data.md forbids — right on the day it was typed and wrong the
 * first time the manager moves a lead.
 */
export const GIVEN_AT = sql`coalesce((
  select max(given_a.at) from audit_log given_a
   where given_a.record_type = 'company'
     and given_a.record_id = companies.id::text
     and given_a.action = 'lead.reassign'
), companies.created_at)`;

export type Lead = {
  /** The company's id: pressing a lead opens the customer it already is. */
  id: string;
  name: string;
  /** What the customer asked for — the reason this row exists. */
  query: string;
  /** Who found it, and who is working it. Named in the reader's script (D68). */
  fromId: string;
  fromName: string;
  repId: string;
  repName: string;
  /** The Riyadh day it reached the person holding it now (`GIVEN_AT`), as text. */
  givenOn: Day;
  /** The Riyadh day it was picked up, or null while nobody has said so. */
  acknowledgedOn: Day | null;
  /** The furthest it has got, read from its own records (`LEAD_STAGE`). */
  stage: LeadStage;
  city: string;
};

/** A lead with the answer to "how long has this been sitting?" beside it. */
export type LeadWithWait = Lead & { waited: Waited | null };

/**
 * Two aliases of one table, because a lead names two people: the one who found
 * it and the one working it. Aliased through Drizzle rather than written into a
 * raw `from`, so the join condition and the name expression cannot drift apart.
 */
const finder = alias(users, "finder");
const holder = alias(users, "holder");

/**
 * One shape for every read below.
 *
 * They differ only in their WHERE clause and their order — mine, his,
 * everybody's — and hand-written copies of a four-table join is how one of them
 * quietly stops naming people in the reader's script (D68), or stops saying what
 * became of the lead.
 */
function leadQuery(locale: string) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      query: companies.leadQuery,
      fromId: companies.leadFromId,
      fromName: personNameOf("finder", locale),
      repId: companies.repId,
      repName: personNameOf("holder", locale),
      givenOn: riyadhDay(GIVEN_AT),
      acknowledgedOn: riyadhDay(sql`companies.lead_acknowledged_at`),
      stage: LEAD_STAGE,
      cityName: locale.startsWith("ar") ? cities.nameAr : cities.nameEn,
      cityText: companies.cityText,
    })
    .from(companies)
    .innerJoin(finder, eq(finder.id, companies.leadFromId))
    .innerJoin(holder, eq(holder.id, companies.repId))
    .leftJoin(cities, eq(cities.id, companies.cityId));
}

/** Every row that is a lead at all, and still on the floor. */
const IS_A_LEAD = and(isNotNull(companies.leadFromId), isNull(companies.archivedAt));

/**
 * Which leads this reader may see, narrowed by the screen's two filters — one
 * WHERE for the list and its count, so the tail under a capped list counts the
 * rows the list is drawn from (D80).
 *
 * Marketing reads the ones it brought in; a manager and an admin read all of
 * them, which is the rule every other list in this app follows (S8).
 */
function leadsWhere(user: SessionUser, filters: LeadQuery): SQL | undefined {
  return and(
    IS_A_LEAD,
    seesAllRoles(user.role) ? undefined : eq(companies.leadFromId, user.id),
    filters.with ? eq(companies.repId, filters.with) : undefined,
    filters.state === "waiting"
      ? isNull(companies.leadAcknowledgedAt)
      : filters.state === "acknowledged"
        ? isNotNull(companies.leadAcknowledgedAt)
        : undefined,
  );
}

/**
 * The same narrowing, for the file this screen hands over (P14 14.10b).
 *
 * A file is the screen it came from, narrowed the way that screen is narrowed,
 * and src/lib/export/leads.ts keeps that promise by asking this rather than
 * writing the same WHERE a second time — the drift trap rules/data.md names for
 * figures, one step out.
 */
export function narrowLeads(user: SessionUser, filters: LeadQuery): SQL | undefined {
  return leadsWhere(user, filters);
}

/**
 * Every lead this person may read, narrowed and capped — in SQL, before the
 * limit, stage included (rules/data.md).
 *
 * Unacknowledged first, because that is the half anybody can act on, and oldest
 * first inside it: a lead that has sat three days is the row this screen exists
 * to surface. The acknowledged half runs newest first, so a cap bites on last
 * spring's customers and not on this week's.
 */
export async function listLeads(
  user: SessionUser,
  filters: LeadQuery,
  limit: number,
): Promise<Lead[]> {
  const locale = await getLocale();
  const rows = await leadQuery(locale)
    .where(leadsWhere(user, filters))
    .orderBy(
      sql`(companies.lead_acknowledged_at is not null)`,
      sql`case when companies.lead_acknowledged_at is null then ${GIVEN_AT} end asc`,
      desc(companies.createdAt),
    )
    .limit(limit);
  return rows.map(toLead);
}

/** How many there are in all, for the tail under a capped list (D80). */
export async function countLeads(user: SessionUser, filters: LeadQuery): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companies)
    .where(leadsWhere(user, filters));
  return Number(row?.n ?? 0);
}

/**
 * The leads given to one person and not yet picked up, newest first.
 *
 * The band above his companies reads this (SPEC §3 P13: "the rep receives it
 * apart from his own companies, newest first, highlighted until he
 * acknowledges"). Newest first there and oldest first on the manager's view,
 * because the two readers are asking different things: the rep is asking what
 * has just arrived, and the manager is asking what has been sitting.
 */
export async function leadsWaitingFor(repId: string): Promise<Lead[]> {
  const locale = await getLocale();
  const rows = await leadQuery(locale)
    .where(and(IS_A_LEAD, eq(companies.repId, repId), isNull(companies.leadAcknowledgedAt)))
    .orderBy(sql`${GIVEN_AT} desc`);
  return rows.map(toLead);
}

/**
 * Every lead nobody has picked up, oldest first, for the manager's stuck list.
 *
 * Read whole and aged in TypeScript rather than filtered in SQL, for the reason
 * every other row on that screen is: working days are `@/lib/workdays`'s
 * business, and a second copy of that arithmetic in a `case` expression is how
 * a rep back from Eid gets told he is late (D141).
 */
export async function unacknowledgedLeads(): Promise<Lead[]> {
  const locale = await getLocale();
  const rows = await leadQuery(locale)
    .where(and(IS_A_LEAD, isNull(companies.leadAcknowledgedAt)))
    .orderBy(GIVEN_AT);
  return rows.map(toLead);
}

/**
 * The same rows with their age on them.
 *
 * `waited` is null on a lead that has been acknowledged, because a question
 * somebody has answered has no age worth printing.
 */
export function ageLeads(leads: Lead[], today: Day, nonWorking: NonWorking[]): LeadWithWait[] {
  return leads.map((lead) => ({
    ...lead,
    waited: lead.acknowledgedOn ? null : waitedSince(lead.givenOn, today, nonWorking),
  }));
}

/** Only the ones that have been sitting too long (D14's two working days). */
export function lateLeads(leads: LeadWithWait[]): LeadWithWait[] {
  return leads.filter((lead) => lead.waited?.late);
}

type Row = {
  id: string;
  name: string;
  query: string | null;
  fromId: string | null;
  fromName: string;
  repId: string;
  repName: string;
  givenOn: string | null;
  acknowledgedOn: string | null;
  stage: string;
  cityName: string | null;
  cityText: string | null;
};

function toLead(row: Row): Lead {
  return {
    id: row.id,
    name: row.name,
    // The check constraint says a lead always has one; the fallbacks are for a
    // reader that does not know the constraint exists.
    query: row.query ?? "",
    fromId: row.fromId ?? "",
    fromName: row.fromName,
    repId: row.repId,
    repName: row.repName,
    givenOn: (row.givenOn ?? "") as Day,
    acknowledgedOn: (row.acknowledgedOn ?? null) as Day | null,
    // The `case` above can only produce a member; the fallback keeps the type
    // honest for a reader that does not know that.
    stage: LEAD_STAGES.includes(row.stage as LeadStage) ? (row.stage as LeadStage) : "waiting",
    city: row.cityName ?? row.cityText ?? "",
  };
}
