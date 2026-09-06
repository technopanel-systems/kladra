/**
 * What the admin's screens read (SPEC §3: users, targets, lookups, holidays,
 * export — and D24's restore).
 *
 * Everything here is the admin's alone. The authorization is checked in the
 * actions and in the pages, not here, for the same reason as everywhere else:
 * one layer, in application code (rules/data.md).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { personName, personNameOf } from "@/lib/people";
import {
  companyTargets,
  nonWorkingDays,
  targets,
  users,
} from "@/db/schema";
import { addMonths, type Day } from "@/lib/dates";
import { LOOKUP_FIELDS, tableName, type LookupKind, type LookupRow } from "@/lib/lookup-kinds";
import { CARRIES_METRES } from "@/lib/team";
import type { Role } from "@/lib/types";

export * from "@/lib/lookup-kinds";

// ---- users -------------------------------------------------------------------

export type AdminUser = {
  id: string;
  name: string;
  /** The Arabic name, where this account has one (D68). Empty is no name. */
  nameAr: string | null;
  email: string;
  role: Role;
  active: boolean;
  /** How many companies are on this person's floor — what deactivating strands. */
  companies: number;
};

/**
 * Everybody, active first, then by name.
 *
 * Inactive accounts stay on the list rather than disappearing: nothing is ever
 * deleted, so history always points at a real person (S7), and an admin
 * reactivating somebody has to be able to find them.
 */
export async function listUsers(): Promise<AdminUser[]> {
  // The one list that keeps both names raw rather than resolving one: this is
  // the screen where they are edited, and the form needs the pair (D68).
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      nameAr: users.nameAr,
      email: users.email,
      role: users.role,
      active: users.active,
      companies: sql<number>`(
        select count(*)::int from companies
         where companies.rep_id = users.id and companies.archived_at is null
      )`,
    })
    .from(users)
    .orderBy(desc(users.active), asc(users.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameAr: row.nameAr,
    email: row.email,
    role: row.role as Role,
    active: row.active,
    companies: Number(row.companies ?? 0),
  }));
}

// ---- targets -----------------------------------------------------------------

export type TargetRow = {
  userId: string;
  name: string;
  role: Role;
  /** numeric(12,2) as text, or null where none is set (S45). */
  sqm: string | null;
  /** The month before's figure, so an empty box says what it was and one press keeps it (D115). */
  previous: string | null;
};

export type TargetsForMonth = {
  month: Day;
  company: string | null;
  companyPrevious: string | null;
  people: TargetRow[];
};

/**
 * The month's targets, one row per person who can carry metres.
 *
 * The company figure is beside them and is not their sum: the admin sets it on
 * its own, and neither derives from the other (S44).
 */
export async function targetsForMonth(month: Day): Promise<TargetsForMonth> {
  const locale = await getLocale();
  // This month's figures and last month's in the same two reads: a new month
  // opens on empty boxes, and what each was last month is what the admin is
  // about to retype (D115).
  const before = addMonths(month, -1);
  const [people, rows, companyRows] = await Promise.all([
    db
      .select({ id: users.id, name: personName(locale), role: users.role })
      .from(users)
      // The same rule the team screen uses, said once (D44).
      .where(and(eq(users.active, true), CARRIES_METRES))
      .orderBy(asc(personName(locale))),
    db
      .select({ userId: targets.userId, month: targets.month, sqm: targets.sqm })
      .from(targets)
      .where(inArray(targets.month, [month, before])),
    db
      .select({ month: companyTargets.month, sqm: companyTargets.sqm })
      .from(companyTargets)
      .where(inArray(companyTargets.month, [month, before])),
  ]);

  const byUser = new Map(
    rows.filter((row) => row.month === month).map((row) => [row.userId, String(row.sqm)]),
  );
  const byUserBefore = new Map(
    rows.filter((row) => row.month === before).map((row) => [row.userId, String(row.sqm)]),
  );
  const company = companyRows.find((row) => row.month === month);
  const companyBefore = companyRows.find((row) => row.month === before);
  return {
    month,
    company: company ? String(company.sqm) : null,
    companyPrevious: companyBefore ? String(companyBefore.sqm) : null,
    people: people.map((person) => ({
      userId: person.id,
      name: person.name,
      role: person.role as Role,
      sqm: byUser.get(person.id) ?? null,
      previous: byUserBefore.get(person.id) ?? null,
    })),
  };
}

// ---- lookups -----------------------------------------------------------------

/**
 * One list, in the order it is offered: the admin's own order first, then the
 * first field, so a list with no explicit order still reads predictably.
 */
