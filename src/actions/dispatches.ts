"use server";

/**
 * The dispatch chain (SPEC S37–S43, §3).
 *
 * The rep raises a request against an issued quotation: which lines, how many
 * of each, how they travel, where to, and on what terms. The coordinator checks
 * it against the paper and either approves it with SMAC's dispatch number or
 * refuses it with a reason.
 *
 * Approval is the only event that counts (S41). Not the request, not the
 * number, not the day the truck left: the rep's month moves when she presses
 * Approve, and if something goes wrong afterwards a new dispatch is raised
 * rather than this one edited. That is also the moment the project is won
 * (S21), which nothing here writes down — `projectIsWonSql` asks the question
 * instead of storing an answer that could go stale.
 *
 * The quantity rule is enforced twice on purpose. The dialog shows what is left
 * on each line so a rep is not asked to guess, and the transaction checks it
 * again before writing, because between opening a dialog and pressing Save
 * somebody else can spend the same panels (D12).
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  companies,
  dispatchItems,
  dispatches,
  quotationItems,
  quotations,
  shipmentMethods,
  users,
} from "@/db/schema";
import { NotAllowed, requireActor } from "@/lib/authz";
import { seesEveryDispatch, type DispatchStatus } from "@/lib/dispatches";
import { mayWrite } from "@/lib/floor";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { liveAudienceFor, notifyLive } from "@/lib/live";
import { createNotification } from "@/lib/notify";
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
  quotationId: string;
  quotationLabel: string;
  projectId: string | null;
  /** The rep who owns the COMPANY — who may act on it, and who hears about it. */
  companyRepId: string;
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
      projectId: quotations.projectId,
      companyRepId: companies.repId,
    })
    .from(dispatches)
    .innerJoin(quotations, eq(quotations.id, dispatches.quotationId))
    .innerJoin(companies, eq(companies.id, quotations.companyId))
    .where(eq(dispatches.id, dispatchId))
    .limit(1);

  if (!row) return null;
  if (!seesEveryDispatch(actor) && row.companyRepId !== actor.id) throw new NotAllowed();
  return {
    id: row.id,
    number: row.number,
    label: dispatchLabel(row.number),
    status: row.status as DispatchStatus,
    quotationId: row.quotationId,
    quotationLabel: quotationLabel(row.quotationNumber, row.quotationRevision),
    projectId: row.projectId ?? null,
    companyRepId: row.companyRepId,
  };
}

/**
 * One line of a request: which quotation line, and how many of it.
 *
 * Zero is allowed here and dropped below — the dialog lists every line of the
 * quotation with a box beside it, and leaving a line at zero is how a rep says
 * "not this one this time", not an error to answer.
 */
const itemSchema = z.object({
  quotationItemId: z.uuid(),
  qty: z.coerce.number().int().min(0).max(100_000),
});

const itemsSchema = z.array(itemSchema).min(1).max(60);

/** The lines arrive as one JSON field, for the reason in src/actions/quotations.ts. */
function readItems(formData: FormData): z.infer<typeof itemsSchema> | "invalid" {
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

const detailsSchema = z.object({
  shipmentMethodId: z.coerce.number().int().positive(),
  destination: z.string().trim().min(1).max(500),
  paymentTerms: z.string().trim().min(1).max(1000),
});

type QuantityCheck = "ok" | "tooMuch" | "notOnQuotation";

/**
 * Whether a request's lines fit inside what the quotation has left (D12).
 *
 * Run inside the caller's transaction and reading the committed quantities
 * there, so two reps pressing Save at the same second cannot both spend the
 * last panel. `exclude` leaves this dispatch's own existing lines out of the
 * sum, which is what an edit needs — otherwise a request always overspends
 * itself.
 */
async function checkQuantities(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  quotationId: string,
  asked: { quotationItemId: string; qty: number }[],
  exclude: string | null,
): Promise<QuantityCheck> {
  const lines = await tx
    .select({
      id: quotationItems.id,
      qty: quotationItems.qty,
      committed: sql<number>`(
        select coalesce(sum(di.qty), 0)::int
          from dispatch_items di
          join dispatches d on d.id = di.dispatch_id
         where di.quotation_item_id = quotation_items.id
           and d.status in ('submitted', 'approved')
           and (${exclude}::uuid is null or d.id <> ${exclude}::uuid)
      )`,
    })
    .from(quotationItems)
    .where(
      and(
        eq(quotationItems.quotationId, quotationId),
        inArray(
          quotationItems.id,
          asked.map((item) => item.quotationItemId),
        ),
      ),
    );

  const byId = new Map(lines.map((line) => [line.id, line]));
  if (byId.size !== asked.length) return "notOnQuotation";

  for (const item of asked) {
    const line = byId.get(item.quotationItemId);
    if (!line) return "notOnQuotation";
    if (item.qty > line.qty - Number(line.committed)) return "tooMuch";
  }
  return "ok";
}

/** The lines a rep actually asked for. A line left at zero is "not this time". */
function askedFor(items: { quotationItemId: string; qty: number }[]) {
  return items.filter((item) => item.qty > 0);
}

/** Replaces a dispatch's lines outright — an edit is the whole list again. */
async function replaceItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  dispatchId: string,
  asked: { quotationItemId: string; qty: number }[],
): Promise<void> {
  await tx.delete(dispatchItems).where(eq(dispatchItems.dispatchId, dispatchId));
  await tx.insert(dispatchItems).values(
    asked.map((item) => ({ dispatchId, quotationItemId: item.quotationItemId, qty: item.qty })),
  );
}

