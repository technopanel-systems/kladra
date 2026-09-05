/**
 * Companies — the rep's home list and the drawer behind a row.
 *
 * The list is the rep floor's front door, so everything it shows is resolved in
 * ONE statement, in SQL, before any ordering: the main contact, the last
 * activity, the next follow-up and its state. Filtering a fetched page is the
 * failure mode that returned silently empty screens in FACET (rules/data.md).
 *
 * Every correlated subquery below names BOTH tables outright — `ct.company_id =
 * companies.id`, never a bare Drizzle column on each side. Drizzle drops a
 * column's qualifier when the outer query joins nothing; `where company_id =
 * id` then resolves inside the inner table, is never true, returns zero rows
 * and raises nothing. That bug shipped three times in FACET.
 *
 * `nextFollowUp` on a ROW is the earliest thing waiting on that customer —
 * the company's own date or the soonest of its open projects' (SPEC D9, "the
 * home strip counts both"). That is what makes the strip, the filter and the
 * row's colour agree: click "2 overdue" and you get the two companies those
 * two dates belong to. The drawer's picker edits the company's OWN date, which
 * `getCompany` returns separately.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import {
  cities,
  companies,
  companyCategories,
  contacts,
  countries,
  leadSources,
  projects,
  users,
} from "@/db/schema";
import { assertCompanyVisible, mayOpen } from "@/lib/activities";
import { NotAllowed, seesAll } from "@/lib/authz";
import type { Day } from "@/lib/dates";
import {
  type FollowUpFilter,
  type FollowUpState,
  followUpFilterSql,
  effectiveFollowUpSql,
  followUpStateSql,
  goneQuietCompanySql,
  neverContactedCompanySql,
} from "@/lib/followups";
import { personName } from "@/lib/people";
import { normalizePhone, storedE164, type E164 } from "@/lib/phone";
import { companyStanding, type CompanyStanding } from "@/lib/standing";
import type { SessionUser } from "@/lib/types";

/** The company drawer's Activity tab. One implementation, in src/lib/activities.ts. */
export { listActivitiesForCompany as listCompanyActivities } from "@/lib/activities";
export type { ActivityRow } from "@/lib/activities";

// ---- the list ---------------------------------------------------------------

export type CompanyRow = {
  id: string;
  name: string;
  cityName: string | null;
  mainContactName: string | null;
  mainContactPhone: E164 | null;
  lastActivityOn: Day | null;
  /** The soonest date waiting on this customer — its own or an open project's. */
  nextFollowUp: Day | null;
  followUpState: FollowUpState | null;
};

export type ListCompaniesInput = {
  user: SessionUser;
  q?: string;
  filter?: FollowUpFilter;
  /**
   * One rep's floor, for the manager's drill-down (S8). Ignored for a rep,
   * whose own scope is narrower already — `ownedBy` still applies underneath,
   * so passing somebody else's id changes nothing for him.
   */
  repId?: string;
  /** Defaults to the reader's saved language; scripts and tests pass one. */
  locale?: string;
};

/** `%` and `_` are ILIKE wildcards; a rep typing them means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => "\\" + match);
}

/**
 * What to look for in `contacts.phone_normalized`. A whole number in any
 * accepted shape (05x, +966, 00966, 966) normalizes to E.164 and matches
 * exactly; a partial one falls back to its digits without the local trunk zero,
 * matched anywhere inside the stored number (SPEC S14).
 */
function phoneNeedle(term: string): string | null {
  const normalized = normalizePhone(term);
  if (normalized) return normalized;
  const digits = term.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.replace(/^0+/, "");
}

/**
 * WHICH contact is the main one — the ONE definition of it (SPEC D18): the one
 * marked, or the oldest still on file when nobody is.
 *
 * The fallback is not decoration. Archiving a contact clears the flag with it,
 * so a company whose main contact has left has nobody marked at all, and a
 * reader that trusted the raw column would show the list a main contact and the
 * drawer none. That is exactly the drift rules/data.md forbids, and it shipped
 * here until an acceptance test archived the marked one.
 *
 * `companyId` is passed as SQL because the two readers name it differently: the
 * list correlates against `companies.id`, the drawer against a bound parameter.
 */