export async function listLookup(kind: LookupKind): Promise<LookupRow[]> {
  const fields = LOOKUP_FIELDS[kind];
  const columns = fields
    .map((f) => `${f.column}::text as ${f.key}`)
    .join(", ");

  const rows = await db.execute<Record<string, string | boolean | number>>(
    sql`select id, ${sql.raw(columns)}, active
          from ${sql.raw(tableName(kind))}
         order by coalesce(sort_order, 0) asc, ${sql.raw(fields[0].column)} asc`,
  );

  return rows.rows.map((row) => {
    const values = fields.map((f) => String(row[f.key] ?? ""));
    return {
      id: Number(row.id),
      values,
      label: values.filter(Boolean).join(" · "),
      active: Boolean(row.active),
    };
  });
}


// ---- holidays and leave ------------------------------------------------------

export type NonWorkingRow = {
  id: number;
  day: Day;
  kind: "holiday" | "leave";
  userId: string | null;
  /** Whose leave it is; null for a company holiday. */
  userName: string | null;
  note: string | null;
};

/**
 * Holidays and leave, soonest first from the start of this month.
 *
 * Both live in one table because both do the same thing to the arithmetic: they
 * are skipped by pace and by reminders (S48). What differs is who they apply
 * to, which is the `user_id`.
 */
export async function listNonWorking(from: Day): Promise<NonWorkingRow[]> {
  const locale = await getLocale();
  const rows = await db
    .select({
      id: nonWorkingDays.id,
      day: nonWorkingDays.day,
      kind: nonWorkingDays.kind,
      userId: nonWorkingDays.userId,
      userName: personName(locale),
      note: nonWorkingDays.note,
    })
    .from(nonWorkingDays)
    .leftJoin(users, eq(users.id, nonWorkingDays.userId))
    .where(sql`${nonWorkingDays.day} >= ${from}::date`)
    .orderBy(asc(nonWorkingDays.day));

  return rows.map((row) => ({
    id: row.id,
    day: row.day,
    kind: row.kind as "holiday" | "leave",
    userId: row.userId ?? null,
    userName: row.userName ?? null,
    note: row.note ?? null,
  }));
}

// ---- the archive (D24) -------------------------------------------------------

/** What the archive screen lists, and the family `admin.kind.*` names (D96). */
export const ARCHIVE_KINDS = ["company", "contact", "project"] as const;
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number];

export type ArchivedRow = {
  id: string;
  kind: ArchiveKind;
  name: string;
  /** The company it belongs to; the same name again for a company. */
  companyName: string;
  repName: string;
  archivedOn: Day;
  /** Why, in the archiver's words — a company carries one (D87); the rest none. */
  reason: string | null;
  /** Its company is archived too, so it cannot come back before the company does (D92). */
  companyArchived: boolean;
};

/**
 * Everything that has been taken off the floor, newest first (D24, S16).
 *
 * Archiving is not deleting: the row stays, its history stays, and it comes
 * back from here. This screen is the "admin restores" half of that promise —
 * without it, archive IS delete with extra steps.
 */
export async function listArchived(): Promise<ArchivedRow[]> {
  const locale = await getLocale();
  const result = await db.execute<{
    id: string;
    kind: ArchiveKind;
    name: string;
    company_name: string;
    rep_name: string;
    archived_on: string;
    reason: string | null;
    company_archived: boolean;
  }>(sql`
    select companies.id::text as id, 'company' as kind, companies.name as name,
           companies.name as company_name, ${personNameOf("u", locale)} as rep_name,
           to_char((companies.archived_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as archived_on,
           companies.archive_reason as reason,
           false as company_archived
      from companies
      join users u on u.id = companies.rep_id
     where companies.archived_at is not null
    union all
    select contacts.id::text as id, 'contact' as kind, contacts.name as name,
           c.name as company_name, ${personNameOf("u", locale)} as rep_name,
           to_char((contacts.archived_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as archived_on,
           null::text as reason,
           (c.archived_at is not null) as company_archived
      from contacts
      join companies c on c.id = contacts.company_id
      join users u on u.id = c.rep_id
     where contacts.archived_at is not null
    union all
    select projects.id::text as id, 'project' as kind, projects.name as name,
           c.name as company_name, ${personNameOf("u", locale)} as rep_name,
           to_char((projects.archived_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as archived_on,
           null::text as reason,
           (c.archived_at is not null) as company_archived
      from projects
      join companies c on c.id = projects.company_id
      join users u on u.id = c.rep_id
     where projects.archived_at is not null
     order by archived_on desc
  `);

  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    companyName: row.company_name,
    repName: row.rep_name,
    archivedOn: row.archived_on,
    reason: row.reason,
    companyArchived: row.company_archived,
  }));
}
