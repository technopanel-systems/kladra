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
import { assertCompanyMine } from "@/lib/activities";
import { NotAllowed, requireActor } from "@/lib/authz";
import { parseDay, todayRiyadh, type Day } from "@/lib/dates";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { liveAudienceFor, notifyLive } from "@/lib/live";
import { mayWriteFor } from "@/lib/reports";
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

    const { repId, archived } = await assertCompanyMine(actor, input.companyId);
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

const editSchema = z.object({
  activityId: z.uuid(),
  text: z.string().trim().min(1).max(4000),
  channel: z.enum(["visit", "call", "whatsapp", "other"]),
  contactId: z.uuid().optional(),
  projectId: z.uuid().optional(),
});

/**
 * Correct an entry (SPEC D70, 9A item 3).
 *
 * There was one action on the log and it was `log`. A visit typed against the
 * wrong customer was wrong for ever, and the correction — a second entry saying
 * so — is one every count afterwards believes: two logged calls where one
 * happened, two companies touched where one was.
 *
 * Only the author, and only while the DAY it belongs to is still open, which is
 * the same window the daily report uses (D58): today, or the last working day.
 * A record that can be rewritten a week later is not a record. What can be
 * changed is what he meant to write — the words, the channel, whose meeting it
 * was and which project — and not the day, and not the follow-up: the day is
 * the entry's identity, and the follow-up is a figure two other screens read.
 *
 * The wrong COMPANY is not corrected here; it is unfiled, and the right entry
 * is written where it belongs.
 */
export async function editActivityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = editSchema.safeParse({
      activityId: field(formData, "activityId"),
      text: field(formData, "text"),
      channel: field(formData, "channel") ?? "visit",
      contactId: field(formData, "contactId"),
      projectId: field(formData, "projectId"),
    });
    if (!parsed.success) {
      const fieldErrors = fieldErrorsOf(parsed.error, tc("required"), tc("invalid"));
      if (fieldErrors.text) fieldErrors.text = t("textRequired");
      return { ok: false, error: fieldErrors.text ?? tc("invalid"), fieldErrors };
    }
    const input = parsed.data;

    const entry = await mineToCorrect(actor, input.activityId);
    if ("error" in entry) return entry;
    if (!(await mayWriteFor(entry.happenedOn))) {
      return { ok: false, error: t("activityDayClosed") };
    }

    if (input.projectId) {
      const [row] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.companyId, entry.companyId)))
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
        .where(and(eq(contacts.id, input.contactId), eq(contacts.companyId, entry.companyId)))
        .limit(1);
      if (!row) {
        return {
          ok: false,
          error: t("contactNotAtCompany"),
          fieldErrors: { contactId: t("contactNotAtCompany") },
        };
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(activities)
        .set({
          text: input.text,
          channel: input.channel,
          contactId: input.contactId ?? null,
          projectId: input.projectId ?? null,
        })
        .where(eq(activities.id, input.activityId));

      // The words as they were, so the audit line is the correction and not
      // merely a note that one happened.
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "activity.edit",
        recordType: "activity",
        recordId: input.activityId,
        details: { was: entry.text, now: input.text, channel: input.channel },
      });
    });

    revalidateFloor();
    return { ok: true };
  });
}

/**
 * Unfile an entry: it leaves every list and every count, and the row stays
 * (S16, D70). The whole text goes into the audit line, because what is being
 * taken off the screen is the only copy of it.
 */
export async function archiveActivityAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const activityId = field(formData, "activityId");
    if (!activityId) return { ok: false, error: tc("invalid") };

    const entry = await mineToCorrect(actor, activityId);
    if ("error" in entry) return entry;

    await db.transaction(async (tx) => {
      await tx
        .update(activities)
        .set({ archivedAt: new Date() })
        .where(eq(activities.id, activityId));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "activity.archive",
        recordType: "activity",
        recordId: activityId,
        details: {
          companyId: entry.companyId,
          happenedOn: entry.happenedOn,
          text: entry.text,
        },
      });
    });

    revalidateFloor();
    return { ok: true };
  });
}

type Correctable = { companyId: string; happenedOn: Day; text: string };

/**
 * The one gate both corrections ask: it is his own entry, it is still filed,
 * and he is himself.
 *
 * Only the author. A manager sees every rep's log and may not rewrite it —
 * testimony belongs to whoever gave it, and "he changed what I wrote" is the
 * fastest way to lose a floor's trust in a system. An admin viewing as somebody
 * is refused by `requireActor` before this runs.
 */
async function mineToCorrect(
  actor: SessionUser,
  activityId: string,
): Promise<Correctable | { ok: false; error: string }> {
  const t = await getTranslations("errors");
  const [row] = await db
    .select({
      companyId: activities.companyId,
      userId: activities.userId,
      happenedOn: activities.happenedOn,
      text: activities.text,
      archivedAt: activities.archivedAt,
    })
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1);

  if (!row || row.archivedAt) return { ok: false, error: t("activityNotFound") };
  if (row.userId !== actor.id) throw new NotAllowed();
  await assertCompanyMine(actor, row.companyId);

  return {
    companyId: row.companyId,
    happenedOn: row.happenedOn as Day,
    text: row.text,
  };
}
