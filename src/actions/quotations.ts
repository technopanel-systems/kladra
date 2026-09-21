"use server";

/**
 * The quotation chain (SPEC S28–S36, §3).
 *
 * A rep asks, with all the lines. The coordinator does the real work in SMAC
 * and types the number back, which is the moment it is issued — or she sends it
 * back with a reason, which is the moment it is the rep's again. After it is
 * issued the customer answers, and that answer is the rep's to record.
 *
 * Every one of those is a decision that ends somebody's work, so every one of
 * them carries a written reason to the person it lands on (S53). That is what
 * the `createNotification` calls are: not a courtesy, the requirement.
 *
 * Kladra prices nothing. It stores what was asked for and what SMAC called it;
 * where the two disagree, SMAC is right (S31).
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  companies,
  contacts,
  projects,
  quotationItems,
  quotationServices,
  quotations,
  services,
  users,
} from "@/db/schema";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { creditQuotation, resolveCredit } from "@/lib/credit-rows";
import { knownWarehouseIds, setWarehouses, warehouseIdsField } from "@/lib/warehouses";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { firstRefusedBox, lineFieldKey } from "@/lib/line-refusal";
import { liveAudienceForCompany, notifyLive } from "@/lib/live";
import { round2 } from "@/lib/money";
import { clearNotifications, createNotification } from "@/lib/notify";
import { holdQuotation, isLiveRevision } from "@/lib/hold";
import { quotationLabel } from "@/lib/labels";
import { isSmacClash, smacHolder } from "@/lib/smac";
import { quotationEvent } from "@/lib/quotation-events";
import { issuesOwnQuotations, SELLING_ROLES } from "@/lib/floor";
import {
  notTheirs,
  raisedForOptions,
  raisedForPeople,
  raisesOnBehalf,
  resolveRaiser,
} from "@/lib/on-behalf";
import { RAISED_FOR_NOBODY, type QuotationOnBehalf } from "@/lib/on-behalf-option";
import { quotationTargets } from "@/lib/pickers";
import { activeServices, seesEveryQuotation, type QuotationStatus } from "@/lib/quotations";
import { withTheRep } from "@/lib/with-the-rep";
import type { ActionResult, Role, SessionUser } from "@/lib/types";
import {
  mayRaiseFor,
  maySeeCompany,
  onCompanySql,
  onProjectSql,
} from "@/lib/visibility";
import { mayWrite } from "@/lib/floor";
import { safeError } from "@/lib/log-safe";

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
  ...roles: Role[]
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("quotations action failed", safeError(error));
    return { ok: false, error: t("somethingWrong") };
  }
}

/** Every screen a quotation shows on, including the two it is raised from. */
function revalidateChain(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/quotations", "page");
  revalidatePath("/[locale]/queue", "page");
  revalidatePath("/[locale]/companies", "page");
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
  revision: number;
  label: string;
  status: QuotationStatus;
  companyId: string;
  companyName: string;
  projectId: string;
  repId: string;
  /** The rep who owns the COMPANY — whose floor it is, and who may therefore see it. */
  companyRepId: string;
  /** The rep whose PROJECT it is, and whether this actor is on that job (D147). */
  projectRepId: string;
  shared: boolean;
  onProject: boolean;
};

/**
 * One quotation, or NotAllowed. Never says whether a quotation it will not show
 * exists: a rep asking for somebody else's id gets the same answer either way.
 */
async function load(actor: SessionUser, quotationId: string): Promise<Loaded | null> {
  const [row] = await db
    .select({
      id: quotations.id,
      number: quotations.number,
      revision: quotations.revision,
      status: quotations.status,
      companyId: quotations.companyId,
      companyName: companies.name,
      projectId: quotations.projectId,
      repId: quotations.repId,
      companyRepId: companies.repId,
      projectRepId: projects.repId,
      shared: onCompanySql(actor, sql`companies.id`).mapWith(Boolean),
      onProject: onProjectSql(actor, sql`quotations.project_id`).mapWith(Boolean),
    })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .innerJoin(projects, eq(projects.id, quotations.projectId))
    .where(eq(quotations.id, quotationId))
    .limit(1);

  if (!row) return null;
  if (!seesEveryQuotation(actor) && !maySeeCompany(actor, row.companyRepId, row.shared))
    throw new NotAllowed();
  return {
    ...row,
    status: row.status as QuotationStatus,
    label: quotationLabel(row.number, row.revision),
  };
}

/** The states in which a quotation carries SMAC's number (`quotations_smac_check`). */
const NUMBERED: readonly QuotationStatus[] = ["issued", "accepted", "rejected"];

/**
 * The refusal for a number another quotation carries: at the field, naming the
 * holder (D88). `say` builds the sentence in the caller's namespace; the holder
 * is looked up after the transaction has rolled back.
 */
async function taken(
  number: string,
  say: (holder: string | null) => string,
): Promise<ActionResult<{ quotationId: string }>> {
  const sentence = say(await smacHolder("quotation", number));
  return { ok: false, error: sentence, fieldErrors: { smacNumber: sentence } };
}

/**
 * Is this person putting the paper out herself, and under which number?
 *
 * The coordinator does not ask the desk for a price; she IS the desk (SPEC §3),
 * so her own quotation is requested and issued in one act. Anybody else asks
 * and waits, and `kind: "no"` is that ordinary path.
 *
 * The SMAC number is required of exactly this path, because the schema requires
 * one of anything issued. Refused here it lands on the field the person typed
 * in; refused by the constraint it is "something went wrong" about a box they
 * can still see (D88).
 */
type SelfIssue = { kind: "no" } | { kind: "yes"; smacNumber: string } | { kind: "missing" };

function selfIssue(actor: SessionUser, formData: FormData): SelfIssue {
  if (!issuesOwnQuotations(actor.role)) return { kind: "no" };
  const parsed = z.string().trim().min(1).max(60).safeParse(field(formData, "smacNumber"));
  return parsed.success ? { kind: "yes", smacNumber: parsed.data } : { kind: "missing" };
}

/** What an insert writes when the raiser issues it herself, and nothing when she does not. */
function issuedNow(self: SelfIssue) {
  return self.kind === "yes"
    ? { status: "issued" as const, smacNumber: self.smacNumber, issuedAt: new Date(), selfIssued: true }
    : {};
}

const idSchema = z.uuid();

/**
 * A figure as it was typed. Blank is missing, never nought: a coerced "" is 0,
 * so a line whose price box was left empty was saved at 0.00 SAR — refused at
 * no box, since nothing was refused (P13 review; the load's form already asks
 * it this way, src/actions/dispatches.ts). A price of 0 typed as 0 is still one.
 */
function typed<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema,
  );
}

