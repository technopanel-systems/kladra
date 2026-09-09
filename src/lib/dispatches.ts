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
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { riyadhDay } from "@/lib/dates";
import type { Day } from "@/lib/dates";
import { isDispatchEvent, type DispatchEventName } from "@/lib/dispatch-events";
import { personName, personNameOf } from "@/lib/people";
import {
  companies,
  dispatchItems,
  dispatches,
  projects,
  quotationItems,
  quotations,
  shipmentMethods,
  warehouses,
  users,
} from "@/db/schema";
import { NotAllowed, seesAll } from "@/lib/authz";
import { dispatchLabel, numberInTerm, quotationLabel } from "@/lib/labels";
import { warehouseName } from "@/lib/lookups";
import { LIST_LIMIT } from "@/lib/list-size";
import type { SessionUser } from "@/lib/types";
import { creditOnDispatch, type CreditLine } from "@/lib/credit-rows";
import { CREDITED_METRES, lineSqm, sumSqm } from "@/lib/sqm";
import { maySeeCompany, onCompanySql, seesCompany } from "@/lib/visibility";

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
  /**
   * The project this is against has been marked lost SINCE it was raised
   * (D138). A Riyadh day, as text, and the stored reason — a code or the rep's
   * own words (`@/lib/loss-reason`).
   */
  projectLostOn: string | null;
  projectLostReason: string | null;
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
  /**
   * Who the metres count for, named in the reader's script, in the fixed order
   * the shares are divided by (D148). One name on every dispatch a rep raised
   * for himself; the row says so only when there is more than one.
   */
  creditNames: string[];
  /** The quotation has a later revision: approval would refuse this (D85, P11E). */
  superseded: boolean;
};

export type ListDispatchesInput = {
  user: SessionUser;
  q?: string;
  status?: DispatchStatus | DispatchStatus[];
  /** Only this rep's — the manager's drill-down (P6). */
  repId?: string;
  locale?: string;
  /** How many rows the screen will draw (D80). */
  limit?: number;
  /** "oldest" for the desk somebody works down — the queue (D137). */
  order?: "newest" | "oldest";
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
    sqm: sumSqm.as("total_sqm"),
    itemCount: sql<number>`count(*)::int`.as("item_count"),
  })
  .from(dispatchItems)
  .innerJoin(quotationItems, eq(quotationItems.id, dispatchItems.quotationItemId))
  .groupBy(dispatchItems.dispatchId)
  .as("dispatch_totals");

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

/**
 * The shared column list, now a function of the reader's language: a person's
 * name is one of its columns and Arabic screens name people in Arabic (D68).
 * The same shape `shipmentName(locale)` already had beside it.
 */
function selection(locale: string) {
  return {
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
    projectLostOn: riyadhDay(sql`projects.lost_at`),
    projectLostReason: projects.lostReason,
    repId: dispatches.repId,
      repName: personName(locale),
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
    // Whose metres these are, on the row rather than only inside the drawer
    // (SPEC §3, D148): a rep who sees 151 m² here and 75 against his target has
    // to be able to see why without opening anything. Named outright inside the
    // correlated subquery, because a Drizzle column in one renders bare and
    // resolves against the inner table (rules/data.md).
    creditNames: sql<string[]>`(
      select coalesce(array_agg(${personNameOf("cu", locale)}
                                order by ${personNameOf("cu", locale)}), '{}')
        from dispatch_credits dc
        join users cu on cu.id = dc.user_id
       where dc.dispatch_id = dispatches.id
    )`,
    // The paper this is against has been revised since (P11E): approval will
    // refuse it (D85), and the queue says so before the press. The same test
    // `isLiveRevision` runs at approval, written out because a correlated
    // subquery names its tables (rules/data.md).
    superseded: sql<boolean>`exists (
      select 1 from quotations later
       where later.number = quotations.number
         and later.revision > quotations.revision
    )`,
  };
}

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
  projectLostOn: string | null;
  projectLostReason: string | null;
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
  creditNames: string[] | null;
  superseded: boolean;
};

