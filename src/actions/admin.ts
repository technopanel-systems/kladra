"use server";

/**
 * Everything the admin changes (SPEC §3: users, targets, lookups, holidays, and
 * D24's restore).
 *
 * Two rules run through all of it. Nothing is deleted — an account is
 * deactivated so history keeps pointing at a real person (S7), and a lookup row
 * is deactivated so the companies already on it still read correctly. And every
 * one of these is audit-logged with who, what and which record (S55), because
 * an admin acting on somebody else's behalf is exactly the case where "who
 * changed this" gets asked six months later.
 *
 * Passwords are set here and never read back. The admin can give somebody a new
 * one; nobody, admin included, can see the old one.
 */

import { and, eq, sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLog,
  companies,
  companyTargets,
  contacts,
  nonWorkingDays,
  projects,
  sessions,
  targets,
  users,
} from "@/db/schema";
import { isLookupKind, LOOKUP_FIELDS, tableName } from "@/lib/lookup-kinds";
import { NotAllowed, requireActor } from "@/lib/authz";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { firstOfMonth, type Day } from "@/lib/dates";
import type { ActionResult, SessionUser } from "@/lib/types";

/** bcrypt cost. The same one the seed uses, so a reset and a seed match. */
const BCRYPT_ROUNDS = 10;

async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor("admin"));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t("notAllowed") };
    console.error("admin action failed", error);
    return { ok: false, error: t("somethingWrong") };
  }
}

function revalidateAdmin(): void {
  revalidatePath("/[locale]/admin/users", "page");
  revalidatePath("/[locale]/admin/targets", "page");
  revalidatePath("/[locale]/admin/lookups", "page");
  revalidatePath("/[locale]/admin/holidays", "page");
  revalidatePath("/[locale]/admin/archive", "page");
  revalidatePath("/[locale]/team", "page");
  revalidatePath("/[locale]/companies", "page");
}

async function record(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorId: string,
  action: string,
  recordType: string,
  recordId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await tx.insert(auditLog).values({ userId: actorId, action, recordType, recordId, details });
}

// ---- users -------------------------------------------------------------------

const roleSchema = z.enum(["rep", "marketing", "coordinator", "manager", "admin"]);

/** Long enough to be worth having; nothing else, because a rule nobody can meet
 *  is a rule everybody writes on a sticky note. */
const passwordSchema = z.string().min(8).max(200);

/** Nobody self-registers; the admin creates the account (S7). */
export async function createUserAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const ta = await getTranslations("admin");

    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.email().max(200),
        role: roleSchema,
        password: passwordSchema,
      })
      .safeParse({
        name: field(formData, "name"),
        email: field(formData, "email")?.toLowerCase(),
        role: field(formData, "role"),
        password: field(formData, "password"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (existing) {
      return { ok: false, error: ta("emailTaken"), fieldErrors: { email: ta("emailTaken") } };
    }

    const passwordHash = await hash(parsed.data.password, BCRYPT_ROUNDS);

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          name: parsed.data.name,
          email: parsed.data.email,
          role: parsed.data.role,
          passwordHash,
        })
        .returning({ id: users.id });
      await record(tx, actor.id, "user.create", "user", row.id, {
        email: parsed.data.email,
        role: parsed.data.role,
      });
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

/** Name, email and role. Never the password — that is its own action. */
export async function updateUserAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const ta = await getTranslations("admin");

    const parsed = z
      .object({
        userId: z.uuid(),
        name: z.string().trim().min(1).max(200),
        email: z.email().max(200),
        role: roleSchema,
      })
      .safeParse({
        userId: field(formData, "userId"),
        name: field(formData, "name"),
        email: field(formData, "email")?.toLowerCase(),
        role: field(formData, "role"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("invalid"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("invalid")),
      };
    }

    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (clash && clash.id !== parsed.data.userId) {
      return { ok: false, error: ta("emailTaken"), fieldErrors: { email: ta("emailTaken") } };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ name: parsed.data.name, email: parsed.data.email, role: parsed.data.role })
        .where(eq(users.id, parsed.data.userId));
      await record(tx, actor.id, "user.update", "user", parsed.data.userId, {
        email: parsed.data.email,
        role: parsed.data.role,
      });
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

/**
 * A new password for anybody (§3).
 *
 * Every session that person has open is dropped in the same transaction. A
 * password reset that leaves the old sessions signed in is not a reset — and a
 * session here is a database row, so removing it is the whole of it.
 */
export async function resetPasswordAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const ta = await getTranslations("admin");

    const parsed = z
      .object({ userId: z.uuid(), password: passwordSchema })
      .safeParse({
        userId: field(formData, "userId"),
        password: field(formData, "password"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: ta("passwordTooShort"),
        fieldErrors: { password: ta("passwordTooShort") },
      };
    }

    const passwordHash = await hash(parsed.data.password, BCRYPT_ROUNDS);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, parsed.data.userId));
      await tx.delete(sessions).where(eq(sessions.userId, parsed.data.userId));
      // The password itself is never in the log, only that it changed (S55).
      await record(tx, actor.id, "user.resetPassword", "user", parsed.data.userId, {});
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