/**
 * One line of a quotation (SPEC §3, S32).
 *
 * m² is never in here: it is `width × length × qty`, computed by the database
 * as a generated column, so there is nowhere for a typed figure to disagree
 * with the arithmetic (S31).
 */
const itemSchema = z.object({
  colourCode: z.string().trim().min(1).max(40),
  supplierId: z.coerce.number().int().positive(),
  fireRatingId: z.coerce.number().int().positive(),
  classId: z.coerce.number().int().positive(),
  thicknessId: z.coerce.number().int().positive(),
  qty: typed(z.coerce.number().int().positive().max(100_000)),
  width: typed(z.coerce.number().positive().max(100)),
  length: typed(z.coerce.number().positive().max(1_000)),
  pricePerSqm: typed(z.coerce.number().min(0).max(1_000_000)),
  // The stored line this one opened on, when the form opened on a paper: what
  // has gone out is counted against where a line BEGAN (`origin_item_id`), and
  // only the form knows which of its lines is the old one carried through and
  // which he added. Never trusted as it arrives — `originsOf` keeps an id only
  // when it is a line of the paper being edited or revised.
  fromItemId: typed(z.uuid().optional()),
});

type Item = z.infer<typeof itemSchema>;

/** A quotation with no lines is not a quotation; sixty is far past a real one. */
const itemsSchema = z.array(itemSchema).min(1).max(60);

/**
 * The lines arrive as one JSON field rather than as `items[0][width]`.
 *
 * A quotation has as many lines as the rep needs, and FormData has no shape for
 * that which survives a round trip intact. The value is parsed and validated
 * here like any other input — it is a string from a browser either way.
 */
function readItems(formData: FormData): Item[] | Refused {
  const raw = field(formData, "items");
  if (!raw) return { refused: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { refused: null };
  }
  const result = itemsSchema.safeParse(parsed);
  // The first box that is wrong, by the key the form marks it with — so a blank
  // price on the eighth line is refused AT the eighth line (src/lib/line-refusal.ts).
  return result.success ? result.data : { refused: firstRefusedBox("items", result.error.issues) };
}

/** A list refused, and the first box in it that is wrong, or null when no one box is. */
type Refused = { refused: string | null };

function isRefused<T>(value: T | Refused): value is Refused {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "refused" in value;
}

/**
 * The sentence for a refused list, at the box it names where it names one — the
 * form marks it and the caret goes there — and in the footer where it names none
 * (DESIGN §5, D43).
 */
function listRefusal(
  sentence: string,
  refused: Refused,
): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return refused.refused
    ? { ok: false, error: sentence, fieldErrors: { [refused.refused]: sentence } }
    : { ok: false, error: sentence };
}

/** numeric(12,2) in the database, so it is rounded once, here (D6). */
function money(value: number): string {
  return round2(value).toFixed(2);
}

/**
 * Where each line of one paper began: its own `origin_item_id`, or itself.
 *
 * Read BEFORE the lines are rewritten, inside the same transaction. A revision
 * asks it of the paper it revises and an edit asks it of the paper being edited,
 * so an id the form sends is only ever honoured when it names a line of that
 * paper — anything else began here.
 */
async function originsOf(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  quotationId: string,
): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: quotationItems.id, originItemId: quotationItems.originItemId })
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, quotationId));
  return new Map(rows.map((row) => [row.id, row.originItemId ?? row.id]));
}

async function insertItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  quotationId: string,
  items: Item[],
  origins: Map<string, string> = new Map(),
): Promise<void> {
  await tx.insert(quotationItems).values(
    items.map((item, index) => ({
      quotationId,
      position: index + 1,
      originItemId: (item.fromItemId && origins.get(item.fromItemId)) || null,
      colourCode: item.colourCode,
      supplierId: item.supplierId,
      fireRatingId: item.fireRatingId,
      classId: item.classId,
      thicknessId: item.thicknessId,
      qty: item.qty,
      width: money(item.width),
      length: money(item.length),
      pricePerSqm: money(item.pricePerSqm),
    })),
  );
}

/**
 * One service on a quotation (SPEC §3, P13): which one, the m² it is done over,
 * and its price per m².
 *
 * The m² is TYPED here, unlike a line's, because the area a cutting or a
 * fabrication covers is not a sheet's area. It is refused at nought as the
 * column refuses it — after the rounding the column will apply, so 0.004 m² is
 * not waved through here to die on the check constraint as "something went
 * wrong".
 */
const serviceSchema = z.object({
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

/** None is the ordinary quotation; twenty is far past a real one. */
const servicesSchema = z.array(serviceSchema).max(20);

/**
 * The services arrive as one JSON field beside the lines, for the same reason
 * the lines do. A form that sends no field at all has no services — which is
 * every quotation raised before P13 had a section for them — while a field that
 * is there and does not parse is refused rather than read as none.
 *
 * And each one must be a service the admin still offers. The foreign key only
 * says the row exists; a service turned off in Lookups is not something a new
 * price may be written for, including on an edit or a revision of paper that
 * named it when it was still on.
 */
async function readServices(
  formData: FormData,
): Promise<Service[] | Refused | { unavailable: string }> {
  const raw = field(formData, "services");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { refused: null };
  }
  const result = servicesSchema.safeParse(parsed);
  if (!result.success) return { refused: firstRefusedBox("services", result.error.issues) };
  if (result.data.length === 0) return [];

  const wanted = [...new Set(result.data.map((service) => service.serviceId))];
  const offered = new Set(
    (
      await db
        .select({ id: services.id })
        .from(services)
        .where(and(inArray(services.id, wanted), eq(services.active, true)))
    ).map((row) => row.id),
  );
  // The first one that is no longer offered, named at its own choice (D175).
  const gone = result.data.findIndex((service) => !offered.has(service.serviceId));
  return gone === -1 ? result.data : { unavailable: lineFieldKey("services", gone, "serviceId") };
}

/** The refusal for a service the admin has switched off, at the row that names it (D175). */
function unavailableRefusal(sentence: string, key: string) {
  return { ok: false as const, error: sentence, fieldErrors: { [key]: sentence } };
}

/**
 * Written beside the lines, in the same transaction, the same way: positions from
 * the order the form sent them in, and an edit deletes and inserts rather than
 * renumbering in place against the unique position index.
 */
async function insertServices(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  quotationId: string,
  rows: Service[],
): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(quotationServices).values(
    rows.map((service, index) => ({
      quotationId,
      position: index + 1,
      serviceId: service.serviceId,
      sqm: money(service.sqm),
      pricePerSqm: money(service.pricePerSqm),
    })),
  );
}

/**
 * The services the request dialog offers (SPEC §3, P13), as its searchable
 * choice takes them: the admin's order, the reader's language, the other script
 * to search on.
 *
 * Asked each time the dialog opens rather than cached with the four line lists:
 * three rows are nothing to fetch, and a service the admin turned off an hour ago
 * should stop being offered without anybody reloading. Any signed-in person may
 * ask — the list is the business's price book headings, not anybody's record.
 */
