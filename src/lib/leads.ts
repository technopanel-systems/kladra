/**
 * Leads: what marketing brings in, and what happens to it (SPEC §3, P12-7).
 *
 * The founder's sentence is "Marketing does not use the Add company form.
 * Marketing has its own module for bringing in a lead, and creating one there
 * IS an assignment: it goes to a chosen rep, or to a member of the marketing
 * team." Two things follow and they decide this whole file.
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
 * has it. Three columns on `companies`, and the two paths stay visibly separate
 * where the founder asked for it — on the screens, which is where somebody
 * could confuse "my company" with "a lead I was given".
 *
 * Late is the same two working days the coordinator's desk and the manager's
 * stuck list already use. One figure, one definition (D59): a lead nobody has
 * picked up in two working days is exactly as stuck as a quotation nobody has
 * priced, and calling one of them late at a different age would put two clocks
 * on the manager's screen, which is the defect D141 was.
 */
import "server-only";

import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { cities, companies, users } from "@/db/schema";
import { riyadhDay, type Day } from "@/lib/dates";
import { seesAllRoles } from "@/lib/floor";
import { personNameOf } from "@/lib/people";
import type { SessionUser } from "@/lib/types";
import { LATE_AFTER_WORKING_DAYS, waitedSince, type Waited } from "@/lib/waiting";
import type { NonWorking } from "@/lib/workdays";

/** More than this many working days unacknowledged and somebody should say so. */
export const LEAD_LATE_WORKING_DAYS = LATE_AFTER_WORKING_DAYS;

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
  /** The Riyadh day it was filed, as text (rules/data.md). */
  givenOn: Day;
  /** The Riyadh day it was picked up, or null while nobody has said so. */
  acknowledgedOn: Day | null;
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
 * One shape for the three reads below.
 *
 * They differ only in their WHERE clause — mine, his, everybody's — and three
 * hand-written copies of a five-table join is how one of them quietly stops
 * naming people in the reader's script (D68).
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
      givenOn: riyadhDay(sql`companies.created_at`),
      acknowledgedOn: riyadhDay(sql`companies.lead_acknowledged_at`),
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
 * Every lead this person may read.
 *
 * Marketing reads the ones it brought in; a manager and an admin read all of
 * them, which is the rule every other list in this app follows (S8). A rep has
 * no leads screen at all — one given to him is work waiting on his day, not a
 * list to browse.
 *
 * Unacknowledged first, because that is the half anybody can act on, and oldest
 * first inside each half: a lead that has sat three days is the row this screen
 * exists to surface, and a list newest-first hides it under this morning's.
 */
export async function listLeads(user: SessionUser, limit: number): Promise<Lead[]> {
  const locale = await getLocale();
  const mine = seesAllRoles(user.role) ? undefined : eq(companies.leadFromId, user.id);
  const rows = await leadQuery(locale)
    .where(and(IS_A_LEAD, mine))
    .orderBy(sql`(${companies.leadAcknowledgedAt} is not null)`, asc(companies.createdAt))
    .limit(limit);
  return rows.map(toLead);
}

/** How many there are in all, for the tail under a capped list (D80). */
export async function countLeads(user: SessionUser): Promise<number> {
  const mine = seesAllRoles(user.role) ? undefined : eq(companies.leadFromId, user.id);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(companies)
    .where(and(IS_A_LEAD, mine));
  return Number(row?.n ?? 0);
}

/**
 * The leads given to one person and not yet picked up.
 *
 * His day reads this: a customer somebody else found and handed him is work
 * waiting on him in exactly the sense the rest of that list means, and it is the
 * only item on it that arrives from another person rather than from a chain he
 * started himself.
 */
export async function leadsWaitingFor(repId: string): Promise<Lead[]> {
  const locale = await getLocale();
  const rows = await leadQuery(locale)
    .where(and(IS_A_LEAD, eq(companies.repId, repId), isNull(companies.leadAcknowledgedAt)))
    .orderBy(asc(companies.createdAt));
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
    .orderBy(asc(companies.createdAt));
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
    city: row.cityName ?? row.cityText ?? "",
  };
}
