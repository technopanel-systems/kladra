import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatches, projects, quotations } from "@/db/schema";
import type { Waiting } from "@/lib/day";

/**
 * What a waiting row needs to draw beyond what it says: the company it is about,
 * so the row can wear that company's face (DESIGN §1b, P13-G6 S12.6), and
 * whether a report may be filed against its paper.
 *
 * A face is hashed from the record's own id — one company, one colour, on every
 * screen — and `Waiting` names the company only in words: a lead's id is the
 * company's, but a returned quotation's and a refused dispatch's are the paper's.
 * So the papers' companies are read here, by the papers' own keys, and nothing
 * else is: no status, no floor, no order. What the row says and whether it is on
 * the day is still `waitingOnRep`'s alone (rules/data.md).
 *
 * A paper on a job that was marked lost or archived takes no more reports (S20),
 * and the report action refuses one. So such a row's Add report opens on the
 * company alone rather than on a paper the form would then refuse (DESIGN §5:
 * what the action will refuse, the screen does not offer).
 *
 * A bridge, and named as one: when `Waiting` carries these itself, this file goes.
 */
export type WaitingRowFacts = Waiting & {
  companyId: string;
  /** Whether Add report may start on this row's paper. */
  paperTakesReports: boolean;
};

export async function withFaces(rows: Waiting[]): Promise<WaitingRowFacts[]> {
  const quotationIds = rows
    .filter((row) => row.reasonKey === "day.sentBack" || row.reasonKey === "day.withCustomer")
    .map((row) => row.id);
  const dispatchIds = rows.filter((row) => row.reasonKey === "day.refused").map((row) => row.id);

  // A dispatch may be direct, with no job at all (SPEC §3 P13): nothing to be lost.
  const live = sql<boolean>`(${projects.id} is null or (${projects.lostAt} is null and ${projects.archivedAt} is null))`;

  const [ofQuotations, ofDispatches] = await Promise.all([
    quotationIds.length > 0
      ? db
          .select({ id: quotations.id, companyId: quotations.companyId, live })
          .from(quotations)
          .leftJoin(projects, eq(projects.id, quotations.projectId))
          .where(inArray(quotations.id, quotationIds))
      : [],
    dispatchIds.length > 0
      ? db
          .select({ id: dispatches.id, companyId: dispatches.companyId, live })
          .from(dispatches)
          .leftJoin(projects, eq(projects.id, dispatches.projectId))
          .where(inArray(dispatches.id, dispatchIds))
      : [],
  ]);

  const papers = new Map<string, { companyId: string; live: boolean }>();
  for (const paper of [...ofQuotations, ...ofDispatches]) {
    papers.set(paper.id, { companyId: paper.companyId, live: Boolean(paper.live) });
  }

  // A lead IS its company (P12-7) and has no paper. A paper whose company could
  // not be read has gone between the two reads; it keeps its own id rather than
  // dropping a row, and offers no paper to report on.
  return rows.map((row) => {
    if (row.reasonKey === "day.newLead") {
      return { ...row, companyId: row.id, paperTakesReports: false };
    }
    const paper = papers.get(row.id);
    return { ...row, companyId: paper?.companyId ?? row.id, paperTakesReports: paper?.live ?? false };
  });
}
