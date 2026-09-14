"use server";

/**
 * Reports — one entry for one thing that happened with a customer, in the words
 * of the person it happened to (SPEC §3 P13, 13.8; S24).
 *
 * The popup asks for what a rep has to hand the moment a call ends: which
 * customer, who he spoke to, what kind of thing it was, what came of it, and a
 * line in his own words. Twenty seconds on a phone. Everything else — the day,
 * the paper it was about, the next follow-up — is prefilled or optional.
 *
 * Every write commits together (ONE transaction): the entry, the follow-up date
 * it sets on the company and on the project, the audit row and the live notice.
 * A report is one of the two things that set a next follow-up (D9), so writing
 * the entry without moving the date would leave two answers for one figure —
 * the drift trap rules/data.md names.
 *
 * Two reads live here as well, because they are the popup's and nothing else's:
 * the lists it opens on, and the people and papers at the company it is about.
 */

import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  activities,
  auditLog,
  CHANNELS,
  companies,
  contacts,
  dispatches,
  outcomes,
  projects,
  quotations,
} from "@/db/schema";
import {
  assertMayReport,
  mayReportOn,
  mayWriteFor,
  projectOwner,
} from "@/lib/activities";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { lastWorkingDay } from "@/lib/calendar";
import { parseDay, todayRiyadh, type Day } from "@/lib/dates";
import { mayWrite } from "@/lib/floor";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { dispatchLabel, quotationLabel } from "@/lib/labels";
import { liveAudienceForCompany, notifyLive } from "@/lib/live";
import { listOutcomes } from "@/lib/reports";
import type { ActionResult, SessionUser } from "@/lib/types";
import { mayWorkProject, onCompanySql, onProjectSql } from "@/lib/visibility";
import { isLatestRevisionSql } from "@/lib/quotations";
import { sameField, sinceTwinWindow } from "@/lib/writes";

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor());
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("reports action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

function revalidateFloor(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/companies", "page");
  revalidatePath("/[locale]/projects", "page");
  revalidatePath("/[locale]/reports", "page");
}

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const { y, m, d } = parseDay(day);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  });

/* ---- the reads the popup opens on ------------------------------------------ */

/** One row of a picker in the popup. `hint` is the quieter second line. */
export type ReportOption = { value: string; label: string; hint?: string };

export type ReportForm = {
  /** The customers this person may write about: his own and those shared with him (D147). */
  companies: ReportOption[];
  /** What came of it — the admin's active list, in his order (D171). */
  outcomes: { id: number; name: string }[];
  /** The two days a report may be about (D58). */
  today: Day;
  lastWorkingDay: Day;
};

/**
 * What the popup needs before anything is chosen. Read when it opens rather than
 * carried by every screen that can open it — the popup is reachable from
 * everywhere, and a list of customers serialised into every page would be the
 * megabyte D82 took off the rep's home.
 */
export async function reportFormAction(): Promise<ActionResult<ReportForm>> {
  return guard(async (actor) => {
    const locale = await getLocale();
    const today = todayRiyadh();
    const [companyRows, outcomeRows, previous] = await Promise.all([
      mayWrite(actor, actor.id)
        ? db
            .select({ id: companies.id, name: companies.name })
            .from(companies)
            .where(
              and(
                isNull(companies.archivedAt),
                or(eq(companies.repId, actor.id), onCompanySql(actor, sql`companies.id`)),
              ),
            )
            .orderBy(asc(companies.name))
        : [],
      listOutcomes(locale),
      lastWorkingDay(today),
    ]);
    return {
      ok: true,
      data: {
        companies: companyRows.map((row) => ({ value: row.id, label: row.name })),
        outcomes: outcomeRows.filter((row) => row.active).map(({ id, name }) => ({ id, name })),
        today,
        lastWorkingDay: previous,
      },
    };
  });
}

