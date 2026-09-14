"use server";

/**
 * The dispatch chain (SPEC S37–S43, §3).
 *
 * The rep raises a load: which customer, what it comes from — a quotation, or
 * nothing at all — its lines and its services, how they travel, where to, and on
 * what terms. The coordinator checks it and either approves it with SMAC's
 * dispatch number or refuses it with a reason, and a refused one is corrected and
 * sent again.
 *
 * Approval is the only event that counts (S41). Not the request, not the
 * number, not the day the truck left: the rep's month moves when she presses
 * Approve, and if something goes wrong afterwards a new dispatch is raised
 * rather than this one edited. It is also what moves a job along the projects
 * board (D170), which nothing here writes down — `src/lib/project-stage.ts`
 * asks the question instead of storing an answer that could go stale.
 *
 * Since P13 a dispatch is a LOAD rather than a selection of quotation lines
 * (SPEC §3): it opens prefilled with the quotation's lines and services, all
 * editable, and whatever the rep changed is worked out HERE, inside the
 * transaction that writes it, from the rows this transaction holds — never from
 * anything the browser says about it — and recorded on the dispatch for the desk
 * (`src/lib/dispatch-difference.ts` decides what counts). A load may also be
 * direct: a customer, lines with a price on them (D169), and no paper.
 *
 * The quantity rule is enforced twice on purpose. The dialog shows what is left
 * on each carried line so a rep is not asked to guess, and the transaction
 * checks it again before writing, because between opening a dialog and pressing
 * Save somebody else can spend the same panels (D12). A line the rep added is
 * not on the quotation, so nothing on the quotation limits it.
 */

import { dispatchEvent } from "@/lib/dispatch-events";
import { quotationEvent } from "@/lib/quotation-events";
import { withTheRep } from "@/lib/with-the-rep";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  classes,
  companies,
  dispatchItems,
  dispatchServices,
  dispatches,
  fireRatings,
  projects,
  quotations,
  services,
  shipmentMethods,
  suppliers,
  thicknesses,
  users,
} from "@/db/schema";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { creditDispatch, resolveCredit } from "@/lib/credit-rows";
import {
  differenceFrom,
  type Difference,
  type LoadLine,
  type LoadService,
  type QuotedLine,
  type QuotedService,
} from "@/lib/dispatch-difference";
import {
  directDispatchCompanies,
  remainingOnQuotation,
  seesEveryDispatch,
  type DispatchStatus,
} from "@/lib/dispatches";
import { dispatchable, getQuotation, type QuotationStatus } from "@/lib/quotations";
import { isSmacClash, smacHolder } from "@/lib/smac";
import { SELLING_ROLES } from "@/lib/floor";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { firstRefusedBox, type LineList } from "@/lib/line-refusal";
import { round2 } from "@/lib/money";
import {
  detailsFor,
  needsNote,
  PAYMENT_DETAILS,
  PAYMENT_TERMS,
  type PaymentDetail,
  type PaymentTerms,
} from "@/lib/payment";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { holdDispatch, holdQuotation, isLiveRevision } from "@/lib/hold";
import { liveAudienceForCompany, notifyLive } from "@/lib/live";
import { clearNotifications, createNotification } from "@/lib/notify";
import { draftLinesFrom, draftServicesFrom, type DraftLine, type DraftService } from "@/lib/quotation-draft";
import type { ActionResult, Role, SessionUser } from "@/lib/types";
import {
  mayRaiseFor,
  maySeeCompany,
  onCompanySql,
  onProjectSql,
} from "@/lib/visibility";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
  ...roles: Role[]
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("dispatches action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

/** Every screen a dispatch shows on, plus the two the target reads from. */
function revalidateChain(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/dispatches", "page");
  revalidatePath("/[locale]/queue", "page");
  revalidatePath("/[locale]/quotations", "page");
  revalidatePath("/[locale]/projects", "page");
}

/** The active coordinators — the people a request is actually waiting on (S9). */
async function coordinators(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.active, true), eq(users.role, "coordinator")));
  return rows.map((row) => row.id);
}

type Loaded = {
  id: string;
  number: number;
  label: string;
  status: DispatchStatus;
  /** Null on a direct dispatch (SPEC §3, P13), which has no paper and may have no job. */
  quotationId: string | null;
  quotationLabel: string | null;
  projectId: string | null;
  companyId: string;
  /** The rep who owns the COMPANY — who hears about it, and whose floor it is. */
  companyRepId: string;
  /** The rep whose PROJECT it is, and whether this actor is on that job (D147). */
  projectRepId: string | null;
  shared: boolean;
  onProject: boolean;
};

/**
 * One dispatch, or NotAllowed. Never says whether a dispatch it will not show
 * exists: a rep asking for somebody else's id gets the same answer either way.
 */
async function load(actor: SessionUser, dispatchId: string): Promise<Loaded | null> {
  const [row] = await db
    .select({
      id: dispatches.id,
      number: dispatches.number,
      status: dispatches.status,
      quotationId: dispatches.quotationId,
      quotationNumber: quotations.number,
      quotationRevision: quotations.revision,
      projectId: dispatches.projectId,
      companyId: dispatches.companyId,
      companyRepId: companies.repId,
      projectRepId: projects.repId,
      shared: onCompanySql(actor, sql`companies.id`).mapWith(Boolean),
      onProject: sql`coalesce(${onProjectSql(actor, sql`dispatches.project_id`)}, false)`.mapWith(Boolean),
    })
    .from(dispatches)
    // The company is the dispatch's own now (P13-S0): a direct one has no paper to read it through.
    .innerJoin(companies, eq(companies.id, dispatches.companyId))
    .leftJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .leftJoin(projects, eq(projects.id, dispatches.projectId))
    .where(eq(dispatches.id, dispatchId))
    .limit(1);

  if (!row) return null;
  if (!seesEveryDispatch(actor) && !maySeeCompany(actor, row.companyRepId, row.shared))
    throw new NotAllowed();
  return {
    id: row.id,
    number: row.number,
    label: dispatchLabel(row.number),
    status: row.status as DispatchStatus,
    quotationId: row.quotationId,
    quotationLabel:
      row.quotationNumber === null || row.quotationRevision === null
        ? null
        : quotationLabel(row.quotationNumber, row.quotationRevision),
    projectId: row.projectId,
    companyId: row.companyId,
    companyRepId: row.companyRepId,
    projectRepId: row.projectRepId,
    shared: row.shared,
    onProject: row.onProject,
  };
}