/**
 * A rep raises a dispatch against an issued quotation (§3, S38).
 *
 * Rep only, and only on his own company: a dispatch is what moves his target,
 * so somebody else raising it would move the wrong month for the wrong person.
 */
export async function requestDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");
    const tc = await getTranslations("common");

    const parsed = z
      .object({ quotationId: z.uuid(), ...detailsSchema.shape })
      .safeParse({
        quotationId: field(formData, "quotationId"),
        shipmentMethodId: field(formData, "shipmentMethodId"),
        destination: field(formData, "destination"),
        paymentTerms: field(formData, "paymentTerms"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const items = readItems(formData);
    if (items === "invalid") return { ok: false, error: td("needsItems") };

    const [quotation] = await db
      .select({
        id: quotations.id,
        number: quotations.number,
        revision: quotations.revision,
        status: quotations.status,
        projectId: quotations.projectId,
        companyRepId: companies.repId,
        companyArchived: companies.archivedAt,
      })
      .from(quotations)
      .innerJoin(companies, eq(companies.id, quotations.companyId))
      .where(eq(quotations.id, parsed.data.quotationId))
      .limit(1);
    if (!quotation) return { ok: false, error: td("quotationNotFound") };
    if (!mayWrite(actor, quotation.companyRepId)) throw new NotAllowed();
    if (quotation.companyArchived) return { ok: false, error: td("quotationNotFound") };
    // S38: the paper has to exist before goods move against it. A request that
    // has been sent back or refused is not a quotation yet.
    if (quotation.status !== "issued" && quotation.status !== "accepted") {
      return { ok: false, error: td("quotationNotIssued") };
    }
    // And only the live revision: once it has been revised the customer holds
    // the new paper, and goods sent against the old one move on a price nobody
    // agreed (S34, S35).
    const [newer] = await db
      .select({ id: quotations.id })
      .from(quotations)
      .where(
        and(
          eq(quotations.number, quotation.number),
          sql`quotations.revision > ${quotation.revision}`,
        ),
      )
      .limit(1);
    if (newer) return { ok: false, error: td("supersededQuotation") };

    const [method] = await db
      .select({ id: shipmentMethods.id })
      .from(shipmentMethods)
      .where(
        and(eq(shipmentMethods.id, parsed.data.shipmentMethodId), eq(shipmentMethods.active, true)),
      )
      .limit(1);
    if (!method) return { ok: false, error: tc("invalid") };

    const asked = askedFor(items);
    if (asked.length === 0) return { ok: false, error: td("needsItems") };

    const outcome = await db.transaction(async (tx) => {
      // Checked before anything is written, so a refusal is a sentence rather
      // than a rolled-back transaction wearing "something went wrong".
      const check = await checkQuantities(tx, quotation.id, asked, null);
      if (check !== "ok") return { failure: check } as const;

      const [row] = await tx
        .insert(dispatches)
        .values({
          number: sql`nextval('dispatch_numbers')`,
          quotationId: quotation.id,
          repId: actor.id,
          shipmentMethodId: parsed.data.shipmentMethodId,
          destination: parsed.data.destination,
          paymentTerms: parsed.data.paymentTerms,
        })
        .returning({ id: dispatches.id, number: dispatches.number });

      await replaceItems(tx, row.id, asked);

      const label = dispatchLabel(row.number);
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "dispatch.request",
        recordType: "dispatch",
        recordId: row.id,
        details: { quotationId: quotation.id, lines: asked.length },
      });

      for (const userId of await coordinators()) {
        await createNotification(tx, {
          userId,
          kind: "dispatchRequested",
          params: { label, rep: actor.name },
          link: `/queue?dispatch=${row.id}`,
        });
      }

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id, ["coordinator"]), {
        type: "dispatch",
        id: row.id,
        number: label,
        status: "submitted",
      });
      return { id: row.id } as const;
    });

    if ("failure" in outcome) {
      return {
        ok: false,
        error: outcome.failure === "tooMuch" ? td("tooMuch") : td("notOnQuotation"),
      };
    }

    revalidateChain();
    return { ok: true, data: { dispatchId: outcome.id } };
  }, "rep");
}

