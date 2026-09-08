"use server";

/**
 * Companies — every write on the rep floor's front door.
 *
 * Each action starts at `requireActor()`, validates with Zod before it touches
 * the database, and returns an ActionResult whose `error` is a finished
 * sentence in the reader's language. A Zod failure is never allowed to escape
 * as a 500: the form gets `fieldErrors` and shows them beside the fields.
 *
 * The company carries NO phone. The phone lives on the contact and is
 * mandatory there (SPEC §3), so creating a company creates its first contact —
 * both in ONE transaction, with the audit row (S55) and the live notice, so a
 * half-made company can never exist.
 *
 * A duplicate NEVER blocks a save (S15). The warning is a separate read the
 * dialog makes while the rep types — `duplicateCheckAction` in
 * src/actions/forms.ts, over the one matcher in src/lib/companies.ts.
 */

import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  cities,
  companies,
  companyShares,
  contacts,
  countries,
  projectShares,
  projects,
  users,
} from "@/db/schema";
import { assertCompanyMine } from "@/lib/activities";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { sameField, sinceTwinWindow } from "@/lib/writes";
import { FLOOR_ROLES, holdsFloor, mayHandOver } from "@/lib/floor";
import { parseDay } from "@/lib/dates";
import { field, fieldErrorsOf, type FieldErrors } from "@/lib/form-fields";
import { liveAudienceFor, liveAudienceForCompany, notifyLive } from "@/lib/live";
import { createNotification } from "@/lib/notify";
import { SAUDI_CODE } from "@/lib/lookups";
import { isSaudi, normalizePhone } from "@/lib/phone";
import type { ActionResult, Role, SessionUser } from "@/lib/types";

/**
 * The one place `requireActor` and NotAllowed become an ActionResult.
 *
 * `roles` narrows who may run the action at all. Creating a company takes it,
 * because the new row's `rep_id` is the actor's own id — there is no "whose
 * company is this" field in the dialog, and there should not be one: a company
 * belongs to the rep who found it (SPEC S8). A manager or admin pressing Save
 * would quietly become its rep, so they are refused instead, and the button is
 * not offered to them either (WORKFLOW §3, Abdulrahman: no Add company button).
 * The list is `FLOOR_ROLES` rather than a literal, so who owns companies is one
 * sentence and every screen asks that same one (P8.9).
 */
async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
  ...roles: Role[]
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("companies action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

/** The rep floor's three screens all read companies; all three go stale. */
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

const companyFields = {
  name: z.string().trim().min(1).max(200),
  categoryId: z.coerce.number().int().positive(),
  leadSourceId: z.coerce.number().int().positive(),
  countryId: z.coerce.number().int().positive(),
  cityId: z.coerce.number().int().positive().optional(),
  cityText: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
};

const createSchema = z.object({
  ...companyFields,
  contactName: z.string().trim().min(1).max(200),
  contactPhone: z.string().trim().min(1).max(40),
  contactPosition: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactNotes: z.string().trim().max(4000).optional(),
});

const updateSchema = z.object({ ...companyFields, companyId: z.uuid() });

/**
 * Saudi Arabia picks its city from a list; everywhere else types it (SPEC §3).
 * Resolved against the database rather than a constant, so an admin renaming a
 * lookup cannot make the form lie.
 */
async function resolvePlace(
  countryId: number,
  cityId: number | undefined,
  cityText: string | undefined,
  t: (key: string) => string,
): Promise<
  | { ok: true; cityId: number | null; cityText: string | null; country: string }
  | { ok: false; fieldErrors: FieldErrors }
> {
  const [country] = await db
    .select({ code: countries.code })
    .from(countries)
    .where(and(eq(countries.id, countryId), eq(countries.active, true)))
    .limit(1);
  if (!country) return { ok: false, fieldErrors: { countryId: t("countryUnknown") } };

  if (country.code !== SAUDI_CODE) {
    if (!cityText) return { ok: false, fieldErrors: { cityText: t("cityTextRequired") } };
    return { ok: true, cityId: null, cityText, country: country.code };
  }

  if (cityId === undefined) return { ok: false, fieldErrors: { cityId: t("cityRequired") } };
  const [city] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.id, cityId), eq(cities.countryId, countryId)))
    .limit(1);
  if (!city) return { ok: false, fieldErrors: { cityId: t("cityNotInCountry") } };
  return { ok: true, cityId: city.id, cityText: null, country: country.code };
}

