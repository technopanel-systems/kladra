"use server";

/**
 * Contacts — the people at a company (SPEC S11). A contact belongs to ONE
 * company; a person who moves gets a new contact at the new company and the old
 * one stays for history.
 *
 * The phone is mandatory here and nowhere else (SPEC §3), stored normalized to
 * E.164 so +966, 00966, 966 and a leading 0 are one number (S14). The database
 * holds a UNIQUE index on (company_id, phone_normalized); a rep who types a
 * number the company already has gets a sentence under the field, never a 500.
 */

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, contacts } from "@/db/schema";
import { assertCompanyVisible } from "@/lib/activities";
import { NotAllowed, requireActor } from "@/lib/authz";
import { liveAudienceFor } from "@/lib/companies";
import { notifyLive } from "@/lib/live";
import { normalizePhone } from "@/lib/phone";
import type { ActionResult, SessionUser } from "@/lib/types";

type Fields = Record<string, string>;

function field(formData: FormData, name: string): string | undefined {
  const raw = formData.get(name);
  if (typeof raw !== "string") return undefined;
  const value = raw.trim();
  return value === "" ? undefined : value;
}

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

/** Postgres 23505 on the (company_id, phone_normalized) index — a real answer. */
function isDuplicatePhone(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string } | null;
  return e?.code === "23505" && e?.constraint === "contacts_company_phone_idx";
}

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor());
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
    console.error("contacts action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

function revalidateFloor(): void {
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/companies", "page");
  revalidatePath("/[locale]/projects", "page");
}

const contactFields = {
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  position: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
};

const createSchema = z.object({ ...contactFields, companyId: z.uuid() });
const updateSchema = z.object({ ...contactFields, contactId: z.uuid() });

function readForm(formData: FormData) {
  return {
    companyId: field(formData, "companyId"),
    contactId: field(formData, "contactId"),
    name: field(formData, "name"),
    phone: field(formData, "phone"),
    position: field(formData, "position"),
    email: field(formData, "email"),
    notes: field(formData, "notes"),
  };
}

/** Add contact — the dialog on the drawer's Contacts tab. */
export async function createContactAction(
  _prev: ActionResult<{ contactId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ contactId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = createSchema.safeParse(readForm(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }
    const input = parsed.data;

    const repId = await assertCompanyVisible(actor, input.companyId);

    const phoneNormalized = normalizePhone(input.phone);
    if (!phoneNormalized) {
      return { ok: false, error: t("phoneInvalid"), fieldErrors: { phone: t("phoneInvalid") } };
    }
    if (input.email && !z.email().safeParse(input.email).success) {
      return { ok: false, error: t("emailInvalid"), fieldErrors: { email: t("emailInvalid") } };
    }

    // The first contact a company ever gets is its main one (D18).
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.companyId, input.companyId), isNull(contacts.archivedAt)))
      .limit(1);

    try {
      const contactId = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(contacts)
          .values({
            companyId: input.companyId,
            name: input.name,
            phone: input.phone,
            phoneNormalized,
            position: input.position ?? null,
            email: input.email ?? null,
            notes: input.notes ?? null,
            isMain: !existing,
          })
          .returning({ id: contacts.id });

        await tx.insert(auditLog).values({
          userId: actor.id,
          action: "contact.create",
          recordType: "contact",
          recordId: row.id,
          details: { companyId: input.companyId, name: input.name },
        });
        await notifyLive(tx, await liveAudienceFor(repId, actor.id), {
          type: "company",
          id: input.companyId,
        });
        return row.id;
      });

      revalidateFloor();
      return { ok: true, data: { contactId } };
    } catch (error) {
      if (isDuplicatePhone(error)) {
        return { ok: false, error: t("phoneTaken"), fieldErrors: { phone: t("phoneTaken") } };
      }
      throw error;
    }
  });
}

/** Edit contact. The company never changes — a person who moves is a new row (S11). */
export async function updateContactAction(
  _prev: ActionResult<{ contactId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ contactId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = updateSchema.safeParse(readForm(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }
    const input = parsed.data;

    const [row] = await db
      .select({ companyId: contacts.companyId })
      .from(contacts)
      .where(eq(contacts.id, input.contactId))
      .limit(1);
    if (!row) return { ok: false, error: t("contactNotFound") };

    const repId = await assertCompanyVisible(actor, row.companyId);

    const phoneNormalized = normalizePhone(input.phone);
    if (!phoneNormalized) {
      return { ok: false, error: t("phoneInvalid"), fieldErrors: { phone: t("phoneInvalid") } };
    }
    if (input.email && !z.email().safeParse(input.email).success) {
      return { ok: false, error: t("emailInvalid"), fieldErrors: { email: t("emailInvalid") } };
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(contacts)
          .set({
            name: input.name,
            phone: input.phone,
            phoneNormalized,
            position: input.position ?? null,
            email: input.email ?? null,
            notes: input.notes ?? null,
          })
          .where(eq(contacts.id, input.contactId));

        await tx.insert(auditLog).values({
          userId: actor.id,
          action: "contact.update",
          recordType: "contact",
          recordId: input.contactId,
          details: { companyId: row.companyId, name: input.name },
        });
        await notifyLive(tx, await liveAudienceFor(repId, actor.id), {
          type: "company",
          id: row.companyId,
        });
      });

      revalidateFloor();
      return { ok: true, data: { contactId: input.contactId } };
    } catch (error) {
      if (isDuplicatePhone(error)) {
        return { ok: false, error: t("phoneTaken"), fieldErrors: { phone: t("phoneTaken") } };
      }
      throw error;
    }
  });
}

/**
 * Any contact can be made the main one later (D18). Exactly one per company
 * carries the flag, so the demotion and the promotion are one transaction.
 */
export async function setMainContactAction(contactId: unknown): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");
    const id = z.uuid().safeParse(contactId);
    if (!id.success) return { ok: false, error: tc("invalid") };

    const [row] = await db
      .select({ companyId: contacts.companyId, archivedAt: contacts.archivedAt })
      .from(contacts)
      .where(eq(contacts.id, id.data))
      .limit(1);
    if (!row || row.archivedAt) return { ok: false, error: t("contactNotFound") };

    const repId = await assertCompanyVisible(actor, row.companyId);

    await db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({ isMain: false })
        .where(and(eq(contacts.companyId, row.companyId), ne(contacts.id, id.data)));
      await tx.update(contacts).set({ isMain: true }).where(eq(contacts.id, id.data));
      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "contact.setMain",
        recordType: "contact",
        recordId: id.data,
        details: { companyId: row.companyId },
      });
      await notifyLive(tx, await liveAudienceFor(repId, actor.id), {
        type: "company",
        id: row.companyId,
      });
    });

    revalidateFloor();
    return { ok: true };
  });
}
