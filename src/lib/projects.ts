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
import { personName } from "@/lib/people";
import { cities, companies, projects, users } from "@/db/schema";
import { type ActivityRow, listActivitiesForProject } from "@/lib/activities";
import { archiveStandsAt, type ArchiveRequestState } from "@/lib/archive-requests";
import { NotAllowed } from "@/lib/authz";
import { riyadhDay, type Day } from "@/lib/dates";
import {
  type FollowUpFilter,
  type FollowUpState,
  followUpFilterSql,
  followUpStateSql,
  neverContactedProjectSql,
} from "@/lib/followups";
import { LIST_LIMIT } from "@/lib/list-size";
import {
  PROJECT_STAGES,
  projectStageSql,
  stageSinceSql,
  type ProjectStage,
} from "@/lib/project-stage";
import type { SessionUser } from "@/lib/types";
import {
  maySeeCompany,
  onCompanySql,
  onProjectSql,
  seesCompany,
} from "@/lib/visibility";

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
  /** Where it stands in its own life, read off its papers (D170). */
  stage: ProjectStage;
};

export type ListProjectsInput = {
  user: SessionUser;
  q?: string;
  filter?: FollowUpFilter;
  /** Defaults to the reader's saved language; scripts and tests pass one. */
  locale?: string;
  /** How many rows the screen will draw (D80). */
  limit?: number;
};

/** `%` and `_` are ILIKE wildcards; a rep typing them means the characters. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => "\\" + match);
}

/**
 * The date that still chases somebody. A lost project has none, whatever is
 * left in the column — one definition, so the row's colour, the filter and the
 * home strip's counts cannot disagree.
 *
 * Exported for the same reason `narrowProjects` below is (P14 14.10): the file
 * this screen exports carries the date the screen shows, and a project the rep
 * gave up on shows none. Spelling the case a second time in the builder is how
 * the list and the file come to disagree about one column.
 */
export function pendingFollowUpSql(): SQL<Day | null> {
  return sql`(case when projects.lost_at is null then projects.next_follow_up end)`;
}

/** The most recent day anything was logged against this project. */
function lastActivitySql(): SQL<Day | null> {
  return sql`(
    select max(a.happened_on)
      from activities a
     where a.project_id = projects.id
       and a.archived_at is null
  )`;
}

export async function listProjects(input: ListProjectsInput): Promise<ProjectRow[]> {
  const pending = pendingFollowUpSql();
  const lastActivity = lastActivitySql();
  const conditions = narrowTo(input);

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
      stage: projectStageSql(),
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .where(and(...conditions))
    .orderBy(
      sql`projects.lost_at is null desc`,
      sql`${lastActivity} desc nulls last`,
      asc(projects.name),
    )
    // What the screen will draw, not the whole floor (D80).
    .limit(input.limit ?? LIST_LIMIT);

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
    stage: row.stage,
  }));
}

/**
 * The same narrowing, for the file this screen exports (P14 14.10, D213).
 *
 * Exported so `src/lib/export/projects.ts` asks THIS rather than writing the
 * same WHERE a second time: a file is the screen it came from, narrowed the way
 * that screen is narrowed, and two copies of a narrowing is the drift trap
 * rules/data.md names for figures, one step out. `narrowCompanies` in
 * companies.ts is the same one line for the same reason.
 */
export function narrowProjects(input: ListProjectsInput): (SQL | undefined)[] {
  return narrowTo(input);
}

/** The one place this list's narrowing is written, for the rows and the count. */
function narrowTo(input: ListProjectsInput): (SQL | undefined)[] {
  const { user, filter } = input;
  const term = (input.q ?? "").trim();
  const pending = pendingFollowUpSql();

  const conditions: (SQL | undefined)[] = [
    isNull(projects.archivedAt),
    isNull(companies.archivedAt),
    seesCompany(user),
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

  return conditions;
}

/** How many there are, asked only when the list came back full (D80). */
export async function countProjects(input: ListProjectsInput): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .where(and(...narrowTo(input)));
  return Number(row?.total ?? 0);
}

/**
 * The two chips above the list, counted the way the list is narrowed: projects
 * with a pending date, through the same predicate `narrowTo` filters by, in one
 * statement (D108). This screen used to show the home strip's figure — company
 * dates and project dates together — above a list of projects only, and read
 * "37 overdue" over one row.
 */
