/**
 * The report builder's answer (SPEC §3 P13, 13.2): a question from
 * `src/lib/builder-choice.ts` in, rows of figures out, every one of them counted
 * by a clause some other screen already counts by.
 *
 * Which reader each measure is — the whole point of this file, so it is said
 * once, here, and each clause is imported rather than written:
 *
 * - **Metres approved** — the achieved metre, `CREDITED_METRES` in the window
 *   (`approvedWhere`): the month card, the six months and the metres by segment.
 * - **Dispatches approved** — the same rows, counted once per load: the Reports
 *   lane's "approved" (D148: a load two people share is one in each's count).
 * - **Quotations raised / issued / accepted** — the chain card's cohort
 *   (`cohortWhere`): raised in the window, every revision its own trip (S32),
 *   and for the second and third, where it got to (`REACHED`, `accepted`).
 * - **Reports written** — the Reports screen's calendar count (`writtenWhere`).
 * - **Leads passed** — a lead filed in the window, by whoever filed it, with
 *   how many are won by `LEAD_STAGE`, the stage marketing's own screen reads.
 *
 * Every aggregation is SQL and grouped before anything is cut (rules/data.md).
 * Nothing is capped: a breakdown has at most a row per person, segment, source,
 * city or month, and the table under the chart carries every one of them.
 */
import "server-only";

import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { NotAllowed, seesAll } from "@/lib/authz";
import { columnsFor, inMetres, type Column, type Question } from "@/lib/builder-choice";
import { cohortWhere, REACHED, statusesOf } from "@/lib/chain";
import {
  approvedWhere,
  cityKey,
  leadPassedWhere,
  writtenWhere,
  type Window,
} from "@/lib/counted";
import { addMonths, firstOfMonth, lastOfMonth, todayRiyadh, type Day } from "@/lib/dates";
import { LEAD_STAGE } from "@/lib/leads";
import { narrowingQuery, type Narrowing } from "@/lib/narrowing";
import { personNameOf } from "@/lib/people";
import { CREDITED_METRES } from "@/lib/sqm";
import type { SessionUser } from "@/lib/types";

export type AnswerRow = {
  /** A person's id, a segment's or a source's id, a city key, or a month's first day. */
  key: string;
  /**
   * The name as the database holds it, in the reader's script (D68) — null for
   * a month, which the screen writes with its own formatter, and for a customer
   * with no city.
   */
  name: string | null;
  /** One figure per column, as text: m² to the hundredth, or a count. */
  values: string[];
  /** Of the leads counted, how many were won — leads only. */
  won: number[] | null;
};

export type Answer = {
  question: Question;
  columns: Column[];
  rows: AnswerRow[];
  /** Per column, counted over the whole — which for a count by person is not the rows added up (D148). */
  totals: string[];
  wonTotals: number[] | null;
};

/** One row per thing counted: its day, whose it is, its customer, and what it adds. */
function events(question: Question, window: Window): SQL {
  const rep = question.repId;
  switch (question.measure) {
    case "metres":
    case "approved":
      return sql`
        select (credited.approved_at at time zone 'Asia/Riyadh')::date as day,
               credited.user_id as person,
               credited.company_id as company_id,
               credited.dispatch_id as thing,
               credited.sqm as amount,
               false as won
          from (${sql.raw(CREDITED_METRES)}) credited
         where ${approvedWhere("credited", window, rep)}`;
    case "raised":
    case "issued":
    case "accepted": {
      const statuses =
        question.measure === "raised"
          ? []
          : statusesOf(question.measure === "issued" ? REACHED : ["accepted"]);
      // Whose, by person, is every name the paper is credited to — once each,
      // as the cohort counts it for each of them (D148).
      const byPerson = question.by === "rep";
      return sql`
        select (q.created_at at time zone 'Asia/Riyadh')::date as day,
               ${byPerson ? sql`qc.user_id` : sql`null::uuid`} as person,
               q.company_id as company_id,
               q.id as thing,
               1::numeric as amount,
               false as won
          from quotations q
          join companies c on c.id = q.company_id
          ${
            byPerson
              ? sql`join quotation_credits qc
                      on qc.quotation_id = q.id
                     and (${rep}::uuid is null or qc.user_id = ${rep}::uuid)`
              : sql``
          }
         where c.archived_at is null
           and ${cohortWhere("q", window, rep)}
           ${
             statuses.length > 0
               ? sql`and q.status::text in (${sql.join(
                   statuses.map((status) => sql`${status}::text`),
                   sql`, `,
                 )})`
               : sql``
           }`;
    }
    case "reports":
      return sql`
        select a.happened_on as day,
               a.user_id as person,
               a.company_id as company_id,
               a.id as thing,
               1::numeric as amount,
               false as won
          from activities a
         where ${writtenWhere("a", window, rep)}`;
    case "leads":
      return sql`
        select (companies.created_at at time zone 'Asia/Riyadh')::date as day,
               companies.lead_from_id as person,
               companies.id as company_id,
               companies.id as thing,
               1::numeric as amount,
               (${LEAD_STAGE} = 'won') as won
          from companies
         where ${leadPassedWhere(window, rep)}`;
  }
}

