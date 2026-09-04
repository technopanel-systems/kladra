"use server";

/**
 * Projects — created from inside a company, never from a page of their own
 * (SPEC §3, DESIGN §2). No state at creation: a project is just a job with a
 * name and the rep's own estimate of its size.
 *
 * Expected m² is `numeric(12,2)`, so it is rounded half-up once here (D6) and
 * stored as a string — a float would drift on the way to the database.
 *
 * "Mark lost" is a later action and always carries a reason (S20): a decision
 * that ends someone's work reaches them with its written reason (S53).
 */

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, projects } from "@/db/schema";
import { assertCompanyOpen, assertProjectVisible } from "@/lib/activities";
import { NotAllowed, requireActor } from "@/lib/authz";
import { parseDay } from "@/lib/dates";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { liveAudienceFor, notifyLive } from "@/lib/live";
import { round2 } from "@/lib/money";
import type { ActionResult, SessionUser } from "@/lib/types";

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor());
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
    console.error("projects action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

function revalidateFloor(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/companies", "page");
  revalidatePath("/[locale]/projects", "page");
}

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const { y, m, d } = parseDay(day);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  });

const projectFields = {
  name: z.string().trim().min(1).max(200),
  expectedSqm: z.string().trim().max(20).optional(),
  nextFollowUp: dayString.optional(),
  notes: z.string().trim().max(4000).optional(),
};

const createSchema = z.object({ ...projectFields, companyId: z.uuid() });
const updateSchema = z.object({ ...projectFields, projectId: z.uuid() });

function readForm(formData: FormData) {
  return {
    companyId: field(formData, "companyId"),
    projectId: field(formData, "projectId"),
    name: field(formData, "name"),
    expectedSqm: field(formData, "expectedSqm"),
    nextFollowUp: field(formData, "nextFollowUp"),
    notes: field(formData, "notes"),
  };
}

/** "1,850" and "1850.5" are both a rep typing metres; "" is no estimate yet. */
function parseSqm(value: string | undefined): string | null | "invalid" {
  if (value === undefined) return null;
  const n = Number(value.replace(/[\s,]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 9_999_999_999) return "invalid";
  return round2(n).toFixed(2);
}

/** New project — the dialog on the company drawer. */
export async function createProjectAction(
  _prev: ActionResult<{ projectId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ projectId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = createSchema.safeParse(readForm(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("notADate")),
      };
    }
    const input = parsed.data;

    const { repId, archived } = await assertCompanyOpen(actor, input.companyId);
    // Archived is off the floor (S16): nothing new is added to a company that
    // is not on anybody's list. Editing what is already there still works, so a
    // name can be fixed before it is restored.
    if (archived) return { ok: false, error: t("companyArchived") };

    const sqm = parseSqm(input.expectedSqm);
    if (sqm === "invalid") {
      return { ok: false, error: t("sqmInvalid"), fieldErrors: { expectedSqm: t("sqmInvalid") } };
    }

    const projectId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({
          companyId: input.companyId,
          name: input.name,
          expectedSqm: sqm,
          nextFollowUp: input.nextFollowUp ?? null,
          notes: input.notes ?? null,
        })
        .returning({ id: projects.id });

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "project.create",
        recordType: "project",
        recordId: row.id,
        details: { companyId: input.companyId, name: input.name },
      });
      const audience = await liveAudienceFor(repId, actor.id);
      await notifyLive(tx, audience, { type: "project", id: row.id });
      await notifyLive(tx, audience, { type: "company", id: input.companyId });
      return row.id;
    });

    revalidateFloor();
    return { ok: true, data: { projectId } };
  });
}

export async function updateProjectAction(
  _prev: ActionResult<{ projectId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ projectId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = updateSchema.safeParse(readForm(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("notADate")),
      };
    }
    const input = parsed.data;

    const owner = await assertProjectVisible(actor, input.projectId);

    const sqm = parseSqm(input.expectedSqm);
    if (sqm === "invalid") {
      return { ok: false, error: t("sqmInvalid"), fieldErrors: { expectedSqm: t("sqmInvalid") } };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({
          name: input.name,
          expectedSqm: sqm,
          nextFollowUp: input.nextFollowUp ?? null,
          notes: input.notes ?? null,
        })
        .where(eq(projects.id, input.projectId));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "project.update",
        recordType: "project",
        recordId: input.projectId,
        details: { name: input.name },
      });
      const audience = await liveAudienceFor(owner.repId, actor.id);
      await notifyLive(tx, audience, { type: "project", id: input.projectId });
      await notifyLive(tx, audience, { type: "company", id: owner.companyId });
    });

    revalidateFloor();
    return { ok: true, data: { projectId: input.projectId } };
  });
}