/* -------------------------------------------------------------------------- */
/* What arrives from the form                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A figure as it was typed. Blank is missing, never nought: a coerced "" is 0,
 * and a line with no price on it would otherwise go out free (D169 — a direct
 * dispatch's lines carry a price per m², the same form as a quotation's).
 */
function typed<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema,
  );
}

/**
 * One line of a load: the quotation line it was prefilled from, or nothing when
 * the rep added it or the dispatch is direct, and the nine inputs a quotation
 * line has (SPEC §3, S32). The m² is never in here: the column generates it.
 */
const lineSchema = z.object({
  quotationItemId: z.uuid().nullish(),
  colourCode: z.string().trim().min(1).max(40),
  supplierId: z.coerce.number().int().positive(),
  fireRatingId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
  thicknessId: z.coerce.number().int().positive(),
  qty: typed(z.coerce.number().int().positive().max(100_000)),
  width: typed(z.coerce.number().positive().max(100)),
  length: typed(z.coerce.number().positive().max(1_000)),
  pricePerSqm: typed(z.coerce.number().min(0).max(1_000_000)),
});

type Line = z.infer<typeof lineSchema>;

/** A load with no lines is not a load; sixty is far past a real one. */
const linesSchema = z.array(lineSchema).min(1).max(60);

/**
 * One service of a load (SPEC §3, P13): where it came from, which service, the
 * m² it is done over and its price. The m² is refused at nought after the
 * rounding the column applies, as the quotation's is.
 */
const serviceSchema = z.object({
  quotationServiceId: z.uuid().nullish(),
  serviceId: z.coerce.number().int().positive(),
  sqm: typed(
    z.coerce
      .number()
      .max(1_000_000)
      .refine((value) => round2(value) > 0),
  ),
  pricePerSqm: typed(z.coerce.number().min(0).max(1_000_000)),
});

type Service = z.infer<typeof serviceSchema>;

const servicesSchema = z.array(serviceSchema).max(20);

/**
 * A list refused, and the first box in it that is wrong — `items.7.pricePerSqm`
 * — or null when no one box is (src/lib/line-refusal.ts).
 */
type Refused = { refused: string | null };

/** A JSON list field, parsed and validated like any other input from a browser. */
function readJson<T>(formData: FormData, list: LineList, schema: z.ZodType<T>): T | Refused {
  const raw = field(formData, list);
  if (!raw) return { refused: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { refused: null };
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : { refused: firstRefusedBox(list, result.error.issues) };
}

function isRefused<T>(value: T | Refused): value is Refused {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "refused" in value;
}

/**
 * The sentence for a refused list, at the box it names where it names one — so
 * the form marks that box and the caret goes to it — and in the footer where it
 * names none (DESIGN §5, D43).
 */
function listRefusal(sentence: string, refused: Refused): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return refused.refused
    ? { ok: false, error: sentence, fieldErrors: { [refused.refused]: sentence } }
    : { ok: false, error: sentence };
}

/**
 * The lines arrive as one JSON field, for the reason in src/actions/quotations.ts.
 * The same quotation line twice is refused: the database would refuse it too, and
 * twice would double the metres it moved.
 */
function readLines(formData: FormData): Line[] | Refused {
  const lines = readJson(formData, "items", linesSchema);
  if (isRefused(lines)) return lines;
  const carried = lines.flatMap((line) => (line.quotationItemId ? [line.quotationItemId] : []));
  return new Set(carried).size === carried.length ? lines : { refused: null };
}

/** The services beside them. No field at all is no services, which is most loads. */
function readServices(formData: FormData): Service[] | Refused {
  if (!field(formData, "services")) return [];
  const rows = readJson(formData, "services", servicesSchema);
  if (isRefused(rows)) return rows;
  const carried = rows.flatMap((row) => (row.quotationServiceId ? [row.quotationServiceId] : []));
  return new Set(carried).size === carried.length ? rows : { refused: null };
}

const detailsSchema = z.object({
  shipmentMethodId: z.coerce.number().int().positive(),
  /**
   * Which store this load leaves from (SPEC §3, P12-9). One per whole dispatch,
   * never per line: the coordinator rings one store before she approves it.
   * The dialog opens on the quotation's own, and a rep changes it when the
   * panels are coming out of somewhere else.
   */
  warehouseId: z.coerce.number().int().positive(),
  destination: z.string().trim().min(1).max(500),
  /**
   * How it is being paid for (SPEC §3, P12-10, P13): the choice, the second
   * answer where the choice asks for one, and the note credit requires. Flat
   * here and checked together below, because a refusal has to name the field
   * that is wrong and a Zod refinement over the whole object names none.
   */
  paymentTerms: z.enum(PAYMENT_TERMS),
  paymentDetail: z.enum(PAYMENT_DETAILS).optional(),
  paymentNote: z.string().trim().max(1000).optional(),
});

function readDetails(formData: FormData) {
  return {
    shipmentMethodId: field(formData, "shipmentMethodId"),
    warehouseId: field(formData, "warehouseId"),
    destination: field(formData, "destination"),
    paymentTerms: field(formData, "paymentTerms"),
    paymentDetail: field(formData, "paymentDetail"),
    paymentNote: field(formData, "paymentNote"),
  };
}

type Payment = {
  paymentTerms: PaymentTerms;
  paymentDetail: PaymentDetail | null;
  paymentNote: string | null;
};

/**
 * The two rules that hold between the three answers, said once for the raise
 * and the correction alike (SPEC §3).
 *
 * The second question is answered when it is asked, with one of ITS answers —
 * "on delivery" is not a thing a bank transfer can be — and the note is there
 * for finance on credit. Where there is no second question the detail is
 * dropped rather than refused: a rep who chooses transfer, answers it, then
 * changes his mind to credit has not made a mistake, and the browser is not
 * where that gets decided (the column refuses it either way).
 */
