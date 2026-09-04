/**
 * Quotations — the rep asks, the coordinator issues, the customer answers
 * (SPEC S28–S36).
 *
 * Kladra does not price anything and does not invoice anything. SMAC does, and
 * where the two disagree SMAC is right (S31). What lives here is the part SMAC
 * has no idea about: who asked, what they asked for, what came back, and what
 * the customer said in the end.
 *
 * Three figures and one definition each, all of them computed in SQL before any
 * row is paged (rules/data.md). A line's m² is a generated column the app never
 * writes; a quotation's subtotal is the sum of its lines rounded per line
 * (S31, D6); VAT is 15% of that, fixed, from the one constant in money.ts.
 * `src/lib/money.ts` computes the same figures in the browser while a rep is
 * still typing, on values nothing has saved — the two are checked against each
 * other in tests/quotations.spec.ts rather than trusted to stay equal.
 *
 * Only the latest revision of a number is live (S34). Earlier ones stay
 * readable from the drawer and never appear in a list, because a project quoted
 * three times at 2,000 m² is 2,000, not 6,000 (S35).
 *
 * Nothing here takes a locale: every lookup a quotation line shows — supplier
 * N/K/C/D, class A/B/A2G1/A2G2, fire rating B1/A2/Normal, thickness in
 * millimetres — is the same code in both languages (S32).
 *
 * Scoping follows the companies list, plus the coordinator: a rep sees the
 * quotations at his own companies, and she sees all of them because she runs
 * the chain (S8, S9).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  classes,
  companies,
  fireRatings,
  projects,
  quotationItems,
  quotations,
  suppliers,
  thicknesses,
  users,
} from "@/db/schema";
import { NotAllowed, seesAll } from "@/lib/authz";
import { VAT_RATE } from "@/lib/money";
import { quotationLabel } from "@/lib/labels";
import type { SessionUser } from "@/lib/types";

export type QuotationStatus =
  | "requested"
  | "returned"
  | "issued"
  | "accepted"
  | "rejected"
  | "cancelled";

/** What every quotation screen shows about a quotation. */
export type QuotationRow = {
  id: string;
  /** Q-12, or Q-12/2 for a revision (src/lib/labels.ts). */
  label: string;
  number: number;
  revision: number;
  status: QuotationStatus;
  companyId: string;
  companyName: string;
  projectId: string | null;
  projectName: string | null;
  /** Who raised it. */
  repId: string;
  repName: string;
  /**
   * Who owns the COMPANY, which is who may act on it (S8). Not always the one
   * who raised it: an admin can move a company to another rep, and the answers
   * on its quotations move with it.
   */
  companyRepId: string;
  /** The number SMAC gave it, once the coordinator has issued it (S28). */
  smacNumber: string | null;
  returnReason: string | null;
  decisionReason: string | null;
  /**
   * Riyadh days, as text, computed in SQL (rules/data.md). A `timestamptz` read
   * into JavaScript is the reader's midnight, not the office's, and a quotation
   * issued at 01:00 Riyadh would read as the day before on a laptop set to UTC.
   */
  issuedOn: string | null;
  decidedOn: string | null;
  createdOn: string;
  /** numeric(12,2) all the way to the screen — a float would round it on the way. */
  totalSqm: string;
  subtotal: string;
  vat: string;
  total: string;
  lineCount: number;
};

export type ListQuotationsInput = {
  user: SessionUser;
  q?: string;
  status?: QuotationStatus | QuotationStatus[];
  /** Defaults to the reader's saved language; scripts and tests pass one. */
  locale?: string;
};

/** She runs both chains, so she sees every quotation on them (S9). */
export function seesEveryQuotation(user: SessionUser): boolean {
  return seesAll(user) || user.role === "coordinator";
}

