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

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import {
  type AuditRecordType,
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
import { ARCHIVE_KINDS, LONGEST_PERIOD_DAYS } from "@/lib/admin";
import { holdsFloor } from "@/lib/floor";
import { isLookupKind, LOOKUP_FIELDS, tableName } from "@/lib/lookup-kinds";
import { mayActOnUser, NotAllowed, OFFICE_ROLES, refusalKey, requireActor } from "@/lib/authz";
import { field, fieldErrorsOf } from "@/lib/form-fields";
import { addDays, diffDays, firstOfMonth, todayRiyadh, type Day } from "@/lib/dates";
import type { ActionResult, Role, SessionUser } from "@/lib/types";
import { safeError } from "@/lib/log-safe";

/** bcrypt cost. The same one the seed uses, so a reset and a seed match. */
const BCRYPT_ROUNDS = 10;

async function guarded<T>(
  roles: Role[],
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const t = await getTranslations("common");
  try {
    return await run(await requireActor(...roles));
  } catch (error) {
    if (error instanceof NotAllowed) return { ok: false, error: t(refusalKey(error)) };
    console.error("admin action failed", safeError(error));
    return { ok: false, error: t("somethingWrong") };
  }
}

/** Targets, lookups and the archive: the admin's alone (SPEC §3). */
async function guard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return guarded(["admin"], run);
}

/**
 * Users, and holidays and leave: the admin's, and the sales manager's (SPEC §3,
 * P14). The roles come from `OFFICE_ROLES`, which is `runsTheOffice` filtered
 * over `ROLES` — the same sentence the pages are gated by, not a second list.
 *
 * Getting through this door is not the whole answer for an account: WHOSE
 * account it is decides too, and that is `mayActOnUser`, asked inside each of
 * the four below on the row as it stands in the database.
 */
async function officeGuard<T>(
  run: (actor: SessionUser) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return guarded(OFFICE_ROLES, run);
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
  recordType: AuditRecordType,
  recordId: string,
  details: Record<string, unknown>,
): Promise<void> {
  await tx.insert(auditLog).values({ userId: actorId, action, recordType, recordId, details });
}

// ---- users -------------------------------------------------------------------

const roleSchema = z.enum(["rep", "marketing", "coordinator", "manager", "admin"]);

/**
 * The account about to be changed, held until this transaction commits, with
 * the role it has NOW rather than the one the form thought it had.
 *
 * `FOR UPDATE` and not a plain read (rules/data.md, D85): the manager may act
 * on a rep and not on a manager, so a promotion committing between the check
 * and the write would let the second half of it through on the strength of the
 * first half's answer.
 */
async function heldUser(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  id: string,
): Promise<{ role: Role } | null> {
  const [row] = await tx
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .for("update")
    .limit(1);
  return row ? { role: row.role as Role } : null;
}

/** What a refused write on somebody else's account comes back saying (P14, §4). */
type UserOutcome = "ok" | "gone" | "refused";

async function answerFor(outcome: Exclude<UserOutcome, "ok">): Promise<ActionResult<undefined>> {
  const ta = await getTranslations("admin");
  return { ok: false, error: outcome === "gone" ? ta("notFound") : ta("accountIsAdmins") };
}

/** Long enough to be worth having; nothing else, because a rule nobody can meet
 *  is a rule everybody writes on a sticky note. */
const passwordSchema = z.string().min(8).max(200);