export type ReportTargets = {
  companyName: string;
  /** Everybody kept on the customer; his own people first. */
  contacts: ReportOption[];
  /** The one the form starts on: the main contact, or the only one, or nobody. */
  mainContact: string;
  /** Live jobs at the customer — a lost or archived one takes no more reports (S20). */
  projects: ReportOption[];
  /** Quotations at the customer, newest first; `hint` names the job. */
  quotations: (ReportOption & { projectId: string | null })[];
  /** Dispatches at the customer, newest first. */
  dispatches: (ReportOption & { projectId: string | null; quotationId: string | null })[];
  /** Whether the customer's own follow-up date is his to move (D9, D147). */
  companyFollowUp: boolean;
  /** The jobs whose follow-up date he may move: its rep, or somebody put on it. */
  workedProjects: string[];
};

/**
 * The people and papers at one customer, for the popup's second half.
 *
 * Authorized by the same gate the write asks: a customer he may not report on
 * is one whose people he is not told about here either.
 */
export async function reportTargetsAction(input: unknown): Promise<ActionResult<ReportTargets>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const parsed = z
      .object({
        companyId: z.uuid(),
        // The paper the popup was opened on, or the entry being corrected names
        // (P13 review). The lists below leave out a superseded or withdrawn
        // quotation and stop at the newest thirty, and a drawer can open the
        // popup on any of them — the field then read blank while the report was
        // filed against it. So the prefilled one is read by id and put first.
        quotationId: z.uuid().optional(),
        dispatchId: z.uuid().optional(),
      })
      .safeParse(input ?? {});
    if (!parsed.success) return { ok: false, error: tc("invalid") };
    const { companyId } = parsed.data;
    const gate = await assertMayReport(actor, companyId);

    // Read by id, and only at THIS company: the gate above is what says he may
    // see what is under it (D147), and a paper at another company is not his to
    // be told about here — it is simply not offered, and the write refuses it.
    const prefilledDispatch = parsed.data.dispatchId
      ? await db
          .select({
            id: dispatches.id,
            number: dispatches.number,
            projectId: dispatches.projectId,
            quotationId: dispatches.quotationId,
            projectName: projects.name,
          })
          .from(dispatches)
          .leftJoin(projects, eq(projects.id, dispatches.projectId))
          .where(and(eq(dispatches.id, parsed.data.dispatchId), eq(dispatches.companyId, companyId)))
          .limit(1)
      : [];
    // A prefilled load fills in its paper (D176), so that paper must be a choice
    // too, however old: the quotation named, and the one the load names.
    const paperIds = [
      ...new Set(
        [parsed.data.quotationId, prefilledDispatch[0]?.quotationId].filter(
          (id): id is string => typeof id === "string",
        ),
      ),
    ];
    const prefilledQuotation =
      paperIds.length > 0
        ? await db
            .select({
              id: quotations.id,
              number: quotations.number,
              revision: quotations.revision,
              projectId: quotations.projectId,
              projectName: projects.name,
            })
            .from(quotations)
            .leftJoin(projects, eq(projects.id, quotations.projectId))
            .where(and(inArray(quotations.id, paperIds), eq(quotations.companyId, companyId)))
            .orderBy(desc(quotations.number), desc(quotations.revision))
        : [];

    const [company, contactRows, projectRows, quotationRows, dispatchRows] = await Promise.all([
      db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1),
      db
        .select({
          id: contacts.id,
          name: contacts.name,
          isMain: contacts.isMain,
          repId: contacts.repId,
        })
        .from(contacts)
        .where(and(eq(contacts.companyId, companyId), isNull(contacts.archivedAt)))
        // His own people first, then the owner's, each with the main one on top
        // (D18, D147): on a shared customer the person HE rings is the one he
        // marked, and the owner's main contact is the next best guess.
        .orderBy(
          desc(sql`${contacts.repId} = ${actor.id}::uuid`),
          desc(sql`${contacts.repId} = ${gate.repId}::uuid`),
          desc(contacts.isMain),
          asc(contacts.createdAt),
        ),
      db
        .select({
          id: projects.id,
          name: projects.name,
          repId: projects.repId,
          onProject: onProjectSql(actor, sql`projects.id`).mapWith(Boolean),
        })
        .from(projects)
        .where(
          and(
            eq(projects.companyId, companyId),
            isNull(projects.archivedAt),
            isNull(projects.lostAt),
          ),
        )
        .orderBy(asc(projects.name)),
      db
        .select({
          id: quotations.id,
          number: quotations.number,
          revision: quotations.revision,
          projectId: quotations.projectId,
          projectName: projects.name,
        })
        .from(quotations)
        .leftJoin(projects, eq(projects.id, quotations.projectId))
        .where(
          and(
            eq(quotations.companyId, companyId),
            ne(quotations.status, "cancelled"),
            isLatestRevisionSql(),
          ),
        )
        .orderBy(desc(quotations.number))
        .limit(30),
      db
        .select({
          id: dispatches.id,
          number: dispatches.number,
          projectId: dispatches.projectId,
          quotationId: dispatches.quotationId,
          projectName: projects.name,
        })
        .from(dispatches)
        .leftJoin(projects, eq(projects.id, dispatches.projectId))
        .where(eq(dispatches.companyId, companyId))
        .orderBy(desc(dispatches.number))
        .limit(30),
    ]);

    // The main contact, when there is one marked; the only contact, when there
    // is only one; otherwise nobody, because a guess would misname the call (D115).
    const marked = contactRows.find((row) => row.isMain);
    const mainContact = marked?.id ?? (contactRows.length === 1 ? contactRows[0].id : "");

    return {
      ok: true,
      data: {
        companyName: company[0]?.name ?? "",
        contacts: contactRows.map((row) => ({ value: row.id, label: row.name })),
        mainContact,
        projects: projectRows.map((row) => ({ value: row.id, label: row.name })),
        // The prefilled paper first, then the rest without it (P13 review).
        quotations: [
          ...prefilledQuotation,
          ...quotationRows.filter((row) => !prefilledQuotation.some((one) => one.id === row.id)),
        ].map((row) => ({
          value: row.id,
          label: quotationLabel(row.number, row.revision),
          hint: row.projectName ?? undefined,
          projectId: row.projectId,
        })),
        dispatches: [
          ...prefilledDispatch,
          ...dispatchRows.filter((row) => !prefilledDispatch.some((one) => one.id === row.id)),
        ].map((row) => ({
          value: row.id,
          label: dispatchLabel(row.number),
          hint: row.projectName ?? undefined,
          projectId: row.projectId,
          quotationId: row.quotationId,
        })),
        companyFollowUp: mayWrite(actor, gate.repId),
        workedProjects: projectRows
          .filter((row) => mayWorkProject(actor, row.repId, row.onProject))
          .map((row) => row.id),
      },
    };
  });
}