export async function quotationServiceChoicesAction(): Promise<
  ActionResult<{ value: string; label: string; keywords: string }[]>
> {
  const t = await getTranslations("common");
  try {
    await requireActor();
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    return { ok: false, error: t("somethingWrong") };
  }
  try {
    const rows = await activeServices();
    return {
      ok: true,
      data: rows.map((row) => ({ value: String(row.id), label: row.name, keywords: row.alt })),
    };
  } catch (error) {
    console.error("services list failed", safeError(error));
    return { ok: false, error: t("somethingWrong") };
  }
}

/**
 * What the "For" field at the top of the quotation dialog offers (SPEC §3 P13),
 * or null for everybody who is not the coordinator — who is never shown it.
 *
 * Every person she may raise for, and for each of them, and for her own paper
 * under `RAISED_FOR_NOBODY`, what that person may raise on: `quotationTargets`
 * asked with his id, which is the list his own Quotations screen draws. One
 * reader, two callers, so the dialog cannot offer her a job for Faisal that
 * Faisal's own dialog would not offer him, and the action asks the same
 * `mayRaiseFor` of him when she saves.
 */
export async function quotationOnBehalfAction(): Promise<ActionResult<QuotationOnBehalf | null>> {
  return guard(async (actor) => {
    if (!raisesOnBehalf(actor)) return { ok: true, data: null };
    const people = await raisedForPeople();
    const answers = [
      { key: RAISED_FOR_NOBODY, user: actor },
      ...people.map((person) => ({ key: person.id, user: person })),
    ];
    const targets = Object.fromEntries(
      await Promise.all(
        answers.map(async (answer) => [answer.key, await quotationTargets(answer.user)] as const),
      ),
    );
    return { ok: true, data: { people: await raisedForOptions(people), targets } };
  });
}

/**
 * A rep asks for a quotation, from inside a company or a project (§3).
 *
 * Rep only. A manager or an admin pressing this would become the asker on
 * somebody else's company, and the request would come back to the wrong person
 * — the same reason Add company is refused to them.
 */
/**
 * Which store, and who at the customer (SPEC §3, P12-9).
 *
 * One reader for the three forms that write a quotation — the first ask, the
 * edit and the revision — because they ask the same two questions and a second
 * copy of "is this person at this company" is the copy that would forget the
 * archived case. A revision asks again rather than copying, which is §3's rule
 * that nothing is carried forward from a previous record; a revision is one.
 *
 * The contact is checked against the company the quotation is ON, not against
 * whatever the form said, so a form that named a person at a different customer
 * is refused rather than believed.
 */
const addressingSchema = z.object({
  contactId: z.uuid().optional(),
  /**
   * The stores, first one first (P14). One is the ordinary answer; the field
   * allows a second and a third, and the form sends them as one comma-separated
   * value rather than as a repeated field, so a browser that sends nothing at
   * all is told off by the same "required" as before.
   */
  warehouseIds: warehouseIdsField,
});

type Addressing =
  | { ok: true; contactId: string | null; warehouseIds: number[] }
  | { ok: false; key: "invalid" | "contactNotAtCompany" | "warehouseGone" };

async function readAddressing(formData: FormData, companyId: string): Promise<Addressing> {
  const parsed = addressingSchema.safeParse({
    contactId: field(formData, "contactId"),
    warehouseIds: field(formData, "warehouseIds") ?? "",
  });
  if (!parsed.success) return { ok: false, key: "invalid" };

  /*
   * Every store named is a store, asked of the database rather than trusted
   * from the picker: the founder's rare second store is exactly the field
   * somebody will send by hand, and an id that is not a store reaches the
   * database as a foreign-key violation, which is a 500 and not an answer.
   */
  const warehouseIds = parsed.data.warehouseIds;
  const known = await knownWarehouseIds();
  if (warehouseIds.some((id) => !known.has(id))) return { ok: false, key: "warehouseGone" };

  if (parsed.data.contactId) {
    const [contact] = await db
      .select({ companyId: contacts.companyId, archivedAt: contacts.archivedAt })
      .from(contacts)
      .where(eq(contacts.id, parsed.data.contactId))
      .limit(1);
    if (!contact || contact.archivedAt || contact.companyId !== companyId) {
      return { ok: false, key: "contactNotAtCompany" };
    }
  }

  return { ok: true, contactId: parsed.data.contactId ?? null, warehouseIds };
}

