/**
 * The log — what actually happened with a customer, newest first (SPEC S24).
 *
 * This module sits at the BOTTOM of the rep-floor module graph: companies.ts
 * and projects.ts import from it, never the other way round. The gates every
 * reader and every action share therefore live here, so there is one `if`
 * about who may open a record and one about who may change it, rather than one
 * of each per file. The rules themselves are src/lib/floor.ts's: `mayOpen` —
 * a rep sees only his own companies, manager and admin see everyone's (S8) —
 * and `mayWrite`, which is the rep alone (D42).
 *
 * A log entry names a company always, and a contact and a project sometimes;
 * the reader shows the words a person recognises, never an id (DESIGN §2).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { db } from "@/db";
import { activities, companies, contacts, countries, projects, users } from "@/db/schema";
import { NotAllowed } from "@/lib/authz";
import { personName } from "@/lib/people";
import { mayOpen, mayWrite } from "@/lib/floor";
import { lastWorkingDay } from "@/lib/calendar";
import { todayRiyadh, type Day } from "@/lib/dates";
import type { SessionUser } from "@/lib/types";
import {
  mayKeepContacts,
  mayWorkProject,
  maySeeCompany,
  onCompanySql,
  onProjectSql,
  sharersOfCompany,
} from "@/lib/visibility";

export type ActivityChannel = "visit" | "call" | "whatsapp" | "other";

/** One line of the Activity tab. Words only — the ids are for links. */
export type ActivityRow = {
  id: string;
  text: string;
  channel: ActivityChannel;
  happenedOn: Day;
  userName: string;
  /**
   * Which customer it is about. Every entry names one (S24), and on a company's
   * own drawer that is the context rather than news — but on a person's DAY it
   * is the whole point of the line, so the query carries it either way and the
   * reader decides which half is worth printing.
   */
  companyId: string;
  companyName: string;
  contactId: string | null;
  contactName: string | null;
  projectId: string | null;
  projectName: string | null;
  /** The reader wrote this one, so it is theirs to correct or unfile (D70). */
  mine: boolean;
  /** …and its day is still open, so the words can still change (D58). */
  dayOpen: boolean;
};

export { mayOpen, mayWrite };

/** The company's owner and whether it is archived, in ONE read. */
async function companyRow(
  user: SessionUser,
  companyId: string,
): Promise<{ repId: string; archived: boolean; country: string; shared: boolean } | null> {
  const [row] = await db
    .select({
      repId: companies.repId,
      archivedAt: companies.archivedAt,
      country: countries.code,
      // Asked in the same statement as the owner, because "may I see it" is one
      // question with two answers in it now (D147) and two round trips are two
      // chances for them to disagree.
      shared: onCompanySql(user, sql`companies.id`).mapWith(Boolean),
    })
    .from(companies)
    .innerJoin(countries, eq(countries.id, companies.countryId))
    .where(eq(companies.id, companyId))
    .limit(1);
  return row
    ? {
        repId: row.repId,
        archived: row.archivedAt !== null,
        country: row.country,
        shared: row.shared,
      }
    : null;
}

/**
 * Who owns the company and whether it is archived, for READING it. Throws
 * NotAllowed for a company this person may not open.
 *
 * The two questions travel together because every caller has to ask both, and
 * asking them separately is two round trips and two chances for them to
 * disagree. An archived company still OPENS — the record survives so a customer
 * who resurfaces in two years shows what happened (S16) — so the flag is
 * returned rather than thrown on, and each caller decides.
 */
export async function assertCompanyOpen(
  user: SessionUser,
  companyId: string,
): Promise<{ repId: string; archived: boolean; shared: boolean }> {
  const row = await companyRow(user, companyId);
  if (!row || !maySeeCompany(user, row.repId, row.shared)) throw new NotAllowed();
  return row;
}

/**
 * The same read, for WRITING on it: the rep's own floor and nobody else's.
 *
 * Every action that adds to or changes a company goes through this and not
 * through `assertCompanyOpen`, which would let the manager reading the floor
 * write on it too (D42). A manager who sells passes here on his own companies,
 * because his id is the one on them.
 */
export async function assertCompanyMine(
  user: SessionUser,
  companyId: string,
): Promise<{ repId: string; archived: boolean; country: string; shared: boolean }> {
  const row = await companyRow(user, companyId);
  if (!row || !mayWrite(user, row.repId)) throw new NotAllowed();
  return row;
}

/**
 * The read for ADDING a contact: his own company, or one shared with him
 * (D147). A company share carries exactly this much writing and no more.
 */
