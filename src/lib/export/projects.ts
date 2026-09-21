/**
 * The projects file (SPEC §3, P14 14.10; S18 before it).
 *
 * One row per job — the tower, the villa, the mall — with the customer it
 * belongs to, whose job it is, where it stands and what it is expected to be
 * worth in metres. Everything joined already: an accountant opening this does
 * not want to look a rep or a stage up in a second sheet.
 *
 * It is the projects SCREEN, exported. The same narrowing (`narrowProjects`),
 * fed from the address with the screen's own parsers, so a rep's file is a
 * rep's floor and a search or a follow-up chip narrows the file exactly as it
 * narrows the list he is looking at — and `?view=board` drops the chip here as
 * it drops it there, because a board of stages shows every stage and the file
 * from a board is the board. Uncapped, where the list is capped at two hundred
 * and the board at a share of it per column (D80): a screen is read from the
 * top and a file is added up.
 *
 * Three columns are the screen's own rules rather than the columns underneath
 * them, and that is the thing a reader would otherwise be surprised by. `stage`
 * is read off the job's papers at the moment the file is built
 * (`projectStageSql`, D170) — nobody types it — and is written with the same
 * message key the badge on the list says it with (`STAGE_KEYS`).
 * `next_follow_up` is the date that still chases somebody, which a lost job has
 * none of whatever is left in its column (`pendingFollowUpSql`, S20).
 * `lost_reason` is a stored code turned into words, or the rep's own written
 * line when he chose Other (`lossReasonLabel`, D93) — and is empty unless the
 * job is lost, exactly as the row on the list is.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { STAGE_KEYS } from "@/components/projects/stage-words";
import { db } from "@/db";
import { companies, projects, users } from "@/db/schema";
import type { Day } from "@/lib/dates";
import { exportDay, type ExportRead } from "@/lib/export/kit";
import { parseFollowUpFilter } from "@/lib/followups";
import { lossReasonLabel } from "@/lib/loss-reason";
import { personName } from "@/lib/people";
import { projectStageSql } from "@/lib/project-stage";
import { narrowProjects, pendingFollowUpSql } from "@/lib/projects";
import { parseView } from "@/lib/view";

export const projectsSheet: ExportRead = async ({ user, locale, params }) => {
  // A board of stages shows every stage, so the follow-up chip is not in force
  // on one and the page drops it there. Only the address is read for it: the
  // remembered choice behind it belongs to a person, and a file is built from
  // the address the screen sent.
  const board = parseView(params.get("view")) === "board";

  const [t, rows] = await Promise.all([
    getTranslations({ locale }),
    db
      .select({
        company: companies.name,
        project: projects.name,
        // Whose job it is (D147) — the project's own rep, which on a shared
        // customer is not the same person as the customer's.
        rep: personName(locale),
        stage: projectStageSql(),
        expected_sqm: projects.expectedSqm,
        next_follow_up: pendingFollowUpSql(),
        lost_reason: projects.lostReason,
        added: sql<Day>`to_char((${projects.createdAt} at time zone 'Asia/Riyadh')::date, 'YYYY-MM-DD')`,
      })
      .from(projects)
      .innerJoin(companies, eq(companies.id, projects.companyId))
      .innerJoin(users, eq(users.id, projects.repId))
      .where(
        and(
          ...narrowProjects({
            user,
            locale,
            q: params.get("q")?.trim() || undefined,
            filter: board ? undefined : parseFollowUpFilter(params.get("filter")),
          }),
        ),
      )
      // The customer, then his jobs by name. Not the list's order, which is by
      // last activity: a file is looked down rather than read from the top, and
      // one customer's jobs belong together on the page.
      .orderBy(asc(companies.name), asc(projects.name)),
  ]);

  return {
    columns: [
      "company",
      "project",
      "rep",
      "stage",
      "expected_sqm",
      "next_follow_up",
      "lost_reason",
      "added",
    ],
    // The rep's own estimate, and the only figure on the row. It stays the
    // string `numeric(12,2)` gave us all the way here: a float would round it
    // on the way past (S19).
    numeric: ["expected_sqm"],
    rows: rows.map((row) => ({
      ...row,
      stage: t(STAGE_KEYS[row.stage]),
      expected_sqm: row.expected_sqm ?? "",
      next_follow_up: exportDay(row.next_follow_up, locale),
      // The same condition the row on the list asks before it prints a reason:
      // the words belong to the lost state and to nothing else (rules/data.md).
      lost_reason: (row.stage === "lost" ? lossReasonLabel(row.lost_reason, t) : null) ?? "",
      added: exportDay(row.added, locale),
    })),
  };
};