export function mainContactIdSql(companyId: SQL): SQL<string | null> {
  return sql`(
    select ct.id
      from contacts ct
     where ct.company_id = ${companyId}
       and ct.archived_at is null
     order by ct.is_main desc, ct.created_at asc
     limit 1
  )`;
}

/** That contact's name or number, for the list (D18). */
function mainContact(column: "name" | "phone_normalized"): SQL<string | null> {
  return sql`(
    select ct.${sql.raw(column)}
      from contacts ct
     where ct.id = ${mainContactIdSql(sql`companies.id`)}
  )`;
}

/** The most recent day anything was logged against this company. */
function lastActivitySql(): SQL<Day | null> {
  return sql`(
    select max(a.happened_on)
      from activities a
     where a.company_id = companies.id
       and a.archived_at is null
  )`;
}


/** A rep sees only his own; manager and admin see all (S8, authz.seesAll). */
function ownedBy(user: SessionUser): SQL | undefined {
  return seesAll(user) ? undefined : eq(companies.repId, user.id);
}

/**
 * The rep's home list. Newest activity first, companies never touched at the
 * bottom, ties broken by name so the order never wobbles between renders.
 *
 * `q` matches the company name, or a contact's number when it looks like a
 * phone — the strongest sign two records are the same company (S14).
 */
export async function listCompanies(input: ListCompaniesInput): Promise<CompanyRow[]> {
  const { user, filter } = input;
  const locale = input.locale ?? user.locale;
  const term = (input.q ?? "").trim();

  const cityLabel = locale.startsWith("ar") ? cities.nameAr : cities.nameEn;
  const lastActivity = lastActivitySql();
  const effective = effectiveFollowUpSql();

  const conditions: (SQL | undefined)[] = [
    isNull(companies.archivedAt),
    ownedBy(user),
    input.repId ? eq(companies.repId, input.repId) : undefined,
  ];

  if (term) {
    const anywhere = `%${escapeLike(term)}%`;
    const needle = phoneNeedle(term);
    const byPhone = needle
      ? sql`exists (
          select 1 from contacts ct
           where ct.company_id = companies.id
             and ct.archived_at is null
             and ct.phone_normalized like ${"%" + escapeLike(needle) + "%"}
        )`
      : null;
    conditions.push(
      byPhone
        ? sql`(${companies.name} ilike ${anywhere} or ${byPhone})`
        : sql`${companies.name} ilike ${anywhere}`,
    );
  }

  if (filter) {
    conditions.push(
      followUpFilterSql(
        effective,
        filter,
        neverContactedCompanySql(),
        goneQuietCompanySql(effective),
      ),
    );
  }

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      cityName: sql<string | null>`coalesce(${cityLabel}, ${companies.cityText})`,
      mainContactName: mainContact("name"),
      mainContactPhone: mainContact("phone_normalized"),
      lastActivityOn: lastActivity,
      nextFollowUp: effective,
      followUpState: followUpStateSql(effective),
    })
    .from(companies)
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(and(...conditions))
    .orderBy(sql`${lastActivity} desc nulls last`, asc(companies.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cityName: row.cityName ?? null,
    mainContactName: row.mainContactName ?? null,
    mainContactPhone: row.mainContactPhone ? storedE164(row.mainContactPhone) : null,
    lastActivityOn: row.lastActivityOn ?? null,
    nextFollowUp: row.nextFollowUp ?? null,
    followUpState: row.followUpState ?? null,
  }));
}

// ---- the drawer -------------------------------------------------------------

export type CompanyContact = {
  id: string;
  name: string;
  /** As the rep typed it. Fills the edit form back in; never displayed. */
  phone: string;
  /** The number itself — what the screen shows and what wa.me is given. */
  phoneNormalized: E164;
  position: string | null;
  email: string | null;
  notes: string | null;
  isMain: boolean;
};

export type CompanyProject = {
  id: string;
  name: string;
  expectedSqm: string | null;
  nextFollowUp: Day | null;
  lostAt: Date | null;
  lostReason: string | null;
  followUpState: FollowUpState | null;
};

