import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, projects } from "@/db/schema";
import type { Day } from "@/lib/dates";
import type { ActivityChannel } from "@/lib/activities";

/**
 * What a person WROTE that day, beside what the system recorded of him
 * (SPEC §3, P12: the reports screen and the company log are one thing with two
 * halves).
 *
 * The figures above it — companies added, quotations raised and issued,
 * dispatches approved, metres moved, calls due and missed — are the system's
 * own account of the day and nobody types them. This is the other half: the
 * sentences he wrote about a customer or a job, which are the only part of the
 * day the system cannot know. They lived on the company drawer and nowhere
 * else, so a manager reading the day had the counts and none of the substance.
 *
 * Unfiled entries are excluded, like everywhere else that counts the log (D70).
 * The day is the day the WORK happened (`happened_on`), not the instant it was
 * typed: a rep writing up Tuesday's visit on Wednesday morning is describing
 * Tuesday, and the report is a report of the day's work.
 */
export type WrittenEntry = {
  id: string;
  userId: string;
  companyId: string;
  companyName: string;
  /** Null when the entry is about the customer rather than one of his jobs. */
  projectName: string | null;
  channel: ActivityChannel;
  text: string;
};

/**
 * One statement for every person on the screen, keyed by person.
 *
 * Asked for the whole day at once rather than per card, because the reports
 * screen draws up to a dozen people and a query per card is the shape that
 * turned one screen into fourteen round trips before (D71).
 */
export async function writtenOn(
  userIds: string[],
  day: Day,
): Promise<Map<string, WrittenEntry[]>> {
  const written = new Map<string, WrittenEntry[]>();
  if (userIds.length === 0) return written;

  const rows = await db
    .select({
      id: activities.id,
      userId: activities.userId,
      companyId: activities.companyId,
      companyName: companies.name,
      projectName: projects.name,
      channel: activities.channel,
      text: activities.text,
    })
    .from(activities)
    .innerJoin(companies, eq(companies.id, activities.companyId))
    .leftJoin(projects, eq(projects.id, activities.projectId))
    .where(
      and(
        inArray(activities.userId, userIds),
        eq(activities.happenedOn, day),
        isNull(activities.archivedAt),
      ),
    )
    // The order he wrote them in, which is the order they read in.
    .orderBy(asc(activities.createdAt));

  for (const row of rows) {
    const list = written.get(row.userId) ?? [];
    list.push({
      id: row.id,
      userId: row.userId,
      companyId: row.companyId,
      companyName: row.companyName,
      projectName: row.projectName ?? null,
      channel: row.channel,
      text: row.text,
    });
    written.set(row.userId, list);
  }
  return written;
}