/**
 * Add company — the dialog with the first contact inside it (SPEC §3).
 * Returns the new id so the list can highlight the row and open its drawer.
 */
export async function createCompanyAction(
  _prev: ActionResult<{ companyId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ companyId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = createSchema.safeParse({
      name: field(formData, "name"),
      categoryId: field(formData, "categoryId"),
      leadSourceId: field(formData, "leadSourceId"),
      countryId: field(formData, "countryId"),
      cityId: field(formData, "cityId"),
      cityText: field(formData, "cityText"),
      notes: field(formData, "notes"),
      contactName: field(formData, "contactName"),
      contactPhone: field(formData, "contactPhone"),
      contactPosition: field(formData, "contactPosition"),
      contactEmail: field(formData, "contactEmail"),
      contactNotes: field(formData, "contactNotes"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }
    const input = parsed.data;

    const place = await resolvePlace(input.countryId, input.cityId, input.cityText, t);
    if (!place.ok) return { ok: false, error: tc("invalid"), fieldErrors: place.fieldErrors };

    // Read in the country just chosen (D89), not as Saudi whatever the country.
    const phoneNormalized = normalizePhone(input.contactPhone, place.country);
    if (!phoneNormalized) {
      const sentence = t(isSaudi(place.country) ? "phoneInvalid" : "phoneInvalidAbroad");
      return { ok: false, error: sentence, fieldErrors: { contactPhone: sentence } };
    }
    if (input.contactEmail && !z.email().safeParse(input.contactEmail).success) {
      return {
        ok: false,
        error: t("emailInvalid"),
        fieldErrors: { contactEmail: t("emailInvalid") },
      };
    }

    // Pressed twice is one company (D134): the same name from the same rep
    // inside two minutes is the Save whose answer the wire lost — but only if
    // the whole form is the same one. A rep told nothing was saved may fix a
    // digit in the phone before pressing again, and answering that with the
    // company he typed first would lose the fix without saying so.
    const [candidate] = await db
      .select({
        id: companies.id,
        categoryId: companies.categoryId,
        leadSourceId: companies.leadSourceId,
        countryId: companies.countryId,
        cityId: companies.cityId,
        cityText: companies.cityText,
        notes: companies.notes,
      })
      .from(companies)
      .where(
        and(
          eq(companies.repId, actor.id),
          eq(companies.name, input.name),
          isNull(companies.archivedAt),
          gte(companies.createdAt, sinceTwinWindow()),
        ),
      )
      .limit(1);
    if (
      candidate &&
      sameField(input.categoryId, candidate.categoryId) &&
      sameField(input.leadSourceId, candidate.leadSourceId) &&
      sameField(input.countryId, candidate.countryId) &&
      sameField(place.cityId, candidate.cityId) &&
      sameField(place.cityText, candidate.cityText) &&
      sameField(input.notes, candidate.notes)
    ) {
      const [contact] = await db
        .select({
          id: contacts.id,
          position: contacts.position,
          email: contacts.email,
          notes: contacts.notes,
        })
        .from(contacts)
        .where(
          and(
            eq(contacts.companyId, candidate.id),
            eq(contacts.name, input.contactName),
            eq(contacts.phoneNormalized, phoneNormalized),
          ),
        )
        .limit(1);
      if (
        contact &&
        sameField(input.contactPosition, contact.position) &&
        sameField(input.contactEmail, contact.email) &&
        sameField(input.contactNotes, contact.notes)
      ) {
        return { ok: true, data: { companyId: candidate.id } };
      }
    }

    // The company, its first contact (main by D18) and the audit row commit
    // together, or none of them do.
    const companyId = await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          name: input.name,
          categoryId: input.categoryId,
          leadSourceId: input.leadSourceId,
          countryId: input.countryId,
          cityId: place.cityId,
          cityText: place.cityText,
          notes: input.notes ?? null,
          repId: actor.id,
        })
        .returning({ id: companies.id });

      await tx.insert(contacts).values({
        companyId: company.id,
        repId: actor.id,
        name: input.contactName,
        phone: input.contactPhone,
        phoneNormalized,
        position: input.contactPosition ?? null,
        email: input.contactEmail ?? null,
        notes: input.contactNotes ?? null,
        isMain: true,
      });

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.create",
        recordType: "company",
        recordId: company.id,
        details: { name: input.name },
      });

      await notifyLive(tx, await liveAudienceFor(actor.id, actor.id), {
        type: "company",
        id: company.id,
      });
      return company.id;
    });

    revalidateFloor();
    return { ok: true, data: { companyId } };
  }, ...FLOOR_ROLES);
}

