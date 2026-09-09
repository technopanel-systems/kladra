/**
 * A rep's day (SPEC §3, P8): the one screen that answers "what do I do now?".
 *
 * The research was unanimous and it matched what Faisal actually does: a rep
 * does not want a wall of cards, he wants one list in the order he should work
 * it. So this returns two things — what has come back to HIM and is stopped
 * until he acts, and who is owed a call today — and the screen puts them in
 * that order because a returned quotation is a customer already waiting.
 *
 * Nothing here is a new figure. The month is `repMonth`, the follow-ups are the
 * same `listCompanies`/`listProjects` the lists use, and the counts are
 * `followUpCounts`. A dashboard that computes its own totals is how two screens
 * start disagreeing (rules/data.md).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, dispatches, projects, quotations } from "@/db/schema";
import { dispatchLabel, quotationLabel } from "@/lib/labels";

/**
 * Why a row is here, as the message key that names it — a closed set. It is
 * typed rather than left a string because the screen and the person strip both
 * split this list on it: the badge colour on his day, and the two figures on
 * his floor (D78). A `string` there would have made `=== "day.withCustomer"` a
 * comparison nothing checks.
 *
 * P12-7 added the fourth, and adding it is what proved the type earns its keep:
 * the person strip counted "sent back or refused" as everything that was not
 * with the customer, so a lead landing on a floor would have added itself to a
 * figure captioned "waiting on the rep, not on the customer" — true of a lead,
 * and not what those two words name. The filter names its two kinds now.
 */
export type WaitingReason = "day.newLead" | "day.sentBack" | "day.refused" | "day.withCustomer";

/** One thing that has stopped and is waiting on this person. */
export type Waiting = {
  id: string;
  /** Where pressing it goes, without the locale prefix. */
  href: string;
  /** Its document number, or null for a row that has none — a lead (P12-7). */
  label: string | null;
  companyName: string;
  /** The job, or null for the one row that has none — a lead (P12-7). */
  projectName: string | null;
  /** Why it is here, as a message key the screen renders. */
  reasonKey: WaitingReason;
  /** The coordinator's or the customer's own words, when there are any. */
  reason: string | null;
  /** When it stopped, as an ISO instant: sent back, refused, or issued. */
  since: string;
};

/**
 * What is stopped and waiting on this rep.
 *
 * Four things qualify and nothing else: a lead somebody has just handed him and
 * he has not said he has (SPEC §3, P12-7), a quotation the coordinator sent
 * back (he must fix it and ask again), a dispatch she refused (same), and a
 * quotation the customer has been holding — issued, live revision, no answer
 * recorded. The last is not an error, which is why it is last: it is the one
 * that needs a phone call rather than a form.
 *
 * The lead is FIRST for the opposite reason. It is the only row here about a
 * customer nobody has spoken to yet: the other three are conversations already
 * under way, and this is a phone number somebody promised would be rung. It is
 * also the only one that arrives from another person rather than out of a chain
 * he started himself, which is why his day is where he meets it — a rep has no
 * leads screen, and a lead that only appeared in a list he does not open would
 * be a customer nobody called.
 *
 * Only the live revision, because a number quoted three times is one thing
 * waiting, not three (S34, S35).
 */