export async function requestQuotationAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const parsed = z
      .object({
        companyId: z.uuid(),
        projectId: z.uuid().optional(),
        notes: z.string().trim().max(4000).optional(),
      })
      .safeParse({
        companyId: field(formData, "companyId"),
        projectId: field(formData, "projectId"),
        notes: field(formData, "notes"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }
    const input = parsed.data;

    const items = readItems(formData);
    if (isRefused(items)) return listRefusal(tq("needsLines"), items);
    const servicesIn = await readServices(formData);
    if (isRefused(servicesIn)) return listRefusal(tq("needsServices"), servicesIn);
    if ("unavailable" in servicesIn) return unavailableRefusal(tq("serviceUnavailable"), servicesIn.unavailable);

    /*
     * Who this paper is raised AS (SPEC §3 P13). For a rep, himself, and a form
     * that names anybody else is refused rather than written as his. For the
     * coordinator, whoever she chose under "For", or herself under Internal
     * Sales — and from here down every gate is asked of THAT person, exactly as
     * if he had opened the dialog: his customer, his job, his credit pool.
     */
    const raiser = await resolveRaiser(actor, field(formData, "repId"));
    if (!raiser.ok) return raiser;
    const person = raiser.person;

    const [company] = await db
      .select({ repId: companies.repId, archivedAt: companies.archivedAt })
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    if (!company) return { ok: false, error: t("companyNotFound") };
    if (company.archivedAt) return { ok: false, error: t("companyArchived") };

    // Every quotation belongs to a project (S18). The company drawer used to
    // raise one against no project at all, and the month's figures then hung
    // off a customer with no job named (D94).
    //
    // Reported under `projectId`, which is the field that is empty. It was
    // `companyId` because one option carried both ids and there was one control
    // to point at; there are two now, and a refusal that lights up the customer
    // he did answer is a refusal that reads as a bug (P12-9).
    if (!input.projectId) {
      return {
        ok: false,
        error: t("projectRequired"),
        fieldErrors: { projectId: t("projectRequired") },
      };
    }
    // Held in its own const, because the insert below is inside a transaction
    // callback and a narrowing made out here does not survive into a closure:
    // the compiler cannot know the property was not reassigned in between.
    const projectId = input.projectId;
    const [project] = await db
      .select({
        companyId: projects.companyId,
        lostAt: projects.lostAt,
        repId: projects.repId,
        onProject: onProjectSql(person, sql`projects.id`).mapWith(Boolean),
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) return { ok: false, error: t("projectNotFound") };
    if (project.companyId !== input.companyId) {
      return { ok: false, error: t("projectNotAtCompany") };
    }
    // Asked here rather than above the project check, because there are two
    // ways to be allowed and only one of them is about the company: his own
    // customer, or a job he has been put on (D147). Both are refused with the
    // same silence a rep gets for somebody else's id.
    // Raised as somebody who does not work this customer or this job: said, at
    // the field she chose him in; a rep's own refusal stays a silence.
    if (!mayRaiseFor(person, company.repId, project.repId, project.onProject)) {
      return notTheirs(actor, raiser);
    }
    // A lost project is finished work (S20): nothing new hangs off it.
    if (project.lostAt) return { ok: false, error: t("alreadyLost") };

    const addressing = await readAddressing(formData, input.companyId);
    if (!addressing.ok) {
      return {
        ok: false,
        error:
          addressing.key === "contactNotAtCompany"
            ? t("contactNotAtCompany")
            : addressing.key === "warehouseGone"
              ? t("warehouseGone")
              : tc("invalid"),
        ...(addressing.key === "contactNotAtCompany"
          ? {}
          : { fieldErrors: { warehouseIds: tc(addressing.key === "invalid" ? "required" : "invalid") } }),
      };
    }

    // Whose paper this is (D148). Resolved from the job rather than trusted
    // from the form, and a name that is not on the job is a refusal rather than
    // a silent fallback to the man who typed it.
    // His pool when she raises it for him: the metres are his to share, not hers.
    const credit = await resolveCredit(projectId, person.id, field(formData, "credit"));
    if (!credit) return { ok: false, error: tc("credit.notOnProject") };

    // Hers goes out as she raises it; everybody else's joins the queue. A paper
    // she raises FOR a rep goes out the same way: a request of hers would wait
    // on the desk she is sitting at (D156), so she issues it in the same act and
    // the row carries the flag that says one person did both.
    const self = selfIssue(actor, formData);
    if (self.kind === "missing") {
      return { ok: false, error: tc("required"), fieldErrors: { smacNumber: tc("required") } };
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(quotations)
        .values({
          number: sql`nextval('quotation_numbers')`,
          companyId: input.companyId,
          projectId,
          contactId: addressing.contactId,
          warehouseId: addressing.warehouseIds[0],
          // Whom it counts for, and who pressed the button (SPEC §3 P13): the
          // same person on everything a rep raises himself.
          repId: person.id,
          raisedById: actor.id,
          notes: input.notes ?? null,
          ...issuedNow(self),
        })
        .returning({ id: quotations.id, number: quotations.number });

      await insertItems(tx, row.id, items);
      await insertServices(tx, row.id, servicesIn);

      // Who this one counts for, frozen at the raise and never inherited
      // (D148). One name on a job one rep works — a project nobody shares has
      // only ever had one answer to this question, and is asked nothing.
      await creditQuotation(tx, row.id, credit);
      // The rare second and third stores (P14); the first is the column above.
      await setWarehouses(tx, "quotation", row.id, addressing.warehouseIds);

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("request"),
        recordType: "quotation",
        recordId: row.id,
        details: {
          companyId: input.companyId,
          lines: items.length,
          services: servicesIn.length,
          // Both people, on the row that says what happened (SPEC §3 P13).
          repId: person.id,
          raisedById: actor.id,
        },
      });

      const label = quotationLabel(row.number, 1);

      // Two events, both hers, in the order they happened. The trail is what
      // tells the manager reading it later that one person did both (D143), and
      // an issue with no request before it reads as paper out of nothing.
      if (self.kind === "yes") {
        await tx.insert(auditLog).values({
          userId: actor.id,
          action: quotationEvent("issue"),
          recordType: "quotation",
          recordId: row.id,
          details: { smacNumber: self.smacNumber },
        });
      } else {
        for (const userId of await coordinators()) {
          await createNotification(tx, {
            userId,
            kind: "quotationRequested",
            params: { label, repId: actor.id },
            link: `/queue?open=${row.id}`,
            subject: { type: "quotation", id: row.id },
          });
        }
      }

      // Raised for him, so he is told it exists and that she raised it — in the
      // kind his bell already clears (D79): an issued one leaves when the
      // customer answers, a request when the desk does. `repId` in the params is
      // the person in the sentence, which here is her.
      // Only she raises for somebody, and hers is always issued as she raises it
      // (SPEC §4), so the notice he gets is the issued one, with its number.
      if (raiser.onBehalf && self.kind === "yes") {
        await createNotification(tx, {
          userId: person.id,
          kind: "quotationIssued",
          params: { label, smacNumber: self.smacNumber, repId: actor.id, raisedFor: 1 },
          link: `/quotations?open=${row.id}`,
          subject: { type: "quotation", id: row.id },
        });
      }

      const audience = await liveAudienceForCompany(input.companyId, actor.id, ["coordinator"]);
      await notifyLive(tx, [...new Set([...audience, person.id])], {
        type: "quotation",
        id: row.id,
        number: label,
        status: self.kind === "yes" ? "issued" : "requested",
      });
      return { id: row.id, label };
    }).catch(async (error: unknown) => {
      // The index fired on her own number, named at the field exactly as it is
      // when she types somebody else's onto the queue (D88).
      if (self.kind === "yes" && isSmacClash(error, "quotation")) {
        return taken(self.smacNumber, (holder) =>
          holder
            ? tq("smacTaken", { number: self.smacNumber, label: holder })
            : tq("smacTakenSomewhere", { number: self.smacNumber }),
        );
      }
      throw error;
    });
    if ("ok" in created) return created;

    revalidateChain();
    return { ok: true, data: { quotationId: created.id } };
  }, ...SELLING_ROLES);
}

/**
 * The rep changes the lines and asks again.
 *
 * Allowed while it is still his: waiting in the queue, or sent back to him with
 * a reason (S29). Once it is issued the paper exists in SMAC and a change is a
 * revision, not an edit (S34).
 */
