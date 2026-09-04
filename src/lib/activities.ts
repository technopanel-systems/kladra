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
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, contacts, projects, users } from "@/db/schema";
import { NotAllowed } from "@/lib/authz";
import { mayOpen, mayWrite } from "@/lib/floor";
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

export { mayOpen, mayWrite };

/** The company's owner and whether it is archived, in ONE read. */
async function companyRow(
  companyId: string,
): Promise<{ repId: string; archived: boolean } | null> {
  const [row] = await db
    .select({ repId: companies.repId, archivedAt: companies.archivedAt })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row ? { repId: row.repId, archived: row.archivedAt !== null } : null;
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
): Promise<{ repId: string; archived: boolean }> {
  const row = await companyRow(companyId);
  if (!row || !mayOpen(user, row.repId)) throw new NotAllowed();
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
): Promise<{ repId: string; archived: boolean }> {
  const row = await companyRow(companyId);
  if (!row || !mayWrite(user, row.repId)) throw new NotAllowed();
  return row;
}

/** Throws NotAllowed for a company this person may not open. Reading only. */
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

/** Throws NotAllowed for a project this person may not open. Reading only. */
export async function assertProjectVisible(
  user: SessionUser,
  projectId: string,
): Promise<{ companyId: string; repId: string }> {
  const owner = await projectOwner(projectId);
  if (!owner || !mayOpen(user, owner.repId)) throw new NotAllowed();
  return owner;
}

/** The same, for writing: a project is worked by the rep whose company it is. */
export async function assertProjectMine(
  user: SessionUser,
  projectId: string,
): Promise<{ companyId: string; repId: string }> {
  const owner = await projectOwner(projectId);
  if (!owner || !mayWrite(user, owner.repId)) throw new NotAllowed();
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
