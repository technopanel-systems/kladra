import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyShares, projectShares } from "@/db/schema";
import { mayWrite, seesAllRoles, sells } from "@/lib/floor";
import type { SessionUser } from "@/lib/types";

/**
 * Whose records this person may read, said once (SPEC §3, D147).
 *
 * It was said eleven times before this: four private `narrowTo` predicates and
 * seven more clauses written by hand in the readers beside them, each of them
 * `companies.rep_id = me` and each correct on its own. One company shared
 * between two reps and every one of them would have had to learn the same new
 * sentence, which is eleven chances to teach ten of them — and the eleventh is
 * a screen that shows a rep somebody else's customer, or hides his own.
 *
 * The rule itself is one sentence because the founder's answer made it one: a
 * company shared is a company SEEN, all of it, down to the last dispatch. So
 * there is no per-record visibility anywhere in the app, no half-drawn row that
 * refuses to open, and nothing below a company has to be asked about at all —
 * a project, a contact, a quotation and a dispatch are all visible exactly when
 * the company over them is.
 *
 * Writing is the other question and it is not this one (D42). Seeing a company
 * lets a rep keep his own contacts on it and nothing else; working a project
 * takes `onProject`.
 */
export function seesCompany(user: SessionUser): SQL | undefined {
  if (seesAllRoles(user.role)) return undefined;
  return sql`(
    ${companies.repId} = ${user.id}::uuid
    or exists (
      select 1 from ${companyShares} cs
       where cs.company_id = ${companies.id} and cs.user_id = ${user.id}::uuid
    )
  )`;
}

/**
 * The same sentence for a reader who has the company's rep in hand rather than
 * the table — a row already fetched, or a figure keyed by a person.
 *
 * `shared` is what the query found out: whether this reader is on the company's
 * share list. It defaults to false so a caller that has not asked cannot get a
 * yes by forgetting to.
 */
export function maySeeCompany(user: SessionUser, repId: string, shared = false): boolean {
  return seesAllRoles(user.role) || repId === user.id || shared;
}

/**
 * May this person do the WORK of a project — log against it, report on it,
 * raise a quotation or a dispatch on it?
 *
 * Its owner, and whoever it has been shared with. Sharing the company over it
 * is not enough: the founder drew the line there deliberately, and a rep who
 * can see a job is not thereby on it.
 *
 * `onProject` is the share row, asked in the same query that fetched the
 * project. Viewing through somebody else's eyes never writes (D42), and a role
 * that holds no floor never does either — both are already `mayWrite`'s
 * answers, so this asks it and then widens it, rather than saying either of
 * those rules a second time.
 */
export function mayWorkProject(
  user: SessionUser,
  projectRepId: string,
  onProject = false,
): boolean {
  if (mayWrite(user, projectRepId)) return true;
  // Somebody it was shared with: the same two rules, asked about himself.
  return onProject && mayWrite(user, user.id);
}

/**
 * May this person keep contacts on this company?
 *
 * Its own rep, and anybody it has been shared with — the one thing a company
 * share carries besides reading (SPEC §3): "each keeps his own contacts". Two
 * reps working one customer will both have met people there, and the same
 * person held by both is two rows and not a duplicate, because each of them
 * knows him. Editing one is a different question and its answer is its own rep.
 */
export function mayKeepContacts(user: SessionUser, companyRepId: string, shared = false): boolean {
  if (mayWrite(user, companyRepId)) return true;
  return shared && mayWrite(user, user.id);
}

/**
 * May this person put a price or a load against this record?
 *
 * `mayQuote` asked one question — is this company his — and that was the whole
 * answer while a company had one rep. Now there are two ways in: it is his
 * company, or it is a job he is on (D147). Both still go through the same two
 * rules underneath, so an admin viewing as somebody and a role that holds no
 * floor are refused here for the reasons they are refused everywhere.
 *
 * A quotation with no project is a company's own stock, and there is no job to
 * be on: its company's rep raises it and nobody else.
 */
export function mayRaiseFor(
  user: SessionUser,
  companyRepId: string,
  projectRepId: string | null,
  onProject = false,
): boolean {
  if (!sells(user.role)) return false;
  if (mayWrite(user, companyRepId)) return true;
  return projectRepId !== null && mayWorkProject(user, projectRepId, onProject);
}

/**
 * Whether this person is on a project's share list, in SQL.
 *
 * The id is a written fragment (`sql`projects.id``) and never a Drizzle column,
 * and the type says so on purpose. A column handed to a `sql` template keeps its
 * table qualifier only while the outer query joins something; in a query with a
 * single FROM it renders bare, resolves inside the SUBQUERY instead, and the
 * `exists` is then asking whether a share points at its own id — false for ever,
 * silently (rules/data.md). It shipped exactly that way: the project drawer
 * offered a rep the quotation button its own action then refused, because the
 * screen's query joined a company and the action's did not.
 */
export function onProjectSql(user: SessionUser, projectId: SQL | string): SQL {
  return sql`exists (
    select 1 from ${projectShares} ps
     where ps.project_id = ${projectId} and ps.user_id = ${user.id}::uuid
  )`;
}

/** The same, and the same rule about the fragment: never a bare column. */
export function onCompanySql(user: SessionUser, companyId: SQL | string): SQL {
  return sql`exists (
    select 1 from ${companyShares} cs
     where cs.company_id = ${companyId} and cs.user_id = ${user.id}::uuid
  )`;
}

/**
 * Everyone a company has been shared with (D147).
 *
 * Asked on its own rather than folded into the reads above, because it answers
 * a different question: not "may he see it" but "who else has to be told". It
 * is one small indexed lookup on a write path, and a write that reaches three
 * people instead of two is worth one.
 */
export async function sharersOfCompany(companyId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: companyShares.userId })
    .from(companyShares)
    .where(eq(companyShares.companyId, companyId));
  return rows.map((row) => row.userId);
}