/** `%` and `_` are ILIKE wildcards; a rep typing them means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => "\\" + match);
}

/**
 * The per-quotation figures, grouped once rather than correlated three times.
 *
 * A line's total is rounded before it is summed, which is what a customer
 * checking the paper adds up (S31, D6). Summing first and rounding once gives a
 * different halala on a long quotation, and the difference is exactly the kind
 * that makes somebody stop trusting the screen.
 */
const lineTotals = db
  .select({
    quotationId: quotationItems.quotationId,
    sqm: sql<string>`round(coalesce(sum(${quotationItems.sqm}), 0), 2)`.as("total_sqm"),
    subtotal:
      sql<string>`round(coalesce(sum(round(${quotationItems.sqm} * ${quotationItems.pricePerSqm}, 2)), 0), 2)`.as(
        "subtotal",
      ),
    lineCount: sql<number>`count(*)::int`.as("line_count"),
  })
  .from(quotationItems)
  .groupBy(quotationItems.quotationId)
  .as("line_totals");

/** Zero rather than null: a quotation with no lines is worth nothing, not unknown. */
const subtotalSql = sql<string>`coalesce(${lineTotals.subtotal}, 0)`;
const vatSql = sql<string>`round(coalesce(${lineTotals.subtotal}, 0) * ${VAT_RATE}::numeric, 2)`;
const totalSql = sql<string>`round(
  coalesce(${lineTotals.subtotal}, 0) + round(coalesce(${lineTotals.subtotal}, 0) * ${VAT_RATE}::numeric, 2),
  2
)`;

/**
 * The Riyadh calendar day an instant fell on, as `YYYY-MM-DD` text.
 *
 * `to_char` rather than a bare cast: node-postgres turns a `date` back into a
 * JavaScript Date at the READER's midnight, which is the whole bug this avoids.
 */
function riyadhDay(column: SQL): SQL<string | null> {
  return sql`to_char((${column} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`;
}

/**
 * True for the newest revision of a number — the only one that is live (S34).
 * Both tables are named outright: in a correlated subquery with no join a bare
 * Drizzle column resolves inside the inner table and the condition is silently
 * never true (rules/data.md).
 */
function isLatestRevisionSql(): SQL<boolean> {
  return sql`not exists (
    select 1
      from quotations later
     where later.number = quotations.number
       and later.revision > quotations.revision
  )`;
}

