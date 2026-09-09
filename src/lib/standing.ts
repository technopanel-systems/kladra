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
import { waitingOnRep } from "@/lib/day";
import { dispatchEvent } from "@/lib/dispatch-events";
import { quotationEvent } from "@/lib/quotation-events";
import { SUM_SQM, sqmOf } from "@/lib/sqm";

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
    select ${sql.raw(SUM_SQM)}::text
      from dispatches d
      join dispatch_items di on di.dispatch_id = d.id
      join quotation_items qi on qi.id = di.quotation_item_id
      join quotations q on q.id = d.quotation_id
     where d.status = 'approved'
       and ${scope}
  )`;
}

/**
 * The rows that are still moving: somebody owes an answer or the customer does.
 * One WHERE for the figure and for its parts, so the parts cannot fail to add
 * up to it (D95, rules/data.md).
 */
function openQuotationRows(scope: SQL): SQL {
  return sql`from quotations q
     where q.status in ('requested', 'returned', 'issued')
       and not exists (
         select 1 from quotations later
          where later.number = q.number and later.revision > q.revision
       )
       and ${scope}`;
}

/** Quotations that are still moving: somebody owes an answer or the customer does. */
export function openQuotationsSql(scope: SQL): SQL<number> {
  return sql`(select count(*)::int ${openQuotationRows(scope)})`;
}

/**
 * Open quotations on one rep's floor, from the one definition above.
 *
 * This lived in `src/lib/team.ts` as a second copy written with the query
 * builder — same three statuses, same live-revision test, both correct, and
 * exactly the pair that drifts the day somebody adds a status (rules/data.md).
 * The team table and the person strip read this one now.
 *
 * An archived company is off the floor, so its quotations are off this figure:
 * the list below the strip does not show them either.
 */
export type OpenQuotations = {
  /** The three parts together — the figure. */
  total: number;
  /** Asked and not yet answered: on the coordinator's desk. */
  onDesk: number;
  /** Sent back: on his own desk, to fix and ask again. */
  returned: number;
  /** Issued and no answer recorded: with the customer. */
  withCustomer: number;
};

/**
 * The figure and its three parts from one read (D95). The strip said "6 open"
 * over "3 with the customer" and the reader was left to wonder where the other
 * three were; they were on the coordinator's desk, which nothing said.
 */
export async function openQuotationsForRep(repId: string): Promise<OpenQuotations> {
  const id = sql`${repId}::uuid`;
  const result = await db.execute<{
    total: number;
    on_desk: number;
    returned: number;
    with_customer: number;
  }>(sql`
    select count(*)::int as total,
           (count(*) filter (where q.status = 'requested'))::int as on_desk,
           (count(*) filter (where q.status = 'returned'))::int as returned,
           (count(*) filter (where q.status = 'issued'))::int as with_customer
    ${openQuotationRows(sql`exists (
      select 1 from companies c
       where c.id = q.company_id and c.rep_id = ${id} and c.archived_at is null
    )`)}
  `);
  const row = result.rows[0];
  return {
    total: Number(row?.total ?? 0),
    onDesk: Number(row?.on_desk ?? 0),
    returned: Number(row?.returned ?? 0),
    withCustomer: Number(row?.with_customer ?? 0),
  };
}

export type PersonStanding = {
  /** Expected m² on this person's live projects (S45). */
  pipelineSqm: string;
  /** Quotations still moving on his floor, and where each of them is. */
  openQuotations: OpenQuotations;
  /**
   * Sent back or refused: stopped, and stopped on HIM. The one figure here that
   * is nobody else's fault and nobody else's to fix.
   */
  sentBack: number;
};

/**
 * How a person's floor is standing (D78) — the strip a company and a project
 * have had since P8.5 and a person never did.
 *
 * Every figure is scoped to the floor rather than to the account: the companies
 * whose rep he is, not the rows he happens to have typed. That is what makes it
 * the same question as the company strip one level up, and it is why a floor
 * somebody covered while he was away still reads as his.
 *
 * The two counts come from `waitingOnRep` — the list his own day renders — so
 * the manager's reading of "2 sent back" and the two rows the rep sees on his
 * day cannot be two different twos (rules/data.md).
 *
 * Who may ask this about whom is the caller's question, as it is for every read
 * helper here: the companies screen takes a rep from the URL only for somebody
 * who sees every floor, and otherwise asks about the reader himself (authz).
 */
export async function personStanding(repId: string): Promise<PersonStanding> {
  const [pipelineSqmValue, openQuotations, waiting] = await Promise.all([
    pipelineSqm(sql`c.rep_id = ${repId}::uuid`),
    openQuotationsForRep(repId),
    waitingOnRep(repId),
  ]);

  return {
    pipelineSqm: pipelineSqmValue,
    openQuotations,
    // Named, not "everything that is not with the customer". The caption on
    // this figure is "waiting on the rep, not on the customer", which a lead
    // also satisfies — so the negative form quietly added a fourth kind to a
    // number labelled "Sent back or refused" the day P12-7 landed one.
    sentBack: waiting.filter(
      (row) => row.reasonKey === "day.sentBack" || row.reasonKey === "day.refused",
    ).length,
  };
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
/** What a line has left to send: quoted minus committed, never below nought (D12). */
const REMAINING_QTY = `greatest(qi.qty - (
               select coalesce(sum(di.qty), 0)::int
                 from dispatch_items di
                 join dispatches d on d.id = di.dispatch_id
                where di.quotation_item_id = qi.id
                  and d.status in ('submitted', 'approved')
             ), 0)`;

export async function quotationStanding(quotationId: string): Promise<QuotationStanding> {
  const id = sql`${quotationId}::uuid`;
  const result = await db.execute<{ remaining_sqm: string }>(sql`
    select round(coalesce(sum(${sql.raw(sqmOf(REMAINING_QTY))}), 0), 2)::text as remaining_sqm
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
  /** What she has answered today, both chains: issued, sent back, approved, refused. */
  answeredToday: number;
  /**
   * What arrived today, both chains. `answeredToday` alone is a number with
   * nothing to be measured against; beside this one it answers the question she
   * actually asks at five o'clock, which is whether she is keeping up.
   */
  arrivedToday: number;
};