/** The picker at the top of the project drawer. A project has its own date (D9). */
export async function setProjectFollowUpAction(
  projectId: unknown,
  day: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const id = z.uuid().safeParse(projectId);
    const parsedDay = z.union([dayString, z.null()]).safeParse(day ?? null);
    if (!id.success) return { ok: false, error: tc("invalid") };
    if (!parsedDay.success) {
      return { ok: false, error: tc("notADate"), fieldErrors: { nextFollowUp: tc("notADate") } };
    }

    const owner = await assertProjectVisible(actor, id.data);

    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({ nextFollowUp: parsedDay.data })
        .where(eq(projects.id, id.data));
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "project.followUp",
        recordType: "project",
        recordId: id.data,
        details: { nextFollowUp: parsedDay.data },
      });
      const audience = await liveAudienceFor(owner.repId, actor.id);
      await notifyLive(tx, audience, { type: "project", id: id.data });
      await notifyLive(tx, audience, { type: "company", id: owner.companyId });
    });

    revalidateFloor();
    return { ok: true };
  });
}

/**
 * Lost is the rep's judgement, it needs a reason, and it closes the project
 * (S20). A rejected quotation is NOT a lost project — that stays a separate
 * decision on the quotation (D11).
 */
export async function markProjectLostAction(
  projectId: unknown,
  reason: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const id = z.uuid().safeParse(projectId);
    if (!id.success) return { ok: false, error: tc("invalid") };

    const why = z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .safeParse(typeof reason === "string" ? reason : undefined);
    if (!why.success) {
      return { ok: false, error: t("reasonRequired"), fieldErrors: { reason: t("reasonRequired") } };
    }

    const owner = await assertProjectVisible(actor, id.data);

    const marked = await db.transaction(async (tx) => {
      const rows = await tx
        .update(projects)
        .set({ lostAt: new Date(), lostReason: why.data })
        .where(and(eq(projects.id, id.data), isNull(projects.lostAt)))
        .returning({ id: projects.id });
      if (rows.length === 0) return false;

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "project.lost",
        recordType: "project",
        recordId: id.data,
        details: { reason: why.data },
      });
      const audience = await liveAudienceFor(owner.repId, actor.id);
      await notifyLive(tx, audience, { type: "project", id: id.data });
      await notifyLive(tx, audience, { type: "company", id: owner.companyId });
      return true;
    });

    if (!marked) return { ok: false, error: t("alreadyLost") };
    revalidateFloor();
    return { ok: true };
  });
}

/**
 * Archive, never delete (SPEC §3, S16). The project leaves the lists and keeps
 * its history, and the activities filed against it keep reading correctly.
 *
 * Distinct from "lost", and the two are not interchangeable: lost is a
 * judgement about the customer that carries a reason and belongs in the record
 * (S20), while archiving is tidying — a duplicate, a typo, a job that was never
 * real. A lost project stays visible; an archived one does not.
 */
export async function archiveProjectAction(projectId: unknown): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");
    const id = z.uuid().safeParse(projectId);
    if (!id.success) return { ok: false, error: tc("invalid") };

    const owner = await assertProjectVisible(actor, id.data);

    const archived = await db.transaction(async (tx) => {
      const rows = await tx
        .update(projects)
        .set({ archivedAt: new Date() })
        .where(and(eq(projects.id, id.data), isNull(projects.archivedAt)))
        .returning({ id: projects.id });
      if (rows.length === 0) return false;

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "project.archive",
        recordType: "project",
        recordId: id.data,
        details: { companyId: owner.companyId },
      });
      const audience = await liveAudienceFor(owner.repId, actor.id);
      await notifyLive(tx, audience, { type: "project", id: id.data });
      await notifyLive(tx, audience, { type: "company", id: owner.companyId });
      return true;
    });

    if (!archived) return { ok: false, error: t("projectNotFound") };
    revalidateFloor();
    return { ok: true };
  });
}
