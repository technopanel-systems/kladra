/**
 * The reports file (SPEC §3, P14 14.10; P13 13.8 before it).
 *
 * One row per report — the day, who wrote it, the customer and the job it was
 * about, how it happened, what came of it, and the words the person typed. The
 * daily reports are the one list the whole floor reads, and this is that list
 * flattened: a manager who wants a month of Faisal's week on paper, or the
 * coordinator's own quarter, opens it in a spreadsheet and sorts it himself.
 *
 * `written` is what somebody TYPED — "In your words" on the dialog that asks
 * for it — and it goes in the file exactly as typed. Its
 * direction is a screen's problem, not a file's — Excel reads a cell's own
 * script — so nothing here marks it, wraps it or trims it beyond what the
 * writer already refuses (src/lib/csv.ts, D96).
 *
 * `channel` and `outcome` are words in the reader's language, from the places
 * the screen takes its own: the kind from `common.<channel>`, the key the
 * report list renders it by (src/components/activities/activity-list.tsx), and
 * the outcome from the admin's own two columns (D171). Neither is spelled out
 * a second time here.
 *
 * The rows carry no figures at all, so nothing is declared numeric. What Kladra
 * RECORDED on those days — the quotations raised, the metres moved — is the
 * lane beside the entries on screen and is not in this file: it is a different
 * list of a different kind of thing, and one file with both in it would be a
 * sheet whose rows mean two things (SPEC §3 P13, D167).
 *
 * It is the reports SCREEN, exported. The same narrowing (`narrowReports`), fed
 * from the address with the screen's own parsers, so a rep's file is his own
 * reports, a manager's is everyone's, a company, a kind or an outcome chip
 * narrows the file exactly as it narrows the list, and the window is the one the
 * screen is standing on — the month behind a person, the day or the week behind
 * the team. Uncapped, where the list stops at eighty (D80): a screen is read
 * from the top and a file is added up.
 *
 * No `import "server-only"`, for the reason in src/lib/live.ts.
 */
import { desc, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  activities,
  companies,
  CHANNELS,
  outcomes,
  projects,
  users,
  type Channel,
} from "@/db/schema";
import { listNonWorkingDays } from "@/lib/calendar";
import {
  addDays,
  firstOfMonth,
  lastOfMonth,
  todayRiyadh,
  type Day,
} from "@/lib/dates";
import { asSearch, exportDay, type ExportRead } from "@/lib/export/kit";
import { seesAllRoles } from "@/lib/floor";
import { personName } from "@/lib/people";
import { parseReportQuery, periodFor, weekOf } from "@/lib/report-view";
import { narrowReports, type ReportFilter } from "@/lib/reports";
import { chosen, rememberedChoices } from "@/lib/screen-choice";
import { isWorkingDay, stepWorkingDay } from "@/lib/workdays";

export const reportsSheet: ExportRead = async ({ user, locale, params }) => {
  const ar = locale.startsWith("ar");
  const today = todayRiyadh();
  // The screen's own parser, handed the screen's own list of kinds, so a
  // garbled `?kind=` narrows nothing here exactly as it narrows nothing there.
  const query = parseReportQuery(asSearch(params), today, CHANNELS);
  const filter: ReportFilter = {
    companyId: query.company,
    kind: query.kind as Channel | null,
    outcomeId: query.outcome,
  };

  // Two screens behind one address (S8). A rep, marketing and the coordinator
  // read their own and nothing else; the manager and the admin read everyone
  // until they press a person, and then they read that person's own screen.
  const manager = seesAllRoles(user.role);
  const personId = manager ? query.person : user.id;

  let from: Day;
  let to: Day;
  if (personId) {
    // One person: the day pressed, or the month the calendar is showing — and
    // the current month stops at today, because nothing has been written past it.
    const month = query.day ? firstOfMonth(query.day) : (query.month ?? firstOfMonth(today));
    const monthEnd = lastOfMonth(month);
    from = query.day ?? month;
    to = query.day ?? (monthEnd < today ? monthEnd : today);
  } else {
    // The team. The period is read the way the page reads it — the address
    // first, the person's remembered choice behind it (D164) — because here
    // that choice decides the WINDOW and not merely the shape of it: a manager
    // looking at a week whose address says nothing would otherwise be handed a
    // file of one day. (The quotations and dispatches files read only the
    // address for their remembered view, where it costs a chip and not a week.)
    const period = periodFor(
      query.period,
      chosen(await rememberedChoices(user.id), "view", "reports"),
    );
    // The day read: the one asked for, or today when today is a working day and
    // otherwise the last one there was — a file asked for on a Saturday is
    // Thursday's, never an empty weekend (rules/data.md: a window in calendar
    // days is wrong in a Fri–Sat week, so the same function is asked).
    const around = await listNonWorkingDays(addDays(query.day ?? today, -28), today);
    const latest = isWorkingDay(today, around) ? today : stepWorkingDay(today, -1, around);
    const day: Day = query.day ?? latest;
    if (period === "week") {
      const week = weekOf(day);
      from = week[0];
      to = week[6];
    } else {
      from = day;
      to = day;
    }
  }

  const [t, rows] = await Promise.all([
    getTranslations({ locale }),
    db
      .select({
        // `happened_on` is already a Riyadh day — the day the person says it
        // happened — so it is written out, never lifted through a zone again.
        day: sql<Day>`to_char(${activities.happenedOn}, 'YYYY-MM-DD')`,
        person: personName(locale),
        company: companies.name,
        project: sql<string>`coalesce(${projects.name}, '')`,
        channel: activities.channel,
        outcome: ar ? outcomes.nameAr : outcomes.nameEn,
        written: activities.text,
      })
      .from(activities)
      .innerJoin(users, eq(users.id, activities.userId))
      .innerJoin(companies, eq(companies.id, activities.companyId))
      .innerJoin(outcomes, eq(outcomes.id, activities.outcomeId))
      .leftJoin(projects, eq(projects.id, activities.projectId))
      .where(narrowReports(user, { personId, from, to, filter }))
      // The order the screen reads them in: newest day first, and inside a day
      // the order they were written (src/lib/activities.ts).
      .orderBy(desc(activities.happenedOn), desc(activities.createdAt)),
  ]);

  return {
    columns: ["day", "person", "company", "project", "channel", "outcome", "written"],
    rows: rows.map((row) => ({
      ...row,
      day: exportDay(row.day, locale),
      // The kind in the word the entry wears on screen, from the same key.
      channel: t(`common.${row.channel}`),
    })),
  };
};