function readPayment(
  input: z.infer<typeof detailsSchema>,
  says: { required: string; noteRequired: string },
): { ok: true; payment: Payment } | { ok: false; field: string; message: string } {
  const allowed = detailsFor(input.paymentTerms);
  if (allowed.length > 0 && (!input.paymentDetail || !allowed.includes(input.paymentDetail))) {
    return { ok: false, field: "paymentDetail", message: says.required };
  }
  const note = input.paymentNote?.trim() || null;
  if (needsNote(input.paymentTerms) && !note) {
    return { ok: false, field: "paymentNote", message: says.noteRequired };
  }
  return {
    ok: true,
    payment: {
      paymentTerms: input.paymentTerms,
      paymentDetail: allowed.length > 0 ? (input.paymentDetail ?? null) : null,
      paymentNote: note,
    },
  };
}

/** A shipment method the admin still offers — the foreign key only says it exists. */
async function methodOffered(id: number): Promise<boolean> {
  const [method] = await db
    .select({ id: shipmentMethods.id })
    .from(shipmentMethods)
    .where(and(eq(shipmentMethods.id, id), eq(shipmentMethods.active, true)))
    .limit(1);
  return Boolean(method);
}

/* -------------------------------------------------------------------------- */
/* The load, checked against its paper and written                             */
/* -------------------------------------------------------------------------- */

/** numeric(12,2) in the database, so it is rounded once, here (D6). */
function money(value: number): string {
  return round2(value).toFixed(2);
}

/** A quotation line as this transaction holds it: its words, its figures, and what is left on it. */
type PaperLine = QuotedLine & { left: number };

/** The quotation a load is checked against, read inside the transaction, after its hold. */
type Paper = { lines: PaperLine[]; services: QuotedService[] };

/**
 * The paper, as the rows say it NOW (D85): every line with the words a reader
 * sees and what is still left on it once every other waiting or approved load
 * is counted — this one's own left out, so an edit does not overspend itself —
 * and every service. Raw SQL with the tables written out, because the committed
 * figure is a correlated subquery (rules/data.md).
 */
async function paperOf(tx: Tx, quotationId: string, exclude: string | null): Promise<Paper> {
  const lines = await tx.execute<{
    id: string;
    position: number;
    colour_code: string;
    supplier: string;
    fire_rating: string;
    class: string;
    thickness: string;
    width: string;
    length: string;
    price_per_sqm: string;
    qty: number;
    committed: number;
  }>(sql`
    select qi.id, qi.position, qi.colour_code,
           s.code as supplier, fr.name as fire_rating, cl.name as class, th.mm::text as thickness,
           qi.width::text as width, qi.length::text as length, qi.price_per_sqm::text as price_per_sqm,
           qi.qty,
           (select coalesce(sum(di.qty), 0)::int
              from dispatch_items di
              join dispatches d on d.id = di.dispatch_id
             where di.quotation_item_id = qi.id
               and d.status in ('submitted', 'approved')
               and (${exclude}::uuid is null or d.id <> ${exclude}::uuid)) as committed
      from quotation_items qi
      join suppliers s on s.id = qi.supplier_id
      join fire_ratings fr on fr.id = qi.fire_rating_id
      join classes cl on cl.id = qi.class_id
      join thicknesses th on th.id = qi.thickness_id
     where qi.quotation_id = ${quotationId}::uuid
     order by qi.position
  `);
  const rows = await tx.execute<{
    id: string;
    position: number;
    service: string;
    sqm: string;
    price_per_sqm: string;
  }>(sql`
    select qs.id, qs.position, qs.service_id::text as service,
           qs.sqm::text as sqm, qs.price_per_sqm::text as price_per_sqm
      from quotation_services qs
     where qs.quotation_id = ${quotationId}::uuid
     order by qs.position
  `);
  return {
    lines: lines.rows.map((row) => ({
      id: row.id,
      position: Number(row.position),
      colourCode: row.colour_code,
      supplier: row.supplier,
      fireRating: row.fire_rating,
      class: row.class,
      thickness: row.thickness,
      width: row.width,
      length: row.length,
      pricePerSqm: row.price_per_sqm,
      left: Math.max(0, Number(row.qty) - Number(row.committed)),
    })),
    services: rows.rows.map((row) => ({
      id: row.id,
      position: Number(row.position),
      service: row.service,
      sqm: row.sqm,
      pricePerSqm: row.price_per_sqm,
    })),
  };
}

type LoadFailure = "tooMuch" | "notOnQuotation" | "serviceUnavailable" | "invalid";

type Prepared = {
  items: Omit<typeof dispatchItems.$inferInsert, "dispatchId">[];
  services: Omit<typeof dispatchServices.$inferInsert, "dispatchId">[];
  /** Null exactly when there is no paper (the column's own check). */
  difference: Difference[] | null;
};

/**
 * Checks a load against its paper and turns it into rows, or says why not.
 *
 * - A carried line must be a line of THIS quotation, and send no more than is
 *   left on it (D12). Fewer is a partial load, which is the business.
 * - A service must be one the admin still offers — or the very service the
 *   quotation line it was carried from names, which the customer was quoted
 *   whether or not it is still on the price list.
 * - A carried line keeps its quotation number; a line the rep added is numbered
 *   after the quotation's last, so "Item 4" never names two different sheets on
 *   the two papers. A direct load is numbered from one. Services the same way.
 *
 * And the difference is worked out from what this transaction holds: the words
 * for every lookup read here for both sides, never the browser's labels.
 */
