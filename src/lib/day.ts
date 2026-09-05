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
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, dispatches, projects, quotations } from "@/db/schema";
import { dispatchLabel, quotationLabel } from "@/lib/labels";

/**
 * Why a row is here, as the message key that names it — three values and no
 * fourth. It is typed rather than left a string because the screen and the
 * person strip both split this list on it: the badge colour on his day, and the
 * two figures on his floor (D78). A `string` there would have made
 * `=== "day.withCustomer"` a comparison nothing checks.
 */
export type WaitingReason = "day.sentBack" | "day.refused" | "day.withCustomer";

/** One thing that has stopped and is waiting on this person. */
export type Waiting = {
  id: string;
  /** Where pressing it goes, without the locale prefix. */
  href: string;
  label: string;
  companyName: string;
  projectName: string | null;
  /** Why it is here, as a message key the screen renders. */
  reasonKey: WaitingReason;
  /** The coordinator's or the customer's own words, when there are any. */
  reason: string | null;
};

/**
 * What is stopped and waiting on this rep.
 *
 * Three things qualify and nothing else: a quotation the coordinator sent back
 * (he must fix it and ask again), a dispatch she refused (same), and a
 * quotation the customer has been holding — issued, live revision, no answer
 * recorded. The third is not an error, which is why it is last: it is the one
 * that needs a phone call rather than a form.
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

  const [returned, refused, issued] = await Promise.all([
    db
      .select({
        id: quotations.id,
        number: quotations.number,
        revision: quotations.revision,
        companyName: companies.name,
        projectName: projects.name,
        reason: quotations.returnReason,
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .leftJoin(projects, eq(projects.id, quotations.projectId))
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
      })
      .from(dispatches)
      .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .leftJoin(projects, eq(projects.id, quotations.projectId))
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
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .leftJoin(projects, eq(projects.id, quotations.projectId))
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

  return [
    ...returned.map((row) => ({
      id: row.id,
      href: `/quotations?open=${row.id}`,
      label: quotationLabel(row.number, row.revision),
      companyName: row.companyName,
      projectName: row.projectName,
      reasonKey: "day.sentBack" as const,
      reason: row.reason,
    })),
    ...refused.map((row) => ({
      id: row.id,
      href: `/dispatches?open=${row.id}`,
      label: dispatchLabel(row.number),
      companyName: row.companyName,
      projectName: row.projectName,
      reasonKey: "day.refused" as const,
      reason: row.reason,
    })),
    ...issued.map((row) => ({
      id: row.id,
      href: `/quotations?open=${row.id}`,
      label: quotationLabel(row.number, row.revision),
      companyName: row.companyName,
      projectName: row.projectName,
      reasonKey: "day.withCustomer" as const,
      reason: null,
    })),
  ];
}
