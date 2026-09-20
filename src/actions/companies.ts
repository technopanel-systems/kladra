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
import { db, type Tx } from "@/db";
import {
  auditLog,
  cities,
  companies,
  companyShares,
  contacts,
  countries,
  leadSources,
  projectShares,
  projects,
  users,
} from "@/db/schema";
import { assertCompanyMine } from "@/lib/activities";
import { moveContacts } from "@/lib/contacts";
import { flagDuplicates } from "@/lib/duplicates";
import { NotAllowed, refusalKey, requireActor } from "@/lib/authz";
import { sameField, sinceTwinWindow } from "@/lib/writes";
import { ADD_COMPANY_ROLES, holdsFloor, LEAD_ROLES, mayHandOver, mayWrite } from "@/lib/floor";
import { parseDay } from "@/lib/dates";
import { field, fieldErrorsOf, type FieldErrors } from "@/lib/form-fields";
import { liveAudienceFor, liveAudienceForCompany, notifyLive } from "@/lib/live";
import { clearNotifications, createNotification } from "@/lib/notify";
import { marketingLeadSource, SAUDI_CODE, seesEveryLeadSource } from "@/lib/lookups";
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
 * The list is `ADD_COMPANY_ROLES` rather than a literal, so who types a customer
 * in is one sentence and every screen asks that same one (P8.9). It stopped
 * being everyone with a floor in P12-7: marketing still HOLDS companies and no
 * longer adds them, because §3 gave it the lead module instead.
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
 * Is this lead source one this person may not claim (SPEC §3, narrowing D1)?
 *
 * The Add company form is not offered the Marketing source unless the person
 * filling it in is management or marketing. That list is the courtesy and this
 * is the rule, asked by the write as well as by the read, because a screen that
 * hides an option and an action that accepts it are the pair that has been
 * wrong in both directions this phase (DESIGN §5). Asked on the EDIT too: a rep
 * who cannot file a company as marketing's must not be able to re-file it that
 * way an hour later.
 */
async function claimsRestrictedSource(
  actor: SessionUser,
  leadSourceId: number,
  held?: number,
): Promise<boolean> {
  if (seesEveryLeadSource(actor.role)) return false;
  // The one the record already carries is not a claim (§5 #168). Marketing
  // files a lead as its own and the manager hands it to a rep, which is the
  // whole path §3 describes — and asked without this, the rep could then never
  // save that company again, not its notes, not its name, not anything, because
  // the form sends back the source it arrived with and the guard read it as him
  // filing somebody else's lead as his own.
  if (held !== undefined && leadSourceId === held) return false;
  const [source] = await db
    .select({ restricted: leadSources.restricted })
    .from(leadSources)
    .where(eq(leadSources.id, leadSourceId))
    .limit(1);
  return Boolean(source?.restricted);
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

    if (await claimsRestrictedSource(actor, input.leadSourceId)) {
      return {
        ok: false,
        error: t("leadSourceNotYours"),
        fieldErrors: { leadSourceId: t("leadSourceNotYours") },
      };
    }

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

      // Nothing here blocks and nothing here asks him anything (S15). The row
      // is written, and then the manager is told that a number on it is a
      // number somebody else already holds (P12-8, D158).
      await flagDuplicates(tx, company.id);

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
  }, ...ADD_COMPANY_ROLES);
}


/*
 * Leads — what marketing brings in (SPEC §3, P12-7).
 *
 * "Marketing does not use the Add company form. Marketing has its own module
 * for bringing in a lead, and creating one there IS an assignment: it goes to a
 * chosen rep, or to a member of the marketing team."
 *
 * A lead IS a company, so the writes live here, beside every other write to
 * that table: one file owns what may be written to `companies`, and a second
 * one would be two doors onto one room with two ideas of what a valid row is.
 * What §3 asks to keep apart is the two PATHS — the screens and the words on
 * their buttons — and those are `/leads` and `/companies`, which share this
 * table and nothing else. `src/lib/leads.ts` says why there is no second table.
 */

/**
 * The lead form, as §3 P13 states it: the company, a contact with a phone,
 * where it came from, the customer's query as the single note, and who takes
 * it. No notes on the company and none on the contact — "no other note fields"
 * — so the schema has nowhere to put one, and a notes field posted anyway is
 * never read.
 */