async function prepareLoad(
  tx: Tx,
  paper: Paper | null,
  lines: Line[],
  loadServices: Service[],
): Promise<{ failure: LoadFailure } | Prepared> {
  const quotedLines = new Map((paper?.lines ?? []).map((line) => [line.id, line]));
  const quotedServices = new Map((paper?.services ?? []).map((service) => [service.id, service]));

  for (const line of lines) {
    if (!line.quotationItemId) continue;
    const quoted = quotedLines.get(line.quotationItemId);
    if (!quoted) return { failure: "notOnQuotation" };
    if (line.qty > quoted.left) return { failure: "tooMuch" };
  }
  for (const service of loadServices) {
    if (service.quotationServiceId && !quotedServices.has(service.quotationServiceId)) {
      return { failure: "notOnQuotation" };
    }
  }

  // The words a reader sees for every lookup the load names, read in one go each.
  const ids = (pick: (line: Line) => number) => [...new Set(lines.map(pick))];
  const [supplierRows, ratingRows, classRows, thicknessRows] = await Promise.all([
    tx
      .select({ id: suppliers.id, word: suppliers.code })
      .from(suppliers)
      .where(inArray(suppliers.id, ids((line) => line.supplierId))),
    tx
      .select({ id: fireRatings.id, word: fireRatings.name })
      .from(fireRatings)
      .where(inArray(fireRatings.id, ids((line) => line.fireRatingId))),
    tx
      .select({ id: classes.id, word: classes.name })
      .from(classes)
      .where(inArray(classes.id, ids((line) => line.classId))),
    tx
      .select({ id: thicknesses.id, word: thicknesses.mm })
      .from(thicknesses)
      .where(inArray(thicknesses.id, ids((line) => line.thicknessId))),
  ]);
  const words = (rows: { id: number; word: string }[]) =>
    new Map(rows.map((row) => [row.id, row.word]));
  const supplier = words(supplierRows);
  const rating = words(ratingRows);
  const className = words(classRows);
  const thickness = words(thicknessRows);

  const wanted = [...new Set(loadServices.map((service) => service.serviceId))];
  const offered = new Set(
    wanted.length === 0
      ? []
      : (
          await tx
            .select({ id: services.id })
            .from(services)
            .where(and(inArray(services.id, wanted), eq(services.active, true)))
        ).map((row) => row.id),
  );
  for (const service of loadServices) {
    if (offered.has(service.serviceId)) continue;
    const quoted = service.quotationServiceId
      ? quotedServices.get(service.quotationServiceId)
      : undefined;
    if (quoted?.service !== String(service.serviceId)) return { failure: "serviceUnavailable" };
  }

  const lineBase = Math.max(0, ...(paper?.lines ?? []).map((line) => line.position));
  const serviceBase = Math.max(0, ...(paper?.services ?? []).map((service) => service.position));
  let addedLines = 0;
  let addedServices = 0;

  const loadLines: LoadLine[] = [];
  const items: Prepared["items"] = [];
  for (const line of lines) {
    const quoted = line.quotationItemId ? quotedLines.get(line.quotationItemId) : undefined;
    const position = quoted ? quoted.position : lineBase + ++addedLines;
    const sheet = {
      supplier: supplier.get(line.supplierId),
      fireRating: rating.get(line.fireRatingId),
      class: className.get(line.classId),
      thickness: thickness.get(line.thicknessId),
    };
    // A lookup that is not there is a form that did not come from this app.
    if (!sheet.supplier || !sheet.fireRating || !sheet.class || !sheet.thickness) {
      return { failure: "invalid" };
    }
    loadLines.push({
      quotationItemId: quoted ? quoted.id : null,
      position,
      colourCode: line.colourCode,
      supplier: sheet.supplier,
      fireRating: sheet.fireRating,
      class: sheet.class,
      thickness: sheet.thickness,
      width: money(line.width),
      length: money(line.length),
      pricePerSqm: money(line.pricePerSqm),
    });
    items.push({
      quotationItemId: quoted ? quoted.id : null,
      position,
      colourCode: line.colourCode,
      supplierId: line.supplierId,
      fireRatingId: line.fireRatingId,
      classId: line.classId,
      thicknessId: line.thicknessId,
      qty: line.qty,
      width: money(line.width),
      length: money(line.length),
      pricePerSqm: money(line.pricePerSqm),
    });
  }

  const loadServiceRows: LoadService[] = [];
  const serviceRows: Prepared["services"] = [];
  for (const service of loadServices) {
    const quoted = service.quotationServiceId
      ? quotedServices.get(service.quotationServiceId)
      : undefined;
    const position = quoted ? quoted.position : serviceBase + ++addedServices;
    loadServiceRows.push({
      quotationServiceId: quoted ? quoted.id : null,
      position,
      service: String(service.serviceId),
      sqm: money(service.sqm),
      pricePerSqm: money(service.pricePerSqm),
    });
    serviceRows.push({
      quotationServiceId: quoted ? quoted.id : null,
      position,
      serviceId: service.serviceId,
      sqm: money(service.sqm),
      pricePerSqm: money(service.pricePerSqm),
    });
  }

  return {
    items,
    services: serviceRows,
    difference: paper
      ? differenceFrom(paper, { lines: loadLines, services: loadServiceRows })
      : null,
  };
}

/** Writes a load's rows. An edit is the whole load again: delete, then insert. */
async function writeLoad(tx: Tx, dispatchId: string, load: Prepared, replacing: boolean) {
  if (replacing) {
    await tx.delete(dispatchItems).where(eq(dispatchItems.dispatchId, dispatchId));
    await tx.delete(dispatchServices).where(eq(dispatchServices.dispatchId, dispatchId));
  }
  await tx.insert(dispatchItems).values(load.items.map((item) => ({ ...item, dispatchId })));
  if (load.services.length > 0) {
    await tx
      .insert(dispatchServices)
      .values(load.services.map((service) => ({ ...service, dispatchId })));
  }
}

/** What the trail says beside the event: the paper this load differs from, when it does. */
function differsDetail(label: string | null, difference: Difference[] | null) {
  return label && difference && difference.length > 0
    ? { differsFrom: label, differences: difference.length }
    : {};
}

type RaiseFailure = LoadFailure | "superseded" | "notDispatchable";

/**
 * A rep raises a dispatch (§3, S38, P13): against one of his customer's issued
 * quotations, prefilled from it and changed as the load needs, or direct.
 *
 * Only on work that is his: his customer, or a job he is on (D147) — and for a
 * direct load, which has no job, his customer alone. A dispatch is what moves a
 * target, so somebody else raising it would move the wrong month for the wrong
 * person.
 */
