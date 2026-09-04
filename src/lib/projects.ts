/**
 * Projects — a job at a customer: a tower, a villa, a mall (SPEC S18).
 *
 * Expected m² is the rep's own estimate and the anchor number of a project
 * (S19); it stays a string all the way to the screen, because it is
 * `numeric(12,2)` and a float would round it on the way past.
 *
 * A project has its own next follow-up, separate from its company's (D9). A
 * LOST project is finished work, so it stops chasing anybody: its date reads as
 * nothing and no follow-up filter can match it. Lost is not archived — it stays
 * in the list, at the bottom, because a rep must be able to see what he gave up
 * on and why (S20).
 *
 * Same scoping as the companies list: a rep sees only projects at his own
 * companies; manager and admin see all (S8).
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cities, companies, projects, users } from "@/db/schema";
import { type ActivityRow, listActivitiesForProject, mayTouch } from "@/lib/activities";
import { NotAllowed, seesAll } from "@/lib/authz";
import type { Day } from "@/lib/dates";
import {
  type FollowUpFilter,
  type FollowUpState,
  followUpFilterSql,
  followUpStateSql,
  neverContactedProjectSql,
} from "@/lib/followups";
import type { SessionUser } from "@/lib/types";

export type ProjectRow = {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  expectedSqm: string | null;
  nextFollowUp: Day | null;
  lostAt: Date | null;
  lostReason: string | null;
  followUpState: FollowUpState | null;
};

export type ListProjectsInput = {
  user: SessionUser;
  q?: string;
  filter?: FollowUpFilter;
  /** Defaults to the reader's saved language; scripts and tests pass one. */
  locale?: string;
};

/** `%` and `_` are ILIKE wildcards; a rep typing them means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => "\\" + match);
}

/**
 * The date that still chases somebody. A lost project has none, whatever is
 * left in the column — one definition, so the row's colour, the filter and the
 * home strip's counts cannot disagree.
 */
function pendingFollowUpSql(): SQL<Day | null> {
  return sql`(case when projects.lost_at is null then projects.next_follow_up end)`;
}

/** The most recent day anything was logged against this project. */
function lastActivitySql(): SQL<Day | null> {
  return sql`(
    select max(a.happened_on)
      from activities a
     where a.project_id = projects.id
  )`;
}

export async function listProjects(input: ListProjectsInput): Promise<ProjectRow[]> {
  const { user, filter } = input;
  const term = (input.q ?? "").trim();
  const pending = pendingFollowUpSql();
  const lastActivity = lastActivitySql();

  const conditions: (SQL | undefined)[] = [
    isNull(projects.archivedAt),
    isNull(companies.archivedAt),
    seesAll(user) ? undefined : eq(companies.repId, user.id),
  ];

  if (term) {
    const anywhere = `%${escapeLike(term)}%`;
    conditions.push(
      sql`(${projects.name} ilike ${anywhere} or ${companies.name} ilike ${anywhere})`,
    );
  }

  if (filter) {
    conditions.push(followUpFilterSql(pending, filter, neverContactedProjectSql()));
  }

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      companyId: projects.companyId,
      companyName: companies.name,
      expectedSqm: projects.expectedSqm,
      nextFollowUp: pending,
      lostAt: projects.lostAt,
      lostReason: projects.lostReason,
      followUpState: followUpStateSql(pending),
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .where(and(...conditions))
    .orderBy(
      sql`projects.lost_at is null desc`,
      sql`${lastActivity} desc nulls last`,
      asc(projects.name),
    );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    companyId: row.companyId,
    companyName: row.companyName,
    expectedSqm: row.expectedSqm ?? null,
    nextFollowUp: row.nextFollowUp ?? null,
    lostAt: row.lostAt ?? null,
    lostReason: row.lostReason ?? null,
    followUpState: row.followUpState ?? null,
  }));
}

export type ProjectDetail = ProjectRow & {
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  company: {
    id: string;
    name: string;
    cityName: string | null;
    repId: string;
    repName: string;
    nextFollowUp: Day | null;
  };
  activities: ActivityRow[];
};

/**
 * The project drawer: the project, the company it belongs to and its log.
 * Throws NotAllowed when the project hangs off a company that is not this
 * person's; returns null when there is no such project.
 */
export async function getProject(
  user: SessionUser,
  id: string,
  locale?: string,
): Promise<ProjectDetail | null> {
  const label = locale ?? user.locale;
  const ar = label.startsWith("ar");

  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      companyId: projects.companyId,
      companyName: companies.name,
      expectedSqm: projects.expectedSqm,
      nextFollowUp: pendingFollowUpSql(),
      lostAt: projects.lostAt,
      lostReason: projects.lostReason,
      followUpState: followUpStateSql(pendingFollowUpSql()),
      notes: projects.notes,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      companyCityName: sql<string | null>`coalesce(${
        ar ? cities.nameAr : cities.nameEn
      }, ${companies.cityText})`,
      companyRepId: companies.repId,
      companyRepName: users.name,
      companyNextFollowUp: companies.nextFollowUp,
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .innerJoin(users, eq(users.id, companies.repId))
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) return null;
  if (!mayTouch(user, row.companyRepId)) throw new NotAllowed();

  return {
    id: row.id,
    name: row.name,
    companyId: row.companyId,
    companyName: row.companyName,
    expectedSqm: row.expectedSqm ?? null,
    nextFollowUp: row.nextFollowUp ?? null,
    lostAt: row.lostAt ?? null,
    lostReason: row.lostReason ?? null,
    followUpState: row.followUpState ?? null,
    notes: row.notes ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    company: {
      id: row.companyId,
      name: row.companyName,
      cityName: row.companyCityName ?? null,
      repId: row.companyRepId,
      repName: row.companyRepName,
      nextFollowUp: row.companyNextFollowUp ?? null,
    },
    activities: await listActivitiesForProject(user, id),
  };
}