export async function waitingOnRep(repId: string): Promise<Waiting[]> {
  const live = sql`not exists (
    select 1 from quotations later
     where later.number = quotations.number
       and later.revision > quotations.revision
  )`;

  const [leads, returned, refused, issued] = await Promise.all([
    db
      .select({
        id: companies.id,
        name: companies.name,
        query: companies.leadQuery,
        since: companies.createdAt,
      })
      .from(companies)
      .where(
        and(
          eq(companies.repId, repId),
          isNull(companies.archivedAt),
          isNotNull(companies.leadFromId),
          isNull(companies.leadAcknowledgedAt),
        ),
      )
      .orderBy(asc(companies.createdAt)),

    db
      .select({
        id: quotations.id,
        number: quotations.number,
        revision: quotations.revision,
        companyName: companies.name,
        projectName: projects.name,
        reason: quotations.returnReason,
        since: quotations.updatedAt,
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .innerJoin(projects, eq(projects.id, quotations.projectId))
      .where(
        and(
          eq(companies.repId, repId),
          isNull(companies.archivedAt),
          eq(quotations.status, "returned"),
          live,
        ),
      )
      .orderBy(desc(quotations.number)),

    db
      .select({
        id: dispatches.id,
        number: dispatches.number,
        companyName: companies.name,
        projectName: projects.name,
        reason: dispatches.refuseReason,
        since: dispatches.updatedAt,
      })
      .from(dispatches)
      .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .innerJoin(projects, eq(projects.id, quotations.projectId))
      .where(
        and(
          eq(companies.repId, repId),
          isNull(companies.archivedAt),
          eq(dispatches.status, "refused"),
        ),
      )
      .orderBy(desc(dispatches.number)),

    db
      .select({
        id: quotations.id,
        number: quotations.number,
        revision: quotations.revision,
        companyName: companies.name,
        projectName: projects.name,
        since: quotations.issuedAt,
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .innerJoin(projects, eq(projects.id, quotations.projectId))
      .where(
        and(
          eq(companies.repId, repId),
          isNull(companies.archivedAt),
          eq(quotations.status, "issued"),
          live,
        ),
      )
      .orderBy(desc(quotations.number)),
  ]);

  const rows: Waiting[] = [
    ...leads.map((row) => ({
      id: row.id,
      // The lead IS the company, so pressing it opens the customer (P12-7).
      href: `/companies?open=${row.id}`,
      // A lead has no document number, and the company's name is the heading of
      // its own card rather than a code above it.
      label: null,
      companyName: row.name,
      projectName: null,
      reasonKey: "day.newLead" as const,
      // What the customer asked for, in the finder's words — the same slot the
      // coordinator's reason uses, and the same reason for it: a rep should not
      // have to open a row to know whether this is a fence or a tower.
      reason: row.query,
      since: row.since.toISOString(),
    })),
    ...returned.map((row) => ({
      id: row.id,
      href: `/quotations?open=${row.id}`,
      label: quotationLabel(row.number, row.revision),
      companyName: row.companyName,
      projectName: row.projectName,
      reasonKey: "day.sentBack" as const,
      reason: row.reason,
      since: row.since.toISOString(),
    })),
    ...refused.map((row) => ({
      id: row.id,
      href: `/dispatches?open=${row.id}`,
      label: dispatchLabel(row.number),
      companyName: row.companyName,
      projectName: row.projectName,
      reasonKey: "day.refused" as const,
      reason: row.reason,
      since: row.since.toISOString(),
    })),
    ...issued.map((row) => ({
      id: row.id,
      href: `/quotations?open=${row.id}`,
      label: quotationLabel(row.number, row.revision),
      companyName: row.companyName,
      projectName: row.projectName,
      reasonKey: "day.withCustomer" as const,
      reason: null,
      // A CHECK on the table says issued_at is set exactly when the status is
      // issued, so this is never null here; the fallback keeps the type honest.
      since: (row.since ?? new Date(0)).toISOString(),
    })),
  ];

  // Kind first, then longest waiting (P11E). The screen draws the top of this
  // list and says how many it left out (D83), so the order IS the list — and
  // sorted by age alone, a quotation the customer had held for thirty days sat
  // above yesterday's send-back that had the coordinator blocked. Stopped work
  // comes first: sent back, then refused, then the ones out in the world; the
  // oldest of each kind first within it, which is the one that most needs him.
  return rows.sort(
    (a, b) => KIND_RANK[a.reasonKey] - KIND_RANK[b.reasonKey] || a.since.localeCompare(b.since),
  );
}

/** The order of the kinds on the day: what waits on HIM before what waits on a customer. */
const KIND_RANK: Record<WaitingReason, number> = {
  "day.newLead": 0,
  "day.sentBack": 1,
  "day.refused": 2,
  "day.withCustomer": 3,
};

/** How many of each kind — the heading's doors (P11E). */
export type WaitingCounts = Record<WaitingKindName, number>;

/** The kinds by the name the counts use, derived from the keys themselves. */
export type WaitingKindName = WaitingReason extends `day.${infer Name}` ? Name : never;

/**
 * Counted by looking the kind up, not by an `if` chain ending in `else`.
 *
 * The chain's last branch was `else counts.withCustomer += 1`, which is the
 * shape that answers wrongly rather than failing when a fifth kind arrives: a
 * lead would have been counted as a quotation the customer was holding, on a
 * pill that is a door to a list it is not on.
 */
export function waitingCounts(rows: readonly Waiting[]): WaitingCounts {
  const counts = { newLead: 0, sentBack: 0, refused: 0, withCustomer: 0 };
  for (const row of rows) counts[row.reasonKey.slice("day.".length) as WaitingKindName] += 1;
  return counts;
}