export async function requestDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");
    const te = await getTranslations("errors");

    const parsed = z
      .object({ companyId: z.uuid(), quotationId: z.uuid().optional(), ...detailsSchema.shape })
      .safeParse({
        companyId: field(formData, "companyId"),
        quotationId: field(formData, "quotationId"),
        ...readDetails(formData),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const paid = readPayment(parsed.data, {
      required: tc("required"),
      noteRequired: td("payment.noteRequired"),
    });
    if (!paid.ok) {
      return { ok: false, error: paid.message, fieldErrors: { [paid.field]: paid.message } };
    }
    const { payment } = paid;

    const lines = readLines(formData);
    if (isRefused(lines)) return listRefusal(td("needsLines"), lines);
    const loadServices = readServices(formData);
    if (isRefused(loadServices)) return listRefusal(tq("needsServices"), loadServices);
    if (!(await methodOffered(parsed.data.shipmentMethodId))) return { ok: false, error: tc("invalid") };

    /*
     * Where it comes from: the quotation named, which must be this customer's —
     * a form that names another customer's paper is refused rather than
     * believed — or nothing, which is a direct load.
     */
    const { companyId, quotationId } = parsed.data;
    let paper: {
      id: string;
      label: string;
      projectId: string;
    } | null = null;

    if (quotationId) {
      const [quotation] = await db
        .select({
          id: quotations.id,
          number: quotations.number,
          revision: quotations.revision,
          status: quotations.status,
          projectId: quotations.projectId,
          companyId: quotations.companyId,
          companyRepId: companies.repId,
          companyArchived: companies.archivedAt,
          projectRepId: projects.repId,
          onProject: onProjectSql(actor, sql`quotations.project_id`).mapWith(Boolean),
        })
        .from(quotations)
        .innerJoin(companies, eq(companies.id, quotations.companyId))
        .innerJoin(projects, eq(projects.id, quotations.projectId))
        .where(eq(quotations.id, quotationId))
        .limit(1);
      if (!quotation || quotation.companyId !== companyId) {
        return { ok: false, error: td("quotationNotFound") };
      }
      if (!mayRaiseFor(actor, quotation.companyRepId, quotation.projectRepId, quotation.onProject))
        throw new NotAllowed();
      if (quotation.companyArchived) return { ok: false, error: td("quotationNotFound") };
      // S38: the paper has to exist before goods move against it. A request that
      // has been sent back or refused is not a quotation yet.
      if (!dispatchable(quotation.status as QuotationStatus)) {
        return { ok: false, error: td("quotationNotIssued") };
      }
      paper = {
        id: quotation.id,
        label: quotationLabel(quotation.number, quotation.revision),
        projectId: quotation.projectId,
      };
    } else {
      const [company] = await db
        .select({ repId: companies.repId, archivedAt: companies.archivedAt })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!company) return { ok: false, error: te("companyNotFound") };
      // No job under it, so the customer alone decides who may load it (SPEC §3, P13).
      if (!mayRaiseFor(actor, company.repId, null)) throw new NotAllowed();
      if (company.archivedAt) return { ok: false, error: te("companyArchived") };
    }

    // Whose metres these are (D148). Resolved from the job rather than trusted
    // from the form: the answer arrived as a name the dialog offered a minute
    // ago, and a share is a permission that can be taken away in a minute. A
    // name that is not on the job now is a refusal, not a silent fallback. A
    // direct load has no job, so it is his.
    const credit = await resolveCredit(paper?.projectId ?? null, actor.id, field(formData, "credit"));
    if (!credit) return { ok: false, error: tc("credit.notOnProject") };

    const outcome = await db.transaction(async (tx): Promise<{ failure: RaiseFailure } | { id: string }> => {
      let held: QuotationStatus | null = null;
      let read: Paper | null = null;
      if (paper) {
        // The quotation row is held for the rest of the transaction, so two
        // requests against it run one after the other and the second reads the
        // lines the first wrote (D85). A revision raised meanwhile holds the
        // same row, which is why "still live" is asked after the hold — and so
        // is the status, which could have moved since the read above (P12-10).
        held = await holdQuotation(tx, paper.id);
        if (!held || !dispatchable(held)) return { failure: "notDispatchable" };
        // Only the live revision: once it has been revised the customer holds
        // the new paper, and goods sent against the old one move on a price
        // nobody agreed (S34, S35, D36).
        if (!(await isLiveRevision(tx, paper.id))) return { failure: "superseded" };
        read = await paperOf(tx, paper.id, null);
      }

      // Checked before anything is written, so a refusal is a sentence rather
      // than a rolled-back transaction wearing "something went wrong".
      const load = await prepareLoad(tx, read, lines, loadServices);
      if ("failure" in load) return load;

      const [row] = await tx
        .insert(dispatches)
        .values({
          number: sql`nextval('dispatch_numbers')`,
          companyId,
          projectId: paper?.projectId ?? null,
          quotationId: paper?.id ?? null,
          repId: actor.id,
          raisedById: actor.id,
          // What the rep changed from the paper, recorded for the desk and for
          // later (SPEC §3, P13); null exactly when there is no paper.
          quotationDifference: load.difference,
          shipmentMethodId: parsed.data.shipmentMethodId,
          warehouseId: parsed.data.warehouseId,
          destination: parsed.data.destination,
          ...payment,
        })
        .returning({ id: dispatches.id, number: dispatches.number });

      await writeLoad(tx, row.id, load, false);

      // Whose metres these are, frozen at the raise and never inherited
      // (D148): one name on a job one rep works, and on a shared one whatever
      // he answered above.
      await creditDispatch(tx, row.id, credit);

      /*
       * "A dispatch implies the customer accepted that quotation" (SPEC §3).
       *
       * Sending goods against a price is the strongest answer a customer gives,
       * and a rep had to remember to record a second, weaker one afterwards.
       * Recorded here, under the hold the dispatch is written under, so the two
       * facts cannot disagree. Not gated by "only its raiser may decide": a rep
       * on a shared job who sends the goods is recording what the CUSTOMER did.
       * A later refusal by the desk does not undo it — she refuses the load, and
       * the customer's yes is not hers to withdraw. No second notice: "he
       * accepted" beside "he has sent you a request against it" is one event
       * announced twice (D79).
       */
      if (paper && held === "issued") {
        await tx
          .update(quotations)
          .set({ status: "accepted", decidedAt: new Date() })
          .where(eq(quotations.id, paper.id));

        await tx.insert(auditLog).values({
          userId: actor.id,
          action: quotationEvent("accepted"),
          recordType: "quotation",
          recordId: paper.id,
          details: { impliedBy: "dispatch" },
        });

        // What "issued" was telling him to chase has happened (D79).
        await clearNotifications(tx, { type: "quotation", id: paper.id }, ["quotationIssued"]);

        await notifyLive(tx, await liveAudienceForCompany(companyId, actor.id, ["coordinator"]), {
          type: "quotation",
          id: paper.id,
          number: paper.label,
          status: "accepted",
        });
      }

      const label = dispatchLabel(row.number);
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("request"),
        recordType: "dispatch",
        recordId: row.id,
        details: {
          quotationId: paper?.id ?? null,
          lines: load.items.length,
          services: load.services.length,
          // "Differs from Q-12" on the trail, from the moment it was raised.
          ...differsDetail(paper?.label ?? null, load.difference),
        },
      });

      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: "dispatchRequested",
          params: { label, repId: actor.id },
          link: `/queue?dispatch=${row.id}`,
          subject: { type: "dispatch", id: row.id },
        });
      }

      await notifyLive(tx, await liveAudienceForCompany(companyId, actor.id, ["coordinator"]), {
        type: "dispatch",
        id: row.id,
        number: label,
        status: "submitted",
      });
      return { id: row.id };
    });

    if ("failure" in outcome) return { ok: false, error: refusalOf(outcome.failure, td) };

    revalidateChain();
    return { ok: true, data: { dispatchId: outcome.id } };
  }, ...SELLING_ROLES);
}

