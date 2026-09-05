/**
 * How something is standing: the small set of figures that answer "is this
 * going well?" without opening anything (DESIGN §6, P8.5).
 *
 * A drawer used to open on a flat list of fields — city, category, lead source,
 * rep — none of which a rep reads twice and none of which says whether the
 * customer is worth today. These are the numbers that do, and each has ONE
 * definition here that every screen shares (rules/data.md).
 *
 * Every figure stays a string all the way to the screen: they are `numeric` in
 * Postgres and a float would round them on the way past.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { Day } from "@/lib/dates";

export type CompanyStanding = {
  /** SPEC S45: expected m² on live projects — not lost, not archived. */
  pipelineSqm: string;
  /** Approved m², all time (S41 counts a month; this counts the relationship). */
  approvedSqm: string;
  /** Quotations still moving: requested, sent back or issued, live revision. */
  openQuotations: number;
  /** The last day anything was logged against this company or its projects. */
  lastActivityOn: Day | null;
};

/**
 * The pipeline, for whatever `scope` narrows to — one company, one rep, or
 * everybody (SPEC S45, and the glossary's "Pipeline / إجمالي الفرص").
 *
 * Both tables are named outright rather than left to a bare Drizzle column: in
 * a correlated subquery with no join an unqualified column resolves inside the
 * INNER table and the condition is silently never true (rules/data.md).
 */
export function pipelineSqmSql(scope: SQL): SQL<string> {
  return sql`(
    select coalesce(sum(p.expected_sqm), 0)::text
      from projects p
      join companies c on c.id = p.company_id
     where ${scope}
       and p.archived_at is null
       and p.lost_at is null
       and c.archived_at is null
  )`;
}

/**
 * Approved m² for whatever `scope` narrows to, with no month on it.
 *
 * The same arithmetic as `achievedByRep` — round the sheet, then multiply, then
 * round the sum — because a figure computed two ways is two figures (D38).
 */
export function approvedSqmSql(scope: SQL): SQL<string> {
  return sql`(
    select round(coalesce(sum(round(qi.width * qi.length * di.qty, 2)), 0), 2)::text
      from dispatches d
      join dispatch_items di on di.dispatch_id = d.id
      join quotation_items qi on qi.id = di.quotation_item_id
      join quotations q on q.id = d.quotation_id
     where d.status = 'approved'
       and ${scope}
  )`;
}

/** Quotations that are still moving: somebody owes an answer or the customer does. */
export function openQuotationsSql(scope: SQL): SQL<number> {
  return sql`(
    select count(*)::int
      from quotations q
     where q.status in ('requested', 'returned', 'issued')
       and not exists (
         select 1 from quotations later
          where later.number = q.number and later.revision > q.revision
       )
       and ${scope}
  )`;
}

/** The four figures at the top of a company drawer. */
export async function companyStanding(companyId: string): Promise<CompanyStanding> {
  const id = sql`${companyId}::uuid`;
  const result = await db.execute<{
    pipeline_sqm: string;
    approved_sqm: string;
    open_quotations: number;
    last_activity_on: string | null;
  }>(sql`
    select
      ${pipelineSqmSql(sql`p.company_id = ${id}`)} as pipeline_sqm,
      ${approvedSqmSql(sql`q.company_id = ${id}`)} as approved_sqm,
      ${openQuotationsSql(sql`q.company_id = ${id}`)} as open_quotations,
      (
        select to_char(max(a.happened_on), 'YYYY-MM-DD')
          from activities a
         where a.company_id = ${id} and a.archived_at is null
      ) as last_activity_on
  `);
  const row = result.rows[0];

  return {
    pipelineSqm: String(row?.pipeline_sqm ?? "0"),
    approvedSqm: String(row?.approved_sqm ?? "0"),
    openQuotations: Number(row?.open_quotations ?? 0),
    lastActivityOn: (row?.last_activity_on as Day | null) ?? null,
  };
}

export type ProjectStanding = {
  /** What has actually been put in front of the customer, latest revision only. */
  quotedSqm: string;
  approvedSqm: string;
  openQuotations: number;
  lastActivityOn: Day | null;
};

/**
 * The figures at the top of a project drawer.
 *
 * `quotedSqm` counts the LIVE revision of each number and nothing before
 * `issued`: a project quoted three times at 2,000 m² is 2,000, not 6,000 (S35),
 * and a request the coordinator has not answered has not been quoted to anybody
 * yet. A rejected one still counts — it went out, and the customer said no,
 * which is a different fact from never having asked.
 */
export async function projectStanding(projectId: string): Promise<ProjectStanding> {
  const id = sql`${projectId}::uuid`;
  const result = await db.execute<{
    quoted_sqm: string;
    approved_sqm: string;
    open_quotations: number;
    last_activity_on: string | null;
  }>(sql`
    select
      (
        select coalesce(sum(qi.sqm), 0)::text
          from quotation_items qi
          join quotations q on q.id = qi.quotation_id
         where q.project_id = ${id}
           and q.status in ('issued', 'accepted', 'rejected')
           and not exists (
             select 1 from quotations later
              where later.number = q.number and later.revision > q.revision
           )
      ) as quoted_sqm,
      ${approvedSqmSql(sql`q.project_id = ${id}`)} as approved_sqm,
      ${openQuotationsSql(sql`q.project_id = ${id}`)} as open_quotations,
      (
        select to_char(max(a.happened_on), 'YYYY-MM-DD')
          from activities a
         where a.project_id = ${id} and a.archived_at is null
      ) as last_activity_on
  `);
  const row = result.rows[0];

  return {
    quotedSqm: String(row?.quoted_sqm ?? "0"),
    approvedSqm: String(row?.approved_sqm ?? "0"),
    openQuotations: Number(row?.open_quotations ?? 0),
    lastActivityOn: (row?.last_activity_on as Day | null) ?? null,
  };
}

