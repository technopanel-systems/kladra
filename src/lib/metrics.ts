import "server-only";

import { sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { creditedDispatch, creditedQuotation } from "@/lib/credit-rows";
import { CREDITED_METRES } from "@/lib/sqm";
import type { Day } from "@/lib/dates";

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

/**
 * Where the window's metres went, by customer segment, largest first (D152).
 *
 * Segment is the company category (D2) — the only classification of a customer
 * this business records. The brief named contractor, station and management;
 * those are three of the ten, and a second grouping beside the one the admin
 * already edits would be a second answer to one question (rules/data.md).
 *
 * Attributed by CREDIT, exactly as achieved metres are (D148): a rep's segments
 * add up to what his month card says he moved, and the whole company's add up
 * to the month itself, because the shares of one dispatch add back to it. That
 * is the property that makes this worth drawing, and it is why this reads the
 * same rows `achievedByRep` does rather than summing the dispatches again.
 */
export async function metresBySegment(from: Day, repId: string | null): Promise<SegmentShare[]> {
  const ar = (await getLocale()).startsWith("ar");

  const rows = await db.execute<{ id: number; name: string; sqm: string }>(sql`
    with credited as (${sql.raw(CREDITED_METRES)})
    select cat.id,
           ${ar ? sql`cat.name_ar` : sql`cat.name_en`} as name,
           round(sum(credited.sqm), 2) as sqm
      from credited
      join companies co on co.id = credited.company_id
      join company_categories cat on cat.id = co.category_id
      -- The approval is the event that moves metres (S41), read as a Riyadh
      -- day in the shape the hooks allow (rules/data.md, H6/H7).
     where (credited.approved_at at time zone 'Asia/Riyadh')::date >= ${from}::date
       and (${repId}::uuid is null or credited.user_id = ${repId}::uuid)
     group by cat.id
     order by sqm desc
  `);

  return rows.rows.map((row) => ({ id: row.id, name: row.name, sqm: String(row.sqm ?? "0") }));
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
         -- A project is not credited: it has an owner and it has people put
         -- on it (D147), and the row asks how many of HIS jobs got as far as
         -- a price. Whether the price was his is the row below's question.
         and (${repId}::uuid is null or pp.rep_id = ${repId}::uuid)
    ),
    q as (
      select qq.id
        from quotations qq
        join companies c on c.id = qq.company_id
       where (qq.created_at at time zone 'Asia/Riyadh')::date >= ${from}::date
         and c.archived_at is null
         -- Whose paper, which since D148 is who it was CREDITED to and not
         -- who typed it: a rep who raised a quotation on a shared job and
         -- gave the credit to the man whose job it is did not raise it for
         -- himself, and his own funnel should not say he did. One question,
         -- one answer, and the same one the metres beside it are counted by.
         and ${creditedQuotation("qq", repId)}
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
          and ${creditedDispatch("dd", repId)}) as dispatches
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
