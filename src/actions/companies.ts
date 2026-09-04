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

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, cities, companies, contacts, countries } from "@/db/schema";
import { assertCompanyOpen, assertCompanyVisible } from "@/lib/activities";
import { NotAllowed, requireActor } from "@/lib/authz";
import { liveAudienceFor } from "@/lib/companies";
import { parseDay } from "@/lib/dates";
import { notifyLive } from "@/lib/live";
import { SAUDI_CODE } from "@/lib/lookups";
import { normalizePhone } from "@/lib/phone";
import type { ActionResult, Role, SessionUser } from "@/lib/types";

type Fields = Record<string, string>;

/** A form value, trimmed, with "" read as "not filled in". */
function field(formData: FormData, name: string): string | undefined {
  const raw = formData.get(name);
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value === "" ? undefined : value;
}

/** Turn Zod issues into one message per field name the form knows. */
function fieldErrorsOf(error: z.ZodError, required: string, invalid: string): Fields {
  const out: Fields = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!key || out[key]) continue;
    out[key] =
      issue.code === "invalid_type" || issue.code === "too_small" ? required : invalid;
  }
  return out;
}

/**
 * The one place `requireActor` and NotAllowed become an ActionResult.
 *
 * `roles` narrows who may run the action at all. Creating a company takes it,
 * because the new row's `rep_id` is the actor's own id — there is no "whose
 * company is this" field in the dialog, and there should not be one: a company
 * belongs to the rep who found it (SPEC S8). A manager or admin pressing Save
 * would quietly become its rep, so they are refused instead, and the button is
 * not offered to them either (WORKFLOW §3, Abdulrahman: no Add company button).
 */
async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
  ...roles: Role[]
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
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
): Promise<{ ok: true; cityId: number | null; cityText: string | null } | { ok: false; fieldErrors: Fields }> {
  const [country] = await db
    .select({ code: countries.code })
    .from(countries)
    .where(and(eq(countries.id, countryId), eq(countries.active, true)))
    .limit(1);
  if (!country) return { ok: false, fieldErrors: { countryId: t("countryUnknown") } };

  if (country.code !== SAUDI_CODE) {
    if (!cityText) return { ok: false, fieldErrors: { cityText: t("cityTextRequired") } };
    return { ok: true, cityId: null, cityText };
  }

  if (cityId === undefined) return { ok: false, fieldErrors: { cityId: t("cityRequired") } };
  const [city] = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.id, cityId), eq(cities.countryId, countryId)))
    .limit(1);
  if (!city) return { ok: false, fieldErrors: { cityId: t("cityNotInCountry") } };
  return { ok: true, cityId: city.id, cityText: null };
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

    const phoneNormalized = normalizePhone(input.contactPhone);
    if (!phoneNormalized) {
      return {
        ok: false,
        error: t("phoneInvalid"),
        fieldErrors: { contactPhone: t("phoneInvalid") },
      };
    }
    if (input.contactEmail && !z.email().safeParse(input.contactEmail).success) {
      return {
        ok: false,
        error: t("emailInvalid"),
        fieldErrors: { contactEmail: t("emailInvalid") },
      };
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
  }, "rep");
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

    const repId = await assertCompanyVisible(actor, input.companyId);
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

      await notifyLive(tx, await liveAudienceFor(repId, actor.id), {
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

    const { repId, archived } = await assertCompanyOpen(actor, id.data);
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
      await notifyLive(tx, await liveAudienceFor(repId, actor.id), {
        type: "company",
        id: id.data,
      });
    });

    revalidateFloor();
    return { ok: true };
  });
}

/**
 * Archive, never delete (SPEC §3, S16). The row leaves every list and stays in
 * history, so a company that resurfaces in two years still shows what happened.
 */
export async function archiveCompanyAction(companyId: unknown): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");
    const id = z.uuid().safeParse(companyId);
    if (!id.success) return { ok: false, error: tc("invalid") };

    const repId = await assertCompanyVisible(actor, id.data);

    const archived = await db.transaction(async (tx) => {
      const rows = await tx
        .update(companies)
        .set({ archivedAt: new Date() })
        .where(and(eq(companies.id, id.data), isNull(companies.archivedAt)))
        .returning({ id: companies.id });
      if (rows.length === 0) return false;

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "company.archive",
        recordType: "company",
        recordId: id.data,
      });
      await notifyLive(tx, await liveAudienceFor(repId, actor.id), {
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