const selection = {
  id: quotations.id,
  number: quotations.number,
  revision: quotations.revision,
  status: quotations.status,
  companyId: quotations.companyId,
  companyName: companies.name,
  projectId: quotations.projectId,
  projectName: projects.name,
  repId: quotations.repId,
  repName: users.name,
  companyRepId: companies.repId,
  smacNumber: quotations.smacNumber,
  returnReason: quotations.returnReason,
  decisionReason: quotations.decisionReason,
  issuedOn: riyadhDay(sql`quotations.issued_at`),
  decidedOn: riyadhDay(sql`quotations.decided_at`),
  // `created_at` is NOT NULL, so this one always has a day.
  createdOn: sql<string>`to_char((quotations.created_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
  totalSqm: sql<string>`coalesce(${lineTotals.sqm}, 0)`,
  subtotal: subtotalSql,
  vat: vatSql,
  total: totalSql,
  lineCount: sql<number>`coalesce(${lineTotals.lineCount}, 0)`,
};

/** What `selection` yields, before the label and the null-flattening. */
type Selected = {
  id: string;
  number: number;
  revision: number;
  status: string;
  companyId: string;
  companyName: string;
  projectId: string | null;
  projectName: string | null;
  repId: string;
  repName: string;
  companyRepId: string;
  smacNumber: string | null;
  returnReason: string | null;
  decisionReason: string | null;
  issuedOn: string | null;
  decidedOn: string | null;
  createdOn: string;
  totalSqm: string;
  subtotal: string;
  vat: string;
  total: string;
  lineCount: number;
};

function toRow(row: Selected): QuotationRow {
  return {
    id: row.id,
    label: quotationLabel(row.number, row.revision),
    number: row.number,
    revision: row.revision,
    status: row.status as QuotationStatus,
    companyId: row.companyId,
    companyName: row.companyName,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    repId: row.repId,
    repName: row.repName,
    companyRepId: row.companyRepId,
    smacNumber: row.smacNumber ?? null,
    returnReason: row.returnReason ?? null,
    decisionReason: row.decisionReason ?? null,
    issuedOn: row.issuedOn ?? null,
    decidedOn: row.decidedOn ?? null,
    createdOn: row.createdOn,
    totalSqm: String(row.totalSqm ?? "0"),
    subtotal: String(row.subtotal ?? "0"),
    vat: String(row.vat ?? "0"),
    total: String(row.total ?? "0"),
    lineCount: Number(row.lineCount ?? 0),
  };
}

/**
 * The quotations a person may see, newest first, latest revision only.
 *
 * The search matches what somebody would say out loud about one: the company,
 * the project, or the number on the paper — SMAC's, or Kladra's own Q-number
 * typed with or without its prefix.
 */
export async function listQuotations(input: ListQuotationsInput): Promise<QuotationRow[]> {
  const { user } = input;
  const term = (input.q ?? "").trim();

  const conditions: (SQL | undefined)[] = [
    isNull(companies.archivedAt),
    isLatestRevisionSql(),
    seesEveryQuotation(user) ? undefined : eq(companies.repId, user.id),
  ];

  if (input.status) {
    const wanted = Array.isArray(input.status) ? input.status : [input.status];
    conditions.push(inArray(quotations.status, wanted));
  }

  if (term) {
    const anywhere = `%${escapeLike(term)}%`;
    const digits = term.replace(/\D/g, "");
    conditions.push(
      sql`(
        ${companies.name} ilike ${anywhere}
        or ${projects.name} ilike ${anywhere}
        or ${quotations.smacNumber} ilike ${anywhere}
        or (${digits} <> '' and quotations.number = ${digits}::int)
      )`,
    );
  }

  const rows = await db
    .select(selection)
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, quotations.repId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(lineTotals, eq(lineTotals.quotationId, quotations.id))
    .where(and(...conditions))
    .orderBy(desc(quotations.createdAt));

  return rows.map(toRow);
}

export type QuotationItemRow = {
  id: string;
  position: number;
  colourCode: string;
  /** What the line reads as: the letter, the class, the rating, the millimetres. */
  supplier: string;
  fireRating: string;
  className: string;
  thickness: string;
  qty: number;
  width: string;
  length: string;
  pricePerSqm: string;
  sqm: string;
  lineTotal: string;
  /**
   * The rows behind those words. Never rendered — they are what Edit and Revise
   * open the dropdowns on, so renaming a class in Lookups cannot silently move
   * a line onto a different one (the same reason the company dialogs carry
   * categoryId rather than a category name).
   */
  supplierId: number;
  fireRatingId: number;
  classId: number;
  thicknessId: number;
};

export type QuotationDetail = QuotationRow & {
  notes: string | null;
  items: QuotationItemRow[];
  /** Every revision of this number, newest first, this one included (S34). */
  revisions: { id: string; label: string; revision: number; status: QuotationStatus }[];
  isLatest: boolean;
};

/**
 * One quotation with its lines, for the drawer.
 *
 * Throws NotAllowed when it hangs off a company that is not this person's;
 * returns null when there is no such quotation. A revision that is no longer
 * live still opens — that is what "earlier versions stay readable" means (S34).
 */
export async function getQuotation(
  user: SessionUser,
  id: string,
): Promise<QuotationDetail | null> {
  const [row] = await db
    .select({ ...selection, notes: quotations.notes })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, quotations.repId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(lineTotals, eq(lineTotals.quotationId, quotations.id))
    .where(eq(quotations.id, id))
    .limit(1);

  if (!row) return null;
  if (!seesEveryQuotation(user) && row.companyRepId !== user.id) throw new NotAllowed();

  const base = toRow(row);

  const items = await db
    .select({
      id: quotationItems.id,
      position: quotationItems.position,
      colourCode: quotationItems.colourCode,
      // The letter the rep says out loud (SPEC §3: "Supplier (N/K/C/D)"), not
      // the full supplier name, which nobody uses on a line.
      supplier: suppliers.code,
      fireRating: fireRatings.name,
      className: classes.name,
      /** numeric(4,1) — "4.0" — the screen adds the unit. */
      thickness: thicknesses.mm,
      qty: quotationItems.qty,
      width: quotationItems.width,
      length: quotationItems.length,
      pricePerSqm: quotationItems.pricePerSqm,
      sqm: quotationItems.sqm,
      lineTotal: sql<string>`round(${quotationItems.sqm} * ${quotationItems.pricePerSqm}, 2)`,
      supplierId: quotationItems.supplierId,
      fireRatingId: quotationItems.fireRatingId,
      classId: quotationItems.classId,
      thicknessId: quotationItems.thicknessId,
    })
    .from(quotationItems)
    .innerJoin(suppliers, eq(suppliers.id, quotationItems.supplierId))
    .innerJoin(fireRatings, eq(fireRatings.id, quotationItems.fireRatingId))
    .innerJoin(classes, eq(classes.id, quotationItems.classId))
    .innerJoin(thicknesses, eq(thicknesses.id, quotationItems.thicknessId))
    .where(eq(quotationItems.quotationId, id))
    .orderBy(asc(quotationItems.position));

  const siblings = await db
    .select({
      id: quotations.id,
      revision: quotations.revision,
      status: quotations.status,
    })
    .from(quotations)
    .where(eq(quotations.number, base.number))
    .orderBy(desc(quotations.revision));

  return {
    ...base,
    notes: row.notes ?? null,
    items: items.map((item) => ({
      id: item.id,
      position: item.position,
      colourCode: item.colourCode,
      supplier: item.supplier,
      fireRating: item.fireRating,
      className: item.className,
      thickness: item.thickness,
      qty: item.qty,
      width: item.width,
      length: item.length,
      pricePerSqm: item.pricePerSqm,
      sqm: item.sqm ?? "0",
      lineTotal: item.lineTotal,
      supplierId: item.supplierId,
      fireRatingId: item.fireRatingId,
      classId: item.classId,
      thicknessId: item.thicknessId,
    })),
    revisions: siblings.map((sibling) => ({
      id: sibling.id,
      label: quotationLabel(base.number, sibling.revision),
      revision: sibling.revision,
      status: sibling.status as QuotationStatus,
    })),
    isLatest: siblings.length === 0 || siblings[0].revision === base.revision,
  };
}

/** The quotations of one project, newest first — for the project drawer's tab. */
export async function listQuotationsForProject(
  user: SessionUser,
  projectId: string,
): Promise<QuotationRow[]> {
  const rows = await db
    .select(selection)
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, quotations.repId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(lineTotals, eq(lineTotals.quotationId, quotations.id))
    .where(
      and(
        eq(quotations.projectId, projectId),
        isLatestRevisionSql(),
        seesEveryQuotation(user) ? undefined : eq(companies.repId, user.id),
      ),
    )
    .orderBy(desc(quotations.createdAt));

  return rows.map(toRow);
}

/** The quotations of one company, newest first — for the company drawer's tab. */
export async function listQuotationsForCompany(
  user: SessionUser,
  companyId: string,
): Promise<QuotationRow[]> {
  const rows = await db
    .select(selection)
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(users, eq(users.id, quotations.repId))
    .leftJoin(projects, eq(projects.id, quotations.projectId))
    .leftJoin(lineTotals, eq(lineTotals.quotationId, quotations.id))
    .where(
      and(
        eq(quotations.companyId, companyId),
        isLatestRevisionSql(),
        seesEveryQuotation(user) ? undefined : eq(companies.repId, user.id),
      ),
    )
    .orderBy(desc(quotations.createdAt));

  return rows.map(toRow);
}