/**
 * No `leadSourceId` (P14, 14D). A lead marketing files came from marketing, so
 * the source is not a field on this form and not a value the wire may carry
 * — the action reads the one row it can be. What a form does not ask, an
 * action does not accept: a posted source would be the hidden field that
 * decides where the business came from.
 */
const leadSchema = z.object({
  name: companyFields.name,
  categoryId: companyFields.categoryId,
  countryId: companyFields.countryId,
  cityId: companyFields.cityId,
  cityText: companyFields.cityText,
  /** Whose floor it lands on. The whole point of the form. */
  repId: z.uuid(),
  /** What the customer asked for, in the finder's own words — the one note. */
  query: z.string().trim().min(1).max(4000),
  contactName: z.string().trim().min(1).max(200),
  contactPhone: z.string().trim().min(1).max(40),
});

/**
 * File a lead, which is to give it to somebody.
 *
 * One transaction: the company on his floor, its first contact, the audit row
 * and the bell that tells him. A lead on nobody's floor and a company with no
 * one to ring are both states this must be unable to produce — the second for
 * the same reason `createCompanyAction` cannot produce it (§3: the phone is on
 * the contact and mandatory there).
 *
 * A lead somebody files onto his own floor is stamped acknowledged as it is
 * written. There is nobody to tell and nothing to wait for, and a row sitting
 * for ever in the "not picked up" band because its finder is its holder is the
 * figure that is always wrong (rules/data.md).
 */