export type QuotationStanding = {
  /** Quoted m² still available to send: quoted minus everything committed (D12). */
  remainingSqm: string;
};

/**
 * The figures at the top of a quotation drawer.
 *
 * "Left to send" is the glossary's المتبقي للإرسال and the one figure a rep and
 * the coordinator both act on. It counts a waiting request as spent, the same
 * as the dispatch form does, so the two cannot disagree about what is available
 * (D12).
 */
export async function quotationStanding(quotationId: string): Promise<QuotationStanding> {
  const id = sql`${quotationId}::uuid`;
  const result = await db.execute<{ remaining_sqm: string }>(sql`
    select round(coalesce(sum(
             round(qi.width * qi.length * greatest(qi.qty - (
               select coalesce(sum(di.qty), 0)::int
                 from dispatch_items di
                 join dispatches d on d.id = di.dispatch_id
                where di.quotation_item_id = qi.id
                  and d.status in ('submitted', 'approved')
             ), 0), 2)
           ), 0), 2)::text as remaining_sqm
      from quotation_items qi
     where qi.quotation_id = ${id}
  `);
  return { remainingSqm: String(result.rows[0]?.remaining_sqm ?? "0") };
}

/**
 * The pipeline for a scope, read on its own (SPEC S45, glossary "Pipeline").
 *
 * `scope` is the same fragment `pipelineSqmSql` takes, so one company, one rep
 * or everybody all go through the one definition.
 */
export async function pipelineSqm(scope: SQL): Promise<string> {
  const result = await db.execute<{ sqm: string }>(sql`select ${pipelineSqmSql(scope)} as sqm`);
  return String(result.rows[0]?.sqm ?? "0");
}

/** Every rep's pipeline in one statement, keyed by the rep who owns the company. */
export async function pipelineByRep(): Promise<Map<string, string>> {
  const result = await db.execute<{ rep_id: string; sqm: string }>(sql`
    select c.rep_id, coalesce(sum(p.expected_sqm), 0)::text as sqm
      from projects p
      join companies c on c.id = p.company_id
     where p.archived_at is null
       and p.lost_at is null
       and c.archived_at is null
     group by c.rep_id
  `);
  return new Map(result.rows.map((row) => [String(row.rep_id), String(row.sqm)]));
}

export type QueueStanding = {
  /**
   * The day each waiting request arrived, both chains. A list rather than the
   * one oldest date, because the screen asks two things of it — how long the
   * worst one has waited, and how many are past the line — and computing the
   * second from the first is impossible (D59).
   */
  waitingSince: Day[];
  /** What she has answered today, both chains: issued, sent back, approved, refused. */
  answeredToday: number;
  /**
   * What arrived today, both chains. `answeredToday` alone is a number with
   * nothing to be measured against; beside this one it answers the question she
   * actually asks at five o'clock, which is whether she is keeping up.
   */
  arrivedToday: number;
};

/**
 * The coordinator's own two figures (P8.6).
 *
 * Her screen already lists what is waiting; what it never said is how long the
 * worst one has been there, or how much she has got through — and both are
 * questions she asks herself, not questions about her. The counts beside them
 * come from the rows already on the page rather than from a second query, so
 * the strip and the list cannot disagree.
 */
export async function queueStanding(): Promise<QueueStanding> {
  const result = await db.execute<{
    waiting: string[] | null;
    answered: number;
    arrived: number;
  }>(sql`
    select
      (
        select array_agg(to_char(waiting.raised, 'YYYY-MM-DD')) from (
          select (q.created_at at time zone 'Asia/Riyadh')::date as raised
            from quotations q where q.status = 'requested'
          union all
          select (d.created_at at time zone 'Asia/Riyadh')::date
            from dispatches d where d.status = 'submitted'
        ) waiting
      ) as waiting,
      (
        select count(*)::int from (
          select 1 from quotations q
           where q.status in ('issued', 'returned')
             and (q.updated_at at time zone 'Asia/Riyadh')::date
                 = (now() at time zone 'Asia/Riyadh')::date
          union all
          select 1 from dispatches d
           where d.status in ('approved', 'refused')
             and (d.updated_at at time zone 'Asia/Riyadh')::date
                 = (now() at time zone 'Asia/Riyadh')::date
        ) answered
      ) as answered,
      (
        select count(*)::int from (
          select 1 from quotations q
           where (q.created_at at time zone 'Asia/Riyadh')::date
                 = (now() at time zone 'Asia/Riyadh')::date
          union all
          select 1 from dispatches d
           where (d.created_at at time zone 'Asia/Riyadh')::date
                 = (now() at time zone 'Asia/Riyadh')::date
        ) arrived
      ) as arrived
  `);
  const row = result.rows[0];

  return {
    waitingSince: (row?.waiting ?? []) as Day[],
    answeredToday: Number(row?.answered ?? 0),
    arrivedToday: Number(row?.arrived ?? 0),
  };
}