export async function updateQuotationAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const id = idSchema.safeParse(field(formData, "quotationId"));
    if (!id.success) return { ok: false, error: tc("invalid") };

    const quotation = await load(actor, id.data);
    if (!quotation) return { ok: false, error: tq("notFound") };
    // The rep it names (`rep_id` — her "For" when she raised it for him), and
    // nobody else. An item belongs to whoever created it and
    // only he edits it (SPEC §3, D147) — which was the same person as the
    // company's owner until a project could be shared, and is not any more.
    if (!mayWrite(actor, quotation.repId)) throw new NotAllowed();
    // Still his to change: asked for and unanswered, or sent back (S54, and
    // `withTheRep`, which the dispatch chain asks the same question of).
    if (!withTheRep(quotation.status)) return { ok: false, error: tq("alreadyIssued") };

    const items = readItems(formData);
    if (isRefused(items)) return listRefusal(tq("needsLines"), items);
    const servicesIn = await readServices(formData);
    if (isRefused(servicesIn)) return listRefusal(tq("needsServices"), servicesIn);
    if ("unavailable" in servicesIn) return unavailableRefusal(tq("serviceUnavailable"), servicesIn.unavailable);
    const notes = field(formData, "notes") ?? null;

    // Asked again, exactly as long as the lines beside it may be changed
    // (D148). Nothing has been priced or approved while it waits in the queue.
    const credit = await resolveCredit(quotation.projectId, actor.id, field(formData, "credit"));
    if (!credit) return { ok: false, error: tc("credit.notOnProject") };

    // And so are the store and the name it goes to: a request waiting in the
    // queue is correctable in every part of itself, and a rep who picked the
    // wrong store should not have to withdraw it and type nine fields again.
    const addressing = await readAddressing(formData, quotation.companyId);
    if (!addressing.ok) {
      const te = await getTranslations("errors");
      return {
        ok: false,
        error:
          addressing.key === "contactNotAtCompany"
            ? te("contactNotAtCompany")
            : addressing.key === "warehouseGone"
              ? te("warehouseGone")
              : tc("invalid"),
      };
    }

    const held = await db.transaction(async (tx) => {
      // Held for the rest of the transaction; issued meanwhile is not ours to edit (D85).
      const status = await holdQuotation(tx, quotation.id);
      if (!withTheRep(status as QuotationStatus)) return false;

      // An edit rewrites the rows, so where each line began is read first and
      // handed back: a returned REVISION that is edited must still know which
      // of the first paper's lines it carries. A line that began on this very
      // paper is about to be deleted, and names nothing.
      const began = await originsOf(tx, quotation.id);
      for (const [id, origin] of began) if (origin === id) began.delete(id);
      await tx.delete(quotationItems).where(eq(quotationItems.quotationId, quotation.id));
      await insertItems(tx, quotation.id, items, began);
      // The services the same way as the lines: what the form sends now is the
      // whole of them, and one it no longer sends is gone (SPEC §3, P13).
      await tx.delete(quotationServices).where(eq(quotationServices.quotationId, quotation.id));
      await insertServices(tx, quotation.id, servicesIn);
      await creditQuotation(tx, quotation.id, credit);
      await setWarehouses(tx, "quotation", quotation.id, addressing.warehouseIds);
      // The reason dies with the state it explained. It was left on the row, so
      // a quotation he had already fixed still carried "the sizes are missing"
      // in the database, and every later reader had to remember that the words
      // only count while the status is `returned` — one of them will not (D72).
      await tx
        .update(quotations)
        .set({
          status: "requested",
          // Coming back from him is a landing (`desk_since`): her wait starts
          // again, and the days it spent with him were never hers. An edit of a
          // request that never left her desk moves nothing.
          ...(status === "returned" ? { deskSince: new Date() } : {}),
          notes,
          returnReason: null,
          contactId: addressing.contactId,
          warehouseId: addressing.warehouseIds[0],
        })
        .where(eq(quotations.id, quotation.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("update"),
        recordType: "quotation",
        recordId: quotation.id,
        details: { lines: items.length, services: servicesIn.length, from: quotation.status },
      });

      // Only news to her if it had been sent back: an edit to something already
      // in her queue is the same request with different lines.
      if (quotation.status === "returned") {
        // He has done what it asked, so it stops being a row for ever (D79).
        // This is the case the whole thing was built for: before it, a rep who
        // fixed a quotation from the quotations screen kept a bold notice about
        // work he had already finished, and clearing it meant reading it.
        await clearNotifications(tx, { type: "quotation", id: quotation.id }, [
          "quotationReturned",
        ]);

        for (const userId of await coordinators()) {
          await createNotification(tx, {
            userId,
            kind: "quotationRequested",
            params: { label: quotation.label, repId: actor.id },
            link: `/queue?open=${quotation.id}`,
            subject: { type: "quotation", id: quotation.id },
          });
        }
      }

      await notifyLive(tx, await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]), {
        type: "quotation",
        id: quotation.id,
        number: quotation.label,
        status: "requested",
      });
      return true;
    });
    if (!held) return { ok: false, error: tq("alreadyIssued") };

    revalidateChain();
    return { ok: true, data: { quotationId: quotation.id } };
  }, ...SELLING_ROLES);
}

/**
 * The coordinator types SMAC's number back, and that is the moment it is issued
 * (S28). One of her exactly two actions on a quotation (§3).
 */
export async function issueQuotationAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const parsed = z
      .object({
        quotationId: z.uuid(),
        smacNumber: z.string().trim().min(1).max(60),
        /**
         * She has just created this customer in SMAC (SPEC §3, P14). Sent with
         * the number because it is the same act: she is inside SMAC with this
         * company in front of her, and asking her to go and find it afterwards
         * is how a field ends up meaning nothing.
         */
        registerInSmac: z.enum(["true", "false"]),
      })
      .safeParse({
        quotationId: field(formData, "quotationId"),
        smacNumber: field(formData, "smacNumber"),
        registerInSmac: field(formData, "registerInSmac") ?? "false",
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const quotation = await load(actor, parsed.data.quotationId);
    if (!quotation) return { ok: false, error: tq("notFound") };
    if (quotation.status !== "requested") return { ok: false, error: tq("notWaiting") };

    const held = await db.transaction(async (tx) => {
      // Held, and still waiting: a second tab that issued it a moment ago wins (D85).
      const status = await holdQuotation(tx, quotation.id);
      if (status !== "requested") return false;

      await tx
        .update(quotations)
        .set({ status: "issued", smacNumber: parsed.data.smacNumber, issuedAt: new Date() })
        .where(eq(quotations.id, quotation.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("issue"),
        recordType: "quotation",
        recordId: quotation.id,
        details: { smacNumber: parsed.data.smacNumber },
      });

      /*
       * And the customer is in SMAC, because she has just put him there (P14).
       *
       * Her answer, and never taken away here: an unticked box means she did
       * not say so this time, not that she unsaid it — it is empty on a company
       * she registered last March too. Written only where nobody has answered
       * yet, so the name and the date on it stay the ones that were true.
       */
      if (parsed.data.registerInSmac === "true") {
        await tx
          .update(companies)
          .set({ smacRegisteredAt: new Date(), smacRegisteredBy: actor.id })
          .where(and(eq(companies.id, quotation.companyId), isNull(companies.smacRegisteredAt)));
      }

      // She has answered it, so the request on her own bell is done (D79).
      await clearNotifications(tx, { type: "quotation", id: quotation.id }, [
        "quotationRequested",
      ]);

      await createNotification(tx, {
        // The paper's own rep — the one person who can act on the answer (S29,
        // S53). It was the customer's owner, who is somebody else on a shared job
        // and after a hand-over, and who has no Edit on it.
        userId: quotation.repId,
        kind: "quotationIssued",
        params: { label: quotation.label, smacNumber: parsed.data.smacNumber },
        link: `/quotations?open=${quotation.id}`,
        subject: { type: "quotation", id: quotation.id },
      });

      await notifyLive(
        tx,
        await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]),
        { type: "quotation", id: quotation.id, number: quotation.label, status: "issued" },
      );
      return true;
    }).catch((error: unknown) => {
      // The index fired: the number is on another quotation. Named, at the
      // field, rather than "something went wrong" about a typo (D88).
      if (isSmacClash(error, "quotation")) return "clash" as const;
      throw error;
    });
    if (held === "clash") {
      return taken(parsed.data.smacNumber, (holder) =>
        holder
          ? tq("smacTaken", { number: parsed.data.smacNumber, label: holder })
          : tq("smacTakenSomewhere", { number: parsed.data.smacNumber }),
      );
    }
    if (!held) return { ok: false, error: tq("notWaiting") };

    revalidateChain();
    return { ok: true, data: { quotationId: quotation.id } };
  }, "coordinator");
}