function toRow(row: Selected, shipmentMethod: string): DispatchRow {
  return {
    id: row.id,
    label: dispatchLabel(row.number),
    number: row.number,
    status: row.status as DispatchStatus,
    quotationId: row.quotationId,
    quotationLabel: quotationLabel(row.quotationNumber, row.quotationRevision),
    superseded: row.superseded === true,
    smacNumber: row.smacNumber ?? null,
    companyId: row.companyId,
    companyName: row.companyName,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    projectLostOn: row.projectLostOn ?? null,
    projectLostReason: row.projectLostReason ?? null,
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
    creditNames: row.creditNames ?? [],
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
  const conditions = narrowTo(input);

  const rows = await db
    .select({ ...selection(input.locale ?? (await getLocale())), shipmentMethod: shipmentName(input.locale) })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, dispatches.repId))
    .innerJoin(shipmentMethods, eq(shipmentMethods.id, dispatches.shipmentMethodId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(dispatchTotals, eq(dispatchTotals.dispatchId, dispatches.id))
    .where(and(...conditions))
    .orderBy(input.order === "oldest" ? asc(dispatches.createdAt) : desc(dispatches.createdAt))
    // Capped (D80).
    .limit(input.limit ?? LIST_LIMIT);

  return rows.map((row) => toRow(row, row.shipmentMethod));
}

/** The one place this list's narrowing is written — rows and count alike. */
function narrowTo(input: ListDispatchesInput): (SQL | undefined)[] {
  const { user } = input;
  const term = (input.q ?? "").trim();

  const conditions: (SQL | undefined)[] = [
    isNull(companies.archivedAt),
    seesEveryDispatch(user) ? undefined : seesCompany(user),
    input.repId ? eq(companies.repId, input.repId) : undefined,
  ];

  if (input.status) {
    const wanted = Array.isArray(input.status) ? input.status : [input.status];
    conditions.push(inArray(dispatches.status, wanted));
  }

  if (term) {
    const anywhere = `%${escapeLike(term)}%`;
    // What somebody would say out loud about one: the customer, the job, either
    // SMAC number, or Kladra's own D-number typed with or without its prefix.
    // The number is bound as an integer only when there is one (numberInTerm):
    // a guard written in SQL does not short-circuit the cast (P11G).
    const number = numberInTerm(term);
    conditions.push(
      sql`(
        ${companies.name} ilike ${anywhere}
        or ${projects.name} ilike ${anywhere}
        or ${dispatches.smacDispatchNumber} ilike ${anywhere}
        or ${quotations.smacNumber} ilike ${anywhere}
        or ${number === null ? sql`false` : sql`dispatches.number = ${number}::int`}
      )`,
    );
  }

  return conditions;
}

/** The same, for the other half of her desk (D144). */
export async function dispatchWaitDays(input: ListDispatchesInput): Promise<Day[]> {
  const rows = await db
    .select({ day: riyadhDay(sql`dispatches.created_at`) })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .where(and(...narrowTo(input)))
    .orderBy(asc(dispatches.createdAt));
  return rows.flatMap((row) => (row.day ? [row.day as Day] : []));
}

/** How many there are, asked only when the list came back full (D80). */
export async function countDispatches(input: ListDispatchesInput): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .where(and(...narrowTo(input)));
  return Number(row?.total ?? 0);
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
  /**
   * What OTHER dispatches — waiting or approved — already hold of that line,
   * and what is left once this one is counted (D112). The coordinator checking
   * the third partial dispatch reads them here rather than counting the
   * quotation's mini list; the definition is `committedQtySql`'s (D12).
   */
  elsewhereQty: number;
  leftAfter: number;
  width: string;
  length: string;
  sqm: string;
};

