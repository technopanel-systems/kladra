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
import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import {
  archiveRequests,
  cities,
  companies,
  companyCategories,
  contacts,
  countries,
  leadSources,
  projects,
  users,
} from "@/db/schema";
import { archiveStandsAt, type ArchiveRequestState } from "@/lib/archive-requests";
import { NotAllowed, seesAll } from "@/lib/authz";
import { isId } from "@/lib/id";
import { smacState, type SmacState } from "@/lib/smac";
import { mayWrite, seesSmacBacklog } from "@/lib/floor";
import type { Day } from "@/lib/dates";
import {
  type FollowUpFilter,
  type FollowUpState,
  followUpFilterSql,
  effectiveFollowUpSql,
  followUpStateSql,
  goneQuietCompanySql,
  neverContactedCompanySql,
  waitingLeadOnSql,
} from "@/lib/followups";
import { personName, personNameOf } from "@/lib/people";
import { normalizePhone, storedE164, type E164 } from "@/lib/phone";
import { companyStanding, type CompanyStanding } from "@/lib/standing";
import { LIST_LIMIT } from "@/lib/list-size";
import type { SessionUser } from "@/lib/types";
import {
  maySeeCompany,
  onCompanySql,
  onProjectSql,
  seesCompany,
} from "@/lib/visibility";

/**
 * The person who filed a lead, as a second name for `users`.
 *
 * The query already joins that table once for the company's own rep, so the
 * finder needs its own alias — aliased through Drizzle rather than written into
 * a raw `from`, so the join condition and the name expression cannot drift.
 */
const leadFinder = alias(users, "lead_finder");
/** The record a tombstone became, and whoever holds it now (P12-8). */
const mergedInto = alias(companies, "merged_into");
const mergedIntoRep = alias(users, "merged_into_rep");
/** Whoever keeps a contact, for a company more than one person keeps people on. */
const contactRep = alias(users, "contact_rep");
/** Whoever answered the SMAC question about this customer — either of the two (P14). */
const smacBeliever = alias(users, "smac_believer");
const smacRegistrar = alias(users, "smac_registrar");
/** Whoever asked for one of this customer's people to go, and whoever answered (P14 14.8). */
const archiveAsker = alias(users, "archive_asker");
const archiveDecider = alias(users, "archive_decider");

export type { ActivityRow } from "@/lib/activities";

// ---- the list ---------------------------------------------------------------

