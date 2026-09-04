/**
 * Dispatches — the rep raises, the coordinator approves or refuses, and the
 * approved square metres are the only thing that counts (SPEC S37–S43).
 *
 * A dispatch is the customer's reply to a quotation, in goods. Cladding is
 * taken in stages, so one quotation normally produces several partial
 * dispatches and the quoted, paid and dispatched quantities are three different
 * numbers (S37). Kladra tracks the third one and nothing else about it: SMAC
 * still does the paperwork and gives the dispatch its own number.
 *
 * Three figures, one definition each, all computed in SQL before any row is
 * paged (rules/data.md):
 *
 * - **A dispatch's m²** is width × length × the quantity being sent, rounded
 *   per line. Not the quotation line's own `sqm`, which is the whole quoted
 *   quantity — the trap that makes a half dispatch count as a full one.
 * - **What is left on a quotation line** is its quantity minus everything
 *   already committed against it. Submitted counts as committed: a request
 *   waiting on the coordinator's desk is goods somebody is expecting, and
 *   letting a second request spend them again is how the same panels get
 *   promised twice. A refused request gives them back (D12).
 * - **Achieved m²** is the sum of the first figure over APPROVED dispatches, by
 *   the Riyadh month the approval happened in — never the request, never the
 *   number (S41, S43). It is defined here, once, and P6's manager screens read
 *   it from here rather than adding it up again.
 *
 * S21 falls out of the same place: a project is won when a dispatch against it
 * is approved. There is no `won` column to keep in step, because "won" is a
 * question about dispatches and is answered by asking them.
 *
 * Scoping matches quotations: a rep sees the dispatches at his own companies,
 * the coordinator sees all of them because she runs the chain (S8, S9).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  companies,
  dispatchItems,
  dispatches,
  projects,
  quotationItems,
  quotations,
  shipmentMethods,
  users,
} from "@/db/schema";
import { NotAllowed, seesAll } from "@/lib/authz";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import type { SessionUser } from "@/lib/types";

export type DispatchStatus = "submitted" | "approved" | "refused";

/** The statuses that have spent quotation quantity (D12). */
export const COMMITTING_STATUSES: DispatchStatus[] = ["submitted", "approved"];

export type DispatchRow = {
  id: string;
  /** D-3 (src/lib/labels.ts). */
  label: string;
  number: number;
  status: DispatchStatus;
  quotationId: string;
  /** Q-12, or Q-12/2 — the paper this is against. */
  quotationLabel: string;
  /** The quotation's SMAC number, which is what finance knows it by. */
  smacNumber: string | null;
  companyId: string;
  companyName: string;
  projectId: string | null;
  projectName: string | null;
  repId: string;
  repName: string;
  /** Who owns the company, so who may act on it (S8). */
  companyRepId: string;
  shipmentMethod: string;
  /** The row behind that word — what the edit dialog opens its list on. */
  shipmentMethodId: number;
  destination: string;
  paymentTerms: string;
  /** SMAC's own number for the dispatch, given at approval (S39). */
  smacDispatchNumber: string | null;
  refuseReason: string | null;
  /** Riyadh days as text, computed in SQL (rules/data.md). */
  approvedOn: string | null;
  createdOn: string;
  /** numeric(12,2) all the way to the screen. */
  totalSqm: string;
  itemCount: number;
};

export type ListDispatchesInput = {
  user: SessionUser;
  q?: string;
  status?: DispatchStatus | DispatchStatus[];
  /** Only this rep's — the manager's drill-down (P6). */
  repId?: string;
  locale?: string;
};

/** She runs both chains, so she sees every dispatch on them (S9). */
export function seesEveryDispatch(user: SessionUser): boolean {
  return seesAll(user) || user.role === "coordinator";
}

/** `%` and `_` are ILIKE wildcards; a rep typing them means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => "\\" + match);
}

/**
 * The m² a dispatch is actually moving, and how many lines it moves.
 *
 * `width * length * dispatch_items.qty`, NOT `quotation_items.sqm` — that
 * generated column already holds the quotation's own quantity, so using it
 * would make every partial dispatch count as the whole line. Rounded per line
 * before summing, like the quotation's own totals (D6).
 */
/**
 * Subqueries are built with drizzle's own client-free QueryBuilder, never with
 * `db`. A subquery is a shape, not a question, and it is defined once when this
 * module is first imported — which happens inside `next build`, in a container
 * with no DATABASE_URL. Touching `db` here opened the connection at import time
 * and killed the Docker build with "Failed to collect page data".
 */
const qb = new QueryBuilder();

