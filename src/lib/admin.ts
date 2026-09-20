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
import { addMonths, firstOfMonth, todayRiyadh, type Day } from "@/lib/dates";
import { LOOKUP_FIELDS, tableName, type LookupKind, type LookupRow } from "@/lib/lookup-kinds";
import { LIST_LIMIT } from "@/lib/list-size";
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
  /**
   * This person shares a paper's metres even at nought (P14). Support, not
   * sales, is the default: a rep with no target earns no share of anything, and
   * this is the tick beside the box that says otherwise.
   */
  shares: boolean;
};

export type TargetsThisMonth = {
  month: Day;
  company: string | null;
  companyPrevious: string | null;
  people: TargetRow[];
};

/**
 * This month's targets, one row per person who can carry metres.
 *
 * The current Riyadh month and no other (SPEC §3 P13: "Targets are the current
 * month only"). The month used to come from the URL, with Back and Next beside
 * it, so a closed month could be reopened from a link and rewritten — and the
 * figure a rep was measured against in June would quietly be another figure by
 * August. Earlier months are read, never set: `earlierTargets` below.
 *
 * The company figure is beside them and is not their sum: the admin sets it on
 * its own, and neither derives from the other (S44).
 */
export async function targetsThisMonth(today: Day = todayRiyadh()): Promise<TargetsThisMonth> {
  const locale = await getLocale();
  const month = firstOfMonth(today);
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
      .select({
        userId: targets.userId,
        month: targets.month,
        sqm: targets.sqm,
        shares: targets.shares,
      })
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
  const sharesNow = new Set(
    rows.filter((row) => row.month === month && row.shares).map((row) => row.userId),
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
      shares: sharesNow.has(person.id),
    })),
  };
}

/** How many earlier months the targets screen lists; past it, a line says so (D80). */
export const EARLIER_MONTHS_SHOWN = 12;

export type EarlierMonth = {
  month: Day;
  /** The company's figure that month, or null where none was set (S44). */
  company: string | null;
  /** numeric(12,2) as text by user id; somebody absent had no target that month. */
  people: Record<string, string>;
};

export type EarlierTargets = {
  /**
   * Everybody with a target in any month shown, named in the reader's script
   * (D68) — somebody who has since left or stopped carrying metres included,
   * because the figure he was measured against is still what it was.
   */
  people: { userId: string; name: string }[];
  /** Newest first. */
  months: EarlierMonth[];
  /** Every earlier month with any target, however many are shown. */
  total: number;
};

/**
 * The months before this one that carry any target, to be read and never set
 * (SPEC §3 P13: "history read-only elsewhere").
 *
 * A month is listed when the company or anybody had a figure for it, not merely
 * because it went by: a month nobody set is not history. The cap and the true
 * total come out of one statement — the window counts before the LIMIT cuts —
 * so the line under the table cannot disagree with the table (D80,
 * rules/data.md).
 *
 * A column is a person with a target in at least one of the months shown, not
 * everybody who carries metres today: a column of nothing but dashes for
 * somebody who never had a figure is a column to read past (D44's reason).
 */