/** A load refused before it was written, in the app's own words. */
function refusalOf(failure: RaiseFailure | "answered", td: (key: string) => string): string {
  switch (failure) {
    case "tooMuch":
      return td("tooMuch");
    case "notOnQuotation":
      return td("notOnQuotation");
    case "serviceUnavailable":
      return td("serviceUnavailable");
    case "invalid":
      return td("needsLines");
    case "superseded":
      return td("supersededQuotation");
    case "notDispatchable":
      return td("quotationNotIssued");
    case "answered":
      return td("notWaiting");
  }
}

/**
 * The rep corrects his own request while it is waiting on the desk, or after
 * the desk refused it, and it goes back on her desk (SPEC §3, P12-10, P13) —
 * direct ones included. The lines and the services are the whole load again, the
 * quantities are checked again, and what differs from the quotation is worked
 * out again from the rows as they are now.
 *
 * Once it is approved it is finished; a change after that is a new dispatch
 * (S41).
 */
export async function updateDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const parsed = z
      .object({ dispatchId: z.uuid(), ...detailsSchema.shape })
      .safeParse({ dispatchId: field(formData, "dispatchId"), ...readDetails(formData) });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const paid = readPayment(parsed.data, {
      required: tc("required"),
      noteRequired: td("payment.noteRequired"),
    });
    if (!paid.ok) {
      return { ok: false, error: paid.message, fieldErrors: { [paid.field]: paid.message } };
    }
    const { payment } = paid;

    const lines = readLines(formData);
    if (isRefused(lines)) return listRefusal(td("needsLines"), lines);
    const loadServices = readServices(formData);
    if (isRefused(loadServices)) return listRefusal(tq("needsServices"), loadServices);
    if (!(await methodOffered(parsed.data.shipmentMethodId))) return { ok: false, error: tc("invalid") };

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (!mayRaiseFor(actor, dispatch.companyRepId, dispatch.projectRepId, dispatch.onProject))
      throw new NotAllowed();
    // Waiting on the desk, or sent back by it (SPEC §3, P12-10). Refusing a
    // load is the dispatch chain's Send back — §2 S53 calls a request sent back
    // or refused one kind of event — and a refusal that cannot be answered
    // means retyping every line, now that nothing is carried forward.
    if (!withTheRep(dispatch.status)) return { ok: false, error: td("notWaiting") };

    // The same question the raise asked, answered again (D148). A dispatch
    // still waiting has moved nothing and earned nobody anything, so for as
    // long as a rep may correct its quantities he may correct who they count
    // for; the approval is what freezes both.
    const credit = await resolveCredit(dispatch.projectId, actor.id, field(formData, "credit"));
    if (!credit) return { ok: false, error: tc("credit.notOnProject") };

    const failure = await db.transaction(async (tx): Promise<RaiseFailure | "answered" | null> => {
      // Held, and the state read AFTER the hold: approved while he was typing
      // is not his to change, and the lines of the quotation are read after it
      // too, as for a new request (D85).
      const held = await holdDispatch(tx, dispatch.id);
      // Null is a row that is not there any more, which is not his either.
      if (!held || !withTheRep(held)) return "answered";
      const cameBack = held === "refused";

      let read: Paper | null = null;
      if (dispatch.quotationId) {
        const parent = await holdQuotation(tx, dispatch.quotationId);
        // A refused request may have sat for a week, and the paper under it can
        // have been revised or withdrawn since (S34, S38).
        if (cameBack && (!parent || !dispatchable(parent))) return "notDispatchable";
        if (cameBack && !(await isLiveRevision(tx, dispatch.quotationId))) return "superseded";
        read = await paperOf(tx, dispatch.quotationId, dispatch.id);
      }

      const prepared = await prepareLoad(tx, read, lines, loadServices);
      if ("failure" in prepared) return prepared.failure;
      await writeLoad(tx, dispatch.id, prepared, true);
      await creditDispatch(tx, dispatch.id, credit);

      await tx
        .update(dispatches)
        .set({
          shipmentMethodId: parsed.data.shipmentMethodId,
          // Correctable for exactly as long as the quantities beside it are: a
          // request waiting on the desk has moved nothing yet (SPEC §3, P12-9).
          warehouseId: parsed.data.warehouseId,
          destination: parsed.data.destination,
          ...payment,
          // Worked out again: what he changed now is what the desk reads now.
          quotationDifference: prepared.difference,
          // Back on the desk, and her words go with the state they explained:
          // a request he has already fixed must not still say what was wrong
          // with it (D72, and the constraint that holds the pair together).
          status: "submitted",
          refuseReason: null,
          updatedAt: new Date(),
        })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("update"),
        recordType: "dispatch",
        recordId: dispatch.id,
        // Where it came from, always — the quotation's own update row has said
        // it that way since P9, and the desk's "arrived today" reads it back to
        // count a refusal he has fixed as work landing again (P12-10).
        details: {
          lines: prepared.items.length,
          services: prepared.services.length,
          from: held,
          ...differsDetail(dispatch.quotationLabel, prepared.difference),
        },
      });

      // Only news to her if it had been sent back: an edit to something already
      // on her desk is the same request with different lines. The mirror of
      // what a fixed quotation does (src/actions/quotations.ts).
      if (cameBack) {
        // He has done what the refusal asked, so it stops being a row (D79).
        await clearNotifications(tx, { type: "dispatch", id: dispatch.id }, ["dispatchRefused"]);
        for (const userId of await coordinators()) {
          await createNotification(tx, {
            userId,
            kind: "dispatchRequested",
            params: { label: dispatch.label, repId: actor.id },
            link: `/queue?dispatch=${dispatch.id}`,
            subject: { type: "dispatch", id: dispatch.id },
          });
        }
      }

      await notifyLive(tx, await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator"]), {
        type: "dispatch",
        id: dispatch.id,
        number: dispatch.label,
        status: "submitted",
      });
      return null;
    });

    if (failure) return { ok: false, error: refusalOf(failure, td) };

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, ...SELLING_ROLES);
}