export async function projectFollowUpCounts(
  user: SessionUser,
): Promise<{ overdue: number; today: number }> {
  const pending = pendingFollowUpSql();
  const never = neverContactedProjectSql();
  const overdue = followUpFilterSql(pending, "overdue", never);
  const today = followUpFilterSql(pending, "today", never);
  const [row] = await db
    .select({
      overdue: sql<number>`count(*) filter (where ${overdue})::int`,
      today: sql<number>`count(*) filter (where ${today})::int`,
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .where(and(...narrowTo({ user })));
  return { overdue: Number(row?.overdue ?? 0), today: Number(row?.today ?? 0) };
}

// ---- the board (D170) --------------------------------------------------------

/**
 * How many cards one column of the board draws (D80).
 *
 * A share of what a list screen draws, so the whole board is never heavier than
 * the list beside it. Per column and not across the board: one shared cap,
 * ordered newest first, cut the OLDEST cards first — which are the long
 * Dispatching jobs — and a column holding fifteen jobs read "0 · Nothing here".
 */
export const BOARD_COLUMN_LIMIT = Math.floor(LIST_LIMIT / PROJECT_STAGES.length);

export type ProjectCard = {
  id: string;
  name: string;
  companyName: string;
  expectedSqm: string | null;
  stage: ProjectStage;
  /** The Riyadh day it entered its stage (`stageSinceSql`). */
  since: Day | null;
  /** Whose job it is (D147), in the reader's script (D68). */
  repId: string;
  repName: string;
  /** How many projects are in this card's column altogether, counted before the cap. */
  inStage: number;
};

export type ProjectBoardInput = {
  user: SessionUser;
  q?: string;
  locale: string;
  /** Cards drawn per column; the count on each is every project in it. */
  perColumn?: number;
};

/**
 * Every project this reader sees, each in the one column its papers put it in
 * (SPEC §3 P13, D170).
 *
 * The stage and the day it began are resolved here, in the query, and so is
 * each column's count — a window over the whole narrowed set — and so is the
 * cap, which is each column's own: the first `perColumn` cards of every stage by
 * their place in that stage, never the first two hundred of the board. The
 * count and the cut are two windows over the same partition in one inner query,
 * and the outer one keeps what the cut allows, so a heading counts every job in
 * its column however many of them were drawn (rules/data.md, D80). Newest into
 * its column first: what just moved is what the board is read for, and what has
 * sat longest is at the bottom of its column where its date says so.
 *
 * The narrowing is the list's own (`narrowTo`), without the follow-up filter:
 * a board of stages is every project, the way the quotations board is every
 * status.
 */
export async function listProjectBoard(input: ProjectBoardInput): Promise<ProjectCard[]> {
  const stage = projectStageSql();
  const since = stageSinceSql(stage);

  // Every field aliased: the outer query reads them by name, and two tables
  // here both have a `name`.
  const staged = db
    .select({
      id: projects.id,
      name: projects.name,
      companyName: sql<string>`${companies.name}`.as("company_name"),
      expectedSqm: projects.expectedSqm,
      stage: sql<ProjectStage>`${stage}`.as("stage"),
      sinceAt: sql<Date | null>`${since}`.as("since_at"),
      repId: projects.repId,
      repName: sql<string>`${personName(input.locale)}`.as("rep_name"),
      inStage: sql<number>`(count(*) over (partition by ${stage}))::int`.as("in_stage"),
      place: sql<number>`(row_number() over (
        partition by ${stage}
        order by ${since} desc nulls last, ${projects.name} asc, ${projects.id} asc
      ))::int`.as("place"),
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .innerJoin(users, eq(users.id, projects.repId))
    .where(and(...narrowTo({ user: input.user, q: input.q, locale: input.locale })))
    .as("staged");

  const rows = await db
    .select({
      id: staged.id,
      name: staged.name,
      companyName: staged.companyName,
      expectedSqm: staged.expectedSqm,
      stage: staged.stage,
      since: riyadhDay(sql`${staged.sinceAt}`),
      repId: staged.repId,
      repName: staged.repName,
      inStage: staged.inStage,
    })
    .from(staged)
    .where(sql`${staged.place} <= ${input.perColumn ?? BOARD_COLUMN_LIMIT}::int`)
    .orderBy(sql`${staged.sinceAt} desc nulls last`, asc(staged.name), asc(staged.id));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    companyName: row.companyName,
    expectedSqm: row.expectedSqm ?? null,
    stage: row.stage,
    since: (row.since as Day | null) ?? null,
    repId: row.repId,
    repName: row.repName,
    inStage: Number(row.inStage ?? 0),
  }));
}

export type ProjectDetail = ProjectRow & {
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  /** Whose job it is — only he edits the project row itself (D147). */
  repId: string;
  /** Whether this reader is on it, and therefore works it. */
  onProject: boolean;
  /** Whether this reader is on the company over it, and therefore reads it. */
  shared: boolean;
  company: {
    id: string;
    name: string;
    cityName: string | null;
    repId: string;
    repName: string;
    nextFollowUp: Day | null;
  };
  activities: ActivityRow[];
  /**
   * Where taking this job off the floor stands, or null while nobody has ever
   * asked (P14 14.8). The newest asking, so an approved one means the job has
   * already gone — which is why the drawer reads the status and not merely the
   * presence of a row.
   */
  archiveRequest: ArchiveRequestState | null;
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
      stage: projectStageSql(),
      notes: projects.notes,
      archivedAt: projects.archivedAt,
      createdAt: projects.createdAt,
      companyCityName: sql<string | null>`coalesce(${
        ar ? cities.nameAr : cities.nameEn
      }, ${companies.cityText})`,
      companyRepId: companies.repId,
      companyRepName: personName(label),
      shared: onCompanySql(user, sql`companies.id`).mapWith(Boolean),
      // Whose job it is, and whether this reader is on it (D147): seeing the
      // customer and working the job are two different permissions.
      repId: projects.repId,
      onProject: onProjectSql(user, sql`projects.id`).mapWith(Boolean),
      companyNextFollowUp: companies.nextFollowUp,
    })
    .from(projects)
    .innerJoin(companies, eq(companies.id, projects.companyId))
    .innerJoin(users, eq(users.id, companies.repId))
    .leftJoin(cities, eq(cities.id, companies.cityId))
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) return null;
  if (!maySeeCompany(user, row.companyRepId, row.shared)) throw new NotAllowed();

  // The log and the asking together: neither is waiting on the other, and both
  // are about a job this reader has just been allowed to open.
  const [activities, archiveRequest] = await Promise.all([
    listActivitiesForProject(user, id),
    archiveStandsAt("project", id, label),
  ]);

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
    stage: row.stage,
    notes: row.notes ?? null,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    repId: row.repId,
    onProject: row.onProject,
    shared: row.shared,
    company: {
      id: row.companyId,
      name: row.companyName,
      cityName: row.companyCityName ?? null,
      repId: row.companyRepId,
      repName: row.companyRepName,
      nextFollowUp: row.companyNextFollowUp ?? null,
    },
    activities,
    archiveRequest,
  };
}