export async function assertMayKeepContacts(
  user: SessionUser,
  companyId: string,
): Promise<{ repId: string; archived: boolean; country: string; shared: boolean }> {
  const row = await companyRow(user, companyId);
  if (!row || !mayKeepContacts(user, row.repId, row.shared)) throw new NotAllowed();
  return row;
}

/**
 * The read for CHANGING one: a contact belongs to whoever added him, and only
 * he edits, archives or makes him the main one. On a shared company the other
 * rep has his own row for the same person, and that is the one he changes.
 */
export async function assertContactMine(
  user: SessionUser,
  contactId: string,
): Promise<{ companyId: string; companyRepId: string; country: string; sharers: string[] }> {
  const [row] = await db
    .select({
      companyId: contacts.companyId,
      contactRepId: contacts.repId,
      companyRepId: companies.repId,
      country: countries.code,
    })
    .from(contacts)
    .innerJoin(companies, eq(companies.id, contacts.companyId))
    .innerJoin(countries, eq(countries.id, companies.countryId))
    .where(eq(contacts.id, contactId))
    .limit(1);
  if (!row || !mayWrite(user, row.contactRepId)) throw new NotAllowed();
  return {
    companyId: row.companyId,
    companyRepId: row.companyRepId,
    country: row.country,
    sharers: await sharersOfCompany(row.companyId),
  };
}

/** Throws NotAllowed for a company this person may not open. Reading only. */
export async function assertCompanyVisible(user: SessionUser, companyId: string): Promise<string> {
  const { repId } = await assertCompanyOpen(user, companyId);
  return repId;
}

/**
 * Everything the two questions about a project need, in one statement (D147).
 *
 * `repId` is the company's owner and `projectRepId` is the project's, which
 * were the same person until a company could be shared. Seeing it is the
 * company's question — a company shared is a company seen, all of it — and
 * working it is the project's, and they are answered from different columns.
 */
export async function projectOwner(
  user: SessionUser,
  projectId: string,
): Promise<{
  companyId: string;
  repId: string;
  projectRepId: string;
  shared: boolean;
  onProject: boolean;
  archived: boolean;
} | null> {
  const [row] = await db
    .select({
      companyId: projects.companyId,
      repId: companies.repId,
      projectRepId: projects.repId,
      shared: onCompanySql(user, sql`companies.id`).mapWith(Boolean),
      onProject: onProjectSql(user, sql`projects.id`).mapWith(Boolean),
      // A job on a company that has left the floor takes nothing new either
      // (S16); the same sentence the company gate says.
      archived: sql<boolean>`${companies.archivedAt} is not null`.mapWith(Boolean),
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

/** Throws NotAllowed for a project this person may not open. Reading only. */
export async function assertProjectVisible(
  user: SessionUser,
  projectId: string,
): Promise<{ companyId: string; repId: string }> {
  const owner = await projectOwner(user, projectId);
  if (!owner || !maySeeCompany(user, owner.repId, owner.shared)) throw new NotAllowed();
  return owner;
}

/**
 * The same, for WORKING it: its own rep, and whoever it has been shared with
 * (D147). Seeing the company over it is not enough — the founder drew the line
 * there, and a rep who can read a job is not thereby on it.
 */
export async function assertProjectMine(
  user: SessionUser,
  projectId: string,
): Promise<{ companyId: string; repId: string; projectRepId: string; archived: boolean }> {
  const owner = await projectOwner(user, projectId);
  if (!owner || !mayWorkProject(user, owner.projectRepId, owner.onProject)) throw new NotAllowed();
  return owner;
}

/**
 * The same read, for changing the PROJECT ROW rather than working the job.
 *
 * Renaming it, marking it lost and archiving it belong to whoever created it
 * (SPEC §3: an item belongs to the person who made it, and only he edits it).
 * Logging against it, reporting on it and quoting on it are the work, and
 * `assertProjectMine` answers those. Two questions, two helpers — the same
 * split as `mayOpen` and `mayWrite`, and for the same reason: one predicate
 * answering both is how a manager once came to write on every floor (D42).
 */
export async function assertProjectOwn(
  user: SessionUser,
  projectId: string,
): Promise<{ companyId: string; repId: string; projectRepId: string; archived: boolean }> {
  const owner = await projectOwner(user, projectId);
  if (!owner || !mayWrite(user, owner.projectRepId)) throw new NotAllowed();
  return owner;
}

/**
 * The one activity query. `happened_on` is the day the rep says it happened;
 * `created_at` breaks ties, so two entries typed on the same day read in the
 * order they were written.
 */
function activityQuery(locale: string, where: SQL) {
  return db
    .select({
      id: activities.id,
      text: activities.text,
      channel: activities.channel,
      happenedOn: activities.happenedOn,
      userId: activities.userId,
      userName: personName(locale),
      companyId: activities.companyId,
      companyName: companies.name,
      contactId: activities.contactId,
      contactName: contacts.name,
      projectId: activities.projectId,
      projectName: projects.name,
    })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.userId))
    .innerJoin(companies, eq(companies.id, activities.companyId))
    .leftJoin(contacts, eq(contacts.id, activities.contactId))
    .leftJoin(projects, eq(projects.id, activities.projectId))
    // The caller's own filter AND the one every caller needs: an unfiled entry
    // is off every list and out of every count (D70). The condition is an
    // argument rather than a second `.where()` because Drizzle allows one, and
    // it is required rather than optional so a third caller cannot forget.
    .where(and(isNull(activities.archivedAt), where));
}

type ActivityQueryRow = {
  id: string;
  text: string;
  channel: ActivityChannel;
  happenedOn: Day;
  userId: string;
  userName: string;
  companyId: string;
  companyName: string;
  contactId: string | null;
  contactName: string | null;
  projectId: string | null;
  projectName: string | null;
};

async function toRows(rows: ActivityQueryRow[], user: SessionUser): Promise<ActivityRow[]> {
  // Asked once for the whole list rather than per row: the window is two days
  // wide and finding the second of them reads the holiday table (D58, D70).
  const today = todayRiyadh();
  const open = rows.some((row) => row.happenedOn !== today && row.userId === user.id)
    ? await lastWorkingDay(today)
    : today;

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    channel: row.channel,
    happenedOn: row.happenedOn,
    userId: row.userId,
    userName: row.userName,
    companyId: row.companyId,
    companyName: row.companyName,
    contactId: row.contactId ?? null,
    contactName: row.contactName ?? null,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
    // Viewing as somebody is reading, never writing (D52) — every write action
    // refuses it, so the screen does not offer it either.
    mine: row.userId === user.id && !user.viewedBy,
    dayOpen: row.happenedOn === today || row.happenedOn === open,
  }));
}

