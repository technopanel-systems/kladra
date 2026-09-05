import { and, asc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts, projects } from "@/db/schema";
import type { LogContact, LogProject } from "@/components/activities/log-dialog";

/**
 * What the log dialog needs to open on a company, for many companies at once
 * (SPEC D71, 9A item 4).
 *
 * The rep's day lists who to call and used to send him to another screen to say
 * what happened — five steps, two of them navigation, for one sentence about a
 * phone call he has just finished. The dialog opens on the day itself now, and
 * it needs the same two lists it has in the drawer: the company's contacts, and
 * its live projects.
 *
 * Two queries for the whole screen rather than two per row: a rep with fourteen
 * customers owed a call would otherwise open his day with twenty-eight round
 * trips to answer a question nobody asked yet.
 */
export type LogTargets = { contacts: LogContact[]; projects: LogProject[] };

export async function logTargetsFor(companyIds: readonly string[]): Promise<Map<string, LogTargets>> {
  const targets = new Map<string, LogTargets>();
  const ids = [...new Set(companyIds)];
  if (ids.length === 0) return targets;
  for (const id of ids) targets.set(id, { contacts: [], projects: [] });

  const [contactRows, projectRows] = await Promise.all([
    db
      .select({ id: contacts.id, companyId: contacts.companyId, name: contacts.name })
      .from(contacts)
      .where(and(inArray(contacts.companyId, ids), isNull(contacts.archivedAt)))
      .orderBy(asc(contacts.name)),
    db
      .select({ id: projects.id, companyId: projects.companyId, name: projects.name })
      .from(projects)
      // A lost project takes no more entries, the same rule the drawer uses.
      .where(and(inArray(projects.companyId, ids), isNull(projects.archivedAt), isNull(projects.lostAt)))
      .orderBy(asc(projects.name)),
  ]);

  for (const row of contactRows) {
    targets.get(row.companyId)?.contacts.push({ id: row.id, name: row.name });
  }
  for (const row of projectRows) {
    targets.get(row.companyId)?.projects.push({ id: row.id, name: row.name });
  }
  return targets;
}

/** The empty pair, for a company the map has nothing for. */
export const NO_TARGETS: LogTargets = { contacts: [], projects: [] };