export async function createLeadAction(
  _prev: ActionResult<{ companyId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ companyId: string }>> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const parsed = leadSchema.safeParse({
      name: field(formData, "name"),
      categoryId: field(formData, "categoryId"),
      countryId: field(formData, "countryId"),
      cityId: field(formData, "cityId"),
      cityText: field(formData, "cityText"),
      repId: field(formData, "repId"),
      query: field(formData, "query"),
      contactName: field(formData, "contactName"),
      contactPhone: field(formData, "contactPhone"),
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }
    const input = parsed.data;

    /*
     * Where it came from, decided rather than asked (P14, 14D).
     *
     * The form used to offer the whole list to this role and the action used to
     * refuse the ones it may not claim. Both are gone: marketing is the one
     * bringing the lead in, so the answer is marketing's own source, and the
     * screen states it.
     *
     * Refused out loud where that row is missing — deactivated, or a database
     * nobody seeded. Filing the lead under some other source would put
     * marketing's work in somebody else's column on the one figure this field
     * exists for.
     */
    const marketing = await marketingLeadSource();
    if (!marketing) return { ok: false, error: t("noMarketingSource") };
    const leadSourceId = marketing.id;

    // Onto a floor that exists and can hold a company. Asked of the database
    // rather than trusted from the picker, because the picker is the courtesy
    // and this is the rule (DESIGN §5) — and because an account deactivated
    // between the dialog opening and Save would otherwise take a customer out
    // of sight the second he arrived.
    const [holder] = await db
      .select({ role: users.role, active: users.active })
      .from(users)
      .where(eq(users.id, input.repId))
      .limit(1);
    if (!holder || !holder.active || !holdsFloor(holder.role)) {
      const sentence = t("leadNeedsAFloor");
      return { ok: false, error: sentence, fieldErrors: { repId: sentence } };
    }

    const place = await resolvePlace(input.countryId, input.cityId, input.cityText, t);
    if (!place.ok) return { ok: false, error: tc("invalid"), fieldErrors: place.fieldErrors };

    const phoneNormalized = normalizePhone(input.contactPhone, place.country);
    if (!phoneNormalized) {
      const sentence = t(isSaudi(place.country) ? "phoneInvalid" : "phoneInvalidAbroad");
      return { ok: false, error: sentence, fieldErrors: { contactPhone: sentence } };
    }

    // Pressed twice is one lead (D134), the same rule Add company follows and
    // for the same reason: the wire can lose the answer after the row has
    // landed, and the second press carries the same words seconds later. The
    // whole form has to match, including who it was given to and what was
    // asked, because a second press is as likely to carry a correction — the
    // wrong rep picked, a digit fixed in the phone — as the same words again.
    const [twin] = await db
      .select({
        id: companies.id,
        categoryId: companies.categoryId,
        leadSourceId: companies.leadSourceId,
        countryId: companies.countryId,
        cityId: companies.cityId,
        cityText: companies.cityText,
        repId: companies.repId,
        query: companies.leadQuery,
      })
      .from(companies)
      .where(
        and(
          eq(companies.leadFromId, actor.id),
          eq(companies.name, input.name),
          isNull(companies.archivedAt),
          gte(companies.createdAt, sinceTwinWindow()),
        ),
      )
      .limit(1);
    if (
      twin &&
      sameField(input.repId, twin.repId) &&
      sameField(input.query, twin.query) &&
      sameField(input.categoryId, twin.categoryId) &&
      sameField(leadSourceId, twin.leadSourceId) &&
      sameField(input.countryId, twin.countryId) &&
      sameField(place.cityId, twin.cityId) &&
      sameField(place.cityText, twin.cityText)
    ) {
      const [contact] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.companyId, twin.id),
            eq(contacts.name, input.contactName),
            eq(contacts.phoneNormalized, phoneNormalized),
          ),
        )
        .limit(1);
      if (contact) return { ok: true, data: { companyId: twin.id } };
    }

    const mine = input.repId === actor.id;
    const companyId = await db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companies)
        .values({
          name: input.name,
          categoryId: input.categoryId,
          leadSourceId,
          countryId: input.countryId,
          cityId: place.cityId,
          cityText: place.cityText,
          // The query is the note (§3 P13); the company's own notes start empty
          // and are the holder's to write.
          notes: null,
          repId: input.repId,
          leadFromId: actor.id,
          leadQuery: input.query,
          leadAcknowledgedAt: mine ? new Date() : null,
        })
        .returning({ id: companies.id });

      // The contact is the receiver's, not the finder's: a contact belongs to
      // the rep working it since P12 (D147), and a lead whose only phone number
      // sits on somebody else's row is a customer the man holding him cannot
      // ring.
      await tx.insert(contacts).values({
        companyId: company.id,
        repId: input.repId,
        name: input.contactName,
        phone: input.contactPhone,
        phoneNormalized,
        // A name and a number (§3 P13: "a contact with a phone"); the rep who
        // rings him adds the rest.
        position: null,
        email: null,
        notes: null,
        isMain: true,
      });

      // A lead is a company, so it meets the detector exactly as one (P12-8).
      // Marketing takes a call and types the number the customer gave; that
      // number is very often already on somebody's floor, which is the whole
      // reason the manager needs to be told about it.
      await flagDuplicates(tx, company.id);

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "lead.create",
        recordType: "company",
        recordId: company.id,
        details: { name: input.name, to: input.repId },
      });

      if (!mine) {
        await createNotification(tx, {
          userId: input.repId,
          kind: "leadAssigned",
          params: { repId: actor.id },
          link: `/companies?open=${company.id}`,
          subject: { type: "company", id: company.id },
        });
      }

      await notifyLive(tx, await liveAudienceFor(input.repId, actor.id), {
        type: "company",
        id: company.id,
      });
      return company.id;
    });

    revalidateFloor();
    revalidatePath("/[locale]/leads", "page");
    return { ok: true, data: { companyId } };
  }, ...LEAD_ROLES);
}

/**
 * "I have him" — the person the lead was given to says so.
 *
 * Its own act rather than a side effect of opening the drawer: what marketing
 * needs to know is that somebody has taken the call, and a row cleared by a
 * stray click answers nobody. Only the person holding it, because it is his
 * answer to give; and pressed twice it is still the first press, because the
 * second would move the day he picked it up.
 *
 * The row is held before anything is decided (rules/data.md: a write holds its
 * row before it decides). Asked of an unlocked read, "is it his?" could be true
 * of a lead the manager was moving to Saad in the same instant, and the press
 * would then stamp Saad's lead, take the notice off Saad's bell and tell
 * marketing that Faisal had it. Held, the press waits for the move and reads
 * the holder the move wrote — and two tabs pressed at once read the stamp the
 * first one wrote, so marketing's bell rings once.
 */