/**
 * Deactivate or reactivate. Never delete (S7).
 *
 * A deactivated account cannot sign in and its sessions go, but every company,
 * quotation and log entry still names it. The admin cannot deactivate himself:
 * an app with nobody who can administer it is a support call, not a decision.
 */
export async function setUserActiveAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");
    const ta = await getTranslations("admin");

    const parsed = z
      .object({ userId: z.uuid(), active: z.enum(["true", "false"]) })
      .safeParse({ userId: field(formData, "userId"), active: field(formData, "active") });
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    const active = parsed.data.active === "true";
    if (!active && parsed.data.userId === actor.id) {
      return { ok: false, error: ta("cannotDeactivateSelf") };
    }

    await db.transaction(async (tx) => {
      await tx.update(users).set({ active }).where(eq(users.id, parsed.data.userId));
      if (!active) await tx.delete(sessions).where(eq(sessions.userId, parsed.data.userId));
      await record(tx, actor.id, active ? "user.activate" : "user.deactivate", "user", parsed.data.userId, {});
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

// ---- targets -----------------------------------------------------------------

const monthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((value) => firstOfMonth(value as Day));

/** Blank clears the target; a number sets it. Zero is a target, not a blank. */
const sqmSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), "invalid");

/**
 * One person's target for one month, or the company's (S43, S44).
 *
 * `userId` absent means the company figure. They are separate rows in separate
 * tables on purpose: neither derives from the other, and adding the reps' up
 * would quietly make the company target a consequence of who happens to have
 * one this month.
 */