/**
 * "He is in SMAC now" — the coordinator's answer from her backlog (P14 14.6).
 *
 * The list of customers a price has been asked for who are not in SMAC could be
 * read and never worked: the only place her answer could be given was the Issue
 * prompt on a WAITING request, so a customer she registered on a quiet afternoon
 * stayed on the list until his next request happened to pass through her hands,
 * and the list only grew — the founder's "dead field nobody acts on", one step
 * along (Stage 3 audit). One press on the row, written where nobody has
 * answered yet, exactly as the prompt writes it, and never taken away here.
 */
export async function registerInSmacAction(companyId: unknown): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const id = idSchema.safeParse(companyId);
    if (!id.success) return { ok: false, error: tc("invalid") };

    await db.transaction(async (tx) => {
      const changed = await tx
        .update(companies)
        .set({ smacRegisteredAt: new Date(), smacRegisteredBy: actor.id })
        .where(and(eq(companies.id, id.data), isNull(companies.smacRegisteredAt)))
        .returning({ id: companies.id });
      // Answered already, in the other tab or by the prompt: what she asked for
      // is the case, and a second audit row would say it happened twice (D87).
      if (changed.length === 0) return;
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.smacRegistered",
        recordType: "company",
        recordId: id.data,
        details: {},
      });
    });

    revalidateChain();
    return { ok: true };
  }, "coordinator");
}

/**
 * The coordinator corrects a SMAC number she typed wrong (D88). The one value
 * the spec calls error-prone had no way out of a typo. The row is held (D85),
 * the status does not move — a correction is not a second issue — the old
 * number goes into the trail, and a number another quotation carries is
 * refused by name, exactly as at issue.
 */
export async function correctQuotationNumberAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const parsed = z
      .object({ quotationId: z.uuid(), smacNumber: z.string().trim().min(1).max(60) })
      .safeParse({
        quotationId: field(formData, "quotationId"),
        smacNumber: field(formData, "smacNumber"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const quotation = await load(actor, parsed.data.quotationId);
    if (!quotation) return { ok: false, error: tq("notFound") };
    if (!NUMBERED.includes(quotation.status)) return { ok: false, error: tq("noNumberYet") };

    const outcome = await db
      .transaction(async (tx) => {
        const status = await holdQuotation(tx, quotation.id);
        if (status === null || !NUMBERED.includes(status)) return "noNumber" as const;

        const [current] = await tx
          .select({ smacNumber: quotations.smacNumber })
          .from(quotations)
          .where(eq(quotations.id, quotation.id));
        const from = current?.smacNumber ?? null;
        if (from === parsed.data.smacNumber) return "same" as const;

        await tx
          .update(quotations)
          .set({ smacNumber: parsed.data.smacNumber })
          .where(eq(quotations.id, quotation.id));

        // The old number is history, not a secret: the trail says "was …" (D72).
        await tx.insert(auditLog).values({
          userId: actor.id,
          action: quotationEvent("correctNumber"),
          recordType: "quotation",
          recordId: quotation.id,
          details: { from, to: parsed.data.smacNumber },
        });

        await notifyLive(
          tx,
          await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]),
          { type: "quotation", id: quotation.id, number: quotation.label, status: quotation.status },
        );
        return "ok" as const;
      })
      .catch((error: unknown) => {
        if (isSmacClash(error, "quotation")) return "clash" as const;
        throw error;
      });
    if (outcome === "clash") {
      return taken(parsed.data.smacNumber, (holder) =>
        holder
          ? tq("smacTaken", { number: parsed.data.smacNumber, label: holder })
          : tq("smacTakenSomewhere", { number: parsed.data.smacNumber }),
      );
    }
    if (outcome === "noNumber") return { ok: false, error: tq("noNumberYet") };
    if (outcome === "same") {
      return { ok: false, error: tq("sameNumber"), fieldErrors: { smacNumber: tq("sameNumber") } };
    }

    revalidateChain();
    return { ok: true, data: { quotationId: quotation.id } };
  }, "coordinator");
}

/**
 * The coordinator sends it back for edits, with a reason (S29). Her other
 * action, and the reason is not optional: a decision that ends somebody's work
 * reaches them with it written down (S53).
 */
export async function sendBackQuotationAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tq = await getTranslations("quotations");

    const parsed = z
      .object({ quotationId: z.uuid(), reason: z.string().trim().min(1).max(2000) })
      .safeParse({
        quotationId: field(formData, "quotationId"),
        reason: field(formData, "reason"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: t("reasonRequired"),
        fieldErrors: { reason: t("reasonRequired") },
      };
    }

    const quotation = await load(actor, parsed.data.quotationId);
    if (!quotation) return { ok: false, error: tq("notFound") };
    if (quotation.status !== "requested") return { ok: false, error: tq("notWaiting") };

    const held = await db.transaction(async (tx) => {
      // Held, and still waiting (D85).
      const status = await holdQuotation(tx, quotation.id);
      if (status !== "requested") return false;

      await tx
        .update(quotations)
        .set({ status: "returned", returnReason: parsed.data.reason })
        .where(eq(quotations.id, quotation.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("sendBack"),
        recordType: "quotation",
        recordId: quotation.id,
        details: { reason: parsed.data.reason },
      });

      // Sending it back is answering it too: what is open now is the rep's
      // correction, and that is the notice being written below (D79).
      await clearNotifications(tx, { type: "quotation", id: quotation.id }, [
        "quotationRequested",
      ]);

      await createNotification(tx, {
        // The paper's own rep — the one person who can act on the answer (S29,
        // S53). It was the customer's owner, who is somebody else on a shared job
        // and after a hand-over, and who has no Edit on it.
        userId: quotation.repId,
        kind: "quotationReturned",
        params: { label: quotation.label, reason: parsed.data.reason },
        link: `/quotations?open=${quotation.id}`,
        subject: { type: "quotation", id: quotation.id },
      });

      await notifyLive(
        tx,
        await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]),
        { type: "quotation", id: quotation.id, number: quotation.label, status: "returned" },
      );
      return true;
    });
    if (!held) return { ok: false, error: tq("notWaiting") };

    revalidateChain();
    return { ok: true, data: { quotationId: quotation.id } };
  }, "coordinator");
}