export async function acknowledgeLeadAction(companyId: unknown): Promise<ActionResult> {
  return guard(async (actor) => {
    const t = await getTranslations("errors");
    const tc = await getTranslations("common");

    const id = z.uuid().safeParse(companyId);
    if (!id.success) return { ok: false, error: tc("invalid") };

    const outcome = await db.transaction(async (tx) => {
      const [lead] = await tx
        .select({
          repId: companies.repId,
          fromId: companies.leadFromId,
          acknowledgedAt: companies.leadAcknowledgedAt,
        })
        .from(companies)
        .where(and(eq(companies.id, id.data), isNull(companies.archivedAt)))
        .for("update");
      if (!lead || !lead.fromId) return "gone" as const;
      // Thrown inside the transaction, which has written nothing yet: `guard`
      // turns it into the refusal every other action gives.
      if (!mayWrite(actor, lead.repId)) throw new NotAllowed();
      // Answered already — by him, in the other tab, a moment ago. Not an error:
      // what he asked for is the case.
      if (lead.acknowledgedAt) return "answered" as const;

      const fromId = lead.fromId;
      await tx
        .update(companies)
        .set({ leadAcknowledgedAt: new Date() })
        .where(eq(companies.id, id.data));

      await tx.insert(auditLog).values({
        userId: actor.id,
        action: "lead.acknowledge",
        recordType: "company",
        recordId: id.data,
        details: { from: fromId },
      });

      // The notice was the work, and the work is done (D79).
      await clearNotifications(tx, { type: "company", id: id.data }, ["leadAssigned"]);

      // Not to himself, on a lead he filed onto his own floor — which cannot
      // reach here anyway, being stamped at birth, and is written as a rule
      // rather than left to that accident.
      if (fromId !== actor.id) {
        await createNotification(tx, {
          userId: fromId,
          kind: "leadAcknowledged",
          params: { repId: actor.id },
          link: `/leads`,
          subject: { type: "company", id: id.data },
        });
      }

      await notifyLive(tx, await liveAudienceForCompany(id.data, actor.id), {
        type: "company",
        id: id.data,
      });
      return "acknowledged" as const;
    });

    if (outcome === "gone") return { ok: false, error: t("companyNotFound") };
    if (outcome === "acknowledged") {
      revalidateFloor();
      revalidatePath("/[locale]/leads", "page");
    }
    return { ok: true };
  });
}

/**
 * Give a lead to somebody else — the manager's assign and reassign (SPEC §3
 * P13: "The manager's leads view assigns and reassigns").
 *
 * A lead is a company (D157), so this is a hand-over: the same permission
 * (`mayHandOver`, the sales manager and the admin behind him, D156), the same
 * picker of people a company can sit with, and the same move the drawer's Hand
 * over makes (`handCompanyTo`). Whether that move is a lead arriving or a
 * customer changing hands is decided there, under the row's lock, from what the
 * row says at that instant — so the two doors onto it cannot do two things.
 *
 * What this door adds is that it moves leads only: a company nobody filed as a
 * lead is not on the leads view, and an id that names one is answered as not
 * found rather than handed over from a screen that never showed it.
 */
export async function reassignLeadAction(
  companyId: unknown,
  toUserId: unknown,
): Promise<ActionResult> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const t = await getTranslations("errors");

    const id = z.uuid().safeParse(companyId);
    if (!id.success) return { ok: false, error: tc("invalid") };
    if (!mayHandOver(actor)) throw new NotAllowed();
    // "You have not said who" is the refusal a person actually hits: the confirm
    // is live before the picker is touched (DESIGN §5). Said at the picker.
    const to = z.uuid().safeParse(toUserId);
    const target = to.success ? await floorHolder(to.data) : null;
    if (!target) {
      const sentence = t("leadNeedsAFloor");
      return { ok: false, error: sentence, fieldErrors: { to: sentence } };
    }

    const outcome = await handCompanyTo(actor, id.data, target, { leadsOnly: true });
    if (outcome === "gone") return { ok: false, error: t("companyNotFound") };
    if (outcome === "same") {
      const sentence = t("handOverSame");
      return { ok: false, error: sentence, fieldErrors: { to: sentence } };
    }
    return { ok: true };
  });
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
    const [held] = await db
      .select({ leadSourceId: companies.leadSourceId })
      .from(companies)
      .where(eq(companies.id, input.companyId))
      .limit(1);
    if (await claimsRestrictedSource(actor, input.leadSourceId, held?.leadSourceId)) {
      return {
        ok: false,
        error: t("leadSourceNotYours"),
        fieldErrors: { leadSourceId: t("leadSourceNotYours") },
      };
    }
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
 * Put a customer, and what was the old holder's under him, on another floor.
 *
 * One definition for the two acts that move a customer between people: the
 * manager's hand-over from the drawer, and his reassignment of a lead from the
 * leads view (SPEC §3 P13). A lead IS a company (D157), so moving one is moving
 * a company, and two copies of these statements would be two ideas of what
 * travels with a customer.
 */