export async function setTargetAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");

    const parsed = z
      .object({ month: monthSchema, userId: z.uuid().optional(), sqm: sqmSchema })
      .safeParse({
        month: field(formData, "month"),
        userId: field(formData, "userId"),
        sqm: field(formData, "sqm") ?? "",
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("notANumber"),
        fieldErrors: { sqm: tc("notANumber") },
      };
    }

    const { month, userId, sqm } = parsed.data;
    const value = sqm === "" ? null : Number(sqm).toFixed(2);

    await db.transaction(async (tx) => {
      if (userId) {
        if (value === null) {
          await tx
            .delete(targets)
            .where(and(eq(targets.userId, userId), eq(targets.month, month)));
        } else {
          await tx
            .insert(targets)
            .values({ userId, month, sqm: value })
            .onConflictDoUpdate({
              target: [targets.userId, targets.month],
              set: { sqm: value },
            });
        }
        await record(tx, actor.id, "target.set", "user", userId, { month, sqm: value });
        return;
      }

      if (value === null) {
        await tx.delete(companyTargets).where(eq(companyTargets.month, month));
      } else {
        await tx
          .insert(companyTargets)
          .values({ month, sqm: value })
          .onConflictDoUpdate({ target: companyTargets.month, set: { sqm: value } });
      }
      await record(tx, actor.id, "target.setCompany", "companyTarget", month, {
        month,
        sqm: value,
      });
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

// ---- lookups -----------------------------------------------------------------

/**
 * Add a row to one of the editable lists, or rename one.
 *
 * `kind` is checked against a fixed set and every column comes from
 * `LOOKUP_FIELDS`, never from what arrived — the only strings interpolated into
 * SQL here are ones this app chose (rules/data.md).
 *
 * The boxes differ by list because the lists do: a supplier has a code and a
 * full name (D3), a shipment method has a code and both languages, a fire
 * rating is one word, a thickness is a number.
 */
export async function saveLookupAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");

    const kind = field(formData, "kind");
    if (!isLookupKind(kind)) return { ok: false, error: tc("invalid") };

    const id = field(formData, "id");
    const parsedId = id ? z.coerce.number().int().positive().safeParse(id) : null;
    if (parsedId && !parsedId.success) return { ok: false, error: tc("invalid") };

    const fields = LOOKUP_FIELDS[kind];
    const values: string[] = [];
    const fieldErrors: Record<string, string> = {};

    for (const spec of fields) {
      const raw = (field(formData, `f_${spec.key}`) ?? "").trim();
      if (raw === "") {
        fieldErrors[`f_${spec.key}`] = tc("required");
        continue;
      }
      if (spec.numeric && !Number.isFinite(Number(raw))) {
        fieldErrors[`f_${spec.key}`] = tc("notANumber");
        continue;
      }
      if (raw.length > 200) {
        fieldErrors[`f_${spec.key}`] = tc("invalid");
        continue;
      }
      values.push(raw);
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, error: tc("required"), fieldErrors };
    }

    const table = tableName(kind);
    const columns = fields.map((f) => f.column);

    await db.transaction(async (tx) => {
      if (parsedId?.success) {
        const assignments = sql.join(
          columns.map((column, index) => sql`${sql.raw(column)} = ${values[index]}`),
          sql`, `,
        );
        await tx.execute(
          sql`update ${sql.raw(table)} set ${assignments} where id = ${parsedId.data}`,
        );
      } else {
        await tx.execute(
          sql`insert into ${sql.raw(table)} (${sql.raw(columns.join(", "))})
              values (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`,
        );
      }
      await record(
        tx,
        actor.id,
        parsedId?.success ? "lookup.update" : "lookup.create",
        kind,
        String(parsedId?.data ?? ""),
        { values },
      );
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

/** Takes a list row out of use, or puts it back. Never a delete (D24's rule). */
export async function setLookupActiveAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");

    const kind = field(formData, "kind");
    if (!isLookupKind(kind)) return { ok: false, error: tc("invalid") };

    const parsed = z
      .object({ id: z.coerce.number().int().positive(), active: z.enum(["true", "false"]) })
      .safeParse({ id: field(formData, "id"), active: field(formData, "active") });
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    const table = tableName(kind);
    const active = parsed.data.active === "true";

    await db.transaction(async (tx) => {
      await tx.execute(
        sql`update ${sql.raw(table)} set active = ${active} where id = ${parsed.data.id}`,
      );
      await record(tx, actor.id, "lookup.setActive", kind, String(parsed.data.id), { active });
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

// ---- holidays and leave ------------------------------------------------------

/**
 * A company holiday, or one person's leave (S48).
 *
 * Both are skipped by pace and by reminders, so both live in the same table and
 * the only difference is whether a user is named. A rep back from two weeks off
 * must not be told he is behind.
 */
export async function addNonWorkingAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");

    const parsed = z
      .object({
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        userId: z.uuid().optional(),
        note: z.string().trim().max(200).optional(),
      })
      .safeParse({
        day: field(formData, "day"),
        userId: field(formData, "userId"),
        note: field(formData, "note"),
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("notADate"),
        fieldErrors: fieldErrorsOf(parsed.error, tc("required"), tc("notADate")),
      };
    }

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(nonWorkingDays)
        .values({
          day: parsed.data.day,
          kind: parsed.data.userId ? "leave" : "holiday",
          userId: parsed.data.userId ?? null,
          note: parsed.data.note ?? null,
        })
        .returning({ id: nonWorkingDays.id });
      await record(tx, actor.id, "nonWorking.add", "nonWorkingDay", String(row.id), {
        day: parsed.data.day,
        userId: parsed.data.userId ?? null,
      });
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

/**
 * Takes a day back off the calendar.
 *
 * The one delete in this file, and it is right: a holiday entered on the wrong
 * date is not history, it is a typo, and leaving it would quietly shorten
 * somebody's month for ever.
 */
export async function removeNonWorkingAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");

    const parsed = z.coerce.number().int().positive().safeParse(field(formData, "id"));
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    await db.transaction(async (tx) => {
      await tx.delete(nonWorkingDays).where(eq(nonWorkingDays.id, parsed.data));
      await record(tx, actor.id, "nonWorking.remove", "nonWorkingDay", String(parsed.data), {});
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}

// ---- restore (D24) -----------------------------------------------------------

/**
 * Puts an archived company, contact or project back on the floor (D24, S16).
 *
 * This is the half of "archive, never delete" that makes the promise true.
 * Restoring a contact or a project whose company is still archived puts it back
 * on a row that appears on no list, so the company comes back with it.
 */
export async function restoreAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return guard(async (actor) => {
    const tc = await getTranslations("common");

    const parsed = z
      .object({ kind: z.enum(["company", "contact", "project"]), id: z.uuid() })
      .safeParse({ kind: field(formData, "kind"), id: field(formData, "id") });
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    const { kind, id } = parsed.data;

    await db.transaction(async (tx) => {
      if (kind === "company") {
        await tx.update(companies).set({ archivedAt: null }).where(eq(companies.id, id));
      } else if (kind === "contact") {
        const [row] = await tx
          .update(contacts)
          .set({ archivedAt: null })
          .where(eq(contacts.id, id))
          .returning({ companyId: contacts.companyId });
        if (row) {
          await tx
            .update(companies)
            .set({ archivedAt: null })
            .where(eq(companies.id, row.companyId));
        }
      } else {
        const [row] = await tx
          .update(projects)
          .set({ archivedAt: null })
          .where(eq(projects.id, id))
          .returning({ companyId: projects.companyId });
        if (row) {
          await tx
            .update(companies)
            .set({ archivedAt: null })
            .where(eq(companies.id, row.companyId));
        }
      }
      await record(tx, actor.id, "restore", kind, id, {});
    });

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}