export async function earlierTargets(today: Day = todayRiyadh()): Promise<EarlierTargets> {
  const locale = await getLocale();
  const current = firstOfMonth(today);

  const listed = await db.execute<{ month: Day; total: number }>(sql`
    with set_months as (
      select targets.month from targets where targets.month < ${current}::date
      union
      select company_targets.month from company_targets
       where company_targets.month < ${current}::date
    )
    select to_char(set_months.month, 'YYYY-MM-DD') as month,
           count(*) over ()::int as total
      from set_months
     order by set_months.month desc
     limit ${EARLIER_MONTHS_SHOWN}::int
  `);

  const months = listed.rows.map((row) => row.month);
  if (months.length === 0) return { people: [], months: [], total: 0 };

  const [rows, companyRows] = await Promise.all([
    db
      .select({
        userId: targets.userId,
        name: personName(locale),
        month: targets.month,
        sqm: targets.sqm,
      })
      .from(targets)
      .innerJoin(users, eq(users.id, targets.userId))
      .where(inArray(targets.month, months))
      // The columns' order is the boxes' order above them: by name, as read.
      .orderBy(asc(personName(locale)), asc(users.id)),
    db
      .select({ month: companyTargets.month, sqm: companyTargets.sqm })
      .from(companyTargets)
      .where(inArray(companyTargets.month, months)),
  ]);

  const people = new Map<string, string>();
  for (const row of rows) if (!people.has(row.userId)) people.set(row.userId, row.name);
  const company = new Map(companyRows.map((row) => [row.month, String(row.sqm)]));

  return {
    people: [...people].map(([userId, name]) => ({ userId, name })),
    months: months.map((month) => ({
      month,
      company: company.get(month) ?? null,
      people: Object.fromEntries(
        rows.filter((row) => row.month === month).map((row) => [row.userId, String(row.sqm)]),
      ),
    })),
    total: Number(listed.rows[0]?.total ?? 0),
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

  // Only one list has the column, and the panel is one component: asked as a
  // constant for the others rather than as a second query or a second shape.
  const restricted = kind === "leadSources" ? sql`restricted` : sql`false`;
  const rows = await db.execute<Record<string, string | boolean | number>>(
    sql`select id, ${sql.raw(columns)}, active, ${restricted} as restricted
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
      restricted: Boolean(row.restricted),
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

/**
 * How many rows one group of the archive draws (D80): a share of what a list
 * screen draws, so the three groups together are never heavier than one list.
 * The search is how the rest are found, and the tail line says so.
 */
const ARCHIVE_KIND_LIMIT = Math.floor(LIST_LIMIT / ARCHIVE_KINDS.length);

export type ArchivedRow = {
  id: string;
  kind: ArchiveKind;
  name: string;
  /** The company it is on; for a company, itself. */
  companyId: string;
  companyName: string;
  /** Whose it was: the company's rep, or the contact's or the project's own (D147). */
  repName: string;
  /** A contact's position as typed, and its number as stored (E.164); null for the rest. */
  position: string | null;
  phone: string | null;
  /** A project's own estimate; null for the rest. */
  expectedSqm: string | null;
  archivedOn: Day;
  /**
   * Who took it off the floor, from the audit line the archive wrote (D87) — or,
   * for a record folded into another, the manager who ruled the pair one
   * customer (P12-8). Null where no line says: a contact archived by a fold, or a
   * row older than its audit trail.
   */
  archivedById: string | null;
  archivedByName: string | null;
  /** Why, in the archiver's words — a company carries one (D87); the rest none. */
  reason: string | null;
  /** Its company is archived too, so it cannot come back before the company does (D92). */
  companyArchived: boolean;
  /**
   * The record this one turned out to be, when the manager ruled two records
   * one customer (P12-8). Null for everything else, which is every other row.
   *
   * It is the one archived thing that never comes back: its people, its jobs
   * and its papers are on the survivor, and putting an empty name back on a
   * floor beside the customer it IS would be the duplicate all over again.
   */
  mergedIntoName: string | null;
  /** How many archived things of this kind match, counted before the cap (D80). */
  inKind: number;
};

/** `%` and `_` are ILIKE wildcards; somebody typing them means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => "\\" + match);
}

/**
 * Everything taken off the floor, newest first (D24, S16) — the archive's one
 * read, built for the job the screen is for (P13-S7): somebody archived the
 * wrong thing, and the admin has to find it, be sure it is the one, and put it
 * back.
 *
 * So it is searched by name — the thing's own or its company's, because "the
 * contact at Anmaa" is how the request arrives — and it answers the three things
 * he checks before pressing Restore: what it was and on which company, who took
 * it off and when, and why. The who is the audit line the archive wrote (D87);
 * the company's reason is its own column, which lives exactly as long as the
 * archive does.
 *
 * Narrowed, counted AND capped per kind, in SQL. One cap across the three
 * groups, newest first, let two hundred newer companies push every archived
 * contact off the screen — the Contacts group vanished and the total under it
 * left them out. So each group keeps its own first `perKind` rows by its own
 * newest-first place, and its count is a window over every match of that kind,
 * so "Contacts 3" is three whatever the companies did (rules/data.md, D80).
 * Plain SQL because every table here is aliased by hand, and a Drizzle column in
 * a template with no join renders bare (rules/data.md).
 */
export async function listArchived(input: {
  q?: string;
  locale: string;
  /** Rows drawn per group; the count on each is every match of its kind. */
  perKind?: number;
}): Promise<ArchivedRow[]> {
  const { locale } = input;
  const term = (input.q ?? "").trim();
  const anywhere = `%${escapeLike(term)}%`;
  const matches = term
    ? sql`where (archived.name ilike ${anywhere} or archived.company_name ilike ${anywhere})`
    : sql``;

  const result = await db.execute<{
    id: string;
    kind: ArchiveKind;
    name: string;
    company_id: string;
    company_name: string;
    rep_name: string;
    position: string | null;
    phone: string | null;
    expected_sqm: string | null;
    archived_on: string;
    archived_by_id: string | null;
    archived_by_name: string | null;
    reason: string | null;
    company_archived: boolean;
    merged_into_name: string | null;
    in_kind: number;
  }>(sql`
    select placed.*
      from (
    select archived.*,
           who.id::text as archived_by_id,
           ${personNameOf("who", locale)} as archived_by_name,
           to_char((archived.archived_at at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as archived_on,
           (count(*) over (partition by archived.kind))::int as in_kind,
           row_number() over (
             partition by archived.kind
             order by archived.archived_at desc, archived.name, archived.id
           ) as place
      from (
        select c.id::text as id, 'company' as kind, c.name as name,
               c.id::text as company_id, c.name as company_name,
               ${personNameOf("owner", locale)} as rep_name,
               null::text as position, null::text as phone, null::text as expected_sqm,
               c.archived_at,
               coalesce(
                 (select a.user_id from audit_log a
                   where a.record_type = 'company' and a.record_id = c.id::text
                     and a.action = 'company.archive'
                   order by a.at desc limit 1),
                 (select f.ruled_by from duplicate_flags f
                   where c.merged_into_id is not null
                     and f.survivor_id = c.merged_into_id
                     and c.id in (f.company_id, f.other_id)
                   order by f.ruled_at desc nulls last limit 1)
               ) as archived_by,
               c.archive_reason as reason,
               false as company_archived,
               (select m.name from companies m where m.id = c.merged_into_id) as merged_into_name
          from companies c
          join users owner on owner.id = c.rep_id
         where c.archived_at is not null
        union all
        select ct.id::text, 'contact', ct.name,
               cc.id::text, cc.name,
               ${personNameOf("owner", locale)},
               ct.position, ct.phone_normalized, null::text,
               ct.archived_at,
               (select a.user_id from audit_log a
                 where a.record_type = 'contact' and a.record_id = ct.id::text
                   and a.action = 'contact.archive'
                 order by a.at desc limit 1),
               null::text,
               (cc.archived_at is not null),
               null::text
          from contacts ct
          join companies cc on cc.id = ct.company_id
          join users owner on owner.id = ct.rep_id
         where ct.archived_at is not null
        union all
        select pj.id::text, 'project', pj.name,
               pc.id::text, pc.name,
               ${personNameOf("owner", locale)},
               null::text, null::text, pj.expected_sqm::text,
               pj.archived_at,
               (select a.user_id from audit_log a
                 where a.record_type = 'project' and a.record_id = pj.id::text
                   and a.action = 'project.archive'
                 order by a.at desc limit 1),
               null::text,
               (pc.archived_at is not null),
               null::text
          from projects pj
          join companies pc on pc.id = pj.company_id
          join users owner on owner.id = pj.rep_id
         where pj.archived_at is not null
      ) archived
      left join users who on who.id = archived.archived_by
      ${matches}
      ) placed
     where placed.place <= ${input.perKind ?? ARCHIVE_KIND_LIMIT}::int
     order by placed.archived_at desc, placed.name, placed.id
  `);

  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    companyId: row.company_id,
    companyName: row.company_name,
    repName: row.rep_name,
    position: row.position,
    phone: row.phone,
    expectedSqm: row.expected_sqm,
    archivedOn: row.archived_on,
    archivedById: row.archived_by_id,
    archivedByName: row.archived_by_id ? row.archived_by_name : null,
    reason: row.reason,
    companyArchived: row.company_archived,
    mergedIntoName: row.merged_into_name,
    inKind: Number(row.in_kind ?? 0),
  }));
}