/** Edit — the same fields, minus the contact, which has its own dialog. */
export async function updateCompanyAction(
  _prev: ActionResult<{ companyId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ companyId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = updateSchema.safeParse({
      companyId: field(formData, "companyId"),
      name: field(formData, "name"),
      categoryId: field(formData, "categoryId"),
      leadSourceId: field(formData, "leadSourceId"),
      countryId: field(formData, "countryId"),
      cityId: field(formData, "cityId"),
      cityText: field(formData, "cityText"),
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

    await assertCompanyMine(actor, input.companyId);
    const place = await resolvePlace(input.countryId, input.cityId, input.cityText, t);
    if (!place.ok) return { ok: false, error: tc("invalid"), fieldErrors: place.fieldErrors };

    await db.transaction(async (tx) => {
      await tx
        .update(companies)
        .set({
          name: input.name,
          categoryId: input.categoryId,
          leadSourceId: input.leadSourceId,
          countryId: input.countryId,
          cityId: place.cityId,
          cityText: place.cityText,
          notes: input.notes ?? null,
        })
        .where(eq(companies.id, input.companyId));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.update",
        recordType: "company",
        recordId: input.companyId,
        details: { name: input.name },
      });

      await notifyLive(tx, await liveAudienceForCompany(input.companyId, actor.id), {
        type: "company",
        id: input.companyId,
      });
    });

    revalidateFloor();
    return { ok: true, data: { companyId: input.companyId } };
  });
}

/**
 * The picker at the top of the drawer (SPEC D9). `day` is null to clear it —
 * clearing is a decision the rep makes, not a dismissal of a reminder (S52).
 */
export async function setCompanyFollowUpAction(
  companyId: unknown,
  day: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");
    const id = z.uuid().safeParse(companyId);
    const parsedDay = z.union([dayString, z.null()]).safeParse(day ?? null);
    if (!id.success) return { ok: false, error: tc("invalid") };
    if (!parsedDay.success) {
      return { ok: false, error: tc("notADate"), fieldErrors: { nextFollowUp: tc("notADate") } };
    }

    const { archived } = await assertCompanyMine(actor, id.data);
    // A date on an archived company would chase a row that appears on no list.
    if (archived) return { ok: false, error: t("companyArchived") };

    await db.transaction(async (tx) => {
      await tx
        .update(companies)
        .set({ nextFollowUp: parsedDay.data })
        .where(eq(companies.id, id.data));
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.followUp",
        recordType: "company",
        recordId: id.data,
        details: { nextFollowUp: parsedDay.data },
      });
      await notifyLive(tx, await liveAudienceForCompany(id.data, actor.id), {
        type: "company",
        id: id.data,
      });
    });

    revalidateFloor();
    return { ok: true };
  });
}

