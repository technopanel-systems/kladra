/**
 * The Reports screen's reads (SPEC §3 P13, 13.8; D167).
 *
 * A report is what a person wrote: one entry per thing that happened, against
 * its customer, with what kind of thing it was and what came of it. There is no
 * other record of a day to read here — the sentence at the end of the day went
 * with P13 (D167), because it was a second place to write what the entries
 * already said.
 *
 * Two halves, and they are kept apart on purpose. What the person WROTE is read
 * from `activities` and nothing else. What Kladra RECORDED on the same day — the
 * quotations raised, the dispatches approved, the metres they moved — is read
 * from the records the work itself produced, and it is drawn in its own marked
 * lane beside the entries, never interleaved with them: the founder's sentence
 * is that the system's events are shown alongside, clearly marked, never mixed
 * in (Overrules D55 and D162's first half).
 *
 * Who reads whose is `mayOpen`: a rep, marketing and the coordinator read their
 * own reports, the manager and the admin read everyone's (S8). It is asked
 * before a query is built and narrows its WHERE, never after rows are read.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { cache } from "react";
import { and, asc, eq, inArray, isNull, lte, gte, sql, type SQL } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { activities, companies, outcomes, users, type Channel } from "@/db/schema";
import { readReports, type ActivityRow } from "@/lib/activities";
import { NotAllowed } from "@/lib/authz";
import { writtenWhere } from "@/lib/counted";
import type { Day } from "@/lib/dates";
import { mayOpen, REPORTING_ROLES, seesAllRoles, sells } from "@/lib/floor";
import { personName } from "@/lib/people";
import type { PickerOption } from "@/lib/picker-option";
import { NOTHING_RECORDED, type Recorded } from "@/lib/report-figures";
import { CREDITED_METRES } from "@/lib/sqm";
import type { Role, SessionUser } from "@/lib/types";

/** Somebody who writes reports, named in the reader's script (D68). */
export type ReportPerson = { id: string; name: string; role: Role };

/** The three things a list of reports narrows by, besides whose and when. */
export type ReportFilter = {
  companyId: string | null;
  kind: Channel | null;
  outcomeId: number | null;
};

/** One report, as the screen draws it — the row the drawers already read. */
export type ReportEntry = ActivityRow;

/**
 * How many entries one screen draws before the line under it takes over. A
 * rep's busiest month is under a hundred and fifty; the list is grouped by day,
 * and a month past this many is a month to press a day on.
 */
export const REPORT_LIST_CAP = 80;

/**
 * The people who write reports: active, in a role whose day is customer work —
 * rep, marketing, coordinator (`writesReports`, D56). Alphabetical, never by how
 * much anybody wrote: a screen sorted by output is a leaderboard.
 */
export const reportingPeople = cache(async function reportingPeople(
  locale: string,
): Promise<ReportPerson[]> {
  const rows = await db
    .select({ id: users.id, name: personName(locale), role: users.role })
    .from(users)
    .where(and(eq(users.active, true), inArray(users.role, REPORTING_ROLES)))
    .orderBy(asc(personName(locale)));
  return rows;
});

/** One person, for the heading of their reports — or null if not one of them. */
export async function reportPerson(
  user: SessionUser,
  personId: string,
): Promise<ReportPerson | null> {
  if (!mayOpen(user, personId)) throw new NotAllowed();
  const locale = await getLocale();
  const [row] = await db
    .select({ id: users.id, name: personName(locale), role: users.role })
    .from(users)
    .where(eq(users.id, personId))
    .limit(1);
  return row ?? null;
}

/** The filter as conditions on `activities`, each a bound parameter. */
function filterWhere(filter: ReportFilter): SQL[] {
  const where: SQL[] = [];
  if (filter.companyId) where.push(eq(activities.companyId, filter.companyId));
  if (filter.kind) where.push(eq(activities.channel, filter.kind));
  if (filter.outcomeId !== null) where.push(eq(activities.outcomeId, filter.outcomeId));
  return where;
}

/**
 * Whose reports this reader may see in a list: one person he may open, or —
 * for the manager and the admin, asking for nobody in particular — everyone.
 */
function whoseWhere(user: SessionUser, personId: string | null): SQL | undefined {
  if (personId === null) {
    if (!seesAllRoles(user.role)) throw new NotAllowed();
    return undefined;
  }
  if (!mayOpen(user, personId)) throw new NotAllowed();
  return eq(activities.userId, personId);
}