export type CompanyDetail = {
  id: string;
  name: string;
  notes: string | null;
  categoryId: number;
  categoryName: string;
  leadSourceId: number;
  leadSourceName: string;
  countryId: number;
  countryCode: string;
  countryName: string;
  cityId: number | null;
  cityName: string | null;
  cityText: string | null;
  repId: string;
  repName: string;
  /** The company's OWN date — what the picker at the top of the drawer edits. */
  nextFollowUp: Day | null;
  followUpState: FollowUpState | null;
  archivedAt: Date | null;
  createdAt: Date;
  contacts: CompanyContact[];
  projects: CompanyProject[];
  counts: { contacts: number; projects: number; activities: number; quotations: number };
  /** How the relationship is going, for the top of the drawer (P8.5). */
  standing: CompanyStanding;
};

/**
 * Everything the company drawer shows, in four round trips. Throws NotAllowed
 * when a rep asks for a company that is not his; returns null when there is no
 * such company at all.
 *
 * An archived company still opens — the record survives so that a company which
 * resurfaces in two years shows it was already known (S16). Only lists hide it.
 */
export async function getCompany(
  user: SessionUser,
  id: string,
  locale?: string,
): Promise<CompanyDetail | null> {
  const label = locale ?? user.locale;
  const ar = label.startsWith("ar");

  const [row] = await db
    .select({
      id: companies.id,
      name: companies.name,
      notes: companies.notes,
      categoryId: companies.categoryId,
      categoryName: ar ? companyCategories.nameAr : companyCategories.nameEn,
      leadSourceId: companies.leadSourceId,
      leadSourceName: ar ? leadSources.nameAr : leadSources.nameEn,
      countryId: companies.countryId,
      countryCode: countries.code,
      countryName: ar ? countries.nameAr : countries.nameEn,
      cityId: companies.cityId,
      cityName: ar ? cities.nameAr : cities.nameEn,
      cityText: companies.cityText,
      repId: companies.repId,
      repName: personName(label),
      nextFollowUp: companies.nextFollowUp,
      followUpState: followUpStateSql(sql`companies.next_follow_up`),
      archivedAt: companies.archivedAt,
      createdAt: companies.createdAt,
    })
    .from(companies)
    .innerJoin(companyCategories, eq(companyCategories.id, companies.categoryId))
    .innerJoin(leadSources, eq(leadSources.id, companies.leadSourceId))
    .innerJoin(countries, eq(countries.id, companies.countryId))
    .innerJoin(users, eq(users.id, companies.repId))
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(eq(companies.id, id))
    .limit(1);

  if (!row) return null;
  if (!mayOpen(user, row.repId)) throw new NotAllowed();

  const [contactRows, projectRows, countRow, standing] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        phone: contacts.phone,
        phoneNormalized: contacts.phoneNormalized,
        position: contacts.position,
        email: contacts.email,
        notes: contacts.notes,
        // Derived, never the raw column: the flag alone says nobody is main
        // once the marked contact has been archived (D18, mainContactIdSql).
        isMain: sql<boolean>`contacts.id = ${mainContactIdSql(sql`${id}::uuid`)}`,
      })
      .from(contacts)
      .where(and(eq(contacts.companyId, id), isNull(contacts.archivedAt)))
      .orderBy(sql`contacts.is_main desc`, asc(contacts.createdAt)),

    db
      .select({
        id: projects.id,
        name: projects.name,
        expectedSqm: projects.expectedSqm,
        nextFollowUp: projects.nextFollowUp,
        lostAt: projects.lostAt,
        lostReason: projects.lostReason,
        followUpState: followUpStateSql(sql`projects.next_follow_up`),
      })
      .from(projects)
      .where(and(eq(projects.companyId, id), isNull(projects.archivedAt)))
      .orderBy(sql`projects.lost_at is null desc`, asc(projects.createdAt)),

    db
      .select({
        activities: sql<number>`(
          select count(*) from activities
           where activities.company_id = companies.id and activities.archived_at is null
        )::int`,
        quotations: sql<number>`(select count(*) from quotations where quotations.company_id = companies.id)::int`,
      })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1),

    companyStanding(id),
  ]);

  return {
    ...row,
    cityName: row.cityId === null ? null : row.cityName,
    followUpState: row.followUpState ?? null,
    contacts: contactRows.map((c) => ({
      ...c,
      phoneNormalized: storedE164(c.phoneNormalized),
      position: c.position ?? null,
      email: c.email ?? null,
      notes: c.notes ?? null,
    })),
    projects: projectRows.map((p) => ({ ...p, followUpState: p.followUpState ?? null })),
    counts: {
      contacts: contactRows.length,
      projects: projectRows.length,
      activities: Number(countRow[0]?.activities ?? 0),
      quotations: Number(countRow[0]?.quotations ?? 0),
    },
    standing,
  };
}