/**
 * The rep changes his own request while it is still waiting (S54's reason: a
 * form retyped from scratch is a form filled in on WhatsApp instead).
 *
 * Once it is approved or refused it is finished; a change after that is a new
 * dispatch (S41).
 */
export async function updateDispatchAction(
  _prev: ActionResult<{ dispatchId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ dispatchId: string }>> {
  return guard(async (actor) => {
    const td = await getTranslations("dispatches");
    const tc = await getTranslations("common");

    const parsed = z
      .object({ dispatchId: z.uuid(), ...detailsSchema.shape })
      .safeParse({
        dispatchId: field(formData, "dispatchId"),
        shipmentMethodId: field(formData, "shipmentMethodId"),
        destination: field(formData, "destination"),
        paymentTerms: field(formData, "paymentTerms"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const items = readItems(formData);
    if (items === "invalid") return { ok: false, error: td("needsItems") };

    const dispatch = await load(actor, parsed.data.dispatchId);
    if (!dispatch) return { ok: false, error: td("notFound") };
    if (!mayWrite(actor, dispatch.companyRepId)) throw new NotAllowed();
    if (dispatch.status !== "submitted") return { ok: false, error: td("notWaiting") };

    const asked = askedFor(items);
    if (asked.length === 0) return { ok: false, error: td("needsItems") };

    const failure = await db.transaction(async (tx) => {
      const check = await checkQuantities(tx, dispatch.quotationId, asked, dispatch.id);
      if (check !== "ok") return check;
      await replaceItems(tx, dispatch.id, asked);

      await tx
        .update(dispatches)
        .set({
          shipmentMethodId: parsed.data.shipmentMethodId,
          destination: parsed.data.destination,
          paymentTerms: parsed.data.paymentTerms,
        })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "dispatch.update",
        recordType: "dispatch",
        recordId: dispatch.id,
        details: { lines: asked.length },
      });

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id, ["coordinator"]), {
        type: "dispatch",
        id: dispatch.id,
        number: dispatch.label,
        status: "submitted",
      });
      return null;
    });

    if (failure === "tooMuch") return { ok: false, error: td("tooMuch") };
    if (failure === "notOnQuotation") return { ok: false, error: td("notOnQuotation") };

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "rep");
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

    await db.transaction(async (tx) => {
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
        action: "dispatch.approve",
        recordType: "dispatch",
        recordId: dispatch.id,
        details: { smacDispatchNumber: parsed.data.smacDispatchNumber },
      });

      await createNotification(tx, {
        userId: dispatch.companyRepId,
        kind: "dispatchApproved",
        params: { label: dispatch.label, smacNumber: parsed.data.smacDispatchNumber },
        link: `/dispatches?open=${dispatch.id}`,
      });

      await notifyLive(
        tx,
        await liveAudienceFor(dispatch.companyRepId, actor.id, ["coordinator", "manager"]),
        { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "approved" },
      );
    });

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

    await db.transaction(async (tx) => {
      await tx
        .update(dispatches)
        .set({ status: "refused", refuseReason: parsed.data.reason })
        .where(eq(dispatches.id, dispatch.id));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "dispatch.refuse",
        recordType: "dispatch",
        recordId: dispatch.id,
        details: { reason: parsed.data.reason },
      });

      await createNotification(tx, {
        userId: dispatch.companyRepId,
        kind: "dispatchRefused",
        params: { label: dispatch.label, reason: parsed.data.reason },
        link: `/dispatches?open=${dispatch.id}`,
      });

      await notifyLive(
        tx,
        await liveAudienceFor(dispatch.companyRepId, actor.id, ["coordinator"]),
        { type: "dispatch", id: dispatch.id, number: dispatch.label, status: "refused" },
      );
    });

    revalidateChain();
    return { ok: true, data: { dispatchId: dispatch.id } };
  }, "coordinator");
}