async function moveCustomer(tx: Tx, companyId: string, from: string, to: string): Promise<void> {
  await tx.update(companies).set({ repId: to }).where(eq(companies.id, companyId));

  // What was his under this customer goes with it. D51 said the whole floor
  // travels because everything was read through `companies.rep_id`; since
  // P12 a project and a contact say whose they are (D147), so moving the
  // company alone would leave the man who left still holding the jobs and
  // the new owner unable to touch them. Only HIS rows move: on a shared
  // company a third rep's project stays his, because a handover is not a
  // way to take somebody else's work.
  const moved = await tx
    .update(projects)
    .set({ repId: to })
    .where(and(eq(projects.companyId, companyId), eq(projects.repId, from)))
    .returning({ id: projects.id });

  // A contact belongs to a rep since P12, so the man receiving the company
  // may already hold his OWN row for the same person on it — which is the
  // case sharing exists for, and not a duplicate (D147). Moving the
  // departing rep's row onto him would break two unique indexes at once:
  // one number per rep per company, and one main contact per rep per
  // company. It reached the manager as "something went wrong" and the
  // hand-over quietly did not happen (#159).
  //
  // The rule is D153's and it is written once, in `moveContacts`: a fold
  // (P12-8) lands rows on somebody's list the same way and would otherwise
  // have needed the same forty lines a second time.
  await moveContacts(tx, { companyId, repId: from }, { companyId, repId: to });

  // And he is not left sharing what he now owns — the company, and every
  // job under it that has just become his.
  await tx
    .delete(companyShares)
    .where(and(eq(companyShares.companyId, companyId), eq(companyShares.userId, to)));
  if (moved.length > 0) {
    await tx.delete(projectShares).where(
      and(
        inArray(
          projectShares.projectId,
          moved.map((row) => row.id),
        ),
        eq(projectShares.userId, to),
      ),
    );
  }
}

/**
 * Somebody a company can be put with: an active account whose role holds a
 * floor. Asked of the database rather than trusted from the picker, which is
 * the courtesy (DESIGN §5). A deactivated account would take the company back
 * out of sight the moment it landed there, and the admin has no floor at all.
 */
async function floorHolder(userId: string): Promise<{ id: string } | null> {
  const [person] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.active, true)))
    .limit(1);
  return person && holdsFloor(person.role) ? { id: person.id } : null;
}

/**
 * Put a company on another floor — the one move behind both doors onto it: the
 * drawer's Hand over and the leads view's Reassign (SPEC §3 P13, D181).
 *
 * The row is held first and everything after reads what the row says NOW
 * (rules/data.md: a write holds its row before it decides). Two managers
 * pressing at once would otherwise each read the old holder and each "move" the
 * customer from him; and a lead acknowledged a moment before the manager's press
 * would be moved as a lead still waiting, taking the stamp off a customer his
 * rep had already rung.
 *
 * Which act it is, is that row's to say:
 *
 * - **A lead nobody has acknowledged** is a lead arriving (D181). It is his to
 *   acknowledge: it lands in his band highlighted, his two working days start
 *   from this move (`lead.reassign`, which `GIVEN_AT` reads), his bell rings
 *   with the lead notice — work, cleared by his Acknowledge (D79) — and the old
 *   holder's notice goes, because the work it named is no longer his. Given back
 *   to the person who filed it, it is acknowledged at once, the rule filing
 *   follows (D157): a row waiting for her to confirm her own lead is the figure
 *   that is always wrong.
 * - **Anything else — a lead somebody has acknowledged included** — is a customer
 *   changing hands (`company.handOver`). "Once acknowledged, the lead is a normal
 *   company owned by the rep, keeping its origin" (§3 P13): the day somebody
 *   said "I have him" stays on it, it does not go back into anybody's band or
 *   onto the stuck list, and the new holder is told as any hand-over tells him.
 *
 * What travels is the customer and the work under him (`moveCustomer`). The
 * quotations, the dispatches and the achieved metres do NOT travel — they are
 * read by who raised them (D86) — and neither does the log, because an activity
 * records who did it and rewriting that would be rewriting the report (S27).
 * Both floors are told live, and so is whoever filed a lead, whose screen names
 * who has it; the audit row carries both names, for the six-months-later
 * question (S55).
 */