export type CompanyRow = {
  id: string;
  name: string;
  cityName: string | null;
  /** Who the card names — so a log opened from it starts on him (D101). */
  mainContactId: string | null;
  mainContactName: string | null;
  mainContactPhone: E164 | null;
  lastActivityOn: Day | null;
  /**
   * The words of the last entry — why the next call is owed, on the card that
   * asks for it (D111). The rep who wrote "wants 4 mm samples, follow up
   * tomorrow" read tomorrow's card as a name and a date until this rode with it.
   */
  lastActivityText: string | null;
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
  /**
   * How many rows the caller can actually use (D80). A screen asks for what it
   * will draw; nothing asks for a floor of two thousand and then renders it.
   */
  limit?: number;
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
 *
 * A shared company can have two people marked main, one per rep (D147), and
 * this still answers with one: the earliest, which is the rep whose company it
 * is. "The number to call" on the list is the customer's, the same for whoever
 * reads it — a figure that changed with the reader would be the second
 * definition rules/data.md forbids. Each rep's own person is in the drawer,
 * marked as his.
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

/**
 * The same question asked inside one rep's own contacts (D147).
 *
 * The company-wide answer above is what the LIST and the export show, and it is
 * one answer for every reader on purpose. The drawer is the other case: it draws
 * both reps' people on a shared company, and "the number to call" there is the
 * one each of them marked, so a row is main when it is the main of the rep whose
 * row it is. Same ordering, same fallback for a company whose marked contact has
 * been archived — asked per person instead of per company.
 *
 * Correlated on `contacts.rep_id` from the outer query, so both tables are named
 * outright (rules/data.md): the bare form would resolve inside `ct` and answer
 * the same thing for every row.
 */
function mainContactForRepSql(companyId: SQL): SQL<string | null> {
  return sql`(
    select ct.id
      from contacts ct
     where ct.company_id = ${companyId}
       and ct.rep_id = contacts.rep_id
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

/**
 * What the last entry said — the same entry `lastActivitySql` dates, chosen the
 * same way, so the card's day and its words are one visit (D111). Ties on a day
 * go to the one written last.
 */
function lastActivityTextSql(): SQL<string | null> {
  return sql`(
    select a.text
      from activities a
     where a.company_id = companies.id
       and a.archived_at is null
     order by a.happened_on desc, a.created_at desc
     limit 1
  )`;
}


/** A rep sees only his own; manager and admin see all (S8, authz.seesAll). */
function ownedBy(user: SessionUser): SQL | undefined {
  return seesCompany(user);
}

/**
 * The rep's home list. Newest activity first, companies never touched at the
 * bottom, ties broken by name so the order never wobbles between renders.
 *
 * `q` matches the company name, or a contact's number when it looks like a
 * phone — the strongest sign two records are the same company (S14).
 */
export async function listCompanies(input: ListCompaniesInput): Promise<CompanyRow[]> {
  const { user } = input;
  const locale = input.locale ?? user.locale;

  const cityLabel = locale.startsWith("ar") ? cities.nameAr : cities.nameEn;
  const lastActivity = lastActivitySql();
  const effective = effectiveFollowUpSql();
  const conditions = narrowTo(input);

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      cityName: sql<string | null>`coalesce(${cityLabel}, ${companies.cityText})`,
      mainContactId: mainContactIdSql(sql`companies.id`),
      mainContactName: mainContact("name"),
      mainContactPhone: mainContact("phone_normalized"),
      lastActivityOn: lastActivity,
      lastActivityText: lastActivityTextSql(),
      nextFollowUp: effective,
      followUpState: followUpStateSql(effective),
    })
    .from(companies)
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(and(...conditions))
    .orderBy(sql`${lastActivity} desc nulls last`, asc(companies.name))
    // A screen that draws 25 rows asks for 25. Without this the list was the
    // whole floor at every width, twice over — the phone's cards and the desk's
    // table are both rendered and one is hidden by CSS (D80).
    .limit(input.limit ?? LIST_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    cityName: row.cityName ?? null,
    mainContactId: row.mainContactId ?? null,
    mainContactName: row.mainContactName ?? null,
    mainContactPhone: row.mainContactPhone ? storedE164(row.mainContactPhone) : null,
    lastActivityOn: row.lastActivityOn ?? null,
    lastActivityText: row.lastActivityText ?? null,
    nextFollowUp: row.nextFollowUp ?? null,
    followUpState: row.followUpState ?? null,
  }));
}

/**
 * Which companies this reader is asking about — the one place the narrowing is
 * written, so the count below and the rows above can never be about two
 * different sets (rules/data.md).
 *
 * Exported since P14 14.10, because the file the screen exports carries the
 * screen's own filters and does it by asking this rather than by writing the
 * same WHERE a second time. Two copies of a narrowing is the drift trap
 * rules/data.md names for figures, one step out — a file that quietly holds
 * more rows than the list it came from is worse than one that holds none.
 */
export function narrowCompanies(input: ListCompaniesInput): (SQL | undefined)[] {
  return narrowTo(input);
}

/**
 * The floor named in an address, for `repId` above — the manager's drill-down
 * from the team table (S8), read the one way so the screen and the file it
 * exports are looking at the same rows.
 *
 * Two things it refuses, and the second is why it exists. **Anybody who does
 * not read every floor** gets nothing: a rep naming a colleague's id changes
 * nothing anyway, since `ownedBy` narrows him underneath — but "changes
 * nothing" is a property of the WHERE beneath it, and a rule that only holds
 * because of a line somewhere else is a rule waiting to stop holding. **And
 * anything that is not the shape of an id**: `companies.rep_id` is a `uuid`, an
 * address is text, and `?rep=x` was a `22P02` and a 500 rather than an
 * unnarrowed list. The screen never met it because it nulled the value first
 * for a rep and never built a bad one for a manager; the customers and contacts
 * files, which take the address as it comes, met it at once (P14.5).
 */
export function floorAsked(user: SessionUser, value: string | null | undefined): string | undefined {
  if (!seesAll(user)) return undefined;
  const id = (value ?? "").trim();
  return isId(id) ? id : undefined;
}

function narrowTo(input: ListCompaniesInput): (SQL | undefined)[] {
  const { user, filter } = input;
  const term = (input.q ?? "").trim();
  const effective = effectiveFollowUpSql();

  const mine = ownedBy(user);
  // The floor being read: his own list, or the manager's drill-down into one.
  const floor = mine !== undefined ? user.id : input.repId;
  const conditions: (SQL | undefined)[] = [
    isNull(companies.archivedAt),
    mine,
    input.repId ? eq(companies.repId, input.repId) : undefined,
    // A lead nobody has acknowledged is not one of THAT floor's companies yet:
    // it waits in its holder's band and on the manager's leads view. Only that
    // floor's — one shared with him from another floor is in no band of his,
    // and stays in his list (`waitingLeadOnSql`, D185).
    floor ? sql`not ${waitingLeadOnSql(floor)}` : undefined,
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

  return conditions;
}

/**
 * How many there are altogether, asked only when the list came back full.
 *
 * A screen that shows the first two hundred of something has to say how many
 * there are, or the number it shows is a number it made up (D80).
 */
export async function countCompanies(input: ListCompaniesInput): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(companies)
    .where(and(...narrowTo(input)));
  return Number(row?.total ?? 0);
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
  /** Whose contact this is (D147) — only he may change it. */
  repId: string;
  /**
   * And his name, in the reader's script (D68), for the one case where the
   * drawer has to say it: a company more than one person keeps people on.
   */
  repName: string;
  /**
   * Whether anybody has asked for this person to be taken off the customer, and
   * where that asking stands (P14 14.8). Null on all but a handful of cards: a
   * contact is archived down the same path a company is, so the card carries
   * the same notice the drawer does.
   */
  archiveRequest: ArchiveRequestState | null;
};

export type CompanyProject = {
  id: string;
  name: string;
  expectedSqm: string | null;
  nextFollowUp: Day | null;
  lostAt: Date | null;
  lostReason: string | null;
  followUpState: FollowUpState | null;
  /** Whose job it is, and whether this reader is on it (D147). */
  repId: string;
  onProject: boolean;
};

/** The earliest follow-up among the company's open projects, and whose it is (D94). */
export type ProjectFollowUp = { day: Day; project: string };

export type CompanyDetail = {
  id: string;
  name: string;
  notes: string | null;
  /**
   * What drives the row's colour when it is not the company's own date: the
   * list shows least(company, projects), and the drawer's picker writes the
   * company only (D94). Null when no open project carries a date.
   */
  projectFollowUp: ProjectFollowUp | null;
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
  /** Whether this reader is on its share list rather than its owner (D147). */
  shared: boolean;
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
  /**
   * Where this customer came from, when marketing filed him as a lead (§3).
   *
   * Null on a company somebody typed in himself, which is most of them. It is
   * one object rather than three loose columns because the three are one fact —
   * a lead has a finder, a question and an answer to "have you got him?" — and
   * three nullable fields side by side is the shape that lets a screen render
   * half of it.
   */
  lead: CompanyLead | null;
  /**
   * Whether this customer is in SMAC, and whose word that is (SPEC §3, P14).
   *
   * One object rather than four loose columns, for the reason the lead above is
   * one: the state and the person who put the record in it are one fact, and
   * `smacState` is the only place that decides which of the three answers a
   * company has. `who` and `when` are null only on `unknown`.
   */
  smac: { state: SmacState; who: string | null; when: Date | null };
  /**
   * What this record turned out to be, when the manager ruled it a duplicate
   * (P12-8). Null on every record that is still a record, which is all but a
   * handful.
   */
  folded: CompanyFolded | null;
  /**
   * Where taking this customer off the floor stands, if anybody has ever asked
   * (P14 14.8). The NEWEST request, which is what `archiveStandsAt` answers and
   * why an approved one means the record has already gone — the notice that
   * draws this draws nothing for that case.
   */
  archiveRequest: ArchiveRequestState | null;
};

/**
 * A tombstone, read from the drawer over it (P12-8).
 *
 * "Archived" on its own says the wrong thing here — nobody gave this customer
 * up — so the drawer says what actually happened, and the rep who typed the
 * name finds out where his customer went. Whether the survivor's name is a
 * DOOR is D121's rule, unchanged: his own floor is the one he may open, and
 * where it is another rep's the answer is the rep's name, which is the person
 * to ring.
 */
export type CompanyFolded = {
  intoId: string;
  intoName: string;
  /** Who holds the record that continues, in the reader's script (D68). */
  intoRepName: string;
  /** Whether this reader may open it (S8, D121). */
  mine: boolean;
};

/** What makes a company a lead (SPEC §3, P12-7). */
export type CompanyLead = {
  /** Who found it, in the reader's script (D68). */
  fromName: string;
  /** What the customer asked for, in the finder's own words. */
  query: string;
  /** Whether the person it was given to has said he has it. */
  acknowledged: boolean;
  /** True for the reader who has to answer that question — him and nobody else. */
  mine: boolean;
};

/**
 * Where each of this customer's people stands on being archived (P14 14.8),
 * asked once for the whole company.
 *
 * `archiveStandsAt` answers this for ONE record, and the Contacts tab needs the
 * answer for every card on it. A loop over the single-record reader would be an
 * N+1 on a drawer that opens from every row of the rep's home list, and its
 * cost would fall hardest on the customers with the most people on file, which
 * are the customers that matter (rules/data.md).
 *
 * So it is one statement, and it gives the same answer for the same reason:
 * `distinct on (record_id)` with the newest first is that reader's `order by
 * created_at desc limit 1` asked of a set. A refusal is a state the card has to
 * show, and an approved request means the person has already gone.
 */
async function contactArchiveRequests(
  companyId: string,
  locale: string,
): Promise<Map<string, ArchiveRequestState>> {
  const rows = await db
    .selectDistinctOn([archiveRequests.recordId], {
      contactId: archiveRequests.recordId,
      id: archiveRequests.id,
      status: archiveRequests.status,
      reason: archiveRequests.reason,
      askedById: archiveRequests.requestedBy,
      askedBy: personNameOf("archive_asker", locale),
      askedOn: sql<Day>`to_char((${archiveRequests.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
      refuseReason: archiveRequests.refuseReason,
      decidedBy: personNameOf("archive_decider", locale),
      decidedById: archiveRequests.decidedBy,
      decidedOn: sql<
        Day | null
      >`to_char((${archiveRequests.decidedAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
    })
    .from(archiveRequests)
    // Whose people these are, asked of the people themselves: `record_id`
    // points into one of three tables and carries no foreign key of its own
    // (schema, P14), so the join to `contacts` is the only thing that makes a
    // request this company's — and `kind` is what makes the join honest.
    .innerJoin(contacts, eq(contacts.id, archiveRequests.recordId))
    .innerJoin(archiveAsker, eq(archiveAsker.id, archiveRequests.requestedBy))
    .leftJoin(archiveDecider, eq(archiveDecider.id, archiveRequests.decidedBy))
    .where(and(eq(archiveRequests.kind, "contact"), eq(contacts.companyId, companyId)))
    .orderBy(archiveRequests.recordId, desc(archiveRequests.createdAt));

  return new Map(
    rows.map((row) => [
      row.contactId,
      {
        id: row.id,
        status: row.status,
        reason: row.reason,
        askedBy: row.askedBy,
        askedById: row.askedById,
        askedOn: row.askedOn,
        refuseReason: row.refuseReason,
        // The name only where there is an id behind it: a left join hands back
        // the fallback half of `personNameOf` rather than null (D68).
        decidedBy: row.decidedById ? row.decidedBy : null,
        decidedOn: row.decidedOn,
      },
    ]),
  );
}

/**
 * Everything the company drawer shows: one read of the company, then the rest
 * fired together — never one statement per row of anything. Throws NotAllowed
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
      shared: onCompanySql(user, sql`companies.id`).mapWith(Boolean),
      // What makes it a lead, if it is one (P12-7). The finder is a second
      // alias of `users`, joined LEFT because most companies have none.
      leadFromId: companies.leadFromId,
      leadFromName: personNameOf("lead_finder", label),
      leadQuery: companies.leadQuery,
      leadAcknowledgedAt: companies.leadAcknowledgedAt,
      // What it became, if it stopped being a record of its own (P12-8). A
      // third alias of `companies` and a third of `users`, joined LEFT for the
      // same reason the lead's finder is: almost nothing has one.
      mergedIntoId: companies.mergedIntoId,
      mergedIntoName: mergedInto.name,
      mergedIntoRepId: mergedInto.repId,
      mergedIntoRepName: personNameOf("merged_into_rep", label),
      mergedIntoShared: onCompanySql(user, sql`merged_into.id`).mapWith(Boolean),
      // Whether this customer is in SMAC, and whose word that is (P14). Two
      // more left joins on the same table, for the same reason as the lead's
      // finder: most companies have neither.
      smacBelievedAt: companies.smacBelievedAt,
      smacBelievedName: personNameOf("smac_believer", label),
      smacRegisteredAt: companies.smacRegisteredAt,
      smacRegisteredName: personNameOf("smac_registrar", label),
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
    .leftJoin(leadFinder, eq(leadFinder.id, companies.leadFromId))
    .leftJoin(mergedInto, eq(mergedInto.id, companies.mergedIntoId))
    .leftJoin(mergedIntoRep, eq(mergedIntoRep.id, mergedInto.repId))
    .leftJoin(smacBeliever, eq(smacBeliever.id, companies.smacBelievedBy))
    .leftJoin(smacRegistrar, eq(smacRegistrar.id, companies.smacRegisteredBy))
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(eq(companies.id, id))
    .limit(1);

  if (!row) return null;
  if (!maySeeCompany(user, row.repId, row.shared)) throw new NotAllowed();

  const [contactRows, projectRows, countRow, standing, archiveRequest, contactArchives] =
    await Promise.all([
      db
        .select({
          id: contacts.id,
          name: contacts.name,
          phone: contacts.phone,
          phoneNormalized: contacts.phoneNormalized,
          position: contacts.position,
          email: contacts.email,
          notes: contacts.notes,
          repId: contacts.repId,
          repName: personNameOf("contact_rep", label),
          // Derived, never the raw column: the flag alone says nobody is main
          // once the marked contact has been archived (D18). Per rep rather than
          // per company, because on a shared one each of them has his own person
          // to call and the company-wide answer marked only the owner's (D147).
          isMain: sql<boolean>`contacts.id = ${mainContactForRepSql(sql`${id}::uuid`)}`,
        })
        .from(contacts)
        .innerJoin(contactRep, eq(contactRep.id, contacts.repId))
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
          // Whose job it is, and whether this reader is on it (D147): the drawer
          // offers Request quotation on a job somebody put him on, and the action
          // behind it asks the same two columns.
          repId: projects.repId,
          onProject: onProjectSql(user, sql`projects.id`).mapWith(Boolean),
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

      // Whether this customer is on his way off the floor, and whether each of
      // his people is (P14 14.8). Two statements, not one per card: the second
      // is the whole company's people at once.
      archiveStandsAt("company", id, label),
      contactArchiveRequests(id, label),
    ]);

  const smacWas = smacState(row);
  return {
    ...row,
    smac: {
      state: smacWas,
      // Hers where she has answered, his where only he has, nobody's where
      // neither: the same order `smacState` decides in, so the sentence and the
      // state cannot say two different things.
      who:
        smacWas === "registered"
          ? row.smacRegisteredName
          : smacWas === "believed"
            ? row.smacBelievedName
            : null,
      when:
        smacWas === "registered"
          ? row.smacRegisteredAt
          : smacWas === "believed"
            ? row.smacBelievedAt
            : null,
    },
    lead: row.leadFromId
      ? {
          fromName: row.leadFromName,
          // The CHECK says a lead always carries one; the fallback is for a
          // reader of this type who does not know that.
          query: row.leadQuery ?? "",
          acknowledged: row.leadAcknowledgedAt !== null,
          // The question is his to answer, and asked with the rule the action
          // asks: an admin viewing as him is reading, not working (D42, P8.8).
          mine: mayWrite(user, row.repId),
        }
      : null,
    folded:
      row.mergedIntoId && row.mergedIntoName && row.mergedIntoRepId
        ? {
            intoId: row.mergedIntoId,
            intoName: row.mergedIntoName,
            intoRepName: row.mergedIntoRepName,
            // The same rule the duplicate warning follows (D121): a name is a
            // door only where the reader may open what it points at.
            mine: maySeeCompany(user, row.mergedIntoRepId, row.mergedIntoShared),
          }
        : null,
    archiveRequest,
    cityName: row.cityId === null ? null : row.cityName,
    followUpState: row.followUpState ?? null,
    contacts: contactRows.map((c) => ({
      ...c,
      phoneNormalized: storedE164(c.phoneNormalized),
      position: c.position ?? null,
      email: c.email ?? null,
      notes: c.notes ?? null,
      archiveRequest: contactArchives.get(c.id) ?? null,
    })),
    projects: projectRows.map((p) => ({ ...p, followUpState: p.followUpState ?? null })),
    projectFollowUp:
      projectRows
        .flatMap((p) => (!p.lostAt && p.nextFollowUp ? [{ day: p.nextFollowUp, project: p.name }] : []))
        .sort((a, b) => a.day.localeCompare(b.day))[0] ?? null,
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
  /** Whose floor it is on — the asker's own is the one he may open (S8, D121). */
  repId: string;
  repName: string;
  /** Which of the two signs matched, so the warning sits under that field. */
  matchedOn: "phone" | "name";
  /** What a rep decides by without leaving the form: where it is, when it was last worked. */
  city: string | null;
  lastActivityOn: Day | null;
  /** Off the floor, with the day and the reason somebody gave up on it (S16, D109). */
  archivedOn: Day | null;
  archiveReason: string | null;
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
 * rest.
 *
 * Archived rows match TOO, and say so (D109). The first draft skipped them,
 * which made the archive a place things went and never a place the app looked:
 * a customer archived last year as "closed down" was typed in again as a
 * stranger, and the one reason to archive rather than delete — that when he
 * resurfaces the record says he was known and why somebody gave up on him
 * (S16) — was never shown to the person it was kept for. A live match still
 * sorts ahead of an archived one.
 */
export async function findPossibleDuplicates(input: {
  name?: string;
  phone?: string;
  /** ISO code of the country the form has picked; Saudi when none (D89). */
  country?: string;
  /** The company being edited, so it never warns about itself. */
  excludeId?: string;
  limit?: number;
}): Promise<PossibleDuplicate[]> {
  const name = (input.name ?? "").trim();
  const phone = normalizePhone(input.phone ?? "", input.country);
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
  /*
   * The name, compared with the spelling taken out of it (P12-8, migration
   * 0020). `ilike 'what he typed%'` is a rule about letters, and two people
   * typing one Saudi customer do not agree about letters: الوطنية against
   * وطنية, a fatha typed or not, ة against ه, Al-Watania against AL WATANIA
   * TRADING CO. Each of those was a different string and the same customer, and
   * the warning that exists to catch exactly that saw none of them.
   *
   * Three clauses because a rep types the name he has, which may be shorter or
   * longer than the one on file: equal, his is the start of it, or it is the
   * start of his. The pattern is built out of the fold without escaping,
   * because the fold keeps only letters, digits and single spaces — a LIKE
   * metacharacter cannot survive it, which is a property of `fold_name` and is
   * written down beside it.
   *
   * The minimum length is asked of the FOLD, not of what he typed: مصنع الف is
   * eight characters and folds to one, and one letter matches a quarter of the
   * floor.
   */
  const nameMatch: SQL | null = byName
    ? sql`(
        length(fold_name(${name})) >= ${MIN_DUPLICATE_NAME}
        and (
          companies.name_folded = fold_name(${name})
          or companies.name_folded like fold_name(${name}) || '%'
          or fold_name(${name}) like companies.name_folded || '%'
        )
      )`
    : null;

  const matches = [phoneMatch, nameMatch].filter((clause): clause is SQL => clause !== null);

  const locale = await getLocale();
  const cityLabel = locale.startsWith("ar") ? cities.nameAr : cities.nameEn;
  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      repId: companies.repId,
      repName: personName(locale),
      matchedOn: sql<"phone" | "name">`case when ${phoneMatch ?? sql`false`} then 'phone' else 'name' end`,
      city: sql<string | null>`coalesce(${cityLabel}, ${companies.cityText})`,
      lastActivityOn: lastActivitySql(),
      // The Riyadh day it left the floor; null while it is on it.
      archivedOn: sql<Day | null>`to_char((${companies.archivedAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
      archiveReason: companies.archiveReason,
    })
    .from(companies)
    .innerJoin(users, eq(users.id, companies.repId))
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(
      and(
        input.excludeId ? sql`companies.id <> ${input.excludeId}::uuid` : undefined,
        // Parenthesised deliberately: `and` binds tighter than `or`, so an
        // unwrapped disjunction would swallow the archived and exclude clauses.
        sql`(${sql.join(matches, sql` or `)})`,
      ),
    )
    .orderBy(
      sql`case when ${phoneMatch ?? sql`false`} then 0 else 1 end`,
      // The same name, however either of them spelled it, before one that
      // merely starts the same way.
      sql`case when companies.name_folded = fold_name(${name}) then 0 else 1 end`,
      // Somebody's live customer before a record nobody works.
      sql`companies.archived_at is null desc`,
      asc(companies.name),
    )
    .limit(input.limit ?? 5);

  return rows.map((row) => ({
    ...row,
    city: row.city ?? null,
    lastActivityOn: row.lastActivityOn ?? null,
    archivedOn: row.archivedOn ?? null,
    archiveReason: row.archiveReason ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Which customers are not in SMAC yet (SPEC §3, P14)                          */
/* -------------------------------------------------------------------------- */

/** One customer the coordinator still has to create in the ERP. */
export type NotInSmac = {
  id: string;
  name: string;
  /** Whose customer it is, in the reader's script — the person to ring. */
  repName: string;
  /** When the first price was asked for, which is when he started needing to exist there. */
  since: Day;
};

/**
 * The customers nobody has registered in SMAC, oldest paper first.
 *
 * The founder asked for this outright: "she is given a way to see which
 * companies are not registered yet, or the tick is a dead field nobody acts
 * on." It is her backlog and it is on her own screen, under the desk.
 *
 * Only companies a price has been asked for, because SMAC is where the money
 * is: a customer nobody has quoted does not need to exist there yet, and a list
 * of every name a rep has ever typed would be a list she stops reading. The
 * date is the FIRST paper's, so the oldest neglect is a real number and not the
 * date of the last thing that happened.
 *
 * No door on a row: a rep's company is his to open (D42), and what this list
 * leads to is work in another system. The rep's name is the door — it says whom
 * to ring.
 */
export async function companiesNotInSmac(
  user: SessionUser,
  limit: number,
  locale: string,
): Promise<{ rows: NotInSmac[]; total: number }> {
  // The gate is here and not on the page (rules/data.md): this list is every
  // rep's customers, and a rep's screens have never named another rep's
  // company. `/queue` is reachable by anybody signed in.
  if (!seesSmacBacklog(user.role)) throw new NotAllowed();

  const result = await db.execute<{
    id: string;
    name: string;
    rep_name: string;
    since: string;
    total: number;
  }>(sql`
    with waiting as (
      select companies.id,
             companies.name,
             ${personNameOf("users", locale)} as rep_name,
             min(quotations.created_at) as first_paper
        from companies
        join users on users.id = companies.rep_id
        join quotations on quotations.company_id = companies.id
       where companies.smac_registered_at is null
         and companies.archived_at is null
       -- By the person's ID and not by either spelling of his name: Postgres
       -- lets the select name any column of a table grouped by its primary
       -- key, and the reader's own spelling is what the select asks for.
       group by companies.id, companies.name, users.id
    )
    select id, name, rep_name,
           to_char((first_paper at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD') as since,
           (count(*) over ())::int as total
      from waiting
     -- Oldest first: it is a backlog, worked down from the customer who has
     -- been waiting to exist in SMAC the longest, the way the desk above it is
     -- worked down oldest first.
     order by first_paper asc, name
     limit ${limit}
  `);

  return {
    rows: result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      repName: row.rep_name,
      since: row.since as Day,
    })),
    total: Number(result.rows[0]?.total ?? 0),
  };
}