/** The company drawer's Activity tab, newest first. */
export async function listActivitiesForCompany(
  user: SessionUser,
  companyId: string,
): Promise<ActivityRow[]> {
  await assertCompanyVisible(user, companyId);
  const rows = await activityQuery(await getLocale(), eq(activities.companyId, companyId))
    .orderBy(desc(activities.happenedOn), desc(activities.createdAt));
  return toRows(rows, user);
}

/**
 * The project drawer's Activity tab, newest first — only the entries filed
 * against this project, not everything at its company.
 */
export async function listActivitiesForProject(
  user: SessionUser,
  projectId: string,
): Promise<ActivityRow[]> {
  const owner = await assertProjectVisible(user, projectId);
  const rows = await activityQuery(
    await getLocale(),
    and(eq(activities.projectId, projectId), eq(activities.companyId, owner.companyId))!,
  ).orderBy(desc(activities.happenedOn), desc(activities.createdAt));
  return toRows(rows, user);
}

/**
 * One person's log for one day, newest first, with how many there are (S27).
 *
 * S24 to S27 read together are one sentence: a rep writes what happened with a
 * customer in his own words, he is asked for nothing a record already holds,
 * and the history that comes out of it IS what the manager reads at the end of
 * the day. Kladra had both halves and had never joined them — the entries lived
 * on each customer's drawer, the report card said "3 log entries" and named
 * none of them, and at six o'clock a rep summarised in the report box what he
 * had already typed three times. That is the second copy S26 forbids.
 *
 * Capped, and the total comes back with it: the figure above the list counts
 * the DAY and the list shows the first few of it, which are two different
 * numbers whenever somebody has a busy afternoon (D144, D80).
 *
 * Who may read it is `mayOpen` — the same question every other screen asks
 * about a floor. It is asked by the caller, per person, because the report
 * screen shows everybody and the answer differs down the page.
 */
export async function listActivitiesForDay(
  user: SessionUser,
  personId: string,
  day: Day,
  limit: number,
): Promise<{ rows: ActivityRow[]; total: number }> {
  if (!mayOpen(user, personId)) throw new NotAllowed();

  const where = and(eq(activities.userId, personId), eq(activities.happenedOn, day))!;
  // One row past the cap, which answers both questions at once in the ordinary
  // case: a day that fits under the cap needs no count, because the rows ARE
  // the count. The second read happens only on a day somebody was busy, which
  // is also the only day the tail line has anything to say.
  const found = await activityQuery(await getLocale(), where)
    .orderBy(desc(activities.createdAt))
    .limit(limit + 1);

  const rows = await toRows(found.slice(0, limit), user);
  if (found.length <= limit) return { rows, total: found.length };

  const counted = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(activities)
    .where(and(isNull(activities.archivedAt), where));
  return { rows, total: counted[0]?.n ?? rows.length };
}