export type DispatchDetail = DispatchRow & {
  items: DispatchItemRow[];
  /**
   * Which store the load leaves from (SPEC §3, P12-9), and the row behind that
   * word for the edit dialog to open its list on.
   *
   * On the DETAIL and not on the row, the same way the quotation carries it: the
   * dispatch list is a queue somebody scans for what is waiting, and a store's
   * name is not one of the things scanned for.
   */
  warehouseId: number;
  warehouseName: string;
  /**
   * Who its metres count for, and how much each takes (D148). One name on
   * every dispatch a single rep raised; two or more on a shared job, and then
   * the drawer is the only place a rep can see why his target moved by less
   * than the figure at the top of this card.
   */
  credit: CreditLine[];
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
    .select({
      ...selection(locale ?? (await getLocale())),
      shipmentMethod: shipmentName(locale),
      warehouseId: dispatches.warehouseId,
      warehouseName: warehouseName(locale),
      // Whether this reader is on the company's share list, asked in the same
      // statement as its owner (D147).
      shared: onCompanySql(user, sql`companies.id`).mapWith(Boolean),
    })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, dispatches.repId))
    .innerJoin(warehouses, eq(warehouses.id, dispatches.warehouseId))
    .innerJoin(shipmentMethods, eq(shipmentMethods.id, dispatches.shipmentMethodId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(dispatchTotals, eq(dispatchTotals.dispatchId, dispatches.id))
    .where(eq(dispatches.id, id))
    .limit(1);

  if (!row) return null;
  if (!seesEveryDispatch(user) && !maySeeCompany(user, row.companyRepId, row.shared))
    throw new NotAllowed();

  const items = await db
    .select({
      id: dispatchItems.id,
      quotationItemId: dispatchItems.quotationItemId,
      position: quotationItems.position,
      colourCode: quotationItems.colourCode,
      qty: dispatchItems.qty,
      quotedQty: quotationItems.qty,
      // Both tables named outright inside the subquery (rules/data.md), and
      // the same status test as committedQtySql: waiting counts as spoken for.
      elsewhereQty: sql<number>`(
        select coalesce(sum(di.qty), 0)::int
          from dispatch_items di
          join dispatches d on d.id = di.dispatch_id
         where di.quotation_item_id = quotation_items.id
           and d.status in ('submitted', 'approved')
           and d.id <> dispatch_items.dispatch_id
      )`,
      width: quotationItems.width,
      length: quotationItems.length,
      sqm: lineSqm,
    })
    .from(dispatchItems)
    .innerJoin(quotationItems, eq(quotationItems.id, dispatchItems.quotationItemId))
    .where(eq(dispatchItems.dispatchId, id))
    .orderBy(asc(quotationItems.position));
  // This dispatch holds its own share only while it is waiting or approved; a
  // refused or cancelled one gave its quantities back (D12).
  const holds = row.status === "submitted" || row.status === "approved";
  const detail = toRow(row, row.shipmentMethod);
  return {
    ...detail,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName,
    credit: await creditOnDispatch(id, detail.totalSqm),
    items: items.map((item) => ({
      ...item,
      elsewhereQty: Number(item.elsewhereQty ?? 0),
      leftAfter: Math.max(
        0,
        item.quotedQty - Number(item.elsewhereQty ?? 0) - (holds ? item.qty : 0),
      ),
    })),
  };
}

/** The dispatches raised against one quotation, newest first — the drawer's tab. */
/**
 * The last dispatch raised against one quotation, as a form fills from (D81).
 *
 * The same sentence as the quotation line one screen back (D74): a dispatch is
 * typed from nothing, and the second one against a job goes to the same site on
 * the same terms as the first. What carries over is what belongs to the JOB —
 * where it is going, how it is paid for, how it ships. What does not is the
 * quantity, which is the whole of what this dispatch is.
 *
 * Any status: a refused one describes the same site, and a dispatch that came
 * back is the likeliest reason a rep is raising another.
 */
export type LastDispatch = {
  label: string;
  shipmentMethodId: string;
  destination: string;
  paymentTerms: string;
};

export async function lastDispatchForQuotation(
  user: SessionUser,
  quotationId: string,
): Promise<LastDispatch | null> {
  const [row] = await db
    .select({
      number: dispatches.number,
      shipmentMethodId: dispatches.shipmentMethodId,
      destination: dispatches.destination,
      paymentTerms: dispatches.paymentTerms,
    })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(
      and(
        eq(dispatches.quotationId, quotationId),
        seesEveryDispatch(user) ? undefined : seesCompany(user),
      ),
    )
    .orderBy(desc(dispatches.createdAt))
    .limit(1);

  if (!row) return null;
  return {
    label: dispatchLabel(row.number),
    shipmentMethodId: String(row.shipmentMethodId),
    destination: row.destination ?? "",
    paymentTerms: row.paymentTerms ?? "",
  };
}

export async function listDispatchesForQuotation(
  user: SessionUser,
  quotationId: string,
  locale?: string,
): Promise<DispatchRow[]> {
  const rows = await db
    .select({ ...selection(locale ?? (await getLocale())), shipmentMethod: shipmentName(locale) })
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
        seesEveryDispatch(user) ? undefined : seesCompany(user),
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
const approvedSqm = sumSqm;

/**
 * Achieved m² per rep for one Riyadh month — the ONE definition (S43).
 *
 * `month` is any day in it. Approval is the event, so the month is the month
 * `approved_at` fell in, in Riyadh, and neither the request nor the SMAC number
 * moves it (S41).
 *
 * Counted against whoever the dispatch was CREDITED to, which is chosen when it
 * is raised and never inherited (D148) — never against whoever owns the company
 * today, because a hand-over moves the customer and his open work and leaves
 * the metres in the month somebody already earned them (D86). For a dispatch
 * with one name on it, which is every dispatch until a rep shares a job, that
 * is the rep who raised it and the figure is unchanged.
 *
 * One statement for the whole team: the manager's table and a rep's own card
 * read the same row, so they cannot disagree.
 */
export async function achievedByRep(month: string): Promise<Map<string, string>> {
  const rows = await db.execute<{ user_id: string; sqm: string }>(sql`
    with credited as (${sql.raw(CREDITED_METRES)})
    select user_id, round(sum(sqm), 2) as sqm
      from credited
     where date_trunc('month', (approved_at at time zone 'Asia/Riyadh')::date)
             = date_trunc('month', ${month}::date)
     group by user_id
  `);

  return new Map(rows.rows.map((row) => [row.user_id, String(row.sqm ?? "0")]));
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

/** One thing that happened to a dispatch, for the trail on its drawer (D143). */
export type DispatchEvent = {
  /** The audit action with its `dispatch.` prefix removed: `approve`, `refuse`… */
  what: DispatchEventName;
  /** A Riyadh day, "YYYY-MM-DD". */
  day: Day;
  /** Who did it, named in the reader's script (D68). Null if the account is gone. */
  who: string | null;
  /** Her reason, where the event carried one — or, on a number correction, the old number (D88). */
  note: string | null;
};

/**
 * What happened to this dispatch, oldest first (D143).
 *
 * Read from `audit_log` and not from a history table of its own, for the reason
 * `quotationHistory` gives: every transition already writes an audit row with
 * who and when, inside the same transaction as the change, and a second table
 * beside it would be a second answer to one question (rules/data.md).
 */
export async function dispatchHistory(id: string): Promise<DispatchEvent[]> {
  const locale = await getLocale();
  const rows = await db.execute<{ what: string; day: Day; who: string | null; note: string | null }>(
    sql`
      select replace(a.action, 'dispatch.', '') as what,
             to_char((a.at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as day,
             ${personNameOf("u", locale)} as who,
             nullif(btrim(coalesce(a.details ->> 'reason', a.details ->> 'from', '')), '') as note
        from audit_log a
        left join users u on u.id = a.user_id
       where a.record_type = 'dispatch'
         and a.record_id = ${id}::text
       order by a.at asc
    `,
  );
  // Anything the app has no word for is not shown: `action` is a text column and
  // the trail prints a sentence per event.
  return rows.rows.flatMap((row) =>
    isDispatchEvent(row.what)
      ? [{ what: row.what, day: row.day, who: row.who, note: row.note }]
      : [],
  );
}