/** What answering something looks like, at either end of either chain. */
const ANSWERED = [
  quotationEvent("issue"),
  quotationEvent("sendBack"),
  dispatchEvent("approve"),
  dispatchEvent("refuse"),
];

/** What arriving looks like: raised, revised, or fixed and sent back to her. */
const RAISED = [quotationEvent("request"), quotationEvent("revise"), dispatchEvent("request")];
const RESUBMITTED = [quotationEvent("update"), dispatchEvent("update")];

/**
 * One bound parameter per member, never the array itself: Drizzle binds a JS
 * array as a single value whose text is the members joined by commas, and the
 * `in` list then asks whether the action equals one long string (rules/data.md).
 */
function actions(names: readonly string[]): SQL {
  return sql.join(
    names.map((name) => sql`${name}`),
    sql`, `,
  );
}

/**
 * The coordinator's own two figures (P8.6).
 *
 * Her screen already lists what is waiting; what it never said is how much she
 * has got through — a question she asks herself, not a question about her. How
 * long the worst one has waited is read from the rows on the page, not from
 * here: a second query over the same tables named a request neither list
 * showed, because it never asked whether the company was archived (D95).
 *
 * **Counted from the events, not from the states the rows are in now (P12-10).**
 * Both halves read `audit_log`, which is where every write in this app already
 * records what happened and when. They used to read the records themselves —
 * "issued or sent back, updated today" and "created today" — and that is a
 * figure that can go DOWN as she works: the moment a rep fixes a dispatch she
 * refused an hour ago, its status leaves `refused` and her answer stops being
 * counted. She answered it. The row simply moved on, and a number about her
 * afternoon must not depend on what somebody else did afterwards.
 *
 * The same reason puts a resubmission in `arrivedToday`. A refused dispatch the
 * rep has fixed is work landing on her desk again, and counting only the first
 * arrival gave a day where two things were answered and one arrived — which
 * reads as a broken screen rather than as a busy afternoon. The two `update`
 * events say which they were by the state they came FROM, the way both actions
 * already write it.
 *
 * Every action is named in the `where`, so the count runs off
 * `audit_log_action_at_idx` rather than over the day's whole log; the six are
 * built from `@/lib/quotation-events` and `@/lib/dispatch-events` rather than
 * typed out, so renaming an event cannot leave this figure quietly counting a
 * word nothing writes any more.
 */
export async function queueStanding(): Promise<QueueStanding> {
  const dayStart = sql`((now() at time zone 'Asia/Riyadh')::date)::timestamp at time zone 'Asia/Riyadh'`;
  const result = await db.execute<{
    answered: number;
    arrived: number;
  }>(sql`
    select
      (count(*) filter (where a.action in (${actions(ANSWERED)})))::int as answered,
      (count(*) filter (
        where a.action in (${actions(RAISED)})
           or (a.action = ${quotationEvent("update")} and a.details->>'from' = 'returned')
           or (a.action = ${dispatchEvent("update")} and a.details->>'from' = 'refused')
      ))::int as arrived
      from audit_log a
     where a.action in (${actions([...ANSWERED, ...RAISED, ...RESUBMITTED])})
       and a.at >= ${dayStart}
       and a.at < ${dayStart} + interval '1 day'
  `);
  const row = result.rows[0];

  return {
    answeredToday: Number(row?.answered ?? 0),
    arrivedToday: Number(row?.arrived ?? 0),
  };
}