/** Nobody self-registers; the admin creates the account (S7). */
export async function createUserAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return officeGuard(async (actor) => {
    const tc = await getTranslations("common");
    const ta = await getTranslations("admin");

    const parsed = z
      .object({
        name: z.string().trim().min(1).max(200),
        // `.optional()`: `field()` reads "" as not filled in, and an account
        // with no Arabic name is the normal case, not a refused form (D68).
        nameAr: z.string().trim().max(200).optional(),
        email: z.email().max(200),
        role: roleSchema,
        password: passwordSchema,
      })
      .safeParse({
        name: field(formData, "name"),
        nameAr: field(formData, "nameAr"),
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

    // A sales manager adds a rep, marketing or the coordinator; an admin or a
    // second manager is the admin's to create (P14, §4). The picker offers him
    // only the three, and this is the same sentence behind it — the form is
    // four fields and a hand-made POST is four fields too.
    if (!mayActOnUser(actor.role, parsed.data.role)) {
      return { ok: false, error: ta("roleIsAdmins"), fieldErrors: { role: ta("roleIsAdmins") } };
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
          nameAr: parsed.data.nameAr || null,
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
  return officeGuard(async (actor) => {
    const tc = await getTranslations("common");
    const ta = await getTranslations("admin");

    const parsed = z
      .object({
        userId: z.uuid(),
        name: z.string().trim().min(1).max(200),
        // `.optional()`: `field()` reads "" as not filled in, and an account
        // with no Arabic name is the normal case, not a refused form (D68).
        nameAr: z.string().trim().max(200).optional(),
        email: z.email().max(200),
        role: roleSchema,
      })
      .safeParse({
        userId: field(formData, "userId"),
        name: field(formData, "name"),
        nameAr: field(formData, "nameAr"),
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

    // The role he is handing out, before anything is read (P14, §4). Where the
    // account itself is out of his reach the answer comes from the held row
    // below, because the form's word for whose account this is proves nothing.
    if (!mayActOnUser(actor.role, parsed.data.role)) {
      return { ok: false, error: ta("roleIsAdmins"), fieldErrors: { role: ta("roleIsAdmins") } };
    }

    const [clash] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);
    if (clash && clash.id !== parsed.data.userId) {
      return { ok: false, error: ta("emailTaken"), fieldErrors: { email: ta("emailTaken") } };
    }

    // A role that holds no floor cannot go to somebody who still has one (D91):
    // the companies would stay on him with nobody able to work them, and the
    // old `mayWrite` let him work them from a role with no floor at all.
    if (!holdsFloor(parsed.data.role)) {
      const [held] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(companies)
        .where(and(eq(companies.repId, parsed.data.userId), isNull(companies.archivedAt)));
      if (held && held.count > 0) {
        const sentence = ta("roleHoldsCompanies", { count: held.count });
        return { ok: false, error: sentence, fieldErrors: { role: sentence } };
      }
    }

    const outcome = await db.transaction(async (tx): Promise<UserOutcome> => {
      const held = await heldUser(tx, parsed.data.userId);
      if (!held) return "gone";
      if (!mayActOnUser(actor.role, held.role)) return "refused";

      const rows = await tx
        .update(users)
        .set({
          name: parsed.data.name,
          nameAr: parsed.data.nameAr || null,
          email: parsed.data.email,
          role: parsed.data.role,
        })
        .where(eq(users.id, parsed.data.userId))
        .returning({ id: users.id });
      // An audit row for a change that did not happen is a lie in the log (D87):
      // the row is written only when the database handed one back.
      if (rows.length === 0) return "gone";
      await record(tx, actor.id, "user.update", "user", parsed.data.userId, {
        email: parsed.data.email,
        role: parsed.data.role,
      });
      return "ok";
    });
    if (outcome !== "ok") return answerFor(outcome);

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
  return officeGuard(async (actor) => {
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

    const outcome = await db.transaction(async (tx): Promise<UserOutcome> => {
      const held = await heldUser(tx, parsed.data.userId);
      if (!held) return "gone";
      // A rep's password is the manager's to reset; an admin's or another
      // manager's is not (P14, §4) — otherwise the line above it would be a
      // line anybody could walk round in one press.
      if (!mayActOnUser(actor.role, held.role)) return "refused";

      const rows = await tx
        .update(users)
        .set({ passwordHash })
        .where(eq(users.id, parsed.data.userId))
        .returning({ id: users.id });
      if (rows.length === 0) return "gone";
      await tx.delete(sessions).where(eq(sessions.userId, parsed.data.userId));
      // The password itself is never in the log, only that it changed (S55).
      await record(tx, actor.id, "user.resetPassword", "user", parsed.data.userId, {});
      return "ok";
    });
    if (outcome !== "ok") return answerFor(outcome);

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
  return officeGuard(async (actor) => {
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

    const outcome = await db.transaction(async (tx): Promise<UserOutcome> => {
      const held = await heldUser(tx, parsed.data.userId);
      if (!held) return "gone";
      if (!mayActOnUser(actor.role, held.role)) return "refused";

      const rows = await tx
        .update(users)
        .set({ active })
        .where(eq(users.id, parsed.data.userId))
        .returning({ id: users.id });
      if (rows.length === 0) return "gone";
      if (!active) await tx.delete(sessions).where(eq(sessions.userId, parsed.data.userId));
      await record(tx, actor.id, active ? "user.activate" : "user.deactivate", "user", parsed.data.userId, {});
      return "ok";
    });
    if (outcome !== "ok") return answerFor(outcome);

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
 * One person's target for this month, or the company's (S43, S44).
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
      .object({
        month: monthSchema,
        userId: z.uuid().optional(),
        sqm: sqmSchema,
        // The tick beside the box (P14): this person shares the work even at
        // nought. Only a person has one; the company's target is nobody's.
        shares: z.enum(["true", "false"]).default("false"),
      })
      .safeParse({
        month: field(formData, "month"),
        userId: field(formData, "userId"),
        sqm: field(formData, "sqm") ?? "",
        shares: field(formData, "shares") ?? "false",
      });
    if (!parsed.success) {
      return {
        ok: false,
        error: tc("notANumber"),
        fieldErrors: { sqm: tc("notANumber") },
      };
    }

    const { month, userId, sqm } = parsed.data;
    const shares = parsed.data.shares === "true";

    // This month and only this month (SPEC §3 P13). The screen offers no other,
    // and this is what holds when a month turns over under an open tab, or a
    // bookmarked link or a hand-made form names a month that has closed: the
    // figure somebody was measured against stays the figure it was.
    if (month !== firstOfMonth(todayRiyadh())) {
      const ta = await getTranslations("admin");
      return { ok: false, error: ta("targetMonthClosed") };
    }

    const value = sqm === "" ? null : Number(sqm).toFixed(2);

    await db.transaction(async (tx) => {
      if (userId) {
        /*
         * A blank box is no target, and no target is no row — unless the tick
         * beside it says this person shares anyway (P14). The tick has to live
         * somewhere, and the row is where a month's answer lives, so ticking it
         * on an empty box writes a target of nought: which is exactly the case
         * the founder is describing, "a rep whose target is zero", made
         * deliberate instead of absent.
         */
        if (value === null && !shares) {
          await tx
            .delete(targets)
            .where(and(eq(targets.userId, userId), eq(targets.month, month)));
        } else {
          const sqmValue = value ?? "0.00";
          await tx
            .insert(targets)
            .values({ userId, month, sqm: sqmValue, shares })
            .onConflictDoUpdate({
              target: [targets.userId, targets.month],
              set: { sqm: sqmValue, shares },
            });
        }
        await record(tx, actor.id, "target.set", "user", userId, { month, sqm: value, shares });
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
    const ta = await getTranslations("admin");

    const kind = field(formData, "kind");
    if (!isLookupKind(kind)) return { ok: false, error: tc("invalid") };

    const parsed = z
      .object({ id: z.coerce.number().int().positive(), active: z.enum(["true", "false"]) })
      .safeParse({ id: field(formData, "id"), active: field(formData, "active") });
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    const table = tableName(kind);
    const active = parsed.data.active === "true";

    const changed = await db.transaction(async (tx) => {
      const result = await tx.execute(
        sql`update ${sql.raw(table)} set active = ${active} where id = ${parsed.data.id} returning id`,
      );
      if (result.rows.length === 0) return false;
      await record(tx, actor.id, "lookup.setActive", kind, String(parsed.data.id), { active });
      return true;
    });
    if (!changed) return { ok: false, error: ta("notFound") };

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
/**
 * Longer than any leave a person takes; a typo in the last day is refused, not
 * written. One number, in `src/lib/admin.ts`, because the screen reads back
 * that far to draw a period whole and the two have to agree.
 */
const MAX_SPAN_DAYS = LONGEST_PERIOD_DAYS;

export async function addNonWorkingAction(
  _prev: ActionResult<{ added: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ added: number }>> {
  return officeGuard(async (actor) => {
    const tc = await getTranslations("common");

    const dayShape = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const parsed = z
      .object({
        day: dayShape,
        // The last day of the span; the same day when the form left it alone
        // (D113). Eid is four days and a rep's leave is a fortnight, and one
        // dialog per day was how leave stopped being entered at all.
        until: dayShape.optional(),
        userId: z.uuid().optional(),
        note: z.string().trim().max(200).optional(),
      })
      .refine((value) => !value.until || value.until >= value.day, { path: ["until"] })
      .refine((value) => !value.until || diffDays(value.day, value.until) < MAX_SPAN_DAYS, {
        path: ["until"],
      })
      .safeParse({
        day: field(formData, "day"),
        until: field(formData, "until"),
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

    const { day, userId, note } = parsed.data;
    const until = parsed.data.until ?? day;
    const span: Day[] = [];
    for (let d = day; d <= until; d = addDays(d, 1)) span.push(d);

    const added = await db.transaction(async (tx) => {
      // A day already on this person's calendar (or everyone's) is not written
      // twice: pace would count it once anyway, and the list would show two.
      const already = await tx
        .select({ day: nonWorkingDays.day })
        .from(nonWorkingDays)
        .where(
          and(
            inArray(nonWorkingDays.day, span),
            userId ? eq(nonWorkingDays.userId, userId) : isNull(nonWorkingDays.userId),
          ),
        );
      const taken = new Set(already.map((row) => row.day));
      const fresh = span.filter((d) => !taken.has(d));
      if (fresh.length === 0) return 0;
      const rows = await tx
        .insert(nonWorkingDays)
        .values(
          fresh.map((d) => ({
            day: d,
            kind: userId ? ("leave" as const) : ("holiday" as const),
            userId: userId ?? null,
            note: note ?? null,
          })),
        )
        .returning({ id: nonWorkingDays.id, day: nonWorkingDays.day });
      // One trail row per day written: the record is the day (D104), and a
      // span is however many of them there were.
      for (const row of rows) {
        await record(tx, actor.id, "nonWorking.add", "nonWorkingDay", String(row.id), {
          day: row.day,
          userId: userId ?? null,
          span: fresh.length > 1 ? { from: day, until } : undefined,
        });
      }
      return rows.length;
    });

    revalidateAdmin();
    return { ok: true, data: { added } };
  });
}

/**
 * Takes days back off the calendar — one, or a whole period at once (P14).
 *
 * The one delete in this file, and it is right: a holiday entered on the wrong
 * date is not history, it is a typo, and leaving it would quietly shorten
 * somebody's month for ever.
 *
 * One action for both, because it is one act: the screen now reads a stretch of
 * days as an entry, so Remove on the entry removes the stretch and Remove on a
 * day inside it removes the day. A second action would be a second answer to
 * "what does removing mean". The trail keeps one row per DAY either way, since
 * the record is the day (D104) and a span is however many of them there were —
 * the same shape the add writes.
 */
export async function removeNonWorkingAction(
  _prev: ActionResult<undefined> | null,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return officeGuard(async (actor) => {
    const tc = await getTranslations("common");
    const ta = await getTranslations("admin");

    // A period is at most `MAX_SPAN_DAYS` long, because that is the longest one
    // that can be written; a list longer than that did not come from a screen.
    const parsed = z
      .array(z.coerce.number().int().positive())
      .min(1)
      .max(MAX_SPAN_DAYS)
      .safeParse((field(formData, "ids") ?? "").split(",").filter(Boolean));
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    const removed = await db.transaction(async (tx) => {
      const rows = await tx
        .delete(nonWorkingDays)
        .where(inArray(nonWorkingDays.id, parsed.data))
        .returning({ id: nonWorkingDays.id, day: nonWorkingDays.day });
      for (const row of rows) {
        await record(tx, actor.id, "nonWorking.remove", "nonWorkingDay", String(row.id), {
          day: row.day,
        });
      }
      return rows.length;
    });
    if (removed === 0) return { ok: false, error: ta("notFound") };

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
    const ta = await getTranslations("admin");

    const parsed = z
      .object({ kind: z.enum(ARCHIVE_KINDS), id: z.uuid() })
      .safeParse({ kind: field(formData, "kind"), id: field(formData, "id") });
    if (!parsed.success) return { ok: false, error: tc("invalid") };

    const { kind, id } = parsed.data;

    // A child comes back onto its company and never drags the company back
    // with it (D92). A company archived on purpose used to stay archived only
    // until somebody restored a stray contact under it — then it was on the
    // floor again with nobody having decided that. If the company is archived,
    // the company is what to restore, and the screen says so instead of
    // offering a button (archive-panel.tsx); this is the same answer behind it.
    const outcome = await db.transaction(async (tx) => {
      if (kind === "company") {
        // The reason lives as long as the state it explains (D87, and the note
        // on return_reason in the schema): back on the floor, it is gone.
        //
        // A tombstone is refused (P12-8). It is archived, so it is on this
        // screen, and it is the one archived company that cannot come back: its
        // people, its jobs and its papers are on the record that continues, and
        // restoring it would put an empty name on a floor next to the customer
        // it IS. `companies_merged_check` would refuse the row anyway; refusing
        // it here is what turns a constraint violation into a sentence.
        const rows = await tx
          .update(companies)
          .set({ archivedAt: null, archiveReason: null })
          .where(and(eq(companies.id, id), isNull(companies.mergedIntoId)))
          .returning({ id: companies.id });
        if (rows.length === 0) {
          const [exists] = await tx
            .select({ mergedIntoId: companies.mergedIntoId })
            .from(companies)
            .where(eq(companies.id, id))
            .limit(1);
          return exists?.mergedIntoId ? ("merged" as const) : ("gone" as const);
        }
      } else if (kind === "contact") {
        const [child] = await tx
          .select({ companyArchivedAt: companies.archivedAt })
          .from(contacts)
          .innerJoin(companies, eq(companies.id, contacts.companyId))
          .where(eq(contacts.id, id))
          .limit(1);
        if (!child) return "gone" as const;
        if (child.companyArchivedAt !== null) return "companyArchived" as const;
        await tx.update(contacts).set({ archivedAt: null }).where(eq(contacts.id, id));
      } else {
        const [child] = await tx
          .select({ companyArchivedAt: companies.archivedAt })
          .from(projects)
          .innerJoin(companies, eq(companies.id, projects.companyId))
          .where(eq(projects.id, id))
          .limit(1);
        if (!child) return "gone" as const;
        if (child.companyArchivedAt !== null) return "companyArchived" as const;
        await tx.update(projects).set({ archivedAt: null }).where(eq(projects.id, id));
      }
      // Only for a row that came back (D87).
      await record(tx, actor.id, "restore", kind, id, {});
      return "ok" as const;
    });
    if (outcome === "gone") return { ok: false, error: ta("notFound") };
    if (outcome === "merged") return { ok: false, error: ta("restoreMerged") };
    if (outcome === "companyArchived") {
      // One sentence per kind: Arabic gives the row a gender, English does not.
      return {
        ok: false,
        error:
          kind === "contact" ? ta("restoreCompanyFirstContact") : ta("restoreCompanyFirstProject"),
      };
    }

    revalidateAdmin();
    return { ok: true, data: undefined };
  });
}
