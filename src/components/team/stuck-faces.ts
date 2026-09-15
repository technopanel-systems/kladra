import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { companies, duplicateFlags, projects, quotations } from "@/db/schema";
import type { Stuck } from "@/lib/team";

/**
 * Whose faces a stuck row wears: the company it is about, and the people its
 * second line names (DESIGN §1b, P13-G6 S12.7).
 *
 * A face is hashed from the record's own id — one company, one colour, one
 * person, on every screen — and the stuck list names both only in words: a
 * request's id is the paper's, a project follow-up's the project's, a pair's the
 * flag's, and the person is a name. So each row's company and the person holding
 * it are read here, by the row's own key, through the same joins the list read
 * them through (`companies.rep_id`, as `src/lib/team.ts` does for every group),
 * and nothing else is: no status, no age, no order. Whether a row is stuck and
 * what it says stay `stuckList`'s alone (rules/data.md).
 *
 * A pair names two people, oldest record first, as `listOpenDuplicates` orders
 * them — the earlier Riyadh day is the older record, and on the same day the
 * flag's own record is.
 *
 * A bridge, and named as one: when the stuck rows carry these ids themselves,
 * this file goes.
 */
export type StuckFace = { companyId: string; people: string[] };

export async function stuckFaces(stuck: Stuck): Promise<Map<string, StuckFace>> {
  const companyIds = [
    ...stuck.leads.rows.map((row) => row.id),
    ...stuck.goneQuiet.rows.map((row) => row.id),
    ...stuck.neverContacted.rows.map((row) => row.id),
    ...[...stuck.followUps.rows, ...stuck.uncovered.rows]
      .filter((row) => row.kind === "company")
      .map((row) => row.id),
  ];
  const projectIds = [...stuck.followUps.rows, ...stuck.uncovered.rows]
    .filter((row) => row.kind === "project")
    .map((row) => row.id);
  const quotationIds = stuck.requests.rows.map((row) => row.id);
  const flagIds = stuck.duplicates.rows.map((row) => row.id);

  const sideA = alias(companies, "side_a");
  const sideB = alias(companies, "side_b");
  const dayOf = (createdAt: typeof sideA.createdAt | typeof sideB.createdAt) =>
    sql`(${createdAt} at time zone 'Asia/Riyadh')::date`;

  const [ofCompanies, ofProjects, ofQuotations, ofPairs] = await Promise.all([
    companyIds.length > 0
      ? db
          .select({ id: companies.id, companyId: companies.id, repId: companies.repId })
          .from(companies)
          .where(inArray(companies.id, companyIds))
      : [],
    projectIds.length > 0
      ? db
          .select({ id: projects.id, companyId: companies.id, repId: companies.repId })
          .from(projects)
          .innerJoin(companies, eq(companies.id, projects.companyId))
          .where(inArray(projects.id, projectIds))
      : [],
    quotationIds.length > 0
      ? db
          .select({ id: quotations.id, companyId: companies.id, repId: companies.repId })
          .from(quotations)
          .innerJoin(companies, eq(companies.id, quotations.companyId))
          .where(inArray(quotations.id, quotationIds))
      : [],
    flagIds.length > 0
      ? db
          .select({
            id: duplicateFlags.id,
            aId: sideA.id,
            aRepId: sideA.repId,
            bId: sideB.id,
            bRepId: sideB.repId,
            aFirst: sql<boolean>`${dayOf(sideA.createdAt)} <= ${dayOf(sideB.createdAt)}`,
          })
          .from(duplicateFlags)
          .innerJoin(sideA, eq(sideA.id, duplicateFlags.companyId))
          .innerJoin(sideB, eq(sideB.id, duplicateFlags.otherId))
          .where(inArray(duplicateFlags.id, flagIds))
      : [],
  ]);

  const faces = new Map<string, StuckFace>();
  for (const row of [...ofCompanies, ...ofProjects, ...ofQuotations]) {
    faces.set(row.id, { companyId: row.companyId, people: [row.repId] });
  }
  for (const pair of ofPairs) {
    // The row names the record that arrived later, and its two holders in age
    // order (src/lib/duplicates.ts).
    faces.set(
      pair.id,
      pair.aFirst
        ? { companyId: pair.bId, people: [pair.aRepId, pair.bRepId] }
        : { companyId: pair.aId, people: [pair.bRepId, pair.aRepId] },
    );
  }
  return faces;
}