/**
 * Hand this company to somebody else (P8.9).
 *
 * The action marketing exists for: it finds a customer, works him, and passes
 * him to the rep who will quote. It is also how a floor survives a person —
 * before this, deactivating an account took its companies out of sight for
 * good, because every list is scoped by `companies.rep_id`.
 *
 * What travels is the customer and the work under him: the company, and since
 * P12 the departing rep's projects and contacts as well, because those now say
 * whose they are (D147) and a company that arrives without its people is a
 * customer the new owner cannot phone. The quotations, the dispatches and the
 * achieved metres do NOT travel — they are read by who raised them (D86, the
 * note on `achievedByRep`) — and neither does the log, because an activity
 * records who did it and rewriting that would be rewriting the report (S27).
 *
 * Both sides are told. The new owner gets a notification, because a company
 * appearing on his floor with a follow-up already on it is news; the audit row
 * carries both names, for the six-months-later question (S55).
 */
export async function handOverCompanyAction(
  companyId: unknown,
  toUserId: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");

    // Two answers, two sentences: a broken id is "something is not right", and
    // "you have not said who" is its own line, because it is the one a person
    // actually hits — the confirm button is live before the picker is touched,
    // the way every control in the app is (DESIGN §5).
    const id = z.uuid().safeParse(companyId);
    if (!id.success) return { ok: false, error: tc("invalid") };
    const to = z.uuid().safeParse(toUserId);
    if (!to.success) return { ok: false, error: t("handOverWho") };
    const input = { companyId: id.data, toUserId: to.data };

    // Not `assertCompanyMine`: the manager writes nothing on a floor and still
    // decides whose floor it is (D42, `mayHandOver`). Archived is not there:
    // a company off the floor has no floor to move to, and restoring it is the
    // admin's own action (S16).
    const [company] = await db
      .select({ id: companies.id, name: companies.name, repId: companies.repId })
      .from(companies)
      .where(and(eq(companies.id, input.companyId), isNull(companies.archivedAt)))
      .limit(1);
    if (!company) return { ok: false, error: t("companyNotFound") };
    if (!mayHandOver(actor, company.repId)) throw new NotAllowed();

    // Active, and somebody a company can sit with. A deactivated account would
    // take the company back out of sight the moment it landed there, and the
    // coordinator has no floor at all (D15).
    const [target] = await db
      // The name is not shown; only the role and the id decide anything here.
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.id, input.toUserId), eq(users.active, true)))
      .limit(1);
    if (!target || !holdsFloor(target.role)) return { ok: false, error: t("handOverWho") };
    if (target.id === company.repId) return { ok: false, error: t("handOverSame") };

    const from = company.repId;
    await db.transaction(async (tx) => {
      await tx
        .update(companies)
        .set({ repId: target.id })
        .where(eq(companies.id, company.id));

      // What was his under this customer goes with it. D51 said the whole floor
      // travels because everything was read through `companies.rep_id`; since
      // P12 a project and a contact say whose they are (D147), so moving the
      // company alone would leave the man who left still holding the jobs and
      // the new owner unable to touch them. Only HIS rows move: on a shared
      // company a third rep's project stays his, because a handover is not a
      // way to take somebody else's work.
      const moved = await tx
        .update(projects)
        .set({ repId: target.id })
        .where(and(eq(projects.companyId, company.id), eq(projects.repId, from)))
        .returning({ id: projects.id });

      // A contact belongs to a rep since P12, so the man receiving the company
      // may already hold his OWN row for the same person on it — which is the
      // case sharing exists for, and not a duplicate (D147). Moving the
      // departing rep's row onto him would break two unique indexes at once:
      // one number per rep per company, and one main contact per rep per
      // company. It reached the manager as "something went wrong" and the
      // hand-over quietly did not happen (#159).
      //
      // The row that stands is the one the new owner wrote himself. The
      // arriving duplicate is archived rather than deleted (S16) and stays
      // with the rep who wrote it, because an archived row is history and
      // history keeps its author (D153).
      const alreadyHis = await tx
        .select({ phoneNormalized: contacts.phoneNormalized, isMain: contacts.isMain })
        .from(contacts)
        // Archived ones too: the unique index does not exempt them, so a
        // number he once held here is still a number that cannot arrive.
        .where(and(eq(contacts.companyId, company.id), eq(contacts.repId, target.id)));

      const taken = alreadyHis
        .map((row) => row.phoneNormalized)
        .filter((phone): phone is string => Boolean(phone));
      if (taken.length > 0) {
        await tx
          .update(contacts)
          .set({ archivedAt: new Date() })
          .where(
            and(
              eq(contacts.companyId, company.id),
              eq(contacts.repId, from),
              isNull(contacts.archivedAt),
              inArray(contacts.phoneNormalized, taken),
            ),
          );
      }

      await tx
        .update(contacts)
        .set({
          repId: target.id,
          // He already has a main contact here, and a company has one per rep:
          // the arriving people are his now, and none of them displaces the
          // person he had already picked (D18).
          ...(alreadyHis.some((row) => row.isMain) ? { isMain: false } : {}),
        })
        // Live rows only. An archived contact is a record of who the rep was
        // talking to, and it reads with his name on it wherever it still reads.
        .where(
          and(
            eq(contacts.companyId, company.id),
            eq(contacts.repId, from),
            isNull(contacts.archivedAt),
          ),
        );

      // And he is not left sharing what he now owns — the company, and every
      // job under it that has just become his.
      await tx
        .delete(companyShares)
        .where(and(eq(companyShares.companyId, company.id), eq(companyShares.userId, target.id)));
      if (moved.length > 0) {
        await tx
          .delete(projectShares)
          .where(
            and(
              inArray(
                projectShares.projectId,
                moved.map((row) => row.id),
              ),
              eq(projectShares.userId, target.id),
            ),
          );
      }

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.handOver",
        recordType: "company",
        recordId: company.id,
        details: { name: company.name, from, to: target.id },
      });

      // Not to himself: a rep who hands a company on knows he did.
      if (target.id !== actor.id) {
        await createNotification(tx, {
          userId: target.id,
          kind: "companyHandedOver",
          params: { label: company.name, repId: actor.id },
          link: `/companies?open=${company.id}`,
          subject: { type: "company", id: company.id },
        });
      }

      // Both floors changed, so both are told, and so is everybody who reads
      // the team screen.
      const audience = new Set([
        ...(await liveAudienceForCompany(company.id, actor.id)),
        from,
        target.id,
      ]);
      await notifyLive(tx, [...audience], {
        type: "company",
        id: company.id,
      });
    });

    revalidateFloor();
    revalidatePath("/[locale]/team", "page");
    return { ok: true };
  });
}