// ---- the duplicate warning ---------------------------------------------------

export type PossibleDuplicate = {
  id: string;
  name: string;
  repName: string;
  /** Which of the two signs matched, so the warning sits under that field. */
  matchedOn: "phone" | "name";
};

/** Below this a name prefix matches half the book and the warning is noise. */
const MIN_DUPLICATE_NAME = 3;

/**
 * "Looks like an existing company: X" (SPEC S15, D8) — the ONE answer to that
 * question. The Add company dialog asks it while a rep types, and an edit
 * screen will ask it about the row it is editing; two queries here would mean
 * two answers to one figure (rules/data.md).
 *
 * It searches across ALL reps, because the point is to tell a rep that someone
 * else already owns this customer, and it NEVER blocks: a company is always
 * created, even when it looks like a duplicate.
 *
 * The phone is the stronger sign and sorts first — names vary, numbers rarely
 * do — and it is compared on `phone_normalized`, so 0551234567, +966551234567
 * and 00966551234567 all find the same contact (S14). The name is a prefix
 * match, because the question is asked mid-word, with an exact hit ahead of the
 * rest. Archived rows never match.
 */
export async function findPossibleDuplicates(input: {
  name?: string;
  phone?: string;
  /** The company being edited, so it never warns about itself. */
  excludeId?: string;
  limit?: number;
}): Promise<PossibleDuplicate[]> {
  const name = (input.name ?? "").trim();
  const phone = normalizePhone(input.phone ?? "");
  const byName = name.length >= MIN_DUPLICATE_NAME;
  if (!byName && !phone) return [];

  // BOTH tables named outright inside the correlated subquery: Drizzle drops a
  // column's qualifier when the outer query joins nothing, and `where
  // company_id = id` then resolves inside `contacts` and is never true.
  const phoneMatch: SQL | null = phone
    ? sql`exists (
        select 1 from contacts ct
         where ct.company_id = companies.id
           and ct.archived_at is null
           and ct.phone_normalized = ${phone}
      )`
    : null;
  const nameMatch: SQL | null = byName
    ? sql`companies.name ilike ${escapeLike(name) + "%"}`
    : null;

  const matches = [phoneMatch, nameMatch].filter((clause): clause is SQL => clause !== null);

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      repName: personName(await getLocale()),
      matchedOn: sql<"phone" | "name">`case when ${phoneMatch ?? sql`false`} then 'phone' else 'name' end`,
    })
    .from(companies)
    .innerJoin(users, eq(users.id, companies.repId))
    .where(
      and(
        isNull(companies.archivedAt),
        input.excludeId ? sql`companies.id <> ${input.excludeId}::uuid` : undefined,
        // Parenthesised deliberately: `and` binds tighter than `or`, so an
        // unwrapped disjunction would swallow the archived and exclude clauses.
        sql`(${sql.join(matches, sql` or `)})`,
      ),
    )
    .orderBy(
      sql`case when ${phoneMatch ?? sql`false`} then 0 else 1 end`,
      sql`case when lower(trim(companies.name)) = lower(${name}) then 0 else 1 end`,
      asc(companies.name),
    )
    .limit(input.limit ?? 5);

  return rows;
}

// ---- shared with the actions --------------------------------------------------

/** Re-exported so an action never re-invents the gate (src/lib/activities.ts). */
export { assertCompanyVisible, mayOpen };