/**
 * The customer's answer, recorded by the rep on his own screen (§3, S36).
 * A rejection carries its reason; an acceptance needs none.
 *
 * This does not mark the project lost — that stays a separate decision, because
 * a customer who says no to one price has not necessarily gone (D11).
 */
export async function decideQuotationAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const parsed = z
      .object({
        quotationId: z.uuid(),
        decision: z.enum(["accepted", "rejected"]),
        reason: z.string().trim().max(2000).optional(),
      })
      .safeParse({
        quotationId: field(formData, "quotationId"),
        decision: field(formData, "decision"),
        reason: field(formData, "reason"),
      });
    if (!parsed.success) return { ok: false, error: tc("invalid") };
    const { decision, reason } = parsed.data;

    if (decision === "rejected" && !reason) {
      return { ok: false, error: t("reasonRequired"), fieldErrors: { reason: t("reasonRequired") } };
    }

    const quotation = await load(actor, parsed.data.quotationId);
    if (!quotation) return { ok: false, error: tq("notFound") };
    // The rep it names (`rep_id` — her "For" when she raised it for him), and
    // nobody else. An item belongs to whoever created it and
    // only he edits it (SPEC §3, D147) — which was the same person as the
    // company's owner until a project could be shared, and is not any more.
    if (!mayWrite(actor, quotation.repId)) throw new NotAllowed();
    if (quotation.status !== "issued") return { ok: false, error: tq("notIssued") };

    const held = await db.transaction(async (tx) => {
      // Held, and still with the customer: an answer already recorded stands (D85).
      const status = await holdQuotation(tx, quotation.id);
      if (status !== "issued") return false;
      // The customer answers the price in front of him, which is the live one: an
      // answer filed on a paper a revision has replaced is an answer to nothing.
      if (!(await isLiveRevision(tx, quotation.id))) return "revised" as const;

      await tx
        .update(quotations)
        .set({ status: decision, decisionReason: reason ?? null, decidedAt: new Date() })
        .where(eq(quotations.id, quotation.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent(decision),
        recordType: "quotation",
        recordId: quotation.id,
        details: reason ? { reason } : {},
      });

      // The customer has answered, which is what "issued" was telling him to
      // chase (D79).
      await clearNotifications(tx, { type: "quotation", id: quotation.id }, [
        "quotationIssued",
      ]);

      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: decision === "accepted" ? "quotationAccepted" : "quotationRejected",
          params: { label: quotation.label, reason: reason ?? "" },
          link: `/quotations?open=${quotation.id}`,
          subject: { type: "quotation", id: quotation.id },
        });
      }

      await notifyLive(tx, await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]), {
        type: "quotation",
        id: quotation.id,
        number: quotation.label,
        status: decision,
      });
      return true;
    });
    if (held === "revised") return { ok: false, error: tq("revisedSince") };
    if (!held) return { ok: false, error: tq("notIssued") };

    revalidateChain();
    return { ok: true, data: { quotationId: quotation.id } };
  }, ...SELLING_ROLES);
}

/**
 * A revision: a new quotation carrying the same number, linked to the one it
 * replaces (S34). Earlier versions stay readable and only the latest is live.
 *
 * Raised from a quotation that already exists in SMAC — before that, changing
 * the lines is an edit, not a revision.
 */