/* ---- the writes ------------------------------------------------------------- */

const kind = z.enum(CHANNELS);
const outcomeId = z.coerce.number().int().positive();

const addSchema = z.object({
  companyId: z.uuid(),
  contactId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  quotationId: z.uuid().optional(),
  dispatchId: z.uuid().optional(),
  kind,
  outcomeId,
  text: z.string().trim().min(1).max(4000),
  happenedOn: dayString.optional(),
  nextFollowUp: dayString.optional(),
});

type Links = {
  contactId?: string;
  projectId?: string;
  quotationId?: string;
  dispatchId?: string;
};

type Refusal = { ok: false; error: string; fieldErrors: Record<string, string> };

function refusal(field: string, error: string): Refusal {
  return { ok: false, error, fieldErrors: { [field]: error } };
}

/**
 * Every link a report names must be at the company it is filed under — or the
 * report claims something that never happened — and a paper must be on the job
 * the report names when it names one. Visible to the writer follows: everything
 * under a company he may report on is his to see (D147).
 *
 * Returns the project's own rep and share, which the follow-up asks about.
 */
async function checkLinks(
  actor: SessionUser,
  companyId: string,
  links: Links,
): Promise<Refusal | { project: { repId: string; onProject: boolean } | null }> {
  const t = await getTranslations("errors");
  const tr = await getTranslations("reports");

  if (links.contactId) {
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.id, links.contactId),
          eq(contacts.companyId, companyId),
          isNull(contacts.archivedAt),
        ),
      )
      .limit(1);
    if (!row) return refusal("contactId", t("contactNotAtCompany"));
  }

  let project: { repId: string; onProject: boolean } | null = null;
  if (links.projectId) {
    const owner = await projectOwner(actor, links.projectId);
    const [row] = await db
      .select({ lostAt: projects.lostAt, archivedAt: projects.archivedAt })
      .from(projects)
      .where(eq(projects.id, links.projectId))
      .limit(1);
    if (!owner || owner.companyId !== companyId || !row || row.archivedAt) {
      return refusal("projectId", t("projectNotAtCompany"));
    }
    // A lost project is finished work (S20): nothing new is filed against it.
    if (row.lostAt) return refusal("projectId", tr("refused.projectLost"));
    project = { repId: owner.projectRepId, onProject: owner.onProject };
  }

  if (links.quotationId) {
    const [row] = await db
      .select({ companyId: quotations.companyId, projectId: quotations.projectId })
      .from(quotations)
      .where(eq(quotations.id, links.quotationId))
      .limit(1);
    if (!row || row.companyId !== companyId) {
      return refusal("quotationId", tr("refused.quotationNotAtCompany"));
    }
    if (links.projectId && row.projectId && row.projectId !== links.projectId) {
      return refusal("quotationId", tr("refused.quotationNotOnProject"));
    }
  }

  if (links.dispatchId) {
    const [row] = await db
      .select({
        companyId: dispatches.companyId,
        projectId: dispatches.projectId,
        quotationId: dispatches.quotationId,
      })
      .from(dispatches)
      .where(eq(dispatches.id, links.dispatchId))
      .limit(1);
    if (!row || row.companyId !== companyId) {
      return refusal("dispatchId", tr("refused.dispatchNotAtCompany"));
    }
    if (
      (links.projectId && row.projectId && row.projectId !== links.projectId) ||
      (links.quotationId && row.quotationId && row.quotationId !== links.quotationId)
    ) {
      return refusal("dispatchId", tr("refused.dispatchNotOnPaper"));
    }
  }

  return { project };
}