/**
 * Archive, never delete (SPEC §3, S16). The row leaves every list and stays in
 * history, so a company that resurfaces in two years still shows what happened.
 */
export async function archiveCompanyAction(companyId: unknown, reason: unknown): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");
    const id = z.uuid().safeParse(companyId);
    if (!id.success) return { ok: false, error: tc("invalid") };
    // Not optional: S16 promises the record shows why someone gave up on the
    // company, and every other terminal state here already carries its reason
    // (D87). Short, because it is read under a name on the archive screen.
    const why = z.string().trim().min(1).max(500).safeParse(reason);
    if (!why.success) {
      const sentence = t("archiveReasonRequired");
      return { ok: false, error: sentence, fieldErrors: { reason: sentence } };
    }

    await assertCompanyMine(actor, id.data);

    const archived = await db.transaction(async (tx) => {
      const rows = await tx
        .update(companies)
        .set({ archivedAt: new Date(), archiveReason: why.data })
        .where(and(eq(companies.id, id.data), isNull(companies.archivedAt)))
        .returning({ id: companies.id });
      if (rows.length === 0) return false;

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.archive",
        recordType: "company",
        recordId: id.data,
        details: { reason: why.data },
      });
      await notifyLive(tx, await liveAudienceForCompany(id.data, actor.id), {
        type: "company",
        id: id.data,
      });
      return true;
    });

    if (!archived) return { ok: false, error: t("companyNotFound") };
    revalidateFloor();
    return { ok: true };
  });
}