export async function reviseQuotationAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const id = idSchema.safeParse(field(formData, "quotationId"));
    if (!id.success) return { ok: false, error: tc("invalid") };

    const quotation = await load(actor, id.data);
    if (!quotation) return { ok: false, error: tq("notFound") };
    // The rep it names (`rep_id` — her "For" when she raised it for him), and
    // nobody else. An item belongs to whoever created it and
    // only he edits it (SPEC §3, D147) — which was the same person as the
    // company's owner until a project could be shared, and is not any more.
    if (!mayWrite(actor, quotation.repId)) throw new NotAllowed();
    if (quotation.status === "requested" || quotation.status === "returned") {
      return { ok: false, error: tq("notIssuedYet") };
    }
    // What the drawer offers is what this takes (DESIGN §5): a paper that went
    // out. A withdrawn one was accepted here while no screen offered it, and a
    // revision raised off it buried whatever stood at the front of the number.
    if (!NUMBERED.includes(quotation.status)) return { ok: false, error: tq("notIssued") };

    const items = readItems(formData);
    if (isRefused(items)) return listRefusal(tq("needsLines"), items);
    // What the form sends, and nothing copied off the parent in SQL (D163): the
    // form opens on the paper it revises, and what he leaves on it is what this
    // one carries.
    const servicesIn = await readServices(formData);
    if (isRefused(servicesIn)) return listRefusal(tq("needsServices"), servicesIn);
    if ("unavailable" in servicesIn) return unavailableRefusal(tq("serviceUnavailable"), servicesIn.unavailable);

    // Asked again, on the new paper. Copying the old one's answer would be the
    // one thing §3 forbids outright — nothing is carried forward from a
    // previous record — and a revision is a previous record (D148).
    const revisionCredit = await resolveCredit(
      quotation.projectId,
      actor.id,
      field(formData, "credit"),
    );
    if (!revisionCredit) return { ok: false, error: tc("credit.notOnProject") };

    // Read from the form on every write rather than copied off the parent in
    // SQL. A revision opens on what the paper it replaces says — the way it
    // opens on its lines (D10) — and the rep may change either before he sends
    // it, which is the difference between a form's starting point and a value
    // the server quietly inherits.
    const addressing = await readAddressing(formData, quotation.companyId);
    if (!addressing.ok) {
      const te = await getTranslations("errors");
      return {
        ok: false,
        error:
          addressing.key === "contactNotAtCompany"
            ? te("contactNotAtCompany")
            : addressing.key === "warehouseGone"
              ? te("warehouseGone")
              : tc("invalid"),
      };
    }

    // A revision of her own paper goes out the same way the first one did, and
    // carries its own number: SMAC gives a revision a number of its own.
    const self = selfIssue(actor, formData);
    if (self.kind === "missing") {
      return { ok: false, error: tc("required"), fieldErrors: { smacNumber: tc("required") } };
    }

    const created = await db.transaction(async (tx) => {
      // Held: two revisions raised at once take consecutive numbers rather
      // than colliding on the unique index and crashing the second (D85).
      await holdQuotation(tx, quotation.id);
      // And still the live one, asked under the hold: a tab left open on Q-12/1
      // raised Q-12/3 off its lines and took Q-12/2 — still waiting on the desk —
      // out of every list with its status and its notice left standing.
      if (!(await isLiveRevision(tx, quotation.id))) {
        return { ok: false as const, error: tq("revisedSince") };
      }
      // The newest revision of this number decides the next one, not the row
      // this was raised from: two revisions raised at once would otherwise
      // collide on the (number, revision) key.
      const [latest] = await tx
        .select({ revision: quotations.revision })
        .from(quotations)
        .where(eq(quotations.number, quotation.number))
        .orderBy(sql`${quotations.revision} desc`)
        .limit(1);

      const [row] = await tx
        .insert(quotations)
        .values({
          number: quotation.number,
          revision: (latest?.revision ?? quotation.revision) + 1,
          revisionOf: quotation.id,
          companyId: quotation.companyId,
          projectId: quotation.projectId,
          contactId: addressing.contactId,
          warehouseId: addressing.warehouseIds[0],
          repId: actor.id,
          raisedById: actor.id,
          notes: field(formData, "notes") ?? null,
          ...issuedNow(self),
        })
        .returning({ id: quotations.id, revision: quotations.revision });

      // The lines he kept carry where they began, so what has already gone out
      // on this number still counts against them (`committedQty`).
      await insertItems(tx, row.id, items, await originsOf(tx, quotation.id));
      await insertServices(tx, row.id, servicesIn);

      // A revision is a new quotation, so credit is decided again rather than
      // copied off the one it replaces: §3 says nothing is ever carried forward
      // from a previous record, and credit least of all (D148).
      await creditQuotation(tx, row.id, revisionCredit);
      await setWarehouses(tx, "quotation", row.id, addressing.warehouseIds);

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("revise"),
        recordType: "quotation",
        recordId: row.id,
        details: { revisionOf: quotation.id, lines: items.length, services: servicesIn.length },
      });

      // The one it replaces is superseded, so "Q-12 issued" is now about a
      // document nobody will act on: what is live is the revision below (D79).
      await clearNotifications(tx, { type: "quotation", id: quotation.id }, [
        "quotationIssued",
      ]);

      const label = quotationLabel(quotation.number, row.revision);
      if (self.kind === "yes") {
        await tx.insert(auditLog).values({
          userId: actor.id,
          action: quotationEvent("issue"),
          recordType: "quotation",
          recordId: row.id,
          details: { smacNumber: self.smacNumber },
        });
      } else {
        for (const userId of await coordinators()) {
          await createNotification(tx, {
            userId,
            kind: "quotationRequested",
            params: { label, repId: actor.id },
            link: `/queue?open=${row.id}`,
            subject: { type: "quotation", id: row.id },
          });
        }
      }

      await notifyLive(tx, await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]), {
        type: "quotation",
        id: row.id,
        number: label,
        status: self.kind === "yes" ? "issued" : "requested",
      });
      return row.id;
    }).catch(async (error: unknown) => {
      if (self.kind === "yes" && isSmacClash(error, "quotation")) {
        return taken(self.smacNumber, (holder) =>
          holder
            ? tq("smacTaken", { number: self.smacNumber, label: holder })
            : tq("smacTakenSomewhere", { number: self.smacNumber }),
        );
      }
      throw error;
    });
    if (typeof created !== "string") return created;

    revalidateChain();
    return { ok: true, data: { quotationId: created } };
  }, ...SELLING_ROLES);
}

/**
 * The rep withdraws a request the coordinator has not acted on yet.
 *
 * DEFAULT — founder may change (SPEC D32). Nobody asked for it, but without it
 * a request the customer has already walked away from sits in her queue
 * forever, and a queue with dead rows in it is a queue nobody trusts.
 */
export async function cancelQuotationAction(
  _prev: ActionResult<{ quotationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ quotationId: string }>> {
  return guard(async (actor) => {
    const tq = await getTranslations("quotations");
    const tc = await getTranslations("common");

    const id = idSchema.safeParse(field(formData, "quotationId"));
    if (!id.success) return { ok: false, error: tc("invalid") };

    const quotation = await load(actor, id.data);
    if (!quotation) return { ok: false, error: tq("notFound") };
    // The rep it names (`rep_id` — her "For" when she raised it for him), and
    // nobody else. An item belongs to whoever created it and
    // only he edits it (SPEC §3, D147) — which was the same person as the
    // company's owner until a project could be shared, and is not any more.
    if (!mayWrite(actor, quotation.repId)) throw new NotAllowed();
    if (quotation.status !== "requested" && quotation.status !== "returned") {
      return { ok: false, error: tq("alreadyIssued") };
    }

    const held = await db.transaction(async (tx) => {
      // Held, and still his to withdraw: issued meanwhile is the coordinator's work (D85).
      const status = await holdQuotation(tx, quotation.id);
      if (status !== "requested" && status !== "returned") return false;

      // Same rule as the edit above: he took it back, so her reason for sending
      // it back is not the reason it is closed, and it does not survive (D72).
      await tx
        .update(quotations)
        .set({ status: "cancelled", decidedAt: new Date(), returnReason: null })
        .where(eq(quotations.id, quotation.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("cancel"),
        recordType: "quotation",
        recordId: quotation.id,
        details: {},
      });

      // Withdrawn: whatever it was waiting for, it is not waiting for it now —
      // hers if it was in her queue, his if it had come back to him (D79).
      await clearNotifications(tx, { type: "quotation", id: quotation.id }, [
        "quotationRequested",
        "quotationReturned",
        "quotationIssued",
      ]);

      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: "quotationCancelled",
          params: { label: quotation.label, repId: actor.id },
          link: `/queue`,
          // The request is gone from her queue, so the link is the queue itself —
          // but the notice is still ABOUT that quotation, and that is what says
          // when it stops being true (D79).
          subject: { type: "quotation", id: quotation.id },
        });
      }

      await notifyLive(tx, await liveAudienceForCompany(quotation.companyId, actor.id, ["coordinator"]), {
        type: "quotation",
        id: quotation.id,
        number: quotation.label,
        status: "cancelled",
      });
      return true;
    });
    if (!held) return { ok: false, error: tq("notWaiting") };

    revalidateChain();
    return { ok: true, data: { quotationId: quotation.id } };
  }, ...SELLING_ROLES);
}
