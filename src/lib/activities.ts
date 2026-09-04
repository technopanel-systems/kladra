/**
 * The log — what actually happened with a customer, newest first (SPEC S24).
 *
 * This module sits at the BOTTOM of the rep-floor module graph: companies.ts
 * and projects.ts import from it, never the other way round. The visibility
 * gate every reader and every action shares therefore lives here, so there is
 * one `if` about who may open a record rather than one per file. The rule
 * itself is authz's (`seesAll`): a rep sees only his own companies, manager and
 * admin see everyone's (S8).
 *
 * A log entry names a company always, and a contact and a project sometimes;
 * the reader shows the words a person recognises, never an id (DESIGN §2).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, projects, users } from "@/db/schema";
import { NotAllowed, seesAll } from "@/lib/authz";
import type { Day } from "@/lib/dates";
import type { SessionUser } from "@/lib/types";

export type ActivityChannel = "visit" | "call" | "whatsapp" | "other";

/** One line of the Activity tab. Words only — the ids are for links. */
export type ActivityRow = {
  id: string;
  text: string;
  channel: ActivityChannel;
  happenedOn: Day;
  userName: string;
  contactName: string | null;
  projectId: string | null;
  projectName: string | null;
};

/** May this person open a record owned by `repId`? */
export function mayTouch(user: SessionUser, repId: string): boolean {
  return seesAll(user) || repId === user.id;
}

/**
 * The company's owner, or null when there is no such company. Never leaks
 * whether a hidden company exists — the caller turns null into "not found" and
 * a foreign owner into NotAllowed.
 */
export async function companyOwner(companyId: string): Promise<string | null> {
  const [row] = await db
    .select({ repId: companies.repId })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row?.repId ?? null;
}

/**
 * Who owns the company and whether it is archived, in ONE read. Throws
 * NotAllowed for a company this person may not touch.
 *
 * The two questions travel together because every write that ADDS to a company
 * has to ask both, and asking them separately is two round trips and two
 * chances for them to disagree. An archived company still OPENS — the record
 * survives so a customer who resurfaces in two years shows what happened (S16)
 * — so the flag is returned rather than thrown on, and each caller decides.
 */
export async function assertCompanyOpen(
  user: SessionUser,
  companyId: string,
): Promise<{ repId: string; archived: boolean }> {
  const [row] = await db
    .select({ repId: companies.repId, archivedAt: companies.archivedAt })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (!row || !mayTouch(user, row.repId)) throw new NotAllowed();
  return { repId: row.repId, archived: row.archivedAt !== null };
}

/** Throws NotAllowed for a company that is not this person's. */
export async function assertCompanyVisible(user: SessionUser, companyId: string): Promise<string> {
  const { repId } = await assertCompanyOpen(user, companyId);
  return repId;
}

/** The project's company and that company's owner, or null when unknown. */
export async function projectOwner(
  projectId: string,
): Promise<{ companyId: string; repId: string } | null> {
  const [row] = await db
    .select({ companyId: projects.companyId, repId: companies.repId })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ?? null;
}

/** Throws NotAllowed for a project hanging off someone else's company. */
export async function assertProjectVisible(
  user: SessionUser,
  projectId: string,
): Promise<{ companyId: string; repId: string }> {
  const owner = await projectOwner(projectId);
  if (!owner || !mayTouch(user, owner.repId)) throw new NotAllowed();
  return owner;
}

/**
 * The one activity query. `happened_on` is the day the rep says it happened;
 * `created_at` breaks ties, so two entries typed on the same day read in the
 * order they were written.
 */
function activityQuery() {
  return db
    .select({
      id: activities.id,
      text: activities.text,
      channel: activities.channel,
      happenedOn: activities.happenedOn,
      userName: users.name,
      contactName: contacts.name,
      projectId: activities.projectId,
      projectName: projects.name,
    })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.userId))
    .leftJoin(contacts, eq(contacts.id, activities.contactId))
    .leftJoin(projects, eq(projects.id, activities.projectId));
}

type ActivityQueryRow = {
  id: string;
  text: string;
  channel: ActivityChannel;
  happenedOn: Day;
  userName: string;
  contactName: string | null;
  projectId: string | null;
  projectName: string | null;
};

function toRows(rows: ActivityQueryRow[]): ActivityRow[] {
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    channel: row.channel,
    happenedOn: row.happenedOn,
    userName: row.userName,
    contactName: row.contactName ?? null,
    projectId: row.projectId ?? null,
    projectName: row.projectName ?? null,
  }));
}

/** The company drawer's Activity tab, newest first. */
export async function listActivitiesForCompany(
  user: SessionUser,
  companyId: string,
): Promise<ActivityRow[]> {
  await assertCompanyVisible(user, companyId);
  const rows = await activityQuery()
    .where(eq(activities.companyId, companyId))
    .orderBy(desc(activities.happenedOn), desc(activities.createdAt));
  return toRows(rows);
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
  const rows = await activityQuery()
    .where(and(eq(activities.projectId, projectId), eq(activities.companyId, owner.companyId)))
    .orderBy(desc(activities.happenedOn), desc(activities.createdAt));
  return toRows(rows);
}