/** What came of it must be on the admin's list, and still on it (D171). */
async function outcomeIsActive(id: number): Promise<boolean> {
  const [row] = await db
    .select({ active: outcomes.active })
    .from(outcomes)
    .where(eq(outcomes.id, id))
    .limit(1);
  return row?.active === true;
}

function refusedFields(error: z.ZodError, required: string, invalid: string, textRequired: string) {
  const fieldErrors = fieldErrorsOf(error, required, invalid);
  if (fieldErrors.text) fieldErrors.text = textRequired;
  const first = fieldErrors.companyId ?? fieldErrors.kind ?? fieldErrors.outcomeId ?? fieldErrors.text;
  return { ok: false as const, error: first ?? invalid, fieldErrors };
}

/**
 * Add a report — the popup reachable from everywhere (DESIGN §2: anything daily
 * is two clicks from home). Returns the new entry's id.
 */
export async function addReportAction(
  _prev: ActionResult<{ activityId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ activityId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");
    const tr = await getTranslations("reports");

    const parsed = addSchema.safeParse({
      companyId: field(formData, "companyId"),
      contactId: field(formData, "contactId"),
      projectId: field(formData, "projectId"),
      quotationId: field(formData, "quotationId"),
      dispatchId: field(formData, "dispatchId"),
      kind: field(formData, "kind"),
      outcomeId: field(formData, "outcomeId"),
      text: field(formData, "text"),
      happenedOn: field(formData, "happenedOn"),
      nextFollowUp: field(formData, "nextFollowUp"),
    });
    if (!parsed.success) {
      return refusedFields(parsed.error, tc("required"), tc("invalid"), t("textRequired"));
    }
    const input = parsed.data;

    // His own customer or one shared with him (D147); the manager reading every
    // floor is refused here, as a viewer is by `requireActor` above (D42).
    const gate = await assertMayReport(actor, input.companyId);
    // Archived is off the floor (S16): nothing new is added to a company that is
    // on nobody's list.
    if (gate.archived) return { ok: false, error: t("companyArchived") };

    if (!(await outcomeIsActive(input.outcomeId))) {
      return refusal("outcomeId", tr("refused.outcomeGone"));
    }

    // Today, or the last working day — the window every report has (D58). The
    // popup offers exactly those two, and this is the law behind the offer.
    const today = todayRiyadh();
    const happenedOn = input.happenedOn ?? today;
    if (!(await mayWriteFor(happenedOn, today))) {
      return refusal("happenedOn", tr("refused.dayClosed"));
    }

    const links = await checkLinks(actor, input.companyId, input);
    if ("ok" in links) return links;

    // Whose date a follow-up moves (D9, D147): the customer's own, when the
    // customer is his; the job's, when he works the job. A rep reporting on a
    // colleague's customer with no job named has no date of his to move.
    const setsCompany = mayWrite(actor, gate.repId);
    const setsProject =
      links.project !== null && mayWorkProject(actor, links.project.repId, links.project.onProject);
    if (input.nextFollowUp && !setsCompany && !setsProject) {
      return refusal("nextFollowUp", tr("refused.followUpNotYours"));
    }

    // Pressed twice is one write (D134): the wire can lose the answer after the
    // row has landed, and the rep presses Save again with the same words. It has
    // to be the SAME write — the same words, kind and outcome, against the same
    // people and papers, on the same day, with the same follow-up. An unfiled
    // row is never a twin: unfiling and writing again is how a wrong day is fixed.
    const recent = await db
      .select({
        id: activities.id,
        projectId: activities.projectId,
        contactId: activities.contactId,
        quotationId: activities.quotationId,
        dispatchId: activities.dispatchId,
        outcomeId: activities.outcomeId,
        happenedOn: activities.happenedOn,
        nextFollowUp: activities.nextFollowUp,
      })
      .from(activities)
      .where(
        and(
          eq(activities.companyId, input.companyId),
          eq(activities.userId, actor.id),
          eq(activities.text, input.text),
          eq(activities.channel, input.kind),
          isNull(activities.archivedAt),
          gte(activities.createdAt, sinceTwinWindow()),
        ),
      )
      .limit(5);
    const twin = recent.find(
      (row) =>
        sameField(input.projectId, row.projectId) &&
        sameField(input.contactId, row.contactId) &&
        sameField(input.quotationId, row.quotationId) &&
        sameField(input.dispatchId, row.dispatchId) &&
        sameField(input.outcomeId, row.outcomeId) &&
        sameField(happenedOn, row.happenedOn) &&
        sameField(input.nextFollowUp, row.nextFollowUp),
    );
    if (twin) return { ok: true, data: { activityId: twin.id } };

    const activityId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(activities)
        .values({
          companyId: input.companyId,
          projectId: input.projectId ?? null,
          contactId: input.contactId ?? null,
          quotationId: input.quotationId ?? null,
          dispatchId: input.dispatchId ?? null,
          userId: actor.id,
          text: input.text,
          channel: input.kind,
          outcomeId: input.outcomeId,
          happenedOn,
          nextFollowUp: input.nextFollowUp ?? null,
        })
        .returning({ id: activities.id });

      if (input.nextFollowUp) {
        if (setsCompany) {
          await tx
            .update(companies)
            .set({ nextFollowUp: input.nextFollowUp })
            .where(eq(companies.id, input.companyId));
        }
        if (setsProject && input.projectId) {
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
          quotationId: input.quotationId ?? null,
          dispatchId: input.dispatchId ?? null,
          channel: input.kind,
          outcomeId: input.outcomeId,
          happenedOn,
          nextFollowUp: input.nextFollowUp ?? null,
        },
      });

      // Everyone who reads this customer, and the manager and the admin who
      // read every report — their Reports screen moves without a reload.
      const audience = await liveAudienceForCompany(input.companyId, actor.id);
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

const correctSchema = z.object({
  activityId: z.uuid(),
  kind,
  outcomeId,
  text: z.string().trim().min(1).max(4000),
  contactId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  quotationId: z.uuid().optional(),
  dispatchId: z.uuid().optional(),
});

/**
 * Correct a report (D70).
 *
 * Only the author, and only while the DAY it belongs to is still open (D58). What
 * can be changed is what he meant to write — the words, the kind, what came of
 * it, whose meeting it was and which job or paper — and not the day, and not the
 * follow-up: the day is the entry's identity, and the follow-up is a figure two
 * other screens read. The wrong COMPANY is not corrected here; it is unfiled,
 * and the right report is written where it belongs.
 */
export async function correctReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");
    const tr = await getTranslations("reports");

    const parsed = correctSchema.safeParse({
      activityId: field(formData, "activityId"),
      kind: field(formData, "kind"),
      outcomeId: field(formData, "outcomeId"),
      text: field(formData, "text"),
      contactId: field(formData, "contactId"),
      projectId: field(formData, "projectId"),
      quotationId: field(formData, "quotationId"),
      dispatchId: field(formData, "dispatchId"),
    });
    if (!parsed.success) {
      return refusedFields(parsed.error, tc("required"), tc("invalid"), t("textRequired"));
    }
    const input = parsed.data;

    const entry = await mineToCorrect(actor, input.activityId);
    if ("error" in entry) return entry;
    if (!(await mayWriteFor(entry.happenedOn))) {
      return { ok: false, error: t("activityDayClosed") };
    }
    // An outcome the admin has since retired may stay on the entry that had it;
    // it may not be chosen anew.
    if (input.outcomeId !== entry.outcomeId && !(await outcomeIsActive(input.outcomeId))) {
      return refusal("outcomeId", tr("refused.outcomeGone"));
    }

    const links = await checkLinks(actor, entry.companyId, input);
    if ("ok" in links) return links;

    await db.transaction(async (tx) => {
      await tx
        .update(activities)
        .set({
          text: input.text,
          channel: input.kind,
          outcomeId: input.outcomeId,
          contactId: input.contactId ?? null,
          projectId: input.projectId ?? null,
          quotationId: input.quotationId ?? null,
          dispatchId: input.dispatchId ?? null,
        })
        .where(eq(activities.id, input.activityId));

      // The words as they were, so the audit line is the correction and not
      // merely a note that one happened.
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "activity.edit",
        recordType: "activity",
        recordId: input.activityId,
        details: {
          was: entry.text,
          now: input.text,
          channel: input.kind,
          outcomeId: input.outcomeId,
        },
      });

      // A correction is news exactly as the entry was (D94).
      const audience = await liveAudienceForCompany(entry.companyId, actor.id);
      await notifyLive(tx, audience, { type: "company", id: entry.companyId });
      if (input.projectId) {
        await notifyLive(tx, audience, { type: "project", id: input.projectId });
      }
    });

    revalidateFloor();
    return { ok: true };
  });
}

