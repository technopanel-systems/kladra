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

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, companies, projects, quotationItems, quotations, users } from "@/db/schema";
import { NotAllowed, requireActor } from "@/lib/authz";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { liveAudienceFor, notifyLive } from "@/lib/live";
import { round2 } from "@/lib/money";
import { createNotification } from "@/lib/notify";
import { quotationLabel } from "@/lib/labels";
import { quotationEvent } from "@/lib/quotation-events";
import { mayQuote, SELLING_ROLES } from "@/lib/floor";
import { seesEveryQuotation, type QuotationStatus } from "@/lib/quotations";
import type { ActionResult, Role, SessionUser } from "@/lib/types";

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
  ...roles: Role[]
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
    console.error("quotations action failed", error);
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
  projectId: string | null;
  repId: string;
  /** The rep who owns the COMPANY — who may act on it, and who hears about it. */
  companyRepId: string;
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
    })
    .from(quotations)
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(eq(quotations.id, quotationId))
    .limit(1);

  if (!row) return null;
  if (!seesEveryQuotation(actor) && row.companyRepId !== actor.id) throw new NotAllowed();
  return {
    ...row,
    status: row.status as QuotationStatus,
    label: quotationLabel(row.number, row.revision),
  };
}

const idSchema = z.uuid();

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
  qty: z.coerce.number().int().positive().max(100_000),
  width: z.coerce.number().positive().max(100),
  length: z.coerce.number().positive().max(1_000),
  pricePerSqm: z.coerce.number().min(0).max(1_000_000),
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
function readItems(formData: FormData): Item[] | "invalid" {
  const raw = field(formData, "items");
  if (!raw) return "invalid";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "invalid";
  }
  const result = itemsSchema.safeParse(parsed);
  return result.success ? result.data : "invalid";
}

/** numeric(12,2) in the database, so it is rounded once, here (D6). */
function money(value: number): string {
  return round2(value).toFixed(2);
}