/** What a row is keyed and named by. */
function dimension(question: Question, locale: string): { key: SQL; name: SQL } {
  const ar = locale.startsWith("ar");
  switch (question.by) {
    case "rep":
      return { key: sql`ev.person::text`, name: personNameOf("pu", locale) };
    case "segment":
      return { key: sql`co.category_id::text`, name: sql.raw(ar ? "cat.name_ar" : "cat.name_en") };
    case "source":
      return { key: sql`co.lead_source_id::text`, name: sql.raw(ar ? "ls.name_ar" : "ls.name_en") };
    case "city":
      return {
        key: cityKey("co"),
        name: sql`coalesce(${sql.raw(ar ? "ci.name_ar" : "ci.name_en")}, nullif(btrim(co.city_text), ''))`,
      };
    case "month":
      return { key: sql`to_char(date_trunc('month', ev.day)::date, 'YYYY-MM-DD')`, name: sql`null::text` };
  }
}

export async function answer(
  user: SessionUser,
  question: Question,
  locale: string,
  today: Day = todayRiyadh(),
): Promise<Answer> {
  // The manager's and the admin's tab, and the CSV behind it (§3 P13).
  if (!seesAll(user)) throw new NotAllowed();

  const columns = columnsFor(question, today);
  const window: { from: Day; to: Day } = {
    from: columns.reduce((min, c) => (c.from < min ? c.from : min), columns[0].from),
    to: columns.reduce((max, c) => (c.to > max ? c.to : max), columns[0].to),
  };
  const ev = events(question, window);
  const dim = dimension(question, locale);
  const value = inMetres(question.measure)
    ? sql`round(coalesce(sum(ev.amount), 0), 2)::text`
    : sql`count(distinct ev.thing)::text`;
  const column =
    columns.length === 2 ? sql`(case when ev.day >= ${columns[0].from}::date then 0 else 1 end)` : sql`0`;
  const won = sql`(count(distinct ev.thing) filter (where ev.won))::int`;

  const [grouped, whole] = await Promise.all([
    db.execute<{ key: string; name: string | null; col: number; value: string; won: number }>(sql`
      with ev as (${ev})
      select ${dim.key} as key,
             min(${dim.name}) as name,
             ${column} as col,
             ${value} as value,
             ${won} as won
        from ev
        join companies co on co.id = ev.company_id
        left join users pu on pu.id = ev.person
        left join company_categories cat on cat.id = co.category_id
        left join lead_sources ls on ls.id = co.lead_source_id
        left join cities ci on ci.id = co.city_id
       ${question.by === "rep" ? sql`where ev.person is not null` : sql``}
       group by 1, 3
    `),
    db.execute<{ col: number; value: string; won: number }>(sql`
      with ev as (${ev})
      select ${column} as col, ${value} as value, ${won} as won
        from ev
       group by 1
    `),
  ]);

  const leads = question.measure === "leads";
  const zero: string = inMetres(question.measure) ? "0.00" : "0";
  const byKey = new Map<string, AnswerRow>();
  const rowFor = (key: string, name: string | null) => {
    let row = byKey.get(key);
    if (!row) {
      row = { key, name, values: columns.map(() => zero), won: leads ? columns.map(() => 0) : null };
      byKey.set(key, row);
    }
    return row;
  };

  // A month with nothing in it is a row with a zero, not a missing row: a trend
  // that skips an empty month draws straight over the hole (D61).
  if (question.by === "month") {
    for (let m = firstOfMonth(window.from); m <= window.to; m = addMonths(m, 1)) rowFor(m, null);
  }
  for (const row of grouped.rows) {
    const target = rowFor(String(row.key), row.name ?? null);
    target.values[Number(row.col)] = String(row.value);
    if (target.won) target.won[Number(row.col)] = Number(row.won);
  }

  const rows = [...byKey.values()];
  if (question.by === "month") {
    rows.sort((a, b) => a.key.localeCompare(b.key));
  } else {
    // Largest first in the first column, then the second, then by name — an
    // order that never wobbles between two renders of the same figures.
    rows.sort(
      (a, b) =>
        Number(b.values[0]) - Number(a.values[0]) ||
        Number(b.values[1] ?? 0) - Number(a.values[1] ?? 0) ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    );
  }

  const totals = columns.map(() => zero);
  const wonTotals = leads ? columns.map(() => 0) : null;
  for (const row of whole.rows) {
    totals[Number(row.col)] = String(row.value);
    if (wonTotals) wonTotals[Number(row.col)] = Number(row.won);
  }

  return { question, columns, rows, totals, wonTotals };
}

/**
 * The list a figure counts, for one or more rows of an answer in one column —
 * the door a bar, a slice or a cell opens (D117) — or null for a measure whose
 * list cannot be narrowed to it: reports are read by day and person on their own
 * screen, and leads on marketing's.
 */
export function doorFor(question: Question, keys: readonly string[], column: Column): string | null {
  const narrowing: Partial<Narrowing> & { from: Day } = {
    from: column.from,
    to: column.to,
    credited: question.repId,
  };
  switch (question.by) {
    case "rep":
      narrowing.credited = keys[0] ?? null;
      break;
    case "segment":
      narrowing.segment = keys.map(Number);
      break;
    case "source":
      narrowing.source = keys.map(Number);
      break;
    case "city":
      narrowing.city = [...keys];
      break;
    case "month": {
      const month = keys[0] ?? column.from;
      narrowing.from = month > column.from ? month : column.from;
      narrowing.to = lastOfMonth(month) < column.to ? lastOfMonth(month) : column.to;
      break;
    }
  }
  switch (question.measure) {
    case "metres":
    case "approved":
      return `/dispatches?${narrowingQuery(narrowing)}`;
    case "raised":
      return `/quotations?${narrowingQuery(narrowing)}`;
    case "issued":
      return `/quotations?${narrowingQuery({ ...narrowing, ended: [...REACHED] })}`;
    case "accepted":
      return `/quotations?${narrowingQuery({ ...narrowing, ended: ["accepted"] })}`;
    case "reports":
    case "leads":
      return null;
  }
}