/**
 * Unfile a report: it leaves every list and every count, and the row stays
 * (S16, D70). The whole text goes into the audit line, because what is being
 * taken off the screen is the only copy of it.
 */
export async function unfileReportAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");
    const activityId = field(formData, "activityId");
    if (!activityId || !z.uuid().safeParse(activityId).success) {
      return { ok: false, error: tc("invalid") };
    }

    const entry = await mineToCorrect(actor, activityId);
    if ("error" in entry) return entry;
    // The correction's window (D58, D70, D87): an entry that vanishes from a
    // day rewrites a figure the same way rewording it does.
    if (!(await mayWriteFor(entry.happenedOn))) {
      return { ok: false, error: t("activityDayClosed") };
    }

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

      // Unfiled is news too (D94): every count that included it moves.
      await notifyLive(tx, await liveAudienceForCompany(entry.companyId, actor.id), {
        type: "company",
        id: entry.companyId,
      });
    });

    revalidateFloor();
    return { ok: true };
  });
}

type Correctable = { companyId: string; happenedOn: Day; text: string; outcomeId: number };

/**
 * The one gate both corrections ask: it is his own report, it is still filed,
 * and he may still report on the customer it names.
 *
 * Only the author. A manager reads every rep's reports and may not rewrite them
 * — testimony belongs to whoever gave it, and "he changed what I wrote" is the
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
      outcomeId: activities.outcomeId,
      archivedAt: activities.archivedAt,
      repId: companies.repId,
      shared: onCompanySql(actor, sql`companies.id`).mapWith(Boolean),
    })
    .from(activities)
    .innerJoin(companies, eq(companies.id, activities.companyId))
    .where(eq(activities.id, activityId))
    .limit(1);

  if (!row || row.archivedAt) return { ok: false, error: t("activityNotFound") };
  if (row.userId !== actor.id || !mayReportOn(actor, row.repId, row.shared)) {
    throw new NotAllowed();
  }

  return {
    companyId: row.companyId,
    happenedOn: row.happenedOn as Day,
    text: row.text,
    outcomeId: row.outcomeId,
  };
}