async function insertItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  quotationId: string,
  items: Item[],
): Promise<void> {
  await tx.insert(quotationItems).values(
    items.map((item, index) => ({
      quotationId,
      position: index + 1,
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
 * A rep asks for a quotation, from inside a company or a project (§3).
 *
 * Rep only. A manager or an admin pressing this would become the asker on
 * somebody else's company, and the request would come back to the wrong person
 * — the same reason Add company is refused to them.
 */
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
    if (items === "invalid") return { ok: false, error: tq("needsLines") };

    const [company] = await db
      .select({ repId: companies.repId, archivedAt: companies.archivedAt })
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    if (!company) return { ok: false, error: t("companyNotFound") };
    if (!mayQuote(actor, company.repId)) throw new NotAllowed();
    if (company.archivedAt) return { ok: false, error: t("companyArchived") };

    if (input.projectId) {
      const [project] = await db
        .select({ companyId: projects.companyId, lostAt: projects.lostAt })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) return { ok: false, error: t("projectNotFound") };
      if (project.companyId !== input.companyId) {
        return { ok: false, error: t("projectNotAtCompany") };
      }
      // A lost project is finished work (S20): nothing new hangs off it.
      if (project.lostAt) return { ok: false, error: t("alreadyLost") };
    }

    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(quotations)
        .values({
          number: sql`nextval('quotation_numbers')`,
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          repId: actor.id,
          notes: input.notes ?? null,
        })
        .returning({ id: quotations.id, number: quotations.number });

      await insertItems(tx, row.id, items);

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("request"),
        recordType: "quotation",
        recordId: row.id,
        details: { companyId: input.companyId, lines: items.length },
      });

      const label = quotationLabel(row.number, 1);
      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: "quotationRequested",
          params: { label, rep: actor.name },
          link: `/queue?open=${row.id}`,
        });
      }

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id, ["coordinator"]), {
        type: "quotation",
        id: row.id,
        number: label,
        status: "requested",
      });
      return { id: row.id, label };
    });

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
    if (!mayQuote(actor, quotation.companyRepId)) throw new NotAllowed();
    if (quotation.status !== "requested" && quotation.status !== "returned") {
      return { ok: false, error: tq("alreadyIssued") };
    }

    const items = readItems(formData);
    if (items === "invalid") return { ok: false, error: tq("needsLines") };
    const notes = field(formData, "notes") ?? null;

    await db.transaction(async (tx) => {
      await tx.delete(quotationItems).where(eq(quotationItems.quotationId, quotation.id));
      await insertItems(tx, quotation.id, items);
      // The reason dies with the state it explained. It was left on the row, so
      // a quotation he had already fixed still carried "the sizes are missing"
      // in the database, and every later reader had to remember that the words
      // only count while the status is `returned` — one of them will not (D72).
      await tx
        .update(quotations)
        .set({ status: "requested", notes, returnReason: null })
        .where(eq(quotations.id, quotation.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("update"),
        recordType: "quotation",
        recordId: quotation.id,
        details: { lines: items.length, from: quotation.status },
      });

      // Only news to her if it had been sent back: an edit to something already
      // in her queue is the same request with different lines.
      if (quotation.status === "returned") {
        for (const userId of await coordinators()) {
          await createNotification(tx, {
            userId,
            kind: "quotationRequested",
            params: { label: quotation.label, rep: actor.name },
            link: `/queue?open=${quotation.id}`,
          });
        }
      }

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id, ["coordinator"]), {
        type: "quotation",
        id: quotation.id,
        number: quotation.label,
        status: "requested",
      });
    });

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
    if (quotation.status !== "requested") return { ok: false, error: tq("notWaiting") };

    await db.transaction(async (tx) => {
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

      await createNotification(tx, {
        userId: quotation.companyRepId,
        kind: "quotationIssued",
        params: { label: quotation.label, smacNumber: parsed.data.smacNumber },
        link: `/quotations?open=${quotation.id}`,
      });

      await notifyLive(
        tx,
        await liveAudienceFor(quotation.companyRepId, actor.id, ["coordinator"]),
        { type: "quotation", id: quotation.id, number: quotation.label, status: "issued" },
      );
    });

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

    await db.transaction(async (tx) => {
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

      await createNotification(tx, {
        userId: quotation.companyRepId,
        kind: "quotationReturned",
        params: { label: quotation.label, reason: parsed.data.reason },
        link: `/quotations?open=${quotation.id}`,
      });

      await notifyLive(
        tx,
        await liveAudienceFor(quotation.companyRepId, actor.id, ["coordinator"]),
        { type: "quotation", id: quotation.id, number: quotation.label, status: "returned" },
      );
    });

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
    if (!mayQuote(actor, quotation.companyRepId)) throw new NotAllowed();
    if (quotation.status !== "issued") return { ok: false, error: tq("notIssued") };

    await db.transaction(async (tx) => {
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

      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: decision === "accepted" ? "quotationAccepted" : "quotationRejected",
          params: { label: quotation.label, reason: reason ?? "" },
          link: `/quotations?open=${quotation.id}`,
        });
      }

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id, ["coordinator"]), {
        type: "quotation",
        id: quotation.id,
        number: quotation.label,
        status: decision,
      });
    });

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
    if (!mayQuote(actor, quotation.companyRepId)) throw new NotAllowed();
    if (quotation.status === "requested" || quotation.status === "returned") {
      return { ok: false, error: tq("notIssuedYet") };
    }

    const items = readItems(formData);
    if (items === "invalid") return { ok: false, error: tq("needsLines") };

    const created = await db.transaction(async (tx) => {
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
          repId: actor.id,
          notes: field(formData, "notes") ?? null,
        })
        .returning({ id: quotations.id, revision: quotations.revision });

      await insertItems(tx, row.id, items);

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: quotationEvent("revise"),
        recordType: "quotation",
        recordId: row.id,
        details: { revisionOf: quotation.id, lines: items.length },
      });

      const label = quotationLabel(quotation.number, row.revision);
      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: "quotationRequested",
          params: { label, rep: actor.name },
          link: `/queue?open=${row.id}`,
        });
      }

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id, ["coordinator"]), {
        type: "quotation",
        id: row.id,
        number: label,
        status: "requested",
      });
      return row.id;
    });

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
    if (!mayQuote(actor, quotation.companyRepId)) throw new NotAllowed();
    if (quotation.status !== "requested" && quotation.status !== "returned") {
      return { ok: false, error: tq("alreadyIssued") };
    }

    await db.transaction(async (tx) => {
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

      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: "quotationCancelled",
          params: { label: quotation.label, rep: actor.name },
          link: `/queue`,
        });
      }

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id, ["coordinator"]), {
        type: "quotation",
        id: quotation.id,
        number: quotation.label,
        status: "cancelled",
      });
    });

    revalidateChain();
    return { ok: true, data: { quotationId: quotation.id } };
  }, ...SELLING_ROLES);
}

/** Read: the quotations already on a project, for the request dialog's warning. */
export async function countQuotationsOnProject(projectId: string): Promise<number> {
  await requireActor();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quotations)
    .where(and(eq(quotations.projectId, projectId), inArray(quotations.status, ["issued"])));
  return row?.n ?? 0;
}