const dispatchTotals = qb
  .select({
    dispatchId: dispatchItems.dispatchId,
    sqm: sql<string>`round(coalesce(sum(round(${quotationItems.width} * ${quotationItems.length} * ${dispatchItems.qty}, 2)), 0), 2)`.as(
      "total_sqm",
    ),
    itemCount: sql<number>`count(*)::int`.as("item_count"),
  })
  .from(dispatchItems)
  .innerJoin(quotationItems, eq(quotationItems.id, dispatchItems.quotationItemId))
  .groupBy(dispatchItems.dispatchId)
  .as("dispatch_totals");

/**
 * The Riyadh calendar day an instant fell on, as `YYYY-MM-DD` text. `to_char`
 * rather than a bare cast: node-postgres turns a `date` back into a JavaScript
 * Date at the READER's midnight (rules/data.md).
 */
function riyadhDay(column: SQL): SQL<string | null> {
  return sql`to_char((${column} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`;
}

/**
 * How much of one quotation line is already spoken for.
 *
 * Both tables are named outright: in a correlated subquery with no join a bare
 * Drizzle column renders unqualified and resolves inside the INNER table, so
 * the condition is silently never true and the answer is always zero
 * (rules/data.md — it has cost three days across two systems).
 */
export function committedQtySql(quotationItemId: SQL): SQL<number> {
  return sql`(
    select coalesce(sum(di.qty), 0)::int
      from dispatch_items di
      join dispatches d on d.id = di.dispatch_id
     where di.quotation_item_id = ${quotationItemId}
       and d.status in ('submitted', 'approved')
  )`;
}

/**
 * True when a dispatch against this project has been approved (S21).
 *
 * Won is never typed by anybody; this is the whole of it. Named outright for
 * the reason above.
 */
export function projectIsWonSql(projectId: SQL): SQL<boolean> {
  return sql`exists (
    select 1
      from dispatches d
      join quotations qq on qq.id = d.quotation_id
     where qq.project_id = ${projectId}
       and d.status = 'approved'
  )`;
}