/* -------------------------------------------------------------------------- */
/* What the request dialog reads when it opens                                 */
/* -------------------------------------------------------------------------- */

/** One line of a quotation, as the dispatch dialog opens on it. */
export type PrefillLine = {
  quotationItemId: string;
  position: number;
  quotedQty: number;
  /** What a load may still send on it, this dispatch's own left out (D12). */
  left: number;
  /** Its nine inputs, as a form holds them — the quantity is the whole line. */
  draft: DraftLine;
};

export type PrefillService = {
  quotationServiceId: string;
  position: number;
  /**
   * Which service, in the reader's language. The form's list is the services the
   * admin still offers, and a carried one he has since switched off must still
   * read as itself on the row it came on — the action accepts it there — rather
   * than as an empty "Choose…" a rep would fill with something false.
   */
  name: string;
  draft: DraftService;
};

/**
 * Everything a load prefilled from one quotation opens on (SPEC §3, P13): the
 * paper's customer, job and store, EVERY line with what is left on it, and every
 * service. A child reading its own parent, which is not the carrying forward §3
 * forbids (D159, D163).
 */
export type DispatchPrefill = {
  quotationId: string;
  label: string;
  /** SMAC's number for the paper, which is what "Differs from 4541" names it by (D179). */
  smacNumber: string | null;
  companyId: string;
  companyName: string;
  projectId: string;
  projectName: string;
  warehouseId: string;
  lines: PrefillLine[];
  services: PrefillService[];
};

/**
 * The paper a load is prefilled from. Read fresh each time the dialog asks,
 * because what is left moves every time anybody raises a dispatch anywhere; the
 * raise checks it again inside its own transaction, so this is the courtesy and
 * that is the law. Authorized by reading the quotation the drawer's way, so a
 * rep who may not open the paper may not learn what is on it either. `dispatchId`
 * leaves an edited dispatch's own quantities out of what is spoken for.
 */
export async function dispatchPrefillAction(input: unknown): Promise<ActionResult<DispatchPrefill>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const parsed = z
      .object({ quotationId: z.uuid(), dispatchId: z.uuid().optional() })
      .safeParse(input ?? {});
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    const quotation = await getQuotation(actor, parsed.data.quotationId);
    if (!quotation) return { ok: false, error: tc("somethingWrong") };
    const left = new Map(
      (await remainingOnQuotation(quotation.id, parsed.data.dispatchId)).map((line) => [
        line.quotationItemId,
        line.remainingQty,
      ]),
    );
    const lines = draftLinesFrom(quotation.items);
    const serviceDrafts = draftServicesFrom(quotation.services);

    return {
      ok: true,
      data: {
        quotationId: quotation.id,
        label: quotation.label,
        smacNumber: quotation.smacNumber,
        companyId: quotation.companyId,
        companyName: quotation.companyName,
        projectId: quotation.projectId,
        projectName: quotation.projectName,
        warehouseId: String(quotation.warehouseId),
        lines: quotation.items.map((item, index) => ({
          quotationItemId: item.id,
          position: item.position,
          quotedQty: item.qty,
          left: left.get(item.id) ?? 0,
          draft: lines[index],
        })),
        services: quotation.services.map((service, index) => ({
          quotationServiceId: service.id,
          position: service.position,
          name: service.name,
          draft: serviceDrafts[index],
        })),
      },
    };
  });
}

/**
 * The customers this person may load a truck for with no paper behind it (SPEC
 * §3, P13) — his own, live ones (`directDispatchCompanies`). The dialog merges
 * them with the customers of the papers he may send against, and offers Direct
 * only on these.
 */
export async function directCompaniesAction(): Promise<
  ActionResult<{ value: string; label: string }[]>
> {
  return guard(async (actor) => ({
    ok: true,
    data: (await directDispatchCompanies(actor)).map((row) => ({ value: row.id, label: row.name })),
  }));
}


/**
 * The refusal for a number another dispatch carries: at the field, naming the
 * holder (D88) — the dispatch side of `taken` in src/actions/quotations.ts.
 */
async function taken(
  number: string,
  say: (holder: string | null) => string,
): Promise<ActionResult<{ dispatchId: string }>> {
  const sentence = say(await smacHolder("dispatch", number));
  return { ok: false, error: sentence, fieldErrors: { smacDispatchNumber: sentence } };
}

/**
 * The coordinator approves it with SMAC's dispatch number (S39).
 *
 * This is the event the whole month rests on: the approved m² counts toward the
 * rep's target from here, and the project is won from here (S21, S41, S43).
 * Both are read back out of this row rather than written anywhere else.
 */