/**
 * The entries in a window, newest first, capped, with how many there are.
 */
export async function reportEntries(
  user: SessionUser,
  {
    personId,
    from,
    to,
    filter,
    limit = REPORT_LIST_CAP,
  }: { personId: string | null; from: Day; to: Day; filter: ReportFilter; limit?: number },
): Promise<{ rows: ReportEntry[]; total: number }> {
  const where = and(
    whoseWhere(user, personId),
    gte(activities.happenedOn, from),
    lte(activities.happenedOn, to),
    ...filterWhere(filter),
  )!;
  return readReports(user, where, limit);
}

/**
 * How many entries each person wrote on each day of a window, under the filter
 * — the calendar's figures and the week's grid (D108: a count counts the rows
 * its list shows, so it is asked of the same conditions).
 *
 * Keyed person, then day. Unfiled entries are out, as everywhere (D70).
 */
export async function reportCounts(
  user: SessionUser,
  { personId, from, to, filter }: { personId: string | null; from: Day; to: Day; filter: ReportFilter },
): Promise<Record<string, Record<Day, number>>> {
  const rows = await db
    .select({
      userId: activities.userId,
      day: sql<string>`to_char(${activities.happenedOn}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(activities)
    .where(
      and(
        // Written in the window and not taken back — the one clause the
        // builder's "reports written" is counted by too (src/lib/counted.ts).
        writtenWhere("activities", { from, to }, null),
        whoseWhere(user, personId),
        ...filterWhere(filter),
      ),
    )
    .groupBy(activities.userId, activities.happenedOn);

  const counts: Record<string, Record<Day, number>> = {};
  for (const row of rows) {
    (counts[row.userId] ??= {})[row.day] = Number(row.n);
  }
  return counts;
}

/**
 * Who wrote anything at all on a day — unfiltered, because "has written nothing
 * today" is about whether a person wrote, not about what (D57).
 */
export async function wroteOn(user: SessionUser, day: Day): Promise<Set<string>> {
  if (!seesAllRoles(user.role)) throw new NotAllowed();
  const rows = await db
    .selectDistinct({ userId: activities.userId })
    .from(activities)
    .where(and(isNull(activities.archivedAt), eq(activities.happenedOn, day)));
  return new Set(rows.map((row) => row.userId));
}

/**
 * What Kladra recorded for these people over a window, keyed `person:day`
 * (SPEC §3 P13 — the lane beside the entries).
 *
 * One statement for the whole screen rather than one per day per person: each
 * source is grouped by the person the work counts for and the Riyadh day it
 * happened on. Where a record has its own instant it is used — a quotation
 * knows when it was raised and decided, a dispatch when it was raised and
 * approved — and the one transition with no instant on the row, a quotation
 * sent back, comes from the audit log, which has carried every transition with
 * who and when since P4 (D54). Nothing here is a new definition of anything:
 * the metres are the credited metres (D148), the same arithmetic as the month.
 *
 * Narrowed to one company when the screen is: a manager reading one customer's
 * reports reads that customer's paper beside them.
 *
 * Both tables are named outright in every join condition (rules/data.md).
 */
export async function recordedFor(
  people: readonly Pick<ReportPerson, "id" | "role">[],
  from: Day,
  to: Day,
  companyId: string | null,
): Promise<Map<string, Recorded>> {
  const recorded = new Map<string, Recorded>();
  const selling = people.filter((person) => sells(person.role));
  if (selling.length === 0) return recorded;

  const ids = sql.join(
    selling.map((person) => sql`${person.id}::uuid`),
    sql`, `,
  );
  const onCompany = (column: string) =>
    companyId ? sql`and ${sql.raw(column)} = ${companyId}::uuid` : sql``;
  const dayOf = (column: string) =>
    sql.raw(`to_char((${column} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`);
  const inWindow = (column: string) =>
    sql`(${sql.raw(column)} at time zone 'Asia/Riyadh')::date between ${from}::date and ${to}::date`;

  const result = await db.execute<{
    kind: "raised" | "sentBack" | "answers" | "dispatches" | "approved";
    user_id: string;
    day: Day;
    n: number;
    sqm: string;
  }>(sql`
    with credited as (${sql.raw(CREDITED_METRES)})
    select 'raised' as kind, quotations.rep_id as user_id, ${dayOf("quotations.created_at")} as day,
           count(*)::int as n, 0::numeric as sqm
      from quotations
     where quotations.rep_id in (${ids}) and ${inWindow("quotations.created_at")}
           ${onCompany("quotations.company_id")}
     group by 2, 3
    union all
    select 'sentBack', quotations.rep_id, ${dayOf("audit_log.at")}, count(*)::int, 0::numeric
      from audit_log
      join quotations on quotations.id::text = audit_log.record_id
     where audit_log.action = 'quotation.sendBack'
       and quotations.rep_id in (${ids}) and ${inWindow("audit_log.at")}
           ${onCompany("quotations.company_id")}
     group by 2, 3
    union all
    select 'answers', quotations.rep_id, ${dayOf("quotations.decided_at")}, count(*)::int, 0::numeric
      from quotations
     where quotations.status in ('accepted', 'rejected')
       and quotations.rep_id in (${ids}) and ${inWindow("quotations.decided_at")}
           ${onCompany("quotations.company_id")}
     group by 2, 3
    union all
    select 'dispatches', dispatches.rep_id, ${dayOf("dispatches.created_at")}, count(*)::int, 0::numeric
      from dispatches
     where dispatches.rep_id in (${ids}) and ${inWindow("dispatches.created_at")}
           ${onCompany("dispatches.company_id")}
     group by 2, 3
    union all
    select 'approved', credited.user_id, ${dayOf("credited.approved_at")},
           count(distinct credited.dispatch_id)::int, round(coalesce(sum(credited.sqm), 0), 2)
      from credited
     where credited.user_id in (${ids}) and ${inWindow("credited.approved_at")}
           ${onCompany("credited.company_id")}
     group by 2, 3
  `);

  const roleOf = new Map(selling.map((person) => [person.id, person.role]));
  for (const row of result.rows) {
    const key = `${row.user_id}:${row.day}`;
    const day = recorded.get(key) ?? {
      sells: sells(roleOf.get(row.user_id) ?? "rep"),
      ...NOTHING_RECORDED,
    };
    const n = Number(row.n);
    if (row.kind === "raised") day.quotationsRaised += n;
    if (row.kind === "sentBack") day.quotationsSentBack += n;
    if (row.kind === "answers") day.answersRecorded += n;
    if (row.kind === "dispatches") day.dispatchesRaised += n;
    if (row.kind === "approved") {
      day.dispatchesApproved += n;
      day.sqmMoved = String(row.sqm);
    }
    recorded.set(key, day);
  }
  return recorded;
}

/** The lane for one person on one day — nothing recorded is a value, not an absence. */
export function recordedOn(
  recorded: ReadonlyMap<string, Recorded>,
  person: Pick<ReportPerson, "id" | "role">,
  day: Day,
): Recorded {
  return recorded.get(`${person.id}:${day}`) ?? { sells: sells(person.role), ...NOTHING_RECORDED };
}

/**
 * The customers the reader's reports are about, for the company filter.
 *
 * Only customers somebody has actually written about, and only reports the
 * reader may read: the filter narrows a list, and a customer with no report on
 * it is an option that can only ever empty the screen.
 */
export async function reportedCompanies(
  user: SessionUser,
  personId: string | null,
): Promise<PickerOption[]> {
  const rows = await db
    .selectDistinct({ id: companies.id, name: companies.name })
    .from(activities)
    .innerJoin(companies, eq(companies.id, activities.companyId))
    .where(and(isNull(activities.archivedAt), whoseWhere(user, personId)))
    .orderBy(asc(companies.name));
  return rows.map((row) => ({ value: row.id, label: row.name }));
}

/** What came of a report, in the reader's language: the admin's list, in his order (D171). */
export type OutcomeOption = { id: number; name: string; active: boolean };

export async function listOutcomes(locale: string): Promise<OutcomeOption[]> {
  const arabic = locale.startsWith("ar");
  return db
    .select({
      id: outcomes.id,
      name: arabic ? outcomes.nameAr : outcomes.nameEn,
      active: outcomes.active,
    })
    .from(outcomes)
    .orderBy(asc(outcomes.sortOrder), asc(outcomes.id));
}