const selection = {
  id: dispatches.id,
  number: dispatches.number,
  status: dispatches.status,
  quotationId: dispatches.quotationId,
  quotationNumber: quotations.number,
  quotationRevision: quotations.revision,
  smacNumber: quotations.smacNumber,
  companyId: quotations.companyId,
  companyName: companies.name,
  projectId: quotations.projectId,
  projectName: projects.name,
  repId: dispatches.repId,
  repName: users.name,
  companyRepId: companies.repId,
  shipmentMethodId: dispatches.shipmentMethodId,
  destination: dispatches.destination,
  paymentTerms: dispatches.paymentTerms,
  smacDispatchNumber: dispatches.smacDispatchNumber,
  refuseReason: dispatches.refuseReason,
  approvedOn: riyadhDay(sql`dispatches.approved_at`),
  // `created_at` is NOT NULL, so this one always has a day.
  createdOn: sql<string>`to_char((dispatches.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
  totalSqm: sql<string>`coalesce(${dispatchTotals.sqm}, 0)`,
  itemCount: sql<number>`coalesce(${dispatchTotals.itemCount}, 0)`,
};

type Selected = {
  id: string;
  number: number;
  status: string;
  quotationId: string;
  quotationNumber: number;
  quotationRevision: number;
  smacNumber: string | null;
  companyId: string;
  companyName: string;
  projectId: string | null;
  projectName: string | null;
  repId: string;
  repName: string;
  companyRepId: string;
  shipmentMethodId: number;
  destination: string;
  paymentTerms: string;
  smacDispatchNumber: string | null;
  refuseReason: string | null;
  approvedOn: string | null;
  createdOn: string;
  totalSqm: string;
  itemCount: number;
};

function toRow(row: Selected, shipmentMethod: string): DispatchRow {
  return {
    id: row.id,
    label: dispatchLabel(row.number),
    number: row.number,
    status: row.status as DispatchStatus,
    quotationId: row.quotationId,
    quotationLabel: quotationLabel(row.quotationNumber, row.quotationRevision),
    smacNumber: row.smacNumber ?? null,
    companyId: row.companyId,
    companyName: row.companyName,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    repId: row.repId,
    repName: row.repName,
    companyRepId: row.companyRepId,
    shipmentMethod,
    shipmentMethodId: row.shipmentMethodId,
    destination: row.destination,
    paymentTerms: row.paymentTerms,
    smacDispatchNumber: row.smacDispatchNumber ?? null,
    refuseReason: row.refuseReason ?? null,
    approvedOn: row.approvedOn ?? null,
    createdOn: row.createdOn,
    totalSqm: String(row.totalSqm ?? "0"),
    itemCount: Number(row.itemCount ?? 0),
  };
}

/**
 * The shipment method in the reader's language (D12: the three are editable in
 * Lookups, so what they are called is a stored value, not a constant).
 */
function shipmentName(locale: string | undefined): SQL<string> {
  return locale?.startsWith("ar")
    ? sql`${shipmentMethods.nameAr}`
    : sql`${shipmentMethods.nameEn}`;
}

/** The dispatches a person may see, newest first. */
export async function listDispatches(input: ListDispatchesInput): Promise<DispatchRow[]> {
  const { user } = input;
  const term = (input.q ?? "").trim();

  const conditions: (SQL | undefined)[] = [
    isNull(companies.archivedAt),
    seesEveryDispatch(user) ? undefined : eq(companies.repId, user.id),
    input.repId ? eq(companies.repId, input.repId) : undefined,
  ];

  if (input.status) {
    const wanted = Array.isArray(input.status) ? input.status : [input.status];
    conditions.push(inArray(dispatches.status, wanted));
  }

  if (term) {
    const anywhere = `%${escapeLike(term)}%`;
    const digits = term.replace(/\D/g, "");
    // What somebody would say out loud about one: the customer, the job, either
    // SMAC number, or Kladra's own D-number typed with or without its prefix.
    conditions.push(
      sql`(
        ${companies.name} ilike ${anywhere}
        or ${projects.name} ilike ${anywhere}
        or ${dispatches.smacDispatchNumber} ilike ${anywhere}
        or ${quotations.smacNumber} ilike ${anywhere}
        or (${digits} <> '' and dispatches.number = ${digits}::int)
      )`,
    );
  }

  const rows = await db
    .select({ ...selection, shipmentMethod: shipmentName(input.locale) })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, dispatches.repId))
    .innerJoin(shipmentMethods, eq(shipmentMethods.id, dispatches.shipmentMethodId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(dispatchTotals, eq(dispatchTotals.dispatchId, dispatches.id))
    .where(and(...conditions))
    .orderBy(desc(dispatches.createdAt));

  return rows.map((row) => toRow(row, row.shipmentMethod));
}

export type DispatchItemRow = {
  id: string;
  quotationItemId: string;
  /** The line's number on the quotation, so the two papers read the same way. */
  position: number;
  colourCode: string;
  qty: number;
  /** What the quotation asked for on that line. */
  quotedQty: number;
  width: string;
  length: string;
  sqm: string;
};

export type DispatchDetail = DispatchRow & {
  items: DispatchItemRow[];
};

/**
 * One dispatch with its lines, for the drawer.
 *
 * Throws NotAllowed when it hangs off a company that is not this person's;
 * returns null when there is no such dispatch.
 */
export async function getDispatch(
  user: SessionUser,
  id: string,
  locale?: string,
): Promise<DispatchDetail | null> {
  const [row] = await db
    .select({ ...selection, shipmentMethod: shipmentName(locale) })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, dispatches.repId))
    .innerJoin(shipmentMethods, eq(shipmentMethods.id, dispatches.shipmentMethodId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(dispatchTotals, eq(dispatchTotals.dispatchId, dispatches.id))
    .where(eq(dispatches.id, id))
    .limit(1);

  if (!row) return null;
  if (!seesEveryDispatch(user) && row.companyRepId !== user.id) throw new NotAllowed();

  const items = await db
    .select({
      id: dispatchItems.id,
      quotationItemId: dispatchItems.quotationItemId,
      position: quotationItems.position,
      colourCode: quotationItems.colourCode,
      qty: dispatchItems.qty,
      quotedQty: quotationItems.qty,
      width: quotationItems.width,
      length: quotationItems.length,
      sqm: sql<string>`round(${quotationItems.width} * ${quotationItems.length} * ${dispatchItems.qty}, 2)`,
    })
    .from(dispatchItems)
    .innerJoin(quotationItems, eq(quotationItems.id, dispatchItems.quotationItemId))
    .where(eq(dispatchItems.dispatchId, id))
    .orderBy(asc(quotationItems.position));

  return { ...toRow(row, row.shipmentMethod), items };
}

/** The dispatches raised against one quotation, newest first — the drawer's tab. */
export async function listDispatchesForQuotation(
  user: SessionUser,
  quotationId: string,
  locale?: string,
): Promise<DispatchRow[]> {
  const rows = await db
    .select({ ...selection, shipmentMethod: shipmentName(locale) })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, dispatches.repId))
    .innerJoin(shipmentMethods, eq(shipmentMethods.id, dispatches.shipmentMethodId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(dispatchTotals, eq(dispatchTotals.dispatchId, dispatches.id))
    .where(
      and(
        eq(dispatches.quotationId, quotationId),
        seesEveryDispatch(user) ? undefined : eq(companies.repId, user.id),
      ),
    )
    .orderBy(desc(dispatches.createdAt));

  return rows.map((row) => toRow(row, row.shipmentMethod));
}

export type RemainingItem = {
  quotationItemId: string;
  position: number;
  colourCode: string;
  quotedQty: number;
  /** Already on a submitted or approved dispatch. */
  committedQty: number;
  /** What a new request may still ask for on this line (D12). */
  remainingQty: number;
  /** The sheet, so the browser can do the SAME arithmetic SQL does (money.ts). */
  width: string;
  length: string;
};

/**
 * What is left to send on each line of a quotation.
 *
 * This is the list the request dialog opens on, and it is also the rule the
 * action re-checks before it writes: a rep with the dialog open while somebody
 * else spends the same panels must not be able to overspend them, so the number
 * on screen is a courtesy and the number in the transaction is the law.
 *
 * `exclude` leaves one dispatch's own lines out of the committed figure, which
 * is what editing a request already on the desk needs — otherwise its own
 * quantities count against it and every edit looks like an overspend.
 */
export async function remainingOnQuotation(
  quotationId: string,
  exclude?: string,
): Promise<RemainingItem[]> {
  const committed = sql<number>`(
    select coalesce(sum(di.qty), 0)::int
      from dispatch_items di
      join dispatches d on d.id = di.dispatch_id
     where di.quotation_item_id = quotation_items.id
       and d.status in ('submitted', 'approved')
       and (${exclude ?? null}::uuid is null or d.id <> ${exclude ?? null}::uuid)
  )`;

  const rows = await db
    .select({
      quotationItemId: quotationItems.id,
      position: quotationItems.position,
      colourCode: quotationItems.colourCode,
      quotedQty: quotationItems.qty,
      committedQty: committed,
      width: quotationItems.width,
      length: quotationItems.length,
    })
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, quotationId))
    .orderBy(asc(quotationItems.position));

  return rows.map((row) => ({
    quotationItemId: row.quotationItemId,
    position: row.position,
    colourCode: row.colourCode,
    quotedQty: row.quotedQty,
    committedQty: Number(row.committedQty ?? 0),
    remainingQty: Math.max(0, row.quotedQty - Number(row.committedQty ?? 0)),
    width: row.width,
    length: row.length,
  }));
}

/**
 * The m² an approved dispatch moved. THE definition of achieved (S43).
 *
 * Rounded per line before summing, and computed from the quantity SENT — not
 * from the quotation line's own `sqm`, which is the whole quoted amount. The
 * browser computes the same thing with `lineSqm` in src/lib/money.ts and
 * tests/dispatches.spec.ts checks the two against each other (D38).
 */
const approvedSqm = sql<string>`round(coalesce(sum(round(${quotationItems.width} * ${quotationItems.length} * ${dispatchItems.qty}, 2)), 0), 2)`;

/**
 * Achieved m² per rep for one Riyadh month — the ONE definition (S43).
 *
 * `month` is any day in it. Approval is the event, so the month is the month
 * `approved_at` fell in, in Riyadh, and neither the request nor the SMAC number
 * moves it (S41). Counted against the rep who owns the COMPANY, not whoever
 * pressed the button, so moving a company to another rep moves its metres with
 * it (S8).
 *
 * One statement for the whole team: the manager's table and a rep's own card
 * read the same row, so they cannot disagree.
 */
export async function achievedByRep(month: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ repId: companies.repId, sqm: approvedSqm })
    .from(dispatches)
    .innerJoin(dispatchItems, eq(dispatchItems.dispatchId, dispatches.id))
    .innerJoin(quotationItems, eq(quotationItems.id, dispatchItems.quotationItemId))
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(
      and(
        eq(dispatches.status, "approved"),
        sql`date_trunc('month', (dispatches.approved_at at time zone 'Asia/Riyadh')::date)
              = date_trunc('month', ${month}::date)`,
      ),
    )
    .groupBy(companies.repId);

  return new Map(rows.map((row) => [row.repId, String(row.sqm ?? "0")]));
}

/** One rep's achieved m², from the same statement (S43). */
export async function achievedSqm(userId: string, month: string): Promise<string> {
  return (await achievedByRep(month)).get(userId) ?? "0";
}

/**
 * The whole company's achieved m² for a month — the sum of the same rows.
 *
 * Not the sum of the reps' targets and not derived from them (S44); this is
 * what actually went out, counted once.
 */
export async function companyAchievedSqm(month: string): Promise<string> {
  const [row] = await db
    .select({ sqm: approvedSqm })
    .from(dispatches)
    .innerJoin(dispatchItems, eq(dispatchItems.dispatchId, dispatches.id))
    .innerJoin(quotationItems, eq(quotationItems.id, dispatchItems.quotationItemId))
    .where(
      and(
        eq(dispatches.status, "approved"),
        sql`date_trunc('month', (dispatches.approved_at at time zone 'Asia/Riyadh')::date)
              = date_trunc('month', ${month}::date)`,
      ),
    );
  return String(row?.sqm ?? "0");
}