export async function approveDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");

    const parsed = z
      .object({ dispatchId: z.uuid(), smacDispatchNumber: z.string().trim().min(1).max(60) })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        smacDispatchNumber: field(formData, "smacDispatchNumber"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: td("numberRequired"),
        fieldErrors: { smacDispatchNumber: td("numberRequired") },
      };
    }

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (dispatch.status !== "submitted") return { ok: false, error: td("notWaiting") };

    const outcome = await db.transaction(async (tx) => {
      // Held, and still waiting (D85). And still against the live revision:
      // D36 was asked when the dispatch was raised and never again, so a
      // quotation revised while it sat in the queue could be approved on a
      // price the customer no longer holds.
      if ((await holdDispatch(tx, dispatch.id)) !== "submitted") return "answered" as const;
      // A direct dispatch has no paper to be superseded (SPEC §3, P13).
      if (dispatch.quotationId && !(await isLiveRevision(tx, dispatch.quotationId)))
        return "superseded" as const;
      await tx
        .update(dispatches)
        .set({
          status: "approved",
          smacDispatchNumber: parsed.data.smacDispatchNumber,
          approvedAt: new Date(),
          refuseReason: null,
        })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("approve"),
        recordType: "dispatch",
        recordId: dispatch.id,
        details: { smacDispatchNumber: parsed.data.smacDispatchNumber },
      });

      // Answered, so it is off her queue and off her bell (D79).
      await clearNotifications(tx, { type: "dispatch", id: dispatch.id }, [
        "dispatchRequested",
      ]);

      await createNotification(tx, {
        userId: dispatch.companyRepId,
        kind: "dispatchApproved",
        params: { label: dispatch.label, smacNumber: parsed.data.smacDispatchNumber },
        link: `/dispatches?open=${dispatch.id}`,
        subject: { type: "dispatch", id: dispatch.id },
      });

      await notifyLive(
        tx,
        await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator", "manager"]),
        { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "approved" },
      );
      return "ok" as const;
    }).catch((error: unknown) => {
      // The index fired: the number is on another dispatch (D88).
      if (isSmacClash(error, "dispatch")) return "clash" as const;
      throw error;
    });
    if (outcome === "clash") {
      return taken(parsed.data.smacDispatchNumber, (holder) =>
        holder
          ? td("smacTaken", { number: parsed.data.smacDispatchNumber, label: holder })
          : td("smacTakenSomewhere", { number: parsed.data.smacDispatchNumber }),
      );
    }
    if (outcome === "answered") return { ok: false, error: td("notWaiting") };
    if (outcome === "superseded") return { ok: false, error: td("supersededQuotation") };

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "coordinator");
}

/**
 * The coordinator corrects a SMAC dispatch number she typed wrong (D88). The
 * row is held (D85); the status, the instant and the month it counts in do not
 * move — the number is a label on an approval, not the approval. The old one
 * stays in the audit log with the new one beside it.
 */
export async function correctDispatchNumberAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");

    const parsed = z
      .object({ dispatchId: z.uuid(), smacDispatchNumber: z.string().trim().min(1).max(60) })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        smacDispatchNumber: field(formData, "smacDispatchNumber"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: td("numberRequired"),
        fieldErrors: { smacDispatchNumber: td("numberRequired") },
      };
    }

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (dispatch.status !== "approved") return { ok: false, error: td("notApproved") };

    const outcome = await db
      .transaction(async (tx) => {
        if ((await holdDispatch(tx, dispatch.id)) !== "approved") return "notApproved" as const;

        const [current] = await tx
          .select({ smacDispatchNumber: dispatches.smacDispatchNumber })
          .from(dispatches)
          .where(eq(dispatches.id, dispatch.id));
        const from = current?.smacDispatchNumber ?? null;
        if (from === parsed.data.smacDispatchNumber) return "same" as const;

        await tx
          .update(dispatches)
          .set({ smacDispatchNumber: parsed.data.smacDispatchNumber })
          .where(eq(dispatches.id, dispatch.id));

        await tx.insert(auditLog).values({
          userId: actor.id,
          action: dispatchEvent("correctNumber"),
          recordType: "dispatch",
          recordId: dispatch.id,
          details: { from, to: parsed.data.smacDispatchNumber },
        });

        await notifyLive(
          tx,
          await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator", "manager"]),
          { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "approved" },
        );
        return "ok" as const;
      })
      .catch((error: unknown) => {
        if (isSmacClash(error, "dispatch")) return "clash" as const;
        throw error;
      });
    if (outcome === "clash") {
      return taken(parsed.data.smacDispatchNumber, (holder) =>
        holder
          ? td("smacTaken", { number: parsed.data.smacDispatchNumber, label: holder })
          : td("smacTakenSomewhere", { number: parsed.data.smacDispatchNumber }),
      );
    }
    if (outcome === "notApproved") return { ok: false, error: td("notApproved") };
    if (outcome === "same") {
      return {
        ok: false,
        error: td("sameNumber"),
        fieldErrors: { smacDispatchNumber: td("sameNumber") },
      };
    }

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "coordinator");
}

/**
 * The coordinator refuses it, with a reason (S39). The reason is not optional:
 * a decision that ends somebody's work reaches them with it written down (S53).
 *
 * Refusing gives the quantities back — a refused request has spent nothing, so
 * the same panels are available to the next one (D12).
 */
export async function refuseDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const td = await getTranslations("dispatches");

    const parsed = z
      .object({ dispatchId: z.uuid(), reason: z.string().trim().min(1).max(2000) })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        reason: field(formData, "reason"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: t("reasonRequired"),
        fieldErrors: { reason: t("reasonRequired") },
      };
    }

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (dispatch.status !== "submitted") return { ok: false, error: td("notWaiting") };

    const held = await db.transaction(async (tx) => {
      // Held, and still waiting (D85).
      if ((await holdDispatch(tx, dispatch.id)) !== "submitted") return false;
      await tx
        .update(dispatches)
        .set({ status: "refused", refuseReason: parsed.data.reason })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: dispatchEvent("refuse"),
        recordType: "dispatch",
        recordId: dispatch.id,
        details: { reason: parsed.data.reason },
      });

      // Refusing it is answering it too; what happens next is a new dispatch,
      // which is a new row and a new notice (D79).
      await clearNotifications(tx, { type: "dispatch", id: dispatch.id }, [
        "dispatchRequested",
      ]);

      await createNotification(tx, {
        userId: dispatch.companyRepId,
        kind: "dispatchRefused",
        params: { label: dispatch.label, reason: parsed.data.reason },
        link: `/dispatches?open=${dispatch.id}`,
        subject: { type: "dispatch", id: dispatch.id },
      });

      await notifyLive(
        tx,
        await liveAudienceForCompany(dispatch.companyId, actor.id, ["coordinator"]),
        { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "refused" },
      );
      return true;
    });
    if (!held) return { ok: false, error: td("notWaiting") };

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "coordinator");
}
