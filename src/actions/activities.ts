"use server";

/**
 * The log — one entry for one thing that happened with a customer (SPEC S24).
 *
 * Logging must take under a minute, standing in a lobby, or it gets filled in
 * later from memory and becomes a permanent guess (S23). So only two things are
 * required: which company, and what happened in the rep's own words. The
 * channel defaults, the date defaults to Riyadh's today, and the next follow-up
 * is optional.
 *
 * Everything commits together (ONE transaction): the entry, the follow-up date
 * it sets on the company and on the project, the audit row and the live notice.
 * A log entry is one of the two things that set a next follow-up (SPEC D9), so
 * writing the entry without moving the date would leave two answers for one
 * figure — the drift trap rules/data.md names.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { activities, auditLog, companies, contacts, projects } from "@/db/schema";
import { assertCompanyOpen } from "@/lib/activities";
import { NotAllowed, requireActor } from "@/lib/authz";
import { parseDay, todayRiyadh } from "@/lib/dates";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { liveAudienceFor, notifyLive } from "@/lib/live";
import type { ActionResult, SessionUser } from "@/lib/types";

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor());
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
    console.error("activities action failed", error);
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

const logSchema = z.object({
  companyId: z.uuid(),
  projectId: z.uuid().optional(),
  contactId: z.uuid().optional(),
  text: z.string().trim().min(1).max(4000),
  channel: z.enum(["visit", "call", "whatsapp", "other"]).default("visit"),
  happenedOn: dayString.optional(),
  nextFollowUp: dayString.optional(),
});

/**
 * Log — the dialog reachable from everywhere (DESIGN §2: anything daily is two
 * clicks from home). Returns the new entry's id so the drawer can highlight it.
 */
export async function logActivityAction(
  _prev: ActionResult<{ activityId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ activityId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = logSchema.safeParse({
      companyId: field(formData, "companyId"),
      projectId: field(formData, "projectId"),
      contactId: field(formData, "contactId"),
      text: field(formData, "text"),
      channel: field(formData, "channel") ?? "visit",
      happenedOn: field(formData, "happenedOn"),
      nextFollowUp: field(formData, "nextFollowUp"),
    });
    if (!parsed.success) {
      const fieldErrors = fieldErrorsOf(parsed.error, tc("required"), tc("invalid"));
      if (fieldErrors.text) fieldErrors.text = t("textRequired");
      return { ok: false, error: fieldErrors.text ?? tc("invalid"), fieldErrors };
    }
    const input = parsed.data;

    const { repId, archived } = await assertCompanyOpen(actor, input.companyId);
    // Archived is off the floor (S16): nothing new is added to a company that
    // is not on anybody's list. Editing what is already there still works, so a
    // name can be fixed before it is restored.
    if (archived) return { ok: false, error: t("companyArchived") };

    // A named project and a named contact must belong to the company the entry
    // is filed under, or the log would claim something that never happened.
    if (input.projectId) {
      const [row] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.companyId, input.companyId)))
        .limit(1);
      if (!row) {
        return {
          ok: false,
          error: t("projectNotAtCompany"),
          fieldErrors: { projectId: t("projectNotAtCompany") },
        };
      }
    }
    if (input.contactId) {
      const [row] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(and(eq(contacts.id, input.contactId), eq(contacts.companyId, input.companyId)))
        .limit(1);
      if (!row) {
        return {
          ok: false,
          error: t("contactNotAtCompany"),
          fieldErrors: { contactId: t("contactNotAtCompany") },
        };
      }
    }

    const happenedOn = input.happenedOn ?? todayRiyadh();

    const activityId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(activities)
        .values({
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          contactId: input.contactId ?? null,
          userId: actor.id,
          text: input.text,
          channel: input.channel,
          happenedOn,
          nextFollowUp: input.nextFollowUp ?? null,
        })
        .returning({ id: activities.id });

      if (input.nextFollowUp) {
        await tx
          .update(companies)
          .set({ nextFollowUp: input.nextFollowUp })
          .where(eq(companies.id, input.companyId));
        if (input.projectId) {
          await tx
            .update(projects)
            .set({ nextFollowUp: input.nextFollowUp })
            .where(eq(projects.id, input.projectId));
        }
      }

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "activity.create",
        recordType: "activity",
        recordId: row.id,
        details: {
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          channel: input.channel,
          happenedOn,
          nextFollowUp: input.nextFollowUp ?? null,
        },
      });

      const audience = await liveAudienceFor(repId, actor.id);
      await notifyLive(tx, audience, { type: "company", id: input.companyId });
      if (input.projectId) {
        await notifyLive(tx, audience, { type: "project", id: input.projectId });
      }
      return row.id;
    });

    revalidateFloor();
    return { ok: true, data: { activityId } };
  });
}
