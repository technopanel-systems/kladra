import "server-only";

import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import {
  companies,
  companyCategories,
  dispatchItems,
  dispatches,
  quotationItems,
  quotations,
} from "@/db/schema";
import type { Day } from "@/lib/dates";
import { sumSqm } from "@/lib/sqm";

/**
 * The proportion questions, over a window (SPEC §3, D152).
 *
 * Everything here is derived from work somebody already did — nobody types a
 * figure on this tab. Each reader takes the same two arguments and no others:
 * the first Riyadh day of the window, and a rep or the whole company. One shape
 * for all of them, so the tab cannot end up with one card measuring a quarter
 * while the one beside it measures a month.
 *
 * The window is always "since `from`, up to and including today". A window that
 * ended yesterday would hide a dispatch approved this morning, and the first
 * thing anybody asks of a figure is whether it is up to date.
 */

/** Approved metres in the window, and which kind of customer they went to. */
export type SegmentShare = {
  /** The category's own id, so a row keeps its identity across a re-sort. */
  id: number;
  name: string;
  sqm: string;
};

/** One rep's work, or the whole company's when the id is null. */
function raisedBy(repId: string | null): SQL | undefined {
  return repId ? eq(dispatches.repId, repId) : undefined;
}

/**
 * Where the window's metres went, by customer segment, largest first (D152).
 *
 * Segment is the company category (D2) — the only classification of a customer
 * this business records. The brief named contractor, station and management;
 * those are three of the ten, and a second grouping beside the one the admin
 * already edits would be a second answer to one question (rules/data.md).
 *
 * Attributed by the rep who RAISED the dispatch, exactly as achieved metres are
 * (D86): a hand-over moves the customer and his open work, never the metres
 * already approved in somebody's month. The two figures therefore add up — the
 * segments of a rep's window sum to what his month card says he moved, and that
 * is the property that makes this worth drawing.
 */
export async function metresBySegment(from: Day, repId: string | null): Promise<SegmentShare[]> {
  const ar = (await getLocale()).startsWith("ar");
  const name = ar ? companyCategories.nameAr : companyCategories.nameEn;

  const rows = await db
    .select({ id: companyCategories.id, name, sqm: sumSqm })
    .from(dispatches)
    .innerJoin(dispatchItems, eq(dispatchItems.dispatchId, dispatches.id))
    .innerJoin(quotationItems, eq(quotationItems.id, dispatchItems.quotationItemId))
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(companyCategories, eq(companyCategories.id, companies.categoryId))
    .where(
      and(
        eq(dispatches.status, "approved"),
        // The approval is the event that moves metres (S41), read as a Riyadh
        // day in the shape the hooks allow (rules/data.md, H6/H7).
        sql`(dispatches.approved_at at time zone 'Asia/Riyadh')::date >= ${from}::date`,
        raisedBy(repId),
      ),
    )
    .groupBy(companyCategories.id, name)
    .orderBy(desc(sumSqm));

  return rows.map((row) => ({ id: row.id, name: row.name, sqm: String(row.sqm ?? "0") }));
}

/**
 * How the chain narrows: how many of the window's projects were quoted, and how
 * many of its quotations went out.
 *
 * Both rows are a COHORT, not a rate. Written the obvious way first — projects
 * raised in the window against quotations raised in the window — the two halves
 * were about different rows: a quotation raised this month against a project
 * started in March counted in the numerator and not in the denominator, so
 * "11 of 9" was a possible reading, and a bar longer than its track. Each row
 * now starts from a population and asks what became of it: of the projects
 * started since `from`, how many have a quotation today; of the quotations
 * raised since `from`, how many have a dispatch. That is the same question the
 * chain card asks of one population, one step at a time (D62), and it is the
 * only reading where the fraction and its bar mean anything.
 *
 * What became of them is asked WITHOUT the window: a project started in the
 * window can only be quoted after it started, and a quotation of last week
 * answered this morning has still been answered. A second window on the answer
 * would count a project as unquoted because the quotation came a day after an
 * arbitrary line.
 *
 * The numerator does not ask WHOSE the quotation is. The cohort is his projects;
 * a sharer quoting one of them is his work moving on, not somebody else's row
 * (D147).
 */
export type ChainRatios = {
  projects: number;
  quotations: number;
  quotedProjects: number;
  dispatches: number;
  dispatchedQuotations: number;
};

export async function chainRatios(from: Day, repId: string | null): Promise<ChainRatios> {
  /*
   * The rep is bound with its cast written at every site, twice per clause,
   * rather than built once into a fragment. A `null` interpolated bare reaches
   * Postgres as a parameter of no type at all — `($2 is null or rep_id = $3)`
   * — and the whole statement dies with "could not determine data type",
   * which is the untyped-parameter trap in .claude/rules/data.md and takes the
   * screen down with it. It only happens on the branch where nobody is
   * picked, which is exactly the branch the manager's own screen opens on.
   */
  const result = await db.execute<{
    projects: number;
    quotations: number;
    quoted_projects: number;
    dispatches: number;
    dispatched_quotations: number;
  }>(sql`
    with p as (
      select pp.id
        from projects pp
        join companies c on c.id = pp.company_id
       where (pp.created_at at time zone 'Asia/Riyadh')::date >= ${from}::date
         and c.archived_at is null
         and pp.archived_at is null
         and (${repId}::uuid is null or pp.rep_id = ${repId}::uuid)
    ),
    q as (
      select qq.id
        from quotations qq
        join companies c on c.id = qq.company_id
       where (qq.created_at at time zone 'Asia/Riyadh')::date >= ${from}::date
         and c.archived_at is null
         and (${repId}::uuid is null or qq.rep_id = ${repId}::uuid)
    )
    select
      (select count(*)::int from p) as projects,
      (select count(*)::int from p
        where exists (select 1 from quotations qq where qq.project_id = p.id)) as quoted_projects,
      (select count(*)::int from q) as quotations,
      (select count(*)::int from q
        where exists (select 1 from dispatches dd where dd.quotation_id = q.id))
        as dispatched_quotations,
      -- The raw material, for the sentence under the two rows: how much was
      -- raised in the window at all, which neither fraction says.
      (select count(*)::int
         from dispatches dd
         join quotations qq on qq.id = dd.quotation_id
         join companies c on c.id = qq.company_id
        where (dd.created_at at time zone 'Asia/Riyadh')::date >= ${from}::date
          and c.archived_at is null
          and (${repId}::uuid is null or dd.rep_id = ${repId}::uuid)) as dispatches
  `);

  const row = result.rows[0];
  return {
    projects: Number(row?.projects ?? 0),
    quotations: Number(row?.quotations ?? 0),
    quotedProjects: Number(row?.quoted_projects ?? 0),
    dispatches: Number(row?.dispatches ?? 0),
    dispatchedQuotations: Number(row?.dispatched_quotations ?? 0),
  };
}