async function handCompanyTo(
  actor: SessionUser,
  companyId: string,
  target: { id: string },
  { leadsOnly }: { leadsOnly: boolean },
): Promise<"gone" | "same" | "moved"> {
  const outcome = await db.transaction(async (tx) => {
    // Archived is not there: a company off the floor has no floor to move to,
    // and restoring it is the admin's own action (S16).
    const [company] = await tx
      .select({
        name: companies.name,
        repId: companies.repId,
        fromId: companies.leadFromId,
        acknowledgedAt: companies.leadAcknowledgedAt,
      })
      .from(companies)
      .where(and(eq(companies.id, companyId), isNull(companies.archivedAt)))
      .for("update");
    if (!company || (leadsOnly && !company.fromId)) return "gone" as const;
    if (company.repId === target.id) return "same" as const;

    const from = company.repId;
    const arriving = company.fromId !== null && company.acknowledgedAt === null;
    const hers = arriving && target.id === company.fromId;
    await moveCustomer(tx, companyId, from, target.id);
    if (hers) {
      await tx
        .update(companies)
        .set({ leadAcknowledgedAt: new Date() })
        .where(eq(companies.id, companyId));
    }

    await tx.insert(auditLog).values({
      userId: actor.id,
      action: arriving ? "lead.reassign" : "company.handOver",
      recordType: "company",
      recordId: companyId,
      details: { name: company.name, from, to: target.id },
    });

    // The old holder's notice named work that is no longer his.
    if (arriving) {
      await clearNotifications(tx, { type: "company", id: companyId }, ["leadAssigned"]);
    }

    // Not to himself: a manager who hands a company to himself knows he did.
    if (target.id !== actor.id) {
      await createNotification(
        tx,
        arriving && !hers
          ? {
              userId: target.id,
              kind: "leadAssigned",
              params: { repId: actor.id },
              link: `/companies?open=${companyId}`,
              subject: { type: "company", id: companyId },
            }
          : {
              // A customer, or a lead back with the person who found it:
              // nothing to acknowledge, so the notice is the news of it,
              // cleared by reading.
              userId: target.id,
              kind: "companyHandedOver",
              params: { label: company.name, repId: actor.id },
              link: `/companies?open=${companyId}`,
              subject: { type: "company", id: companyId },
            },
      );
    }

    // Both floors changed, so both are told, and so is everybody who reads the
    // team screen — and the person who filed a lead, whose list says who has it.
    const audience = new Set([
      ...(await liveAudienceForCompany(companyId, actor.id)),
      from,
      target.id,
      ...(company.fromId ? [company.fromId] : []),
    ]);
    await notifyLive(tx, [...audience], { type: "company", id: companyId });
    return "moved" as const;
  });

  if (outcome === "moved") {
    revalidateFloor();
    revalidatePath("/[locale]/leads", "page");
    revalidatePath("/[locale]/team", "page");
  }
  return outcome;
}

/**
 * Hand this company to somebody else (P8.9).
 *
 * The manager's answer to whose customer this is (SPEC §3, which overrules
 * D51). It is also how a floor survives a person — before this, deactivating an
 * account took its companies out of sight for good, because every list is
 * scoped by `companies.rep_id`.
 *
 * The move itself is `handCompanyTo`, which the leads view's Reassign makes too:
 * a lead nobody has picked up goes to the new holder as a lead, and everything
 * else — an acknowledged lead included — moves as a customer.
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
    // Not `assertCompanyMine`: the manager writes nothing on a floor and still
    // decides whose floor it is (D42, `mayHandOver`).
    if (!mayHandOver(actor)) throw new NotAllowed();
    const to = z.uuid().safeParse(toUserId);
    const target = to.success ? await floorHolder(to.data) : null;
    if (!target) return { ok: false, error: t("handOverWho") };

    const outcome = await handCompanyTo(actor, id.data, target, { leadsOnly: false });
    if (outcome === "gone") return { ok: false, error: t("companyNotFound") };
    if (outcome === "same") return { ok: false, error: t("handOverSame") };
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

